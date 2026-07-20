// =============================================================
// REPORTES DE LEADS POR FRANJA — al grupo de MARKETING (WA_GRUPO_MKT_JID).
// 4 cortes diarios (hora Perú), cada uno reporta cuántos leads entraron en su franja:
//   · 09:00 → franja 00:00–09:00
//   · 13:00 → franja 09:00–13:00
//   · 18:00 → franja 13:00–18:00
//   · 23:59 → franja 18:00–23:59
// Cuenta B2C (leads de campaña) y B2B (solicitudes creadas), con desglose por origen.
// Un solo envío por corte y día (dedup en app_config). Sin variable, no hace nada.
// =============================================================
module.exports = function ({ db, enviarAlertaWA, peruFecha }) {
  const LIMA_OFF = -5 * 3600000;
  const JID = () => process.env.WA_GRUPO_MKT_JID || null;
  const getCfg = k => { try { const r = db.prepare('SELECT valor FROM app_config WHERE clave=?').get(k); return r ? r.valor : null; } catch (e) { return null; } };
  const setCfg = (k, v) => { try { db.prepare('INSERT INTO app_config (clave,valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor').run(k, String(v)); } catch (e) { } };
  const hoyPeru = () => peruFecha(new Date().toISOString());

  // Cortes: hora Perú -> [franjaInicio, franjaFin] en horas.
  const CORTES = {
    '09:00': { ini: 0, fin: 9, etq: '12am a 9am' },
    '13:00': { ini: 9, fin: 13, etq: '9am a 1pm' },
    '18:00': { ini: 13, fin: 18, etq: '1pm a 6pm' },
    '23:59': { ini: 18, fin: 24, etq: '6pm a 12am' }
  };
  const DIAS_SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function fechaLarga(diaPeru) {
    const d = new Date(diaPeru + 'T12:00:00.000Z');
    const dow = DIAS_SEM[d.getUTCDay()];
    return dow.charAt(0).toUpperCase() + dow.slice(1) + ' ' + d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()];
  }

  // Convierte "YYYY-MM-DD" + hora Perú a un ISO UTC comparable con las columnas de fecha (guardadas en UTC).
  const limitePeru = (diaPeru, horaPeru) => new Date(new Date(diaPeru + 'T00:00:00.000Z').getTime() - LIMA_OFF + horaPeru * 3600000).toISOString();

  // Estados de ingreso que NO cuentan (descartes y errores). Todo lo demás (creado + duplicados) SÍ:
  // vino por campaña -> costó, así que se cuenta aunque sea duplicado.
  const EXCLUIR = "('descartado','error','error_validacion','no_normaliza','sin_datos','sin_nombre','incompleto')";
  function contar(desdeIso, hastaIso) {
    // B2C: ingresos brutos de campaña (marketing_ingresos), excluyendo descartes y errores.
    const b2cN = db.prepare(
      "SELECT COUNT(*) AS n FROM marketing_ingresos WHERE fechaRecepcion >= ? AND fechaRecepcion < ? " +
      "AND estado NOT IN " + EXCLUIR
    ).get(desdeIso, hastaIso).n;
    // B2B: ingresos brutos de campaña (b2b_ingresos), mismo criterio.
    const b2bN = db.prepare(
      "SELECT COUNT(*) AS n FROM b2b_ingresos WHERE fechaRecepcion >= ? AND fechaRecepcion < ? " +
      "AND estado NOT IN " + EXCLUIR
    ).get(desdeIso, hastaIso).n;
    return { b2cN, b2bN };
  }

  function generarReporte(corte, diaPeru) {
    const c = CORTES[corte]; if (!c) return null;
    diaPeru = diaPeru || hoyPeru();
    const desde = limitePeru(diaPeru, c.ini);
    const hasta = limitePeru(diaPeru, c.fin);
    const { b2cN, b2bN } = contar(desde, hasta);
    let txt = '📊 *Reporte de leads · ' + c.etq + '*\n🗓 ' + fechaLarga(diaPeru) + '\n\n' +
      '👥 *B2C:* ' + b2cN + ' lead' + (b2cN === 1 ? '' : 's') + '\n' +
      '🏢 *B2B:* ' + b2bN + ' lead' + (b2bN === 1 ? '' : 's');
    // Último corte del día: agrega el consolidado por canal (sin total mezclado).
    if (corte === '23:59') {
      const dia = contar(limitePeru(diaPeru, 0), limitePeru(diaPeru, 24));
      txt += '\n\n🌙 *Total del día*\n' +
        '👥 B2C: ' + dia.b2cN + ' · 🏢 B2B: ' + dia.b2bN;
    }
    return txt;
  }

  async function enviarCorte(corte) {
    const txt = generarReporte(corte);
    if (!txt) return false;
    await enviarAlertaWA(txt, JID());
    return true;
  }

  function iniciar() {
    if (!JID()) { console.log('[REPORTES] WA_GRUPO_MKT_JID no configurado: reportes por franja desactivados'); return; }
    setInterval(async () => {
      try {
        const _d = new Date(Date.now() + LIMA_OFF).getUTCDay();
        if (_d === 0 || _d === 6) return; // sábado/domingo: silencio (v1.452)
        const now = new Date(Date.now() + LIMA_OFF);
        const hhmm = now.toISOString().slice(11, 16);
        if (!CORTES[hhmm]) return;
        const clave = 'rep_franja_' + hhmm + '_' + hoyPeru();
        if (getCfg(clave)) return; // ya enviado hoy
        setCfg(clave, new Date().toISOString());
        await enviarAlertaWA(generarReporte(hhmm), JID());
        console.log('[REPORTES] corte ' + hhmm + ' enviado');
      } catch (e) { console.error('[REPORTES] fallo:', e.message); }
    }, 60000);
    console.log('[REPORTES] activo · cortes 09:00 / 13:00 / 18:00 / 23:59 Perú');
  }

  // Compat: el server aún llama registrarLead(); ya no se usa para alertas, se deja como no-op.
  function registrarLead() { }

  return { iniciar, registrarLead, generarReporte, enviarCorte };
};
