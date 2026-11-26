// Interfaz de la app. Toda la "inteligencia" pasa por /api/gemini.
const $ = (s) => document.querySelector(s);
const state = {
  config: null,
  task: null,
  image: null, // { mimeType, data, url }
  history: [],
  lastResult: null,
  prefs: loadPrefs(),
};

const ICONS = { paso: "👣", alerta: "⚠️", dato: "ℹ️", recurso: "📍" };
const NIVEL = { info: "Información", atencion: "Pon atención", urgente: "Urgente" };

init();

async function init() {
  applyPrefs();
  bindA11y();
  try {
    const res = await fetch("/api/config");
    state.config = await res.json();
  } catch {
    showError("No se pudo cargar la app. Revisa tu conexión.");
    return;
  }
  const { ui, tasks, geminiReady } = state.config;
  document.title = ui.name;
  $("#app-name").textContent = ui.name;
  $("#app-tagline").textContent = ui.tagline;
  $("#ods").textContent = ui.ods.join(" · ");
  $("#disclaimer").textContent = ui.disclaimer;
  $("#team").textContent = `${ui.team} · ${ui.campus}`;
  if (ui.primaryColor) document.documentElement.style.setProperty("--brand", ui.primaryColor);
  $("#demo-banner").hidden = geminiReady;

  renderTasks(tasks);
  selectTask(tasks[0].id);
  bindForm();
  bindVoice();
  bindImage();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

/* ---------- Funciones (tareas) ---------- */
function renderTasks(tasks) {
  const box = $("#tasks");
  box.innerHTML = "";
  for (const t of tasks) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "task";
    b.setAttribute("role", "radio");
    b.dataset.id = t.id;
    b.innerHTML = `<span class="ico" aria-hidden="true">${t.icon}</span><strong></strong><span class="d"></span>`;
    b.querySelector("strong").textContent = t.title;
    b.querySelector(".d").textContent = t.description;
    b.addEventListener("click", () => selectTask(t.id));
    box.appendChild(b);
  }
}

function selectTask(id) {
  const t = state.config.tasks.find((x) => x.id === id);
  state.task = t;
  state.history = [];
  document.querySelectorAll(".task").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === id)));
  $("#task-desc").textContent = t.description;
  $("#prompt").placeholder = t.placeholder || "";
  $("#image-zone").hidden = !t.acceptsImage;
  if (!t.acceptsImage) clearImage();
  const ex = $("#examples");
  ex.innerHTML = "";
  for (const e of t.examples || []) {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "chip";
    c.textContent = e;
    c.addEventListener("click", () => {
      $("#prompt").value = e;
      $("#prompt").focus();
    });
    ex.appendChild(c);
  }
}

/* ---------- Envío ---------- */
function bindForm() {
  $("#ask").addEventListener("submit", (e) => {
    e.preventDefault();
    state.history = [];
    ask($("#prompt").value.trim(), state.image ? [state.image] : []);
  });
  $("#followup").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#follow-prompt").value.trim();
    if (!q) return;
    $("#follow-prompt").value = "";
    ask(q, []);
  });
}

async function ask(prompt, images) {
  if (!prompt && images.length === 0) {
    showError("Escribe, dicta o sube una imagen para empezar.");
    return;
  }
  setLoading(true);
  try {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: state.task.id,
        prompt,
        images: images.map(({ mimeType, data }) => ({ mimeType, data })),
        history: state.history,
        easyRead: state.prefs.easy,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || "Algo salió mal. Intenta de nuevo.");
    $("#demo-banner").hidden = !data.demo;
    state.history.push({ role: "user", text: prompt || "(imagen)" });
    state.history.push({ role: "model", text: JSON.stringify(data.result) });
    renderResult(data.result, data.model);
  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  $("#send").disabled = on;
  $("#send").textContent = on ? "Pensando…" : "Preguntar a Gemini";
  const r = $("#result");
  r.setAttribute("aria-busy", String(on));
  if (on) r.innerHTML = `<div class="loading"><div class="spinner" aria-hidden="true"></div><span>Gemini está analizando…</span></div>`;
}

/* ---------- Resultado ---------- */
function renderResult(r, model) {
  state.lastResult = r;
  const el = $("#result");
  el.innerHTML = "";

  const head = document.createElement("div");
  head.className = `res-head ${r.nivel || "info"}`;
  head.innerHTML = `<span class="badge"></span><h2></h2><p></p>`;
  head.querySelector(".badge").textContent = NIVEL[r.nivel] || NIVEL.info;
  head.querySelector("h2").textContent = r.titulo || "Respuesta";
  head.querySelector("p").textContent = r.resumen || "";
  el.appendChild(head);

  if (r.puntos?.length) {
    const ul = document.createElement("ul");
    ul.className = "points";
    for (const p of r.puntos) {
      const li = document.createElement("li");
      li.className = `point ${p.tipo}`;
      li.innerHTML = `<span class="pi" aria-hidden="true"></span><div><h3></h3><p></p></div>`;
      li.querySelector(".pi").textContent = ICONS[p.tipo] || "•";
      li.querySelector("h3").textContent = p.titulo;
      li.querySelector("p").textContent = p.detalle;
      ul.appendChild(li);
    }
    el.appendChild(ul);
  }

  if (r.siguiente_accion) {
    const n = document.createElement("div");
    n.className = "next";
    n.textContent = `👉 ${r.siguiente_accion}`;
    el.appendChild(n);
  }

  const acts = document.createElement("div");
  acts.className = "res-actions";
  acts.append(
    button("🔊 Escuchar", () => speak(r.voz || r.resumen)),
    button("⏹ Detener", () => speechSynthesis?.cancel()),
    button("📋 Copiar", () => navigator.clipboard?.writeText(toPlain(r))),
  );
  if (navigator.share) acts.append(button("📤 Compartir", () => navigator.share({ title: r.titulo, text: toPlain(r) }).catch(() => {})));
  el.appendChild(acts);

  const m = document.createElement("p");
  m.className = "model";
  m.textContent = `Respuesta generada por Gemini (${model})`;
  el.appendChild(m);

  $("#followup").hidden = false;
  el.focus();
  if (state.prefs.autoread) speak(r.voz || r.resumen);
}

function button(label, fn) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "secondary";
  b.textContent = label;
  b.addEventListener("click", fn);
  return b;
}

function toPlain(r) {
  const pts = (r.puntos || []).map((p) => `- ${p.titulo}: ${p.detalle}`).join("\n");
  return `${r.titulo}\n${r.resumen}\n${pts}\n${r.siguiente_accion ? "Siguiente: " + r.siguiente_accion : ""}`.trim();
}

function showError(msg) {
  const el = $("#result");
  el.innerHTML = "";
  const d = document.createElement("div");
  d.className = "error";
  d.setAttribute("role", "alert");
  d.textContent = msg;
  el.appendChild(d);
}

/* ---------- Voz ---------- */
function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-MX";
  const v = speechSynthesis.getVoices().find((v) => v.lang?.startsWith("es"));
  if (v) u.voice = v;
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

function bindVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $("#mic");
  if (!SR) {
    mic.hidden = true;
    return;
  }
  let rec = null;
  mic.addEventListener("click", () => {
    if (rec) {
      rec.stop();
      return;
    }
    rec = new SR();
    rec.lang = "es-MX";
    rec.interimResults = true;
    const base = $("#prompt").value ? $("#prompt").value + " " : "";
    rec.onresult = (e) => {
      $("#prompt").value = base + Array.from(e.results).map((r) => r[0].transcript).join("");
    };
    rec.onend = () => {
      rec = null;
      mic.setAttribute("aria-pressed", "false");
      mic.textContent = "🎤 Dictar";
    };
    rec.onerror = rec.onend;
    rec.start();
    mic.setAttribute("aria-pressed", "true");
    mic.textContent = "⏹ Escuchando… toca para parar";
  });
}

/* ---------- Imagen ---------- */
function bindImage() {
  $("#camera").addEventListener("click", () => $("#file").click());
  $("#file").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      state.image = await compressImage(f);
      $("#preview-img").src = state.image.url;
      $("#preview").hidden = false;
    } catch {
      showError("No se pudo leer la imagen. Intenta con otra.");
    }
    e.target.value = "";
  });
  $("#remove-img").addEventListener("click", clearImage);
}

function clearImage() {
  state.image = null;
  $("#preview").hidden = true;
}

// Reduce la foto a máx. 1280 px en JPEG para que viaje rápido y quepa en el límite del servidor.
function compressImage(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", 0.82);
      URL.revokeObjectURL(img.src);
      resolve({ mimeType: "image/jpeg", data: url.split(",")[1], url });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/* ---------- Preferencias de accesibilidad ---------- */
function loadPrefs() {
  try {
    return { scale: 1, contrast: false, easy: false, autoread: false, ...JSON.parse(localStorage.getItem("a11y") || "{}") };
  } catch {
    return { scale: 1, contrast: false, easy: false, autoread: false };
  }
}
function savePrefs() {
  try {
    localStorage.setItem("a11y", JSON.stringify(state.prefs));
  } catch {}
}
function applyPrefs() {
  const p = state.prefs;
  document.documentElement.style.setProperty("--scale", p.scale);
  document.documentElement.classList.toggle("contrast", p.contrast);
  $("#contrast").setAttribute("aria-pressed", String(p.contrast));
  $("#easy").setAttribute("aria-pressed", String(p.easy));
  $("#autoread").setAttribute("aria-pressed", String(p.autoread));
}
function bindA11y() {
  const upd = (fn) => () => {
    fn(state.prefs);
    applyPrefs();
    savePrefs();
  };
  $("#font-up").addEventListener("click", upd((p) => (p.scale = Math.min(1.6, +(p.scale + 0.1).toFixed(2)))));
  $("#font-down").addEventListener("click", upd((p) => (p.scale = Math.max(0.8, +(p.scale - 0.1).toFixed(2)))));
  $("#contrast").addEventListener("click", upd((p) => (p.contrast = !p.contrast)));
  $("#easy").addEventListener("click", upd((p) => (p.easy = !p.easy)));
  $("#autoread").addEventListener("click", upd((p) => (p.autoread = !p.autoread)));
}
