(function () {
  var store = window.__riverStore && window.__riverStore.getState();
  if (!store) return "NO_STORE";
  if (store.bundle) store.closeNote();
  window.setTimeout(function () {
    var cards = document.querySelectorAll("article.tmi-note");
    for (var i = 0; i < cards.length; i += 1) {
      var title = cards[i].querySelector(".tmi-note-title");
      if (!title || title.textContent !== "Banking") continue;
      var buttons = cards[i].querySelectorAll("button");
      for (var j = 0; j < buttons.length; j += 1) {
        if (buttons[j].textContent.trim() === "打开") {
          buttons[j].click();
          return;
        }
      }
    }
  }, 500);
  return "SCHEDULED";
})()
