// Servidor local sin dependencias que imita a Vercel:  node scripts/dev.js
// Sirve /public y ejecuta las funciones de /api. Lee .env si existe.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 3000;

// Cargar .env
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon",
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname.startsWith("/api/")) return await runApi(url, req, res);
      let file = path.join(root, "public", decodeURIComponent(url.pathname));
      if (!file.startsWith(path.join(root, "public"))) return send(res, 403, "Prohibido");
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      if (!fs.existsSync(file)) return send(res, 404, "No encontrado");
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      console.error(e);
      send(res, 500, "Error interno");
    }
  })
  .listen(PORT, () => {
    console.log(`App en http://localhost:${PORT}  ·  Gemini: ${process.env.GEMINI_API_KEY ? "con API key" : "MODO DEMO (sin key)"}`);
  });

async function runApi(url, req, res) {
  const name = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  const file = path.join(root, "api", `${name}.js`);
  if (!/^[a-z0-9_-]+$/i.test(name) || !fs.existsSync(file)) return send(res, 404, "API no encontrada");
  const mod = await import(pathToFileURL(file).href + `?t=${fs.statSync(file).mtimeMs}`);

  let raw = "";
  for await (const chunk of req) raw += chunk;
  req.body = raw ? safeParse(raw) : {};
  req.query = Object.fromEntries(url.searchParams);

  // Adaptador estilo Vercel/Express
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (obj) => {
    if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (b) => (res.end(typeof b === "string" ? b : JSON.stringify(b)), res);
  await mod.default(req, res);
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
function send(res, code, msg) {
  res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(msg);
}
