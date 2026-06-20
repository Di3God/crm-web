// =============================================================
// sheets.js — Sincronizacion de leads desde Google Sheets (CSV publicado)
// Lee las hojas de Meta y TikTok cada 5 min y mete las filas NUEVAS al
// pipeline de marketing existente (normalizar -> dedupe -> crear lead).
//
// "Solo nuevos desde hoy": en el primer arranque por origen, marca todas
// las filas actuales como ya vistas (sin crearlas). De ahi en adelante,
// solo procesa las que aparezcan nuevas. Reusa el dedupe por telefono.
// =============================================================
const crypto = require('node:crypto');

const INTERVALO_MS = 5 * 60 * 1000; // 5 minutos
const BASE_PUB = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSA6LJ1mZVPnB6-LgF9GZe5wrSYh3Cnvn8K5-Ub3aKK-B02o6y2XdHbTDgVfDNhLgyqTLOE0tk6d5zf/pub';

// URLs configurables por env; si no, usa las publicadas conocidas.
const HOJAS = [
  { origen: 'meta',   url: process.env.SHEETS_META_CSV   || `${BASE_PUB}?gid=1888750850&single=true&output=csv` },
  { origen: 'tiktok', url: process.env.SHEETS_TIKTOK_CSV || `${BASE_PUB}?gid=596579722&single=true&output=csv` },
];

// ---------- Utilidades ----------
// Normaliza un texto a clave comparable (sin tildes, sin signos, minuscula).
function _nk(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Busca el valor de una columna por coincidencia tolerante (incluye substring).
function col(fila, ...frases) {
  const keys = Object.keys(fila);
  for (const fr of frases) {
    const nf = _nk(fr);
    const k = keys.find(k => _nk(k).includes(nf));
    if (k && fila[k] != null && String(fila[k]).trim() !== '') return String(fila[k]).trim();
  }
  return null;
}

// Parser CSV RFC4180 (maneja comillas, comas internas y saltos de linea).
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignora */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.some(v => v && v.trim() !== ''))
    .map(r => { const o = {}; headers.forEach((h, idx) => { o[h] = r[idx] !== undefined ? r[idx] : ''; }); return o; });
}

// Mapea una fila del Sheets a las claves canonicas que entiende el normalizador.
// Conserva la fila original (para rawJson/trazabilidad) y agrega los alias.
function mapearFila(origen, fila) {
  const m = { ...fila };
  m.nombre = col(fila, 'nombres', 'nombre');
  m.telefono = col(fila, 'celular', 'telefono');
  m.email = col(fila, 'correo', 'email');
  m.monto = col(fila, 'cuanto', 'montoinversion', 'monto'); // "¿Con cuánto te gustaría empezar a invertir?"
  m.campana = col(fila, 'campana');
  m.formulario = col(fila, 'formulario');
  m.ad_id = col(fila, 'idanuncio');
  m.dni = col(fila, 'dni');
  const org = col(fila, 'origen'); // ig/fb (solo hoja Meta)
  if (origen === 'meta' && org) m.fuente = org;
  return m;
}

// Descarga el CSV con timeout (Railway si alcanza Google; el sandbox no).
async function fetchCSV(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

// ---------- Fabrica del sincronizador ----------
// deps: { db, normalizarLeadMarketing, procesarLeadMarketing, guardarIngresoBruto, normalizarCelular }
function crearSheetsSync(deps) {
  const { db, normalizarLeadMarketing, procesarLeadMarketing, guardarIngresoBruto, normalizarCelular } = deps;

  // Tablas de control (idempotente).
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketing_sheet_seen (
      huella TEXT PRIMARY KEY, origen TEXT, fecha TEXT, creado TEXT
    );
    CREATE TABLE IF NOT EXISTS marketing_sheet_estado (
      origen TEXT PRIMARY KEY, inicializado INTEGER DEFAULT 0,
      ultimaSync TEXT, ultimoError TEXT, totalProcesados INTEGER DEFAULT 0
    );
  `);

  const qSeenHas = db.prepare('SELECT 1 FROM marketing_sheet_seen WHERE huella = ?');
  const qSeenIns = db.prepare('INSERT OR IGNORE INTO marketing_sheet_seen (huella,origen,fecha,creado) VALUES (?,?,?,?)');
  const qEstadoGet = db.prepare('SELECT * FROM marketing_sheet_estado WHERE origen = ?');
  const qEstadoUp = db.prepare(`INSERT INTO marketing_sheet_estado (origen,inicializado,ultimaSync,ultimoError,totalProcesados)
    VALUES (@origen,@inicializado,@ultimaSync,@ultimoError,@totalProcesados)
    ON CONFLICT(origen) DO UPDATE SET inicializado=@inicializado, ultimaSync=@ultimaSync, ultimoError=@ultimoError, totalProcesados=@totalProcesados`);

  function huella(origen, fila) {
    const tel = normalizarCelular(col(fila, 'celular', 'telefono') || '');
    const fecha = col(fila, 'fecha') || '';
    const nom = (col(fila, 'nombres', 'nombre') || '').toLowerCase();
    const mail = (col(fila, 'correo', 'email') || '').toLowerCase();
    return crypto.createHash('sha1').update([origen, tel, fecha, nom, mail].join('|')).digest('hex');
  }

  async function sincronizarOrigen(hoja) {
    const ahora = new Date().toISOString();
    const est = qEstadoGet.get(hoja.origen) || { origen: hoja.origen, inicializado: 0, totalProcesados: 0 };
    let texto;
    try {
      texto = await fetchCSV(hoja.url);
    } catch (e) {
      qEstadoUp.run({ origen: hoja.origen, inicializado: est.inicializado, ultimaSync: est.ultimaSync || null, ultimoError: String(e.message || e), totalProcesados: est.totalProcesados || 0 });
      return { origen: hoja.origen, error: String(e.message || e) };
    }
    const filas = parseCSV(texto);

    // Primer arranque: baseline. Marca todo como visto, no crea leads.
    if (!est.inicializado) {
      db.exec('BEGIN');
      try {
        for (const f of filas) qSeenIns.run(huella(hoja.origen, f), hoja.origen, col(f, 'fecha') || '', ahora);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      qEstadoUp.run({ origen: hoja.origen, inicializado: 1, ultimaSync: ahora, ultimoError: null, totalProcesados: 0 });
      return { origen: hoja.origen, baseline: filas.length, nuevos: 0, creados: 0 };
    }

    // Ciclos siguientes: procesa solo filas nuevas.
    let nuevos = 0, creados = 0, duplicados = 0, incompletos = 0;
    for (const f of filas) {
      const h = huella(hoja.origen, f);
      if (qSeenHas.get(h)) continue;
      nuevos++;
      try {
        const norm = normalizarLeadMarketing(hoja.origen, mapearFila(hoja.origen, f));
        const res = procesarLeadMarketing(norm);
        guardarIngresoBruto(norm, res.estado, res.mensajeError, res.codigoLead);
        if (res.estado === 'creado') creados++;
        else if (res.estado === 'incompleto') incompletos++;
        else duplicados++;
      } catch (e) {
        // No frena el lote por una fila mala.
      }
      qSeenIns.run(h, hoja.origen, col(f, 'fecha') || '', ahora);
    }
    qEstadoUp.run({ origen: hoja.origen, inicializado: 1, ultimaSync: ahora, ultimoError: null, totalProcesados: (est.totalProcesados || 0) + creados });
    return { origen: hoja.origen, nuevos, creados, duplicados, incompletos };
  }

  let corriendo = false;
  async function sincronizarTodo() {
    if (corriendo) return { saltado: true };
    corriendo = true;
    const resultados = [];
    try {
      for (const hoja of HOJAS) resultados.push(await sincronizarOrigen(hoja));
    } finally {
      corriendo = false;
    }
    return resultados;
  }

  function iniciarScheduler() {
    // Primer disparo a los 20s del arranque (establece baseline), luego cada 5 min.
    setTimeout(() => { sincronizarTodo().catch(() => {}); }, 20000);
    setInterval(() => { sincronizarTodo().catch(() => {}); }, INTERVALO_MS);
  }

  function estado() {
    return db.prepare('SELECT * FROM marketing_sheet_estado').all();
  }

  return { sincronizarTodo, iniciarScheduler, estado };
}

module.exports = { crearSheetsSync, parseCSV, mapearFila, col };
