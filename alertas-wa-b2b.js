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

  // ===== Helpers de reporte =====
  const COLS_B2B = ['Solicitud', 'Filtro credito', 'Filtro garantia', 'Reunion comercial', 'Filtro finanzas', 'Business case'];
  const LBL_COL = { 'Solicitud': 'Solicitud/SUNAT', 'Filtro credito': 'Crédito', 'Filtro garantia': 'Garantía', 'Reunion comercial': 'Reunión', 'Filtro finanzas': 'Finanzas', 'Business case': 'Business Case' };
  const fmtM = n => 'S/ ' + (Math.round((Number(n) || 0) / 100000) / 10).toLocaleString('es-PE') + 'M';

  // Embudo por etapa (empresas + monto) a partir del material vivo.
  function embudoPorEtapa(cards) {
    const m = {}; COLS_B2B.forEach(c => m[c] = { n: 0, monto: 0 });
    cards.forEach(c => { if (m[c.col]) { m[c.col].n++; m[c.col].monto += c.monto || 0; } });
    const L = ['', 'Por etapa:'];
    COLS_B2B.forEach(c => { if (m[c].n) L.push('• ' + LBL_COL[c] + ': ' + m[c].n + ' · ' + fmtM(m[c].monto)); });
    return L;
  }

  // Carga por asesor (empresas + monto) — para el 9am.
  function cargaPorAsesor(cards) {
    const a = {};
    cards.forEach(c => { const r = c.resp || 'Sin asignar'; a[r] = a[r] || { n: 0, monto: 0 }; a[r].n++; a[r].monto += c.monto || 0; });
    const L = ['', 'Carga por asesor:'];
    Object.keys(a).sort((x, y) => a[y].n - a[x].n).forEach(r => L.push('• ' + primerNom(r) + ': ' + a[r].n + ' empresas · ' + fmtM(a[r].monto)));
    return L;
  }

  // Actividad del día por asesor (empresas trabajadas, gestiones, avances, sin tocar) — 1pm y 6pm.
  // Asesores B2B operativos (excluye admins/jefes que puedan haber hecho pruebas).
  function asesoresOperativos() {
    try {
      return new Set(db.prepare("SELECT nombre FROM usuarios WHERE activo=1 AND rol IN ('funcionario_b2b','asistente_creditos')").all().map(u => u.nombre));
    } catch (e) { return null; }
  }

  function actividadDia(incluirAvances) {
    const hoy = hoyPeru();
    const OPER = asesoresOperativos(); // si null, no filtra
    const ini = new Date(new Date(hoy + 'T00:00:00Z').getTime() + 5 * 3600000).toISOString();
    const fin = new Date(new Date(hoy + 'T00:00:00Z').getTime() + 5 * 3600000 + 86400000).toISOString();
    const gest = db.prepare('SELECT codigoSolicitud, responsable FROM b2b_gestiones WHERE fecha>=? AND fecha<?').all(ini, fin);
    const av = db.prepare("SELECT nombre, objetivo FROM auditoria WHERE fecha>=? AND fecha<? AND accion IN ('b2b_kanban_mover','b2b_kanban_forzar','b2b_avanzar_etapa')").all(ini, fin);
    // Trabajo de expediente (armar crédito/garantía) — es trabajo real aunque no sea gestión formal.
    const trabajo = db.prepare("SELECT nombre, objetivo FROM auditoria WHERE fecha>=? AND fecha<? AND accion IN ('b2b_credito_guardar_sujeto','b2b_credito_agregar_sujeto','b2b_garantia_guardar_inmueble','b2b_garantia_agregar_inmueble','b2b_guardar_filtro','b2b_guardar_garantia','b2b_credito_link')").all(ini, fin);
    const nuevos = db.prepare('SELECT codigo, responsableActual FROM b2b_solicitudes WHERE fechaIngreso>=? AND fechaIngreso<?').all(ini, fin);
    const des = db.prepare("SELECT DISTINCT objetivo, nombre FROM auditoria WHERE fecha>=? AND fecha<? AND accion IN ('b2b_descartar','b2b_descartar_duplicado')").all(ini, fin);
    // Por asesor: empresas trabajadas (únicas, cualquier tipo de trabajo) + avances + gestiones
    const A = {};
    const reg = r => { const k = r || 'Sin asignar'; A[k] = A[k] || { empresas: new Set(), gestiones: 0, avances: 0 }; return A[k]; };
    const esOper = n => !OPER || OPER.has(n); // solo asesores operativos
    gest.forEach(g => { if (!esOper(g.responsable)) return; const o = reg(g.responsable); o.empresas.add(g.codigoSolicitud); o.gestiones++; });
    av.forEach(a => { if (!esOper(a.nombre)) return; const o = reg(a.nombre); o.empresas.add(a.objetivo); o.avances++; });
    trabajo.forEach(t => { if (!esOper(t.nombre)) return; const o = reg(t.nombre); o.empresas.add(t.objetivo); });
    des.forEach(d => { if (d.nombre && esOper(d.nombre)) reg(d.nombre).empresas.add(d.objetivo); });
    // Nuevos sin tocar por asesor (tocado = cualquier trabajo)
    const tocados = new Set([
      ...gest.filter(g => esOper(g.responsable)).map(g => g.codigoSolicitud),
      ...av.filter(a => esOper(a.nombre)).map(a => a.objetivo),
      ...trabajo.filter(t => esOper(t.nombre)).map(t => t.objetivo),
      ...des.filter(d => esOper(d.nombre)).map(d => d.objetivo)
    ]);
    const sinTocarPorResp = {};
    nuevos.forEach(n => { if (!tocados.has(n.codigo)) { const k = n.responsableActual || 'Sin asignar'; if (!OPER || OPER.has(k)) sinTocarPorResp[k] = (sinTocarPorResp[k] || 0) + 1; } });
    // Totales
    const totalEmpresas = tocados.size;
    const abordadosNuevos = nuevos.filter(n => tocados.has(n.codigo)).length;
    return {
      totalEmpresas, totalGestiones: gest.length, totalAvances: av.length,
      nuevos: nuevos.length, abordadosNuevos, desestimados: des.length,
      porAsesor: A, sinTocarPorResp, incluirAvances
    };
  }

  function lineasGestionAsesor(act) {
    const L = ['', 'Gestión por asesor:'];
    // Incluir también asesores que solo tienen 'sin tocar' (aparecen aunque no hayan trabajado)
    const nombres = Array.from(new Set([...Object.keys(act.porAsesor), ...Object.keys(act.sinTocarPorResp)])).filter(n => n !== 'Sin asignar');
    if (!nombres.length) { L.push('• Sin actividad registrada'); return L; }
    nombres.sort((x, y) => ((act.porAsesor[y] || {}).empresas || new Set()).size - ((act.porAsesor[x] || {}).empresas || new Set()).size).forEach(r => {
      const o = act.porAsesor[r] || { empresas: new Set(), gestiones: 0, avances: 0 };
      const sinTocar = act.sinTocarPorResp[r] || 0;
      const nEmp = o.empresas.size;
      // 3 números: empresas trabajadas · avances · gestiones
      let linea = '• ' + primerNom(r) + ': ' + nEmp + ' empresa' + (nEmp === 1 ? '' : 's') + ' · ' + o.avances + ' avance' + (o.avances === 1 ? '' : 's') + ' · ' + o.gestiones + ' gestion' + (o.gestiones === 1 ? '' : 'es');
      linea += ' · ' + sinTocar + ' sin tocar ' + (sinTocar > 0 ? '⚠' : '✓');
      L.push(linea);
    });
    return L;
  }

  // ---------- Corte 9am: Arranque del día ----------
  function plan9am() {
    const cards = materialB2B();
    if (!cards.length) return null;
    const totalM = cards.reduce((a, c) => a + (c.monto || 0), 0);
    const nuevas = cards.filter(c => c.col === 'Solicitud').length;
    const reus = reunionesHoy().length;
    const vencidos = cards.filter(c => c.sla && c.sla.vencido).length;
    const L = ['*B2B · Arranque ' + selloHora() + '*'];
    L.push('', 'Pipeline: ' + cards.length + ' empresas · ' + fmtM(totalM));
    L.push('Nuevas por trabajar: ' + nuevas + ' · Reuniones hoy: ' + reus + ' · SLA vencido: ' + vencidos);
    embudoPorEtapa(cards).forEach(l => L.push(l));
    cargaPorAsesor(cards).forEach(l => L.push(l));
    return L.join('\n');
  }

  // ---------- Corte 1pm: Media jornada ----------
  function plan1pm() {
    const cards = materialB2B();
    if (!cards.length) return null;
    const act = actividadDia(false);
    const vencidos = cards.filter(c => c.sla && c.sla.vencido).length;
    const pct = act.nuevos ? Math.round((act.abordadosNuevos / act.nuevos) * 100) : 0;
    const L = ['*B2B · Media jornada ' + selloHora() + '*'];
    L.push('', 'Empresas trabajadas hoy: ' + act.totalEmpresas + ' · ' + act.totalGestiones + ' gestiones · ' + act.totalAvances + ' avances');
    L.push('Nuevas: ' + act.nuevos + ' → ' + act.abordadosNuevos + ' abordadas (' + pct + '%)');
    embudoPorEtapa(cards).forEach(l => L.push(l));
    lineasGestionAsesor(act).forEach(l => L.push(l));
    L.push('', 'SLA vencido pendiente: ' + vencidos);
    return L.join('\n');
  }

  // ---------- Corte 6pm: Cierre del día ----------
  function plan6pm() {
    const cards = materialB2B();
    const act = actividadDia(true);
    const vencidos = cards.filter(c => c.sla && c.sla.vencido).length;
    const nuevasSinTocar = Object.values(act.sinTocarPorResp).reduce((a, b) => a + b, 0);
    const pct = act.nuevos ? Math.round((act.abordadosNuevos / act.nuevos) * 100) : 0;
    const L = ['*B2B · Cierre ' + selloHora() + '*'];
    L.push('', 'Empresas trabajadas hoy: ' + act.totalEmpresas + ' · ' + act.totalGestiones + ' gestiones · ' + act.totalAvances + ' avances');
    L.push('Nuevas: ' + act.nuevos + ' → ' + act.abordadosNuevos + ' abordadas (' + pct + '%) · Desestimadas: ' + act.desestimados);
    embudoPorEtapa(cards).forEach(l => L.push(l));
    lineasGestionAsesor(act).forEach(l => L.push(l));
    L.push('', 'Pendiente mañana: ' + nuevasSinTocar + ' nueva' + (nuevasSinTocar === 1 ? '' : 's') + ' sin tocar · ' + vencidos + ' SLA vencido');
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

  function generarCorte(corte) { return corte === '6pm' ? plan6pm() : corte === '1pm' ? plan1pm() : plan9am(); }

  async function enviarCorteAhora(corte) {
    const txt = generarCorte(corte);
    if (!txt) return false;
    const clave = 'wa_b2b_' + corte + '_' + hoyPeru();
    db.prepare('INSERT OR REPLACE INTO app_config (clave,valor) VALUES (?,?)').run(clave, new Date().toISOString());
    await enviarAlertaB2BWA(txt);
    return true;
  }

  // Scheduler: 9am y 6pm hora Perú, un envío por corte y por día.
  const CORTES = { '09:00': '9am', '13:00': '1pm', '18:00': '6pm' };
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
