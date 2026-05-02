document.addEventListener("DOMContentLoaded", () => {
  const sourceText = document.getElementById("sourceText");
  const translation = document.getElementById("translation");
  const translateBtn = document.getElementById("translateBtn");
  const copyBtn = document.getElementById("copyBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const targetLang = document.getElementById("targetLang");

  let translatedText = "";

  browser.storage.local.get(["selectedText"], (result) => {
    if (result.selectedText) {
      sourceText.value = result.selectedText;
    }
  });

  browser.storage.sync.get(["targetLang"], (result) => {
    if (result.targetLang) {
      targetLang.value = result.targetLang;
    }
  });

  translateBtn.addEventListener("click", () => {
    const text = sourceText.value.trim();
    if (!text) return;

    translateBtn.disabled = true;
    translateBtn.textContent = "Translating...";
    translation.innerHTML = '<span class="loading">Translating...</span>';
    copyBtn.disabled = true;

    browser.runtime.sendMessage({
      action: "translate",
      text: text,
      targetLang: targetLang.value
    }).then((response) => {
      console.log("Got response:", response);
      translateBtn.disabled = false;
      translateBtn.textContent = "Translate";

      if (response.error) {
        throw new Error(response.error);
      }
      translatedText = response.success;
      translation.textContent = translatedText;
      copyBtn.disabled = false;
    }).catch((error) => {
      translateBtn.disabled = false;
      translateBtn.textContent = "Translate";
      translation.innerHTML = `<span style="color: #d9534f;">${error.message || "Translation failed"}</span>`;
    });
  });

  copyBtn.addEventListener("click", () => {
    if (!translatedText) return;
    navigator.clipboard.writeText(translatedText).then(() => {
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = "Copy Translation";
      }, 1500);
    });
  });

  settingsBtn.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });
});
