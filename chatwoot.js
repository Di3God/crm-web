// chatwoot.js — Cliente de la API de Chatwoot (motor de WhatsApp embebido en el CRM).
// Credenciales por variables de entorno (NUNCA en el código):
//   CHATWOOT_URL         -> https://chatwoot-production-XXXX.up.railway.app
//   CHATWOOT_API_TOKEN   -> token de acceso de admin de Chatwoot (secreto)
//   CHATWOOT_ACCOUNT_ID  -> normalmente 1
//   CHATWOOT_INBOX_ID    -> id del inbox de WhatsApp (normalmente 1)

const CW_URL = (process.env.CHATWOOT_URL || '').replace(/\/$/, '');
const CW_TOKEN = process.env.CHATWOOT_API_TOKEN || '';
const CW_ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID || '1';
const CW_INBOX = process.env.CHATWOOT_INBOX_ID || '';

function cwConfigurado() { return !!(CW_URL && CW_TOKEN); }

async function cwFetch(path, opts = {}) {
  const url = CW_URL + '/api/v1/accounts/' + CW_ACCOUNT + path;
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json', 'api_access_token': CW_TOKEN }, opts.headers || {}),
    body: opts.body || undefined,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('Chatwoot ' + res.status + ': ' + String(t).slice(0, 200));
  }
  return res.json();
}

// Lista de conversaciones del inbox (las abiertas). Chatwoot pagina en data.payload.
async function listarConversaciones() {
  const q = CW_INBOX ? ('?inbox_id=' + encodeURIComponent(CW_INBOX) + '&status=open') : '?status=open';
  const data = await cwFetch('/conversations' + q);
  if (data && data.data && Array.isArray(data.data.payload)) return data.data.payload;
  if (data && Array.isArray(data.payload)) return data.payload;
  return [];
}

// Trae una conversación puntual (para validar pertenencia por teléfono).
async function obtenerConversacion(id) {
  return cwFetch('/conversations/' + id);
}

// Mensajes de una conversación.
async function mensajesDe(id) {
  const data = await cwFetch('/conversations/' + id + '/messages');
  if (data && Array.isArray(data.payload)) return data.payload;
  if (Array.isArray(data)) return data;
  return [];
}

// Enviar mensaje saliente.
async function enviarMensaje(id, contenido) {
  return cwFetch('/conversations/' + id + '/messages', {
    method: 'POST',
    body: JSON.stringify({ content: contenido, message_type: 'outgoing' }),
  });
}

// Teléfono del contacto de una conversación (desde meta.sender).
function telefonoDeConversacion(c) {
  const s = (c && c.meta && c.meta.sender) ? c.meta.sender : (c && c.sender ? c.sender : {});
  return s.phone_number || s.identifier || '';
}

module.exports = {
  cwConfigurado, listarConversaciones, obtenerConversacion, mensajesDe, enviarMensaje,
  telefonoDeConversacion, CW_URL,
};
