#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试PDF API功能
"""

import asyncio
import aiohttp
import io

def create_test_pdf():
    """创建一个测试PDF文件"""
    pdf_content = """%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj
4 0 obj
<<
/Length 250
>>
stream
BT
/F1 12 Tf
50 750 Td
(Chat Record Summary Test) Tj
0 -30 Td
(Zhang San 10:30: Good morning everyone) Tj
0 -20 Td
(Li Si 10:32: Let us discuss the project) Tj
0 -20 Td
(Wang Wu 10:35: The frontend needs acceleration) Tj
0 -30 Td
(Summary: Team discussed project progress) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000317 00000 n
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
615
%%EOF"""
    return pdf_content.encode('latin-1')

async def test_summarize_api():
    """测试PDF总结API"""
    print("=" * 70)
    print("开始测试PDF总结API")
    print("=" * 70)

    # 测试1: 使用context_text和content_text（文本模式）
    print("\n📝 测试1: 文本模式 - 上下文 + 内容（不使用PDF）")
    async with aiohttp.ClientSession() as session:
        form = aiohttp.FormData()
        form.add_field('context_text', '这是历史对话背景信息')
        form.add_field('content_text', '张三: 项目进度如何\n李四: 进展顺利')
        form.add_field('custom_prompt', '请简要总结')

        try:
            async with session.post('http://localhost:8080/api/summarize_chat', data=form) as response:
                result = await response.json()
                if response.status == 200:
                    print(f"✅ 测试通过 (状态码: {response.status})")
                    if 'summary' in result:
                        print(f"   总结内容长度: {len(result['summary'])} 字符")
                        print(f"   总结预览: {result['summary'][:100]}...")
                    else:
                        print(f"   响应: {result}")
                else:
                    print(f"❌ 测试失败 (状态码: {response.status})")
                    print(f"   错误: {result.get('error', '未知错误')}")
        except Exception as e:
            print(f"❌ 请求失败: {str(e)}")

    # 测试2: 使用PDF文件（正常大小）
    print("\n📄 测试2: PDF模式 - 上传正常大小的PDF文件")
    pdf_data = create_test_pdf()
    print(f"   PDF大小: {len(pdf_data)} 字节 ({len(pdf_data)/1024:.2f} KB)")

    async with aiohttp.ClientSession() as session:
        form = aiohttp.FormData()
        form.add_field('context_text', 'Meeting discussion context')
        form.add_field('content_pdf', pdf_data, filename='test.pdf', content_type='application/pdf')
        form.add_field('custom_prompt', 'Please summarize this chat record')

        try:
            async with session.post('http://localhost:8080/api/summarize_chat', data=form) as response:
                result = await response.json()
                if response.status == 200:
                    print(f"✅ 测试通过 (状态码: {response.status})")
                    if 'summary' in result:
                        print(f"   总结内容长度: {len(result['summary'])} 字符")
                        print(f"   总结预览: {result['summary'][:150]}...")
                    else:
                        print(f"   响应: {result}")
                else:
                    print(f"❌ 测试失败 (状态码: {response.status})")
                    print(f"   错误: {result.get('error', '未知错误')}")
        except Exception as e:
            print(f"❌ 请求失败: {str(e)}")

    # 测试3: 上传超大PDF（测试大小限制）
    print("\n📏 测试3: 测试PDF大小限制 (上传 >10MB)")
    large_pdf = b"fake_large_pdf_data" * (11 * 1024 * 1024 // 20 + 1)
    print(f"   创建大文件: {len(large_pdf)} 字节 ({len(large_pdf)/1024/1024:.2f} MB)")

    async with aiohttp.ClientSession() as session:
        form = aiohttp.FormData()
        form.add_field('context_text', 'Test context')
        form.add_field('content_pdf', large_pdf, filename='large.pdf', content_type='application/pdf')

        try:
            async with session.post('http://localhost:8080/api/summarize_chat', data=form) as response:
                result = await response.json()
                if response.status == 400 and 'error' in result:
                    print(f"✅ 大小限制生效 (状态码: {response.status})")
                    print(f"   错误消息: {result['error']}")
                elif response.status == 200:
                    print(f"⚠️  警告: 大文件未被拒绝 (状态码: {response.status})")
                else:
                    print(f"❓ 意外响应 (状态码: {response.status})")
                    print(f"   响应: {result}")
        except Exception as e:
            print(f"❌ 请求失败: {str(e)}")

    # 测试4: 同时使用context_pdf和content_pdf
    print("\n📎 测试4: 同时上传两个PDF（上下文PDF + 内容PDF）")
    pdf1 = create_test_pdf()
    pdf2 = create_test_pdf()

    async with aiohttp.ClientSession() as session:
        form = aiohttp.FormData()
        form.add_field('context_pdf', pdf1, filename='context.pdf', content_type='application/pdf')
        form.add_field('content_pdf', pdf2, filename='content.pdf', content_type='application/pdf')
        form.add_field('custom_prompt', 'Summarize based on context')

        try:
            async with session.post('http://localhost:8080/api/summarize_chat', data=form) as response:
                result = await response.json()
                if response.status == 200:
                    print(f"✅ 测试通过 (状态码: {response.status})")
                    if 'summary' in result:
                        print(f"   总结内容长度: {len(result['summary'])} 字符")
                        print(f"   总结预览: {result['summary'][:150]}...")
                    else:
                        print(f"   响应: {result}")
                else:
                    print(f"❌ 测试失败 (状态码: {response.status})")
                    print(f"   错误: {result.get('error', '未知错误')}")
        except Exception as e:
            print(f"❌ 请求失败: {str(e)}")

    print("\n" + "=" * 70)
    print("PDF API测试完成!")
    print("=" * 70)
    print("\n💡 提示:")
    print("   - 如果看到 'ANTHROPIC_API_KEY' 错误，需要设置环境变量")
    print("   - 文本提取成功即表示PDF处理功能正常")
    print("   - 可以通过浏览器访问 http://localhost:8080 进行手动测试")

if __name__ == '__main__':
    asyncio.run(test_summarize_api())
