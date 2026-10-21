(function () {
  var request = new XMLHttpRequest();
  request.open("GET", "/fixtures/banking_full_outline.json", false);
  request.send(null);
  if (request.status < 200 || request.status >= 300) return "LOAD_FAILED_" + request.status;
  var outline = JSON.parse(request.responseText);
  var editor = window.__riverEditor;
  if (!editor) return "EDITOR_NOT_READY";
  var now = new Date().toISOString();
  var root = [];
  var last = [null, null, null, null, null, null, null];
  function paragraphs(text) {
    return text.split("\n").map(function (line) {
      return { type: "paragraph", content: line ? [{ type: "text", text: line }] : [] };
    });
  }
  function makeItem(entry, index) {
    var kind = entry.type;
    var heading = kind === "heading" ? Number(entry.heading || 0) : 0;
    return {
      type: "listItem",
      attrs: {
        itemType: kind === "block" ? "block" : "knowledge",
        blockId: null,
        blockType: "explanation",
        nodeType: index === 0 ? "root" : "knowledge",
        headingLevel: heading,
        markerVisible: kind === "bullet",
        collapsed: false,
        sourceRefs: [],
        userModified: true,
        createdAt: now,
        updatedAt: now,
        nodeId: "bank-" + String(index).padStart(3, "0"),
        textAlign: null
      },
      content: paragraphs(entry.text),
      children: []
    };
  }
  outline.forEach(function (entry, index) {
    var node = makeItem(entry, index);
    if (entry.type === "heading") {
      root.push(node);
      last = [node, null, null, null, null, null, null];
      return;
    }
    var level = Math.max(1, Math.min(5, Number(entry.level || 1)));
    var parent = level > 1 ? last[level - 1] : last[0];
    if (!parent) {
      parent = last[0] || root[root.length - 1] || null;
      level = 1;
    }
    if (!parent) {
      root.push(node);
      last = [node, null, null, null, null, null, null];
      return;
    }
    parent.children.push(node);
    last[level] = node;
    for (var i = level + 1; i < last.length; i += 1) last[i] = null;
  });
  function convert(node) {
    var children = node.children || [];
    var content = node.content.slice();
    if (children.length) content.push({ type: "bulletList", content: children.map(convert) });
    return { type: "listItem", attrs: node.attrs, content: content };
  }
  var doc = { type: "doc", content: [{ type: "bulletList", content: root.map(convert) }] };
  editor.commands.setContent(doc, { emitUpdate: true });
  window.__riverStore.getState().updateNoteTitleAction("Banking");
  return JSON.stringify({ ok: true, sourceItems: outline.length, editorItems: root.length });
})()
