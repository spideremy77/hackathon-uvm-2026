// POST /api/gemini — función serverless (Vercel).
// Body: { task, prompt, images?, history?, easyRead?, perfil?, ubicacion?, puntos? }
import { APP, PERFILES } from "../lib/config.js";
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
  const { task: taskId = "evaluar", prompt = "", images = [], history = [], easyRead = false, perfil, ubicacion, puntos = [] } = body;
  const task = APP.tasks[taskId];
  if (!task) return res.status(400).json({ ok: false, error: "Función desconocida." });

  if (!String(prompt).trim() && images.length === 0 && taskId !== "recomendar") {
    return res.status(400).json({ ok: false, error: "Toma una foto, dicta o escribe algo para empezar." });
  }

  const perfilTxt = PERFILES[perfil] ? `PERFIL DE LA PERSONA USUARIA: ${PERFILES[perfil]} (id: ${perfil}).` : "PERFIL: no indicado; considera a todas las personas.";
  const system = [APP.baseSystem, task.system, perfilTxt, easyRead ? APP.easyRead : ""].filter(Boolean).join("\n\n");

  let userText = String(prompt || "").slice(0, 4000);
  if (ubicacion) userText += `\n\nUbicación aproximada: ${String(ubicacion).slice(0, 200)}`;
  if (taskId === "recomendar") {
    const lista = puntos.slice(0, 60).map((p) => ({
      id: String(p.id),
      titulo: String(p.titulo || "").slice(0, 120),
      tipo: p.tipo,
      semaforo: p.semaforo,
      notas: String(p.notas || "").slice(0, 200),
    }));
    userText = `Lo que quiero hacer: ${userText || "¿Qué lugares de este mapa me convienen y cuáles debo evitar?"}\n\nPuntos del mapa (JSON):\n${JSON.stringify(lista)}`;
  }
  if (!userText.trim()) userText = "Analiza la imagen.";

  try {
    const out = await generate({ system, prompt: userText, images, history, schema: task.schema });
    if (!out.json) return res.status(502).json({ ok: false, error: "Gemini respondió en un formato inesperado. Intenta de nuevo." });
    return res.status(200).json({ ok: true, model: out.model, result: out.json });
  } catch (err) {
    if (err.code === "NO_KEY") {
      return res.status(200).json({ ok: true, demo: true, model: "demo", result: demoResponse(taskId, userText, puntos) });
    }
    console.error(err);
    const status = err.status === 429 ? 429 : err.status === 504 ? 504 : 502;
    const msg =
      status === 429
        ? "Gemini está saturado. Intenta de nuevo en unos segundos."
        : status === 504
        ? "Gemini tardó demasiado. Intenta de nuevo."
        : "No pudimos obtener respuesta de Gemini. Intenta de nuevo.";
    return res.status(status).json({ ok: false, error: msg, detail: String(err.message).slice(0, 300) });
  }
}
