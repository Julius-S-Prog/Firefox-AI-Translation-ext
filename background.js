browser.runtime.onMessage.addListener((request, sender) => {
  if (request.action === "translate") {
    return new Promise((resolve) => {
      browser.storage.sync.get(["serverUrl", "model"], (result) => {
        const serverUrl = result.serverUrl || "http://localhost:8080";
        const model = result.model || "local-model";

        const prompt = `Translate the following text to ${request.targetLang}. Only output the translation, nothing else:

${request.text}`;

        console.log("Sending request to:", `${serverUrl}/v1/chat/completions`);
        console.log("Request body:", JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: "You are a professional translator." },
            { role: "user", content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 2048,
          stream: false
        }));

        fetch(`${serverUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: "system", content: "You are a professional translator." },
              { role: "user", content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 2048,
            stream: false
          })
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
