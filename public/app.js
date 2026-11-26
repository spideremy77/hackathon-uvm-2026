// Rampa · interfaz. Toda la inteligencia pasa por /api/gemini.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

const SEM = { verde: "Accesible", amarillo: "Con precaución", rojo: "No accesible" };
const SEM_ICON = { verde: "✓", amarillo: "!", rojo: "✕" };
const TIPO = {
  banqueta: "Banqueta", rampa: "Rampa", cruce_peatonal: "Cruce peatonal", transporte_publico: "Transporte público",
  elevador: "Elevador", senalizacion: "Señalización", iluminacion: "Iluminación", obstruccion: "Obstrucción",
  entrada_edificio: "Entrada a edificio", bano: "Baño", otro: "Otro", lugar: "Lugar evaluado",
};
const GRAV = { baja: "Gravedad baja", media: "Gravedad media", alta: "Gravedad alta", critica: "Gravedad crítica" };
const CENTRO = [19.4369, -99.1603]; // zona San Rafael / Reforma, CDMX

const state = {
  config: null,
  perfilLabels: {},
  images: { evaluar: null, reportar: null, aclarar: null },
  coords: null,
  prefs: loadPrefs(),
  puntos: loadPuntos(),
  map: null,
  layer: null,
  markers: {},
  rec: { recomendados: [], evitar: [] },
};

init();

async function init() {
  applyPrefs();
  bindA11y();
  try {
    state.config = await (await fetch("/api/config")).json();
  } catch {
    $("#out-evaluar").innerHTML = `<div class="error" role="alert">No se pudo cargar la app. Revisa tu conexión.</div>`;
    return;
  }
  const { ui, geminiReady } = state.config;
  $("#ods").textContent = ui.ods.join(" · ");
  $("#disclaimer").textContent = ui.disclaimer;
  $("#team").textContent = `${ui.team} · ${ui.campus}`;
  $("#demo-banner").hidden = geminiReady;
  ui.perfiles.forEach((p) => (state.perfilLabels[p.id] = `${p.icon} ${p.label}`));

  renderPerfiles();
  bindTabs();
  bindPhotos();
  bindMics();
  bindForms();
  showView(location.hash.replace("#", "") || "evaluar");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

/* ======================= Perfil ======================= */
function renderPerfiles() {
  const box = $("#perfiles");
  box.innerHTML = "";
  for (const p of state.config.ui.perfiles) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "perfil";
    b.setAttribute("role", "radio");
    b.dataset.id = p.id;
    b.textContent = `${p.icon} ${p.label}`;
    b.addEventListener("click", () => {
      state.prefs.perfil = state.prefs.perfil === p.id ? null : p.id;
      savePrefs();
      updatePerfil();
      refreshMap();
    });
    box.appendChild(b);
  }
  updatePerfil();
}
function updatePerfil() {
  $$(".perfil").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === state.prefs.perfil)));
  $(".perfil-bar").classList.toggle("pide", !state.prefs.perfil);
}

/* ======================= Navegación ======================= */
function bindTabs() {
  $$(".tabs button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
  window.addEventListener("hashchange", () => showView(location.hash.replace("#", "")));
}
function showView(id) {
  if (!["evaluar", "reportar", "mapa", "aclarar"].includes(id)) id = "evaluar";
  $$(".view").forEach((v) => (v.hidden = v.id !== `view-${id}`));
  $$(".tabs button").forEach((b) => (b.dataset.view === id ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
  if (id === "mapa") ensureMap();
  window.scrollTo({ top: 0 });
}

/* ======================= Llamada a Gemini ======================= */
async function callGemini(task, { prompt = "", image = null, extra = {} } = {}, outEl, btn) {
  const label = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Gemini está analizando…";
  }
  outEl.setAttribute("aria-busy", "true");
  outEl.innerHTML = `<div class="loading"><div class="spinner" aria-hidden="true"></div><span>Gemini está analizando…</span></div>`;
  try {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task,
        prompt,
        images: image ? [{ mimeType: image.mimeType, data: image.data }] : [],
        perfil: state.prefs.perfil,
        easyRead: state.prefs.easy,
        ...extra,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      console.error("Error de /api/gemini", res.status, data);
      throw new Error(data.error || `Algo salió mal (error ${res.status}). Intenta de nuevo.`);
    }
    $("#demo-banner").hidden = !data.demo;
    outEl.innerHTML = "";
    return data;
  } catch (err) {
    outEl.innerHTML = "";
    const d = el("div", "error", err.message);
    d.setAttribute("role", "alert");
    outEl.appendChild(d);
    return null;
  } finally {
    outEl.setAttribute("aria-busy", "false");
    if (btn) {
      btn.disabled = false;
      btn.textContent = label;
    }
  }
}

function bindForms() {
  $("#form-evaluar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = $("#ev-text").value.trim();
    const image = state.images.evaluar;
    if (!image && !prompt) return needInput("#out-evaluar", "Toma una foto del lugar para evaluarlo.");
    const data = await callGemini("evaluar", { prompt, image }, $("#out-evaluar"), e.submitter);
    if (data) renderEvaluar(data.result, data.model, image);
  });

  $("#form-reportar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = $("#rep-text").value.trim();
    const lugar = $("#rep-lugar").value.trim();
    const image = state.images.reportar;
    if (!image && !prompt) return needInput("#out-reportar", "Toma una foto o cuéntame qué pasa.");
    const ubicacion = [lugar, state.coords ? `coordenadas ${state.coords.lat.toFixed(5)}, ${state.coords.lng.toFixed(5)}` : ""].filter(Boolean).join(" · ");
    const data = await callGemini("reportar", { prompt, image, extra: { ubicacion } }, $("#out-reportar"), e.submitter);
    if (data) renderReporte(data.result, data.model, lugar);
  });
  $("#geo-btn").addEventListener("click", () => getLocation(true));

  $("#form-recomendar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = $("#rec-text").value.trim();
    const puntos = state.puntos.map((p) => ({ id: p.id, titulo: p.titulo, tipo: TIPO[p.tipo] || p.tipo, semaforo: colorPara(p), notas: p.notas }));
    const data = await callGemini("recomendar", { prompt, extra: { puntos } }, $("#out-recomendar"), e.submitter);
    if (data) renderRecomendar(data.result, data.model);
  });

  $("#form-aclarar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = $("#acl-text").value.trim();
    const image = state.images.aclarar;
    if (!image && !prompt) return needInput("#out-aclarar", "Toma una foto del aviso o pega su texto.");
    const data = await callGemini("aclarar", { prompt, image }, $("#out-aclarar"), e.submitter);
    if (data) renderAclarar(data.result, data.model);
  });
}

function needInput(sel, msg) {
  const out = $(sel);
  out.innerHTML = "";
  const d = el("div", "error", msg);
  d.setAttribute("role", "alert");
  out.appendChild(d);
}

/* ======================= Render: Evaluar ======================= */
function renderEvaluar(r, model, image) {
  const out = $("#out-evaluar");
  const mio = r.perfiles?.find((p) => p.perfil === state.prefs.perfil);
  const color = mio?.semaforo || r.semaforo_general;
  out.appendChild(semaforoCard(color, r.titulo, r.resumen, mio ? `Para ti (${state.perfilLabels[mio.perfil]})` : "En general"));

  if (r.perfiles?.length) {
    const box = el("div", "box");
    box.appendChild(el("h3", "", "Según cada perfil"));
    const ul = el("ul", "perfil-list");
    const orden = [...r.perfiles].sort((a, b) => (b.perfil === state.prefs.perfil) - (a.perfil === state.prefs.perfil));
    for (const p of orden) {
      const li = el("li", p.perfil === state.prefs.perfil ? "mio" : "");
      li.append(dot(p.semaforo));
      const d = el("div");
      d.append(el("strong", "", `${state.perfilLabels[p.perfil] || p.perfil}: ${SEM[p.semaforo] || p.semaforo}`), el("div", "muted", p.razon));
      li.append(d);
      ul.appendChild(li);
    }
    box.appendChild(ul);
    out.appendChild(box);
  }
  if (r.barreras?.length) out.appendChild(listBox("⚠️ Barreras detectadas", r.barreras.map((b) => `${b.titulo}: ${b.detalle}`)));
  if (r.recomendaciones?.length) out.appendChild(listBox("👉 Recomendaciones", r.recomendaciones));

  const saved = el("p", "ok-msg");
  saved.setAttribute("role", "status");
  const extra = [
    button("📍 Guardar en el mapa", async (b) => {
      b.disabled = true;
      const c = await getLocation(false);
      addPunto({
        titulo: r.titulo,
        tipo: "lugar",
        semaforo: r.semaforo_general,
        perfiles: Object.fromEntries((r.perfiles || []).map((x) => [x.perfil, x.semaforo])),
        notas: r.resumen,
        coords: c,
        fuente: "evaluacion",
      });
      saved.textContent = c.aprox ? "Guardado con ubicación aproximada: en el mapa puedes arrastrar el punto." : "Guardado en el mapa ✓";
    }),
  ];
  if (r.barreras?.length) {
    extra.push(
      button("📢 Reportar esta barrera", () => {
        state.images.reportar = image;
        setPreview("reportar", image);
        $("#rep-text").value = `${r.titulo}. ${r.barreras.map((b) => b.titulo).join(", ")}.`;
        showView("reportar");
        $("#rep-text").focus();
      })
    );
  }
  out.appendChild(actions(r.voz || r.resumen, extra));
  out.appendChild(saved);
  out.appendChild(modelTag(model));
  finish(out, r.voz || r.resumen);
}

/* ======================= Render: Reporte ======================= */
function renderReporte(r, model, lugar) {
  const out = $("#out-reportar");
  out.appendChild(semaforoCard(r.semaforo, r.titulo, r.resumen_claro, TIPO[r.tipo_barrera] || r.tipo_barrera));

  const tags = el("div", "tags");
  tags.append(el("span", `tag ${r.gravedad}`, GRAV[r.gravedad] || r.gravedad));
  (r.afecta || []).forEach((a) => tags.append(el("span", "tag", `Afecta: ${state.perfilLabels[a] || a}`)));
  out.appendChild(tags);

  const aut = el("div", "box");
  aut.append(el("h3", "", "🏛️ ¿A quién enviarlo?"), el("strong", "", r.autoridad_sugerida), el("div", "muted", r.por_que_autoridad));
  out.appendChild(aut);

  const rep = el("div", "box");
  rep.append(el("h3", "", "📝 Reporte listo para enviar"), el("pre", "reporte-txt", r.reporte_formal));
  const txt = r.reporte_formal;
  const row = el("div", "res-actions");
  row.append(
    button("📋 Copiar", (b) => copy(txt, b)),
    button("💬 WhatsApp", () => window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank", "noopener")),
    button("✉️ Correo", () => (location.href = `mailto:?subject=${encodeURIComponent("Reporte de accesibilidad: " + r.titulo)}&body=${encodeURIComponent(txt)}`))
  );
  if (navigator.share) row.append(button("📤 Compartir", () => navigator.share({ title: r.titulo, text: txt }).catch(() => {})));
  rep.append(row);
  out.appendChild(rep);

  if (r.mientras_tanto) out.appendChild(listBox("🛟 Mientras tanto", [r.mientras_tanto]));

  const saved = el("p", "ok-msg", "Guardando en el mapa…");
  saved.setAttribute("role", "status");
  out.appendChild(actions(r.voz || r.resumen_claro, [button("🗺️ Ver en el mapa", () => showView("mapa"))]));
  out.appendChild(saved);
  out.appendChild(modelTag(model));
  finish(out, r.voz || r.resumen_claro);

  getLocation(false).then((c) => {
    addPunto({
      titulo: r.titulo,
      tipo: r.tipo_barrera,
      semaforo: r.semaforo,
      afecta: r.afecta || [],
      gravedad: r.gravedad,
      notas: `${r.resumen_claro}${lugar ? " · " + lugar : ""}`,
      coords: c,
      fuente: "reporte",
    });
    saved.textContent = c.aprox ? "Guardado en el mapa con ubicación aproximada: puedes arrastrar el punto." : "Guardado en el mapa ✓";
  });
}

/* ======================= Render: Recomendar ======================= */
function renderRecomendar(r, model) {
  const out = $("#out-recomendar");
  const byId = Object.fromEntries(state.puntos.map((p) => [String(p.id), p]));
  state.rec = { recomendados: (r.recomendados || []).map((x) => String(x.id)), evitar: (r.evitar || []).map((x) => String(x.id)) };

  const head = el("div", "res-head info");
  head.append(el("h2", "", "Recomendaciones para ti"), el("p", "", r.resumen));
  out.appendChild(head);
  const mk = (title, items, cls) => {
    const valid = items.filter((x) => byId[String(x.id)]);
    if (!valid.length) return;
    const box = el("div", "box");
    box.append(el("h3", "", title));
    const ul = el("ul", "lista");
    valid.forEach((x) => {
      const p = byId[String(x.id)];
      const li = el("li", cls);
      const b = el("button");
      b.type = "button";
      b.append(dot(colorPara(p)));
      const d = el("div");
      d.append(el("strong", "", p.titulo), el("small", "", x.razon));
      b.append(d);
      b.addEventListener("click", () => focusPunto(p.id));
      li.append(b);
      ul.append(li);
    });
    box.append(ul);
    out.appendChild(box);
  };
  mk("✅ Te conviene", r.recomendados || [], "rec");
  mk("⛔ Mejor evita", r.evitar || [], "evita");
  if (r.consejos?.length) out.appendChild(listBox("👉 Consejos", r.consejos));
  out.appendChild(actions(r.voz || r.resumen, []));
  out.appendChild(modelTag(model));
  refreshMap();
  finish(out, r.voz || r.resumen);
}

/* ======================= Render: Aclarar ======================= */
const PUNTO_ICON = { paso: "👣", alerta: "⚠️", dato: "ℹ️", accesibilidad: "♿" };
const NIVEL = { info: "Información", atencion: "Pon atención", urgente: "Urgente" };
function renderAclarar(r, model) {
  const out = $("#out-aclarar");
  const head = el("div", `res-head ${r.nivel || "info"}`);
  head.append(el("span", "badge", NIVEL[r.nivel] || NIVEL.info), el("h2", "", r.titulo), el("p", "", r.resumen));
  out.appendChild(head);
  if (r.puntos?.length) {
    const ul = el("ul", "points");
    for (const p of r.puntos) {
      const li = el("li", `point ${p.tipo}`);
      li.append(el("span", "pi", PUNTO_ICON[p.tipo] || "•"));
      const d = el("div");
      d.append(el("h3", "", p.titulo), el("p", "", p.detalle));
      li.append(d);
      ul.append(li);
    }
    out.appendChild(ul);
  }
  if (r.siguiente_accion) out.appendChild(el("div", "next", `👉 ${r.siguiente_accion}`));
  out.appendChild(actions(r.voz || r.resumen, []));
  out.appendChild(modelTag(model));
  finish(out, r.voz || r.resumen);
}

/* ======================= Piezas de UI ======================= */
function el(tag, cls = "", text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}
function dot(color) {
  const d = el("span", `dot ${color || ""}`);
  d.setAttribute("aria-hidden", "true");
  return d;
}
function semaforoCard(color, titulo, resumen, etiqueta) {
  const c = el("div", `semaforo ${color}`);
  const luz = el("div", `luz ${color}`, SEM_ICON[color] || "?");
  luz.setAttribute("aria-hidden", "true");
  const d = el("div");
  d.append(el("div", "sem-label", `${SEM[color] || ""} · ${etiqueta || ""}`), el("h2", "", titulo), el("p", "", resumen));
  c.append(luz, d);
  return c;
}
function listBox(title, items) {
  const box = el("div", "box");
  box.append(el("h3", "", title));
  const ul = el("ul");
  items.forEach((t) => ul.append(el("li", "", t)));
  box.append(ul);
  return box;
}
function button(label, fn) {
  const b = el("button", "secondary", label);
  b.type = "button";
  b.addEventListener("click", () => fn(b));
  return b;
}
function actions(voz, extra) {
  const row = el("div", "res-actions");
  const stop = button("⏹", () => window.speechSynthesis?.cancel());
  stop.setAttribute("aria-label", "Detener lectura");
  row.append(button("🔊 Escuchar", () => speak(voz)), stop, ...extra);
  return row;
}
function modelTag(model) {
  return el("p", "model", `Analizado por Gemini (${model})`);
}
function finish(out, voz) {
  out.focus({ preventScroll: true });
  out.scrollIntoView({ behavior: "smooth", block: "start" });
  if (state.prefs.autoread) speak(voz);
}
async function copy(text, b) {
  try {
    await navigator.clipboard.writeText(text);
    b.textContent = "✓ Copiado";
  } catch {
    b.textContent = "No se pudo copiar";
  }
}

/* ======================= Fotos ======================= */
function bindPhotos() {
  $$(".photo-zone").forEach((z) => {
    const key = z.dataset.for;
    const input = $("input", z);
    $(".photo-btn", z).addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        state.images[key] = await compressImage(f);
        setPreview(key, state.images[key]);
      } catch {
        alert("No se pudo leer la imagen. Intenta con otra.");
      }
      input.value = "";
    });
    $(".remove", z).addEventListener("click", () => {
      state.images[key] = null;
      setPreview(key, null);
    });
  });
}
function setPreview(key, img) {
  const z = $(`.photo-zone[data-for="${key}"]`);
  $(".preview", z).hidden = !img;
  if (img) $(".preview img", z).src = img.url;
}
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

/* ======================= Voz ======================= */
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
function bindMics() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  $$(".mic").forEach((mic) => {
    if (!SR) {
      mic.hidden = true;
      return;
    }
    let rec = null;
    mic.addEventListener("click", () => {
      if (rec) return rec.stop();
      const target = document.getElementById(mic.dataset.target);
      const base = target.value ? target.value + " " : "";
      rec = new SR();
      rec.lang = "es-MX";
      rec.interimResults = true;
      rec.onresult = (e) => (target.value = base + Array.from(e.results).map((r) => r[0].transcript).join(""));
      rec.onend = rec.onerror = () => {
        rec = null;
        mic.textContent = "🎤";
        mic.setAttribute("aria-label", "Dictar");
      };
      rec.start();
      mic.textContent = "⏹";
      mic.setAttribute("aria-label", "Detener dictado");
    });
  });
}

/* ======================= Ubicación ======================= */
function getLocation(showStatus) {
  const st = $("#geo-status");
  return new Promise((resolve) => {
    const fallback = () => {
      const c = state.map ? state.map.getCenter() : { lat: CENTRO[0], lng: CENTRO[1] };
      resolve({ lat: c.lat + (Math.random() - 0.5) * 0.002, lng: c.lng + (Math.random() - 0.5) * 0.002, aprox: true });
    };
    if (state.coords) return resolve(state.coords);
    if (!navigator.geolocation) {
      if (showStatus) st.textContent = "Tu navegador no comparte ubicación. Escribe la calle.";
      return fallback();
    }
    if (showStatus) st.textContent = "Buscando tu ubicación…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (showStatus) st.textContent = `📍 Ubicación lista (±${Math.round(pos.coords.accuracy)} m).`;
        resolve(state.coords);
      },
      () => {
        if (showStatus) st.textContent = "No se pudo obtener tu ubicación. Escribe la calle; en el mapa podrás mover el punto.";
        fallback();
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

/* ======================= Puntos y mapa ======================= */
function loadPuntos() {
  try {
    const saved = JSON.parse(localStorage.getItem("rampa_puntos") || "null");
    if (Array.isArray(saved)) return saved;
  } catch {}
  return ejemplos();
}
function savePuntos() {
  try {
    localStorage.setItem("rampa_puntos", JSON.stringify(state.puntos));
  } catch {}
}
function addPunto({ coords, ...p }) {
  const punto = { id: `p${Date.now().toString(36)}`, lat: coords.lat, lng: coords.lng, fecha: new Date().toISOString(), ...p };
  state.puntos.unshift(punto);
  savePuntos();
  refreshMap();
  return punto;
}
// Color de un punto según el perfil de la persona.
function colorPara(p) {
  const perfil = state.prefs.perfil;
  if (!perfil) return p.semaforo;
  if (p.perfiles?.[perfil]) return p.perfiles[perfil];
  if (p.afecta) return p.afecta.includes(perfil) ? "rojo" : p.semaforo === "rojo" ? "amarillo" : p.semaforo;
  return p.semaforo;
}

function ensureMap() {
  if (state.map) {
    setTimeout(() => state.map.invalidateSize(), 50);
    return;
  }
  if (!window.L) {
    $("#map-msg").textContent = "No se pudo cargar el mapa (sin conexión). La lista de puntos sigue disponible.";
    renderLista();
    return;
  }
  state.map = L.map("map", { zoomControl: true }).setView(CENTRO, 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(state.map);
  state.layer = L.layerGroup().addTo(state.map);
  refreshMap();
  setTimeout(() => state.map.invalidateSize(), 100);
}

const HEX = { verde: "#1f7a4d", amarillo: "#b07a00", rojo: "#c0262d" };
function refreshMap() {
  renderLista();
  if (!state.map) return;
  state.layer.clearLayers();
  state.markers = {};
  for (const p of state.puntos) {
    const c = colorPara(p);
    const ring = state.rec.recomendados.includes(p.id) ? "#1f7a4d" : state.rec.evitar.includes(p.id) ? "#000" : "#fff";
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:26px;height:26px;border-radius:50%;background:${HEX[c] || "#666"};border:4px solid ${ring};box-shadow:0 1px 4px rgba(0,0,0,.4);color:#fff;font:700 13px/18px system-ui;text-align:center">${SEM_ICON[c] || ""}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    const m = L.marker([p.lat, p.lng], { icon, draggable: p.fuente !== "ejemplo", title: `${p.titulo}: ${SEM[c]}`, keyboard: true }).addTo(state.layer);
    m.bindPopup(popupHtml(p));
    m.on("dragend", () => {
      const ll = m.getLatLng();
      p.lat = ll.lat;
      p.lng = ll.lng;
      savePuntos();
    });
    state.markers[p.id] = m;
  }
}
function popupHtml(p) {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  const c = colorPara(p);
  const fuente = { ejemplo: "Dato de ejemplo", evaluacion: "Evaluado con Gemini", reporte: "Reporte ciudadano" }[p.fuente] || "";
  return `<strong>${esc(p.titulo)}</strong><br><span>${esc(SEM[c])} · ${esc(TIPO[p.tipo] || p.tipo)}</span><br><small>${esc(p.notas)}</small><br><small><em>${esc(fuente)}</em></small>`;
}
function renderLista() {
  const ul = $("#lista-puntos");
  if (!ul) return;
  ul.innerHTML = "";
  for (const p of state.puntos) {
    const li = el("li", state.rec.recomendados.includes(p.id) ? "rec" : state.rec.evitar.includes(p.id) ? "evita" : "");
    const b = el("button");
    b.type = "button";
    const c = colorPara(p);
    b.append(dot(c));
    const d = el("div");
    d.append(el("strong", "", p.titulo), el("small", "", `${SEM[c]} · ${TIPO[p.tipo] || p.tipo}${p.fuente === "ejemplo" ? " · ejemplo" : ""}`));
    b.append(d);
    b.addEventListener("click", () => focusPunto(p.id));
    li.append(b);
    ul.append(li);
  }
}
function focusPunto(id) {
  showView("mapa");
  setTimeout(() => {
    const m = state.markers[id];
    if (m) {
      state.map.setView(m.getLatLng(), 17);
      m.openPopup();
    }
  }, 150);
}

// Puntos de ejemplo para la demostración (marcados como "ejemplo").
function ejemplos() {
  const base = [
    [0.0012, -0.0015, "Rampa de esquina despejada", "rampa", "verde", { silla: "verde", andadera: "verde", vision: "amarillo", mayor: "verde", carriola: "verde" }, "Rampa amplia con pendiente suave; sin guía táctil."],
    [-0.0018, 0.0009, "Banqueta levantada por raíces", "banqueta", "rojo", { silla: "rojo", andadera: "rojo", vision: "amarillo", mayor: "rojo", carriola: "rojo" }, "Losas levantadas unos 10 cm en 20 metros de banqueta."],
    [0.0021, 0.0019, "Entrada con escalón y barandal", "entrada_edificio", "amarillo", { silla: "rojo", andadera: "amarillo", vision: "amarillo", mayor: "amarillo", carriola: "amarillo" }, "Un escalón de unos 15 cm con barandal de un lado."],
    [-0.0007, -0.0026, "Cruce con semáforo sonoro", "cruce_peatonal", "verde", { silla: "verde", andadera: "amarillo", vision: "verde", mayor: "amarillo", carriola: "verde" }, "Semáforo con señal sonora; el tiempo de cruce es corto."],
    [0.0004, 0.0031, "Parada de autobús sin rampa", "transporte_publico", "amarillo", { silla: "rojo", andadera: "amarillo", vision: "amarillo", mayor: "amarillo", carriola: "amarillo" }, "Andén alto sin rampa; techo y asiento disponibles."],
    [-0.0024, -0.0008, "Calle sin iluminación de noche", "iluminacion", "amarillo", { silla: "amarillo", andadera: "amarillo", vision: "rojo", mayor: "amarillo", carriola: "amarillo" }, "Dos luminarias apagadas en la cuadra."],
  ];
  return base.map(([dlat, dlng, titulo, tipo, semaforo, perfiles, notas], i) => ({
    id: `ej${i + 1}`,
    lat: CENTRO[0] + dlat,
    lng: CENTRO[1] + dlng,
    titulo,
    tipo,
    semaforo,
    perfiles,
    notas,
    fuente: "ejemplo",
  }));
}

/* ======================= Preferencias de accesibilidad ======================= */
function loadPrefs() {
  const def = { scale: 1, contrast: false, easy: false, autoread: false, perfil: null };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem("a11y") || "{}") };
  } catch {
    return def;
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
