// ia-reportes.js — Interpreta reportes del CRM con Claude Haiku 4.5.
// Diseño: recibe datos YA CALCULADOS por el CRM (fuente de verdad) y devuelve texto interpretado
// para WhatsApp. NUNCA inventa ni altera cifras. Si la API falla o no hay key, devuelve null y el
// llamador usa la plantilla clásica (fallback). Modo prueba: se envía a un grupo privado.

const MODELO = 'claude-haiku-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

function configurado() { return !!process.env.ANTHROPIC_API_KEY; }

// Instrucción base (tono Tasatop). Se manda como system; el caching de Anthropic lo abarata al repetirse.
const SYSTEM = [
  'Eres el analista comercial de Tasatop, una fintech peruana de crowdlending.',
  'Escribes un mensaje breve para un grupo de WhatsApp del equipo comercial.',
  'Reglas estrictas:',
  '- Usa ÚNICAMENTE los números que te doy. NO inventes, no sumes, no estimes cifras nuevas.',
  '- Español peruano, directo y accionable. Nada de relleno ni saludos largos.',
  '- Prioriza lo accionable: quién va bien, quién necesita empujón, qué hacer ahora.',
  '- Usa los nombres reales tal como aparecen en los datos.',
  '- Máximo 6-8 líneas. Formato WhatsApp: *negritas* con un solo asterisco, emojis con mesura.',
  '- No repitas mecánicamente todos los números; interpreta y destaca lo importante.',
  '- Si aún no hay datos o están en cero, NO te quedes callado: sé proactivo y motiva a arrancar (ej. es momento de empezar el 3x5, aún hay tiempo para cerrar el día bien).',
  '- Cuando te den cifras de días anteriores o acumulados, compáralas: di si vamos mejor o peor y por cuánto, con criterio.',
  '- B2C y B2B son canales SEPARADOS: NUNCA los sumes en un total combinado. Repórtalos y compáralos siempre por separado, cada uno con su propia cifra.',
  '- Escribe TODO en español. Prohibido usar palabras en inglés (nada de \'same slot\', \'lead\' en plural inglés, etc.). Di \'misma franja\', \'mismo horario\'.'
].join('\n');

async function llamar(instruccionUsuario, maxTokens) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000); // 20s de guarda: si tarda, cae a plantilla
  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: maxTokens || 500,
        system: SYSTEM,
        messages: [{ role: 'user', content: instruccionUsuario }]
      }),
      signal: ctrl.signal
    });
    if (!r.ok) {
      const cuerpo = await r.text().catch(() => '');
      console.error('[ia-reportes] HTTP', r.status, cuerpo.slice(0, 300));
      return null;
    }
    let j;
    try { j = await r.json(); } catch (e) { console.error('[ia-reportes] respuesta no-JSON'); return null; }
    if (j.error) { console.error('[ia-reportes] API error:', j.error.message || j.error); return null; }
    let txt = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (txt) {
      txt = txt.replace(/\*\*+/g, '*');           // ** o más -> * (negrita WhatsApp)
      txt = txt.replace(/^\s*---+\s*$/gm, '');     // quita separadores markdown ---
      txt = txt.replace(/\n{3,}/g, '\n\n').trim(); // colapsa saltos triples
    }
    return txt || null;
  } catch (e) {
    console.error('[ia-reportes] fallo:', e.name === 'AbortError' ? 'timeout' : e.message);
    return null;
  } finally { clearTimeout(to); }
}

// ---- Interpretadores por tipo. Cada uno recibe datos crudos y arma la instrucción. ----

// Ranking de gestión (construirRankingDia): [{asesor,intentos,conectados,calificados,agendados,puntaje}]
async function interpretarGestion(ranking, corte, fechaTxt, ctx) {
  if (!configurado()) return null;
  const filas = (ranking || []).filter(r => (r.intentos || 0) + (r.calificados || 0) + (r.agendados || 0) > 0);
  const metaTxt = (ctx && ctx.meta != null) ? `Meta del equipo: ${ctx.meta} agendados/día. Van ${ctx.agendadosEquipo != null ? ctx.agendadosEquipo : 0} hoy.` : '';
  if (!filas.length) {
    // Proactivo: aún sin gestiones a esta hora, motiva a arrancar.
    const instruccion = `Corte de GESTIÓN ${corte} (${fechaTxt}). Aún NO hay gestiones registradas hoy. ${metaTxt}\n\nEscribe un mensaje corto y proactivo para el grupo: reconoce que aún no arranca la actividad, motiva a empezar el 3x5 y a agendar temprano. No inventes números.`;
    return await llamar(instruccion, 300);
  }
  const datos = filas.map(r => `${r.asesor}: ${r.intentos} intentos, ${r.conectados} conectados, ${r.calificados} calificados, ${r.agendados} agendados (puntaje ${r.puntaje})`).join('\n');
  const instruccion = `Reporte de GESTIÓN del corte ${corte} (${fechaTxt}). Rendimiento por gestora hoy:\n${datos}\n${metaTxt}\n\nEscribe el resumen para el grupo: destaca quién lidera, quién debe acelerar, y el estado general del equipo hacia la meta de agendados.`;
  return await llamar(instruccion, 500);
}

// Planes 3x5 por GP: [{gestora, activos, sinTocar, listaNombres:[{nombre,monto}]}]
async function interpretarPlanes(planes, corte, fechaTxt) {
  if (!configurado()) return null;
  const filas = (planes || []).filter(p => (p.activos || 0) > 0);
  if (!filas.length) return null;
  const datos = filas.map(p => `${p.gestora}: ${p.activos} activos, ${p.sinTocar} sin tocar aún`).join('\n');
  const instruccion = `Corte ${corte} (${fechaTxt}) del 3x5 B2C. Estado por gestora:\n${datos}\n\nEscribe una bajada corta para el grupo: prioriza a quién le urge contactar (más leads sin tocar), reconoce a quién va al día, y recuerda el objetivo de contactar temprano.`;
  return await llamar(instruccion, 450);
}

// Marketing: {b2c, b2b, rangoTxt, fechaTxt}
async function interpretarMarketing(d) {
  if (!configurado()) return null;
  // Estructura por corte: {corte, franjaHoras:[hIni,hFin], hoy:{acum,franja}, ayer, antier}
  const z = { b2c: 0, b2b: 0 };
  const hoy = d.hoy || { acum: z, franja: z }, ayer = d.ayer || { acum: z, franja: z }, antier = d.antier || { acum: z, franja: z };
  const [hIni, hFin] = d.franjaHoras || [0, 24];
  // Datos SIEMPRE desglosados por canal, sin totales combinados.
  const bloque = (etiqueta, sel) =>
    `${etiqueta}:\n` +
    `  B2C → hoy ${sel(hoy).b2c}, ayer ${sel(ayer).b2c}, antier ${sel(antier).b2c}\n` +
    `  B2B → hoy ${sel(hoy).b2b}, ayer ${sel(ayer).b2b}, antier ${sel(antier).b2b}`;
  const instruccion = `Reporte de INGRESO DE LEADS · corte ${d.corte} (${d.fechaTxt}).\n` +
    `IMPORTANTE: B2C y B2B son canales distintos, trátalos SIEMPRE por separado. No los sumes.\n\n` +
    bloque(`FRANJA de este corte (${hIni}h→${hFin}h)`, x => x.franja) + `\n\n` +
    bloque(`ACUMULADO del día (00h→${hFin}h)`, x => x.acum) + `\n\n` +
    `Escribe el mensaje para el grupo de marketing, TODO en español:\n` +
    `1) Encabezado con el corte y la fecha.\n` +
    `2) FRANJA de este corte: para B2C y para B2B por separado, cuántos llegaron hoy vs la misma franja de ayer y antier (mejor/peor y por cuánto).\n` +
    `3) ACUMULADO del día: igual, B2C por un lado y B2B por otro, hoy vs ayer y antier a la misma hora.\n` +
    `4) Lectura corta por canal: ¿cuál va bien y cuál hay que acelerar? Si está en cero y es temprano, motiva a arrancar.\n` +
    `Conciso, formato WhatsApp, negritas con un asterisco. Nunca sumes B2C+B2B. No inventes números. Cero inglés.`;
  return await llamar(instruccion, 500);
}

// Análisis integral de performance de marketing. Recibe el panel (filas por anuncio + totales)
// y pide a la IA un análisis de: qué escalar/quemar, cuello del embudo (marketing vs gestión), y eficiencia de costo.
async function interpretarPerformance(panel, fechaTxt) {
  if (!configurado()) return null;
  const filas = (panel.filas || []).filter(f => !f.esOrganico && !f.esRelead && !f.esSinDesglose);
  if (!filas.length) return null;
  const usd = n => n == null ? 's/d' : '$' + (Math.round(n * 100) / 100);
  const norm = x => String(x || '').toLowerCase();
  const tipoCreativo = f => /landing/i.test(f.anuncio) || /landing/i.test(f.campana) ? 'landing' : (/registro|formulario|registrate/i.test(f.anuncio) || /formulario/i.test(f.campana) ? 'formulario' : 'otro');

  // Arma el detalle SOLO de un canal (b2c o b2b), sin datos de gestión (marketing puro).
  const detalleCanal = (canal) => {
    const fc = filas.filter(f => (canal === 'b2b' ? /b2b/i.test(f.campana) : /b2c/i.test(f.campana)) && ((f.costo || 0) > 0 || (f.leadsCRM || 0) > 0));
    if (!fc.length) return null;
    let gasto = 0, leads = 0;
    const lineas = fc.map(f => {
      gasto += f.costo || 0; leads += f.leadsCRM || 0;
      const cpl = f.leadsCRM ? (f.costo / f.leadsCRM) : null;
      const activo = f.adStatus === 'ACTIVE' ? 'activo' : (f.adStatus ? 'pausado' : 'estado n/d');
      return `- ${f.anuncio} [${tipoCreativo(f)}, ${activo}]: gasto ${usd(f.costo)}, ${f.leadsCRM || 0} leads, CPL ${usd(cpl)}, ${f.impresiones || 0} impresiones`;
    }).join('\n');
    const cplCanal = leads ? gasto / leads : null;
    return { gasto, leads, cplCanal, lineas, n: fc.length };
  };

  const b2c = detalleCanal('b2c');
  const b2b = detalleCanal('b2b');

  // Construye un bloque de instrucción por canal (solo si hay datos).
  const bloqueCanal = (nombre, d) => {
    if (!d) return `\n### ${nombre}\nSin inversión ni leads registrados en este canal para la fecha.`;
    return `\n### ${nombre}\nInversión total: ${usd(d.gasto)} · Leads: ${d.leads} · CPL del canal: ${usd(d.cplCanal)}\nAnuncios:\n${d.lineas}`;
  };

  const periodo = (panel.desde === panel.hasta) ? `del ${panel.desde}` : `del ${panel.desde} al ${panel.hasta}`;
  const instruccion = `Eres analista de medios pagados (paid media) de Tasatop. Analiza el rendimiento de las campañas de Meta Ads ${periodo} (el gasto ya está consolidado). Esto es un análisis de MARKETING: enfócate en inversión, costo por lead, creatividades y eficiencia de pauta. NO analices la gestión comercial ni el embudo de ventas (eso es de otro equipo).\n` +
    `\nDATOS (B2C y B2B son negocios distintos, analízalos POR SEPARADO, sin compararlos entre sí ni mezclar sus cifras):` +
    bloqueCanal('CANAL B2C', b2c) +
    bloqueCanal('CANAL B2B', b2b) +
    `\n\nEscribe un DIAGNÓSTICO profesional para el equipo de marketing, en español, tono ejecutivo y objetivo (evita palabras agresivas como "quemar" o "sangría"; usa "reasignar", "optimizar", "pausar", "bajo rendimiento").\n` +
    `Estructura el mensaje en DOS secciones independientes, una por canal:\n\n` +
    `*📊 B2C*\n- Qué anuncios/formatos rinden mejor (menor CPL) y merecen más presupuesto.\n- Qué anuncios están por debajo del promedio del canal y conviene optimizar o pausar.\n- Lectura de formato: ¿rinde mejor landing o formulario en B2C?\n\n` +
    `*🏢 B2B*\n- Lo mismo, pero SOLO con datos B2B, sin compararlo con B2C.\n\n` +
    `Cierra con una línea de *acción prioritaria* por canal. Sé concreto con cifras, pero prioriza lo accionable. No inventes datos. Si un canal no tiene datos, dilo en una línea.\n` +
    `FORMATO WHATSAPP OBLIGATORIO: negritas con UN SOLO asterisco (*texto*), NUNCA dobles (**). No uses separadores de línea (---) ni encabezados Markdown (#).`;
  return await llamar(instruccion, 1000);
}
// Análisis ejecutivo del comité B2C: recibe las métricas del periodo y da lectura + acciones.
async function interpretarComite(d, asesor) {
  if (!configurado()) return null;
  const R = d.resumen || {}, V = d.velocidad || {};
  const foco = asesor && String(asesor).trim()
    ? `\\n\\nIMPORTANTE: este análisis es SOLO de la gestora "${asesor}" (filtrada). Enfoca el análisis en su desempeño individual, no del equipo completo.`
    : '';
  const emb = (d.embudo || []).map(e => `  ${e.etapa}: ${e.enEtapa} en etapa, ${e.alcanzaron} alcanzaron (${e.pctDelTotal}% del total)`).join('\n');
  const tpe = (d.tiempoPorEtapa || []).map(t => `  ${t.etapa}: ${t.horasProm}h promedio (n=${t.n})`).join('\n');
  const des = (d.desestimados || []).map(x => `  ${x.motivo}: ${x.n}`).join('\n') || '  (sin desestimados)';
  const rk = (d.ranking || []).map(g => `  ${g.gestor}: ${g.asignados} asignados, ${g.contactados} contactados (${g.pctContacto}%), ${g.calificados} calif, ${g.agendados} agend, ${g.ganados} ganados; 1er contacto ${g.t1erMed != null ? g.t1erMed + 'min' : 's/d'}, ${g.intentos1erProm != null ? g.intentos1erProm + ' intentos' : 's/d'}`).join('\n');
  const instruccion = `Análisis para COMITÉ del equipo B2C (inversionistas) de Tasatop. Periodo ${d.desde} a ${d.hasta}.\n\n` +
    `RESUMEN: ${R.totalLeads} leads trabajados, ${R.contactados} contactados (${R.contactabilidad}% contactabilidad), ${R.ganados} cerrados ganados (S/ ${R.montoGanado}), ${R.perdidos} desestimados. Tasa de cierre ${R.tasaCierre}%. ${R.hicieron3x5} completaron el 3x5 (15 intentos); ${R.con1masIntento} tienen al menos 1 intento.\n\n` +
    `VELOCIDAD: primer contacto en ${V.medianaMinPrimerContacto != null ? V.medianaMinPrimerContacto + ' min (mediana)' : 's/d'}, promedio ${V.promMinPrimerContacto != null ? V.promMinPrimerContacto + ' min' : 's/d'}; ${V.promIntentosPrimerContacto != null ? V.promIntentosPrimerContacto + ' intentos en promedio para lograr contacto' : ''}.\n\n` +
    `EMBUDO (conversión):\n${emb}\n\nTIEMPO POR ETAPA:\n${tpe || '  (sin datos)'}\n\nDESESTIMADOS POR MOTIVO:\n${des}\n\nRANKING POR GESTOR:\n${rk}\n\n` +
    `Escribe un análisis ejecutivo en español para el comité, con esta estructura:\n` +
    `*📊 RESULTADO* — el titular: qué se logró en el periodo (leads, cierres, monto, contactabilidad).\n` +
    `*🔻 EMBUDO* — dónde se convierte bien y dónde se cae; identifica el cuello principal.\n` +
    `*⚡ DISCIPLINA* — velocidad al primer contacto, uso del 3x5, qué tan rápido y consistente es el equipo.\n` +
    `*🏆 EQUIPO* — quién destaca y quién necesita apoyo (sin exponer, tono constructivo).\n` +
    `*🎯 ACCIONES* — 3 acciones concretas y priorizadas para la próxima quincena.\n` +
    `Sé ejecutivo y directo, con cifras clave pero sin saturar. Formato WhatsApp/texto, negritas con un asterisco. No inventes datos.` + foco;
  return await llamar(instruccion, 1100);
}

// ===== Panel IA del Centro de Operaciones B2B (v1.363) =====
// Recibe el payload YA CALCULADO por dashboard-b2b.js y devuelve recomendaciones
// accionables en dos bloques: OPERACIÓN y DESESTIMADOS. Nunca inventa cifras.
async function analizarOperacionB2B(D) {
  const K = D.kpis || {};
  const prod = (D.productividad || []).filter(p => p.asignados > 0)
    .map(p => `  ${p.ejecutivo}: ${p.asignados} asignados, ${p.gestionadosHoy} gestionados hoy, 3x3 ${p.cumpl3x3 != null ? p.cumpl3x3 + '%' : 's/d'}, 1er contacto ${p.primerContactoMin != null ? p.primerContactoMin + ' min' : 's/d'}, pipeline ${p.pipelineFmt}, BC ${p.businessCase}, índice ${p.indice != null ? p.indice : 's/d'} (${p.semaforo})`).join('\n');
  const cue = (D.cuellos || []).filter(c => c.n > 0).map(c => `  ${c.etapa}: ${c.n} leads, ${c.promDias} días prom (máx ${c.maxDias}), ${c.sinGestion} sin gestión`).join('\n');
  const alertasTxt = (D.alertas || []).slice(0, 8).map(a => `  [${a.prioridad}] ${a.texto}`).join('\n') || '  (sin alertas)';
  const X = D.desestimados || {};
  const motivosTxt = (X.motivos || []).map(m => `  ${m.motivo}: ${m.n}`).join('\n') || '  (sin descartes en el periodo)';
  const quienTxt = (X.porQuien || []).map(q => `  ${q.por}: ${q.n}`).join('\n') || '  —';
  const instruccion = `Eres el analista del CENTRO DE OPERACIONES B2B de Tasatop (crédito empresarial con garantía inmobiliaria). Fecha: ${D.fecha}.\n\n` +
    `KPIs DEL PERIODO: ${K.nuevos ? K.nuevos.hoy : 0} leads nuevos (${K.nuevos ? (K.nuevos.delta >= 0 ? '+' : '') + K.nuevos.delta : 0} vs periodo anterior), ${K.gestionados ? K.gestionados.hoy : 0} gestionados, movimiento ${K.movimiento ? K.movimiento.avanzaron + '↑ ' + K.movimiento.retrocedieron + '↓' : 's/d'}. ` +
    `Cumplimiento 3x3: ${K.cumpl3x3 ? K.cumpl3x3.pct : 0}% (${K.cumpl3x3 ? K.cumpl3x3.exigibles : 0} exigibles, ${K.cumpl3x3 ? K.cumpl3x3.atrasados : 0} atrasados, ${K.cumpl3x3 ? K.cumpl3x3.vencidosIncumplidos || 0 : 0} vencidos SIN registrar intentos [grave], ${K.cumpl3x3 ? K.cumpl3x3.vencidosOk || 0 : 0} con intentos completos sin lograr contacto). ` +
    `Contactabilidad ${K.contactabilidad ? K.contactabilidad.pct : 0}%. Avanzaron sin contacto: ${K.avanzaronSinContacto ? K.avanzaronSinContacto.n : 0} (${K.avanzaronSinContacto ? K.avanzaronSinContacto.montoFmt : ''}). ` +
    `Pipeline ${K.pipeline ? K.pipeline.montoFmt : ''} en ${K.pipeline ? K.pipeline.n : 0} solicitudes. Riesgo alto: ${K.riesgoAlto ? K.riesgoAlto.n : 0}. Salud del pipeline: ${D.salud ? D.salud.indice : 's/d'}/100 (${D.salud ? D.salud.etiqueta : ''}).\n\n` +
    `META DEL MES (equipo): ${D.meta && D.meta.global ? D.meta.global.logradoFmt + ' de ' + D.meta.global.montoFmt + ' (' + (D.meta.global.pct != null ? D.meta.global.pct + '%' : 's/meta') + '), quedan ' + D.meta.diasRestantes + ' días' : 's/d'}.\n\n` +
    `ALERTAS ACTIVAS:\n${alertasTxt}\n\nPRODUCTIVIDAD POR EJECUTIVO:\n${prod || '  (sin datos)'}\n\nCUELLOS DE BOTELLA:\n${cue || '  (sin datos)'}\n\n` +
    `DESESTIMADOS DEL PERIODO: ${X.total || 0} descartes (${X.montoFmt || 'S/ 0'}). Sin contacto previo: ${X.sinContacto || 0}. Descartes PREMATUROS (sin contacto registrado y antes de cumplir el 3x3): ${X.prematuros || 0}.\nMOTIVOS:\n${motivosTxt}\nQUIÉN DESCARTA:\n${quienTxt}\n\n` +
    `Escribe un REPORTE EJECUTIVO para el jefe comercial B2B con EXACTAMENTE estos tres bloques, cada título en su propia línea con el formato indicado:\n` +
    `*📊 PANORAMA*\n(2-3 líneas de prosa: el estado general del pipeline hoy — volumen, salud, meta, lo más relevante)\n` +
    `*🔍 DIAGNÓSTICO*\n(máximo 5 líneas, cada una empieza con "- ": los problemas concretos ordenados por gravedad — cuellos, ejecutivos rezagados, contactabilidad, descartes indebidos, avances sin contacto)\n` +
    `*🎯 PLAN DE ACCIÓN*\n(máximo 5 líneas, cada una empieza con "- ": acciones específicas y priorizadas para HOY/esta semana, con nombres y montos cuando aplique)\n` +
    `Sé directo, ejecutivo y accionable, con las cifras clave. No inventes datos ni nombres que no estén arriba.`;
  return await llamar(instruccion, 1000);
}


// COMITÉ EJECUTIVO B2B (v1.443): análisis estratégico para el Comité Comercial
// (lun/mié/vie 9am, lo conduce Dante). Salida en 3 secciones parseables por el
// front: ###PANORAMA / ###DIAGNOSTICO / ###PLAN. Español impecable, tono de
// asesor estratégico senior, plan de acción con responsable + acción + plazo.
async function analizarComiteEjecutivoB2B(D) {
  const K = D.kpis || {};
  const M = (D.meta && D.meta.global) || D.meta || {};
  const emb = (D.embudo || []).map(f => `  ${f.etapa}: ${f.nAcum} acumulado (${f.montoAcumFmt}) · conv. desde anterior ${f.convDesdeAnterior}% · vivos en etapa ${f.vivos} (${f.montoVivosFmt}) · desestimados aquí ${f.desest}`).join('\n');
  const prod = (D.productividad || []).filter(p => p.asignados > 0)
    .map(p => `  ${p.ejecutivo}: ${p.asignados} leads, 3x3 ${p.cumpl3x3 != null ? p.cumpl3x3 + '%' : 's/d'}, pipeline ${p.pipelineFmt}, en Business Case ${p.businessCase}`).join('\n');
  const alertas = [...(D.alertasCriticas || []), ...(D.alertasAltas || [])].slice(0, 8).map(a => `  [${a.prioridad}] ${a.texto}`).join('\n') || '  (sin alertas)';
  const X = D.desestimados || {}; const XR = X.resumen || {};
  const motivos = (X.porMotivo || []).slice(0, 5).map(m => `  ${m.motivo}: ${m.n} (${m.montoFmt})`).join('\n') || '  —';
  const inds = ((D.meta && D.meta.individuales) || []).map(i => `  ${i.nombre}: meta ${i.montoFmt}, logrado ${i.logradoFmt}, en Reunión+ ${i.enCaminoFmt || 'S/ 0'}`).join('\n') || '  (sin metas individuales)';
  const instruccion = `Eres el asesor estratégico senior del COMITÉ COMERCIAL B2B de Tasatop (financiamiento empresarial con garantía inmobiliaria, Perú). El comité lo conduce Dante (Jefe B2B) los lunes, miércoles y viernes a las 9:00. Periodo analizado: ${D.periodo ? D.periodo.desde + ' al ' + D.periodo.hasta : 's/d'}.\n\n` +
    `SITUACIÓN:\n` +
    `- Pipeline vivo (solo leads asignados): ${K.pipeline ? K.pipeline.montoFmt : 's/d'} en ${K.pipeline ? K.pipeline.n : 0} solicitudes. Conversión Solicitud→Business Case: ${D.conversionGlobal != null ? D.conversionGlobal + '%' : 's/d'}.\n` +
    `- Meta del mes (equipo, a cargo de Dante): ${M.logradoFmt || 'S/ 0'} de ${M.montoFmt || 's/d'} (${M.pct != null ? M.pct + '%' : 's/d'}), quedan ${D.meta ? D.meta.diasRestantes : 's/d'} días. Monto en Reunión comercial o más allá (potencial): ${D.meta ? D.meta.enCaminoEquipoFmt : 'S/ 0'}.\n` +
    `- Contactabilidad: ${K.contactabilidad ? K.contactabilidad.pct + '%' : 's/d'} (${K.contactabilidad ? K.contactabilidad.efectivos : 0} efectivos, ${K.contactabilidad ? K.contactabilidad.sinContacto : 0} sin contacto). Cumplimiento 3x3: ${K.cumpl3x3 ? K.cumpl3x3.pct + '%' : 's/d'}.\n` +
    `- Gestiones de llamada del periodo: ${D.llamadas ? D.llamadas.total : 0} sobre ${D.llamadas ? D.llamadas.empresasUnicas : 0} empresas únicas. Leads sin gestión hace más de 48 h: ${D.sinContacto48 ? D.sinContacto48.n + ' (' + D.sinContacto48.montoFmt + ')' : 's/d'}.\n\n` +
    `EMBUDO (acumulado):\n${emb}\n\nMETAS INDIVIDUALES:\n${inds}\n\nEJECUTIVOS:\n${prod || '  s/d'}\n\nALERTAS:\n${alertas}\n\n` +
    `DESESTIMADOS DEL PERIODO: ${XR.total || 0} (${XR.montoFmt || 'S/ 0'}), tiempo de vida promedio ${XR.diasVivoProm != null ? XR.diasVivoProm + ' días' : 's/d'}. Causas principales:\n${motivos}\n\n` +
    `Redacta el análisis del comité en ESPAÑOL IMPECABLE (ortografía y tildes perfectas), tono ejecutivo y estratégico, sin relleno. Devuelve EXACTAMENTE este formato con los tres marcadores en líneas propias:\n` +
    `###PANORAMA\n(2-3 oraciones de prosa: lectura estratégica del estado — dónde está la plata, qué tan sano es el ritmo hacia la meta, el riesgo principal. No repitas cifras que no aporten a la conclusión.)\n` +
    `###DIAGNOSTICO\n(3-4 líneas, cada una empieza con "- ": causas raíz ordenadas por impacto en soles, no síntomas. Vincula el problema con su consecuencia en la meta.)\n` +
    `###PLAN\n(3-5 líneas, cada una con el formato "Responsable | Acción concreta | Resultado esperado y plazo". Usa los nombres reales de arriba (Dante, Shirley, Bony, Luis). Prioriza por monto recuperable. Acciones que se puedan verificar en el siguiente comité.)\n` +
    `No inventes datos ni nombres. Si algo está en cero, di qué decisión requiere en lugar de solo describirlo.`;
  return await llamar(instruccion, 1200);
}


// RESUMEN DE REUNIÓN COMERCIAL (v1.448): analiza la transcripción diarizada
// que trae el bot de Recall y produce un resumen accionable para el CRM.
// contexto: { mundo: 'b2c'|'b2b', cliente, empresa, monto, etapa, participantes: [] }
async function resumenReunionComercial(transcriptTexto, contexto) {
  const c = contexto || {};
  const quien = c.mundo === 'b2b'
    ? ('Empresa: ' + (c.empresa || '—') + (c.cliente ? ' · Contacto: ' + c.cliente : '') + (c.monto ? ' · Financiamiento solicitado: ' + c.monto : ''))
    : ('Inversionista potencial: ' + (c.cliente || '—') + (c.monto ? ' · Ticket estimado: ' + c.monto : ''));
  const instruccion = `Eres el analista comercial senior de Tasatop (crowdlending con garantía inmobiliaria, Perú). Analiza la transcripción de una reunión ${c.mundo === 'b2b' ? 'de originación B2B (empresa que busca financiamiento)' : 'comercial B2C (captación de inversionista)'}.\n` +
    `${quien}\n` + (Array.isArray(c.participantes) && c.participantes.length ? 'Participantes: ' + c.participantes.join(', ') + '\n' : '') +
    `\nTRANSCRIPCIÓN (hablante: texto):\n${String(transcriptTexto || '').slice(0, 24000)}\n\n` +
    `Redacta en ESPAÑOL IMPECABLE y devuelve EXACTAMENTE este formato con los marcadores en líneas propias:\n` +
    `###RESUMEN\n(3-4 oraciones: qué se trató, postura del cliente, temperatura del cierre.)\n` +
    `###ACUERDOS\n(líneas con "- ": compromisos concretos de cada parte; si no hubo, dilo.)\n` +
    `###OBJECIONES\n(líneas con "- ": objeciones o dudas del cliente y cómo se respondieron; omite la sección si no hubo.)\n` +
    `###PROXIMOS\n(líneas con "- ": próximos pasos con responsable y plazo si se mencionó.)\n` +
    `No inventes nada que no esté en la transcripción.`;
  return await llamar(instruccion, 900);
}

// Call scoring: analiza la transcripción de una llamada comercial y devuelve un puntaje
// por dimensión + hallazgos. Devuelve texto formateado (o null si falla/no configurado).
async function scoringLlamada(transcripcion, ctx) {
  if (!configurado() || !transcripcion) return null;
  const c = ctx || {};
  const prompt = 'Eres un coach comercial senior de Tasatop (crowdlending con garantía inmobiliaria, Perú). ' +
    'Analiza esta transcripción de llamada comercial y devuelve un CALL SCORING conciso en este formato EXACTO:\n\n' +
    '*📊 Score total: X/100*\n' +
    '• Apertura y rapport: X/20 — (1 línea)\n' +
    '• Descubrimiento de necesidades: X/20 — (1 línea)\n' +
    '• Presentación de valor: X/20 — (1 línea)\n' +
    '• Manejo de objeciones: X/20 — (1 línea)\n' +
    '• Cierre y siguiente paso: X/20 — (1 línea)\n' +
    '*💡 Lo mejor:* (1 línea)\n' +
    '*⚠️ A mejorar:* (1 línea concreta y accionable)\n' +
    '*🎯 Siguiente paso acordado:* (lo que quedó pactado, o "no se pactó")\n\n' +
    (c.asesor ? 'Asesor: ' + c.asesor + '. ' : '') + (c.cliente ? 'Cliente: ' + c.cliente + '. ' : '') +
    'El hablante "Asesor" es el vendedor y "Cliente" es el prospecto.\n\nTRANSCRIPCIÓN:\n' + String(transcripcion).slice(0, 24000);
  return await llamar(prompt, 700);
}

module.exports = { configurado, interpretarGestion, interpretarPlanes, interpretarMarketing, interpretarPerformance, interpretarComite, analizarOperacionB2B, analizarComiteEjecutivoB2B, resumenReunionComercial, scoringLlamada };
