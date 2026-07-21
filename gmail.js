// ============================================================================
// GMAIL API — envío de correos desde la cuenta de cada gestora (MiTasaTop CRM)
// ----------------------------------------------------------------------------
// Usa la MISMA cuenta de servicio de Google Calendar (delegación de dominio):
// el correo sale literalmente desde el Gmail de la GP, queda en su carpeta
// "Enviados" y las respuestas del cliente llegan a su bandeja.
//
// Variables de entorno (Railway) — YA EXISTEN, no hay que agregar ninguna:
//   GOOGLE_CALENDAR_CREDENTIALS  → .json de la cuenta de servicio
//   GOOGLE_WORKSPACE_DOMAIN      → dominio corporativo (tasatop.com)
//
// REQUISITO DE ACTIVACIÓN (lo hace TI una sola vez):
//   1) Google Cloud → Biblioteca → habilitar "Gmail API" (mismo proyecto).
//   2) admin.google.com → Seguridad → Controles de API → Delegación de todo el
//      dominio → editar el Client ID existente y AGREGAR el scope:
//        https://www.googleapis.com/auth/gmail.send
//      (conservando los de calendar y calendar.events)
//
// Mientras no esté activado, enviar() devuelve un error controlado y el CRM
// sigue funcionando normal (el envío queda como "manual").
// ============================================================================
'use strict';
const crypto = require('node:crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';
const SCOPES = 'https://www.googleapis.com/auth/gmail.send';

let CRED = null;
function credenciales() {
  if (CRED) return CRED;
  try {
    const raw = process.env.GOOGLE_CALENDAR_CREDENTIALS;
    if (!raw) return null;
    CRED = JSON.parse(raw);
    return CRED;
  } catch (e) { console.error('[gmail] credenciales inválidas:', e.message); return null; }
}
function configurado() { return !!credenciales(); }

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

function firmarJWT(subCorreo) {
  const c = credenciales();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: c.client_email,
    sub: subCorreo,          // actúa EN NOMBRE DE la gestora
    scope: SCOPES,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const firma = crypto.sign('RSA-SHA256', Buffer.from(header + '.' + payload), c.private_key);
  return header + '.' + payload + '.' + b64url(firma);
}

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
    const detalle = JSON.stringify(j).slice(0, 300);
    console.error('[gmail] token falló para', correo, ':', detalle);
    // Mensaje claro cuando falta el scope (el error típico antes de que TI active).
    const err = new Error(/unauthorized_client|invalid_scope/i.test(detalle)
      ? 'La cuenta de servicio aún no tiene el permiso gmail.send. TI debe agregarlo en la delegación de dominio.'
      : 'No se pudo autenticar con Google: ' + detalle);
    err.codigo = 'SIN_PERMISO';
    throw err;
  }
  tokens[correo] = { token: j.access_token, exp: Date.now() + 55 * 60 * 1000 };
  return j.access_token;
}

// Codifica cabeceras con tildes/ñ según RFC 2047 (si no, Gmail las rompe).
function encabezado(txt) {
  const s = String(txt || '');
  return /^[\x00-\x7F]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s).toString('base64') + '?=';
}

// ---- Enviar un correo HTML desde la cuenta de la gestora ----
// remitente: correo corporativo de la GP (usuario del CRM)
// nombreRemitente: cómo firma (ej. "Mafer Lujan | TasaTop")
// Devuelve { ok, id, threadId } o lanza error con .codigo
async function enviar({ remitente, nombreRemitente, para, asunto, html, textoPlano, responderA, pixelId }) {
  if (!configurado()) { const e = new Error('Google no está configurado en Railway'); e.codigo = 'SIN_CONFIG'; throw e; }
  if (!remitente || !String(remitente).includes('@')) { const e = new Error('La gestora no tiene un correo corporativo válido'); e.codigo = 'SIN_REMITENTE'; throw e; }
  if (!para || !String(para).includes('@')) { const e = new Error('El cliente no tiene correo registrado'); e.codigo = 'SIN_DESTINO'; throw e; }

  const token = await tokenPara(remitente);
  const de = nombreRemitente ? encabezado(nombreRemitente) + ' <' + remitente + '>' : remitente;
  const bordeA = 'tt_' + crypto.randomBytes(12).toString('hex');

  // multipart/alternative: texto plano + HTML (mejor entregabilidad y accesibilidad).
  const partes = [
    'From: ' + de,
    'To: ' + para,
    responderA ? 'Reply-To: ' + responderA : null,
    'Subject: ' + encabezado(asunto || ''),
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + bordeA + '"',
    '',
    '--' + bordeA,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(String(textoPlano || String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())).toString('base64'),
    '',
    '--' + bordeA,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(String(html || '')).toString('base64'),
    '',
    '--' + bordeA + '--'
  ].filter(x => x !== null).join('\r\n');

  const r = await fetch(GMAIL_API + '/users/me/messages/send', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: b64url(partes) })
  });
  const j = await r.json();
  if (!r.ok) {
    const detalle = JSON.stringify(j).slice(0, 300);
    console.error('[gmail] envío falló:', detalle);
    const e = new Error('Gmail rechazó el envío: ' + ((j.error && j.error.message) || detalle));
    e.codigo = 'ENVIO_FALLO';
    throw e;
  }
  return { ok: true, id: j.id, threadId: j.threadId };
}

// Diagnóstico para el panel de administración: dice si TI ya activó el permiso.
async function verificar(correoPrueba) {
  if (!configurado()) return { listo: false, motivo: 'Falta GOOGLE_CALENDAR_CREDENTIALS en Railway' };
  try {
    await tokenPara(correoPrueba);
    return { listo: true, motivo: 'Gmail API activa: los correos saldrán desde la cuenta de cada gestora' };
  } catch (e) {
    return { listo: false, motivo: e.message };
  }
}

module.exports = { configurado, enviar, verificar };
