// =============================================================
// WATCHDOG DE LEADS — un solo aviso al grupo de MARKETING para AMBOS canales (B2C + B2B).
//   · Primera alerta cuando ALGÚN canal lleva WATCH_PRIMERA_H horas seco (def. 2).
//   · Repite cada WATCH_REPITE_H horas (def. 2), hasta WATCH_MAX_ALERTAS avisos (def. 3).
//   · Solo en horario laboral Perú (WATCH_INICIO..WATCH_FIN, def. 8..22).
//   · Cada lead resetea SU canal; el mensaje siempre reporta ambos.
// Destino: WA_GRUPO_MKT_JID. Sin esa variable, el watchdog no hace nada.
// =============================================================
module.exports = function ({ db, enviarAlertaWA }) {
  const H = 3600000, LIMA_OFF = -5 * 3600000;
  const PRIMERA_MS = (Number(process.env.WATCH_PRIMERA_H) || 2) * H;
  const REPITE_MS = (Number(process.env.WATCH_REPITE_H) || 2) * H;
  const MAX_ALERTAS = Number(process.env.WATCH_MAX_ALERTAS) || 3;
  const HORA_INI = Number(process.env.WATCH_INICIO) || 8;   // 8am Perú
  const HORA_FIN = Number(process.env.WATCH_FIN) || 22;      // 10pm Perú
  const JID = () => process.env.WA_GRUPO_MKT_JID || null;

  const getCfg = k => { try { const r = db.prepare('SELECT valor FROM app_config WHERE clave=?').get(k); return r ? r.valor : null; } catch (e) { return null; } };
  const setCfg = (k, v) => { try { db.prepare('INSERT INTO app_config (clave,valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor').run(k, String(v)); } catch (e) { } };
  const horaPeru = () => new Date(Date.now() + LIMA_OFF).getUTCHours();
  const fmtDur = ms => { const h = Math.floor(ms / H), m = Math.floor((ms % H) / 60000); return h > 0 ? h + 'h ' + m + 'min' : m + ' min'; };

  // Llamar cuando entra un lead de ese canal ('b2c' | 'b2b'): resetea su reloj y rearma el ciclo de alertas.
  function registrarLead(canal) {
    const c = canal === 'b2b' ? 'b2b' : 'b2c';
    setCfg('watch_ultimo_' + c, Date.now());
    setCfg('watch_ultima_alerta', '');
    setCfg('watch_n_alertas', '0');
  }

  // Último ingreso por canal; en el primer arranque toma el más reciente de la BD (o ahora).
  function ultimo(canal) {
    let t = Number(getCfg('watch_ultimo_' + canal));
    if (!t || !isFinite(t)) {
      let base = Date.now();
      try {
        const r = canal === 'b2b'
          ? db.prepare("SELECT MAX(fechaIngreso) AS f FROM b2b_solicitudes WHERE COALESCE(archivado,0)=0").get()
          : db.prepare("SELECT MAX(fechaCarga) AS f FROM leads WHERE COALESCE(archivado,0)=0").get();
        if (r && r.f) { const x = new Date(r.f).getTime(); if (isFinite(x)) base = x; }
      } catch (e) { }
      setCfg('watch_ultimo_' + canal, base); t = base;
    }
    return t;
  }

  async function chequear() {
    const jid = JID(); if (!jid) return;
    const ahora = Date.now();
    const silB2C = ahora - ultimo('b2c');
    const silB2B = ahora - ultimo('b2b');
    const peor = Math.max(silB2C, silB2B);
    if (peor < PRIMERA_MS) return;                 // ningún canal llegó al umbral
    const h = horaPeru();
    if (h < HORA_INI || h >= HORA_FIN) return;      // fuera de horario laboral: no molesta

    const ultimaAlerta = Number(getCfg('watch_ultima_alerta'));
    const nAlertas = Number(getCfg('watch_n_alertas')) || 0;
    const tocaPrimera = !ultimaAlerta || !isFinite(ultimaAlerta);
    const tocaRepite = ultimaAlerta && isFinite(ultimaAlerta) && (ahora - ultimaAlerta) >= REPITE_MS;
    if (!tocaPrimera && !tocaRepite) return;
    if (nAlertas >= MAX_ALERTAS) return;            // tope alcanzado: espera a que llegue un lead

    const linea = (nombre, sil) => (sil >= PRIMERA_MS ? '🔴' : '🟢') + ' ' + nombre + ': ' +
      (sil >= PRIMERA_MS ? 'hace ' + fmtDur(sil) : 'ok (' + fmtDur(sil) + ')');
    const ultimo3 = (nAlertas + 1 >= MAX_ALERTAS);
    const msg = '🚨 *¡No están llegando leads!*\nJean, por favor tu apoyo. 🙏\n\n' +
      linea('B2C', silB2C) + '\n' + linea('B2B', silB2B) +
      (ultimo3 ? '\n\n_(último recordatorio hasta que ingrese un lead)_' : '');
    try {
      await enviarAlertaWA(msg, jid);
      setCfg('watch_ultima_alerta', ahora);
      setCfg('watch_n_alertas', nAlertas + 1);
      console.log('[WATCHDOG] alerta ' + (nAlertas + 1) + '/' + MAX_ALERTAS + ' · B2C ' + fmtDur(silB2C) + ' · B2B ' + fmtDur(silB2B));
    } catch (e) { console.error('[WATCHDOG] fallo:', e.message); }
  }

  function iniciar() {
    if (!JID()) { console.log('[WATCHDOG] WA_GRUPO_MKT_JID no configurado: desactivado'); return; }
    setInterval(() => { chequear().catch(() => { }); }, 60000);
    console.log('[WATCHDOG] activo · 1ª a las ' + (PRIMERA_MS / H) + 'h, repite cada ' + (REPITE_MS / H) + 'h, máx ' + MAX_ALERTAS + ', ' + HORA_INI + '-' + HORA_FIN + 'h Perú');
  }

  return { registrarLead, iniciar, chequear };
};
