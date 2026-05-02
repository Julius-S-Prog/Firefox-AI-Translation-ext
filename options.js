document.addEventListener("DOMContentLoaded", () => {
  const serverUrl = document.getElementById("serverUrl");
  const model = document.getElementById("model");
  const saveBtn = document.getElementById("saveBtn");
  const status = document.getElementById("status");

  browser.storage.sync.get(["serverUrl", "model"], (result) => {
    serverUrl.value = result.serverUrl || DEFAULT_SERVER_URL;
    model.value = result.model || DEFAULT_MODEL;
  });

  saveBtn.addEventListener("click", () => {
    browser.storage.sync.set({
      serverUrl: serverUrl.value.trim(),
      model: model.value.trim()
    }, () => {
      status.textContent = "Settings saved!";
      setTimeout(() => {
        status.textContent = "";
      }, 2000);
    });
  });
});
