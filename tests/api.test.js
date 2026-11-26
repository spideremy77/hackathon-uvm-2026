// Pruebas unitarias de la API (sin red): se simula la respuesta de Gemini.
//   npm test
import test from "node:test";
import assert from "node:assert/strict";
import { APP, publicConfig } from "../lib/config.js";

process.env.GEMINI_API_KEY = "AQ.prueba";
const { default: handler } = await import("../api/gemini.js");
const { generate } = await import("../lib/gemini.js");

// Respuesta simulada tipo Gemini con el JSON que se le pasa.
const geminiOk = (obj) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });

// Ejecuta el handler como lo haría Vercel.
async function call(body) {
  let status = 200;
  let payload;
  const res = {
    status(c) {
      status = c;
      return this;
    },
    json(o) {
      payload = o;
      return this;
    },
  };
  await handler({ method: "POST", body }, res);
  return { status, payload };
}

test("la configuración pública no expone prompts ni esquemas", () => {
  const txt = JSON.stringify(publicConfig());
  assert.ok(!txt.includes("FUNCIÓN:"), "no debe incluir prompts");
  assert.deepEqual(publicConfig().tasks.sort(), ["aclarar", "evaluar", "recomendar", "reportar"]);
});

test("cada función tiene prompt y esquema JSON con campo de voz", () => {
  for (const [id, t] of Object.entries(APP.tasks)) {
    assert.ok(t.system.length > 50, `${id}: prompt`);
    assert.equal(t.schema.type, "OBJECT", `${id}: esquema`);
    assert.ok(t.schema.required.includes("voz"), `${id}: debe pedir versión para voz`);
  }
});

test("evaluar: envía perfil, imagen y esquema a Gemini y regresa el JSON", async () => {
  let sent;
  globalThis.fetch = async (url, opts) => {
    sent = JSON.parse(opts.body);
    return geminiOk({ titulo: "Entrada", semaforo_general: "rojo", resumen: "r", perfiles: [], barreras: [], recomendaciones: [], voz: "v" });
  };
  const { status, payload } = await call({
    task: "evaluar",
    prompt: "¿Puedo entrar?",
    perfil: "silla",
    images: [{ mimeType: "image/jpeg", data: "AAAA" }],
  });
  assert.equal(status, 200);
  assert.equal(payload.result.semaforo_general, "rojo");
  assert.match(sent.systemInstruction.parts[0].text, /silla de ruedas/);
  assert.equal(sent.generationConfig.responseMimeType, "application/json");
  assert.ok(sent.contents.at(-1).parts.some((p) => p.inlineData?.mimeType === "image/jpeg"));
});

test("reportar: agrega la ubicación al mensaje", async () => {
  let sent;
  globalThis.fetch = async (url, opts) => {
    sent = JSON.parse(opts.body);
    return geminiOk({ titulo: "t" });
  };
  await call({ task: "reportar", prompt: "Rampa bloqueada", ubicacion: "Insurgentes y Puebla" });
  const texto = sent.contents.at(-1).parts.at(-1).text;
  assert.match(texto, /Insurgentes y Puebla/);
});

test("recomendar: manda solo los campos necesarios de los puntos del mapa", async () => {
  let sent;
  globalThis.fetch = async (url, opts) => {
    sent = JSON.parse(opts.body);
    return geminiOk({ resumen: "r", recomendados: [{ id: "ej1", razon: "x" }], evitar: [], consejos: [], voz: "v" });
  };
  const { payload } = await call({
    task: "recomendar",
    prompt: "metro sin escalones",
    puntos: [{ id: "ej1", titulo: "Rampa", semaforo: "verde", tipo: "Rampa", notas: "ok", secreto: "no enviar" }],
  });
  assert.equal(payload.result.recomendados[0].id, "ej1");
  const texto = sent.contents.at(-1).parts.at(-1).text;
  assert.match(texto, /"id":"ej1"/);
  assert.ok(!texto.includes("no enviar"));
});

test("rechaza peticiones vacías y funciones desconocidas", async () => {
  assert.equal((await call({ task: "evaluar", prompt: "" })).status, 400);
  assert.equal((await call({ task: "hackear", prompt: "x" })).status, 400);
});

test("si Gemini está saturado (429) responde un mensaje claro", async () => {
  globalThis.fetch = async () => new Response("busy", { status: 429 });
  const { status, payload } = await call({ task: "aclarar", prompt: "aviso" });
  assert.equal(status, 429);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /saturado/);
});

test("reintenta con ?key= si la API key nueva (AQ.) es rechazada en el header", async () => {
  const modos = [];
  globalThis.fetch = async (url, opts) => {
    const header = Boolean(opts.headers["x-goog-api-key"]);
    modos.push(header ? "header" : "query");
    return header ? new Response("no", { status: 401 }) : geminiOk({ ok: true });
  };
  const out = await generate({ system: "s", prompt: "p", schema: { type: "OBJECT" } });
  assert.deepEqual(out.json, { ok: true });
  assert.deepEqual(modos.slice(0, 2), ["header", "query"]);
});

test("si un modelo no existe (404) prueba el siguiente", async () => {
  const modelos = [];
  globalThis.fetch = async (url) => {
    modelos.push(url.split("/models/")[1].split(":")[0]);
    return modelos.length === 1 ? new Response("nf", { status: 404 }) : geminiOk({ ok: true });
  };
  await generate({ system: "s", prompt: "p", schema: { type: "OBJECT" } });
  assert.equal(modelos.length, 2);
  assert.notEqual(modelos[0], modelos[1]);
});
