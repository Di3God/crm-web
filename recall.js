// =============================================================
// RECALL.AI — bots de notas para reuniones (B2C y B2B). v1.448
// Una sola cuenta de Tasatop: el CRM despacha un bot por reunión
// (soporta reuniones simultáneas sin conflicto; cada bot es una
// instancia independiente). Cobro por hora de bot, prorrateado.
//
// Variables de entorno (Railway):
//   RECALL_API_KEY               (obligatoria para activar la integración)
//   RECALL_API_URL               default https://us-west-2.recall.ai  (ajustar a la región de la cuenta)
//   RECALL_BOT_NAME              default "Notas Tasatop"
//   RECALL_TRANSCRIPT_PROVIDER   default "recallai" (transcripción de Recall, +$0.15/h, precisa y con
//                                idioma configurable) | "meeting_captions" (captions nativos de Meet,
//                                gratis, pero usan el idioma configurado en el Meet del usuario)
//   RECALL_LANGUAGE              default "es" (código de idioma para recallai; "auto" = detección)
//
// Después del deploy, configurar en el dashboard de Recall el webhook:
//   https://<tu-dominio>/api/recall/webhook
// (el CRM también hace polling de respaldo cada 5 min, así que el webhook es opcional pero recomendado)
// =============================================================
module.exports = function () {
  const KEY = () => process.env.RECALL_API_KEY || null;
  const BASE = () => (process.env.RECALL_API_URL || 'https://us-west-2.recall.ai').replace(/\/+$/, '');
  const BOT_NAME = () => process.env.RECALL_BOT_NAME || 'Notas Tasatop';
  const PROVIDER = () => process.env.RECALL_TRANSCRIPT_PROVIDER || 'recallai';
  const LANG = () => process.env.RECALL_LANGUAGE || 'es';

  function configurado() { return !!KEY(); }

  async function llamarAPI(metodo, ruta, body) {
    const r = await fetch(BASE() + ruta, {
      method: metodo,
      headers: { authorization: 'Token ' + KEY(), 'content-type': 'application/json', accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const texto = await r.text();
    let j = null; try { j = texto ? JSON.parse(texto) : null; } catch (e) { j = { raw: texto }; }
    if (!r.ok) {
      const msg = '[recall] ' + metodo + ' ' + ruta + ' → HTTP ' + r.status + ': ' + String(texto).slice(0, 300);
      const err = new Error(msg); err.status = r.status; err.body = j; throw err;
    }
    return j;
  }

  // Config de transcripción según proveedor elegido.
  function transcriptConfig() {
    const p = PROVIDER();
    if (p === 'meeting_captions') return { provider: { meeting_captions: {} } };
    // Default: transcripción async de Recall con idioma explícito (es) o auto-detección.
    return { provider: { recallai_async: { language_code: LANG() } } };
  }

  // ---- Pedir transcripción async sobre una grabación existente (re-transcribir / fallback). ----
  async function crearTranscriptAsync(recordingId, languageCode) {
    return await llamarAPI('POST', '/api/v1/recording/' + recordingId + '/create_transcript/', {
      provider: { recallai_async: { language_code: languageCode || LANG() } }
    });
  }

  // ---- Crear bot programado. Devuelve { botId } o lanza error. ----
  // joinAtISO: instante UTC en que el bot debe entrar (usar la hora de inicio de la reunión).
  // Si la reunión es inminente o ya empezó, se omite join_at para que el bot entre DE INMEDIATO.
  // Si la API rechaza el recording_config del provider (4xx), se reintenta con payload mínimo:
  // el bot graba igual y la transcripción en español se pide después vía create_transcript (async).
  async function crearBot({ meetingUrl, joinAtISO, metadata }) {
    let joinAt;
    if (joinAtISO) {
      const t = new Date(joinAtISO).getTime();
      if (isFinite(t) && t > Date.now() + 2 * 60 * 1000) joinAt = new Date(t).toISOString();
    }
    const base = { meeting_url: meetingUrl, bot_name: BOT_NAME(), metadata: metadata || {} };
    if (joinAt) base.join_at = joinAt;
    try {
      const j = await llamarAPI('POST', '/api/v1/bot/', Object.assign({}, base, { recording_config: { transcript: transcriptConfig() } }));
      return { botId: j.id || null, crudo: j };
    } catch (e) {
      if (!(e.status >= 400 && e.status < 500)) throw e; // errores de red/5xx: propagar
      console.error('[recall] create con transcript config rechazado (' + e.status + '), reintentando con payload mínimo:', String(e.message).slice(0, 200));
      const j = await llamarAPI('POST', '/api/v1/bot/', base);
      return { botId: j.id || null, crudo: j, sinTranscriptConfig: true };
    }
  }

  // ---- Consultar estado del bot. ----
  async function estadoBot(botId) {
    return await llamarAPI('GET', '/api/v1/bot/' + botId + '/');
  }

  // ---- Cancelar/eliminar un bot programado (reunión cancelada o reprogramada). ----
  async function cancelarBot(botId) {
    try { await llamarAPI('DELETE', '/api/v1/bot/' + botId + '/'); return true; }
    catch (e) {
      // Algunos estados no permiten DELETE; intentar leave_call como respaldo.
      try { await llamarAPI('POST', '/api/v1/bot/' + botId + '/leave_call/'); return true; } catch (e2) { }
      console.error('[recall] cancelar bot ' + botId + ':', e.message);
      return false;
    }
  }

  // El bot terminó si su status más reciente es "done" (o fatal).
  function estadoResumido(bot) {
    const cambios = (bot && (bot.status_changes || bot.statuses)) || [];
    const ultimo = cambios.length ? (cambios[cambios.length - 1].code || cambios[cambios.length - 1].status || '') : (bot && bot.status && bot.status.code) || '';
    if (/done|call_ended|analysis_done/i.test(ultimo)) return 'done';
    if (/fatal|error/i.test(ultimo)) return 'fatal';
    return ultimo || 'desconocido';
  }

  // Participantes de la reunión (quiénes entraron), tolerante a variantes de payload.
  function extraerParticipantes(bot) {
    const listas = [bot && bot.meeting_participants, bot && bot.participants,
      bot && bot.meeting_metadata && bot.meeting_metadata.participants].filter(Array.isArray);
    const nombres = new Set();
    listas.forEach(l => l.forEach(p => { const n = (p && (p.name || p.display_name)) || null; if (n) nombres.add(String(n)); }));
    return [...nombres];
  }

  // ---- Descargar y normalizar el transcript de un bot terminado. ----
  // Devuelve { participantes: [..], turnos: [{speaker, texto}], texto } o null si aún no hay transcript.
  async function obtenerTranscript(botId) {
    const bot = await estadoBot(botId);
    const est = estadoResumido(bot);

    // Ubicar el download_url del transcript (estructura actual: recordings[].media_shortcuts.transcript.data.download_url).
    let url = null;
    const recs = (bot && bot.recordings) || [];
    for (const rec of recs) {
      const t = rec && rec.media_shortcuts && rec.media_shortcuts.transcript;
      if (t && t.data && t.data.download_url) { url = t.data.download_url; break; }
    }
    // Variantes antiguas del payload.
    if (!url && bot && bot.media_shortcuts && bot.media_shortcuts.transcript && bot.media_shortcuts.transcript.data) {
      url = bot.media_shortcuts.transcript.data.download_url || null;
    }
    const recordingId = (recs[0] && recs[0].id) || null;
    if (!url) return { listo: false, estado: est, participantes: extraerParticipantes(bot), recordingId };

    const r = await fetch(url);
    if (!r.ok) return { listo: false, estado: est, participantes: extraerParticipantes(bot), recordingId };
    const raw = await r.json();

    // Normalizar: la API entrega una lista de segmentos { participant: {name}, words: [{text}] }
    // (con variantes según proveedor). Convertimos a turnos {speaker, texto} fusionando consecutivos.
    const turnos = [];
    const items = Array.isArray(raw) ? raw : (raw.transcript || raw.data || []);
    for (const it of items) {
      const speaker = (it.participant && (it.participant.name || it.participant.display_name)) || it.speaker || it.name || '—';
      let texto = '';
      if (Array.isArray(it.words)) texto = it.words.map(w => (w && (w.text || w.word)) || '').join(' ').replace(/\s+/g, ' ').trim();
      else texto = String(it.text || it.transcript || '').trim();
      if (!texto) continue;
      const prev = turnos[turnos.length - 1];
      if (prev && prev.speaker === speaker) prev.texto += ' ' + texto;
      else turnos.push({ speaker: String(speaker), texto });
    }
    const participantes = extraerParticipantes(bot);
    const hablantes = [...new Set(turnos.map(t => t.speaker))];
    hablantes.forEach(h => { if (h !== '—' && !participantes.includes(h)) participantes.push(h); });
    const texto = turnos.map(t => t.speaker + ': ' + t.texto).join('\n');
    return { listo: turnos.length > 0, estado: est, participantes, turnos, texto };
  }

  return { configurado, crearBot, estadoBot, cancelarBot, obtenerTranscript, crearTranscriptAsync, estadoResumido };
};
