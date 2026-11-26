// GET /api/health        → estado de la configuración
// GET /api/health?run=1  → además hace una llamada mínima real a Gemini
import { generate } from "../lib/gemini.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const out = {
    keyConfigured: Boolean(process.env.GEMINI_API_KEY),
    keyPrefix: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.slice(0, 4) + "…" : null,
    modelOverride: process.env.GEMINI_MODEL || null,
    node: process.version,
  };
  const run = (req.query && req.query.run) || new URL(req.url, "http://x").searchParams.get("run");
  if (run) {
    const t0 = Date.now();
    try {
      const r = await generate({
        system: "Responde en JSON.",
        prompt: 'Devuelve {"ok":true}',
        schema: { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] },
      });
      out.gemini = { ok: true, model: r.model, ms: Date.now() - t0, text: r.text.slice(0, 100) };
    } catch (e) {
      out.gemini = { ok: false, ms: Date.now() - t0, status: e.status || null, error: String(e.message).slice(0, 600) };
    }
  }
  res.status(200).json(out);
}
