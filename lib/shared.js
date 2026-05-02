const DEFAULT_SERVER_URL = "http://localhost:8080";
const DEFAULT_MODEL = "local-model";

function buildPrompt(text, targetLang) {
  return `Translate the following text to ${targetLang}. Only output the translation, nothing else:

${text}`;
}

function buildRequestConfig(model, prompt, stream) {
  return {
    model: model,
    messages: [
      { role: "system", content: "You are a professional translator." },
      { role: "user", content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 2048,
    stream: stream || false
  };
}

function extractHostname(pageUrl) {
  try {
    const url = new URL(pageUrl);
    return { hostname: url.hostname, label: url.hostname };
  } catch (e) {
    return { hostname: "browser", label: "Browser" };
  }
}
