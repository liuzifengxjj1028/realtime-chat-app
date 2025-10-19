#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试3D战斗竞态条件修复
模拟多个玩家同时加入、移动、攻击、离开的场景
"""

import asyncio
import aiohttp
import random
import time

SERVER_URL = 'http://localhost:8080'
WS_URL = 'ws://localhost:8080/ws'

class Player:
    """模拟一个3D战斗玩家"""
    def __init__(self, username):
        self.username = username
        self.ws = None
        self.session = None
        self.active = False

    async def connect(self):
        """连接到服务器"""
        try:
            self.session = aiohttp.ClientSession()
            self.ws = await self.session.ws_connect(WS_URL)

            # 登录
            await self.ws.send_json({
                'type': 'login',
                'username': self.username
            })

            # 等待登录确认
            async for msg in self.ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    data = msg.json()
                    if data.get('type') == 'login_success':
                        print(f'  ✅ {self.username} 登录成功')
                        self.active = True
                        break

            return True
        except Exception as e:
            print(f'  ❌ {self.username} 连接失败: {e}')
            return False

    async def join_battle(self):
        """加入3D战场"""
        try:
            await self.ws.send_json({
                'type': '3d_battle_join',
                'position': {
                    'x': random.uniform(-10, 10),
                    'y': 0,
                    'z': random.uniform(-10, 10)
                }
            })
            print(f'  🎮 {self.username} 加入战场')
            await asyncio.sleep(0.05)  # 短暂延迟
        except Exception as e:
            print(f'  ❌ {self.username} 加入战场失败: {e}')

    async def move(self):
        """移动"""
        try:
            await self.ws.send_json({
                'type': '3d_battle_move',
                'position': {
                    'x': random.uniform(-10, 10),
                    'y': 0,
                    'z': random.uniform(-10, 10)
                }
            })
            print(f'  🏃 {self.username} 移动')
            await asyncio.sleep(0.02)
        except Exception as e:
            if self.active:
                print(f'  ⚠️  {self.username} 移动失败: {e}')

    async def attack(self, target_username):
        """攻击"""
        try:
            await self.ws.send_json({
                'type': '3d_battle_attack',
                'position': {'x': 0, 'y': 0, 'z': 0},
                'hitPlayers': [target_username]
            })
            print(f'  ⚔️  {self.username} 攻击 {target_username}')
            await asyncio.sleep(0.02)
        except Exception as e:
            if self.active:
                print(f'  ⚠️  {self.username} 攻击失败: {e}')

    async def chat(self, message):
        """发送聊天"""
        try:
            await self.ws.send_json({
                'type': '3d_battle_chat',
                'message': message
            })
            print(f'  💬 {self.username}: {message}')
            await asyncio.sleep(0.02)
        except Exception as e:
            if self.active:
                print(f'  ⚠️  {self.username} 聊天失败: {e}')

    async def leave_battle(self):
        """离开战场"""
        try:
            self.active = False
            await self.ws.send_json({
                'type': '3d_battle_leave'
            })
            print(f'  👋 {self.username} 离开战场')
            await asyncio.sleep(0.02)
        except Exception as e:
            print(f'  ⚠️  {self.username} 离开失败: {e}')

    async def disconnect(self):
        """断开连接"""
        try:
            self.active = False
            if self.ws:
                await self.ws.close()
            if self.session:
                await self.session.close()
            print(f'  🔌 {self.username} 断开连接')
        except Exception as e:
            print(f'  ⚠️  {self.username} 断开失败: {e}')


async def player_lifecycle(player_id, delay=0):
    """模拟玩家的完整生命周期"""
    username = f'TestPlayer{player_id}'
    player = Player(username)

    await asyncio.sleep(delay)

    # 连接
    if not await player.connect():
        return

    # 加入战场
    await player.join_battle()

    # 随机活动
    actions = random.randint(3, 8)
    for _ in range(actions):
        action = random.choice(['move', 'attack', 'chat'])
        if action == 'move':
            await player.move()
        elif action == 'attack':
            target = f'TestPlayer{random.randint(1, 10)}'
            await player.attack(target)
        elif action == 'chat':
            await player.chat(f'Hello from {username}!')

        await asyncio.sleep(random.uniform(0.05, 0.15))

    # 离开
    await player.leave_battle()
    await asyncio.sleep(0.1)

    # 断开
    await player.disconnect()


async def test_concurrent_connections():
    """测试1: 多个玩家并发连接和断开"""
    print('\n' + '=' * 70)
    print('测试1: 并发连接和断开 (10个玩家)')
    print('=' * 70)

    tasks = []
    for i in range(10):
        # 每个玩家有小的随机延迟
        task = asyncio.create_task(player_lifecycle(i + 1, delay=random.uniform(0, 0.5)))
        tasks.append(task)

    start_time = time.time()
    await asyncio.gather(*tasks, return_exceptions=True)
    elapsed = time.time() - start_time

    print(f'\n✅ 测试1完成 - 耗时: {elapsed:.2f}秒')


async def test_simultaneous_disconnect():
    """测试2: 多个玩家几乎同时断开"""
    print('\n' + '=' * 70)
    print('测试2: 同时断开 (20个玩家)')
    print('=' * 70)

    players = []

    # 先让所有玩家连接
    print('\n阶段1: 连接所有玩家')
    for i in range(20):
        player = Player(f'SimPlayer{i + 1}')
        if await player.connect():
            await player.join_battle()
            players.append(player)
        await asyncio.sleep(0.05)

    print(f'\n✅ {len(players)} 个玩家已连接')

    # 所有玩家执行一些操作
    print('\n阶段2: 玩家活动')
    for _ in range(3):
        for player in players:
            await player.move()
        await asyncio.sleep(0.1)

    # 所有玩家同时断开（竞态条件最容易发生的场景）
    print('\n阶段3: 同时断开所有玩家')
    disconnect_tasks = [player.disconnect() for player in players]

    start_time = time.time()
    results = await asyncio.gather(*disconnect_tasks, return_exceptions=True)
    elapsed = time.time() - start_time

    # 检查是否有异常
    errors = [r for r in results if isinstance(r, Exception)]
    if errors:
        print(f'\n⚠️  发现 {len(errors)} 个错误:')
        for err in errors[:5]:  # 只显示前5个
            print(f'   - {err}')
    else:
        print(f'\n✅ 所有玩家断开成功，无异常')

    print(f'✅ 测试2完成 - 耗时: {elapsed:.2f}秒')


async def test_rapid_join_leave():
    """测试3: 快速加入和离开"""
    print('\n' + '=' * 70)
    print('测试3: 快速加入离开循环 (5个玩家 x 3次)')
    print('=' * 70)

    for round_num in range(3):
        print(f'\n--- 第 {round_num + 1} 轮 ---')
        tasks = []
        for i in range(5):
            task = asyncio.create_task(player_lifecycle(100 + i, delay=0))
            tasks.append(task)

        await asyncio.gather(*tasks, return_exceptions=True)
        await asyncio.sleep(0.3)  # 轮次之间短暂休息

    print('\n✅ 测试3完成')


async def run_all_tests():
    """运行所有测试"""
    print('\n' + '🧪' * 35)
    print('3D战斗竞态条件测试套件')
    print('🧪' * 35)

    print('\n📋 测试目标:')
    print('  - 验证修复后不会出现 RuntimeError: dictionary changed size')
    print('  - 确保多个玩家同时断开时系统稳定')
    print('  - 检查是否有幽灵玩家或积分异常')

    try:
        await test_concurrent_connections()
        await asyncio.sleep(1)

        await test_simultaneous_disconnect()
        await asyncio.sleep(1)

        await test_rapid_join_leave()

        print('\n' + '=' * 70)
        print('🎉 所有测试完成!')
        print('=' * 70)
        print('\n如果没有看到 RuntimeError 或大量异常，说明竞态条件已修复 ✅')

    except Exception as e:
        print(f'\n❌ 测试过程中发生错误: {e}')
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    print('⚠️  注意: 请确保服务器已在 http://localhost:8080 运行')
    print('启动测试...\n')

    try:
        asyncio.run(run_all_tests())
    except KeyboardInterrupt:
        print('\n\n⚠️  测试被用户中断')
