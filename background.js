browser.runtime.onMessage.addListener((request, sender) => {
  if (request.action === "translate") {
    return new Promise((resolve) => {
      browser.storage.sync.get(["serverUrl", "model"], (result) => {
        const serverUrl = result.serverUrl || "http://localhost:8080";
        const model = result.model || "local-model";

        const prompt = buildPrompt(request.text, request.targetLang);
        const requestBody = buildRequestConfig(model, prompt, false);

        fetch(`${serverUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        })
          .then((res) => {
            if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
            return res.text();
          })
          .then((text) => {
            const data = JSON.parse(text);
            const content = data.choices?.[0]?.message?.content;
            if (!content) throw new Error("No translation returned from model");
            resolve({ success: content.trim() });
          })
          .catch((err) => {
            resolve({ error: err.message });
          });
      });
    });
  }
  if (request.action === "translatePage") {
    return new Promise((resolve) => {
      browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          browser.storage.sync.get(["serverUrl", "model"], (result) => {
            const serverUrl = result.serverUrl || "http://localhost:8080";
            const model = result.model || "local-model";
            browser.tabs.sendMessage(tabs[0].id, {
              action: "translatePage",
              targetLang: request.targetLang,
              serverUrl: serverUrl,
              model: model
            }).then((response) => {
              if (response && response.success === true) {
                browser.tabs.sendMessage(tabs[0].id, { action: "showResetBtn" });
              } else if (response && response.error) {
                browser.tabs.sendMessage(tabs[0].id, { action: "showResetBtn" });
              }
              resolve(response);
            }).catch((err) => {
              resolve({ error: err.message });
            });
          });
        } else {
          resolve({ error: "No active tab found" });
        }
      });
    });
  }
  if (request.action === "translatePageText") {
    return new Promise((resolve) => {
      const prompt = buildPrompt(request.text, request.targetLang);
      const requestBody = buildRequestConfig(request.model, prompt, false);

      fetch(`${request.serverUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
          return res.text();
        })
        .then((text) => {
          const data = JSON.parse(text);
          const content = data.choices?.[0]?.message?.content;
          if (!content) throw new Error("No translation returned from model");
          resolve({
            action: "translatePageResponse",
            index: request.index,
            success: content.trim()
          });
        })
        .catch((err) => {
          resolve({
            action: "translatePageResponse",
            index: request.index,
            error: err.message
          });
        });
    });
  }
  if (request.action === "cancelPageTranslation") {
    return new Promise((resolve) => {
      browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          browser.tabs.sendMessage(tabs[0].id, { action: "cancelPageTranslation" }).then(() => {
            resolve({ success: true });
          }).catch((err) => {
            resolve({ error: err.message });
          });
        } else {
          resolve({ error: "No active tab found" });
        }
      });
    });
  }
  if (request.action === "resetPageTranslation") {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, { action: "resetPageTranslation" });
      }
    });
  }
});

browser.contextMenus.create({
  id: "translateSelection",
  title: "Translate with AI",
  contexts: ["selection"]
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translateSelection") {
    browser.storage.local.set({
      selectedText: info.selectionText,
      pageUrl: tab?.url || "unknown",
      popupOpenTime: Date.now()
    });

    browser.sidebarAction.open();
  }
});

browser.runtime.onInstalled.addListener(() => {
  browser.storage.sync.set({ serverUrl: "http://localhost:8080" });
});
