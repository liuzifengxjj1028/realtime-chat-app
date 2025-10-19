#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
简单的竞态条件测试 - 快速验证修复
"""

import sys

def test_list_iteration_fix():
    """测试修复：使用list()创建字典快照"""
    print('=' * 60)
    print('测试: 字典迭代修复验证')
    print('=' * 60)

    # 模拟原始的有问题的代码
    print('\n❌ 修复前的代码（有bug）:')
    print('   for player, data in battle_3d_players.items():')
    print('       await websocket.send(...)')
    print('   ')
    print('   问题: 如果在await期间字典被修改，会抛出RuntimeError')

    # 修复后的代码
    print('\n✅ 修复后的代码（已修复）:')
    print('   for player, data in list(battle_3d_players.items()):')
    print('       await websocket.send(...)')
    print('   ')
    print('   解决方案: list()创建字典快照，即使原字典被修改也不会出错')

    # 验证语法
    test_code = """
# 模拟修复后的代码
battle_3d_players = {'player1': {'ws': None}, 'player2': {'ws': None}}

# 这是修复后的安全遍历方式
for player_name, player_data in list(battle_3d_players.items()):
    # 即使在这里修改字典也不会出错
    if player_name == 'player1':
        battle_3d_players['player3'] = {'ws': None}
    print(f'  遍历: {player_name}')

print(f'  最终字典包含: {list(battle_3d_players.keys())}')
"""

    print('\n🧪 运行修复后的代码:')
    try:
        exec(test_code)
        print('\n✅ 代码执行成功，没有RuntimeError!')
    except RuntimeError as e:
        print(f'\n❌ 仍然有RuntimeError: {e}')
        return False

    return True


def check_server_file():
    """检查服务器代码是否已修复"""
    print('\n' + '=' * 60)
    print('检查: server.py 中的修复')
    print('=' * 60)

    try:
        with open('/Users/budlaw/realtime-chat-app/server.py', 'r') as f:
            content = f.read()

        # 统计修复的位置
        fixed_count = content.count('for player_name, player_data in list(battle_3d_players.items()):')
        fixed_count += content.count('for player, data in list(battle_3d_players.items()):')
        fixed_count += content.count('for battle_user, battle_data in list(battle_3d_players.items()):')

        print(f'\n找到 {fixed_count} 处使用 list() 的安全遍历')

        # 检查是否还有未修复的
        unsafe_patterns = [
            'for player_name, player_data in battle_3d_players.items():',
            'for player, data in battle_3d_players.items():',
        ]

        lines_with_await = []
        for i, line in enumerate(content.split('\n'), 1):
            for pattern in unsafe_patterns:
                if pattern in line:
                    # 检查接下来的几行是否有await
                    context_start = max(0, i - 1)
                    context_end = min(len(content.split('\n')), i + 10)
                    context = '\n'.join(content.split('\n')[context_start:context_end])

                    if 'await' in context and 'list(' not in line:
                        lines_with_await.append((i, line.strip()))

        if lines_with_await:
            print(f'\n⚠️  发现 {len(lines_with_await)} 处可能未修复的遍历:')
            for line_num, line in lines_with_await[:5]:
                print(f'   行{line_num}: {line[:60]}...')
        else:
            print('\n✅ 没有发现未修复的不安全遍历')

        print(f'\n总结:')
        print(f'  - 已修复位置: {fixed_count}')
        print(f'  - 可能未修复: {len(lines_with_await)}')

        return len(lines_with_await) == 0

    except Exception as e:
        print(f'\n❌ 检查文件时出错: {e}')
        return False


def main():
    """主测试函数"""
    print('\n' + '🧪' * 30)
    print('3D战斗竞态条件修复验证')
    print('🧪' * 30)

    results = []

    # 测试1: 修复原理验证
    results.append(('修复原理验证', test_list_iteration_fix()))

    # 测试2: 检查代码
    results.append(('代码检查', check_server_file()))

    # 总结
    print('\n' + '=' * 60)
    print('测试结果总结')
    print('=' * 60)

    all_passed = all(result for _, result in results)

    for test_name, passed in results:
        status = '✅ 通过' if passed else '❌ 失败'
        print(f'{status} - {test_name}')

    print('\n' + '=' * 60)

    if all_passed:
        print('🎉 所有检查通过! 竞态条件已成功修复')
        print('\n修复内容:')
        print('  1. 使用 list() 创建字典快照')
        print('  2. 所有包含 await 的遍历都已修复')
        print('  3. 即使在遍历中字典被修改也不会崩溃')
        return 0
    else:
        print('⚠️  部分检查未通过，请查看上面的详细信息')
        return 1


if __name__ == '__main__':
    sys.exit(main())
