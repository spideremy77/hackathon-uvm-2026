// POST /api/gemini  — función serverless (Vercel).
// Body: { task, prompt, images?, history?, easyRead? }
import { APP } from "../lib/config.js";
import { generate } from "../lib/gemini.js";
import { demoResponse } from "../lib/demo.js";

export default async function handler(req, res) {
  try {
    return await main(req, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor.", detail: String(err?.message || err).slice(0, 300) });
  }
}

async function main(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const { task: taskId, prompt = "", images = [], history = [], easyRead = false } = body;
  const task = APP.tasks.find((t) => t.id === taskId) || APP.tasks[0];

  if (!prompt.trim() && images.length === 0) {
    return res.status(400).json({ error: "Escribe, dicta o sube una imagen." });
  }

  const system = [APP.baseSystem, task.system, easyRead ? APP.easyRead : ""].filter(Boolean).join("\n\n");

  try {
    const out = await generate({ system, prompt, images, history, schema: APP.responseSchema });
    if (!out.json) return res.status(200).json({ ok: true, model: out.model, result: fallbackFromText(out.text) });
    return res.status(200).json({ ok: true, model: out.model, result: out.json });
  } catch (err) {
    if (err.code === "NO_KEY") {
      // Sin API key → modo demo para poder probar la interfaz.
      return res.status(200).json({ ok: true, demo: true, model: "demo", result: demoResponse(task, prompt) });
    }
    console.error(err);
    const status = err.status === 429 ? 429 : 502;
    const msg =
      status === 429
        ? "Gemini está saturado. Intenta de nuevo en unos segundos."
        : "No pudimos obtener respuesta de Gemini. Intenta de nuevo.";
    return res.status(status).json({ ok: false, error: msg, detail: String(err.message).slice(0, 300) });
  }
}

function fallbackFromText(text) {
  return { titulo: "Respuesta", resumen: text, nivel: "info", puntos: [], siguiente_accion: "", voz: text.slice(0, 400) };
}
