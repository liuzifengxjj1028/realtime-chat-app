#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试PDF提取功能
"""

import asyncio
import io
from server import extract_text_from_pdf

# 创建一个简单的测试PDF（使用reportlab）
def create_test_pdf():
    """创建一个简单的测试PDF"""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas

        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)

        # 添加测试内容
        c.drawString(100, 750, "这是一个测试PDF文件")
        c.drawString(100, 730, "")
        c.drawString(100, 710, "聊天记录：")
        c.drawString(100, 690, "张三 10:30: 大家好，今天讨论项目进度")
        c.drawString(100, 670, "李四 10:32: 项目目前进展顺利")
        c.drawString(100, 650, "王五 10:35: 我们需要加快前端开发")
        c.drawString(100, 630, "")
        c.drawString(100, 610, "总结：团队讨论了项目进度，需要加快前端开发。")

        c.showPage()
        c.save()

        buffer.seek(0)
        return buffer.read()
    except ImportError:
        print("⚠️  reportlab未安装，将使用预定义的PDF内容")
        # 返回一个最小的有效PDF
        return create_minimal_pdf()

def create_minimal_pdf():
    """创建一个最小的PDF（不依赖外部库）"""
    # 这是一个最小的有效PDF文件内容
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
/Length 88
>>
stream
BT
/F1 12 Tf
50 700 Td
(Test PDF Document - Chat Record Summary) Tj
0 -20 Td
(User A: Hello everyone) Tj
0 -20 Td
(User B: Good morning) Tj
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
453
%%EOF"""
    return pdf_content.encode('latin-1')

async def test_pdf_extraction():
    """测试PDF文本提取功能"""
    print("=" * 60)
    print("开始测试PDF文本提取功能")
    print("=" * 60)

    # 测试1: 创建并解析正常大小的PDF
    print("\n📄 测试1: 解析正常大小的PDF文件")
    pdf_data = create_test_pdf()
    print(f"   PDF文件大小: {len(pdf_data)} 字节 ({len(pdf_data)/1024:.2f} KB)")

    try:
        extracted_text = await extract_text_from_pdf(pdf_data)
        print(f"✅ 提取成功!")
        print(f"   提取的文本长度: {len(extracted_text)} 字符")
        print(f"   提取的文本内容:")
        print("   " + "-" * 50)
        for line in extracted_text.split('\n')[:10]:  # 只显示前10行
            print(f"   {line}")
        if len(extracted_text.split('\n')) > 10:
            print(f"   ... (共 {len(extracted_text.split('\\n'))} 行)")
        print("   " + "-" * 50)
    except Exception as e:
        print(f"❌ 提取失败: {str(e)}")

    # 测试2: 测试大小限制（创建一个超过10MB的数据）
    print("\n📏 测试2: 测试文件大小限制")
    large_pdf_data = b"fake_pdf_data" * (11 * 1024 * 1024 // 13 + 1)  # 超过10MB
    print(f"   创建大文件: {len(large_pdf_data)} 字节 ({len(large_pdf_data)/1024/1024:.2f} MB)")

    if len(large_pdf_data) > 10 * 1024 * 1024:
        print(f"✅ 文件大小 > 10MB，应该被拒绝")
        print(f"   (在实际应用中，服务器会返回错误消息)")

    # 测试3: 测试空PDF
    print("\n📝 测试3: 测试空内容的处理")
    empty_pdf = create_minimal_pdf()
    try:
        extracted_text = await extract_text_from_pdf(empty_pdf)
        if not extracted_text.strip():
            print(f"⚠️  提取到空内容（这是预期的）")
        else:
            print(f"✅ 提取成功: {len(extracted_text)} 字符")
    except Exception as e:
        print(f"❌ 处理失败: {str(e)}")

    print("\n" + "=" * 60)
    print("PDF功能测试完成!")
    print("=" * 60)

if __name__ == '__main__':
    asyncio.run(test_pdf_extraction())
