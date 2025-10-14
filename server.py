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

# 存储连接的用户
connected_users = {}  # {username: websocket}
user_ids = {}  # {username: userId} - 跟踪用户ID
# 存储消息（简单的内存存储）
messages_store = {}  # {chat_key: [messages]}
# 存储群组
groups_store = {}  # {group_id: {name, members, creator}}
group_counter = 0  # 群组ID计数器


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

    elif msg_type == 'create_group':
        await handle_create_group(ws, data, current_username)

    elif msg_type == 'send_group_message':
        await handle_send_group_message(data, current_username)


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

    # 发送注册成功消息
    await ws.send_json({
        'type': 'register_success',
        'username': username,
        'users': list(connected_users.keys())
    })

    # 通知其他用户有新用户上线
    await broadcast({
        'type': 'user_online',
        'username': username
    }, exclude=username)

    print(f'用户注册: {username}')
    print(f'当前在线用户: {list(connected_users.keys())}')


async def handle_send_message(data, from_user):
    """处理发送消息"""
    to_user = data.get('to')
    content = data.get('content')
    content_type = data.get('content_type', 'text')
    timestamp = data.get('timestamp', int(datetime.now().timestamp() * 1000))

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

    messages_store[chat_key].append(message)

    # 转发消息给接收者
    if to_user in connected_users:
        await connected_users[to_user].send_json({
            'type': 'new_message',
            **message
        })

    print(f'消息: {from_user} -> {to_user} ({content_type})')


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

    message = {
        'from': from_user,
        'group_id': group_id,
        'content': content,
        'content_type': content_type,
        'timestamp': timestamp,
        'read': False
    }

    messages_store[group_id].append(message)

    # 广播消息给所有群成员（除了发送者）
    for member in group['members']:
        if member != from_user and member in connected_users:
            await connected_users[member].send_json({
                'type': 'new_group_message',
                **message
            })

    print(f'群组消息: {from_user} -> {group["name"]} ({content_type})')


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
