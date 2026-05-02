document.addEventListener("DOMContentLoaded", () => {
  const sourceText = document.getElementById("sourceText");
  const translation = document.getElementById("translation");
  const translateBtn = document.getElementById("translateBtn");
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

  let translatedText = "";
  let currentSiteKey = "";

  // Detect current site from storage (set by background when context menu clicked)
  function detectSite() {
    browser.storage.local.get(["pageUrl"], (result) => {
      const pageUrl = result.pageUrl || "";
      console.log("Popup detected pageUrl:", pageUrl);
      try {
        const url = new URL(pageUrl);
        currentSiteKey = url.hostname;
        siteInfo.textContent = url.hostname;
      } catch (e) {
        currentSiteKey = "browser";
        siteInfo.textContent = "Browser";
      }
    });
  }

  // Listen for storage changes (in case storage saves after popup loads)
  browser.storage.local.onChanged.addListener((changes) => {
    if (changes.pageUrl) {
      const pageUrl = changes.pageUrl.newValue || "";
      console.log("Storage changed pageUrl:", pageUrl);
      try {
        const url = new URL(pageUrl);
        currentSiteKey = url.hostname;
        siteInfo.textContent = url.hostname;
      } catch (e) {
        currentSiteKey = "browser";
        siteInfo.textContent = "Browser";
      }
    }
    if (changes.selectedText) {
      sourceText.value = changes.selectedText.newValue || "";
      updateCharCount();
    }
  });

  detectSite();

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
  browser.storage.local.get(["selectedText", "pageUrl"], (result) => {
    if (result.selectedText) {
      sourceText.value = result.selectedText;
      updateCharCount();
    }
    if (!result.pageUrl) detectSite();
  });

  browser.storage.sync.get(["targetLang"], (result) => {
    if (result.targetLang) targetLang.value = result.targetLang;
  });

  loadMemory();

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
      translateBtn.disabled = false;
      translateBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
        Translate
      `;

      if (response.error) {
        throw new Error(response.error);
      }
      translatedText = response.success;
      translation.textContent = translatedText;
      copyBtn.disabled = false;
      saveMemory(text, translatedText);
    }).catch((error) => {
      translateBtn.disabled = false;
      translateBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
        Translate
      `;
      translation.innerHTML = `<span style="color: var(--danger);">${error.message || "Translation failed"}</span>`;
    });
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
      setTimeout(() => {
        copyBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy
        `;
      }, 1500);
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
