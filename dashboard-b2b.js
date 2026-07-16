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
  // CUOTA de intentos (registrados en el modal de gestión, canal Llamada/WhatsApp):
  //   Día 1: si llega 00:00-12:00 → 3 intentos (M,T,N) · 12:00-16:00 → 2 (T,N) · después de 16:00 → 1 (N)
  //   Días 2 y 3: 3 intentos por día. Máximo 1 intento válido por (día, franja).
  // Devuelve estado: 'no_exigible' | 'cumplido' (logró contacto) | 'al_dia' | 'atrasado'
  //   | 'vencido_ok' (pasaron los 3 días, SÍ registró toda la cuota → descartable como ilocalizable)
  //   | 'vencido_incumplido' (pasaron los 3 días SIN la cuota completa → NO descartable: debe registrar los intentos que faltan)
  // Los intentos registrados DESPUÉS del día 3 sí cuentan para completar la cuota pendiente.
  function estado3x3(sol, gestiones) {
    if (!esExigible3x3(sol)) return { exigible: false, estado: 'no_exigible', puedeDescartar: true };
    const gs = gestiones || db.prepare('SELECT * FROM b2b_gestiones WHERE codigoSolicitud=? ORDER BY fecha ASC').all(sol.codigo);
    const ancla = anclaje3x3(sol);

    // ¿Ya hubo contacto efectivo (en cualquier momento)?
    const gContacto = gs.find(g => esContactoEfectivo(g.resultado));
    if (gContacto) return { exigible: true, contactoEfectivo: true, estado: 'cumplido', dia: null, esperados: 0, esperadosTotales: 0, cumplidos: 0, alDia: true, puedeDescartar: true };

    const d0 = diaLima(ancla), hoy = hoyLima();
    const frAncla = franjaDe(ancla), frAhora = franjaDe(new Date().toISOString());

    // Cuota TOTAL de la ventana (día 1 prorrateado por hora de llegada + 3+3)
    const esperadosTotales = (FRANJAS_DIA - frAncla) + (DIAS_3X3 - 1) * FRANJAS_DIA;
    // Cuota exigible HASTA AHORA (franjas ya transcurridas o en curso)
    let esperados = 0, dia = 0;
    for (let i = 0; i < DIAS_3X3; i++) {
      const d = diaMas(d0, i);
      if (d > hoy) break;
      dia = i + 1;
      const desde = (i === 0) ? frAncla : 0;
      const hasta = (d === hoy) ? frAhora : FRANJAS_DIA - 1;
      if (hasta >= desde) esperados += (hasta - desde + 1);
    }
    const vencio = diaMas(d0, DIAS_3X3 - 1) < hoy;
    if (vencio) { esperados = esperadosTotales; dia = DIAS_3X3; }

    // Intentos registrados (SOLO gestiones del modal con canal de contacto), desde el ancla
    // en adelante y SIN tope de día: los intentos tardíos cuentan para completar la cuota,
    // pero máximo 1 por (día, franja).
    const slots = new Set();
    gs.forEach(g => {
      if (!esIntento(g)) return;
      const d = diaLima(g.fecha);
      if (d < d0) return;
      slots.add(d + '|' + franjaDe(g.fecha));
    });
    const cumplidos = Math.min(slots.size, esperadosTotales);
    const alDia = !vencio && cumplidos >= esperados;
    const cuotaCompleta = cumplidos >= esperadosTotales;
    const estado = vencio ? (cuotaCompleta ? 'vencido_ok' : 'vencido_incumplido') : (alDia ? 'al_dia' : 'atrasado');
    // Compuerta: sin contacto efectivo solo se descarta con la CUOTA COMPLETA de intentos registrados.
    const puedeDescartar = vencio && cuotaCompleta;
    const motivoBloqueo = puedeDescartar ? null : (vencio
      ? `3x3 vencido SIN los intentos registrados (${cumplidos}/${esperadosTotales}): registra los intentos de contacto que faltan antes de descartar`
      : `Sin contacto efectivo: debe cumplir el 3x3 (día ${dia} de ${DIAS_3X3}, ${cumplidos}/${esperados} intentos registrados) antes de descartar`);
    return { exigible: true, contactoEfectivo: false, estado, dia: vencio ? DIAS_3X3 : dia,
      esperados, esperadosTotales, cumplidos, alDia, puedeDescartar, motivoBloqueo };
  }

  // ¿Tiene al menos una gestión registrada en el modal? (intento o contacto).
  // Requisito para poder desestimar: el funcionario debe haber registrado su gestión.
  function tieneGestionRegistrada(codigo) {
    return db.prepare('SELECT 1 FROM b2b_gestiones WHERE codigoSolicitud=? LIMIT 1').get(codigo) != null;
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
    // Rango de fechas para las métricas "del periodo" (nuevos, gestionados, movimiento,
    // avances, primer contacto, desestimados). El estado VIVO (3x3, pipeline, cuellos,
    // leads sin movimiento) es siempre actual. Default: hoy.
    const hoy = hoyLima();
    const val = f => /^\d{4}-\d{2}-\d{2}$/.test(f || '') ? f : null;
    const desde = val(opts.desde) || val(opts.fecha) || hoy;
    const hasta = val(opts.hasta) || val(opts.fecha) || desde;
    const [rDesde] = rangoDia(desde <= hasta ? desde : hasta);
    const [, rHasta] = rangoDia(desde <= hasta ? hasta : desde);
    const iniH = rDesde, finH = rHasta;           // periodo seleccionado
    // Periodo anterior de igual duración (para "vs")
    const durDias = Math.max(1, Math.round((new Date(rHasta) - new Date(rDesde)) / 86400000));
    const [iniA] = rangoDia(diaMas(desde, -durDias));
    const finA = rDesde;
    const asesorFiltro = (opts.asesor || '').trim() || null;

    // --- Base: solicitudes vivas + gestiones agrupadas (2 queries, no N+1) ---
    let vivas = db.prepare("SELECT * FROM b2b_solicitudes WHERE COALESCE(archivado,0)=0 AND estado <> 'No elegible'").all();
    if (asesorFiltro) vivas = vivas.filter(s => s.responsableActual === asesorFiltro);
    const codigos = vivas.map(s => s.codigo);
    const enScope = new Set(codigos);
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

    // --- KPI: nuevos hoy / ayer (respeta el filtro de asesor) ---
    const qNuevos = asesorFiltro
      ? (i, f) => db.prepare('SELECT COUNT(*) n FROM b2b_solicitudes WHERE fechaIngreso>=? AND fechaIngreso<? AND responsableActual=?').get(i, f, asesorFiltro).n
      : (i, f) => db.prepare('SELECT COUNT(*) n FROM b2b_solicitudes WHERE fechaIngreso>=? AND fechaIngreso<?').get(i, f).n;
    const nuevosHoy = qNuevos(iniH, finH);
    const nuevosAyer = qNuevos(iniA, finA);

    // --- KPI: gestionados (leads únicos con gestión formal, trabajo de filtros, O descarte) ---
    // Los DESESTIMADOS cuentan: al descartarlos el funcionario ya los gestionó.
    const phT = ACCIONES_TRABAJO.map(() => '?').join(',');
    const codsGestionados = (ini, fin) => {
      const set = new Set();
      db.prepare('SELECT DISTINCT codigoSolicitud c FROM b2b_gestiones WHERE fecha>=? AND fecha<?').all(ini, fin).forEach(r => set.add(r.c));
      db.prepare('SELECT DISTINCT objetivo c FROM auditoria WHERE fecha>=? AND fecha<? AND accion IN (' + phT + ')').all(ini, fin, ...ACCIONES_TRABAJO).forEach(r => set.add(r.c));
      db.prepare("SELECT DISTINCT objetivo c FROM auditoria WHERE fecha>=? AND fecha<? AND accion IN ('b2b_descartar','b2b_descartar_duplicado')").all(ini, fin).forEach(r => set.add(r.c));
      return set;
    };
    let gestHoySet = codsGestionados(iniH, finH), gestAyerSet = codsGestionados(iniA, finA);
    if (asesorFiltro) {
      // filtro por responsable: incluye tanto vivos en scope como descartados del asesor
      const descAsesor = new Set(db.prepare("SELECT codigo FROM b2b_solicitudes WHERE responsableActual=? AND (COALESCE(archivado,0)=1 OR estado='No elegible')").all(asesorFiltro).map(r => r.codigo));
      const enAlcance = c => enScope.has(c) || descAsesor.has(c);
      gestHoySet = new Set([...gestHoySet].filter(enAlcance));
      gestAyerSet = new Set([...gestAyerSet].filter(enAlcance));
    }

    // --- KPI: movimiento de etapa del día (auditoría 'X → Y'), limitado al alcance del filtro ---
    const movs = db.prepare("SELECT objetivo, detalle FROM auditoria WHERE fecha>=? AND fecha<? AND accion IN ('b2b_kanban_mover','b2b_avanzar_etapa')").all(iniH, finH)
      .filter(m => !asesorFiltro || enScope.has(m.objetivo));
    const movPorLead = {}; // codigo -> delta acumulado del día
    const maxDestino = {}; // codigo -> índice de la etapa MÁS AVANZADA que alcanzó hoy
    movs.forEach(m => {
      const mm = String(m.detalle || '').match(/^(.+?)\s*→\s*(.+?)(\s*\(|$)/);
      if (!mm) return;
      const de = ETAPAS.indexOf(mm[1].trim()), a = ETAPAS.indexOf(mm[2].trim());
      if (de < 0 || a < 0) return;
      movPorLead[m.objetivo] = (movPorLead[m.objetivo] || 0) + (a - de);
      if (a > de) maxDestino[m.objetivo] = Math.max(maxDestino[m.objetivo] || 0, a);
    });
    let avanzaron = 0, retrocedieron = 0;
    Object.entries(movPorLead).forEach(([cod, d]) => { if (d > 0) avanzaron++; else if (d < 0) retrocedieron++; });
    const sinCambio = Math.max(0, gestHoySet.size - avanzaron - retrocedieron);

    // --- AVANCES DEL DÍA POR ETAPA DESTINO (sin duplicar: cada lead cuenta UNA vez,
    //     en la etapa MÁS AVANZADA que alcanzó hoy) ---
    const avancesPorEtapa = ETAPAS.slice(1).map((e, i) => ({ etapa: e, n: 0, idx: i + 1 }));
    Object.entries(maxDestino).forEach(([cod, idx]) => {
      if (movPorLead[cod] > 0) { const slot = avancesPorEtapa.find(x => x.idx === idx); if (slot) slot.n++; }
    });

    // --- TIEMPO PROMEDIO ENTRE ETAPAS (histórico completo, no solo del día) ---
    // Se reconstruye el recorrido de cada lead a partir de TODOS sus movimientos de etapa
    // con fecha (auditoría 'X → Y'), y se mide cuánto tardó en pasar de cada etapa a la siguiente.
    // Se promedia por transición sobre todos los leads que la completaron.
    // IMPORTANTE: los detalles de auditoría guardan el ESTADO INTERNO (ej. "Apto credito",
    // "Amarillo/nurture", "Expediente"...), que no siempre coincide con el nombre de la columna
    // del kanban. Se normaliza cada estado a su columna con etapaKanbanB2B antes de comparar.
    const aColumna = (nombreEstado) => {
      const n = String(nombreEstado || '').trim();
      if (ETAPAS.indexOf(n) >= 0) return n; // ya es un nombre de columna
      try { return etapaKanbanB2B({ estado: n, sunatEstado: 'ok' }); } catch (e) { return n; }
    };
    const transiciones = {}; // "De→A" -> { sumaMs, n }
    const movHist = db.prepare(
      "SELECT objetivo, detalle, fecha FROM auditoria WHERE accion IN ('b2b_kanban_mover','b2b_avanzar_etapa','b2b_reunion_guardar') ORDER BY fecha ASC"
    ).all().filter(m => !asesorFiltro || enScope.has(m.objetivo));
    // Agrupar por lead: lista de {etapa, fecha} en orden cronológico.
    const rutaPorLead = {};
    // La creación de la solicitud marca la entrada a "Solicitud".
    db.prepare("SELECT codigo, fechaIngreso FROM b2b_solicitudes").all().forEach(s => {
      if (s.fechaIngreso) (rutaPorLead[s.codigo] = rutaPorLead[s.codigo] || []).push({ etapa: 'Solicitud', fecha: s.fechaIngreso });
    });
    movHist.forEach(m => {
      const mm = String(m.detalle || '').match(/^(.+?)\s*→\s*(.+?)(\s*\(|$)/);
      let etapaDestino = null;
      if (mm) etapaDestino = aColumna(mm[2].trim());
      else if (m.detalle && /Finanzas|Reunion|reunión/i.test(m.detalle)) etapaDestino = 'Filtro finanzas'; // reunion_guardar → avanza a Finanzas
      if (!etapaDestino || ETAPAS.indexOf(etapaDestino) < 0) return;
      (rutaPorLead[m.objetivo] = rutaPorLead[m.objetivo] || []).push({ etapa: etapaDestino, fecha: m.fecha });
    });
    // Recorrer cada ruta y acumular tiempos de transición consecutiva ascendente.
    Object.values(rutaPorLead).forEach(pasos => {
      pasos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      for (let k = 1; k < pasos.length; k++) {
        const de = ETAPAS.indexOf(pasos[k - 1].etapa), a = ETAPAS.indexOf(pasos[k].etapa);
        if (de < 0 || a < 0 || a <= de) continue; // solo avances
        const ms = new Date(pasos[k].fecha) - new Date(pasos[k - 1].fecha);
        if (!isFinite(ms) || ms <= 0 || ms > 1000 * 60 * 60 * 24 * 365) continue; // descarta outliers >1 año
        const key = pasos[k - 1].etapa + '→' + pasos[k].etapa;
        (transiciones[key] = transiciones[key] || { sumaMs: 0, n: 0 }).sumaMs += ms;
        transiciones[key].n++;
      }
    });
    // Armar el arreglo de tiempos entre etapas consecutivas (Solicitud→Filtro credito, etc.)
    const tiempoEntreEtapas = [];
    for (let k = 0; k < ETAPAS.length - 1; k++) {
      const key = ETAPAS[k] + '→' + ETAPAS[k + 1];
      const t = transiciones[key];
      const dias = t && t.n ? (t.sumaMs / t.n) / (1000 * 60 * 60 * 24) : null;
      tiempoEntreEtapas.push({ de: ETAPAS[k], a: ETAPAS[k + 1], dias: dias != null ? Math.round(dias * 10) / 10 : null, n: t ? t.n : 0 });
    }

    // --- 3x3 y contactabilidad ---
    const exigibles = L.filter(l => l.t33.exigible);
    const contactados = exigibles.filter(l => l.t33.contactoEfectivo);
    const alDia = exigibles.filter(l => l.t33.estado === 'al_dia');
    const atrasados = exigibles.filter(l => l.t33.estado === 'atrasado');
    const vencidosOk = exigibles.filter(l => l.t33.estado === 'vencido_ok');
    const vencidosIncumplidos = exigibles.filter(l => l.t33.estado === 'vencido_incumplido');
    const vencidos = vencidosOk.concat(vencidosIncumplidos);
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
    const filtroAsesorSQL = asesorFiltro ? ' AND responsableActual=?' : '';
    const pcDe = (ini, fin) => prom(db.prepare('SELECT fechaIngreso, fechaPrimerToque FROM b2b_solicitudes WHERE fechaIngreso>=? AND fechaIngreso<? AND fechaPrimerToque IS NOT NULL' + filtroAsesorSQL).all(...(asesorFiltro ? [ini, fin, asesorFiltro] : [ini, fin]))
      .map(r => Math.max(0, (new Date(r.fechaPrimerToque) - new Date(r.fechaIngreso)) / 60000)));
    const pcHoy = pcDe(iniH, finH), pcAyer = pcDe(iniA, finA);
    const nuevosHoySinToque = db.prepare('SELECT COUNT(*) n FROM b2b_solicitudes WHERE fechaIngreso>=? AND fechaIngreso<? AND fechaPrimerToque IS NULL' + filtroAsesorSQL).get(...(asesorFiltro ? [iniH, finH, asesorFiltro] : [iniH, finH])).n;

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
    if (vencidosIncumplidos.length) {
      const porRespVI = {};
      vencidosIncumplidos.forEach(l => { porRespVI[primerNombre(l.responsable)] = (porRespVI[primerNombre(l.responsable)] || 0) + 1; });
      A('critica', `${vencidosIncumplidos.length} lead(s) pasaron los 3 días SIN registrar los intentos del 3x3 — ${Object.entries(porRespVI).map(([n, c]) => `${n} (${c})`).join(', ')} · deben registrar los intentos que faltan (descarte bloqueado)`,
        { codigos: vencidosIncumplidos.map(l => l.s.codigo), tipo: 'vencidos_incumplidos' });
    }
    if (vencidosOk.length) A('info', `${vencidosOk.length} lead(s) completaron los intentos del 3x3 sin lograr contacto — ya son descartables como ilocalizables (decisión del funcionario)`,
      { codigos: vencidosOk.map(l => l.s.codigo), tipo: 'descartables_3x3' });
    // Logros: llegaron a Business case hoy
    const bcHoy = movs.filter(m => /→\s*Business case/i.test(m.detalle || ''));
    bcHoy.forEach(m => {
      const l = L.find(x => x.s.codigo === m.objetivo);
      if (l) A('logro', `${primerNombre(l.responsable)} llevó a Business case una operación de ${fmtMM(l.monto)} (${l.s.razonSocial || l.s.codigo})`,
        { ejecutivo: l.responsable, monto: l.monto, codigos: [l.s.codigo], tipo: 'business_case' });
    });
    const ordenP = { critica: 0, alta: 1, media: 2, info: 3, logro: 4 };
    alertas.sort((a, b) => ordenP[a.prioridad] - ordenP[b.prioridad]);

    // --- DESESTIMADOS: horizonte único de 30 días, respeta el filtro de asesor ---
    let descartados = db.prepare("SELECT * FROM b2b_solicitudes WHERE COALESCE(archivado,0)=1 OR estado='No elegible'").all();
    const auditDesc = {}; // codigo -> { fecha, por }
    db.prepare("SELECT objetivo, fecha, nombre FROM auditoria WHERE accion IN ('b2b_descartar','b2b_descartar_duplicado') ORDER BY fecha ASC").all()
      .forEach(a => { auditDesc[a.objetivo] = { fecha: a.fecha, por: a.nombre || '' }; });
    if (asesorFiltro) descartados = descartados.filter(s => s.responsableActual === asesorFiltro || (auditDesc[s.codigo] || {}).por === asesorFiltro);
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
      const prematuro = !tuvoContacto && diasHastaDesc != null && diasHastaDesc < DIAS_3X3;
      const monto = s.montoSolicitado != null ? Number(s.montoSolicitado) : (montoRangoFijo(s.montoRango) || 0);
      return { codigo: s.codigo, empresa: s.razonSocial || s.nombreComercial || s.contacto || s.codigo,
        monto, motivo: (s.motivoDescarte || 'Sin motivo').trim(), por: au.por || s.responsableActual || '—',
        fecha: fDesc, dia: dDesc, tuvoContacto, prematuro };
    });
    // Filtra por el RANGO de fechas seleccionado (desde..hasta), no un fijo de 30 días.
    const descR = enriquecidosDesc.filter(x => x.dia && x.dia >= desde && x.dia <= hasta);
    const motivosMap = {};
    descR.forEach(x => { const m = x.motivo.slice(0, 60); motivosMap[m] = (motivosMap[m] || 0) + 1; });
    const porQuienMap = {};
    descR.forEach(x => { porQuienMap[x.por] = (porQuienMap[x.por] || 0) + 1; });
    const prematurosR = descR.filter(x => x.prematuro);
    const desestimados = {
      total: descR.length,
      monto: descR.reduce((a, x) => a + x.monto, 0),
      montoFmt: fmtMM(descR.reduce((a, x) => a + x.monto, 0)),
      sinContacto: descR.filter(x => !x.tuvoContacto).length,
      prematuros: prematurosR.length,
      prematurosMonto: prematurosR.reduce((a, x) => a + x.monto, 0),
      prematurosCodigos: prematurosR.map(x => x.codigo),
      motivos: Object.entries(motivosMap).map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n).slice(0, 8),
      porQuien: Object.entries(porQuienMap).map(([por, n]) => ({ por, n })).sort((a, b) => b.n - a.n),
      recientes: descR.filter(x => x.fecha).sort((a, b) => (b.fecha > a.fecha ? 1 : -1)).slice(0, 12)
        .map(x => ({ codigo: x.codigo, empresa: x.empresa, monto: x.monto, montoFmt: fmtMM(x.monto), motivo: x.motivo, por: primerNombre(x.por), fecha: x.fecha, tuvoContacto: x.tuvoContacto, prematuro: x.prematuro }))
    };
    if (prematurosR.length >= 2) A('alta', `${prematurosR.length} descartes PREMATUROS en el periodo (sin contacto y antes de cumplir el 3x3) — ${fmtMM(desestimados.prematurosMonto)}`,
      { codigos: prematurosR.map(x => x.codigo), tipo: 'descartes_prematuros' });
    alertas.sort((a, b) => ordenP[a.prioridad] - ordenP[b.prioridad]);

    // --- META DEL MES (global del equipo + individual por funcionario).
    //     Global en app_config 'b2b_meta_mes'; individuales en 'b2b_meta_mes_ind' (JSON {nombre: monto}).
    //     Solo Diego Cubas / admin las fija. "Logrado" = monto que LLEGA a Business case en el mes.
    let metaMonto = 0, metaInd = {};
    try { const r = db.prepare("SELECT valor FROM app_config WHERE clave='b2b_meta_mes'").get(); if (r && r.valor) metaMonto = Number(r.valor) || 0; } catch (e) { }
    try { const r = db.prepare("SELECT valor FROM app_config WHERE clave='b2b_meta_mes_ind'").get(); if (r && r.valor) metaInd = JSON.parse(r.valor) || {}; } catch (e) { }
    const mesIni = hoy.slice(0, 7) + '-01';
    const [iniMes] = rangoDia(mesIni);
    const codsBC = new Set();
    db.prepare("SELECT objetivo, detalle FROM auditoria WHERE fecha>=? AND accion IN ('b2b_kanban_mover','b2b_avanzar_etapa')").all(iniMes)
      .forEach(m => { if (/→\s*Business case/i.test(m.detalle || '')) codsBC.add(m.objetivo); });
    db.prepare("SELECT codigo, fechaEtapa FROM b2b_solicitudes WHERE estado IN ('Expediente','Traspasado B2B','Reunion agendada')").all()
      .forEach(s => { if (s.fechaEtapa && diaLima(s.fechaEtapa) >= mesIni) codsBC.add(s.codigo); });
    let metaLogrado = 0; const logradoInd = {};
    if (codsBC.size) {
      const phB = [...codsBC].map(() => '?').join(',');
      db.prepare('SELECT codigo, responsableActual, montoSolicitado, montoRango FROM b2b_solicitudes WHERE codigo IN (' + phB + ')').all(...codsBC)
        .forEach(s => { const m = s.montoSolicitado != null ? Number(s.montoSolicitado) : (montoRangoFijo(s.montoRango) || 0); metaLogrado += m; const r = s.responsableActual || 'Sin asignar'; logradoInd[r] = (logradoInd[r] || 0) + m; });
    }
    const finMes = new Date(new Date(mesIni + 'T12:00:00Z')); finMes.setUTCMonth(finMes.getUTCMonth() + 1); finMes.setUTCDate(0);
    const diasRestantes = Math.max(0, finMes.getUTCDate() - Number(hoy.slice(8, 10)));
    // Con filtro de asesor, la tarjeta muestra SU meta individual; sin filtro, la global.
    const metaVigente = asesorFiltro ? (Number(metaInd[asesorFiltro]) || 0) : metaMonto;
    const logradoVigente = asesorFiltro ? (logradoInd[asesorFiltro] || 0) : metaLogrado;
    const meta = { alcance: asesorFiltro || 'equipo',
      monto: metaVigente, montoFmt: fmtMM(metaVigente), logrado: logradoVigente, logradoFmt: fmtMM(logradoVigente),
      falta: Math.max(0, metaVigente - logradoVigente), faltaFmt: fmtMM(Math.max(0, metaVigente - logradoVigente)),
      pct: metaVigente > 0 ? Math.min(100, Math.round(logradoVigente / metaVigente * 100)) : null,
      operacionesBC: codsBC.size, diasRestantes, mes: hoy.slice(0, 7),
      global: { monto: metaMonto, montoFmt: fmtMM(metaMonto), logrado: metaLogrado, logradoFmt: fmtMM(metaLogrado), pct: metaMonto > 0 ? Math.min(100, Math.round(metaLogrado / metaMonto * 100)) : null },
      individuales: Object.entries(metaInd).map(([nombre, m]) => ({ nombre, monto: Number(m) || 0, montoFmt: fmtMM(Number(m) || 0), logrado: logradoInd[nombre] || 0, logradoFmt: fmtMM(logradoInd[nombre] || 0), pct: (Number(m) || 0) > 0 ? Math.min(100, Math.round((logradoInd[nombre] || 0) / (Number(m) || 0) * 100)) : null })) };

    // --- DISTRIBUCIÓN DEL PIPELINE (monto por etapa, con % del total) ---
    const totalPipeMonto = L.reduce((a, l) => a + l.monto, 0);
    const distribucion = ETAPAS.map(e => {
      const m = L.filter(l => l.etapa === e).reduce((a, l) => a + l.monto, 0);
      return { etapa: e, monto: m, montoFmt: fmtMM(m), pct: totalPipeMonto > 0 ? Math.round(m / totalPipeMonto * 100) : 0 };
    });

    // --- LEADS SIN MOVIMIENTO (dona por antigüedad de la última gestión) ---
    const buckets = { b0: 0, b1: 0, b2: 0, b3: 0 }; // 0-24h, 24-48h, 48-72h, +72h
    L.forEach(l => {
      const h = l.ps.diasSinGestion * 24;
      if (h < 24) buckets.b0++; else if (h < 48) buckets.b1++; else if (h < 72) buckets.b2++; else buckets.b3++;
    });
    const totalSM = L.length || 1;
    const sinMovimiento = { total: L.length,
      rangos: [
        { label: '0-24 h', n: buckets.b0, pct: Math.round(buckets.b0 / totalSM * 100), color: 'verde' },
        { label: '24-48 h', n: buckets.b1, pct: Math.round(buckets.b1 / totalSM * 100), color: 'amarillo' },
        { label: '48-72 h', n: buckets.b2, pct: Math.round(buckets.b2 / totalSM * 100), color: 'ambar' },
        { label: '+72 h', n: buckets.b3, pct: Math.round(buckets.b3 / totalSM * 100), color: 'rojo' }
      ] };

    // --- TOP LEADS EN RIESGO (por monto y Priority Score) ---
    const topRiesgo = [...L].sort((a, b) => (b.ps.score - a.ps.score) || (b.monto - a.monto)).slice(0, 6)
      .map(l => ({ codigo: l.s.codigo, empresa: l.s.razonSocial || l.s.nombreComercial || l.s.contacto || l.s.codigo,
        etapa: l.etapa, monto: l.monto, montoFmt: fmtMM(l.monto), score: l.ps.score,
        nivel: l.ps.score >= 90 ? 'critico' : l.ps.score >= 80 ? 'alto' : 'medio' }));

    // --- Payload final ---
    return {
      fecha: hoy, periodo: { desde, hasta }, actualizado: new Date().toISOString(), asesor: asesorFiltro,
      kpis: {
        nuevos: { hoy: nuevosHoy, ayer: nuevosAyer, delta: nuevosHoy - nuevosAyer },
        gestionados: { hoy: gestHoySet.size, ayer: gestAyerSet.size, delta: gestHoySet.size - gestAyerSet.size },
        movimiento: { avanzaron, retrocedieron, sinCambio },
        avancesPorEtapa,
        tiempoEntreEtapas,
        cumpl3x3: { pct: cumpl3x3, exigibles: exigibles.length, alDia: alDia.length + contactados.length, atrasados: atrasados.length, vencidos: vencidos.length, vencidosOk: vencidosOk.length, vencidosIncumplidos: vencidosIncumplidos.length },
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
      distribucion,
      sinMovimiento,
      topRiesgo,
      desestimados,
      meta,
      agenda: { reunionesHoy, seguimientosHoy, vencenHoy, accionesVencidas }
    };
  }

  // Lista de leads TRABAJADOS en el rango (para el modal): empresa, estado inicial,
  // estado actual, próxima acción + cuándo, monto. Incluye desestimados del periodo.
  function leadsTrabajados(opts = {}) {
    const val = f => /^\d{4}-\d{2}-\d{2}$/.test(f || '') ? f : null;
    const hoy = hoyLima();
    const desde = val(opts.desde) || val(opts.fecha) || hoy;
    const hasta = val(opts.hasta) || val(opts.fecha) || desde;
    const [ini] = rangoDia(desde <= hasta ? desde : hasta);
    const [, fin] = rangoDia(desde <= hasta ? hasta : desde);
    const asesor = (opts.asesor || '').trim() || null;

    // Códigos trabajados en el rango (gestión, trabajo de filtros o descarte)
    const cods = new Set();
    db.prepare('SELECT DISTINCT codigoSolicitud c FROM b2b_gestiones WHERE fecha>=? AND fecha<?').all(ini, fin).forEach(r => cods.add(r.c));
    const phT = ACCIONES_TRABAJO.map(() => '?').join(',');
    db.prepare('SELECT DISTINCT objetivo c FROM auditoria WHERE fecha>=? AND fecha<? AND accion IN (' + phT + ')').all(ini, fin, ...ACCIONES_TRABAJO).forEach(r => cods.add(r.c));
    db.prepare("SELECT DISTINCT objetivo c FROM auditoria WHERE fecha>=? AND fecha<? AND accion IN ('b2b_descartar','b2b_descartar_duplicado')").all(ini, fin).forEach(r => cods.add(r.c));
    if (!cods.size) return { total: 0, leads: [] };

    const ph = [...cods].map(() => '?').join(',');
    let rows = db.prepare('SELECT * FROM b2b_solicitudes WHERE codigo IN (' + ph + ')').all(...cods);
    if (asesor) rows = rows.filter(s => s.responsableActual === asesor);

    // Estado inicial: primer estado registrado en auditoría de cambios de etapa; si no hay, 'Solicitud'.
    const primerEstado = {};
    db.prepare("SELECT objetivo, detalle, fecha FROM auditoria WHERE accion IN ('b2b_kanban_mover','b2b_avanzar_etapa') ORDER BY fecha ASC").all()
      .forEach(a => { if (!primerEstado[a.objetivo]) { const mm = String(a.detalle || '').match(/^(.+?)\s*→/); if (mm) primerEstado[a.objetivo] = mm[1].trim(); } });

    const leads = rows.map(s => {
      const etapa = etapaKanbanB2B(s);
      const monto = s.montoSolicitado != null ? Number(s.montoSolicitado) : (montoRangoFijo(s.montoRango) || 0);
      const ug = db.prepare('SELECT proximaAccion, fechaProxAccion FROM b2b_gestiones WHERE codigoSolicitud=? ORDER BY fecha DESC LIMIT 1').get(s.codigo);
      const desestimado = s.archivado || s.estado === 'No elegible';
      return { codigo: s.codigo, empresa: (s.razonSocial || s.nombreComercial || s.contacto || s.codigo).slice(0, 40),
        propietario: (s.contacto || '—').slice(0, 30),
        estadoInicial: primerEstado[s.codigo] || 'Solicitud', estadoActual: desestimado ? 'Desestimado' : etapa,
        proximaAccion: ug ? (ug.proximaAccion || '—') : '—',
        fechaProxAccion: ug && ug.fechaProxAccion ? diaLima(ug.fechaProxAccion) : null,
        monto, montoFmt: fmtMM(monto), desestimado };
    }).sort((a, b) => b.monto - a.monto);
    return { total: leads.length, periodo: { desde, hasta }, leads };
  }

  // Funcionarios B2B activos (para el modal de asignar metas).
  function funcionariosB2B() {
    return db.prepare("SELECT nombre FROM usuarios WHERE activo=1 AND rol IN ('funcionario_b2b','asistente_creditos','jefe_creditos','jefe_b2b') ORDER BY nombre").all().map(u => u.nombre);
  }

  return { construirDashboard, estado3x3, estado3x3PorCodigo, esExigible3x3, tieneGestionRegistrada, leadsTrabajados, funcionariosB2B, CONTACTO_EFECTIVO };
};
