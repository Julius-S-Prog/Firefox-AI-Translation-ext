const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "BUTTON", "CODE", "PRE", "SVG", "IMG", "BR"]);
const SKIP_ATTRIBUTES = ["translate", "data-no-translate", "data-translate-skip"];

let currentTranslatePageState = null;

function translatePage(targetLang, serverUrl, model) {
  return new Promise((resolve, reject) => {
    const textNodes = [];
    const originalTexts = [];
    let cancelled = false;
    let completed = 0;
    let errors = 0;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.closest("[translate='no']")) return NodeFilter.FILTER_REJECT;
          if (parent.closest("[data-no-translate]")) return NodeFilter.FILTER_REJECT;
          for (const attr of SKIP_ATTRIBUTES) {
            if (parent.hasAttribute(attr) && parent.getAttribute(attr) !== "false") return NodeFilter.FILTER_REJECT;
          }
          const text = node.textContent.trim();
          if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    while (walker.nextNode()) {
      const node = walker.currentNode;
      textNodes.push(node);
      originalTexts.push(node.textContent.trim());
    }

    if (textNodes.length === 0) {
      resolve({ success: false, message: "No translatable text found" });
      return;
    }

    currentTranslatePageState = {
      cancelled: false,
      textNodes,
      indicator: null
    };

    const state = currentTranslatePageState;

    originalTexts.forEach((text, index) => {
      if (state.cancelled) return;

      browser.runtime.sendMessage({
        action: "translatePageText",
        index: index,
        text: text,
        targetLang: targetLang,
        serverUrl: serverUrl,
        model: model
      })
        .then((response) => {
          if (state.cancelled) return;
          if (response.error) {
            errors++;
          } else if (response.success) {
            const translated = response.success;
            if (translated) {
              textNodes[index].textContent = translated;
            }
            completed++;
          }

          if (completed + errors === textNodes.length) {
            if (state.indicator) {
              state.indicator.textContent = "Reset translation";
              state.indicator.style.background = "#6366f1";
              state.indicator.onclick = () => {
                resetPageTranslation();
                state.indicator.remove();
              };
            }
            resolve({ success: true, count: completed, errors });
          }
        })
        .catch((err) => {
          if (!state.cancelled) {
            errors++;
            if (completed + errors === textNodes.length) {
              if (state.indicator) {
                state.indicator.textContent = "Reset translation";
                state.indicator.style.background = "#6366f1";
                state.indicator.onclick = () => {
                  resetPageTranslation();
                  state.indicator.remove();
                };
              }
              resolve({ success: true, count: completed, errors });
            }
          }
        });
    });

    // Update the indicator button to support cancel
    const indicator = document.getElementById("ai-translate-indicator");
    if (indicator) {
      state.indicator = indicator;
      indicator.textContent = "Cancel translation";
      indicator.style.background = "#ef4444";
      indicator.onclick = () => {
        state.cancelled = true;
        indicator.textContent = "Cancelled";
        indicator.style.background = "#ef4444";
        setTimeout(() => {
          resetPageTranslation();
          indicator.remove();
        }, 1500);
      };
    }
  });
}

function cancelTranslatePage() {
  if (currentTranslatePageState && !currentTranslatePageState.cancelled) {
    currentTranslatePageState.cancelled = true;
    const indicator = document.getElementById("ai-translate-indicator");
    if (indicator) {
      indicator.textContent = "Cancelled";
      indicator.style.background = "#ef4444";
      setTimeout(() => {
        resetPageTranslation();
        indicator.remove();
      }, 1500);
    }
  }
}

function resetPageTranslation() {
  const elements = document.querySelectorAll("[data-original]");
  for (const el of elements) {
    el.textContent = el.dataset.original;
  }
}

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translatePage") {
    const serverUrl = request.serverUrl || DEFAULT_SERVER_URL;
    const model = request.model || DEFAULT_MODEL;
    translatePage(request.targetLang, serverUrl, model)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
  if (request.action === "cancelPageTranslation") {
    cancelTranslatePage();
    sendResponse({ success: true });
  }
  if (request.action === "resetPageTranslation") {
    resetPageTranslation();
    sendResponse({ success: true });
  }
  if (request.action === "showResetBtn") {
    const indicator = document.getElementById("ai-translate-indicator");
    if (indicator) {
      indicator.textContent = "Reset translation";
      indicator.style.background = "#6366f1";
      indicator.onclick = () => {
        resetPageTranslation();
        indicator.remove();
      };
    } else {
      const newIndicator = document.createElement("div");
      newIndicator.id = "ai-translate-indicator";
      newIndicator.style.cssText = "position:fixed;bottom:20px;right:20px;background:#6366f1;color:white;padding:8px 16px;border-radius:8px;font-size:13px;z-index:999999;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);";
      newIndicator.textContent = "Reset translation";
      newIndicator.addEventListener("click", () => {
        resetPageTranslation();
        newIndicator.remove();
      });
      document.body.appendChild(newIndicator);
    }
    sendResponse({ success: true });
  }
});
