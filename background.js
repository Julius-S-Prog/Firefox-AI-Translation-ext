browser.runtime.onMessage.addListener((request, sender) => {
  if (request.action === "translate") {
    return new Promise((resolve) => {
      browser.storage.sync.get(["serverUrl", "model"], (result) => {
        const serverUrl = result.serverUrl || "http://localhost:8080";
        const model = result.model || "local-model";

        const prompt = buildPrompt(request.text, request.targetLang);
        const requestBody = buildRequestConfig(model, prompt, false);

        console.log("Sending request to:", `${serverUrl}/v1/chat/completions`);
        console.log("Request body:", JSON.stringify(requestBody));

        fetch(`${serverUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        })
          .then((res) => {
            console.log("Response status:", res.status);
            if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
            return res.text();
          })
          .then((text) => {
            console.log("Raw response:", text);
            const data = JSON.parse(text);
            console.log("Parsed response:", JSON.stringify(data));
            const content = data.choices?.[0]?.message?.content;
            if (!content) throw new Error("No translation returned from model");
            resolve({ success: content.trim() });
          })
          .catch((err) => {
            console.error("Translation error:", err);
            resolve({ error: err.message });
          });
      });
    });
  }
  if (request.action === "translatePage") {
    return new Promise((resolve) => {
      browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          browser.tabs.sendMessage(tabs[0].id, {
            action: "translatePage",
            targetLang: request.targetLang
          }).then((response) => {
            if (response && response.success === true) {
              console.log(`Translated ${response.count} elements`);
              browser.tabs.sendMessage(tabs[0].id, { action: "showResetBtn" });
            } else if (response && response.error) {
              console.error("Page translation error:", response.error);
            }
            resolve(response);
          }).catch((err) => {
            console.error("Failed to send translatePage to content:", err);
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

    // Always open sidebar for persistent window
    browser.sidebarAction.open();
  }
});

// Handle sidebar registration
browser.runtime.onStartup.addListener(() => {
  browser.storage.sync.set({ serverUrl: "http://localhost:8080" });
});

browser.runtime.onInstalled.addListener(() => {
  browser.storage.sync.set({ serverUrl: "http://localhost:8080" });
});
