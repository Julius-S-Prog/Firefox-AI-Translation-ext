function translateText(text, targetLang) {
  return new Promise((resolve, reject) => {
    browser.runtime.sendMessage({
      action: "translate",
      text: text,
      targetLang: targetLang
    }).then((response) => {
      if (response && response.error) {
        reject(new Error(response.error));
      } else if (response && response.success) {
        resolve(response.success);
      } else {
        reject(new Error("Translation failed: no response from server"));
      }
    }).catch((err) => {
      reject(new Error("Translation failed: " + (err.message || "NetworkError when attempting to fetch resource")));
    });
  });
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "BUTTON", "CODE", "PRE", "SVG", "IMG", "BR"]);
const SKIP_ATTRIBUTES = ["translate", "data-no-translate", "data-translate-skip"];

function translatePage(targetLang) {
  return new Promise((resolve, reject) => {
    const translatableElements = [];
    const texts = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          if (SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
          if (node.closest("[translate='no']")) return NodeFilter.FILTER_REJECT;
          if (node.closest("[data-no-translate]")) return NodeFilter.FILTER_REJECT;
          for (const attr of SKIP_ATTRIBUTES) {
            if (node.hasAttribute(attr) && node.getAttribute(attr) !== "false") return NodeFilter.FILTER_REJECT;
          }
          const text = node.textContent.trim();
          if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (!el.dataset.original) {
        el.dataset.original = el.textContent.trim();
      }
      translatableElements.push(el);
      texts.push(el.dataset.original);
    }

    if (translatableElements.length === 0) {
      resolve({ success: false, message: "No translatable text found" });
      return;
    }

    let completed = 0;
    let errors = 0;

    texts.forEach((text, index) => {
      translateText(text, targetLang)
        .then((translated) => {
          if (translated && translated !== text) {
            translatableElements[index].textContent = translated;
          }
          completed++;
        })
        .catch(() => {
          errors++;
        })
        .finally(() => {
          if (completed + errors === translatableElements.length) {
            resolve({ success: true, count: completed, errors });
          }
        });
    });
  });
}

function resetPageTranslation() {
  const elements = document.querySelectorAll("[data-original]");
  for (const el of elements) {
    el.textContent = el.dataset.original;
  }
}

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translatePage") {
    translatePage(request.targetLang)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
  if (request.action === "resetPageTranslation") {
    resetPageTranslation();
    sendResponse({ success: true });
  }
  if (request.action === "showResetBtn") {
    const indicator = document.createElement("div");
    indicator.id = "ai-translate-indicator";
    indicator.style.cssText = "position:fixed;bottom:20px;right:20px;background:#6366f1;color:white;padding:8px 16px;border-radius:8px;font-size:13px;z-index:999999;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);";
    indicator.textContent = "Reset translation";
    indicator.addEventListener("click", () => {
      resetPageTranslation();
      indicator.remove();
    });
    document.body.appendChild(indicator);
    sendResponse({ success: true });
  }
});
