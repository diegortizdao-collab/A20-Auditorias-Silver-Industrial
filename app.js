/* A.20 Auditorías internas · Silver Industrial — app (GitHub Pages) sobre Neon vía Worker
   Cada ítem se guarda por separado y, sin señal, queda en cola en el dispositivo hasta que vuelve la conexión. */
(function () {
"use strict";
const API = window.A20_API;
const NC_APP = "https://diegortizdao-collab.github.io/NC-Silver-Industrial/";
const AUDITOR = "Ortiz, Diego Alberto";
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const RES = [["C","Conforme"],["OM","OM"],["HA","HA"],["NC","NC"],["NA","N/A"]];
const FOLLOW = [["cerrado","Cerrado y eficaz"],["abierto","Abierto"],["no_eficaz","No eficaz"]];

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad = n => String(n).padStart(2, "0");
const hoy = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const hhmm = () => { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const isoDate = v => (v || "").slice(0, 10);
function fmt(v) { // ISO -> d/m/aa ; texto libre se deja igual
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? (+m[3]) + "/" + (+m[2]) + "/" + m[1].slice(2) : String(v);
}
const mesTxt = ym => { if (!ym) return ""; const [y, m] = ym.split("-"); return MESES[+m - 1] + " " + y; };
function mesYM(txt) { // "Septiembre 2026" -> 2026-09
  if (!txt) return "";
  const t = String(txt).toLowerCase().replace("setiembre", "septiembre");
  const i = MESES.findIndex(m => t.includes(m.toLowerCase())); const y = (t.match(/\d{4}/) || [])[0];
  return i >= 0 && y ? y + "-" + pad(i + 1) : "";
}
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

/* ---------- API + cola de cambios ---------- */
let CLAVE = lsGet("a20_clave", "");
let PEND = lsGet("a20_pend", {}); // key -> {method,path,body,aud}
const timers = {};
async function api(method, path, body) {
  const r = await fetch(API + path, {
    method, headers: { "Content-Type": "application/json", "X-Clave": CLAVE },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const e = new Error((j && j.error) || ("Error " + r.status)); e.status = r.status; throw e; }
  return j;
}
function syncBadge() {
  const n = Object.keys(PEND).length, d = $("#syncDot"), t = $("#syncTxt");
  if (!d) return;
  d.className = "dot " + (n ? "busy" : "ok");
  t.textContent = n ? n + (n === 1 ? " cambio sin enviar" : " cambios sin enviar") : "Todo guardado";
}
function itemMsg(key, txt, cls) { const e = document.getElementById("st-" + key); if (e) { e.textContent = txt; e.className = "svmsg " + (cls || ""); } }
function queue(key, method, path, body, merge) {
  const prev = PEND[key];
  PEND[key] = { method, path, body: merge && prev ? Object.assign({}, prev.body, body) : body, aud: CUR && CUR.aud.id };
  lsSet("a20_pend", PEND); syncBadge(); itemMsg(key, "Sin guardar", "pend");
  clearTimeout(timers[key]); timers[key] = setTimeout(() => send(key), 900);
}
async function send(key) {
  const p = PEND[key]; if (!p) return true;
  itemMsg(key, "Guardando…", "pend");
  try {
    await api(p.method, p.path, p.body);
    if (PEND[key] === p) { delete PEND[key]; lsSet("a20_pend", PEND); }
    itemMsg(key, "Guardado " + hhmm(), "ok"); syncBadge(); return true;
  } catch (e) {
    if (e.status === 401) { logout(); return false; }
    itemMsg(key, e.status ? e.message : "Sin conexión: queda en cola", "err"); syncBadge(); return false;
  }
}
async function flushAll() { for (const k of Object.keys(PEND)) await send(k); }
window.addEventListener("online", flushAll);
setInterval(() => { if (Object.keys(PEND).length) flushAll(); }, 15000);

/* ---------- estado ---------- */
let ANIO = lsGet("a20_anio", new Date().getFullYear());
let VIEW = "programa";
let CUR = null; // auditoría abierta
let MANUAL = []; // hallazgos agregados a mano antes de emitir

function overlayPend(A) { // lo pendiente en cola manda sobre lo traído del servidor
  for (const [k, p] of Object.entries(PEND)) {
    if (p.aud !== A.aud.id) continue;
    if (k.startsWith("f:")) Object.assign(A.aud, p.body);
    else if (k.startsWith("r:")) A.res[+k.split(":")[2]] = Object.assign({}, p.body);
    else if (k.startsWith("s:")) { const h = A.prev.find(x => x.id === +k.split(":")[2]); if (h) { h.seg_estado = p.body.estado; h.seg_evidencia = p.body.evidencia; } }
  }
}

/* ---------- redacción ---------- */
function findings(A) {
  const out = [];
  A.items.forEach(it => {
    const r = A.res[it.orden];
    if (r && ["OM", "HA", "NC"].includes(r.resultado))
      out.push({ tipo: r.resultado, texto: (r.redaccion || "").trim() || (it.pregunta + (r.evidencia ? ". " + r.evidencia.trim() : "")) });
  });
  A.prev.forEach(h => { if (h.seg_estado === "no_eficaz") out.push({ tipo: "NC", texto: "Hallazgo de auditoría " + h.anio + " no resuelto eficazmente: " + h.texto + (h.seg_evidencia ? " " + h.seg_evidencia.trim() : "") }); });
  MANUAL.forEach(m => { if (m.texto.trim()) out.push({ tipo: m.tipo, texto: m.texto.trim() }); });
  const o = { NC: 0, HA: 1, OM: 2 }; return out.sort((x, y) => o[x.tipo] - o[y.tipo]);
}
function hallazgosInforme(A) { // emitida: lo guardado; en curso: lo calculado
  return A.aud.estado === "emitida" && A.hall.length && !A.recalc ? A.hall.map(h => ({ tipo: h.tipo, texto: h.texto })) : findings(A);
}
function draft(A) {
  const a = A.aud, par = [];
  par.push("Se inicia la auditoría de " + String(a.alcance || "").toLowerCase() + " a las " + (a.hora_inicio || "__:__") + " hs del " + fmt(a.fecha_auditoria) + ".");
  A.items.forEach(it => {
    const r = A.res[it.orden]; if (!r || !r.resultado || r.resultado === "NA" || !(r.evidencia || "").trim()) return;
    let e = r.evidencia.trim(); if (!/[.!]$/.test(e)) e += ".";
    par.push(r.resultado === "C" ? e.replace(/\.$/, "") + ", resultando OK." : e);
  });
  const pv = A.prev.filter(h => h.seg_estado);
  if (pv.length) {
    par.push("Seguimiento de hallazgos de la auditoría anterior:");
    pv.forEach(h => par.push("- " + h.tipo + " (" + h.anio + ") " + h.texto + " → " + ({ cerrado: "Se verifica cerrado y eficaz", abierto: "Se verifica abierto", no_eficaz: "Se verifica no eficaz" }[h.seg_estado]) + (h.seg_evidencia ? ": " + h.seg_evidencia.trim() : "") + "."));
  }
  if (!findings(A).length) par.push("Proceso sin desvíos.");
  return par.join("\n\n");
}
function checks(A) {
  const a = A.aud, w = [];
  const ym = mesYM(a.fecha_programada), fa = isoDate(a.fecha_auditoria);
  const fp = /^\d{4}-\d{2}-\d{2}$/.test(a.fecha_pedido || "") ? a.fecha_pedido : "";
  if (fp && fa && fp > fa) w.push("La fecha del pedido es posterior a la fecha de auditoría.");
  if (fa && ym && fa.slice(0, 7) !== ym) w.push("La fecha de auditoría (" + fmt(fa) + ") no cae en el mes programado (" + a.fecha_programada + ").");
  if (!fa) w.push("Falta la fecha de auditoría.");
  const txt = [...Object.values(A.res).map(r => (r.evidencia || "") + " " + (r.redaccion || "")), ...A.prev.map(h => h.seg_evidencia || ""), a.resumen || ""].join(" ");
  const anio = +A.aud.anio, bad = new Set();
  (txt.match(/\b\d{1,2}\/\d{1,2}\/(\d{2,4})\b/g) || []).forEach(d => { const y = d.split("/")[2]; const yy = +(y.length === 2 ? "20" + y : y); if (yy < anio - 1 || yy > anio) bad.add(d); });
  if (bad.size) w.push("Revisá estas fechas, parecen de otro año: " + [...bad].join(", ") + ".");
  const pend = A.items.filter(it => !(A.res[it.orden] && A.res[it.orden].resultado)).length; if (pend) w.push(pend + " ítems del checklist sin resultado.");
  const sinEv = A.items.filter(it => { const r = A.res[it.orden]; return r && ["C", "OM", "HA", "NC"].includes(r.resultado) && !(r.evidencia || "").trim(); }).length;
  if (sinEv) w.push(sinEv + " ítems evaluados sin evidencia escrita.");
  const pf = A.prev.filter(h => !h.seg_estado).length; if (pf) w.push(pf + " hallazgos anteriores sin verificar su cierre.");
  if (!a.hora_inicio) w.push("Falta la hora de inicio.");
  return w;
}

/* ---------- Word A.20 (formato de tres bloques) ---------- */
const xesc = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function tituloH(set) {
  const p = []; if (set.has("NC")) p.push("no conformidades"); if (set.has("HA")) p.push("hallazgos"); if (set.has("OM")) p.push("oportunidades de mejora");
  if (!p.length) return "No se reportan no conformidades, hallazgos ni oportunidades de mejora.";
  return "Se reportan " + (p[0] === "hallazgos" ? "los siguientes " : "las siguientes ") + (p.length === 1 ? p[0] : p.slice(0, -1).join(", ") + " y " + p[p.length - 1]) + ":";
}
function repRow(xml, marker, items, fill) {
  const i = xml.indexOf(marker); if (i < 0) return xml;
  const a = Math.max(xml.lastIndexOf("<w:tr ", i), xml.lastIndexOf("<w:tr>", i)), b = xml.indexOf("</w:tr>", i) + 7;
  const proto = xml.slice(a, b).split("<w:t>").join('<w:t xml:space="preserve">');
  return xml.slice(0, a) + items.map(it => fill(proto, it)).join("") + xml.slice(b);
}
function b64ToBin(b) { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function makeDocx(A) {
  const a = A.aud; if (!window.PizZip) throw new Error("No cargó el generador de Word. Recargá la página.");
  const zip = new PizZip(b64ToBin(window.A20_TEMPLATE)); let xml = zip.file("word/document.xml").asText();
  const lines = (a.resumen || draft(A)).split(/\n+/).map(s => s.trim()).filter(Boolean);
  const res = lines.map(s => {
    if (/^Seguimiento de hallazgos/i.test(s)) return { tb: s, t: "" };
    const m = s.match(/^-\s*(NC|HA|OM)\s+(?:\((\d{4})\)\s*)?(.*)$/); return m ? { tb: "• " + m[1] + " " + (m[2] || (a.anio - 1)) + ": ", t: m[3] } : { tb: "", t: s };
  });
  const f = hallazgosInforme(A);
  xml = repRow(xml, "§TB§", res, (pr, it) => pr.split("§TB§").join(xesc(it.tb)).split("§T§").join(xesc(it.t)));
  xml = repRow(xml, "§K§", f, (pr, it) => pr.split("§K§").join(xesc(it.tipo)).split("§HT§").join(xesc(it.texto)));
  const v = { nro: a.nro, anio: a.anio, fecha_pedido: fmt(a.fecha_pedido), funcion: a.funcion, auditor: a.auditor || AUDITOR, fecha_programada: a.fecha_programada,
    fecha_auditoria: fmt(a.fecha_auditoria), alcance: a.alcance, temas: a.temas, criterios: a.criterios,
    hallazgos_titulo: tituloH(new Set(f.map(x => x.tipo))), fecha_informe: fmt(a.fecha_informe || a.fecha_auditoria) };
  for (const k in v) xml = xml.split("{" + k + "}").join(xesc(v[k]));
  zip.file("word/document.xml", xml);
  return zip.generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
function descargar(blob, nombre) {
  const u = URL.createObjectURL(blob), l = document.createElement("a");
  l.href = u; l.download = nombre; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
}

/* ---------- vistas ---------- */
const FOOT = '<footer>Desarrollado por Mgter. Diego Ortiz — Líder de Mejora Continua | Consultor ISO</footer>';
function shell(html) { document.body.classList.toggle("wide", VIEW === "hallazgos" && !CUR); $("#app").innerHTML = html; window.scrollTo(0, 0); }
function logout() { CLAVE = ""; lsSet("a20_clave", ""); renderLogin("La clave no es válida. Ingresala de nuevo."); }

function renderLogin(msg) {
  $("#app").innerHTML = `<form class="login panel" id="fLogin">
    <h1>Auditorías internas</h1><p class="sub">Silver Industrial · A.20 / PR.04</p>
    <label class="f">Clave de administrador<input type="password" id="clave" autocomplete="current-password" required></label>
    <button class="btn primary" type="submit">Entrar</button><span class="msg" id="lmsg">${esc(msg || "")}</span></form>${FOOT}`;
  $("#fLogin").onsubmit = async e => {
    e.preventDefault(); CLAVE = $("#clave").value.trim(); $("#lmsg").textContent = "Verificando…";
    try { await api("GET", "/api/anios"); lsSet("a20_clave", CLAVE); start(); }
    catch (er) { $("#lmsg").textContent = er.status === 401 ? "Clave incorrecta." : "No se pudo conectar: " + er.message; }
  };
}

async function start() { syncBadge(); flushAll(); renderPrograma(); }

function topbar() {
  const anios = [ANIO - 1, ANIO, ANIO + 1].filter((v, i, s) => s.indexOf(v) === i);
  return `<div class="toolbar">
    <div class="tabs"><button type="button" data-v="programa" aria-pressed="${VIEW === "programa"}">Programa</button><button type="button" data-v="hallazgos" aria-pressed="${VIEW === "hallazgos"}">Hallazgos</button><button type="button" data-v="tablero" aria-pressed="${VIEW === "tablero"}">Tablero histórico</button></div>
    ${VIEW === "programa" ? `<label class="f" style="flex-direction:row;align-items:center;gap:8px">Año <select id="selAnio">${anios.map(y => `<option ${y === ANIO ? "selected" : ""}>${y}</option>`).join("")}</select></label>` : ""}
  </div>`;
}
function bindTop() {
  $$("[data-v]").forEach(b => b.onclick = () => { VIEW = b.dataset.v; ({ programa: renderPrograma, hallazgos: renderHallazgos, tablero: renderTablero })[VIEW](); });
  const s = $("#selAnio"); if (s) s.onchange = () => { ANIO = +s.value; lsSet("a20_anio", ANIO); renderPrograma(); };
}

async function renderPrograma() {
  VIEW = "programa"; CUR = null;
  shell(topbar() + `<p class="msg">Cargando programa ${ANIO}…</p>`); bindTop();
  let rows;
  try { rows = await api("GET", "/api/programa?anio=" + ANIO); } catch (e) { if (e.status === 401) return logout(); shell(topbar() + `<div class="warn">No se pudo cargar: ${esc(e.message)}</div>` + FOOT); bindTop(); return; }
  const card = r => {
    const ext = r.auditor_tipo === "externo";
    if (!r.id) return `<div class="card ${ext ? "ext" : ""}"><div class="row1"><span class="t">${esc(r.nombre)}</span><span class="n">A.20 N° ${r.orden}</span></div>
      <span class="who">${ext ? "Auditora externa" : "Auditor interno"}</span>
      <button class="btn" data-new="${r.codigo}">${ext ? "Cargar informe" : "Iniciar auditoría " + ANIO}</button></div>`;
    const pct = r.items ? Math.round(r.hechos / r.items * 100) : (r.estado === "emitida" ? 100 : 0);
    const h = r.hallazgos || {}, ch = ["NC", "HA", "OM"].filter(k => h[k]).map(k => `<span class="chip ${k}">${h[k]} ${k}</span>`).join("");
    const est = { emitida: "Emitida", en_curso: "En curso", programada: "Programada" }[r.estado] || r.estado;
    return `<button class="card ${ext ? "ext" : ""}" data-open="${r.id}"><div class="row1"><span class="t">${esc(r.nombre)}</span><span class="n">A.20 N° ${r.nro}</span></div>
      <div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
      <div class="row1"><span class="state">${est}${r.items ? " · " + r.hechos + "/" + r.items : ""}${r.fecha_auditoria ? " · " + fmt(r.fecha_auditoria) : ""}</span><span class="chips">${ch}</span></div></button>`;
  };
  shell(topbar() + `<h1>Programa ${ANIO} · Auditorías internas</h1>
    <p class="sub">13 procesos. Los de línea punteada los audita la auditora externa: cargá su informe para que quede el registro completo del ciclo.</p>
    <h2>A cargo del responsable del SGC</h2><div class="grid">${rows.filter(r => r.auditor_tipo === "interno").map(card).join("")}</div>
    <h2>A cargo de la auditora externa</h2><div class="grid">${rows.filter(r => r.auditor_tipo === "externo").map(card).join("")}</div>${FOOT}`);
  bindTop();
  $$("[data-open]").forEach(b => b.onclick = () => openAudit(+b.dataset.open));
  $$("[data-new]").forEach(b => b.onclick = async () => {
    b.disabled = true; b.textContent = "Creando…";
    try { const a = await api("POST", "/api/auditorias", { anio: ANIO, proceso: b.dataset.new }); openAudit(a.id); }
    catch (e) { b.disabled = false; b.textContent = "Reintentar"; alert(e.message); }
  });
}

async function openAudit(id) {
  shell(`<p class="msg">Cargando auditoría…</p>`);
  let d; try { d = await api("GET", "/api/auditorias/" + id); } catch (e) { if (e.status === 401) return logout(); shell(`<div class="warn">No se pudo abrir: ${esc(e.message)}</div><button class="btn" id="bk">← Programa</button>`); $("#bk").onclick = renderPrograma; return; }
  const A = { aud: d.auditoria, items: d.checklist, res: {}, prev: d.previos, hall: d.hallazgos, recalc: false };
  d.resultados.forEach(r => A.res[r.item_orden] = { resultado: r.resultado, evidencia: r.evidencia, redaccion: r.redaccion });
  overlayPend(A); CUR = A; MANUAL = []; renderAudit();
}

function renderAudit(keep) {
  const A = CUR, a = A.aud, id = a.id, sy = window.scrollY;
  const items = A.items.map(it => {
    const r = A.res[it.orden] || {}, key = "r:" + id + ":" + it.orden;
    return `<div class="item ${r.resultado || ""}" id="it-${it.orden}">
      <div class="q">${esc(it.pregunta)}</div>
      <div class="meta"><span class="tag">ISO ${esc(it.clausula)}</span><span class="svwrap"><span class="svmsg" id="st-${key}"></span><button type="button" class="btn sv" data-sv="${key}">Guardar ítem</button></span></div>
      <div class="hint">${esc(it.guia)}</div>
      <div class="seg" role="group" aria-label="Resultado">${RES.map(([k, l]) => `<button type="button" class="${k}" data-o="${it.orden}" data-r="${k}" aria-pressed="${r.resultado === k}">${l}</button>`).join("")}</div>
      <textarea id="ev-${it.orden}" data-ev="${it.orden}" rows="2" placeholder="Evidencia: registro, revisión, fecha, N°, qué se observó">${esc(r.evidencia)}</textarea>
      <textarea id="fd-${it.orden}" data-fd="${it.orden}" rows="2" placeholder="Redacción del hallazgo para el informe" ${["OM", "HA", "NC"].includes(r.resultado) ? "" : "hidden"}>${esc(r.redaccion)}</textarea></div>`;
  }).join("");
  const prev = A.prev.map(h => {
    const key = "s:" + id + ":" + h.id;
    return `<div class="item"><div class="meta"><span class="tag prev">${h.tipo} ${h.anio}</span>${h.nc_numero ? `<span class="tag">NC/OM ${h.nc_numero}</span>` : ""}<span class="svwrap"><span class="svmsg" id="st-${key}"></span><button type="button" class="btn sv" data-sv="${key}">Guardar ítem</button></span></div>
      <div class="q">${esc(h.texto)}</div>
      <div class="seg segF" role="group" aria-label="Estado">${FOLLOW.map(([k, l]) => `<button type="button" data-h="${h.id}" data-s="${k}" aria-pressed="${h.seg_estado === k}">${l}</button>`).join("")}</div>
      <textarea id="pev-${h.id}" data-pev="${h.id}" rows="2" placeholder="Evidencia del cierre">${esc(h.seg_evidencia)}</textarea></div>`;
  }).join("");
  const fkey = "f:" + id;
  shell(`<button class="btn back" id="btnBack">← Programa</button>
    <h1>${esc(procNombre(a))} <span class="code" style="color:var(--muted)">A.20 N° ${a.nro}/${a.anio}</span></h1>
    ${a.estado === "emitida" ? `<div class="banner">Informe emitido. Podés seguir corrigiendo y volver a emitir; el Word se arma con lo guardado.</div>` : ""}
    <h2>Datos del informe <span class="svmsg" id="st-${fkey}"></span></h2>
    <div class="panel fields">
      <label class="f">Fecha del pedido<input type="date" id="f_fecha_pedido" value="${/^\d{4}-\d{2}-\d{2}$/.test(a.fecha_pedido || "") ? a.fecha_pedido : ""}" placeholder="${esc(a.fecha_pedido)}"></label>
      <label class="f">Mes programado<input type="month" id="f_mes" value="${mesYM(a.fecha_programada)}"></label>
      <label class="f">Fecha de auditoría<input type="date" id="f_fecha_auditoria" value="${isoDate(a.fecha_auditoria)}"></label>
      <label class="f">Hora de inicio<input type="time" id="f_hora_inicio" value="${esc(a.hora_inicio)}"></label>
      <label class="f full">Auditor<input id="f_auditor" value="${esc(a.auditor)}"></label>
      <label class="f full">Función auditada<input id="f_funcion" value="${esc(a.funcion)}"></label>
      <label class="f full">Alcance<input id="f_alcance" value="${esc(a.alcance)}"></label>
      <label class="f full">Temas auditados<textarea id="f_temas" rows="2">${esc(a.temas)}</textarea></label>
      <label class="f full">Criterios<textarea id="f_criterios" rows="2">${esc(a.criterios)}</textarea></label>
    </div>
    ${A.prev.length ? `<h2>Seguimiento de hallazgos anteriores</h2><div class="items">${prev}</div>` : ""}
    ${A.items.length ? `<h2>Checklist</h2><div class="items">${items}</div>` : `<h2>Checklist</h2><p class="hint">Este proceso no tiene checklist (auditoría externa): cargá el resumen y los hallazgos del informe.</p>`}
    <h2>Hallazgos de esta auditoría</h2><div class="panel" id="fndBox"></div>
    <h2>Resumen para el A.20</h2>
    <div class="panel"><p class="hint" style="margin:0 0 8px">Cada párrafo separado por una línea en blanco sale como párrafo en el Word.</p>
      <textarea id="f_resumen" rows="10" placeholder="Tocá “Armar borrador”">${esc(a.resumen)}</textarea>
      <div class="actions"><button class="btn" id="btnDraft">Armar borrador</button></div></div>
    <h2>Control antes de emitir</h2><div class="warns" id="warnBox"></div>
    <div class="actions"><button class="btn primary" id="btnEmit">Emitir y descargar A.20</button><button class="btn" id="btnPrev">Vista previa</button><button class="btn" id="btnDocx">Solo descargar Word</button><span class="msg" id="docMsg"></span></div>${FOOT}`);
  $("#btnBack").onclick = () => { flushAll(); renderPrograma(); };
  const field = (sel, col, conv) => $(sel).addEventListener("input", e => { const v = conv ? conv(e.target.value) : e.target.value; a[col] = v; queue(fkey, "PATCH", "/api/auditorias/" + id, { [col]: v || null }, true); refresh(); });
  field("#f_fecha_pedido", "fecha_pedido"); field("#f_mes", "fecha_programada", mesTxt); field("#f_fecha_auditoria", "fecha_auditoria");
  field("#f_hora_inicio", "hora_inicio"); field("#f_auditor", "auditor"); field("#f_funcion", "funcion"); field("#f_alcance", "alcance");
  field("#f_temas", "temas"); field("#f_criterios", "criterios"); field("#f_resumen", "resumen");
  const saveItem = o => { const r = A.res[o] || {}; queue("r:" + id + ":" + o, "PUT", "/api/auditorias/" + id + "/resultados/" + o, { resultado: r.resultado || null, evidencia: r.evidencia || null, redaccion: r.redaccion || null }); };
  $$("[data-r]").forEach(b => b.onclick = () => {
    const o = +b.dataset.o, r = A.res[o] || (A.res[o] = {}); r.resultado = r.resultado === b.dataset.r ? null : b.dataset.r;
    $("#it-" + o).className = "item " + (r.resultado || ""); $$("[data-r]", $("#it-" + o)).forEach(x => x.setAttribute("aria-pressed", x.dataset.r === r.resultado));
    $("#fd-" + o).hidden = !["OM", "HA", "NC"].includes(r.resultado); A.recalc = true; saveItem(o); refresh();
  });
  $$("[data-ev]").forEach(t => t.addEventListener("input", () => { const o = +t.dataset.ev; (A.res[o] || (A.res[o] = {})).evidencia = t.value; saveItem(o); refresh(); }));
  $$("[data-fd]").forEach(t => t.addEventListener("input", () => { const o = +t.dataset.fd; (A.res[o] || (A.res[o] = {})).redaccion = t.value; A.recalc = true; saveItem(o); refresh(); }));
  const saveSeg = h => queue("s:" + id + ":" + h.id, "PUT", "/api/auditorias/" + id + "/seguimiento/" + h.id, { estado: h.seg_estado || null, evidencia: h.seg_evidencia || null });
  $$("[data-s]").forEach(b => b.onclick = () => {
    const h = A.prev.find(x => x.id === +b.dataset.h); h.seg_estado = h.seg_estado === b.dataset.s ? null : b.dataset.s;
    $$("[data-s]", b.parentNode).forEach(x => x.setAttribute("aria-pressed", x.dataset.s === h.seg_estado)); A.recalc = true; saveSeg(h); refresh();
  });
  $$("[data-pev]").forEach(t => t.addEventListener("input", () => { const h = A.prev.find(x => x.id === +t.dataset.pev); h.seg_evidencia = t.value; saveSeg(h); refresh(); }));
  $$("[data-sv]").forEach(b => b.onclick = async () => { const k = b.dataset.sv; clearTimeout(timers[k]); if (!PEND[k]) { itemMsg(k, "Ya estaba guardado", "ok"); return; } await send(k); });
  $("#btnDraft").onclick = () => { a.resumen = draft(A); $("#f_resumen").value = a.resumen; queue(fkey, "PATCH", "/api/auditorias/" + id, { resumen: a.resumen }, true); refresh(); };
  $("#btnPrev").onclick = () => vistaPrevia(A);
  $("#btnDocx").onclick = async () => {
    const m = $("#docMsg"); try { await flushAll(); descargar(makeDocx(A), nombreDoc(a)); m.textContent = "Descargado."; } catch (e) { m.textContent = "No se pudo generar: " + e.message; }
  };
  $("#btnEmit").onclick = async () => {
    const m = $("#docMsg"); m.textContent = "Emitiendo…";
    try {
      if (!a.resumen) { a.resumen = draft(A); $("#f_resumen").value = a.resumen; queue(fkey, "PATCH", "/api/auditorias/" + id, { resumen: a.resumen }, true); }
      await flushAll();
      if (Object.keys(PEND).some(k => PEND[k].aud === id)) { m.textContent = "Hay cambios sin enviar (sin conexión). Reintentá cuando tengas señal."; return; }
      const f = hallazgosInforme(A);
      A.hall = await api("POST", "/api/auditorias/" + id + "/emitir", { hallazgos: f }); a.estado = "emitida"; A.recalc = false; MANUAL = [];
      descargar(makeDocx(A), nombreDoc(a)); m.textContent = "Emitida y descargada."; renderAudit(true);
    } catch (e) { m.textContent = "No se pudo emitir: " + e.message; }
  };
  refresh(); window.scrollTo(0, keep ? sy : 0);
}
const procNombre = a => ({ MANT: "Mantenimiento", RMP: "Recepción de MP", COMP: "Compras", CC: "Control de Calidad", VRP: "Ventas · Recepción de pedidos", PROD: "Producción", VLA: "Ventas · Logística y Almacén", CAL: "Calibraciones", PROV: "Proveedores", RRHH: "Recursos Humanos", SGC: "Administración del SGC", AI: "Auditorías internas", RD: "Revisión por la dirección" }[a.proceso] || a.proceso);
async function vistaPrevia(A) {
  const ov = document.createElement("div"); ov.className = "ovl";
  ov.innerHTML = `<div class="ovl-box" role="dialog" aria-modal="true" aria-label="Vista previa del A.20">
    <div class="ovl-bar"><b>Vista previa · ${esc(nombreDoc(A.aud))}</b><span style="flex:1"></span><button class="btn" id="ovDl">Descargar</button><button class="btn" id="ovX">Cerrar</button></div>
    <div class="ovl-doc" id="ovDoc"><p class="msg">Armando el documento…</p></div></div>`;
  document.body.appendChild(ov); document.body.style.overflow = "hidden";
  const close = () => { ov.remove(); document.body.style.overflow = ""; };
  ov.addEventListener("click", e => { if (e.target === ov) close(); }); $("#ovX", ov).onclick = close;
  document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", k); } });
  try {
    const blob = makeDocx(A); $("#ovDl", ov).onclick = () => descargar(blob, nombreDoc(A.aud));
    if (!window.docx || !window.docx.renderAsync) throw new Error("No cargó el visor. Recargá la página.");
    const box = $("#ovDoc", ov); box.innerHTML = "";
    await window.docx.renderAsync(blob, box, null, { inWrapper: true, ignoreLastRenderedPageBreak: true, breakPages: true });
  } catch (e) { $("#ovDoc", ov).innerHTML = `<div class="warn">No se pudo mostrar: ${esc(e.message)}</div>`; }
}
const nombreDoc = a => a.anio + " A.20 Informe Auditoria N" + a.nro + " " + procNombre(a).replace(/[·\/]/g, "-") + ".docx";

function refresh() {
  const A = CUR; if (!A) return;
  const f = hallazgosInforme(A), emit = A.aud.estado === "emitida" && A.hall.length && !A.recalc;
  const rows = emit
    ? A.hall.map(h => `<div class="fnd"><span class="chip ${h.tipo}">${h.tipo}</span><span>${esc(h.texto)}</span><label class="hint">N° NC/OM <input class="ncin" data-nc="${h.id}" value="${h.nc_numero ?? ""}" inputmode="numeric"></label></div>`).join("")
    : f.map(x => `<div class="fnd"><span class="chip ${x.tipo}">${x.tipo}</span><span>${esc(x.texto)}</span></div>`).join("");
  $("#fndBox").innerHTML = (rows || `<span class="hint">Sin hallazgos. Marcá OM, HA o NC en el checklist o agregalos a mano.</span>`) +
    `<div id="manual" style="margin-top:10px;display:flex;flex-direction:column;gap:6px">${MANUAL.map((m, i) => `<div class="mrow"><select data-mt="${i}">${["NC", "HA", "OM"].map(t => `<option ${t === m.tipo ? "selected" : ""}>${t}</option>`).join("")}</select><textarea rows="2" data-mx="${i}" placeholder="Texto del hallazgo">${esc(m.texto)}</textarea><button class="btn x" data-md="${i}" aria-label="Quitar">✕</button></div>`).join("")}</div>
     <div class="actions"><button class="btn" id="btnAddH">Agregar hallazgo a mano</button>${f.some(x => x.tipo === "NC") ? `<a class="linkrow" href="${NC_APP}" target="_blank" rel="noopener">Abrir la app de NC para registrar la Q.21</a>` : ""}</div>
     ${emit ? `<p class="hint" style="margin:8px 0 0">Anotá el N° de NC/OM cuando la cargues en la app de No Conformidades: queda vinculado para el seguimiento.</p>` : ""}`;
  $("#btnAddH").onclick = () => { MANUAL.push({ tipo: "OM", texto: "" }); A.recalc = true; refresh(); };
  $$("[data-mt]").forEach(s => s.onchange = () => { MANUAL[+s.dataset.mt].tipo = s.value; refresh(); });
  $$("[data-mx]").forEach(t => t.addEventListener("change", () => { MANUAL[+t.dataset.mx].texto = t.value; refresh(); }));
  $$("[data-md]").forEach(b => b.onclick = () => { MANUAL.splice(+b.dataset.md, 1); refresh(); });
  $$("[data-nc]").forEach(i => i.addEventListener("change", async () => {
    try { const h = await api("PATCH", "/api/hallazgos/" + i.dataset.nc, { nc_numero: i.value.trim() || null }); const x = A.hall.find(y => y.id === h.id); if (x) x.nc_numero = h.nc_numero; i.style.borderColor = "var(--c)"; }
    catch (e) { i.style.borderColor = "var(--nc)"; alert(e.message); }
  }));
  const w = checks(A); $("#warnBox").innerHTML = w.length ? w.map(x => `<div class="warn">${esc(x)}</div>`).join("") : `<div class="hint">Todo en orden para emitir.</div>`;
}


/* ---------- dashboard de hallazgos ---------- */
const HS = { tipos: new Set(["NC", "HA", "OM"]), aud: "todos", est: "todos", sel: null };
const ORDEN_T = ["NC", "OM", "HA"];
let tipEl = null;
function tipShow(e, html) { if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tip"; document.body.appendChild(tipEl); } tipEl.innerHTML = html; tipEl.style.display = "block"; tipEl.style.left = Math.min(e.clientX + 12, innerWidth - 270) + "px"; tipEl.style.top = (e.clientY + 12) + "px"; }
function tipHide() { if (tipEl) tipEl.style.display = "none"; }
const cssv = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
async function renderHallazgos() {
  VIEW = "hallazgos"; CUR = null; shell(topbar() + `<p class="msg">Cargando hallazgos…</p>`); bindTop();
  let d; try { d = await api("GET", "/api/hallazgos"); } catch (e) { if (e.status === 401) return logout(); shell(topbar() + `<div class="warn">${esc(e.message)}</div>`); bindTop(); return; }
  const P = d.procesos, YEARS = [...new Set(d.auditorias.map(a => a.anio))].sort((a, b) => a - b);
  const audited = {}; d.auditorias.forEach(a => { (audited[a.anio] = audited[a.anio] || new Set()).add(a.proceso); });
  const yN = YEARS[YEARS.length - 1], yP = YEARS[YEARS.length - 2];
  if (!HS.sel || !P.find(p => p.codigo === HS.sel)) HS.sel = P[0].codigo;
  shell(topbar() + `<h1>Hallazgos por auditoría</h1>
    <p class="sub">Qué se encontró en cada proceso, de qué tipo y cómo evoluciona año contra año. Tocá un proceso para ver el detalle. Sirve de entrada para la revisión por la dirección (9.3).</p>
    <div class="filters" role="group" aria-label="Filtros">
      <div class="fg"><span>Tipo</span>${["NC", "HA", "OM"].map(t => `<button class="tg" data-t="${t}" aria-pressed="${HS.tipos.has(t)}"><i class="sw" style="background:var(--t${t.toLowerCase()})"></i>${t}</button>`).join("")}</div>
      <div class="fg"><span>Auditor</span>${[["todos", "Todos"], ["interno", "Interno"], ["externo", "Externo"]].map(([k, l]) => `<button class="tg" data-a="${k}" aria-pressed="${HS.aud === k}">${l}</button>`).join("")}</div>
      <div class="fg"><span>Estado</span>${[["todos", "Todos"], ["abiertos", "Solo abiertos"]].map(([k, l]) => `<button class="tg" data-e="${k}" aria-pressed="${HS.est === k}">${l}</button>`).join("")}</div>
    </div>
    <div class="kpis" id="hk"></div>
    <div class="grid2">
      <div class="panel"><h2>Evolución por año</h2>
        <div class="legend">${ORDEN_T.map(t => `<span><i style="background:var(--t${t.toLowerCase()})"></i>${t}</span>`).join("")}</div>
        <svg id="hevo" viewBox="0 0 420 260" width="100%" role="img" aria-label="Hallazgos por año apilados por tipo"></svg>
        <details class="tbl"><summary>Ver como tabla</summary><div id="hevoT"></div></details></div>
      <div class="panel"><h2>Por proceso y año</h2><div style="overflow-x:auto"><table class="mx" id="hmx"></table></div>
        <p class="note">Barra = hallazgos del año (rojo NC, azul OM, amarillo HA). Flecha = cambio contra el año anterior.</p></div>
    </div>
    <div class="panel det" id="hdet" style="margin-top:14px"></div>${FOOT}`);
  bindTop();
  const procOK = p => HS.aud === "todos" || p.auditor_tipo === HS.aud;
  const rows = () => d.hallazgos.filter(h => HS.tipos.has(h.tipo) && procOK(P.find(p => p.codigo === h.proceso)) && (HS.est === "todos" || h.estado !== "cerrado"));
  const cnt = (L, y, pc) => { const c = { NC: 0, HA: 0, OM: 0 }; L.forEach(h => { if (h.anio === y && (!pc || h.proceso === pc)) c[h.tipo]++; }); c.t = c.NC + c.HA + c.OM; return c; };
  const bindTips = root => $$("[data-tip]", root).forEach(el => { el.addEventListener("mousemove", e => tipShow(e, esc(el.dataset.tip))); el.addEventListener("mouseleave", tipHide); });
  function draw() {
    const L = rows();
    // indicadores
    const a = cnt(L, yN), b = yP ? cnt(L, yP) : null;
    const dif = (x, y) => { if (y == null) return ""; const v = x - y; return v === 0 ? `<span class="trend flat">= ${yP}</span>` : `<span class="trend ${v > 0 ? "up" : "down"}">${v > 0 ? "▲ +" : "▼ "}${v} vs ${yP}</span>`; };
    const prevAll = yP ? d.hallazgos.filter(h => h.anio === yP) : [], cer = prevAll.filter(h => h.estado === "cerrado").length;
    $("#hk").innerHTML = `<div class="kpi"><span>Hallazgos ${yN}</span><b>${a.t}</b>${b ? dif(a.t, b.t) : ""}</div>` +
      ORDEN_T.map(k => `<div class="kpi"><span><i class="sw" style="background:var(--t${k.toLowerCase()})"></i>${k} ${yN}</span><b>${a[k]}</b>${b ? dif(a[k], b[k]) : ""}</div>`).join("") +
      (prevAll.length ? `<div class="kpi"><span>Eficacia del ciclo ${yP}</span><b>${Math.round(cer / prevAll.length * 100)}%</b><small>${cer} de ${prevAll.length} cerrados y eficaces</small></div>` : "") +
      `<div class="kpi"><span>Abiertos acumulados</span><b>${d.hallazgos.filter(h => h.estado !== "cerrado").length}</b><small>de todos los ciclos</small></div>`;
    // evolución
    const W = 420, H = 260, m = { l: 34, r: 12, t: 18, b: 30 }, ih = H - m.t - m.b;
    const tot = YEARS.map(y => cnt(L, y)); const mx = Math.max(4, ...tot.map(c => c.t)); const st = mx <= 8 ? 2 : mx <= 25 ? 5 : 10; const top = Math.ceil(mx / st) * st;
    const sy = v => m.t + ih - (v / top) * ih; const gap = (W - m.l - m.r) / YEARS.length, bw = Math.min(64, gap * 0.6);
    let s = ""; for (let v = 0; v <= top; v += st) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="${cssv("--line")}" stroke-opacity=".6"/><text x="${m.l - 6}" y="${sy(v) + 4}" font-size="11" text-anchor="end" fill="${cssv("--muted")}">${v}</text>`;
    YEARS.forEach((y, i) => {
      const c = tot[i], x = m.l + gap * i + (gap - bw) / 2; let acc = 0; const segs = ORDEN_T.filter(k => c[k]);
      segs.forEach((k, j) => { const h = (c[k] / top) * ih, yy = sy(acc + c[k]), last = j === segs.length - 1, hh = Math.max(0, h - (last ? 0 : 2)), col = cssv("--t" + k.toLowerCase());
        if (last) s += `<rect x="${x}" y="${yy}" width="${bw}" height="${Math.min(hh, 8)}" rx="4" fill="${col}"/><rect x="${x}" y="${yy + Math.min(4, hh / 2)}" width="${bw}" height="${Math.max(0, hh - Math.min(4, hh / 2))}" fill="${col}"/>`;
        else s += `<rect x="${x}" y="${yy}" width="${bw}" height="${hh}" fill="${col}"/>`; acc += c[k]; });
      s += `<text x="${x + bw / 2}" y="${sy(c.t) - 6}" font-size="13" font-weight="600" text-anchor="middle" fill="${cssv("--ink")}">${c.t}</text><text x="${x + bw / 2}" y="${H - 10}" font-size="12" text-anchor="middle" fill="${cssv("--muted")}">${y}</text>`;
      s += `<rect x="${x - 10}" y="${m.t}" width="${bw + 20}" height="${ih}" fill="transparent" data-tip="${y}: ${c.t} hallazgos · NC ${c.NC} · OM ${c.OM} · HA ${c.HA}"/>`;
    });
    $("#hevo").innerHTML = s; bindTips($("#hevo"));
    $("#hevoT").innerHTML = `<table class="mx"><tr><th>Año</th><th>NC</th><th>HA</th><th>OM</th><th>Total</th></tr>${YEARS.map((y, i) => `<tr><td>${y}</td><td>${tot[i].NC}</td><td>${tot[i].HA}</td><td>${tot[i].OM}</td><td>${tot[i].t}</td></tr>`).join("")}</table>`;
    // matriz
    const maxT = Math.max(1, ...P.flatMap(p => YEARS.map(y => cnt(L, y, p.codigo).t))), U = 86 / maxT;
    const cell = (p, y) => { if (!audited[y] || !audited[y].has(p.codigo)) return `<td class="dash">sin auditar</td>`; const c = cnt(L, y, p.codigo);
      if (!c.t) return `<td><div class="cellbar"><span class="cnt">0</span><span class="dash">sin hallazgos</span></div></td>`;
      return `<td data-tip="${esc(p.nombre)} ${y}: NC ${c.NC} · OM ${c.OM} · HA ${c.HA}"><div class="cellbar"><span class="cnt">${c.t}</span><span class="mini">${ORDEN_T.filter(k => c[k]).map(k => `<i style="width:${c[k] * U}px;background:var(--t${k.toLowerCase()})"></i>`).join("")}</span></div></td>`; };
    const trend = p => { if (!yP || !audited[yN] || !audited[yN].has(p.codigo) || !audited[yP] || !audited[yP].has(p.codigo)) return `<td class="dash">—</td>`; const x = cnt(L, yN, p.codigo).t, z = cnt(L, yP, p.codigo).t; return `<td>${x > z ? `<span class="trend up">▲ ${x - z}</span>` : x < z ? `<span class="trend down">▼ ${z - x}</span>` : `<span class="trend flat">=</span>`}</td>`; };
    $("#hmx").innerHTML = `<thead><tr><th>Proceso</th>${YEARS.map(y => `<th>${y}</th>`).join("")}<th>Tend.</th></tr></thead><tbody>` +
      P.filter(procOK).map(p => `<tr class="row ${p.codigo === HS.sel ? "sel" : ""}" tabindex="0" data-p="${p.codigo}"><td class="p">${esc(p.nombre)}${p.auditor_tipo === "externo" ? ' <span class="extl">· externa</span>' : ""}</td>${YEARS.map(y => cell(p, y)).join("")}${trend(p)}</tr>`).join("") + `</tbody>`;
    bindTips($("#hmx"));
    $$("#hmx tr.row").forEach(r => { const go = () => { HS.sel = r.dataset.p; draw(); }; r.onclick = go; r.onkeydown = e => { if (e.key === "Enter") go(); }; });
    // detalle
    const p = P.find(x => x.codigo === HS.sel), E = { cerrado: "Cerrado y eficaz", abierto: "Abierto", no_eficaz: "No eficaz" };
    let h = `<h3>${esc(p.nombre)}</h3><p class="sub" style="margin:0">${p.auditor_tipo === "externo" ? "Auditoría externa" : "Auditoría interna"} · hallazgos por año y estado de cierre</p>`;
    [...YEARS].reverse().forEach(y => { const l = L.filter(x => x.proceso === p.codigo && x.anio === y);
      h += `<div class="yr">${y} · ${l.length} ${l.length === 1 ? "hallazgo" : "hallazgos"}</div>`;
      h += l.length ? l.map(x => `<div class="fr"><span class="chip ${x.tipo} solid">${x.tipo}</span><span>${esc(x.texto)}${x.nc_numero ? ` <span class="tag">NC/OM ${x.nc_numero}</span>` : ""}</span><span class="est ${x.estado}">${E[x.estado]}</span></div>`).join("") : `<p class="note">${audited[y] && audited[y].has(p.codigo) ? "Sin hallazgos con los filtros elegidos." : "No auditado ese año."}</p>`; });
    $("#hdet").innerHTML = h;
  }
  $$("[data-t]").forEach(b => b.onclick = () => { const t = b.dataset.t; if (HS.tipos.has(t) && HS.tipos.size > 1) HS.tipos.delete(t); else HS.tipos.add(t); b.setAttribute("aria-pressed", HS.tipos.has(t)); draw(); });
  const grp = (attr, key) => $$(`[data-${attr}]`).forEach(b => b.onclick = () => { HS[key] = b.dataset[attr]; $$(`[data-${attr}]`).forEach(x => x.setAttribute("aria-pressed", x === b)); if (key === "aud" && !procOK(P.find(x => x.codigo === HS.sel))) HS.sel = P.find(procOK).codigo; draw(); });
  grp("a", "aud"); grp("e", "est");
  draw();
}

async function renderTablero() {
  VIEW = "tablero"; CUR = null; shell(topbar() + `<p class="msg">Cargando tablero…</p>`); bindTop();
  let d; try { d = await api("GET", "/api/tablero"); } catch (e) { if (e.status === 401) return logout(); shell(topbar() + `<div class="warn">${esc(e.message)}</div>`); bindTop(); return; }
  const anios = [...new Set(d.porAnio.map(x => x.anio))];
  const ef = {}; d.eficacia.forEach(x => { (ef[x.anio_hallazgo] = ef[x.anio_hallazgo] || { cerrado: 0, abierto: 0, no_eficaz: 0 })[x.estado || "abierto"] += x.n; });
  const efTxt = y => { const e = ef[y]; if (!e) return "—"; const t = e.cerrado + e.abierto + e.no_eficaz; return Math.round(e.cerrado / t * 100) + "% (" + e.cerrado + "/" + t + ")"; };
  const procs = [...new Map(d.porProceso.map(x => [x.codigo, x])).values()].sort((a, b) => a.orden - b.orden);
  const cell = (c, y) => { const r = d.porProceso.find(x => x.codigo === c && x.anio === y); if (!r) return `<td class="n">—</td>`; return `<td class="n">${r.total}${r.nc ? ` <span class="chip NC">${r.nc} NC</span>` : ""}</td>`; };
  shell(topbar() + `<h1>Tablero histórico</h1><p class="sub">Entrada para la revisión por la dirección (9.3) y para el programa basado en riesgo (9.2.2 a).</p>
    <div class="kpis">${anios.map(y => { const r = d.porAnio.find(x => x.anio === y); return `<div class="kpi"><span>Ciclo ${y}</span><b>${r.nc + r.ha + r.om}</b><span>${r.nc} NC · ${r.ha} HA · ${r.om} OM · ${r.auditorias} auditorías</span></div>`; }).join("")}
      ${Object.keys(ef).map(y => `<div class="kpi"><span>Eficacia hallazgos ${y}</span><b>${efTxt(y).split(" ")[0]}</b><span>cerrados y eficaces ${efTxt(y).split(" ")[1] || ""}</span></div>`).join("")}</div>
    <h2>Hallazgos por proceso y año</h2>
    <div class="tblwrap"><table class="t"><thead><tr><th>Proceso</th>${anios.map(y => `<th class="n">${y}</th>`).join("")}</tr></thead>
      <tbody>${procs.map(p => `<tr><td>${esc(p.nombre)}</td>${anios.map(y => cell(p.codigo, y)).join("")}</tr>`).join("")}</tbody></table></div>
    <h2>Hallazgos abiertos (${d.abiertos.length})</h2>
    <div class="tblwrap"><table class="t"><thead><tr><th>Año</th><th>Proceso</th><th>Tipo</th><th>Hallazgo</th><th>Estado</th><th>NC/OM</th></tr></thead>
      <tbody>${d.abiertos.map(h => `<tr><td>${h.anio}</td><td>${esc(h.proceso)}</td><td><span class="chip ${h.tipo}">${h.tipo}</span></td><td>${esc(h.texto)}</td><td>${h.estado === "no_eficaz" ? "No eficaz" : "Abierto"}</td><td>${h.nc_numero ?? "—"}</td></tr>`).join("")}</tbody></table></div>${FOOT}`);
  bindTop();
}

/* ---------- arranque ---------- */
document.addEventListener("DOMContentLoaded", () => { syncBadge(); CLAVE ? start() : renderLogin(); });
window.addEventListener("beforeunload", e => { if (Object.keys(PEND).length) { flushAll(); } });
})();
