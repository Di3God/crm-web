// =============================================================
// ALERTAS B2B POR WHATSAPP — grupo propio (WA_GRUPO_B2B_JID)
// Mismo patrón que alertas-wa.js (B2C) pero con la gestión B2B:
//   · Corte 9am  → Plan del día (nuevos, reuniones de hoy, SLA vencidos, tablero)
//   · Corte 6pm  → Cierre del día (actividad guardada + pendientes)
//   · Instantánea → nueva solicitud B2B entrante (webhook)
// El texto se genera AL MOMENTO del envío con el estado vivo del CRM.
// =============================================================
module.exports = function ({ db, enviarAlertaWA, peruFecha, etapaKanbanB2B, slaEtapaB2B, observacionesB2B, montoRangoFijo, L: LOGIC }) {

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

  // ---------- RESUMEN DE GESTIÓN DIARIA POR ASESOR (para el jefe comercial) ----------
  // Arma el bloque de métricas por cada asesor operativo (o los indicados): gestionados
  // (hoy vs previos), intentos, contactabilidad, 3x3 con nº de toque, avances, vencidos
  // sin gestión y avanzaron sin contacto. Devuelve el texto WhatsApp completo.
  function resumenGestionPorAsesor(opts) {
    opts = opts || {};
    const hoy = hoyPeru();
    const ini = new Date(new Date(hoy + 'T00:00:00Z').getTime() + 5 * 3600000).toISOString();
    const fin = new Date(new Date(hoy + 'T00:00:00Z').getTime() + 5 * 3600000 + 86400000).toISOString();
    const grupo = r => LOGIC && LOGIC.grupoLimpio ? LOGIC.grupoLimpio(r) : (r || '');
    const contacto = g => { const gg = grupo(g); return gg && gg !== 'No_respondio' && gg !== 'Dato_invalido' && gg !== 'No_contactar'; };

    // Asesores objetivo: los pasados en opts.asesores, o todos los operativos.
    let objetivo = opts.asesores && opts.asesores.length ? opts.asesores : null;
    if (!objetivo) {
      try { objetivo = db.prepare("SELECT nombre FROM usuarios WHERE activo=1 AND rol IN ('funcionario_b2b','asistente_creditos')").all().map(u => u.nombre); }
      catch (e) { objetivo = []; }
    }
    if (!objetivo.length) return null;

    // Gestiones de HOY (todas, para intentos/contactabilidad/3x3).
    const gestHoy = db.prepare('SELECT codigoSolicitud, responsable, resultado, fecha FROM b2b_gestiones WHERE fecha>=? AND fecha<? ORDER BY fecha ASC').all(ini, fin);
    // Trabajo de expediente y descartes por asesor (para que "Gestionados" cuente IGUAL que el
    // dashboard "Gestión del día": gestiones formales + trabajo de filtros + descartes).
    const ACCIONES_TRABAJO_B2B = ['b2b_credito_guardar_sujeto', 'b2b_garantia_guardar_inmueble', 'b2b_guardar_filtro', 'b2b_guardar_garantia', 'b2b_credito_link', 'b2b_credito_agregar_sujeto', 'b2b_garantia_agregar_inmueble'];
    const phTrab = ACCIONES_TRABAJO_B2B.map(() => '?').join(',');
    const trabajoHoy = db.prepare('SELECT nombre, objetivo FROM auditoria WHERE fecha>=? AND fecha<? AND accion IN (' + phTrab + ')').all(ini, fin, ...ACCIONES_TRABAJO_B2B);
    const descartesHoy = db.prepare("SELECT nombre, objetivo FROM auditoria WHERE fecha>=? AND fecha<? AND accion IN ('b2b_descartar','b2b_descartar_duplicado')").all(ini, fin);
    // Avances de etapa hoy por asesor.
    const avHoy = db.prepare("SELECT nombre, objetivo, detalle FROM auditoria WHERE fecha>=? AND fecha<? AND accion IN ('b2b_kanban_mover','b2b_kanban_forzar','b2b_avanzar_etapa')").all(ini, fin);
    // Solicitudes con su responsable + fecha de ingreso (para separar hoy vs previos).
    const sols = db.prepare('SELECT codigo, responsableActual, fechaIngreso, estado, fechaEtapa, archivado, montoSolicitado, montoRango, ruc FROM b2b_solicitudes').all();
    const solPorCodigo = {}; sols.forEach(s => { solPorCodigo[s.codigo] = s; });

    // Helpers para avances por transición con monto (se calculan POR ASESOR dentro del bloque).
    const ETAPAS_FLUJO = ['Solicitud', 'Filtro credito', 'Filtro garantia', 'Reunion comercial', 'Filtro finanzas', 'Business case'];
    const LBL_TRANS = {
      'Solicitud→Filtro credito': 'Solicitud → Crédito',
      'Filtro credito→Filtro garantia': 'Crédito → Garantía',
      'Filtro garantia→Reunion comercial': 'Garantía → Reunión',
      'Reunion comercial→Filtro finanzas': 'Reunión → Finanzas',
      'Filtro finanzas→Business case': 'Finanzas → Business case'
    };
    const aCol = (n) => { n = String(n || '').trim(); if (ETAPAS_FLUJO.indexOf(n) >= 0) return n; try { return etapaKanbanB2B({ estado: n, sunatEstado: 'ok' }); } catch (e) { return n; } };
    const OPS_ETAPA_CORTO = { 'Solicitud': 'Solicitud', 'Filtro credito': 'Crédito', 'Filtro garantia': 'Garantía', 'Reunion comercial': 'Reunión', 'Filtro finanzas': 'Finanzas', 'Business case': 'Business case' };
    const montoDe = (cod) => { const s = solPorCodigo[cod]; if (!s) return 0; return s.montoSolicitado != null ? Number(s.montoSolicitado) : (montoRangoFijo ? (montoRangoFijo(s.montoRango) || 0) : 0); };

    const bloques = objetivo.map(asesor => {
      // Gestiones del asesor hoy.
      const gAs = gestHoy.filter(g => g.responsable === asesor);
      const intentos = gAs.length;
      const contactados = gAs.filter(contacto).length;
      const pct = intentos ? Math.round((contactados / intentos) * 100) : 0;
      // Leads gestionados (únicos) hoy: MISMO criterio que el dashboard "Gestión del día"
      // = gestiones formales + trabajo de expediente + descartes (todo por este asesor).
      const codsGestSet = new Set(gAs.map(g => g.codigoSolicitud));
      trabajoHoy.filter(t => t.nombre === asesor).forEach(t => codsGestSet.add(t.objetivo));
      descartesHoy.filter(d => d.nombre === asesor).forEach(d => codsGestSet.add(d.objetivo));
      const codsGest = Array.from(codsGestSet);
      let gestHoyLlegoHoy = 0, gestPrevios = 0;
      codsGest.forEach(c => {
        const s = solPorCodigo[c];
        if (s && s.fechaIngreso >= ini && s.fechaIngreso < fin) gestHoyLlegoHoy++; else gestPrevios++;
      });
      // 3x3: cuántos de sus leads gestionados tienen toques, y en qué número van (1º,2º,3º).
      const toquesPorLead = {};
      gAs.forEach(g => { toquesPorLead[g.codigoSolicitud] = (toquesPorLead[g.codigoSolicitud] || 0) + 1; });
      let en1 = 0, en2 = 0, en3 = 0, con3x3 = 0;
      Object.values(toquesPorLead).forEach(n => {
        if (n >= 1) con3x3++;
        if (n === 1) en1++; else if (n === 2) en2++; else if (n >= 3) en3++;
      });
      // Avances de etapa del asesor hoy.
      const avances = avHoy.filter(a => a.nombre === asesor).length;
      // Vencidos sin gestión: leads del asesor con SLA vencido que NO fueron tocados hoy.
      const tocadosHoy = new Set(gAs.map(g => g.codigoSolicitud));
      let vencidosSinGestion = 0;
      sols.filter(s => s.responsableActual === asesor && !s.archivado && s.estado !== 'No elegible').forEach(s => {
        const col = etapaKanbanB2B(s);
        if (col === 'Desestimado' || col === 'Business case') return;
        const sla = slaEtapaB2B(col, s.fechaEtapa);
        if (sla && sla.vencido && !tocadosHoy.has(s.codigo)) vencidosSinGestion++;
      });
      // Avanzaron sin contacto: avanzó de etapa hoy pero no registró gestión con contacto.
      const avanzoSet = new Set(avHoy.filter(a => a.nombre === asesor).map(a => a.objetivo));
      const contactoSet = new Set(gAs.filter(contacto).map(g => g.codigoSolicitud));
      let avanzaronSinContacto = 0;
      avanzoSet.forEach(c => { if (!contactoSet.has(c)) avanzaronSinContacto++; });

      // Hora de la PRIMERA gestión del día (la más temprana registrada por el asesor).
      let primeraGestionHora = null;
      if (gAs.length) {
        const primera = gAs[0].fecha; // gestHoy viene ordenado ASC
        const d = new Date(new Date(primera).getTime() + LIMA_OFF);
        primeraGestionHora = d.toISOString().slice(11, 16);
      }
      // Leads del asesor SIN gestionar aún (asignados, vivos, que nunca tuvieron una gestión).
      const conAlgunaGestion = new Set(db.prepare('SELECT DISTINCT codigoSolicitud c FROM b2b_gestiones WHERE responsable=?').all(asesor).map(r => r.c));
      let noGestionados = 0;
      sols.filter(s => s.responsableActual === asesor && !s.archivado && s.estado !== 'No elegible').forEach(s => {
        const col = etapaKanbanB2B(s);
        if (col === 'Desestimado' || col === 'Business case') return;
        if (!conAlgunaGestion.has(s.codigo)) noGestionados++;
      });
      // Tiempo promedio de ABORDAJE sobre los ÚLTIMOS 10 leads asignados al asesor (no arrastra
      // leads viejos desatendidos: mide la reacción reciente). Abordaje = ingreso → 1ª gestión.
      const ult10 = db.prepare(
        "SELECT codigo, fechaIngreso FROM b2b_solicitudes WHERE responsableActual=? AND fechaIngreso IS NOT NULL ORDER BY fechaIngreso DESC LIMIT 10"
      ).all(asesor);
      let sumaAbordajeMs = 0, nAbordaje = 0;
      ult10.forEach(s => {
        const pg = db.prepare('SELECT MIN(fecha) primera FROM b2b_gestiones WHERE codigoSolicitud=? AND responsable=?').get(s.codigo, asesor);
        if (!pg || !pg.primera) return;
        const ms = new Date(pg.primera) - new Date(s.fechaIngreso);
        if (isFinite(ms) && ms > 0 && ms < 1000 * 60 * 60 * 24 * 30) { sumaAbordajeMs += ms; nAbordaje++; }
      });
      let abordajeTxt = null;
      if (nAbordaje) {
        const horas = (sumaAbordajeMs / nAbordaje) / (1000 * 60 * 60);
        abordajeTxt = horas < 1 ? Math.round(horas * 60) + ' min' : (horas < 24 ? (Math.round(horas * 10) / 10) + ' h' : (Math.round(horas / 24 * 10) / 10) + ' d');
      }

      // Llamadas de Aircall del asesor HOY (matchea por 'agente' = nombre de Aircall del usuario).
      // Se cuentan EMPRESAS/NÚMEROS ÚNICOS para que no valga hacer 10 llamadas a la misma empresa.
      const llamadasHoy = db.prepare(
        "SELECT duracion, codigoB2B, telefono FROM llamadas WHERE agente=? AND fecha>=? AND fecha<? ORDER BY duracion DESC"
      ).all(asesor, ini, fin);
      const totalLlamadas = llamadasHoy.length;
      const empresasUnicas = new Set(llamadasHoy.map(l => l.codigoB2B || l.telefono || Math.random())).size;
      let masLargaTxt = null;
      if (totalLlamadas && llamadasHoy[0].duracion) {
        const seg = llamadasHoy[0].duracion;
        const mm = Math.floor(seg / 60), ss = seg % 60;
        masLargaTxt = mm > 0 ? (mm + 'm ' + String(ss).padStart(2, '0') + 's') : (ss + 's');
      }

      // Avances por transición de ESTE asesor hoy (cantidad + monto potencial por salto).
      // Se cuenta cada lead UNA vez por su salto ascendente neto del día (de dónde salió → a dónde llegó).
      const misAvances = avHoy.filter(a => a.nombre === asesor);
      const transAsesor = {};
      misAvances.forEach(a => {
        const mm = String(a.detalle || '').match(/^(.+?)\s*→\s*(.+?)(\s*\(|$)/);
        if (!mm) return;
        const de = aCol(mm[1].trim()), aE = aCol(mm[2].trim());
        const iDe = ETAPAS_FLUJO.indexOf(de), iA = ETAPAS_FLUJO.indexOf(aE);
        if (iDe < 0 || iA < 0 || iA <= iDe) return; // solo avances ascendentes
        const key = de + '→' + aE;
        const lbl = LBL_TRANS[key] || ((OPS_ETAPA_CORTO[de] || de) + ' → ' + (OPS_ETAPA_CORTO[aE] || aE));
        (transAsesor[key] = transAsesor[key] || { n: 0, monto: 0, lbl }).n++;
        transAsesor[key].monto += montoDe(a.objetivo);
      });
      const lineasTransAsesor = Object.values(transAsesor)
        .filter(t => t.n > 0)
        .map(t => '   ▸ ' + t.lbl + ': ' + t.n + ' (' + fmtS(t.monto) + ')');

      const B = [];
      B.push('👤 *' + asesor.toUpperCase() + '*');
      if (primeraGestionHora) B.push('🕐 Iniciaste ' + primeraGestionHora + ' — ¡sigamos avanzando!');
      B.push('📋 Gestionados: ' + codsGest.length + ' (' + gestHoyLlegoHoy + ' hoy · ' + gestPrevios + ' previos)');
      B.push('📞 Intentos: ' + intentos + ' · Contactó: ' + contactados + ' (' + pct + '%)');
      B.push('🎯 3×3: ' + con3x3 + '/' + codsGest.length + ' · ' + en1 + ' en 1er toque · ' + en2 + ' en 2do · ' + en3 + ' en 3ro+');
      B.push('🚀 Avances de etapa: ' + avances);
      lineasTransAsesor.forEach(l => B.push(l));
      B.push('📱 Llamadas Aircall: ' + totalLlamadas + (totalLlamadas ? ' · ' + empresasUnicas + ' empresa' + (empresasUnicas === 1 ? '' : 's') + (masLargaTxt ? ' · más larga ' + masLargaTxt : '') : ''));
      B.push('📭 Sin gestionar aún: ' + noGestionados);
      if (abordajeTxt) B.push('⚡ Tiempo de abordaje: ' + abordajeTxt + ' promedio');
      B.push('⏰ Vencidos sin gestión: ' + vencidosSinGestion);
      B.push('🔕 Avanzaron sin contacto: ' + avanzaronSinContacto);
      return { asesor, texto: B.join('\n'), vencidosSinGestion, pct };
    });

    if (!bloques.length) return null;

    const cab = ['*📊 Gestión del día · ' + selloHora() + '*', 'Equipo comercial B2B', ''];
    const cuerpo = bloques.map(b => b.texto).join('\n\n');
    // Cierre con alerta si alguien tiene muchos vencidos: priorizar gestionar esas empresas.
    const alertas = bloques.filter(b => b.vencidosSinGestion >= 4).map(b => '⚠️ ' + primerNom(b.asesor) + ': ' + b.vencidosSinGestion + ' vencidos, priorizar gestión de estas empresas.');
    return cab.join('\n') + cuerpo + (alertas.length ? '\n\n' + alertas.join('\n') : '');
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
      // Watchdog: si a los 15 min el lead NO tiene ninguna gestión registrada, avisar que no se enfríe.
      programarAlertaSinAtender(codigo);
    } catch (e) { console.error('[WA-B2B] alerta nueva solicitud:', e.message); }
  }

  // Programa una verificación a los 15 min de llegar el lead. Si sigue sin gestión, lanza alerta.
  function programarAlertaSinAtender(codigo) {
    const QUINCE_MIN = 15 * 60 * 1000;
    setTimeout(() => {
      try {
        if (!JID()) return;
        const f = db.prepare('SELECT codigo, razonSocial, nombreComercial, contacto, responsableActual, estado, archivado FROM b2b_solicitudes WHERE codigo=?').get(codigo);
        if (!f) return;
        // Si ya fue desestimado/archivado, no molestar.
        if (f.archivado || f.estado === 'No elegible') return;
        // ¿Tiene alguna gestión registrada?
        const g = db.prepare('SELECT 1 FROM b2b_gestiones WHERE codigoSolicitud=? LIMIT 1').get(codigo);
        if (g) return; // ya fue atendido, todo bien
        // Marca anti-duplicado (compartida con el watchdog de respaldo).
        const clave = 'wa_b2b_sinatender_' + codigo;
        if (db.prepare('SELECT 1 FROM app_config WHERE clave=?').get(clave)) return;
        db.prepare('INSERT OR REPLACE INTO app_config (clave,valor) VALUES (?,?)').run(clave, new Date().toISOString());
        const empresa = f.razonSocial || f.nombreComercial || f.contacto || f.codigo;
        const quien = f.responsableActual ? primerNom(f.responsableActual) : 'Equipo';
        const txt = '⚠️ *Sin atender (15 min)* — ' + empresa +
          '\n👤 ' + quien + ', ¡no lo dejes enfriar! ⏱️';
        enviarAlertaB2BWA(txt);
      } catch (e) { console.error('[WA-B2B] alerta sin atender:', e.message); }
    }, QUINCE_MIN);
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

  // Envía el resumen de gestión por asesor al grupo B2B (o lo devuelve para preview).
  async function enviarResumenGestion(opts) {
    const txt = resumenGestionPorAsesor(opts || {});
    if (!txt) return null;
    if (opts && opts.soloTexto) return txt;
    await enviarAlertaB2BWA(txt);
    return txt;
  }

  // Scheduler del RESUMEN DE GESTIÓN por asesor: 9am, 1pm y 6pm (una vez cada uno por día).
  function iniciarResumenGestion(opts) {
    opts = opts || {};
    setInterval(async () => {
      try {
        if (!JID()) return;
        const now = new Date(Date.now() + LIMA_OFF);
        const corte = CORTES[now.toISOString().slice(11, 16)];
        if (!corte) return;
        const clave = 'wa_b2b_resumen_' + corte + '_' + hoyPeru();
        if (db.prepare('SELECT valor FROM app_config WHERE clave=?').get(clave)) return;
        db.prepare('INSERT OR REPLACE INTO app_config (clave,valor) VALUES (?,?)').run(clave, new Date().toISOString());
        // Asesores configurados para el resumen automático (ej. solo Shirley y Bony). Si no hay config, todos.
        let asesores = opts.asesores || null;
        try { const c = db.prepare("SELECT valor FROM app_config WHERE clave='b2b_resumen_asesores'").get(); if (c && c.valor) { const arr = JSON.parse(c.valor); if (Array.isArray(arr) && arr.length) asesores = arr; } } catch (e) {}
        const txt = resumenGestionPorAsesor({ asesores });
        if (txt) await enviarAlertaB2BWA(txt);
        console.log('[WA-B2B] resumen gestión ' + corte + ' enviado');
      } catch (e) { console.error('[WA-B2B] resumen gestión falló:', e.message); }
    }, 60000);
  }

  // Barrido de respaldo: cada 5 min busca leads que llegaron hace 15-45 min, siguen sin gestión
  // y aún no se les avisó. Cubre el caso de que el servidor se reinicie y se pierda el setTimeout.
  function iniciarWatchdogSinAtender() {
    setInterval(() => {
      try {
        if (!JID()) return;
        const ahora = Date.now();
        const hace15 = new Date(ahora - 15 * 60 * 1000).toISOString();
        const hace45 = new Date(ahora - 45 * 60 * 1000).toISOString();
        const nuevos = db.prepare(
          "SELECT codigo, razonSocial, nombreComercial, contacto, responsableActual FROM b2b_solicitudes WHERE fechaIngreso<=? AND fechaIngreso>=? AND COALESCE(archivado,0)=0 AND estado<>'No elegible'"
        ).all(hace15, hace45);
        nuevos.forEach(f => {
          const g = db.prepare('SELECT 1 FROM b2b_gestiones WHERE codigoSolicitud=? LIMIT 1').get(f.codigo);
          if (g) return; // ya atendido
          const clave = 'wa_b2b_sinatender_' + f.codigo;
          if (db.prepare('SELECT 1 FROM app_config WHERE clave=?').get(clave)) return; // ya avisado
          db.prepare('INSERT OR REPLACE INTO app_config (clave,valor) VALUES (?,?)').run(clave, new Date().toISOString());
          const empresa = f.razonSocial || f.nombreComercial || f.contacto || f.codigo;
          const quien = f.responsableActual ? primerNom(f.responsableActual) : 'Equipo';
          enviarAlertaB2BWA('⚠️ *Sin atender (15 min)* — ' + empresa + '\n👤 ' + quien + ', ¡no lo dejes enfriar! ⏱️');
        });
      } catch (e) { console.error('[WA-B2B] watchdog sin atender:', e.message); }
    }, 5 * 60 * 1000);
  }

  return { generarCorte, enviarCorteAhora, iniciarCortes, alertaNuevaSolicitud, enviarAlertaB2BWA, resumenGestionPorAsesor, enviarResumenGestion, iniciarResumenGestion, iniciarWatchdogSinAtender };
};
