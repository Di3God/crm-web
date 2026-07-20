// =============================================================
// PLANES DE ACCION POR WHATSAPP (cortes 9am / 1pm / 6pm, hora Peru)
// Cada mensaje se calcula AL MOMENTO del envio con el estado vivo del CRM:
// si la gestora ya gestiono entre cortes, el pendiente desaparece solo.
// Sin codigos de lead (solo nombres) + monto en juego por lead y total.
// =============================================================
module.exports = function ({ db, consolidarLead, enviarAlertaWA, peruFecha, construirRankingDia }) {

  const UMBRAL_REU = 4;   // dias sin gestion en Reunion efectiva -> rojo
  const UMBRAL_NEG = 7;   // dias sin gestion en Cierre pendiente -> rojo
  const MAX_3X5 = 5;      // leads de contactabilidad por mensaje (los mas prioritarios)
  const LIMA_OFF = -5 * 3600000;

  const diaLima = (iso) => Math.floor((new Date(iso).getTime() + LIMA_OFF) / 86400000);
  const horaLima = (iso) => new Date(new Date(iso).getTime() + LIMA_OFF).getUTCHours();
  const hoyLima = () => diaLima(new Date().toISOString());
  // Sello de fecha/hora Lima al momento de generar (p.ej. "02/07 · 15:45")
  const selloHora = () => { const d = new Date(Date.now() + LIMA_OFF); return String(d.getUTCDate()).padStart(2,'0') + '/' + String(d.getUTCMonth()+1).padStart(2,'0') + ' · ' + d.toISOString().slice(11,16); };

  function fmtMonto(lead) {
    if (lead.montoReal != null && !isNaN(Number(lead.montoReal))) return 'S/ ' + Number(lead.montoReal).toLocaleString('es-PE');
    if (lead.montoRango) return lead.montoRango;
    return null;
  }
  function montoNum(lead) { return (lead.montoReal != null && !isNaN(Number(lead.montoReal))) ? Number(lead.montoReal) : 0; }

  function diasSinGestion(gestiones) {
    if (!gestiones.length) return null;
    return hoyLima() - diaLima(gestiones[gestiones.length - 1].fecha);
  }
  // Mínimo de intentos del D1 según la hora de asignación (regla 3/2/1); días 2-5: 3 por día.
  function esperadosAcum(lead, diaCiclo) {
    const h = horaLima(lead.fechaAsignacion || lead.fechaCarga);
    const minD1 = h < 12 ? 3 : (h < 16 ? 2 : 1);
    if (diaCiclo <= 1) return minD1;
    return minD1 + Math.min(diaCiclo - 1, 4) * 3;
  }
  // Mínimo esperado SOLO DE HOY (sin acumular):
  //  · Si el lead LLEGÓ HOY (su D1 es hoy): regla 3/2/1 según la hora de llegada (no se le exige día completo).
  //  · Cualquier día posterior: 3 intentos (es un día completo, sin importar a qué hora llegó en su día).
  function minimoHoy(lead, diaCiclo) {
    const f = lead.fechaAsignacion || lead.fechaCarga;
    const llegoHoy = diaLima(f) === hoyLima();
    if (diaCiclo <= 1 && llegoHoy) {
      const h = horaLima(f);
      return h < 12 ? 3 : (h < 16 ? 2 : 1);
    }
    return 3;
  }

  // Reune el material de una gestora: leads activos con consolidado, gestiones y clasificacion.
  function materialGestora(nombre) {
    const leads = db.prepare('SELECT * FROM leads WHERE asesor = ?').all(nombre);
    const hoy = hoyLima();
    const m = { agendadosHoy: [], reuEfectiva: [], negociacion: [], contactabilidad: [], manana: [], frios: [] };
    for (const lead of leads) {
      const gestiones = db.prepare('SELECT * FROM gestiones WHERE codigo = ? ORDER BY fecha ASC').all(lead.codigo);
      const consol = consolidarLead(lead, gestiones) || { etapa: 'Contactabilidad 3x5' };
      const etapa = consol.etapa || 'Contactabilidad 3x5';
      if (/^Cerrado/.test(etapa)) continue;
      const gHoy = gestiones.filter(g => diaLima(g.fecha) === hoy).length;
      const sinG = diasSinGestion(gestiones);
      const item = { lead, etapa, gestiones, gHoy, sinG, monto: fmtMonto(lead), montoN: montoNum(lead), prob: consol.probabilidad || 0 };
      // Reunion agendada HOY / MANANA (ultima gestion con reunion Agendada)
      const conReu = [...gestiones].reverse().find(g => g.fechaReunion && g.estadoReunion === 'Agendada');
      if (conReu) {
        const dR = diaLima(conReu.fechaReunion);
        const hora = new Date(new Date(conReu.fechaReunion).getTime() + LIMA_OFF).toISOString().slice(11, 16);
        if (dR === hoy) m.agendadosHoy.push({ ...item, hora });
        else if (dR === hoy + 1) m.manana.push({ ...item, hora });
      }
      if (etapa === 'Reunion efectiva - seguimiento') m.reuEfectiva.push(item);
      else if (etapa === 'Cierre pendiente') m.negociacion.push(item);
      else if (etapa === 'Contactabilidad 3x5') {
        const dC = hoy - diaLima(lead.fechaAsignacion || lead.fechaCarga) + 1; // D1..D5
        if (dC >= 1 && dC <= 5) {
          const intentosHoy = gestiones.filter(g => diaLima(g.fecha) === hoy).length;
          const minHoy = minimoHoy(lead, dC);
          const cumpleHoy = intentosHoy >= minHoy;
          m.contactabilidad.push({ ...item, dC, intentosHoy, minHoy, cumpleHoy, intentos: gestiones.length, esperados: esperadosAcum(lead, dC) });
        }
        // Frío: 3+ días sin NINGUNA gestión (riesgo real, persiste hasta resolver).
        if ((sinG == null && dC >= 3) || (sinG != null && sinG >= 3)) m.frios.push(item);
      }
    }
    // 3x5: ordena por los más atrasados de HOY (menor cumplimiento) primero.
    m.contactabilidad.sort((a, b) => (a.intentosHoy - a.minHoy) - (b.intentosHoy - b.minHoy) || b.prob - a.prob);
    m.agendadosHoy.sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    m.reuEfectiva.sort((a, b) => (b.sinG || 0) - (a.sinG || 0));
    m.negociacion.sort((a, b) => (b.sinG || 0) - (a.sinG || 0));
    return m;
  }

  const linMonto = (it) => it.monto ? ' · 💵 ' + it.monto : '';
  function totalJuego(items) {
    const n = items.reduce((s, i) => s + i.montoN, 0);
    const sinM = items.filter(i => !i.montoN).length;
    if (!n && !items.length) return '';
    let s = n ? 'S/ ' + n.toLocaleString('es-PE') : '';
    if (sinM) s += (s ? ' ' : '') + '(+' + sinM + ' por definir)';
    return s;
  }

  // ===== Texto por corte (formato WhatsApp) — 3x5 DIARIO sin arrastre + fríos =====
  const primerNom = n => (n || '').split(' ')[0];
  const listaNombres = (arr, max) => arr.slice(0, max).map(i => '   • ' + i.lead.nombre + (i.montoN ? ' · ' + i.monto : '')).join('\n') + (arr.length > max ? '\n   • +' + (arr.length - max) + ' más' : '');
  function bloqueFrios(m) {
    if (!m.frios.length) return '';
    return '\n⚠️ *' + m.frios.length + ' frío' + (m.frios.length === 1 ? '' : 's') + '* (3+ días sin contacto) → reactivar o cerrar';
  }

  // 9am · Plan del día: la meta, sin juzgar cumplimiento todavía.
  function plan9am(nombre, m) {
    const P = ['🌅 *PLAN DEL DÍA — ' + primerNom(nombre) + '* · ' + selloHora(), '━━━━━━━━━━━━'];
    const activos = m.contactabilidad;
    const metaInt = activos.reduce((s, i) => s + i.minHoy, 0);
    const nuevos = activos.filter(i => i.intentos === 0);
    P.push('📞 *3x5:* ' + activos.length + ' lead' + (activos.length === 1 ? '' : 's') + ' activos → ' + metaInt + ' intentos por hacer hoy');
    if (nuevos.length) P.push('🆕 *' + nuevos.length + ' sin primer contacto* → arranca por acá');
    if (m.agendadosHoy.length) P.push('📅 *' + m.agendadosHoy.length + ' reunion' + (m.agendadosHoy.length === 1 ? '' : 'es') + ' agendada' + (m.agendadosHoy.length === 1 ? '' : 's') + ' hoy*');
    const frios = bloqueFrios(m); if (frios) P.push(frios.trim());
    const tot = totalJuego(activos.concat(m.agendadosHoy));
    if (tot) P.push('💼 En juego: ' + tot);
    if (!activos.length && !m.agendadosHoy.length) P.push('✅ Sin pendientes de 3x5. ¡Buen arranque!');
    return P.join('\n');
  }

  // 1pm · Pulso: quién ya se tocó HOY y quién falta (base viva al instante).
  function plan1pm(nombre, m) {
    const P = ['☀️ *CORTE 1PM — ' + primerNom(nombre) + '* · ' + selloHora(), '━━━━━━━━━━━━'];
    const activos = m.contactabilidad;
    const conIntento = activos.filter(i => i.intentosHoy > 0);
    const sinTocar = activos.filter(i => i.intentosHoy === 0);
    P.push('📞 *3x5:* ' + activos.length + ' activos · ' + conIntento.length + ' ya con intento hoy');
    if (sinTocar.length) { P.push('⚠️ *' + sinTocar.length + ' sin tocar aún* — contáctalos:'); P.push(listaNombres(sinTocar, 4)); }
    else if (activos.length) P.push('✅ Todos con al menos un intento hoy 👏');
    const tarde = m.agendadosHoy.filter(i => (i.hora || '') >= '13:00');
    if (tarde.length) { P.push('📅 *Esta tarde:*'); tarde.forEach(i => P.push('   • ' + i.lead.nombre + ' · ' + i.hora)); }
    const frios = bloqueFrios(m); if (frios) P.push(frios.trim());
    return P.join('\n');
  }

  // 6pm · Cierre: veredicto del día (cumplió su mínimo de HOY), sin arrastre.
  function plan6pm(nombre, m) {
    const P = ['🌙 *CIERRE — ' + primerNom(nombre) + '* · ' + selloHora(), '━━━━━━━━━━━━'];
    const activos = m.contactabilidad;
    const cumplen = activos.filter(i => i.cumpleHoy);
    const cortos = activos.filter(i => !i.cumpleHoy);
    if (activos.length) {
      P.push('📞 *3x5 del día:* ' + activos.length + ' activos');
      const icoOk = cumplen.length > 0 ? '✅' : '▫️';
      const icoCorto = cortos.length > 0 ? '🔴' : '✅';
      P.push('   ' + icoOk + ' ' + cumplen.length + ' cumplieron su mínimo · ' + icoCorto + ' ' + cortos.length + ' les faltan intentos');
      if (cortos.length) { P.push('*Les faltan intentos hoy:*'); cortos.slice(0, 5).forEach(i => P.push('   • ' + i.lead.nombre + ' · ' + i.intentosHoy + '/' + i.minHoy)); if (cortos.length > 5) P.push('   • +' + (cortos.length - 5) + ' más'); }
    }
    const frios = bloqueFrios(m); if (frios) P.push(frios.trim());
    if (m.manana.length) { P.push('📅 *Mañana:*'); m.manana.forEach(i => P.push('   • ' + i.lead.nombre + ' · ' + i.hora)); }
    if (!activos.length && !m.manana.length && !m.frios.length) P.push('✅ Día cumplido. Plan nuevo a las 9am. 💪');
    return P.join('\n');
  }

  // ===== Reporte de GESTIÓN del día (consolidado, 1 mensaje al grupo) — reusa el ranking del CRM =====
  // corte '1pm' = actividad de la mañana hasta esa hora; '6pm' = total del día. Mismas métricas del ranking.
  const MESES_G = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIASEM_G = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  function fechaCortaG() { const d = new Date(Date.now() + LIMA_OFF); return DIASEM_G[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MESES_G[d.getUTCMonth()].slice(0, 3); }
  function reporteGestion(corte) {
    if (typeof construirRankingDia !== 'function') return null;
    const rk = construirRankingDia();
    const filas = (rk.ranking || []).filter(r => (r.intentos || 0) > 0 || (r.agendados || 0) > 0);
    const titulo = corte === '6pm' ? 'GESTIÓN DEL DÍA · cierre 6pm' : 'GESTIÓN · corte 1pm (mañana)';
    const P = ['📋 *' + titulo + '*', '🗓 ' + fechaCortaG(), '━━━━━━━━━━━━'];
    if (!filas.length) { P.push('Sin gestiones registradas aún hoy.'); return P.join('\n'); }
    // Totales del equipo
    const T = filas.reduce((a, r) => ({ int: a.int + (r.intentos || 0), con: a.con + (r.conectados || 0), cal: a.cal + (r.calificados || 0), ag: a.ag + (r.agendados || 0) }), { int: 0, con: 0, cal: 0, ag: 0 });
    P.push('👥 *Equipo:* ' + T.int + ' intentos · ' + T.con + ' conectados · ' + T.cal + ' calificados · ' + T.ag + ' agendados', '');
    // Por GP, ordenado por puntaje (ya viene ordenado del ranking)
    const medalla = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '▫️';
    filas.forEach((r, i) => {
      P.push(medalla(i) + ' *' + r.asesor + '* — ' + (r.puntaje != null ? r.puntaje : 0) + ' pts');
      P.push('     ' + (r.intentos || 0) + ' intentos · ' + (r.conectados || 0) + ' conect · ' + (r.calificados || 0) + ' calif · ' + (r.agendados || 0) + ' agend');
    });
    return P.join('\n');
  }

  // ¿Domingo en Perú? (no se envía nada los domingos)
  function esDomingoPeru() { return new Date(Date.now() + LIMA_OFF).getUTCDay() === 0; }

  // Genera los textos de un corte para todas las gestoras activas (estado VIVO al momento).
  function generarPlanes(corte) {
    const gestoras = db.prepare("SELECT nombre FROM usuarios WHERE activo=1 AND rol='gestora'").all();
    return gestoras.map(g => {
      const m = materialGestora(g.nombre);
      const texto = corte === '1pm' ? plan1pm(g.nombre, m) : corte === '6pm' ? plan6pm(g.nombre, m) : plan9am(g.nombre, m);
      return { gestora: g.nombre, texto };
    });
  }

  // Envío manual de un corte AHORA (mismo texto vivo). Marca el flag para que el scheduler no duplique hoy.
  async function enviarCorteAhora(corte) {
    const planes = generarPlanes(corte);
    const clave = 'wa_corte_' + corte + '_' + peruFecha(new Date().toISOString());
    db.prepare('INSERT OR REPLACE INTO app_config (clave,valor) VALUES (?,?)').run(clave, new Date().toISOString());
    for (const p of planes) await enviarAlertaWA(p.texto);
    // Reporte de gestión consolidado en 1pm y 6pm.
    if (corte === '1pm' || corte === '6pm') { const rg = reporteGestion(corte); if (rg) await enviarAlertaWA(rg); }
    return planes.length;
  }
  // Envío manual SOLO del reporte de gestión (sin los planes por GP).
  async function enviarGestionAhora(corte) {
    const rg = reporteGestion(corte === '6pm' ? '6pm' : '1pm');
    if (rg) await enviarAlertaWA(rg);
    return !!rg;
  }

  // Scheduler: revisa cada minuto la hora Peru; envia cada corte una sola vez al dia.
  const esDiaLaboralPeru = () => { const d = new Date(Date.now() + LIMA_OFF).getUTCDay(); return d >= 1 && d <= 5; }; // v1.452
  const CORTES = { '09:00': '9am', '13:00': '1pm', '18:00': '6pm' };
  function iniciarCortes() {
    setInterval(async () => {
      try {
        if (!esDiaLaboralPeru()) return; // sábado/domingo: silencio (v1.452)
        if (esDomingoPeru()) return; // domingos no se envía nada
        const now = new Date(Date.now() + LIMA_OFF);
        const hhmm = now.toISOString().slice(11, 16);
        const corte = CORTES[hhmm];
        if (!corte) return;
        const clave = 'wa_corte_' + corte + '_' + peruFecha(new Date().toISOString());
        const ya = db.prepare('SELECT valor FROM app_config WHERE clave=?').get(clave);
        if (ya) return;
        db.prepare('INSERT OR REPLACE INTO app_config (clave,valor) VALUES (?,?)').run(clave, new Date().toISOString());
        for (const p of generarPlanes(corte)) await enviarAlertaWA(p.texto);
        if (corte === '1pm' || corte === '6pm') { const rg = reporteGestion(corte); if (rg) await enviarAlertaWA(rg); }
        console.log('[WA] corte ' + corte + ' enviado');
      } catch (e) { console.error('[WA] corte fallo:', e.message); }
    }, 60000);
  }

  return { generarPlanes, iniciarCortes, enviarCorteAhora, enviarGestionAhora, reporteGestion };
};
