#!/usr/bin/env python3
import json
import re
import sys
from datetime import datetime
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer


BLOCK_LABELS = {
    "definition": "定义",
    "explanation": "解释",
    "example": "例子",
    "supplement": "补充",
    "formula": "公式",
    "understanding": "我的理解",
    "pitfall": "易错点",
    "source": "来源",
}

ROLE_LABELS = {
    "intro": "引入",
    "key": "重点",
    "difficulty": "难点",
    "exercise": "练习",
    "extension": "拓展",
}

DARK = colors.HexColor("#222222")
BLUE = colors.HexColor("#1F4E79")
MUTED = colors.HexColor("#666666")
RULE = colors.HexColor("#D7DEE8")


def register_fonts():
    pdfmetrics.registerFont(TTFont("RiverSans", "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"))
    pdfmetrics.registerFont(TTFont("RiverSansBold", "/System/Library/Fonts/STHeiti Medium.ttc", subfontIndex=0))


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("RiverTitle", parent=base["Title"], fontName="RiverSansBold", fontSize=22, leading=29, textColor=DARK, spaceAfter=8),
        "subtitle": ParagraphStyle("RiverSubtitle", parent=base["Normal"], fontName="RiverSans", fontSize=10, leading=15, textColor=MUTED, spaceAfter=4),
        "meta": ParagraphStyle("RiverMeta", parent=base["Normal"], fontName="RiverSans", fontSize=9, leading=14, textColor=MUTED, spaceAfter=12),
        "h1": ParagraphStyle("RiverH1", parent=base["Heading1"], fontName="RiverSansBold", fontSize=16, leading=22, textColor=BLUE, spaceBefore=12, spaceAfter=7, keepWithNext=True),
        "h2": ParagraphStyle("RiverH2", parent=base["Heading2"], fontName="RiverSansBold", fontSize=13, leading=19, textColor=BLUE, spaceBefore=9, spaceAfter=5, keepWithNext=True),
        "h3": ParagraphStyle("RiverH3", parent=base["Heading3"], fontName="RiverSansBold", fontSize=11, leading=17, textColor=BLUE, spaceBefore=7, spaceAfter=4, keepWithNext=True),
        "body": ParagraphStyle("RiverBody", parent=base["BodyText"], fontName="RiverSans", fontSize=9.5, leading=14.6, textColor=DARK, spaceAfter=5),
        "block": ParagraphStyle("RiverBlock", parent=base["BodyText"], fontName="RiverSans", fontSize=9.3, leading=14.2, textColor=DARK, leftIndent=15, firstLineIndent=-15, spaceAfter=4),
        "source": ParagraphStyle("RiverSource", parent=base["BodyText"], fontName="RiverSans", fontSize=9, leading=13, textColor=MUTED, leftIndent=20, firstLineIndent=-20, spaceAfter=8),
    }


def paragraph_text(text):
    text = text.replace("**", "").replace("++", "")
    return escape(text).replace("\n", "<br/>")


def block_flowables(block, style):
    label = BLOCK_LABELS.get(block["type"], block["type"])
    content = f'<font name="RiverSansBold" color="#1F4E79">[{label}]</font> {paragraph_text(block["text"])}'
    return Paragraph(content, style)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: export_river_note_pdf.py input.json output.pdf")
    source_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    data = json.loads(source_path.read_text(encoding="utf-8"))
    note = data["note"]
    source = data.get("source") or {}
    nodes = data.get("nodes") or []
    blocks = data.get("blocks") or []
    styles_map = styles()

    block_map = {}
    for block in blocks:
        block_map.setdefault(block["nodeId"], []).append(block)
    for values in block_map.values():
        values.sort(key=lambda item: item.get("order", 0))

    story = [
        Paragraph(escape(note["title"]), styles_map["title"]),
        Paragraph("基于 RWJLT_FCF_Ch_15.pdf 的详细 Effie 大纲", styles_map["subtitle"]),
        Paragraph(
            f"课件页数：{source.get('pages', '-')} | 提取字符：{source.get('textCharCount', '-')} | 导出时间：{datetime.now().strftime('%Y-%m-%d %H:%M')} | 文件在 Finder 中标记为红色",
            styles_map["meta"],
        ),
        Paragraph("本文档按学习顺序整理章节导入、来源目录、导入问题和完整知识树。目录页码对应原始课件页码范围，不是本文档页码。", styles_map["body"]),
    ]

    meta_titles = {"本章导入与学习定位", "本章目录", "导入问题"}
    meta_nodes = [node for node in nodes if node.get("parentId") is None and node.get("title") in meta_titles]
    meta_ids = {node["id"] for node in meta_nodes}

    story.append(PageBreak())
    story.append(Paragraph("学习导入", styles_map["h1"]))
    for node in sorted(meta_nodes, key=lambda item: item.get("order", 0)):
        group = [Paragraph(escape(node["title"]), styles_map["h2"])]
        group.extend(block_flowables(block, styles_map["block"]) for block in block_map.get(node["id"], []))
        story.append(KeepTogether(group[:3]))
        story.extend(group[3:])

    children = {}
    for node in nodes:
        children.setdefault(node.get("parentId"), []).append(node)
    for values in children.values():
        values.sort(key=lambda item: item.get("order", 0))

    story.append(PageBreak())
    story.append(Paragraph("详细知识树", styles_map["h1"]))

    def add_node(node, level):
        style = styles_map["h2"] if level <= 2 else styles_map["h3"]
        heading = Paragraph(escape(node["title"]), style)
        node_blocks = [block_flowables(block, styles_map["block"]) for block in block_map.get(node["id"], [])]
        story.append(KeepTogether([heading] + node_blocks[:2]))
        story.extend(node_blocks[2:])
        for child in children.get(node["id"], []):
            add_node(child, level + 1)

    for node in children.get(None, []):
        if node["id"] not in meta_ids:
            add_node(node, 2)

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(RULE)
        canvas.line(2 * cm, 1.35 * cm, A4[0] - 2 * cm, 1.35 * cm)
        canvas.setFont("RiverSans", 8)
        canvas.setFillColor(MUTED)
        canvas.drawCentredString(A4[0] / 2, 0.85 * cm, f"第 {doc.page} 页")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=1.7 * cm,
        bottomMargin=1.8 * cm,
        title=note["title"],
        author="River",
    )
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    register_fonts()
    main()
