#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
专门测试PDF文件大小限制
"""

import asyncio
import aiohttp

def create_test_pdf():
    """创建一个小的测试PDF"""
    pdf_content = """%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 50 >>
stream
BT
/F1 12 Tf
50 750 Td
(Test PDF) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000062 00000 n
0000000119 00000 n
0000000210 00000 n
trailer
<< /Size 5 /Root 1 0 R >>
startxref
308
%%EOF"""
    return pdf_content.encode('latin-1')

async def test_size_limits():
    """测试PDF大小限制"""
    print("=" * 70)
    print("测试PDF文件大小限制")
    print("=" * 70)

    # 创建不同大小的PDF
    sizes = [
        (100 * 1024, "100 KB", False),      # 正常
        (1 * 1024 * 1024, "1 MB", False),    # 正常
        (5 * 1024 * 1024, "5 MB", False),    # 正常
        (9 * 1024 * 1024, "9 MB", False),    # 正常（接近限制）
        (11 * 1024 * 1024, "11 MB", True),   # 应该被拒绝
        (20 * 1024 * 1024, "20 MB", True),   # 应该被拒绝
    ]

    for size_bytes, size_label, should_fail in sizes:
        print(f"\n📦 测试 {size_label} PDF文件:")
        print(f"   文件大小: {size_bytes:,} 字节")

        # 创建指定大小的PDF数据（用基础PDF重复填充）
        base_pdf = create_test_pdf()
        if size_bytes <= len(base_pdf):
            pdf_data = base_pdf[:size_bytes]
        else:
            # 扩展PDF到指定大小
            repetitions = size_bytes // len(base_pdf) + 1
            pdf_data = (base_pdf * repetitions)[:size_bytes]

        async with aiohttp.ClientSession() as session:
            form = aiohttp.FormData()
            form.add_field('context_text', 'Test context')
            form.add_field('content_pdf', pdf_data, filename=f'test_{size_label}.pdf', content_type='application/pdf')

            try:
                async with session.post('http://localhost:8080/api/summarize_chat', data=form) as response:
                    status = response.status
                    content_type = response.headers.get('Content-Type', '')

                    # 尝试读取响应
                    if 'application/json' in content_type:
                        result = await response.json()
                        error_msg = result.get('error', '')
                    else:
                        text = await response.text()
                        result = {'text': text[:200]}
                        error_msg = text

                    # 判断测试结果
                    if should_fail:
                        if status == 400 and 'PDF文件大小不能超过10MB' in str(error_msg):
                            print(f"   ✅ 正确拒绝 (状态码: {status})")
                            print(f"   ✅ 错误消息: {error_msg}")
                        elif status == 400:
                            print(f"   ⚠️  被拒绝但原因不同 (状态码: {status})")
                            print(f"      错误: {error_msg}")
                        else:
                            print(f"   ❌ 应该被拒绝但接受了 (状态码: {status})")
                    else:
                        if status == 200:
                            print(f"   ✅ 正确接受 (状态码: {status})")
                        elif status == 400 and 'PDF文件大小' in str(error_msg):
                            print(f"   ❌ 不应该被拒绝 (状态码: {status})")
                            print(f"      错误: {error_msg}")
                        else:
                            print(f"   ⚠️  其他错误 (状态码: {status})")
                            print(f"      错误: {error_msg[:100]}")

            except Exception as e:
                print(f"   ❌ 请求异常: {str(e)}")

    print("\n" + "=" * 70)
    print("大小限制测试完成!")
    print("=" * 70)

if __name__ == '__main__':
    asyncio.run(test_size_limits())
