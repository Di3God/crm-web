// =============================================================
// PLANES DE ACCION POR WHATSAPP (cortes 9am / 1pm / 6pm, hora Peru)
// Cada mensaje se calcula AL MOMENTO del envio con el estado vivo del CRM:
// si la gestora ya gestiono entre cortes, el pendiente desaparece solo.
// Sin codigos de lead (solo nombres) + monto en juego por lead y total.
// =============================================================
module.exports = function ({ db, consolidarLead, enviarAlertaWA, peruFecha }) {

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
  // Minimo de intentos del D1 segun la hora de asignacion (regla 3/2/1); dias 2-5: 3 por dia.
  function esperadosAcum(lead, diaCiclo) {
    const h = horaLima(lead.fechaAsignacion || lead.fechaCarga);
    const minD1 = h < 12 ? 3 : (h < 16 ? 2 : 1);
    if (diaCiclo <= 1) return minD1;
    return minD1 + Math.min(diaCiclo - 1, 4) * 3;
  }

  // Reune el material de una gestora: leads activos con consolidado, gestiones y clasificacion.
  function materialGestora(nombre) {
    const leads = db.prepare('SELECT * FROM leads WHERE asesor = ?').all(nombre);
    const hoy = hoyLima();
    const m = { agendadosHoy: [], reuEfectiva: [], negociacion: [], contactabilidad: [], manana: [] };
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
          const intentos = gestiones.length;
          const esperados = esperadosAcum(lead, dC);
          m.contactabilidad.push({ ...item, dC, intentos, esperados });
        }
      }
    }
    // 3x5: prioriza los mas atrasados vs. su esperado, luego mayor probabilidad. Tope 5.
    m.contactabilidad.sort((a, b) => (a.intentos - a.esperados) - (b.intentos - b.esperados) || b.prob - a.prob);
    m.contactabilidad = m.contactabilidad.slice(0, MAX_3X5);
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

  // ===== Texto por corte (formato WhatsApp) =====
  function plan9am(nombre, m) {
    const P = ['🌅 *PLAN DEL DÍA — ' + nombre.split(' ')[0] + '* · ' + selloHora(), '━━━━━━━━━━━━'];
    const todos = [];
    if (m.agendadosHoy.length) {
      P.push('📅 *AGENDADOS HOY* (atender sí o sí)');
      m.agendadosHoy.forEach(i => { P.push('• *' + i.lead.nombre + '* · ' + (i.hora || '') + linMonto(i)); todos.push(i); });
    }
    const reu = m.reuEfectiva.filter(i => (i.sinG ?? 99) >= 2);
    if (reu.length) {
      P.push('', '🤝 *REUNIÓN EFECTIVA — HAY QUE CERRAR*');
      reu.forEach(i => { P.push('• *' + i.lead.nombre + '* · ' + i.sinG + 'd sin gestión' + ((i.sinG >= UMBRAL_REU) ? ' 🔴' : '') + linMonto(i)); todos.push(i); });
    }
    const neg = m.negociacion.filter(i => (i.sinG ?? 99) >= 3);
    if (neg.length) {
      P.push('', '💰 *EN NEGOCIACIÓN — ¿QUÉ PASA AQUÍ?*');
      neg.forEach(i => { P.push('• *' + i.lead.nombre + '* · ' + i.sinG + 'd esperando' + ((i.sinG >= UMBRAL_NEG) ? ' 🔴' : '') + linMonto(i)); todos.push(i); });
    }
    if (m.contactabilidad.length) {
      P.push('', '📞 *TU 3x5 — CONTACTABILIDAD* (top ' + m.contactabilidad.length + ')');
      m.contactabilidad.forEach(i => {
        const flag = i.intentos < i.esperados ? ' ⚠️' : ' ✅';
        P.push('• *' + i.lead.nombre + '* · D' + i.dC + ' de 5 · ' + i.intentos + '/' + i.esperados + ' int.' + flag + linMonto(i)); todos.push(i);
      });
    }
    const tot = totalJuego(todos);
    P.push('━━━━━━━━━━━━');
    if (tot) P.push('💼 *En juego hoy: ' + tot + '*');
    if (!todos.length) P.push('✅ Sin pendientes urgentes. ¡Buen arranque!');
    return P.join('\n');
  }

  function plan1pm(nombre, m) {
    const P = ['☀️ *CORTE 1PM — ' + nombre.split(' ')[0] + '* · ' + selloHora(), '━━━━━━━━━━━━'];
    let hubo = false;
    const sec = (titulo) => { if (hubo) P.push(''); P.push(titulo); hubo = true; };
    const sinHoy = (arr) => arr.filter(i => i.gHoy === 0);
    const c = sinHoy(m.contactabilidad);
    if (c.length) { sec('⚠️ *3x5 aún sin tocar hoy:*'); c.forEach(i => P.push('• *' + i.lead.nombre + '* · ' + i.intentos + '/' + i.esperados + ' int.' + linMonto(i))); }
    const r = sinHoy(m.reuEfectiva.filter(i => (i.sinG ?? 99) >= 2));
    if (r.length) { sec('🤝 *Reunión efectiva sin gestión hoy:*'); r.forEach(i => P.push('• *' + i.lead.nombre + '*' + linMonto(i))); }
    const n = sinHoy(m.negociacion.filter(i => (i.sinG ?? 99) >= 3));
    if (n.length) { sec('💰 *Negociación sin gestión hoy:*'); n.forEach(i => P.push('• *' + i.lead.nombre + '* · ' + i.sinG + 'd' + linMonto(i))); }
    const tarde = m.agendadosHoy.filter(i => (i.hora || '') >= '13:00');
    if (tarde.length) { sec('📅 *Recuerda esta tarde:*'); tarde.forEach(i => P.push('• *' + i.lead.nombre + '* · ' + i.hora)); }
    if (!hubo) P.push('✅ Todo lo de la mañana está gestionado. 👏');
    return P.join('\n');
  }

  function plan6pm(nombre, m) {
    const P = ['🌙 *CIERRE DEL DÍA — ' + nombre.split(' ')[0] + '* · ' + selloHora(), '━━━━━━━━━━━━'];
    const inc = m.contactabilidad.filter(i => i.intentos < i.esperados);
    if (inc.length) { P.push('❌ *No llegaron a su mínimo hoy* (prioridad #1 mañana):'); inc.forEach(i => P.push('• *' + i.lead.nombre + '* · ' + i.intentos + '/' + i.esperados + linMonto(i))); }
    const negRojo = m.negociacion.filter(i => (i.sinG ?? 0) >= UMBRAL_NEG);
    if (negRojo.length) { P.push('', '💰 *Sigue esperando:*'); negRojo.forEach(i => P.push('• *' + i.lead.nombre + '* · ' + i.sinG + 'd en negociación 🔴' + linMonto(i))); }
    if (m.manana.length) { P.push('', '📅 *Mañana tienes:*'); m.manana.forEach(i => P.push('• *' + i.lead.nombre + '* · ' + i.hora + linMonto(i))); }
    if (P.length === 2) P.push('✅ Día cumplido. Mañana llega tu plan a las 9. 💪');
    return P.join('\n');
  }

  // Genera los textos de un corte para todas las gestoras activas (estado VIVO al momento).
  function generarPlanes(corte) {
    const gestoras = db.prepare("SELECT nombre FROM usuarios WHERE activo=1 AND rol='gestora'").all();
    return gestoras.map(g => {
      const m = materialGestora(g.nombre);
      const texto = corte === '1pm' ? plan1pm(g.nombre, m) : corte === '6pm' ? plan6pm(g.nombre, m) : plan9am(g.nombre, m);
      return { gestora: g.nombre, texto };
    });
  }

  // Envio manual de un corte AHORA (mismo texto vivo). Marca el flag para que el scheduler no duplique hoy.
  async function enviarCorteAhora(corte) {
    const planes = generarPlanes(corte);
    const clave = 'wa_corte_' + corte + '_' + peruFecha(new Date().toISOString());
    db.prepare('INSERT OR REPLACE INTO app_config (clave,valor) VALUES (?,?)').run(clave, new Date().toISOString());
    for (const p of planes) await enviarAlertaWA(p.texto);
    return planes.length;
  }

  // Scheduler: revisa cada minuto la hora Peru; envia cada corte una sola vez al dia.
  const CORTES = { '09:00': '9am', '13:00': '1pm', '18:00': '6pm' };
  function iniciarCortes() {
    setInterval(async () => {
      try {
        const now = new Date(Date.now() + LIMA_OFF);
        const hhmm = now.toISOString().slice(11, 16);
        const corte = CORTES[hhmm];
        if (!corte) return;
        const clave = 'wa_corte_' + corte + '_' + peruFecha(new Date().toISOString());
        const ya = db.prepare('SELECT valor FROM app_config WHERE clave=?').get(clave);
        if (ya) return;
        db.prepare('INSERT OR REPLACE INTO app_config (clave,valor) VALUES (?,?)').run(clave, new Date().toISOString());
        for (const p of generarPlanes(corte)) await enviarAlertaWA(p.texto);
        console.log('[WA] corte ' + corte + ' enviado');
      } catch (e) { console.error('[WA] corte fallo:', e.message); }
    }, 60000);
  }

  return { generarPlanes, iniciarCortes, enviarCorteAhora };
};
