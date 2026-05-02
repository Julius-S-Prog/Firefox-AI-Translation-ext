function getServerUrl() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["serverUrl"], (result) => {
      resolve(result.serverUrl || DEFAULT_SERVER_URL);
    });
  });
}

function getModel() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["model"], (result) => {
      resolve(result.model || DEFAULT_MODEL);
    });
  });
}

async function translateText(text, targetLang) {
  const serverUrl = await getServerUrl();
  const model = await getModel();

  const response = await fetch(`${serverUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestConfig(model, buildPrompt(text, targetLang), false))
  });

  if (!response.ok) {
    throw new Error(`Translation failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function translateTextStream(text, targetLang, onChunk, onDone, onError) {
  const serverUrl = await getServerUrl();
  const model = await getModel();

  const response = await fetch(`${serverUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestConfig(model, buildPrompt(text, targetLang), true))
  });

  if (!response.ok) {
    onError(`Translation failed: ${response.statusText}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            onDone(fullText);
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const chunk = parsed.choices[0]?.delta?.content || "";
            if (chunk) {
              fullText += chunk;
              onChunk(fullText);
            }
          } catch (e) {
            // skip malformed JSON
          }
        }
      }
    }
    onDone(fullText);
  } catch (e) {
    onError(e.message);
  }
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "BUTTON", "CODE", "PRE", "SVG", "IMG", "BR", "INPUT"]);
const SKIP_ATTRIBUTES = ["translate", "data-no-translate", "data-translate-skip"];

function translatePage(targetLang) {
  return new Promise((resolve, reject) => {
    const allTextNodes = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.closest(SKIP_ATTRIBUTES.join(","))) return NodeFilter.FILTER_REJECT;
          for (const attr of SKIP_ATTRIBUTES) {
            if (parent.hasAttribute(attr) && parent.getAttribute(attr) !== "false") return NodeFilter.FILTER_REJECT;
          }
          if (parent.closest("[translate='no']")) return NodeFilter.FILTER_REJECT;
          const text = node.textContent.trim();
          if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    while (walker.nextNode()) {
      allTextNodes.push(walker.currentNode);
    }

    if (allTextNodes.length === 0) {
      resolve({ success: false, message: "No translatable text found" });
      return;
    }

    const originalTexts = [];
    for (const node of allTextNodes) {
      if (!node.dataset.original) {
        node.dataset.original = node.textContent;
      }
      originalTexts.push(node.textContent);
    }

    const fullText = originalTexts.join("\n");
    const lines = [];
    let lineIndex = 0;

    translateTextStream(fullText, targetLang, (chunk) => {
      const translatedLines = chunk.trim().split("\n");
      while (lineIndex < translatedLines.length && lineIndex < allTextNodes.length) {
        const translated = translatedLines[lineIndex].trim();
        if (translated && allTextNodes[lineIndex]) {
          allTextNodes[lineIndex].textContent = translated;
        }
        lineIndex++;
      }
    }, () => {
      resolve({ success: true, count: allTextNodes.length });
    }, (err) => {
      reject(new Error(err));
    });
  });
}

function resetPageTranslation() {
  const elements = document.querySelectorAll("[data-original]");
  for (const el of elements) {
    if (el.dataset.original !== undefined) {
      el.textContent = el.dataset.original;
    }
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
