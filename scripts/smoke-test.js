// Prueba rápida de que la app responde:  node scripts/smoke-test.js [url]
// Por defecto prueba http://localhost:3000 (corre antes: npm run dev)
const base = process.argv[2] || "http://localhost:3000";
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "✅" : "❌"} ${msg}`); if (!ok) fails++; };

const home = await fetch(base + "/");
check(home.ok, `Página principal (${home.status})`);

const cfg = await fetch(base + "/api/config").then((r) => r.json());
check(Array.isArray(cfg.tasks) && cfg.tasks.length > 0, `Config: ${cfg.tasks?.length} funciones · Gemini ${cfg.geminiReady ? "listo" : "SIN KEY (demo)"}`);
check(!JSON.stringify(cfg).includes("system"), "Los prompts NO se exponen al navegador");

const t0 = Date.now();
const r = await fetch(base + "/api/gemini", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ task: cfg.tasks[0].id, prompt: "Prueba: responde con un ejemplo breve." }),
});
const data = await r.json();
check(r.ok && data.ok && data.result?.titulo, `Gemini respondió en ${Date.now() - t0} ms (modelo: ${data.model}${data.demo ? ", DEMO" : ""})`);
if (!data.ok) console.log("   Detalle:", data.error, data.detail || "");

const bad = await fetch(base + "/api/gemini", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
check(bad.status === 400, "Rechaza peticiones vacías");

console.log(fails ? `\n${fails} prueba(s) fallaron` : "\nTodo bien 🚀");
process.exit(fails ? 1 : 0);
