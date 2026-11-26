// GET /api/config — configuración pública de la interfaz (sin prompts).
import { publicConfig } from "../lib/config.js";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ...publicConfig(), geminiReady: Boolean(process.env.GEMINI_API_KEY) });
}
