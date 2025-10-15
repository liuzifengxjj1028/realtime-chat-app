#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
实时聊天应用 - WebSocket 服务器
"""

import asyncio
import json
import os
from datetime import datetime
from aiohttp import web
import aiohttp_cors
import aiohttp

# 存储连接的用户
connected_users = {}  # {username: websocket}
user_ids = {}  # {username: userId} - 跟踪用户ID
# 存储消息（简单的内存存储）
messages_store = {}  # {chat_key: [messages]}
# 存储群组
groups_store = {}  # {group_id: {name, members, creator}}
group_counter = 0  # 群组ID计数器
# 存储离线消息
offline_messages = {}  # {username: [messages]}
# 机器人用户
BOT_USERNAME = '怡总'  # 聊天记录总结机器人
# 存储用户的机器人配置
bot_configs = {}  # {username: {prompt: str}}


def get_chat_key(user1, user2):
    """生成聊天记录的唯一key"""
    return '_'.join(sorted([user1, user2]))


async def websocket_handler(request):
    """WebSocket 连接处理"""
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    username = None

    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    await handle_message(ws, data, username)

                    # 更新 username（注册后）
                    if data.get('type') == 'register' and username is None:
                        username = data.get('username')

                except json.JSONDecodeError:
                    await ws.send_json({
                        'type': 'error',
                        'message': '无效的消息格式'
                    })

            elif msg.type == web.WSMsgType.ERROR:
                print(f'WebSocket 错误: {ws.exception()}')

    finally:
        # 用户断开连接
        if username and username in connected_users:
            del connected_users[username]
            # 通知其他用户
            await broadcast({
                'type': 'user_offline',
                'username': username
            }, exclude=username)
            print(f'用户离线: {username}')

    return ws


async def handle_message(ws, data, current_username):
    """处理接收到的消息"""
    msg_type = data.get('type')

    if msg_type == 'register':
        await handle_register(ws, data)

    elif msg_type == 'send_message':
        await handle_send_message(data, current_username)

    elif msg_type == 'mark_as_read':
        await handle_mark_as_read(data, current_username)

    elif msg_type == 'recall_message':
        await handle_recall_message(data, current_username)

    elif msg_type == 'create_group':
        await handle_create_group(ws, data, current_username)

    elif msg_type == 'send_group_message':
        await handle_send_group_message(data, current_username)

    elif msg_type == 'mark_group_message_read':
        await handle_mark_group_message_read(data, current_username)


async def handle_register(ws, data):
    """处理用户注册"""
    username = data.get('username', '').strip()
    user_id = data.get('userId', '')

    if not username:
        await ws.send_json({
            'type': 'register_error',
            'message': '昵称不能为空'
        })
        return

    if len(username) > 20:
        await ws.send_json({
            'type': 'register_error',
            'message': '昵称不能超过20个字符'
        })
        return

    # 检查是否是同一用户重新登录（通过userId识别）
    is_returning_user = user_id and username in user_ids and user_ids[username] == user_id

    if username in connected_users and not is_returning_user:
        await ws.send_json({
            'type': 'register_error',
            'message': '昵称已被使用，请换一个'
        })
        return

    # 注册成功
    connected_users[username] = ws
    if user_id:
        user_ids[username] = user_id

    # 发送注册成功消息（包含机器人用户）
    all_users = list(connected_users.keys())
    if BOT_USERNAME not in all_users:
        all_users.append(BOT_USERNAME)

    await ws.send_json({
        'type': 'register_success',
        'username': username,
        'users': all_users,
        'bots': [BOT_USERNAME]  # 标记哪些是机器人
    })

    # 推送离线消息（如果有）
    if username in offline_messages and offline_messages[username]:
        print(f'推送 {len(offline_messages[username])} 条离线消息给 {username}')
        for msg in offline_messages[username]:
            await ws.send_json({
                'type': 'new_message',
                **msg
            })
        # 清空已推送的离线消息
        offline_messages[username] = []

    # 通知其他用户有新用户上线
    await broadcast({
        'type': 'user_online',
        'username': username
    }, exclude=username)

    print(f'用户注册: {username}')
    print(f'当前在线用户: {list(connected_users.keys())}')


async def call_llm_api(prompt, user_content):
    """调用LLM API进行总结 - 支持Claude API"""
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')

    print(f'[DEBUG] API密钥状态: {"已配置" if api_key else "未配置"} (长度: {len(api_key) if api_key else 0})')

    if not api_key:
        return "错误：未配置API密钥。请设置ANTHROPIC_API_KEY环境变量。"

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                'https://api.anthropic.com/v1/messages',
                headers={
                    'x-api-key': api_key,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': os.environ.get('ANTHROPIC_MODEL', 'claude-3-5-sonnet-20241022'),
                    'max_tokens': 4096,
                    'system': prompt,
                    'messages': [
                        {'role': 'user', 'content': user_content}
                    ],
                    'temperature': 0.7
                },
                timeout=aiohttp.ClientTimeout(total=60)
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    return result['content'][0]['text']
                else:
                    error_text = await response.text()
                    return f"API调用失败 ({response.status}): {error_text}"
    except asyncio.TimeoutError:
        return "错误：API调用超时"
    except Exception as e:
        return f"错误：{str(e)}"


async def handle_bot_message(from_user, content, content_type):
    """处理发送给机器人的消息"""
    # 获取用户的机器人配置
    user_config = bot_configs.get(from_user, {})
    user_prompt = user_config.get('prompt', '请总结以下聊天记录的主要内容和关键信息。')

    # 检查是否是配置命令
    if content.startswith('/setprompt '):
        new_prompt = content[11:].strip()
        if new_prompt:
            bot_configs[from_user] = {'prompt': new_prompt}
            return f"✅ Prompt已更新为：\n\n{new_prompt}\n\n现在发送聊天记录或PDF给我，我会使用这个prompt进行总结。"
        else:
            return "❌ Prompt不能为空"

    # 检查是否是查看配置命令
    if content == '/getprompt':
        return f"当前Prompt：\n\n{user_prompt}\n\n使用 /setprompt <新prompt> 来修改"

    # 检查是否是帮助命令
    if content == '/help' or content == '帮助':
        return """📖 怡总使用说明：

1. **设置总结Prompt**：
   点击右上角"⚙️ 设置Prompt"按钮，或发送命令：
   /setprompt <你的prompt>

2. **查看当前Prompt**：
   /getprompt

3. **总结聊天记录**：
   直接粘贴聊天记录文本发送给我

💡 **提示**：使用UI界面设置Prompt更方便！

🤖 **技术信息**：
- API: Anthropic Claude 3.5 Sonnet
- 环境变量: ANTHROPIC_API_KEY

示例聊天记录：
张三: 我们需要在下周五前完成项目
李四: 好的，我负责前端部分
"""

    # 处理文本内容（聊天记录）
    if content_type == 'text':
        # 调用LLM API进行总结
        summary = await call_llm_api(user_prompt, content)
        return f"📊 总结结果：\n\n{summary}"

    # 处理PDF文件
    elif content_type == 'pdf':
        # TODO: 实现PDF文件解析
        return "PDF文件处理功能开发中..."

    return "❌ 不支持的消息类型"


async def handle_send_message(data, from_user):
    """处理发送消息"""
    to_user = data.get('to')
    content = data.get('content')
    content_type = data.get('content_type', 'text')
    timestamp = data.get('timestamp', int(datetime.now().timestamp() * 1000))
    quoted_message = data.get('quoted_message')

    if not to_user or not content or not from_user:
        return

    # 保存消息
    chat_key = get_chat_key(from_user, to_user)
    if chat_key not in messages_store:
        messages_store[chat_key] = []

    message = {
        'from': from_user,
        'to': to_user,
        'content': content,
        'content_type': content_type,
        'timestamp': timestamp,
        'read': False
    }

    # 如果有引用消息，添加到消息中
    if quoted_message:
        message['quoted_message'] = quoted_message

    messages_store[chat_key].append(message)

    # 如果是发送给机器人的消息，处理并回复
    if to_user == BOT_USERNAME:
        print(f'机器人消息: {from_user} -> {BOT_USERNAME} ({content_type})')

        # 处理机器人消息
        bot_response = await handle_bot_message(from_user, content, content_type)

        # 发送机器人回复
        bot_message = {
            'from': BOT_USERNAME,
            'to': from_user,
            'content': bot_response,
            'content_type': 'text',
            'timestamp': int(datetime.now().timestamp() * 1000),
            'read': False
        }

        messages_store[chat_key].append(bot_message)

        if from_user in connected_users:
            await connected_users[from_user].send_json({
                'type': 'new_message',
                **bot_message
            })
        else:
            if from_user not in offline_messages:
                offline_messages[from_user] = []
            offline_messages[from_user].append(bot_message)

    # 转发消息给接收者（如果在线）或存储为离线消息
    elif to_user in connected_users:
        await connected_users[to_user].send_json({
            'type': 'new_message',
            **message
        })
        print(f'消息: {from_user} -> {to_user} ({content_type}) [已送达]')
    else:
        # 接收者离线，存储为离线消息
        if to_user not in offline_messages:
            offline_messages[to_user] = []
        offline_messages[to_user].append(message)
        print(f'消息: {from_user} -> {to_user} ({content_type}) [离线存储]')


async def handle_mark_as_read(data, current_user):
    """处理标记消息为已读"""
    from_user = data.get('from')

    if not from_user:
        return

    # 更新消息状态
    chat_key = get_chat_key(current_user, from_user)
    if chat_key in messages_store:
        for msg in messages_store[chat_key]:
            if msg['to'] == current_user and msg['from'] == from_user:
                msg['read'] = True

    # 通知发送者消息已读
    if from_user in connected_users:
        await connected_users[from_user].send_json({
            'type': 'message_read',
            'user': current_user
        })

    print(f'消息已读: {from_user} -> {current_user}')


async def handle_recall_message(data, current_user):
    """处理撤回消息"""
    timestamp = data.get('timestamp')
    group_id = data.get('group_id')
    to_user = data.get('to')

    if not timestamp:
        return

    if group_id:
        # 群聊消息撤回
        if group_id not in groups_store:
            return

        group = groups_store[group_id]

        # 检查是否是群成员
        if current_user not in group['members']:
            return

        # 从消息存储中删除
        if group_id in messages_store:
            messages_store[group_id] = [
                msg for msg in messages_store[group_id]
                if not (msg.get('timestamp') == timestamp and msg.get('from') == current_user)
            ]

        # 通知所有群成员（除了自己）
        for member in group['members']:
            if member != current_user and member in connected_users:
                await connected_users[member].send_json({
                    'type': 'message_recalled',
                    'timestamp': timestamp,
                    'group_id': group_id,
                    'from': current_user
                })

        print(f'群聊消息撤回: {current_user} 在群 {group_id} 中撤回消息 {timestamp}')

    else:
        # 私聊消息撤回
        if not to_user:
            return

        chat_key = get_chat_key(current_user, to_user)

        # 从消息存储中删除
        if chat_key in messages_store:
            messages_store[chat_key] = [
                msg for msg in messages_store[chat_key]
                if not (msg.get('timestamp') == timestamp and msg.get('from') == current_user)
            ]

        # 通知对方
        if to_user in connected_users:
            await connected_users[to_user].send_json({
                'type': 'message_recalled',
                'timestamp': timestamp,
                'from': current_user
            })

        print(f'私聊消息撤回: {current_user} 撤回发给 {to_user} 的消息 {timestamp}')


async def broadcast(message, exclude=None):
    """广播消息给所有用户（除了排除的用户）"""
    for username, ws in connected_users.items():
        if username != exclude:
            try:
                await ws.send_json(message)
            except Exception as e:
                print(f'发送消息给 {username} 失败: {e}')


async def handle_create_group(ws, data, creator):
    """处理创建群组"""
    global group_counter

    group_name = data.get('name', '').strip()
    members = data.get('members', [])

    if not group_name:
        await ws.send_json({
            'type': 'error',
            'message': '群名称不能为空'
        })
        return

    if len(members) < 2:
        await ws.send_json({
            'type': 'error',
            'message': '至少需要2个成员'
        })
        return

    # 生成群组ID
    group_counter += 1
    group_id = f'group_{group_counter}'

    # 添加创建者到成员列表
    all_members = list(set(members + [creator]))

    # 存储群组信息
    groups_store[group_id] = {
        'id': group_id,
        'name': group_name,
        'members': all_members,
        'creator': creator
    }

    # 通知所有成员（包括创建者）
    for member in all_members:
        if member in connected_users:
            await connected_users[member].send_json({
                'type': 'group_created',
                'group_id': group_id,
                'name': group_name,
                'members': all_members,
                'creator': creator
            })

    print(f'群组创建: {group_name} (ID: {group_id}), 成员: {all_members}')


async def handle_send_group_message(data, from_user):
    """处理发送群组消息"""
    group_id = data.get('group_id')
    content = data.get('content')
    content_type = data.get('content_type', 'text')
    timestamp = data.get('timestamp', int(datetime.now().timestamp() * 1000))
    quoted_message = data.get('quoted_message')

    if not group_id or not content:
        return

    # 检查群组是否存在
    if group_id not in groups_store:
        return

    group = groups_store[group_id]

    # 检查发送者是否是群成员
    if from_user not in group['members']:
        return

    # 保存消息
    if group_id not in messages_store:
        messages_store[group_id] = []

    # 初始化已读列表：发送者自动标记为已读
    read_by = [from_user]
    unread_members = [m for m in group['members'] if m != from_user]

    message = {
        'from': from_user,
        'group_id': group_id,
        'content': content,
        'content_type': content_type,
        'timestamp': timestamp,
        'read': False,
        'read_by': read_by,  # 已读成员列表
        'unread_members': unread_members  # 未读成员列表
    }

    # 如果有引用消息，添加到消息中
    if quoted_message:
        message['quoted_message'] = quoted_message

    messages_store[group_id].append(message)

    # 广播消息给所有群成员（除了发送者）
    for member in group['members']:
        if member != from_user and member in connected_users:
            await connected_users[member].send_json({
                'type': 'new_group_message',
                **message
            })

    print(f'群组消息: {from_user} -> {group["name"]} ({content_type})')


async def handle_mark_group_message_read(data, current_user):
    """处理群消息已读标记"""
    group_id = data.get('group_id')
    timestamp = data.get('timestamp')

    if not group_id or not timestamp or not current_user:
        return

    # 检查群组是否存在
    if group_id not in groups_store or group_id not in messages_store:
        return

    # 查找消息并更新已读状态
    for msg in messages_store[group_id]:
        if msg.get('timestamp') == timestamp:
            # 如果是历史消息，初始化阅读状态字段
            if 'read_by' not in msg or 'unread_members' not in msg:
                group = groups_store[group_id]
                msg_sender = msg.get('from')
                # 初始化已读列表（发送者已读）
                msg['read_by'] = [msg_sender] if msg_sender else []
                # 初始化未读列表（其他所有成员）
                msg['unread_members'] = [m for m in group['members'] if m != msg_sender]

            # 将当前用户从未读列表移除，添加到已读列表
            if current_user in msg.get('unread_members', []):
                msg['unread_members'].remove(current_user)
            if current_user not in msg.get('read_by', []):
                msg['read_by'].append(current_user)

            # 广播更新后的阅读状态给群内所有在线成员
            group = groups_store[group_id]
            for member in group['members']:
                if member in connected_users:
                    await connected_users[member].send_json({
                        'type': 'group_message_read_update',
                        'group_id': group_id,
                        'timestamp': timestamp,
                        'read_by': msg['read_by'],
                        'unread_members': msg['unread_members'],
                        'reader': current_user
                    })

            print(f'群消息已读: {current_user} 已读群 {group_id} 的消息 {timestamp}')
            break


async def index_handler(request):
    """主页处理"""
    return web.FileResponse('./index.html')


async def static_handler(request):
    """静态文件处理"""
    filename = request.match_info['filename']
    return web.FileResponse(f'./{filename}')


def create_app():
    """创建应用"""
    app = web.Application()

    # 配置 CORS
    cors = aiohttp_cors.setup(app, defaults={
        "*": aiohttp_cors.ResourceOptions(
            allow_credentials=True,
            expose_headers="*",
            allow_headers="*",
        )
    })

    # 添加路由
    app.router.add_get('/', index_handler)
    app.router.add_get('/ws', websocket_handler)
    app.router.add_get('/{filename}', static_handler)

    # 配置 CORS
    for route in list(app.router.routes()):
        if not isinstance(route.resource, web.StaticResource):
            cors.add(route)

    return app


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    print('=' * 60)
    print(f'🚀 实时聊天应用启动')
    print(f'📍 访问地址: http://localhost:{port}')
    print('=' * 60)

    app = create_app()
    web.run_app(app, host='0.0.0.0', port=port)
