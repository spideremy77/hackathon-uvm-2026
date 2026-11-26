// Cliente mínimo de la API de Gemini (REST, sin dependencias).
// La API key vive SOLO en el servidor (variable de entorno GEMINI_API_KEY).

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// Si un modelo no existe (404) se intenta el siguiente.
function modelList() {
  const preferred = process.env.GEMINI_MODEL;
  return [preferred, "gemini-flash-latest", "gemini-3.8-flash", "gemini-2.5-flash"].filter(
    (m, i, arr) => m && arr.indexOf(m) === i
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} opts
 * @param {string} opts.system           Instrucciones de sistema
 * @param {string} opts.prompt           Texto del usuario
 * @param {{mimeType:string,data:string}[]} [opts.images]  Imágenes en base64
 * @param {{role:'user'|'model', text:string}[]} [opts.history]
 * @param {object} [opts.schema]         responseSchema para salida JSON
 */
export async function generate({ system, prompt, images = [], history = [], schema }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error("Falta GEMINI_API_KEY");
    err.code = "NO_KEY";
    throw err;
  }

  const contents = [
    ...history.slice(-8).map((h) => ({ role: h.role === "model" ? "model" : "user", parts: [{ text: String(h.text) }] })),
    {
      role: "user",
      parts: [
        ...images.slice(0, 3).map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
        { text: prompt || "Analiza la imagen." },
      ],
    },
  ];

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      ...(schema ? { responseMimeType: "application/json", responseSchema: schema } : {}),
    },
  };

  let lastError;
  for (const model of modelList()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join("");
        if (!text) {
          const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || "vacía";
          throw new Error(`Respuesta ${reason} de Gemini`);
        }
        return { model, text, json: schema ? safeJson(text) : null };
      }
      const detail = await res.text();
      lastError = new Error(`Gemini ${res.status} (${model}): ${detail.slice(0, 300)}`);
      lastError.status = res.status;
      if (res.status === 404) break; // modelo no existe → probar el siguiente
      if (res.status === 429 || res.status >= 500) {
        await sleep(1200 * (attempt + 1)); // saturado → reintentar
        continue;
      }
      throw lastError; // 400/401/403: error real, no tiene caso reintentar
    }
  }
  throw lastError;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {}
    }
    return null;
  }
}
