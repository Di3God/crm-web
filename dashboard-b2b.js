// dashboard-b2b.js — Motor del Centro de Operaciones Comerciales B2B (Fase 1)
// -----------------------------------------------------------------------------
// Calcula TODO el payload del dashboard de jefatura: KPIs, regla 3x3, alertas
// inteligentes (por reglas, sin IA), salud del pipeline, productividad por
// ejecutivo con Índice de Gestión, cuellos de botella, embudo y agenda.
//
// Patrón: módulo con dependencias inyectadas desde server.js (igual que
// alertas-wa-b2b.js). No toca nada existente; solo lee la BD.
//
//   const dashB2B = require('./dashboard-b2b.js')({ db, etapaKanbanB2B,
//     priorityScoreB2B, slaEtapaB2B, observacionesB2B, montoRangoFijo, sellarFechaEtapa });
//   → dashB2B.construirDashboard({ asesor })   // payload completo
//   → dashB2B.estado3x3PorCodigo(codigo)       // estado 3x3 de un lead (para la compuerta, fase 3)
// -----------------------------------------------------------------------------

module.exports = function (deps) {
  const { db, etapaKanbanB2B, priorityScoreB2B, slaEtapaB2B, observacionesB2B, montoRangoFijo, sellarFechaEtapa } = deps;

  const ETAPAS = ['Solicitud', 'Filtro credito', 'Filtro garantia', 'Reunion comercial', 'Filtro finanzas', 'Business case'];
  const LIMA_OFF = -5 * 3600000;

  // ===== REGLA 3x3 =====================================================
  // Contacto efectivo: el cliente respondió (aunque sea para decir que no).
  const CONTACTO_EFECTIVO = ['contactado', 'pidio informacion', 'envio documentos', 'no interesado'];
  // Canales que cuentan como intento de contacto (el trabajo documental NO cuenta).
  const CANALES_INTENTO = ['llamada', 'whatsapp'];
  const DIAS_3X3 = 3;      // días de exigencia
  const FRANJAS_DIA = 3;   // mañana <12 / tarde 12-16 / noche ≥16 (hora Perú)

  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const esContactoEfectivo = r => CONTACTO_EFECTIVO.includes(norm(r));
  const esIntento = g => CANALES_INTENTO.includes(norm(g.canal));

  const diaLima = iso => new Date(new Date(iso).getTime() + LIMA_OFF).toISOString().slice(0, 10);
  const horaLima = iso => { const d = new Date(new Date(iso).getTime() + LIMA_OFF); return d.getUTCHours() + d.getUTCMinutes() / 60; };
  const franjaDe = iso => { const h = horaLima(iso); return h < 12 ? 0 : h < 16 ? 1 : 2; }; // misma lógica que el 3x5 B2C
  const hoyLima = () => diaLima(new Date().toISOString());
  const diaMas = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  // ¿El lead pertenece a la población exigible del 3x3?
  //  a) Etapa Filtro crédito o más allá, o
  //  b) En Solicitud con observación de RUC (hay que contactar para conseguir el RUC correcto).
  // Excluidos: leads sin teléfono (no hay a quién llamar; se alertan aparte) y desestimados.
  function esExigible3x3(sol) {
    if (sol.archivado || sol.estado === 'No elegible') return false;
    if (!sol.telefono || !String(sol.telefono).trim()) return false;
    const etapa = etapaKanbanB2B(sol);
    if (etapa === 'Desestimado') return false;
    if (etapa !== 'Solicitud') return true; // Filtro crédito en adelante: siempre exigible
    const obs = observacionesB2B(sol) || [];
    return obs.some(o => ['falta_ruc', 'ruc_malo', 'ruc_error'].includes(o.tipo)); // Solicitud: solo si el RUC está observado
  }

  // Ancla del reloj 3x3. Se sella (lazy) en la columna fecha3x3 la primera vez
  // que el dashboard ve al lead exigible. Para leads existentes usa
  // fechaIngreso (en la práctica casi todos caen exigibles al ingresar:
  // SUNAT ok → Filtro crédito, o RUC observado → Solicitud).
  function anclaje3x3(sol) {
    if (sol.fecha3x3) return sol.fecha3x3;
    const ancla = sol.fechaIngreso || new Date().toISOString();
    try { db.prepare('UPDATE b2b_solicitudes SET fecha3x3=? WHERE codigo=?').run(ancla, sol.codigo); } catch (e) { }
    sol.fecha3x3 = ancla;
    return ancla;
  }

  // Estado 3x3 de un lead. gestiones = sus b2b_gestiones ordenadas ASC (opcional; si no, las lee).
  // Devuelve: { exigible, contactoEfectivo, dia, esperados, cumplidos, alDia, estado, puedeDescartar, motivoBloqueo }
  //   estado: 'no_exigible' | 'cumplido' (contactó) | 'al_dia' | 'atrasado' | 'vencido' (3 días sin contacto)
  function estado3x3(sol, gestiones) {
    if (!esExigible3x3(sol)) return { exigible: false, estado: 'no_exigible', puedeDescartar: true };
    const gs = gestiones || db.prepare('SELECT * FROM b2b_gestiones WHERE codigoSolicitud=? ORDER BY fecha ASC').all(sol.codigo);
    const ancla = anclaje3x3(sol);

    // ¿Ya hubo contacto efectivo (en cualquier momento)?
    const gContacto = gs.find(g => esContactoEfectivo(g.resultado));
    if (gContacto) return { exigible: true, contactoEfectivo: true, estado: 'cumplido', dia: null, esperados: 0, cumplidos: 0, alDia: true, puedeDescartar: true };

    // Franjas-slot esperadas desde el ancla (máx 3 días × 3 franjas = 9),
    // contando solo franjas ya transcurridas o en curso.
    const d0 = diaLima(ancla), hoy = hoyLima();
    const frAncla = franjaDe(ancla), frAhora = franjaDe(new Date().toISOString());
    let esperados = 0;
    let dia = 0; // 1..3 (o >3 si venció)
    for (let i = 0; i < DIAS_3X3; i++) {
      const d = diaMas(d0, i);
      if (d > hoy) break;
      dia = i + 1;
      const desde = (i === 0) ? frAncla : 0;                 // el día 1 solo exige desde la franja en que llegó
      const hasta = (d === hoy) ? frAhora : FRANJAS_DIA - 1; // hoy solo exige hasta la franja actual
      if (hasta >= desde) esperados += (hasta - desde + 1);
    }
    const vencio = diaMas(d0, DIAS_3X3 - 1) < hoy; // ya pasaron los 3 días completos

    // Franjas-slot cumplidas: 1 intento (Llamada/WhatsApp) por (día, franja), dentro de la ventana.
    const slots = new Set();
    gs.forEach(g => {
      if (!esIntento(g)) return;
      const d = diaLima(g.fecha);
      if (d < d0 || d > diaMas(d0, DIAS_3X3 - 1)) return;
      slots.add(d + '|' + franjaDe(g.fecha));
    });
    const cumplidos = slots.size;
    const alDia = !vencio && cumplidos >= esperados;
    const estado = vencio ? 'vencido' : (alDia ? 'al_dia' : 'atrasado');
    // Compuerta de descarte: sin contacto efectivo solo se puede descartar cuando el 3x3 venció.
    const puedeDescartar = vencio;
    return { exigible: true, contactoEfectivo: false, estado, dia: vencio ? DIAS_3X3 : dia,
      esperados, cumplidos, alDia, puedeDescartar,
      motivoBloqueo: puedeDescartar ? null : `Sin contacto efectivo: debe cumplir el 3x3 (día ${dia} de ${DIAS_3X3}, ${cumplidos}/${esperados} intentos) antes de descartar` };
  }

  // Para la compuerta de descarte (fase 3) y consultas puntuales.
  function estado3x3PorCodigo(codigo) {
    const sol = db.prepare('SELECT * FROM b2b_solicitudes WHERE codigo=?').get(codigo);
    if (!sol) return null;
    return estado3x3(sol);
  }

  // ===== DASHBOARD =====================================================
  function rangoDia(fecha) { // [ini, fin) del día Perú en ISO UTC
    const ini = new Date(new Date(fecha + 'T00:00:00Z').getTime() - LIMA_OFF).toISOString();
    const fin = new Date(new Date(fecha + 'T00:00:00Z').getTime() - LIMA_OFF + 86400000).toISOString();
    return [ini, fin];
  }
  const fmtMM = n => { // S/ 18.4 MM / S/ 980 K / S/ 45,000
    n = Number(n) || 0;
    if (n >= 1e6) return 'S/ ' + (Math.round(n / 1e5) / 10).toLocaleString('es-PE') + ' MM';
    if (n >= 1e3) return 'S/ ' + Math.round(n / 1e3) + ' K';
    return 'S/ ' + Math.round(n).toLocaleString('es-PE');
  };
  const primerNombre = s => { s = String(s || '').trim(); if (!s || /^sin asignar$/i.test(s)) return 'Sin asignar'; return s.split(/\s+/)[0]; };
  const prom = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  // Acciones de auditoría que cuentan como "trabajo sobre el lead" (misma lista que /api/b2b/dia).
  const ACCIONES_TRABAJO = ['b2b_credito_guardar_sujeto', 'b2b_garantia_guardar_inmueble', 'b2b_guardar_filtro',
    'b2b_guardar_garantia', 'b2b_credito_link', 'b2b_credito_agregar_sujeto', 'b2b_garantia_agregar_inmueble'];

  function construirDashboard(opts = {}) {
    const hoy = hoyLima();
    const ayer = diaMas(hoy, -1);
    const [iniH, finH] = rangoDia(hoy);
    const [iniA, finA] = rangoDia(ayer);
    const asesorFiltro = (opts.asesor || '').trim() || null;

    // --- Base: solicitudes vivas + gestiones agrupadas (2 queries, no N+1) ---
    let vivas = db.prepare("SELECT * FROM b2b_solicitudes WHERE COALESCE(archivado,0)=0 AND estado <> 'No elegible'").all();
    if (asesorFiltro) vivas = vivas.filter(s => s.responsableActual === asesorFiltro);
    const codigos = vivas.map(s => s.codigo);
    const gestPorCod = {};
    if (codigos.length) {
      const ph = codigos.map(() => '?').join(',');
      db.prepare('SELECT * FROM b2b_gestiones WHERE codigoSolicitud IN (' + ph + ') ORDER BY fecha ASC').all(...codigos)
        .forEach(g => (gestPorCod[g.codigoSolicitud] = gestPorCod[g.codigoSolicitud] || []).push(g));
    }
    const montoMax = Math.max(1, ...vivas.map(f => Number(f.montoSolicitado || 0) || montoRangoFijo(f.montoRango) || 0));

    // --- Enriquecer cada solicitud ---
    const ahora = Date.now();
    const L = vivas.map(s => {
      const etapa = etapaKanbanB2B(s);
      const fechaEtapa = sellarFechaEtapa(s, etapa);
      const monto = s.montoSolicitado != null ? Number(s.montoSolicitado) : (montoRangoFijo(s.montoRango) || 0);
      const gs = gestPorCod[s.codigo] || [];
      const ps = priorityScoreB2B({ ...s, montoSolicitado: monto, fechaEtapa }, montoMax);
      const t33 = estado3x3(s, gs);
      const ultG = gs.length ? gs[gs.length - 1] : null;
      const diasEnEtapa = fechaEtapa ? Math.max(0, (ahora - new Date(fechaEtapa).getTime()) / 86400000) : 0;
      // Primer contacto en minutos (fechaPrimerToque sellada, o primera gestión)
      let minPrimerToque = null;
      const t1 = s.fechaPrimerToque || (gs[0] && gs[0].fecha);
      if (t1 && s.fechaIngreso) minPrimerToque = Math.max(0, Math.round((new Date(t1) - new Date(s.fechaIngreso)) / 60000));
      return { s, etapa, monto, gs, ps, t33, ultG, diasEnEtapa, minPrimerToque,
        responsable: s.responsableActual || 'Sin asignar',
        gestHoy: gs.filter(g => diaLima(g.fecha) === hoy).length,
        idxEtapa: ETAPAS.indexOf(etapa) };
    });

    // --- KPI: nuevos hoy / ayer ---
    const nuevosHoy = db.prepare('SELECT COUNT(*) n FROM b2b_solicitudes WHERE fechaIngreso>=? AND fechaIngreso<?').get(iniH, finH).n;
    const nuevosAyer = db.prepare('SELECT COUNT(*) n FROM b2b_solicitudes WHERE fechaIngreso>=? AND fechaIngreso<?').get(iniA, finA).n;

    // --- KPI: gestionados hoy/ayer (leads únicos: gestión formal O trabajo de filtros) ---
    const phT = ACCIONES_TRABAJO.map(() => '?').join(',');
    const codsGestionados = (ini, fin) => {
      const set = new Set();
      db.prepare('SELECT DISTINCT codigoSolicitud c FROM b2b_gestiones WHERE fecha>=? AND fecha<?').all(ini, fin).forEach(r => set.add(r.c));
      db.prepare('SELECT DISTINCT objetivo c FROM auditoria WHERE fecha>=? AND fecha<? AND accion IN (' + phT + ')').all(ini, fin, ...ACCIONES_TRABAJO).forEach(r => set.add(r.c));
      return set;
    };
    let gestHoySet = codsGestionados(iniH, finH), gestAyerSet = codsGestionados(iniA, finA);
    if (asesorFiltro) { const mios = new Set(codigos); gestHoySet = new Set([...gestHoySet].filter(c => mios.has(c))); gestAyerSet = new Set([...gestAyerSet].filter(c => mios.has(c))); }

    // --- KPI: movimiento de etapa hoy (auditoría 'X → Y') ---
    const movs = db.prepare("SELECT objetivo, detalle FROM auditoria WHERE fecha>=? AND fecha<? AND accion IN ('b2b_kanban_mover','b2b_avanzar_etapa')").all(iniH, finH);
    const movPorLead = {}; // codigo -> delta acumulado del día
    movs.forEach(m => {
      const mm = String(m.detalle || '').match(/^(.+?)\s*→\s*(.+?)(\s*\(|$)/);
      if (!mm) return;
      const de = ETAPAS.indexOf(mm[1].trim()), a = ETAPAS.indexOf(mm[2].trim());
      if (de < 0 || a < 0) return;
      movPorLead[m.objetivo] = (movPorLead[m.objetivo] || 0) + (a - de);
    });
    let avanzaron = 0, retrocedieron = 0;
    const avanzaronCods = [];
    Object.entries(movPorLead).forEach(([cod, d]) => { if (d > 0) { avanzaron++; avanzaronCods.push(cod); } else if (d < 0) retrocedieron++; });
    const sinCambio = Math.max(0, gestHoySet.size - avanzaron - retrocedieron);

    // --- 3x3 y contactabilidad ---
    const exigibles = L.filter(l => l.t33.exigible);
    const contactados = exigibles.filter(l => l.t33.contactoEfectivo);
    const alDia = exigibles.filter(l => l.t33.estado === 'al_dia');
    const atrasados = exigibles.filter(l => l.t33.estado === 'atrasado');
    const vencidos = exigibles.filter(l => l.t33.estado === 'vencido');
    const cumpl3x3 = exigibles.length ? Math.round((contactados.length + alDia.length) / exigibles.length * 100) : 100;
    const contactabilidad = exigibles.length ? Math.round(contactados.length / exigibles.length * 100) : 100;
    const noRespondenN = exigibles.filter(l => !l.t33.contactoEfectivo && l.gs.some(esIntento)).length;
    const sinContactoN = exigibles.length - contactados.length;

    // --- Avanzaron sin contacto (Garantía o más allá sin contacto efectivo) ---
    const idxGar = ETAPAS.indexOf('Filtro garantia');
    const sinContactoAvanzados = L.filter(l => l.idxEtapa >= idxGar && l.t33.exigible && !l.t33.contactoEfectivo);

    // --- Pipeline y riesgo ---
    const pipelineMonto = L.reduce((a, l) => a + l.monto, 0);
    const criticas = L.filter(l => l.ps.nivel === 'critica');

    // --- Primer contacto promedio (leads ingresados hoy / ayer con toque) ---
    const pcDe = (ini, fin) => prom(db.prepare('SELECT fechaIngreso, fechaPrimerToque FROM b2b_solicitudes WHERE fechaIngreso>=? AND fechaIngreso<? AND fechaPrimerToque IS NOT NULL').all(ini, fin)
      .map(r => Math.max(0, (new Date(r.fechaPrimerToque) - new Date(r.fechaIngreso)) / 60000)));
    const pcHoy = pcDe(iniH, finH), pcAyer = pcDe(iniA, finA);
    const nuevosHoySinToque = db.prepare('SELECT COUNT(*) n FROM b2b_solicitudes WHERE fechaIngreso>=? AND fechaIngreso<? AND fechaPrimerToque IS NULL').get(iniH, finH).n;

    // --- Agenda (última próxima acción de cada lead vivo) ---
    let reunionesHoy = 0, seguimientosHoy = 0, vencenHoy = 0, accionesVencidas = 0;
    L.forEach(l => {
      const u = l.ultG;
      if (!u || !u.fechaProxAccion) return;
      const d = diaLima(u.fechaProxAccion);
      const esReunion = /reuni/i.test(u.proximaAccion || '');
      if (d === hoy) { vencenHoy++; if (esReunion) reunionesHoy++; else seguimientosHoy++; }
      else if (d < hoy) accionesVencidas++;
    });

    // --- Cuellos de botella por etapa ---
    const cuellos = ETAPAS.map(e => {
      const en = L.filter(l => l.etapa === e);
      const dias = en.map(l => l.diasEnEtapa);
      const sinGest = en.filter(l => l.ps.diasSinGestion >= 2).length;
      return { etapa: e, n: en.length, monto: en.reduce((a, l) => a + l.monto, 0),
        promDias: dias.length ? Math.round(prom(dias) * 10) / 10 : 0,
        maxDias: dias.length ? Math.round(Math.max(...dias) * 10) / 10 : 0,
        sinGestion: sinGest };
    });
    const peorCuello = [...cuellos].filter(c => c.n > 0 && c.etapa !== 'Business case').sort((a, b) => b.promDias - a.promDias)[0] || null;

    // --- Embudo (alcance acumulado: leads en la etapa o más allá; conversión monótona ≤100%) ---
    const nAcum = ETAPAS.map((e, i) => L.filter(l => l.idxEtapa >= i).length);
    const mAcum = ETAPAS.map((e, i) => L.filter(l => l.idxEtapa >= i).reduce((a, l) => a + l.monto, 0));
    const embudo = ETAPAS.map((e, i) => ({ etapa: e,
      n: cuellos[i].n, monto: cuellos[i].monto, montoFmt: fmtMM(cuellos[i].monto),
      nAcum: nAcum[i], montoAcum: mAcum[i], montoAcumFmt: fmtMM(mAcum[i]),
      pctDelTotal: nAcum[0] ? Math.round(nAcum[i] / nAcum[0] * 100) : 0,
      convDesdeAnterior: i === 0 ? 100 : (nAcum[i - 1] ? Math.round(nAcum[i] / nAcum[i - 1] * 100) : 0),
      promDias: cuellos[i].promDias }));

    // --- Productividad por ejecutivo + Índice de Gestión ---
    const ejecutivos = db.prepare("SELECT nombre FROM usuarios WHERE activo=1 AND rol IN ('funcionario_b2b','asistente_creditos','jefe_creditos','jefe_b2b') ORDER BY nombre").all().map(u => u.nombre);
    const porEj = {};
    ejecutivos.forEach(n => porEj[n] = []);
    L.forEach(l => { (porEj[l.responsable] = porEj[l.responsable] || []).push(l); });

    const indiceDe = (mis) => { // Índice de Gestión 0-100 (pesos del spec, 3x3 en lugar del 3x5 B2C)
      if (!mis.length) return null;
      const exi = mis.filter(l => l.t33.exigible);
      const enRegla = exi.filter(l => l.t33.contactoEfectivo || l.t33.estado === 'al_dia').length;
      const c33 = exi.length ? enRegla / exi.length : 1;                                      // 25%
      const pcs = mis.map(l => l.minPrimerToque).filter(v => v != null);
      const pcScore = pcs.length ? Math.max(0, 1 - Math.max(0, prom(pcs) - 15) / 105) : 0.5;  // 20% (≤15min=1, 120min=0)
      const gestionados = mis.filter(l => l.gestHoy > 0).length;
      const avanz = mis.filter(l => movPorLead[l.s.codigo] > 0).length;
      const avScore = gestionados ? Math.min(1, avanz / gestionados) : 0;                     // 20%
      const bc = mis.filter(l => l.etapa === 'Business case').length;
      const convScore = Math.min(1, (bc / mis.length) / 0.10);                                // 15% (10% a BC = pleno)
      const sinMov = mis.filter(l => l.ps.diasSinGestion >= 5).length / mis.length;           // 10% penal
      const venc = mis.filter(l => { const u = l.ultG; return u && u.fechaProxAccion && diaLima(u.fechaProxAccion) < hoy; }).length / mis.length; // 10% penal
      return Math.round(100 * (0.25 * c33 + 0.20 * pcScore + 0.20 * avScore + 0.15 * convScore + 0.10 * (1 - sinMov) + 0.10 * (1 - venc)));
    };
    const semaforoDe = i => i == null ? 'gris' : i >= 85 ? 'verde' : i >= 70 ? 'amarillo' : 'rojo';

    const productividad = Object.entries(porEj)
      .filter(([n, mis]) => mis.length || ejecutivos.includes(n))
      .map(([nombre, mis]) => {
        const exi = mis.filter(l => l.t33.exigible);
        const enRegla = exi.filter(l => l.t33.contactoEfectivo || l.t33.estado === 'al_dia').length;
        const pcs = mis.map(l => l.minPrimerToque).filter(v => v != null);
        const idx = indiceDe(mis);
        return { ejecutivo: nombre,
          asignados: mis.length,
          gestionadosHoy: mis.filter(l => l.gestHoy > 0).length,
          avanzadosHoy: mis.filter(l => movPorLead[l.s.codigo] > 0).length,
          cumpl3x3: exi.length ? Math.round(enRegla / exi.length * 100) : null,
          primerContactoMin: pcs.length ? Math.round(prom(pcs)) : null,
          sinMovimiento: mis.filter(l => l.ps.diasSinGestion >= 5).length,
          pipeline: mis.reduce((a, l) => a + l.monto, 0),
          pipelineFmt: fmtMM(mis.reduce((a, l) => a + l.monto, 0)),
          businessCase: mis.filter(l => l.etapa === 'Business case').length,
          indice: idx, semaforo: semaforoDe(idx) };
      })
      .sort((a, b) => (b.indice || 0) - (a.indice || 0));

    // --- Salud del pipeline (misma fórmula, a nivel equipo) ---
    const salud = indiceDe(L);
    const saludSemaforo = salud == null ? 'gris' : salud >= 85 ? 'verde' : salud >= 70 ? 'amarillo' : 'rojo';
    const saludEtiqueta = salud == null ? 'Sin datos' : salud >= 85 ? 'Excelente' : salud >= 70 ? 'Aceptable' : 'Requiere intervención';

    // --- ALERTAS INTELIGENTES (por reglas, ordenadas por severidad) ---
    const alertas = [];
    const A = (prioridad, texto, extra) => alertas.push(Object.assign({ prioridad, texto }, extra || {}));

    if (sinContactoAvanzados.length) {
      const porResp = {};
      sinContactoAvanzados.forEach(l => { (porResp[primerNombre(l.responsable)] = porResp[primerNombre(l.responsable)] || []).push(l); });
      const desglose = Object.entries(porResp).map(([n, ls]) => `${n} (${ls.length})`).join(', ');
      A('critica', `${sinContactoAvanzados.length} solicitud(es) avanzaron a Garantía o más allá sin un solo contacto — ${fmtMM(sinContactoAvanzados.reduce((a, l) => a + l.monto, 0))} · ${desglose}`,
        { monto: sinContactoAvanzados.reduce((a, l) => a + l.monto, 0), codigos: sinContactoAvanzados.map(l => l.s.codigo), tipo: 'sin_contacto_avanzados' });
    }
    // Ejecutivos con leads estancados >48h
    Object.entries(porEj).forEach(([nombre, mis]) => {
      const estancados = mis.filter(l => l.ps.diasSinGestion >= 2);
      if (estancados.length >= 5) A('critica', `${primerNombre(nombre)} tiene ${estancados.length} leads sin gestionar hace más de 48 h — ${fmtMM(estancados.reduce((a, l) => a + l.monto, 0))} en juego`,
        { ejecutivo: nombre, monto: estancados.reduce((a, l) => a + l.monto, 0), codigos: estancados.map(l => l.s.codigo), tipo: 'estancados_ejecutivo' });
    });
    // Monto detenido por etapa (>7 días)
    ETAPAS.slice(1, 5).forEach(e => {
      const det = L.filter(l => l.etapa === e && l.diasEnEtapa > 7);
      const m = det.reduce((a, l) => a + l.monto, 0);
      if (m >= 500000) A('alta', `Hay ${fmtMM(m)} detenidos en ${e} con más de 7 días sin avance (${det.length} solicitudes)`,
        { monto: m, codigos: det.map(l => l.s.codigo), tipo: 'monto_detenido' });
    });
    if (atrasados.length) {
      const porResp = {};
      atrasados.forEach(l => { (porResp[primerNombre(l.responsable)] = porResp[primerNombre(l.responsable)] || 0), porResp[primerNombre(l.responsable)]++; });
      A('alta', `${atrasados.length} lead(s) incumplen el 3x3 — ${Object.entries(porResp).map(([n, c]) => `${n} (${c})`).join(', ')}`,
        { codigos: atrasados.map(l => l.s.codigo), tipo: 'incumplen_3x3' });
    }
    const rucSinHoy = exigibles.filter(l => l.etapa === 'Solicitud' && !l.t33.contactoEfectivo && !l.gs.some(g => esIntento(g) && diaLima(g.fecha) === hoy));
    if (rucSinHoy.length) A('alta', `${rucSinHoy.length} solicitud(es) con RUC observado sin intentos de contacto hoy — hay que conseguir el RUC correcto`,
      { codigos: rucSinHoy.map(l => l.s.codigo), tipo: 'ruc_sin_intentos' });
    if (nuevosHoy > 0 && nuevosHoySinToque > 0) A(nuevosHoySinToque / nuevosHoy > 0.4 ? 'alta' : 'media',
      `Hoy llegaron ${nuevosHoy} leads y ${nuevosHoy - nuevosHoySinToque} tienen primer contacto — ${nuevosHoySinToque} esperando`, { tipo: 'nuevos_sin_toque' });
    if (vencidos.length) A('info', `${vencidos.length} lead(s) cumplieron el 3x3 sin lograr contacto — ya son descartables como ilocalizables (decisión del funcionario)`,
      { codigos: vencidos.map(l => l.s.codigo), tipo: 'descartables_3x3' });
    // Logros: llegaron a Business case hoy
    const bcHoy = movs.filter(m => /→\s*Business case/i.test(m.detalle || ''));
    bcHoy.forEach(m => {
      const l = L.find(x => x.s.codigo === m.objetivo);
      if (l) A('logro', `${primerNombre(l.responsable)} llevó a Business case una operación de ${fmtMM(l.monto)} (${l.s.razonSocial || l.s.codigo})`,
        { ejecutivo: l.responsable, monto: l.monto, codigos: [l.s.codigo], tipo: 'business_case' });
    });
    const ordenP = { critica: 0, alta: 1, media: 2, info: 3, logro: 4 };
    alertas.sort((a, b) => ordenP[a.prioridad] - ordenP[b.prioridad]);

    // --- DESESTIMADOS: análisis de descartes (hoy / 7d / 30d, motivos, prematuros) ---
    const descartados = db.prepare("SELECT * FROM b2b_solicitudes WHERE COALESCE(archivado,0)=1 OR estado='No elegible'").all();
    const auditDesc = {}; // codigo -> { fecha, por }
    db.prepare("SELECT objetivo, fecha, nombre FROM auditoria WHERE accion IN ('b2b_descartar','b2b_descartar_duplicado') ORDER BY fecha ASC").all()
      .forEach(a => { auditDesc[a.objetivo] = { fecha: a.fecha, por: a.nombre || '' }; });
    const d30 = diaMas(hoy, -30), d7 = diaMas(hoy, -7);
    const codsDesc = descartados.map(s => s.codigo);
    const gestDesc = {}; // gestiones de los descartados (para saber si hubo contacto antes del descarte)
    if (codsDesc.length) {
      const phD = codsDesc.map(() => '?').join(',');
      db.prepare('SELECT codigoSolicitud, fecha, canal, resultado FROM b2b_gestiones WHERE codigoSolicitud IN (' + phD + ')').all(...codsDesc)
        .forEach(g => (gestDesc[g.codigoSolicitud] = gestDesc[g.codigoSolicitud] || []).push(g));
    }
    const enriquecidosDesc = descartados.map(s => {
      const au = auditDesc[s.codigo] || {};
      const fDesc = au.fecha || s.fechaIngreso;
      const dDesc = fDesc ? diaLima(fDesc) : null;
      const gs = gestDesc[s.codigo] || [];
      const tuvoContacto = gs.some(g => esContactoEfectivo(g.resultado));
      const base3 = s.fecha3x3 || s.fechaIngreso;
      const diasHastaDesc = (fDesc && base3) ? (new Date(fDesc) - new Date(base3)) / 86400000 : null;
      // Prematuro: descartado sin contacto efectivo y ANTES de cumplir los 3 días del 3x3 (la compuerta lo evita hacia adelante).
      const prematuro = !tuvoContacto && diasHastaDesc != null && diasHastaDesc < DIAS_3X3;
      const monto = s.montoSolicitado != null ? Number(s.montoSolicitado) : (montoRangoFijo(s.montoRango) || 0);
      return { codigo: s.codigo, empresa: s.razonSocial || s.nombreComercial || s.contacto || s.codigo,
        monto, motivo: (s.motivoDescarte || 'Sin motivo').trim(), por: au.por || s.responsableActual || '—',
        fecha: fDesc, dia: dDesc, tuvoContacto, prematuro };
    });
    const desc30 = enriquecidosDesc.filter(x => x.dia && x.dia >= d30);
    const motivosMap = {};
    desc30.forEach(x => { const m = x.motivo.slice(0, 60); motivosMap[m] = (motivosMap[m] || 0) + 1; });
    const porQuienMap = {};
    desc30.forEach(x => { porQuienMap[x.por] = (porQuienMap[x.por] || 0) + 1; });
    const prematuros30 = desc30.filter(x => x.prematuro);
    const desestimados = {
      hoy: enriquecidosDesc.filter(x => x.dia === hoy).length,
      ultimos7: enriquecidosDesc.filter(x => x.dia && x.dia >= d7).length,
      ultimos30: desc30.length,
      monto30: desc30.reduce((a, x) => a + x.monto, 0),
      monto30Fmt: fmtMM(desc30.reduce((a, x) => a + x.monto, 0)),
      sinContacto30: desc30.filter(x => !x.tuvoContacto).length,
      prematuros30: prematuros30.length,
      prematuros30Monto: prematuros30.reduce((a, x) => a + x.monto, 0),
      prematurosCodigos: prematuros30.map(x => x.codigo),
      motivos: Object.entries(motivosMap).map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n).slice(0, 8),
      porQuien: Object.entries(porQuienMap).map(([por, n]) => ({ por, n })).sort((a, b) => b.n - a.n),
      recientes: enriquecidosDesc.filter(x => x.fecha).sort((a, b) => (b.fecha > a.fecha ? 1 : -1)).slice(0, 12)
        .map(x => ({ codigo: x.codigo, empresa: x.empresa, monto: x.monto, montoFmt: fmtMM(x.monto), motivo: x.motivo, por: primerNombre(x.por), fecha: x.fecha, tuvoContacto: x.tuvoContacto, prematuro: x.prematuro }))
    };
    if (prematuros30.length >= 2) A('alta', `${prematuros30.length} descartes PREMATUROS en 30 días (sin contacto y antes de cumplir el 3x3) — ${fmtMM(desestimados.prematuros30Monto)}`,
      { codigos: prematuros30.map(x => x.codigo), tipo: 'descartes_prematuros' });
    alertas.sort((a, b) => ordenP[a.prioridad] - ordenP[b.prioridad]);

    // --- Payload final ---
    return {
      fecha: hoy, actualizado: new Date().toISOString(), asesor: asesorFiltro,
      kpis: {
        nuevos: { hoy: nuevosHoy, ayer: nuevosAyer, delta: nuevosHoy - nuevosAyer },
        gestionados: { hoy: gestHoySet.size, ayer: gestAyerSet.size, delta: gestHoySet.size - gestAyerSet.size },
        movimiento: { avanzaron, retrocedieron, sinCambio },
        cumpl3x3: { pct: cumpl3x3, exigibles: exigibles.length, alDia: alDia.length + contactados.length, atrasados: atrasados.length, vencidos: vencidos.length },
        contactabilidad: { pct: contactabilidad, efectivos: contactados.length, sinContacto: sinContactoN, noResponden: noRespondenN },
        avanzaronSinContacto: { n: sinContactoAvanzados.length, monto: sinContactoAvanzados.reduce((a, l) => a + l.monto, 0), montoFmt: fmtMM(sinContactoAvanzados.reduce((a, l) => a + l.monto, 0)) },
        pipeline: { monto: pipelineMonto, montoFmt: fmtMM(pipelineMonto), n: L.length },
        riesgoAlto: { n: criticas.length },
        primerContacto: { minHoy: pcHoy != null ? Math.round(pcHoy) : null, minAyer: pcAyer != null ? Math.round(pcAyer) : null }
      },
      alertas,
      salud: { indice: salud, semaforo: saludSemaforo, etiqueta: saludEtiqueta, peorCuello: peorCuello ? { etapa: peorCuello.etapa, promDias: peorCuello.promDias } : null },
      productividad,
      cuellos,
      embudo,
      desestimados,
      agenda: { reunionesHoy, seguimientosHoy, vencenHoy, accionesVencidas }
    };
  }

  return { construirDashboard, estado3x3, estado3x3PorCodigo, esExigible3x3, CONTACTO_EFECTIVO };
};
