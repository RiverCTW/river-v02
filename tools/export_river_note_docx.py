#!/usr/bin/env python3
import json
import re
import sys
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor


BLUE = RGBColor(0x1F, 0x4E, 0x79)
DARK = RGBColor(0x22, 0x22, 0x22)
MUTED = RGBColor(0x66, 0x66, 0x66)

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


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def set_run_font(run, font_name):
    run.font.name = font_name
    r_pr = run._element.get_or_add_rPr()
    r_fonts = r_pr.get_or_add_rFonts()
    for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        r_fonts.set(qn(attr), font_name)


def apply_cjk_font(doc, font_name="Arial Unicode MS"):
    for style in doc.styles:
        try:
            style.font.name = font_name
            r_pr = style.element.get_or_add_rPr()
            r_fonts = r_pr.get_or_add_rFonts()
            for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
                r_fonts.set(qn(attr), font_name)
        except Exception:
            pass
    for paragraph in doc.paragraphs:
        for run in paragraph.runs:
            set_run_font(run, font_name)


def add_page_number(paragraph):
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run("第 ")
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), "PAGE")
    run._r.addnext(fld)
    paragraph.add_run(" 页")


def add_toc(doc):
    paragraph = doc.add_paragraph()
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = 'TOC \\o "1-3" \\h \\z \\u'
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = "在 Word 中打开并更新目录"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend([begin, instr, separate, text, end])


def add_rich_red_prefix(paragraph, text, red_mode=False):
    match = re.match(r"^(Q\d+\.|[\[【](?:引入|重点|难点|练习|拓展)[^\]】]*[\]】]|\*\*[^*]+\*\*|\+\+[^+]+\+\+|[^*]+：)", text)
    if match:
        run = paragraph.add_run(match.group(1))
        run.bold = True
        run.font.color.rgb = BLUE
        rest = paragraph.add_run(text[match.end():])
        rest.font.color.rgb = BLUE if red_mode else DARK
    else:
        run = paragraph.add_run(text)
        run.font.color.rgb = BLUE if red_mode else DARK


def style_document(doc):
    section = doc.sections[0]
    section.top_margin = Cm(1.8)
    section.bottom_margin = Cm(1.8)
    section.left_margin = Cm(2.0)
    section.right_margin = Cm(2.0)
    normal = doc.styles["Normal"]
    normal.font.name = "Arial Unicode MS"
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = DARK
    normal.paragraph_format.space_after = Pt(5)
    normal.paragraph_format.line_spacing = 1.25
    for style_name in ("Title", "Heading 1", "Heading 2", "Heading 3"):
        style = doc.styles[style_name]
        style.font.name = "Arial Unicode MS"
        style.font.color.rgb = BLUE if style_name != "Title" else DARK
    doc.styles["Title"].font.size = Pt(24)
    doc.styles["Heading 1"].font.size = Pt(16)
    doc.styles["Heading 2"].font.size = Pt(13)
    doc.styles["Heading 3"].font.size = Pt(11.5)
    footer = section.footer.paragraphs[0]
    add_page_number(footer)


def add_meta_node(doc, node, blocks, level=1, prefix=None):
    title = prefix or node["title"]
    heading = doc.add_heading(title, level=level)
    heading.paragraph_format.keep_with_next = True
    for block in blocks:
        paragraph = doc.add_paragraph()
        paragraph.paragraph_format.left_indent = Cm(0.45 + max(0, level - 1) * 0.35)
        paragraph.paragraph_format.first_line_indent = Cm(-0.35)
        label = BLOCK_LABELS.get(block["type"], block["type"])
        label_run = paragraph.add_run(f"{label}  ")
        label_run.bold = True
        label_run.font.color.rgb = BLUE
        text = block["text"]
        red_mode = block["type"] == "pitfall" or bool(re.search(r"[\[【](?:重点|难点)[^\]】]*[\]】]", text))
        add_rich_red_prefix(paragraph, text, red_mode)


def add_knowledge_tree(doc, nodes, blocks, root_ids, level=1):
    children = {}
    for node in nodes:
        children.setdefault(node.get("parentId"), []).append(node)
    block_map = {}
    for block in blocks:
        block_map.setdefault(block["nodeId"], []).append(block)
    for values in children.values():
        values.sort(key=lambda item: item.get("order", 0))
    for values in block_map.values():
        values.sort(key=lambda item: item.get("order", 0))

    def add_node(node, node_level):
        doc.add_heading(node["title"], level=min(node_level, 3)).paragraph_format.keep_with_next = True
        for block in block_map.get(node["id"], []):
            paragraph = doc.add_paragraph()
            paragraph.paragraph_format.left_indent = Cm(0.55 + max(0, node_level - 1) * 0.4)
            paragraph.paragraph_format.first_line_indent = Cm(-0.4)
            label = BLOCK_LABELS.get(block["type"], block["type"])
            label_run = paragraph.add_run(f"{label}  ")
            label_run.bold = True
            label_run.font.color.rgb = BLUE
            text = block["text"]
            red_mode = block["type"] == "pitfall"
            add_rich_red_prefix(paragraph, text, red_mode)
        for child in children.get(node["id"], []):
            add_node(child, node_level + 1)

    for node in children.get(None, []):
        if node["id"] in root_ids:
            continue
        add_node(node, level)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: export_river_note_docx.py input.json output.docx")
    source_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    data = json.loads(source_path.read_text(encoding="utf-8"))
    note = data["note"]
    introduction = data.get("introduction") or {}
    nodes = data.get("nodes") or []
    blocks = data.get("blocks") or []

    doc = Document()
    style_document(doc)
    doc.add_paragraph(note["title"], style="Title")
    subtitle = doc.add_paragraph()
    subtitle.add_run("基于 RWJLT_FCF_Ch_15.pdf 的详细 Effie 大纲").italic = True
    subtitle.runs[0].font.color.rgb = MUTED
    source = data.get("source") or {}
    meta = doc.add_paragraph()
    meta.add_run(f"课件页数：{source.get('pages', '-')}   |   提取字符：{source.get('textCharCount', '-')}   |   导出时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}")
    meta.runs[0].font.color.rgb = MUTED
    legend = doc.add_paragraph()
    legend_run = legend.add_run("文件标识：Word 与 PDF 均使用 Finder 红色标签。")
    legend_run.bold = True
    legend_run.font.color.rgb = BLUE
    doc.add_paragraph("本文档按学习顺序整理章节导入、来源目录、导入问题和完整知识树。目录页码对应原始课件页码范围，不是本文档页码。")
    doc.add_heading("文档目录", level=1)
    add_toc(doc)

    meta_titles = {"本章导入与学习定位", "本章目录", "导入问题"}
    meta_nodes = [node for node in nodes if node.get("parentId") is None and node.get("title") in meta_titles]
    meta_ids = {node["id"] for node in meta_nodes}
    block_map = {}
    for block in blocks:
        block_map.setdefault(block["nodeId"], []).append(block)
    for values in block_map.values():
        values.sort(key=lambda item: item.get("order", 0))

    doc.add_page_break()
    doc.add_heading("学习导入", level=1)
    for node in sorted(meta_nodes, key=lambda item: item.get("order", 0)):
        add_meta_node(doc, node, block_map.get(node["id"], []), level=2)

    doc.add_page_break()
    doc.add_heading("详细知识树", level=1)
    add_knowledge_tree(doc, nodes, blocks, meta_ids, level=2)

    apply_cjk_font(doc)
    doc.save(output_path)


if __name__ == "__main__":
    main()
