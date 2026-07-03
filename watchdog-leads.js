// =============================================================
// WATCHDOG DE LEADS — avisa al grupo de MARKETING cuando dejan de llegar leads.
//   · Si pasan WATCH_PRIMERA_H horas (def. 2) desde el último lead → 1ª alerta.
//   · Luego, cada WATCH_REPITE_H horas (def. 1) sin leads → repite la alerta.
//   · Al llegar un lead, se resetea el reloj y el ciclo se rearma solo.
// Destino: WA_GRUPO_MKT_JID. Si no está configurado, el watchdog no hace nada.
// =============================================================
module.exports = function ({ db, enviarAlertaWA }) {
  const H = 3600000;
  const PRIMERA_MS = (Number(process.env.WATCH_PRIMERA_H) || 2) * H;   // silencio inicial tolerado
  const REPITE_MS = (Number(process.env.WATCH_REPITE_H) || 1) * H;     // cadencia de recordatorio
  const JID = () => process.env.WA_GRUPO_MKT_JID || null;

  const getCfg = k => { try { const r = db.prepare('SELECT valor FROM app_config WHERE clave=?').get(k); return r ? r.valor : null; } catch (e) { return null; } };
  const setCfg = (k, v) => { try { db.prepare('INSERT INTO app_config (clave,valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor').run(k, String(v)); } catch (e) { } };

  // Llamar cada vez que ENTRA un lead: resetea el reloj y limpia el estado de alerta.
  function registrarLead() {
    setCfg('watch_ultimo_lead', Date.now());
    setCfg('watch_ultima_alerta', '');
  }

  const MENSAJE = '🚨 *¡No están llegando leads!*\nJean, por favor tu apoyo. 🙏\n\nHace rato que no ingresa una solicitud nueva por las campañas.';

  async function chequear() {
    const jid = JID();
    if (!jid) return; // sin grupo de marketing configurado, no molesta

    const ahora = Date.now();
    let ultimoLead = Number(getCfg('watch_ultimo_lead'));
    // Primer arranque: si no hay marca, tomamos el lead más reciente de la BD (o ahora, para no falsear).
    if (!ultimoLead || !isFinite(ultimoLead)) {
      let base = ahora;
      try {
        const r = db.prepare("SELECT MAX(fechaCarga) AS f FROM leads WHERE COALESCE(archivado,0)=0").get();
        if (r && r.f) { const t = new Date(r.f).getTime(); if (isFinite(t)) base = t; }
      } catch (e) { }
      setCfg('watch_ultimo_lead', base);
      ultimoLead = base;
    }

    const silencio = ahora - ultimoLead;
    if (silencio < PRIMERA_MS) return; // aún dentro de la ventana tolerada

    const ultimaAlerta = Number(getCfg('watch_ultima_alerta'));
    // ¿Toca alertar? Primera vez (sin alerta previa en esta sequía) o ya pasó la cadencia de repetición.
    const tocaPrimera = !ultimaAlerta || !isFinite(ultimaAlerta) || ultimaAlerta < ultimoLead;
    const tocaRepite = ultimaAlerta && isFinite(ultimaAlerta) && (ahora - ultimaAlerta) >= REPITE_MS;
    if (!tocaPrimera && !tocaRepite) return;

    const horas = Math.floor(silencio / H);
    const mins = Math.floor((silencio % H) / 60000);
    const tiempo = horas > 0 ? horas + 'h ' + mins + 'min' : mins + ' min';
    try {
      await enviarAlertaWA(MENSAJE + '\n⏱ Último lead hace ' + tiempo + '.', jid);
      setCfg('watch_ultima_alerta', ahora);
      console.log('[WATCHDOG] alerta enviada · silencio ' + tiempo);
    } catch (e) { console.error('[WATCHDOG] fallo al enviar:', e.message); }
  }

  function iniciar() {
    if (!JID()) { console.log('[WATCHDOG] WA_GRUPO_MKT_JID no configurado: watchdog de leads desactivado'); return; }
    setInterval(() => { chequear().catch(() => { }); }, 60000); // revisa cada minuto
    console.log('[WATCHDOG] activo · alerta a las ' + (PRIMERA_MS / H) + 'h, repite cada ' + (REPITE_MS / H) + 'h');
  }

  return { registrarLead, iniciar, chequear };
};
