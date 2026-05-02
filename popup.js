document.addEventListener("DOMContentLoaded", () => {
  const sourceText = document.getElementById("sourceText");
  const translation = document.getElementById("translation");
  const translateBtn = document.getElementById("translateBtn");
  const translatePageBtn = document.getElementById("translatePageBtn");
  const copyBtn = document.getElementById("copyBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const targetLang = document.getElementById("targetLang");
  const themeToggle = document.getElementById("themeToggle");
  const siteInfo = document.getElementById("siteInfo");
  const memoryPanel = document.getElementById("memoryPanel");
  const memoryList = document.getElementById("memoryList");
  const memoryCount = document.getElementById("memoryCount");
  const clearMemoryBtn = document.getElementById("clearMemory");
  const charCount = document.getElementById("charCount");
  const resetPageBtn = document.getElementById("resetPageBtn");

  let translatedText = "";
  let currentSiteKey = "";

  // Get current tab URL from browser API
  async function getCurrentTabUrl() {
    return new Promise((resolve) => {
      browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
          resolve(tabs[0].url);
        } else {
          resolve("");
        }
      });
    });
  }

  // Detect current site from tab or storage
  async function updateSiteInfo() {
    let pageUrl = "";

    // First try storage (set by context menu)
    const stored = await new Promise((resolve) => {
      browser.storage.local.get(["pageUrl"], (result) => resolve(result.pageUrl || ""));
    });
    if (stored) {
      pageUrl = stored;
    }

    // Also try current tab
    const tabUrl = await getCurrentTabUrl();
    if (tabUrl && tabUrl !== "about:blank" && tabUrl !== "about:srcdoc") {
      pageUrl = tabUrl;
    }

    console.log("Popup detected pageUrl:", pageUrl);
    const { hostname, label } = extractHostname(pageUrl);
    currentSiteKey = hostname;
    siteInfo.textContent = label;

    const showPageTranslate = hostname && hostname !== "browser" && !hostname.startsWith("about:");
    translatePageBtn.style.display = showPageTranslate ? "flex" : "none";
  }

  // Listen for storage changes (in case storage saves after popup loads)
  browser.storage.local.onChanged.addListener((changes) => {
    if (changes.pageUrl) {
      updateSiteInfo();
    }
    if (changes.selectedText) {
      sourceText.value = changes.selectedText.newValue || "";
      updateCharCount();
    }
  });

  // Listen for tab changes to update URL in sidebar
  browser.tabs.onActivated.addListener(({ tabId }) => {
    browser.tabs.get(tabId, (tab) => {
      if (tab && tab.url) {
        browser.storage.local.set({ pageUrl: tab.url });
        updateSiteInfo();
      }
    });
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "complete" || changeInfo.url) {
      browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id === tabId) {
          browser.storage.local.set({ pageUrl: tabs[0].url || "" });
          updateSiteInfo();
        }
      });
    }
  });

  // Load theme
  function loadTheme() {
    browser.storage.sync.get(["theme"], (result) => {
      const theme = result.theme || "light";
      document.documentElement.setAttribute("data-theme", theme);
    });
  }
  loadTheme();

  // Load memory for current site
  function loadMemory() {
    if (!currentSiteKey) return;
    browser.storage.sync.get([currentSiteKey], (result) => {
      const memories = result[currentSiteKey] || [];
      memoryCount.textContent = memories.length;
      renderMemories(memories);
    });
  }

  function renderMemories(memories) {
    if (memories.length === 0) {
      memoryList.innerHTML = '<div class="memory-empty">No translations saved for this site</div>';
      return;
    }

    memoryList.innerHTML = memories.map((m, i) => `
      <div class="memory-item" data-index="${i}">
        <div class="memory-item-source">${escapeHtml(m.source)}</div>
        <div class="memory-item-target">${escapeHtml(m.target)}</div>
      </div>
    `).join("");

    memoryList.querySelectorAll(".memory-item").forEach(item => {
      item.addEventListener("click", () => {
        const index = parseInt(item.dataset.index);
        const memory = memories[index];
        sourceText.value = memory.source;
        translation.textContent = memory.target;
        translatedText = memory.target;
        copyBtn.disabled = false;
        updateCharCount();
      });
    });
  }

  const TRANSLATE_BTN_HTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
        Translate
      `;

  const TRANSLATE_PAGE_BTN_HTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
        </svg>
        Translate Page
      `;

  const COPY_BTN_HTML = `
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy
        `;

  function resetTranslateBtn() {
    translateBtn.disabled = false;
    translateBtn.innerHTML = TRANSLATE_BTN_HTML;
  }

  function resetTranslatePageBtn() {
    translatePageBtn.disabled = false;
    translatePageBtn.innerHTML = TRANSLATE_PAGE_BTN_HTML;
  }

  function resetCopyBtn() {
    copyBtn.innerHTML = COPY_BTN_HTML;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function saveMemory(source, target) {
    if (!currentSiteKey) return;
    browser.storage.sync.get([currentSiteKey], (result) => {
      let memories = result[currentSiteKey] || [];
      memories.unshift({ source, target, timestamp: Date.now() });
      if (memories.length > 50) memories = memories.slice(0, 50);
      browser.storage.sync.set({ [currentSiteKey]: memories }, () => {
        memoryCount.textContent = memories.length;
        renderMemories(memories);
      });
    });
  }

  // Char count
  function updateCharCount() {
    charCount.textContent = sourceText.value.length;
  }
  sourceText.addEventListener("input", updateCharCount);

  // Load initial data
  updateSiteInfo().then(() => {
    browser.storage.local.get(["selectedText"], (result) => {
      if (result.selectedText) {
        sourceText.value = result.selectedText;
        updateCharCount();
      }
    });
    loadMemory();
  });

  browser.storage.sync.get(["targetLang"], (result) => {
    if (result.targetLang) targetLang.value = result.targetLang;
  });

  // Translate
  translateBtn.addEventListener("click", () => {
    const text = sourceText.value.trim();
    if (!text) return;

    translateBtn.disabled = true;
    translateBtn.textContent = "Translating...";
    translation.innerHTML = '<div class="loading"></div>';
    copyBtn.disabled = true;

    browser.runtime.sendMessage({
      action: "translate",
      text: text,
      targetLang: targetLang.value
    }).then((response) => {
      resetTranslateBtn();

      if (response.error) {
        throw new Error(response.error);
      }
      translatedText = response.success;
      translation.textContent = translatedText;
      copyBtn.disabled = false;
      saveMemory(text, translatedText);
    }).catch((error) => {
      resetTranslateBtn();
      translation.innerHTML = `<span style="color: var(--danger);">${error.message || "Translation failed"}</span>`;
    });
  });

  // Translate Page
  translatePageBtn.addEventListener("click", () => {
    translatePageBtn.disabled = true;
    translatePageBtn.textContent = "Translating...";
    browser.runtime.sendMessage({
      action: "translatePage",
      targetLang: targetLang.value
    }).then((response) => {
      resetTranslatePageBtn();
      if (response && response.error) {
        alert("Translation failed: " + response.error);
      }
      if (response && response.success === true) {
        resetPageBtn.style.display = "inline-flex";
      }
    }).catch((err) => {
      resetTranslatePageBtn();
      alert("Translation failed: " + err.message);
    });
  });

  // Reset page translation
  resetPageBtn.addEventListener("click", () => {
    browser.runtime.sendMessage({ action: "resetPageTranslation" });
    resetPageBtn.style.display = "none";
  });

  // Copy
  copyBtn.addEventListener("click", () => {
    if (!translatedText) return;
    navigator.clipboard.writeText(translatedText).then(() => {
      copyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
        Copied!
      `;
      setTimeout(resetCopyBtn, 1500);
    });
  });

  // Theme toggle
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    browser.storage.sync.set({ theme: next });
  });

  // Clear memory
  clearMemoryBtn.addEventListener("click", () => {
    if (!currentSiteKey) return;
    browser.storage.sync.get([currentSiteKey], (result) => {
      const memories = result[currentSiteKey] || [];
      if (memories.length === 0) return;
      browser.storage.sync.set({ [currentSiteKey]: [] }, () => {
        memoryCount.textContent = "0";
        renderMemories([]);
      });
    });
  });

  // Settings
  settingsBtn.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });
});
