// =============================================================
// ALERTAS B2B POR WHATSAPP — grupo propio (WA_GRUPO_B2B_JID)
// Mismo patrón que alertas-wa.js (B2C) pero con la gestión B2B:
//   · Corte 9am  → Plan del día (nuevos, reuniones de hoy, SLA vencidos, tablero)
//   · Corte 6pm  → Cierre del día (actividad guardada + pendientes)
//   · Instantánea → nueva solicitud B2B entrante (webhook)
// El texto se genera AL MOMENTO del envío con el estado vivo del CRM.
// =============================================================
module.exports = function ({ db, enviarAlertaWA, peruFecha, etapaKanbanB2B, slaEtapaB2B, observacionesB2B, montoRangoFijo }) {

  const LIMA_OFF = -5 * 3600000;
  const JID = () => process.env.WA_GRUPO_B2B_JID || null;
  const hoyPeru = () => peruFecha(new Date().toISOString());
  const selloHora = () => { const d = new Date(Date.now() + LIMA_OFF); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + ' · ' + d.toISOString().slice(11, 16); };
  const primerNom = n => (n || '').split(' ')[0];
  const fmtS = n => 'S/ ' + Math.round(Number(n) || 0).toLocaleString('es-PE');

  // Envío al grupo B2B. Si no hay JID configurado, avisa una sola vez en logs y no rompe nada.
  let avisado = false;
  async function enviarAlertaB2BWA(texto) {
    const jid = JID();
    if (!jid) { if (!avisado) { console.log('[WA-B2B] WA_GRUPO_B2B_JID no configurado: alertas B2B desactivadas'); avisado = true; } return; }
    return enviarAlertaWA(texto, jid);
  }

  // Material vivo del tablero B2B (activas, sin archivadas ni desestimadas).
  function materialB2B() {
    const filas = db.prepare("SELECT * FROM b2b_solicitudes WHERE COALESCE(archivado,0)=0").all();
    const cards = [];
    for (const f of filas) {
      const col = etapaKanbanB2B(f);
      if (col === 'Desestimado') continue;
      cards.push({
        f, col,
        sla: slaEtapaB2B(col, f.fechaEtapa || f.fechaIngreso),
        obs: observacionesB2B(f) || [],
        monto: f.montoSolicitado != null ? Number(f.montoSolicitado) : (montoRangoFijo ? montoRangoFijo(f.montoRango) : 0),
        resp: f.responsableActual || null
      });
    }
    return cards;
  }
  function nombreCorto(f) { return f.razonSocial || f.nombreComercial || f.contacto || f.ruc || f.codigo; }

  // Reuniones comerciales programadas para HOY (guardadas y aún no realizadas).
  function reunionesHoy() {
    const hoy = hoyPeru();
    const filas = db.prepare("SELECT fr.codigoSolicitud, fr.checklist, s.razonSocial, s.nombreComercial, s.contacto, s.ruc, s.responsableActual FROM b2b_filtros fr JOIN b2b_solicitudes s ON s.codigo = fr.codigoSolicitud WHERE fr.tipoFiltro='reunion' AND COALESCE(s.archivado,0)=0").all();
    const out = [];
    for (const r of filas) {
      let c = {}; try { c = JSON.parse(r.checklist || '{}'); } catch (e) { }
      if (c.fecha === hoy && !c.realizada) out.push({ nombre: r.razonSocial || r.nombreComercial || r.contacto || r.ruc, hora: c.hora || '', modalidad: c.modalidad || '', resp: r.responsableActual });
    }
    return out.sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
  }

  // ---------- Corte 9am: Plan del día ----------
  function plan9am() {
    const cards = materialB2B();
    if (!cards.length) return null;
    const L = ['🌅 *B2B · Plan del día* (' + selloHora() + ')'];

    const nuevos = cards.filter(c => c.col === 'Solicitud');
    if (nuevos.length) {
      L.push('', '🆕 *Nuevas por trabajar (' + nuevos.length + ')*');
      nuevos.slice(0, 6).forEach(c => L.push('• ' + nombreCorto(c.f) + (c.monto ? ' · ' + fmtS(c.monto) : '') + (c.resp ? ' → ' + primerNom(c.resp) : ' → *sin asignar*')));
      if (nuevos.length > 6) L.push('  …y ' + (nuevos.length - 6) + ' más');
    }

    const reus = reunionesHoy();
    if (reus.length) {
      L.push('', '🤝 *Reuniones HOY (' + reus.length + ')*');
      reus.forEach(r => L.push('• ' + (r.hora ? r.hora + ' · ' : '') + r.nombre + (r.modalidad ? ' · ' + r.modalidad : '') + (r.resp ? ' → ' + primerNom(r.resp) : '')));
    }

    const vencidos = cards.filter(c => c.sla && c.sla.vencido).sort((a, b) => (b.sla.dias || 0) - (a.sla.dias || 0));
    if (vencidos.length) {
      L.push('', '🔥 *SLA vencido (' + vencidos.length + ')* — prioridad');
      vencidos.slice(0, 8).forEach(c => L.push('• ' + nombreCorto(c.f) + ' · ' + c.col + ' · ' + (c.sla.dias != null ? c.sla.dias + 'd' : 'vencido') + (c.resp ? ' → ' + primerNom(c.resp) : '')));
      if (vencidos.length > 8) L.push('  …y ' + (vencidos.length - 8) + ' más');
    }

    const porEtapa = {};
    cards.forEach(c => { porEtapa[c.col] = porEtapa[c.col] || { n: 0, m: 0 }; porEtapa[c.col].n++; porEtapa[c.col].m += c.monto || 0; });
    L.push('', '📊 *Tablero* · ' + cards.length + ' activas · ' + fmtS(cards.reduce((a, c) => a + (c.monto || 0), 0)) + ' en juego');
    Object.keys(porEtapa).forEach(k => L.push('• ' + k + ': ' + porEtapa[k].n + ' (' + fmtS(porEtapa[k].m) + ')'));
    return L.join('\n');
  }

  // ---------- Corte 6pm: Cierre del día ----------
  function plan6pm() {
    const hoy = hoyPeru();
    const eventos = db.prepare("SELECT accion, nombre, objetivo FROM auditoria WHERE accion LIKE 'b2b\\_%' ESCAPE '\\' AND substr(fecha,1,10)=?").all(hoy);
    const cards = materialB2B();
    const L = ['🌆 *B2B · Cierre del día* (' + selloHora() + ')'];

    if (eventos.length) {
      const porPersona = {};
      eventos.forEach(e => { const p = primerNom(e.nombre || '?'); porPersona[p] = (porPersona[p] || 0) + 1; });
      const codigos = new Set(eventos.map(e => e.objetivo).filter(Boolean));
      L.push('', '✅ *Actividad de hoy*: ' + eventos.length + ' acciones guardadas en ' + codigos.size + ' solicitudes');
      Object.keys(porPersona).sort((a, b) => porPersona[b] - porPersona[a]).forEach(p => L.push('• ' + p + ': ' + porPersona[p]));
    } else {
      L.push('', '✅ *Actividad de hoy*: sin acciones guardadas 😴');
    }

    const vencidos = cards.filter(c => c.sla && c.sla.vencido);
    const nuevos = cards.filter(c => c.col === 'Solicitud');
    L.push('', '⏳ *Queda pendiente para mañana*');
    L.push('• Nuevas sin avanzar: ' + nuevos.length);
    L.push('• SLA vencidos: ' + vencidos.length);
    const conObs = cards.filter(c => c.obs.length);
    if (conObs.length) L.push('• Con observaciones por levantar: ' + conObs.length);
    return L.join('\n');
  }

  // ---------- Instantánea: nueva solicitud B2B ----------
  function alertaNuevaSolicitud(codigo) {
    try {
      const f = db.prepare('SELECT * FROM b2b_solicitudes WHERE codigo=?').get(codigo);
      if (!f) return;
      const monto = f.montoSolicitado != null ? fmtS(f.montoSolicitado) : (f.montoRango || 'por definir');
      const base = process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : '');
      const link = base ? base + '/o/' + encodeURIComponent(f.codigo) : '';
      const txt = '💰 *Nueva oportunidad:* ' + monto +
        '\n🆕 Empresa: ' + (f.razonSocial || f.nombreComercial || '—') +
        '\n👤 Contacto: ' + (f.contacto || '—') +
        '\n📱 Celular: ' + (f.telefono || '—') +
        '\n👔 Asignado: ' + (f.responsableActual ? primerNom(f.responsableActual) : 'Sin asignar') +
        '\n\n¡Contáctalo ahora!' + (link ? ' ' + link : '');
      enviarAlertaB2BWA(txt); // fire-and-forget
    } catch (e) { console.error('[WA-B2B] alerta nueva solicitud:', e.message); }
  }

  function generarCorte(corte) { return corte === '6pm' ? plan6pm() : plan9am(); }

  async function enviarCorteAhora(corte) {
    const txt = generarCorte(corte);
    if (!txt) return false;
    const clave = 'wa_b2b_' + corte + '_' + hoyPeru();
    db.prepare('INSERT OR REPLACE INTO app_config (clave,valor) VALUES (?,?)').run(clave, new Date().toISOString());
    await enviarAlertaB2BWA(txt);
    return true;
  }

  // Scheduler: 9am y 6pm hora Perú, un envío por corte y por día.
  const CORTES = { '09:00': '9am', '18:00': '6pm' };
  function iniciarCortes() {
    setInterval(async () => {
      try {
        if (!JID()) return;
        const now = new Date(Date.now() + LIMA_OFF);
        const corte = CORTES[now.toISOString().slice(11, 16)];
        if (!corte) return;
        const clave = 'wa_b2b_' + corte + '_' + hoyPeru();
        if (db.prepare('SELECT valor FROM app_config WHERE clave=?').get(clave)) return;
        db.prepare('INSERT OR REPLACE INTO app_config (clave,valor) VALUES (?,?)').run(clave, new Date().toISOString());
        const txt = generarCorte(corte);
        if (txt) await enviarAlertaB2BWA(txt);
        console.log('[WA-B2B] corte ' + corte + ' enviado');
      } catch (e) { console.error('[WA-B2B] corte fallo:', e.message); }
    }, 60000);
  }

  return { generarCorte, enviarCorteAhora, iniciarCortes, alertaNuevaSolicitud, enviarAlertaB2BWA };
};
