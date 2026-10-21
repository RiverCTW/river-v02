(function () {
  var editor = window.__riverEditor;
  if (!editor) return JSON.stringify({ editor: false, body: document.body.innerText.slice(0, 200) });
  var itemCount = 0;
  var headingCount = 0;
  editor.state.doc.descendants(function (node) {
    if (node.type.name !== "listItem") return true;
    itemCount += 1;
    if (Number(node.attrs.headingLevel || 0) > 0) headingCount += 1;
    return true;
  });
  var text = editor.getText();
  return JSON.stringify({
    editor: true,
    title: window.__riverStore.getState().bundle.note.title,
    items: itemCount,
    headings: headingCount,
    markers: document.querySelectorAll(".river-semantic-pink,.river-semantic-gold,.river-semantic-annotation,.river-semantic-comment,.river-semantic-strike").length,
    hasBanking: text.indexOf("Banking") >= 0,
    hasInformationAsymmetry: text.indexOf("信息不对称问题") >= 0,
    hasTable: text.indexOf("货币市场与资本市场的对比") >= 0,
    hasBasel: text.indexOf("巴塞尔协议的风险权重标准") >= 0,
    saveStatus: window.__riverStore.getState().saveStatus
  });
})()
