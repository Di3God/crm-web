// ============================================================================
// GOOGLE CALENDAR — integración con Google Workspace (MiTasatop CRM)
// ----------------------------------------------------------------------------
// Crea/actualiza/cancela eventos en el calendario de cada gestora usando una
// cuenta de servicio con DELEGACIÓN DE DOMINIO (el robot actúa "en nombre de"
// la gestora, identificada por su correo corporativo = usuario del CRM).
//
// Variables de entorno requeridas (Railway):
//   GOOGLE_CALENDAR_CREDENTIALS  → contenido completo del .json de la cuenta de servicio
//   GOOGLE_WORKSPACE_DOMAIN      → dominio corporativo (ej. tasatop.com)
//
// Sin dependencias externas: la firma JWT RS256 se hace con node:crypto.
// Todos los métodos son fire-safe: si algo falla, devuelven null y loguean,
// NUNCA rompen el flujo de guardado de la gestión.
// ============================================================================
'use strict';
const crypto = require('node:crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events';

let CRED = null;
function credenciales() {
  if (CRED) return CRED;
  try {
    const raw = process.env.GOOGLE_CALENDAR_CREDENTIALS;
    if (!raw) return null;
    CRED = JSON.parse(raw);
    return CRED;
  } catch (e) { console.error('[gcal] credenciales inválidas:', e.message); return null; }
}
function configurado() { return !!credenciales(); }

// ---- JWT RS256 firmado con la clave privada de la cuenta de servicio ----
function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function firmarJWT(subCorreo) {
  const c = credenciales();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: c.client_email,
    sub: subCorreo,            // actúa EN NOMBRE DE la gestora (delegación)
    scope: SCOPES,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const firma = crypto.sign('RSA-SHA256', Buffer.from(header + '.' + payload), c.private_key);
  return header + '.' + payload + '.' + b64url(firma);
}

// ---- Token de acceso por gestora (cache por correo, expira a los 55 min) ----
const tokens = {}; // correo -> { token, exp }
async function tokenPara(correo) {
  const t = tokens[correo];
  if (t && t.exp > Date.now()) return t.token;
  const jwt = firmarJWT(correo);
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) {
    console.error('[gcal] token falló para', correo, ':', JSON.stringify(j).slice(0, 300));
    return null;
  }
  tokens[correo] = { token: j.access_token, exp: Date.now() + 55 * 60 * 1000 };
  return j.access_token;
}

// Duración por defecto de la reunión: 30 minutos.
const DURACION_MIN = 30;
function aFechas(fechaISO) {
  // fechaReunion llega como ISO (guardada por el CRM). El evento usa zona América/Lima.
  const ini = new Date(fechaISO);
  const fin = new Date(ini.getTime() + DURACION_MIN * 60 * 1000);
  return {
    start: { dateTime: ini.toISOString(), timeZone: 'America/Lima' },
    end: { dateTime: fin.toISOString(), timeZone: 'America/Lima' }
  };
}

// ---- Crear evento (con Meet). Devuelve { eventId, meetLink } o null. ----
async function crearEvento(correoGestora, datos) {
  try {
    if (!configurado()) return null;
    const token = await tokenPara(correoGestora);
    if (!token) return null;
    const fechas = aFechas(datos.fechaISO);
    const body = {
      summary: datos.titulo || 'Hablemos de Inversiones - Tasatop',
      description: datos.descripcion || '',
      ...fechas,
      conferenceData: { createRequest: { requestId: 'crm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      attendees: (datos.invitados || []).filter(Boolean).map(email => ({ email })),
      reminders: { useDefault: true }
    };
    const r = await fetch(CAL_API + '/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) { console.error('[gcal] crear falló:', JSON.stringify(j).slice(0, 300)); return null; }
    const meetLink = j.hangoutLink || (j.conferenceData && j.conferenceData.entryPoints && (j.conferenceData.entryPoints.find(e => e.entryPointType === 'video') || {}).uri) || null;
    return { eventId: j.id, meetLink };
  } catch (e) { console.error('[gcal] crear evento:', e.message); return null; }
}

// ---- Reprogramar: actualiza fechas del MISMO evento (no duplica). ----
async function actualizarEvento(correoGestora, eventId, datos) {
  try {
    if (!configurado() || !eventId) return null;
    const token = await tokenPara(correoGestora);
    if (!token) return null;
    const fechas = aFechas(datos.fechaISO);
    const patch = { ...fechas };
    if (datos.titulo) patch.summary = datos.titulo;
    if (datos.descripcion != null) patch.description = datos.descripcion;
    // v1.470: propagar invitados también al reprogramar. Sin esto, un evento creado antes de
    // que existieran los invitados fijos nunca los incorporaría, y jefatura no vería la reunión.
    if (Array.isArray(datos.invitados) && datos.invitados.length) {
      patch.attendees = datos.invitados.filter(Boolean).map(email => ({ email }));
    }
    const r = await fetch(CAL_API + '/calendars/primary/events/' + encodeURIComponent(eventId) + '?sendUpdates=all', {
      method: 'PATCH',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    });
    const j = await r.json();
    if (!r.ok) { console.error('[gcal] actualizar falló:', JSON.stringify(j).slice(0, 300)); return null; }
    return { eventId: j.id };
  } catch (e) { console.error('[gcal] actualizar evento:', e.message); return null; }
}

// ---- Cancelar: elimina el evento y notifica a los invitados. ----
async function cancelarEvento(correoGestora, eventId) {
  try {
    if (!configurado() || !eventId) return false;
    const token = await tokenPara(correoGestora);
    if (!token) return false;
    const r = await fetch(CAL_API + '/calendars/primary/events/' + encodeURIComponent(eventId) + '?sendUpdates=all', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ' + token }
    });
    if (!r.ok && r.status !== 404 && r.status !== 410) { console.error('[gcal] cancelar falló:', r.status); return false; }
    return true;
  } catch (e) { console.error('[gcal] cancelar evento:', e.message); return false; }
}

// ---- Disponibilidad: consulta free/busy del día y calcula los huecos libres. ----
// horario laboral 9:00–18:00 Perú, slots de 45 min. Devuelve { ocupados, libres } o null.
async function disponibilidadDia(correoGestora, fechaYMD) {
  try {
    if (!configurado()) return null;
    const token = await tokenPara(correoGestora);
    if (!token) return null;
    // Día completo en hora Perú (UTC-5): de 9:00am a 8:00pm (último slot inicia 20:00).
    const iniDia = new Date(fechaYMD + 'T09:00:00-05:00');
    const finDia = new Date(fechaYMD + 'T20:30:00-05:00');
    const r = await fetch(CAL_API + '/freeBusy', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ timeMin: iniDia.toISOString(), timeMax: finDia.toISOString(), timeZone: 'America/Lima', items: [{ id: 'primary' }] })
    });
    const j = await r.json();
    if (!r.ok) { console.error('[gcal] freeBusy falló:', JSON.stringify(j).slice(0, 300)); return null; }
    const ocupados = ((j.calendars || {}).primary || {}).busy || [];
    // Calcular huecos libres en slots de 30 min dentro del horario laboral.
    const SLOT = 30 * 60 * 1000;
    const libres = [];
    let cursor = iniDia.getTime();
    const finMs = finDia.getTime();
    const bloques = ocupados.map(b => ({ ini: new Date(b.start).getTime(), fin: new Date(b.end).getTime() })).sort((a, b) => a.ini - b.ini);
    while (cursor + SLOT <= finMs) {
      const slotFin = cursor + SLOT;
      const choca = bloques.some(b => cursor < b.fin && slotFin > b.ini);
      if (!choca) {
        const d = new Date(cursor - 5 * 3600000); // a hora Perú para la etiqueta
        libres.push({ inicioISO: new Date(cursor).toISOString(), etiqueta: String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') });
      }
      cursor += 30 * 60 * 1000; // avanzar en pasos de 30 min (slots solapables cada media hora)
    }
    return { ocupados, libres };
  } catch (e) { console.error('[gcal] disponibilidad:', e.message); return null; }
}

module.exports = { configurado, crearEvento, actualizarEvento, cancelarEvento, disponibilidadDia };
