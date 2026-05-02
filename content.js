const DEFAULT_SERVER_URL = "http://localhost:8080";
const DEFAULT_MODEL = "local-model";

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

  const prompt = `Translate the following text to ${targetLang}. Only output the translation, nothing else:

${text}`;

  const response = await fetch(`${serverUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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

  const prompt = `Translate the following text to ${targetLang}. Only output the translation, nothing else:

${text}`;

  const response = await fetch(`${serverUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: "You are a professional translator." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2048,
      stream: true
    })
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
