// =============================================================
// CRM TASATOP WEB - LOGICA DE NEGOCIO
// Port 1:1 de las reglas calibradas en la version Google Sheets:
//  - Score de calificacion 0-90 (interes, ticket, tiempo, experiencia)
//  - Probabilidad % por tramos de etapa, modulada por el score
//  - Fase 3x5: 30% base, -2% por intento fallido, piso 4%
//  - Etapa derivada del ultimo resultado
//  - Prioridad operativa (urgencia)
//  - Validacion de gestion (factores solo en fase "respondio")
//  - Cadencia: autocalculo de fecha proxima accion (9am-18, dias habiles)
// =============================================================

const ASESORES = ['Mafer Lujan', 'Lourdes Villavicencio', 'Dora Barreto', 'Cristian Povis', 'Henry Guerrero']; // v1.452: Breezy Ortega dada de baja

const CANALES = ['Llamada', 'WhatsApp', 'Correo'];
const FUENTES = ['Meta Ads', 'Google Ads', 'Referido', 'Organico', 'LinkedIn', 'Otro'];

const RESULTADOS = [
  'No contesto', 'Buzon / apagado', 'WhatsApp enviado sin respuesta',
  'Respondio - sin calificar', 'Respondio - calificado',
  'Respondio - no interesado', 'Respondio - no califica',
  'Seguimiento post contacto',
  'Agendo reunion', 'Confirmo reunion', 'No asistio a reunion', 'Reprogramo reunion',
  'Reunion efectiva', 'Seguimiento post reunion', 'Cierre pendiente',
  'Evaluando', 'En negociacion', 'Desistio',
  'Venta ganada', 'Numero invalido', 'Numero equivocado', 'Pidio no contactar'
];

// Mapa etapa -> resultados permitidos, agrupados para mostrar con separadores.
// El asesor solo ve lo que puede ocurrir en la etapa actual del lead.
const RESULTADOS_POR_ETAPA = {
  'Contactabilidad 3x5': [
    ['Sin contacto', ['No contesto', 'Buzon / apagado', 'WhatsApp enviado sin respuesta']],
    ['Contacto', ['Respondio - sin calificar', 'Respondio - calificado', 'Agendo reunion']],
    ['Descarte', ['Numero equivocado', 'Numero invalido', 'Respondio - no interesado']]
  ],
  'Contactado - por calificar': [
    ['Sin contacto', ['No contesto', 'Buzon / apagado', 'WhatsApp enviado sin respuesta']],
    ['Avanza', ['Respondio - sin calificar', 'Respondio - calificado', 'Agendo reunion']],
    ['Cierra', ['Respondio - no interesado', 'Respondio - no califica']]
  ],
  'Calificado - pendiente agendar': [
    ['Sin contacto', ['No contesto', 'Buzon / apagado', 'WhatsApp enviado sin respuesta']],
    ['Avanza', ['Agendo reunion']],
    ['Se mantiene', ['Respondio - calificado', 'Seguimiento post contacto']],
    ['Cierra', ['Respondio - no interesado', 'Respondio - no califica']]
  ],
  'Agendado - pendiente reunion': [
    ['Sin contacto', ['No contesto', 'Buzon / apagado', 'WhatsApp enviado sin respuesta']],
    ['Se mantiene', ['Confirmo reunion', 'Reprogramo reunion']],
    ['Avanza', ['Reunion efectiva']],
    ['Cierra', ['No asistio a reunion', 'Respondio - no interesado']]
  ],
  'Reunion efectiva - seguimiento': [
    ['Sin contacto', ['No contesto', 'Buzon / apagado', 'WhatsApp enviado sin respuesta']],
    ['Se mantiene', ['Evaluando']],
    ['Avanza', ['En negociacion']]
  ],
  'Cierre pendiente': [
    ['Sin contacto', ['No contesto', 'Buzon / apagado', 'WhatsApp enviado sin respuesta']],
    ['Se mantiene', ['Seguimiento post reunion']],
    ['Cierra', ['Venta ganada']]
  ]
};

// Resultados de "sin contacto" que NO deben hacer retroceder la etapa del lead:
// se registran como intento fallido pero el lead mantiene su avance maximo.
const RESULTADOS_SIN_CONTACTO = ['No contesto', 'Buzon / apagado', 'WhatsApp enviado sin respuesta'];

const PROXIMAS_ACCIONES = [
  'Llamar intento 3x5', 'Enviar WhatsApp de apoyo', 'Calificar lead',
  'Llamar para calificar', 'WhatsApp para calificar',
  'Agendar reunion (llamar)', 'Agendar reunion (whatsapp)',
  'Confirmar reunion (llamar)', 'Confirmar reunion (whatsapp)',
  'Seguimiento post reunion (llamada)', 'Seguimiento post reunion (whatsapp)',
  'Cerrar venta (llamada)', 'Cerrar venta (whatsapp)',
  'Agendar reunion', 'Confirmar asistencia', 'Reprogramar reunion',
  'Seguimiento post reunion', 'Enviar informacion', 'Enviar propuesta',
  'Cerrar venta', 'Desestimar'
];

// Proximas acciones sugeridas segun el resultado de la gestion.
// Si el resultado no esta mapeado, se permite la lista completa.
const ACCIONES_POR_RESULTADO = {
  'No contesto': ['Llamar intento 3x5', 'Enviar WhatsApp de apoyo'],
  'Buzon / apagado': ['Llamar intento 3x5', 'Enviar WhatsApp de apoyo'],
  'WhatsApp enviado sin respuesta': ['Llamar intento 3x5', 'Enviar WhatsApp de apoyo'],
  'Respondio - sin calificar': ['Llamar para calificar', 'WhatsApp para calificar'],
  'Respondio - calificado': ['Agendar reunion (llamar)', 'Agendar reunion (whatsapp)'],
  'Agendo reunion': ['Confirmar reunion (llamar)', 'Confirmar reunion (whatsapp)'],
  'Confirmo reunion': ['Confirmar asistencia', 'Reprogramar reunion'],
  'Reprogramo reunion': ['Confirmar asistencia', 'Reprogramar reunion'],
  'No asistio a reunion': ['Reprogramar reunion', 'Seguimiento post reunion'],
  'Reunion efectiva': ['Seguimiento post reunion (llamada)', 'Seguimiento post reunion (whatsapp)'],
  'Evaluando': ['Seguimiento post reunion (llamada)', 'Seguimiento post reunion (whatsapp)'],
  'En negociacion': ['Cerrar venta (llamada)', 'Cerrar venta (whatsapp)'],
  'Desistio': ['Desestimar'],
  'Seguimiento post contacto': ['Seguimiento post reunion', 'Agendar reunion', 'Enviar propuesta'],
  'Seguimiento post reunion': ['Seguimiento post reunion', 'Enviar propuesta'],
  'Cierre pendiente': ['Cerrar venta (llamada)', 'Cerrar venta (whatsapp)'],
  'Seguimiento post reunion': ['Cerrar venta (llamada)', 'Cerrar venta (whatsapp)'],
  'Respondio - no interesado': ['Desestimar'],
  'Respondio - no califica': ['Desestimar'],
  'Numero invalido': ['Desestimar'],
  'Numero equivocado': ['Desestimar'],
  'Pidio no contactar': ['Desestimar'],
  'Venta ganada': ['Desestimar']
};

function obtenerAccionesPermitidas(resultado) {
  return ACCIONES_POR_RESULTADO[resultado] || PROXIMAS_ACCIONES;
}

// ---------- Kanban ----------
// Las 6 columnas visibles del pipeline ACTIVO (los cerrados no se muestran).
const KANBAN_COLUMNAS = [
  { id: 'contactar', titulo: 'Por contactar', etapas: ['Contactabilidad 3x5'] },
  { id: 'contactado', titulo: 'Contactado', etapas: ['Contactado - por calificar'] },
  { id: 'calificado', titulo: 'Calificado', etapas: ['Calificado - pendiente agendar'] },
  { id: 'agendado', titulo: 'Agendado', etapas: ['Agendado - pendiente reunion'] },
  { id: 'reunido', titulo: 'Reunion efectiva', etapas: ['Reunion efectiva - seguimiento'] },
  { id: 'negociacion', titulo: 'Negociacion', etapas: ['Cierre pendiente'] }
];

// Al soltar una tarjeta en una columna, este es el resultado de gestion sugerido.
const KANBAN_RESULTADO_DESTINO = {
  contactado: 'Respondio - sin calificar',
  calificado: 'Respondio - calificado',
  agendado: 'Agendo reunion',
  reunido: 'Reunion efectiva',
  negociacion: 'En negociacion'
};

// Columna a la que pertenece una etapa dada.
function columnaDeEtapa(etapa) {
  const c = KANBAN_COLUMNAS.find(col => col.etapas.includes(etapa));
  return c ? c.id : 'contactar';
}

// Transiciones permitidas en el Kanban (sin retroceso). Reglas de negocio:
//  - contactar -> contactado, calificado, agendado
//  - contactado -> calificado, agendado
//  - calificado -> agendado, reunido, negociacion
//  - agendado   -> reunido
//  - reunido    -> negociacion
//  Prohibido: cualquier retroceso, y saltos no listados
//  (p.ej. contactar/contactado -> reunido, contactar -> negociacion).
const KANBAN_TRANSICIONES = {
  contactar:   ['contactado', 'calificado', 'agendado'],
  contactado:  ['calificado', 'agendado'],
  calificado:  ['agendado'],
  agendado:    ['reunido'],
  reunido:     ['negociacion'],
  negociacion: []
};

function transicionKanbanValida(etapaActual, columnaDestino) {
  const origen = columnaDeEtapa(etapaActual);
  if (origen === columnaDestino) return false; // misma columna
  const permitidas = KANBAN_TRANSICIONES[origen] || [];
  return permitidas.includes(columnaDestino);
}

const NIVEL_INTERES = ['Muy interesado', 'Interesado', 'Solo consulta', 'Bajo interes'];
const TICKET_RANGO = ['S/ 200,000 a mas', 'S/ 100,000 - 199,999', 'S/ 50,000 - 99,999', 'S/ 10,000 - 49,999'];
const TIEMPO = ['0 a 7 dias', '8 a 15 dias', '16 a 30 dias', '> 30 dias'];
// "¿Puede decidir?" (antes "¿Puede avanzar?")
const AVANCE = ['Decide solo', 'Decide acompanado', 'Debe consultar', 'No avanza'];
const EXPERIENCIA = AVANCE; // alias de compatibilidad
// 5a variable de calificacion: ¿Experiencia invirtiendo?
const EXPERIENCIA_INV = ['Ya invirtio en Tasatop', 'Productos similares', 'Productos tradicionales', 'Primera inversion'];
// Variables del score de CIERRE (negociacion) — version optimizada
const C_FONDOS = ['Listo hoy', 'En 7 dias', 'Mas de 7 dias', 'Sin fecha'];
const C_PRIORIZA = ['Tasa', 'Garantia', 'Plazo', 'Solidez de la empresa']; // informativo (0 pts)
const C_PLAZO = ['Menor a 1 ano', 'Mayor a 1 ano']; // subpregunta si elige Plazo
const C_COMPETENCIA = ['No compara', 'Tradicionales', 'Similares', 'Tiene propuesta'];
const C_PROXIMO_PASO = ['Invierte hoy', 'Decide esta semana', 'Enviar info', 'Sin paso'];
const TIPO_REUNION = ['Zoom', 'Google Meet', 'Presencial oficina', 'Llamada telefonica'];
const ESTADO_REUNION = ['No aplica', 'Agendada', 'Confirmada', 'No asistio', 'Reprogramada', 'Efectiva'];
const OBJECIONES = ['Tasa', 'Confianza', 'Garantia', 'Liquidez', 'Monto', 'Tiempo', 'Ya consiguio financiamiento', 'No necesita ahora', 'Otro'];
const MOTIVOS_PERDIDA = ['Tasa muy alta', 'No tiene interes real', 'Sin garantia / no califica', 'Ya consiguio financiamiento', 'No preciso'];

const HORA_MIN = 9, HORA_MAX = 18, HORA_DEFAULT = 9;

// ---------- Grupo limpio (clasificacion del resultado) ----------
function grupoLimpio(resultado) {
  if (['No contesto', 'Buzon / apagado', 'WhatsApp enviado sin respuesta'].includes(resultado)) return 'No_respondio';
  if (['Respondio - sin calificar', 'Respondio - calificado',
       'Respondio - pidio informacion', 'Respondio - interesado'].includes(resultado)) return 'Respondio_sin_agendar';
  if (['Agendo reunion', 'Confirmo reunion', 'Reprogramo reunion'].includes(resultado)) return 'Agendo_reunion';
  if (resultado === 'Reunion efectiva' || resultado === 'Evaluando') return 'Reunion_efectiva';
  if (resultado === 'Cierre pendiente' || resultado === 'En negociacion') return 'Cierre';
  if (resultado === 'Venta ganada') return 'Ganado';
  if (['Respondio - no interesado', 'Respondio - no califica', 'Desistio'].includes(resultado)) return 'Cierre_negativo';
  if (resultado === 'Numero invalido' || resultado === 'Numero equivocado') return 'Dato_invalido';
  if (resultado === 'Pidio no contactar') return 'No_contactar';
  return resultado || '';
}

// ---------- Score de calificacion 0-100 ----------
// 4 variables: Ticket (30) + Interes (30) + Tiempo (20) + Avance (20) = 100.
// Score de CALIFICACION inicial (0-100) con 5 variables.
// Pesos: monto 30, interes 25, tiempo 20, decision 15, experiencia 10.
// Se mantienen labels viejos por compatibilidad con datos historicos.
// CALIFICACIÓN COMPLETA (criterio único y estricto, v1.381): un lead está "Calificado"
// solo si respondió las 5 preguntas — los 5 campos con valor:
//   1 ticket · 2 nivelInteres · 3 tiempo · 4 decisión(avance) · 5 experienciaInv
// Antes se exigían 4 y había un atajo con 1 campo suelto; ambos eliminados.
function calificacionCompleta(g) {
  const decision = g.decision || g.avance || g.experiencia; // "¿Puede decidir?" (histórico usó varios nombres)
  return !!(g.ticket && g.nivelInteres && g.tiempo && decision && g.experienciaInv);
}
// Cuáles de las 5 faltan (para el mensaje de bloqueo).
function calificacionFaltantes(g) {
  const decision = g.decision || g.avance || g.experiencia;
  const faltan = [];
  if (!g.ticket) faltan.push('monto/ticket');
  if (!g.nivelInteres) faltan.push('interés');
  if (!g.tiempo) faltan.push('tiempo');
  if (!decision) faltan.push('decisión');
  if (!g.experienciaInv) faltan.push('experiencia');
  return faltan;
}

function calcularScore({ nivelInteres, ticket, tiempo, avance, experiencia, decision, experienciaInv }) {
  const dec = decision || avance || experiencia; // ¿Puede decidir? (antes "avance")
  let p = 0;
  // 1. ¿Monto a invertir? (30)
  p += { 'S/ 200,000 a mas': 30, 'S/ 100,000 - 199,999': 25, 'S/ 50,000 - 99,999': 20, 'S/ 10,000 - 49,999': 10 }[ticket] || 0;
  // 2. ¿Nivel de interes? (25)
  p += { 'Muy interesado': 25, 'Interesado': 18, 'Solo consulta': 10, 'Solo averigua': 10, 'Bajo interes': 5, 'Poco interes': 5 }[nivelInteres] || 0;
  // 3. ¿Cuando invertiria? (20)
  p += { '0 a 7 dias': 20, '8 a 15 dias': 15, '16 a 30 dias': 10, '> 30 dias': 5 }[tiempo] || 0;
  // 4. ¿Puede decidir? (15)
  p += { 'Decide solo': 15, 'Decide acompanado': 11, 'Debe consultar': 7, 'No avanza': 3 }[dec] || 0;
  // 5. ¿Experiencia invirtiendo? (10)
  p += { 'Ya invirtio en Tasatop': 10, 'Productos similares': 8, 'Productos tradicionales': 5, 'Primera inversion': 3 }[experienciaInv] || 0;
  return Math.min(100, p);
}

// Score de CIERRE (0-100) con las 5 variables de negociacion (version optimizada).
// Pesos: fondos 25, monto 20, prioriza 0 (solo tag), compara 20, proximo paso 35.
function calcularScoreCierre({ fondos, montoConfirmadoRango, criterio, competencia, proximoPaso }) {
  let p = 0;
  // 1. ¿Fondos disponibles? (25)
  p += { 'Listo hoy': 25, 'En 7 dias': 18, 'Mas de 7 dias': 7, 'Sin fecha': 0 }[fondos] || 0;
  // 2. ¿Monto a invertir? (20) — segun rango calculado del valor numerico
  p += { 'S/ 200,000 a mas': 20, 'S/ 100,000 - 199,999': 15, 'S/ 50,000 - 99,999': 8, 'S/ 10,000 - 49,999': 3 }[montoConfirmadoRango] || 0;
  // 3. ¿Que prioriza? (0 — informativo, solo tag; no suma)
  // 4. ¿Compara alternativas? (20)
  p += { 'No compara': 20, 'Tradicionales': 13, 'Similares': 8, 'Tiene propuesta': 3 }[competencia] || 0;
  // 5. ¿Proximo paso? (35)
  p += { 'Invierte hoy': 35, 'Decide esta semana': 25, 'Enviar info': 8, 'Sin paso': 0 }[proximoPaso] || 0;
  return Math.min(100, p);
}

// ---------- Etapa derivada del ultimo resultado ----------
function calcularEtapa({ ultimoResultado, estadoReunion, tieneCalificacion, esCartera }) {
  const r = ultimoResultado;
  if (!r || r === 'Sin gestion') return 'Contactabilidad 3x5';
  if (r === 'Venta ganada') return 'Cerrado ganado';
  if (['Respondio - no interesado', 'Respondio - no califica', 'Desistio', 'Numero invalido', 'Numero equivocado', 'Pidio no contactar'].includes(r)) return 'Cerrado perdido';
  if (r === 'Cierre pendiente' || r === 'En negociacion') return 'Cierre pendiente';
  if (r === 'Reunion efectiva' || r === 'Confirmo reunion' || r === 'Seguimiento post reunion' || r === 'Evaluando' || estadoReunion === 'Efectiva' || estadoReunion === 'Confirmada') return 'Reunion efectiva - seguimiento';
  if (['Agendo reunion', 'Reprogramo reunion', 'No asistio a reunion'].includes(r) ||
      ['Agendada', 'Reprogramada'].includes(estadoReunion)) return 'Agendado - pendiente reunion';
  // Seguimiento post contacto: aun no hay reunion, se mantiene en calificado.
  if (r === 'Seguimiento post contacto') return 'Calificado - pendiente agendar';
  // CARTERA ACTIVA (v1.454): el cliente ya conoce el producto, así que un contacto efectivo
  // lo deja listo para agendar/negociar sin pasar por "por calificar" (embudo abreviado).
  if (esCartera && ['Respondio - sin calificar', 'Respondio - calificado', 'Respondio - pidio informacion', 'Respondio - interesado'].includes(r)) {
    return 'Calificado - pendiente agendar';
  }
  // Si el ultimo resultado significativo es "respondio sin calificar", el lead esta
  // en Contactado aunque arrastre algun dato suelto de calificacion (no debe saltar a Calificado).
  if (r === 'Respondio - sin calificar') return 'Contactado - por calificar';
  if (tieneCalificacion) return 'Calificado - pendiente agendar';
  if (['Respondio - calificado', 'Respondio - pidio informacion', 'Respondio - interesado'].includes(r)) return 'Contactado - por calificar';
  return 'Contactabilidad 3x5';
}

// ---------- Probabilidad % por tramos de etapa ----------
// Formula: Piso + (Techo - Piso) * score/100. Pisos/techos recalibrados:
//   Por contactar 3-12 (baja por intentos), Contactado 10-25, Calificado 25-55,
//   Agendado 45-70, Reunion efectiva 60-85, Negociacion (Cierre pendiente) 85-95,
//   Ganado 100, Perdido 0.
function calcularProbabilidad({ etapa, score, intentos }) {
  const f = (score || 0) / 100;
  const tramo = (piso, techo) => Math.round(piso + (techo - piso) * f);
  switch (etapa) {
    case 'Cerrado ganado': return 100;
    case 'Cerrado perdido': return 0;
    case 'Cierre pendiente': return tramo(50, 90);
    case 'Reunion efectiva - seguimiento': return tramo(60, 85);
    case 'Agendado - pendiente reunion': return tramo(45, 70);
    case 'Calificado - pendiente agendar': return tramo(25, 55);
    case 'Contactado - por calificar': return tramo(10, 25);
    case 'Contactabilidad 3x5': {
      // Baja por intentos fallidos: arranca en el techo (12) y baja ~1.5 por intento, piso 3.
      return Math.max(3, Math.round(12 - (intentos || 0) * 1.5));
    }
    default: return tramo(10, 25);
  }
}

// ---------- Prioridad operativa ----------
// Orden (gana la primera que se cumple):
//  1. Cerrado -> Baja (sin gestion)
//  2. Proxima accion vencida o vence en <=1h -> Muy alta
//  3. Negociacion (Cierre pendiente) -> Muy alta
//  4. Reunion en <=24h -> Muy alta
//  5. Proxima accion vence en <=2h -> Alta
//  6. Lead nuevo creado hoy sin contactar -> Alta
//  7. En "Por contactar" -> segun intentos (1-3 Alta, 4-7 Media, 8-12 Baja, 13+ Muy baja)
//  8. Otras etapas -> segun probabilidad (>=75 MuyAlta, 50-74 Alta, 25-49 Media, <25 Baja)
function calcularPrioridad({ etapa, probabilidad, intentos, fechaProxAccion, fechaReunion, fechaAsignacion, ahora }) {
  const now = ahora || new Date();
  if (etapa === 'Cerrado ganado' || etapa === 'Cerrado perdido') return 'Baja';
  // Minutos hasta la proxima accion (negativo = ya vencida).
  const minProx = fechaProxAccion ? (new Date(fechaProxAccion) - now) / 60000 : null;
  // Muy alta: vencida o inminente (<=1h), negociacion, o reunion <=24h.
  if (minProx !== null && minProx <= 60) return 'Muy alta';
  if (etapa === 'Cierre pendiente') return 'Muy alta';
  if (fechaReunion && new Date(fechaReunion) <= new Date(now.getTime() + 24 * 3600 * 1000)) return 'Muy alta';
  // Alta: proxima accion vence dentro de 2h (no degrada los casos Muy alta de arriba).
  if (minProx !== null && minProx <= 120) return 'Alta';
  if (etapa === 'Contactabilidad 3x5') {
    const ints = intentos || 0;
    // Lead nuevo creado hoy y aun sin intentos -> Alta
    if (ints === 0 && fechaAsignacion && esMismoDia(new Date(fechaAsignacion), now)) return 'Alta';
    if (ints <= 3) return 'Alta';
    if (ints <= 7) return 'Media';
    if (ints <= 12) return 'Baja';
    return 'Muy baja';
  }
  if (probabilidad >= 75) return 'Muy alta';
  if (probabilidad >= 50) return 'Alta';
  if (probabilidad >= 25) return 'Media';
  return 'Baja';
}

function esMismoDia(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const ORDEN_PRIORIDAD = { 'Muy alta': 1, 'Alta': 2, 'Media': 3, 'Baja': 4, 'Muy baja': 5 };

// ===== PRIORITY SCORE B2C (motor de priorización, misma filosofía que el B2B) =====
// Score 0..100 = suma ponderada de 7 sub-scores normalizados 0..1. Pesos configurables
// (llegan por parámetro; si no, usa PScoreDefaultB2C). Devuelve score, nivel y detalle.
const PScoreDefaultB2C = {
  urgencia: 26,       // próxima acción vencida/inminente, reunión próxima, cierre pendiente
  etapa: 18,          // qué tan avanzado (más avanzado = más caro perderlo)
  monto: 16,          // ticket potencial (raíz para no aplastar medianos)
  estancamiento: 14,  // días en la etapa actual sin avanzar
  probabilidad: 12,   // score/probabilidad de cierre ya calculado
  cumpl3x5: 8,        // lead nuevo sin sus intentos mínimos del día → empujar el 3x5
  contactabilidad: 6  // ya respondió alguna vez → vale más perseguir
};

// sol: { etapa, probabilidad, monto, fechaProxAccion, fechaReunion, fechaEntradaEtapa,
//        intentos, intentosEsperados, respondioAlgunaVez, ahora }
// montoMax: mayor monto del cohorte (para normalizar). pesos: objeto opcional.
function priorityScoreB2C(sol, montoMax, pesos) {
  const W = Object.assign({}, PScoreDefaultB2C, pesos || {});
  const now = sol.ahora ? new Date(sol.ahora) : new Date();
  const etapa = sol.etapa || 'Contactabilidad 3x5';
  // Terminales: prioridad mínima.
  if (etapa === 'Cerrado ganado' || etapa === 'Cerrado perdido') {
    return { score: 0, nivel: 'Muy baja', detalle: {} };
  }
  // --- Sub-scores 0..1 ---
  // 1. Urgencia operativa: próxima acción vencida (1) / <=1h (0.9) / <=2h (0.7);
  //    cierre pendiente (0.85); reunión <=24h (0.8). Se toma el mayor.
  let sUrg = 0;
  const minProx = sol.fechaProxAccion ? (new Date(sol.fechaProxAccion) - now) / 60000 : null;
  if (minProx !== null) {
    if (minProx <= 0) sUrg = Math.max(sUrg, 1);
    else if (minProx <= 60) sUrg = Math.max(sUrg, 0.9);
    else if (minProx <= 120) sUrg = Math.max(sUrg, 0.7);
    else if (minProx <= 24 * 60) sUrg = Math.max(sUrg, 0.4);
  }
  if (etapa === 'Cierre pendiente') sUrg = Math.max(sUrg, 0.85);
  if (sol.fechaReunion) {
    const minReu = (new Date(sol.fechaReunion) - now) / 60000;
    if (minReu >= 0 && minReu <= 24 * 60) sUrg = Math.max(sUrg, 0.8);
    else if (minReu < 0 && minReu >= -24 * 60) sUrg = Math.max(sUrg, 0.75); // reunión recién pasada: dar seguimiento
  }
  // 2. Etapa: rank normalizado (0..5 útiles → 0..1). Cierre pendiente = lo más avanzado vivo.
  const rank = RANK_ETAPA[etapa] || 0;
  const sEtapa = Math.min(1, rank / 5);
  // 3. Monto: raíz cuadrada contra el máximo (mantiene jerarquía sin aplastar medianos).
  const monto = Number(sol.monto || 0) || 0;
  const sMonto = montoMax > 0 ? Math.sqrt(monto) / Math.sqrt(montoMax) : 0;
  // 4. Estancamiento: días en la etapa actual, satura a los 5 días.
  const baseEt = sol.fechaEntradaEtapa || null;
  const diasEtapa = baseEt ? Math.floor((now - new Date(baseEt).getTime()) / 86400000) : 0;
  const sEstanc = Math.min(1, diasEtapa / 5);
  // 5. Probabilidad de cierre (0..100 → 0..1).
  const sProb = Math.min(1, Math.max(0, (Number(sol.probabilidad || 0) || 0) / 100));
  // 6. Cumplimiento 3x5: cuánto le falta de sus intentos esperados (solo si aún no contacta útil).
  let sCumpl = 0;
  if (sol.intentosEsperados > 0) {
    const faltan = Math.max(0, sol.intentosEsperados - (sol.intentos || 0));
    sCumpl = Math.min(1, faltan / sol.intentosEsperados);
  }
  // 7. Contactabilidad demostrada: ya respondió alguna vez → 1; nunca → 0.3 (aún vale intentar).
  const sCont = sol.respondioAlgunaVez ? 1 : 0.3;
  // --- Score ponderado 0..100 ---
  const score = Math.round(
    W.urgencia * sUrg + W.etapa * sEtapa + W.monto * sMonto + W.estancamiento * sEstanc +
    W.probabilidad * sProb + W.cumpl3x5 * sCumpl + W.contactabilidad * sCont
  );
  // --- Nivel (mismos cortes de sensación que el B2B) ---
  let nivel;
  if (sUrg >= 1 || score >= 70) nivel = 'Muy alta';
  else if (score >= 50) nivel = 'Alta';
  else if (score >= 30) nivel = 'Media';
  else nivel = 'Baja';
  return {
    score, nivel, diasEnEtapa: diasEtapa,
    detalle: { sUrg: +sUrg.toFixed(2), sEtapa: +sEtapa.toFixed(2), sMonto: +sMonto.toFixed(2),
      sEstanc: +sEstanc.toFixed(2), sProb: +sProb.toFixed(2), sCumpl: +sCumpl.toFixed(2), sCont: +sCont.toFixed(2) }
  };
}

// ---------- Validacion de gestion ----------
// Factores (ticket/tiempo/interes/experiencia) SOLO se exigen en la fase
// "respondio y se converso": pidio informacion / interesado.
function validarGestion(g) {
  if (!g.codigo) return 'Falta codigo de lead';
  if (!g.asesor) return 'Falta asesor';
  if (!g.canal) return 'Falta canal';
  if (!g.resultado) return 'Falta resultado';

  // BLOQUEO ESTRICTO (v1.381): para avanzar a Calificado o más adelante (Agendado,
  // Reunión), el lead DEBE tener las 5 preguntas de calificación completas. Sin atajos.
  const exigeCalificacion = [
    'Respondio - calificado', 'Respondio - interesado', 'Respondio - pidio informacion',
    'Agendo reunion', 'Confirmo reunion', 'Reprogramo reunion', 'Reunion efectiva',
    'Confirmo reunion', 'Seguimiento post reunion', 'Evaluando'
  ].includes(g.resultado);
  if (exigeCalificacion && !calificacionCompleta(g)) {
    const faltan = calificacionFaltantes(g);
    return 'No puedes avanzar sin completar las 5 preguntas de calificación. Falta: ' + faltan.join(', ') + '.';
  }
  if (['Agendo reunion', 'Confirmo reunion', 'Reprogramo reunion'].includes(g.resultado) && !g.fechaReunion) {
    return 'Falta fecha de reunion';
  }
  if (g.resultado === 'Reunion efectiva' && g.estadoReunion !== 'Efectiva') {
    return 'Falta marcar estado de reunion = Efectiva';
  }
  // Al pasar a Negociacion (resultado "En negociacion") la calificacion de cierre
  // es obligatoria: las 5 variables (monto puede ser "No define").
  if (g.resultado === 'En negociacion') {
    const montoOk = (g.montoGestion != null) || g.noDefineMonto;
    if (!g.cFondos || !montoOk || !g.cPrioriza || !g.cCompetencia || !g.cProximoPaso) {
      return 'Completa la calificacion de cierre (5 preguntas) para pasar a Negociacion';
    }
  }
  if (g.resultado === 'Respondio - no interesado' && !g.motivoPerdida) {
    return 'Falta motivo de perdida';
  }
  // Proxima accion obligatoria mientras el lead siga vivo. En cierres
  // (venta ganada o perdida) no se exige porque no hay siguiente paso.
  const esCierre = ['Venta ganada', 'Respondio - no interesado', 'Respondio - no califica',
    'Numero invalido', 'Numero equivocado', 'Pidio no contactar'].includes(g.resultado);
  if (!esCierre && !g.proximaAccion) {
    return 'Falta definir la proxima accion';
  }
  // Fecha de proxima accion obligatoria mientras el lead siga vivo.
  if (!esCierre && !g.fechaProxAccion) {
    return 'Falta la fecha y hora de la proxima accion';
  }
  return 'OK';
}

// ---------- Cadencia: autocalculo de fecha proxima accion ----------
// Solo el domingo es dia no habil; el sabado SI cuenta como dia laborable.
function diaHabilDesde(base, n) {
  const d = new Date(base.getTime());
  let agregados = 0;
  while (agregados < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) agregados++;
  }
  return d;
}

function setHora(fecha, hora) {
  fecha.setHours(hora, 0, 0, 0);
  if (fecha.getDay() === 0) fecha.setDate(fecha.getDate() + 1);
  return fecha;
}

// ---------- Dias habiles para prorrateo de metas (lun-sab; domingo no cuenta) ----------
function esDiaHabil(fecha) { return new Date(fecha).getDay() !== 0; }
// Cuenta dias habiles inclusivos entre 'desde' y 'hasta'.
function contarDiasHabiles(desde, hasta) {
  const d = new Date(desde); d.setHours(0, 0, 0, 0);
  const fin = new Date(hasta); fin.setHours(0, 0, 0, 0);
  let n = 0;
  while (d <= fin) { if (d.getDay() !== 0) n++; d.setDate(d.getDate() + 1); }
  return n;
}
// Dias habiles del mes (mes0: 0=enero).
function diasHabilesMes(anio, mes0) {
  return contarDiasHabiles(new Date(anio, mes0, 1), new Date(anio, mes0 + 1, 0));
}
// Dias habiles transcurridos del mes hasta 'hasta' (inclusive).
function diasHabilesTranscurridos(anio, mes0, hasta) {
  const finMes = new Date(anio, mes0 + 1, 0);
  const tope = new Date(hasta) < finMes ? new Date(hasta) : finMes;
  return contarDiasHabiles(new Date(anio, mes0, 1), tope);
}

// Devuelve Date o null (Desestimar limpia, otras acciones sin regla -> null)
function autocalcularFechaProxAccion(proximaAccion, fechaReunion, ahora) {
  const now = ahora || new Date();
  const reglas = {
    'Llamar intento 3x5': { dias: 1, hora: 9 },
    'Enviar WhatsApp de apoyo': { mas2h: true },
    'Calificar lead': { dias: 1, hora: 9 },
    'Llamar para calificar': { dias: 1, hora: 9 },
    'WhatsApp para calificar': { dias: 1, hora: 9 },
    'Agendar reunion': { dias: 1, hora: 9 },
    'Agendar reunion (llamar)': { dias: 1, hora: 9 },
    'Agendar reunion (whatsapp)': { dias: 1, hora: 9 },
    'Confirmar asistencia': { reunionMenos2h: true },
    'Confirmar reunion (llamar)': { reunionMenos2h: true },
    'Confirmar reunion (whatsapp)': { reunionMenos2h: true },
    'Reprogramar reunion': { dias: 1, hora: 9 },
    'Seguimiento post reunion': { dias: 2, hora: 9 },
    'Seguimiento post reunion (llamada)': { dias: 2, hora: 9 },
    'Seguimiento post reunion (whatsapp)': { dias: 2, hora: 9 },
    'Seguimiento post contacto': { dias: 2, hora: 9 },
    'Enviar informacion': { dias: 1, hora: 9 },
    'Enviar propuesta': { dias: 1, hora: 9 },
    'Cerrar venta': { dias: 1, hora: 9 },
    'Cerrar venta (llamada)': { dias: 1, hora: 9 },
    'Cerrar venta (whatsapp)': { dias: 1, hora: 9 },
    'Desestimar': { limpiar: true }
  };
  const regla = reglas[proximaAccion];
  if (!regla || regla.limpiar) return null;

  if (regla.reunionMenos2h) {
    if (fechaReunion) return new Date(new Date(fechaReunion).getTime() - 2 * 3600 * 1000);
    return setHora(diaHabilDesde(now, 1), HORA_DEFAULT);
  }
  if (regla.mas2h) {
    const f = new Date(now.getTime() + 2 * 3600 * 1000);
    if (f.getHours() >= HORA_MAX || f.getHours() < HORA_MIN) {
      return setHora(diaHabilDesde(now, 1), HORA_DEFAULT);
    }
    return f;
  }
  return setHora(diaHabilDesde(now, regla.dias || 1), regla.hora || HORA_DEFAULT);
}

// ---------- Pipeline estimado por etiqueta de ticket ----------
function montoTicket(etiqueta) {
  return {
    'S/ 200,000 a mas': 200000,
    'S/ 100,000 - 199,999': 150000,
    'S/ 50,000 - 99,999': 75000,
    'S/ 10,000 - 49,999': 30000
  }[etiqueta] || 0;
}

// ---------- Estado consolidado de un lead (a partir de sus gestiones) ----------
// gestiones: array ordenado cronologicamente ascendente.
function consolidarLead(lead, gestiones) {
  const ult = gestiones.length ? gestiones[gestiones.length - 1] : null;
  const ultNV = (campo) => {
    for (let i = gestiones.length - 1; i >= 0; i--) {
      if (gestiones[i][campo]) return gestiones[i][campo];
    }
    return null;
  };

  const intentos = gestiones.filter(g => grupoLimpio(g.resultado) === 'No_respondio').length;
  const ticket = ultNV('ticket');
  const tiempo = ultNV('tiempo');
  const nivelInteres = ultNV('nivelInteres');
  // El campo 'experiencia' en BD almacena el "decision" (¿Puede decidir?).
  const avance = ultNV('experiencia');
  const experienciaInv = ultNV('experienciaInv'); // 5a variable: ¿Experiencia invirtiendo?
  const estadoReunion = ultNV('estadoReunion');
  const fechaReunion = ultNV('fechaReunion');
  const objecion = ultNV('objecion');
  const closer = ultNV('closer');
  const motivoPerdida = ult ? ult.motivoPerdida : null;

  // Variables del score de CIERRE (negociacion)
  const cFondos = ultNV('cFondos');
  const cPrioriza = ultNV('cPrioriza');
  const cPlazo = ultNV('cPlazo');
  const cCompetencia = ultNV('cCompetencia');
  const cProximoPaso = ultNV('cProximoPaso');
  const tieneScoreCierre = !!(cFondos || cPrioriza || cCompetencia || cProximoPaso);

  // El monto vigente del lead (numerico) define el rango/ticket para el score.
  // Si el lead aun no tiene monto numerico, se usa el rango de carga (montoRango/ticket).
  const rangoVigente = (lead.montoReal != null ? montoARango(lead.montoReal) : null) || lead.montoRango || ticket;

  // Score inicial (calificacion) — usa el rango del monto vigente
  const scoreInicial = calcularScore({ nivelInteres, ticket: rangoVigente, tiempo, decision: avance, experienciaInv });
  // Score de cierre (negociacion, version optimizada)
  const scoreCierre = tieneScoreCierre ? calcularScoreCierre({
    fondos: cFondos, montoConfirmadoRango: rangoVigente,
    competencia: cCompetencia, proximoPaso: cProximoPaso
  }) : null;
  // El score VISIBLE es el de cierre si existe; si no, el inicial.
  const score = tieneScoreCierre ? scoreCierre : scoreInicial;
  // "tieneCalificacion" = el lead fue realmente calificado: existe una gestion con
  // resultado "Respondio - calificado" (o avanzo mas alla). Datos sueltos arrastrados
  // en una gestion de "sin contacto" NO cuentan como calificacion.
  const fueCalificado = gestiones.some(g => ['Respondio - calificado', 'Agendo reunion', 'Confirmo reunion',
    'Reprogramo reunion', 'Reunion efectiva', 'Evaluando', 'En negociacion', 'Seguimiento post contacto'].includes(g.resultado));
  const tieneCalificacion = fueCalificado && !!(ticket || tiempo || nivelInteres || avance);
  // Para la ETAPA usamos el ultimo resultado que NO sea "sin contacto": un intento
  // fallido (no contesto/buzon) no debe hacer retroceder al lead a Por contactar.
  // El lead mantiene su avance maximo; el "sin contacto" solo cuenta como reintento.
  let ultSignificativo = ult;
  for (let i = gestiones.length - 1; i >= 0; i--) {
    if (!RESULTADOS_SIN_CONTACTO.includes(gestiones[i].resultado)) { ultSignificativo = gestiones[i]; break; }
  }
  let etapa = calcularEtapa({
    ultimoResultado: ultSignificativo ? ultSignificativo.resultado : (ult ? ult.resultado : 'Sin gestion'),
    estadoReunion, tieneCalificacion, esCartera: !!lead.esCartera
  });
  // ANTI-RETROCESO (v1.385): un lead no puede retroceder de etapa. Solo sale de su avance
  // máximo si se GANA o se PIERDE. Si la última gestión mapea a una etapa inferior a la
  // máxima alcanzada (p.ej. registran "seguimiento" estando en Negociación), se mantiene
  // en la etapa máxima. Las etapas terminales (Cerrado ganado/perdido) sí se respetan.
  if (etapa !== 'Cerrado ganado' && etapa !== 'Cerrado perdido') {
    const rankActual = RANK_ETAPA[etapa] || 0;
    const rankMax = etapaMaximaAlcanzada(gestiones, etapa);
    if (rankMax > rankActual) {
      // Buscar el nombre de etapa correspondiente al rank máximo.
      const etapaMax = Object.keys(RANK_ETAPA).find(k => RANK_ETAPA[k] === rankMax && k !== 'Cerrado perdido');
      if (etapaMax) etapa = etapaMax;
    }
  }
  const probabilidad = calcularProbabilidad({ etapa, score, intentos });
  let fechaProxAccion = ult ? ult.fechaProxAccion : null;
  const prioridad = calcularPrioridad({ etapa, probabilidad, intentos, fechaProxAccion, fechaReunion, fechaAsignacion: lead.fechaAsignacion });

  let proximaAccion = ult ? ult.proximaAccion : null;
  if (etapa === 'Cerrado perdido' || etapa === 'Cerrado ganado') {
    // Etapas terminales: el lead ya no tiene próxima acción ni fecha pendiente.
    proximaAccion = null; fechaProxAccion = null;
  } else if (!proximaAccion && etapa === 'Contactabilidad 3x5') {
    proximaAccion = 'Llamar intento 3x5';
  }

  // Último comentario para el recordatorio (tooltip): el de la última gestión; si esa
  // no tiene texto (ej. "No respondió"), cae al último comentario con contenido.
  let ultimoComentario = (ult && ult.comentario && String(ult.comentario).trim()) ? String(ult.comentario).trim() : '';
  if (!ultimoComentario) {
    for (let i = gestiones.length - 1; i >= 0; i--) {
      const c = gestiones[i].comentario;
      if (c && String(c).trim()) { ultimoComentario = String(c).trim(); break; }
    }
  }

  // Intentos de HOY (gestiones registradas hoy) y dias desde la asignacion.
  const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
  const man0 = new Date(hoy0); man0.setDate(man0.getDate() + 1);
  const intentosHoy = gestiones.filter(g => {
    const f = new Date(g.fecha);
    return f >= hoy0 && f < man0;
  }).length;
  let diasDesdeAsignacion = null;
  if (lead.fechaAsignacion) {
    const asig0 = new Date(lead.fechaAsignacion); asig0.setHours(0, 0, 0, 0);
    diasDesdeAsignacion = Math.floor((hoy0 - asig0) / 86400000) + 1; // dia 1 = dia de asignacion
  }

  return {
    ...lead,
    intentos, intentosHoy, diasDesdeAsignacion,
    score, scoreInicial, scoreCierre, tieneScoreCierre,
    etapa, probabilidad, prioridad,
    ordenSort: ORDEN_PRIORIDAD[prioridad] || 4,
    ultimoResultado: ult ? ult.resultado : 'Sin gestion',
    ultimoCanal: ult ? ult.canal : null,
    ultimaGestion: ult ? ult.fecha : null,
    ultimoComentario,
    proximaAccion, fechaProxAccion,
    ticket, tiempo, nivelInteres, experiencia: avance, avance, experienciaInv,
    cFondos, cPrioriza, cPlazo, cCompetencia, cProximoPaso,
    rangoVigente,
    estadoReunion, fechaReunion, objecion, closer, motivoPerdida,
    totalGestiones: gestiones.length,
    pipelineEstimado: (lead.montoReal != null ? lead.montoReal : montoTicket(rangoVigente)),
    fechaCierreEstimada: lead.fechaCierreEstimada || null
  };
}

// ---------- Analisis de cohortes ----------
// Agrupa leads por mes de ASIGNACION y mide cuantos ALCANZARON cada etapa del
// embudo a lo largo del tiempo (no importa cuando se gestiono). La "etapa
// maxima alcanzada" se calcula sobre todas las gestiones del lead, porque un
// lead pudo llegar a reunion y luego caerse.
const ORDEN_EMBUDO = [
  'Contactado - por calificar',
  'Calificado - pendiente agendar',
  'Agendado - pendiente reunion',
  'Reunion efectiva - seguimiento',
  'Cierre pendiente',
  'Cerrado ganado'
];
const RANK_ETAPA = {
  'Contactabilidad 3x5': 0,
  'Contactado - por calificar': 1,
  'Calificado - pendiente agendar': 2,
  'Agendado - pendiente reunion': 3,
  'Reunion efectiva - seguimiento': 4,
  'Cierre pendiente': 5,
  'Cerrado ganado': 6,
  'Cerrado perdido': 0
};

// Etapa maxima alcanzada por un lead segun su historial de gestiones.
function etapaMaximaAlcanzada(gestiones, etapaActual) {
  let maxRank = RANK_ETAPA[etapaActual] || 0;
  const califCompleta = (gestiones || []).some(g => calificacionCompleta(g));
  gestiones.forEach(g => {
    let e = etapaDeGestion(g.resultado);
    // "Calificado" (rank 2) solo es válido si además tiene las 5 preguntas; si no, tope Contactado (1).
    let r = RANK_ETAPA[e] || 0;
    if (r === 2 && !califCompleta) r = 1;
    if (r > maxRank) maxRank = r;
  });
  // Refuerzo: si completó las 5 en algún momento, al menos rank 2.
  if (califCompleta && maxRank < 2) maxRank = 2;
  // Sin calificación completa, no puede superar Contactado por la vía de "calificado".
  if (!califCompleta && maxRank === 2) maxRank = 1;
  return maxRank;
}
// ¿El lead tiene calificación COMPLETA (5 preguntas) en alguna de sus gestiones?
function tieneCalificacionCompleta(gestiones) {
  return (gestiones || []).some(g => calificacionCompleta(g));
}

// leadsConGestiones: [{ lead, gestiones, consolidado }]
function analizarCohortes(registros) {
  const cohortes = {};
  registros.forEach(({ lead, gestiones, consolidado }) => {
    if (!lead.fechaAsignacion) return; // sin asignar no entra a cohorte
    const d = new Date(lead.fechaAsignacion);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!cohortes[key]) cohortes[key] = { mes: key, total: 0, alcanzo: {}, ganados: 0, perdidos: 0, sumaDiasCierre: 0, nCerrados: 0 };
    const c = cohortes[key];
    c.total++;
    const maxRank = etapaMaximaAlcanzada(gestiones, consolidado.etapa);
    // Contar para cada etapa del embudo si la alcanzo (rank >= rank de esa etapa)
    ORDEN_EMBUDO.forEach(et => {
      if (maxRank >= RANK_ETAPA[et]) c.alcanzo[et] = (c.alcanzo[et] || 0) + 1;
    });
    if (consolidado.etapa === 'Cerrado ganado') {
      c.ganados++;
      if (lead.fechaAsignacion && gestiones.length) {
        const ult = gestiones[gestiones.length - 1];
        c.sumaDiasCierre += Math.max(0, (new Date(ult.fecha) - new Date(lead.fechaAsignacion)) / 86400000);
        c.nCerrados++;
      }
    }
    if (consolidado.etapa === 'Cerrado perdido') c.perdidos++;
  });

  return Object.values(cohortes)
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map(c => ({
      mes: c.mes,
      total: c.total,
      embudo: ORDEN_EMBUDO.map(et => ({
        etapa: et,
        cantidad: c.alcanzo[et] || 0,
        pct: c.total ? Math.round((c.alcanzo[et] || 0) / c.total * 100) : 0
      })),
      ganados: c.ganados,
      perdidos: c.perdidos,
      tasaGanados: c.total ? Math.round(c.ganados / c.total * 100) : 0,
      diasPromedioCierre: c.nCerrados ? Math.round(c.sumaDiasCierre / c.nCerrados) : null
    }));
}

// ---------- Trazabilidad ----------
function etapaDeGestion(resultado) {
  if (resultado === 'Venta ganada') return 'Cerrado ganado';
  if (['Respondio - no interesado', 'Respondio - no califica', 'Desistio', 'Numero invalido', 'Numero equivocado', 'Pidio no contactar'].includes(resultado)) return 'Cerrado perdido';
  if (resultado === 'Cierre pendiente' || resultado === 'En negociacion') return 'Cierre pendiente';
  if (resultado === 'Reunion efectiva' || resultado === 'Confirmo reunion' || resultado === 'Seguimiento post reunion' || resultado === 'Evaluando') return 'Reunion efectiva - seguimiento';
  if (['Agendo reunion', 'Reprogramo reunion', 'No asistio a reunion'].includes(resultado)) return 'Agendado - pendiente reunion';
  if (['Respondio - calificado'].includes(resultado)) return 'Calificado - pendiente agendar';
  if (['Respondio - no pudo hablar', 'Respondio - sin calificar', 'Respondio - interesado',
       'Respondio - pidio informacion'].includes(resultado)) return 'Contactado - por calificar';
  return 'Contactabilidad 3x5';
}

function formatoDuracion(ms) {
  if (ms < 0) ms = 0;
  const min = Math.round(ms / 60000);
  const dias = Math.floor(min / 1440);
  const horas = Math.floor((min % 1440) / 60);
  const mins = min % 60;
  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return `${horas}h ${mins}min`;
  return `${mins}min`;
}

function trazabilidad(lead, gestiones) {
  const lineas = gestiones.map((g, i) => ({
    n: i + 1, fecha: g.fecha, etapa: etapaDeGestion(g.resultado)
  }));
  const intentos = gestiones.filter(g => grupoLimpio(g.resultado) === 'No_respondio').length;
  const gruposResp = ['Respondio_sin_agendar', 'Agendo_reunion', 'Reunion_efectiva', 'Cierre', 'Ganado'];
  const primeraResp = gestiones.find(g => gruposResp.includes(grupoLimpio(g.resultado)));
  let tiempoContacto = 'aun sin contacto efectivo';
  if (lead.fechaAsignacion && primeraResp) {
    tiempoContacto = formatoDuracion(new Date(primeraResp.fecha) - new Date(lead.fechaAsignacion));
  } else if (!lead.fechaAsignacion) {
    tiempoContacto = 'sin fecha de asignacion';
  }
  return {
    lead: lead.nombre, codigo: lead.codigo, lineas,
    intentos3x5: `${intentos}/15`,
    totalGestiones: gestiones.length,
    tiempoAsignadoContactado: tiempoContacto
  };
}

// Devuelve los grupos de resultados permitidos para una etapa.
// Si la etapa no esta en el mapa (ej. cerrados), devuelve lista plana completa.
function obtenerResultadosPermitidos(etapa) {
  return RESULTADOS_POR_ETAPA[etapa] || [['Resultados', RESULTADOS]];
}

module.exports = {
  ASESORES, CANALES, FUENTES, RESULTADOS, RESULTADOS_POR_ETAPA, RESULTADOS_SIN_CONTACTO, PROXIMAS_ACCIONES, ACCIONES_POR_RESULTADO,
  NIVEL_INTERES, TICKET_RANGO, TIEMPO, EXPERIENCIA, AVANCE,
  EXPERIENCIA_INV, C_FONDOS, C_PRIORIZA, C_PLAZO, C_COMPETENCIA, C_PROXIMO_PASO,
  calcularScoreCierre,
  TIPO_REUNION, ESTADO_REUNION, OBJECIONES, MOTIVOS_PERDIDA,
  grupoLimpio, calcularScore, calcularEtapa, calcularProbabilidad,
  calcularPrioridad, validarGestion, autocalcularFechaProxAccion,
  obtenerResultadosPermitidos,
  obtenerAccionesPermitidas,
  KANBAN_COLUMNAS, KANBAN_RESULTADO_DESTINO, columnaDeEtapa, transicionKanbanValida,
  analizarCohortes, etapaMaximaAlcanzada, calificacionCompleta, calificacionFaltantes, tieneCalificacionCompleta,
  montoTicket, consolidarLead, trazabilidad, formatoDuracion, etapaDeGestion
};

// =============================================================
// IMPORTACION MASIVA (v1.1)
// =============================================================

// Normaliza celular peruano: quita espacios, guiones y prefijo +51/51.
function normalizarCelular(v) {
  if (!v) return '';
  let c = String(v).replace(/[\s\-().]/g, '');
  if (c.startsWith('+51')) c = c.slice(3);
  else if (c.startsWith('51') && c.length === 11) c = c.slice(2);
  return c;
}

// Convierte un monto numerico a la etiqueta de rango del score.
// Devuelve null si es invalido o menor a 10,000.
function montoARango(v) {
  const n = Number(String(v).replace(/[^\d.]/g, ''));
  if (!isFinite(n) || n < 10000) return null;
  if (n >= 200000) return 'S/ 200,000 a mas';
  if (n >= 100000) return 'S/ 100,000 - 199,999';
  if (n >= 50000) return 'S/ 50,000 - 99,999';
  return 'S/ 10,000 - 49,999';
}

// =============================================================
// FASE 2: NORMALIZACION DE LEADS DE MARKETING
// =============================================================
// Traduce el payload de cualquier fuente (landing / meta / tiktok) a una
// estructura estandar comun. Cada fuente nombra sus campos distinto; esta
// funcion mapea esos nombres a las columnas del CRM.
//
// Quita tildes/diacriticos de un texto (para comparaciones tolerantes).
function _quitarTildes(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Normaliza una clave de campo: sin tildes, minusculas, sin espacios/_/-/.
// Asi "Telefono", "Teléfono", "telefono_celular", "Monto disponible" colapsan.
function _normClave(s) {
  return _quitarTildes(String(s)).toLowerCase().replace(/[\s_\-.]+/g, '');
}

// pick(obj, claves...) devuelve el primer valor no vacio entre varias claves
// posibles. Compara claves de forma TOLERANTE (ignora mayusculas, tildes,
// espacios, guiones y guiones bajos), asi un mismo campo entra venga como
// "Teléfono", "telefono" o "phone_number" sin necesidad de mapear en Make.
function _pick(obj, ...claves) {
  if (!obj) return null;
  const idx = {};
  for (const k of Object.keys(obj)) {
    const nk = _normClave(k);
    if (!(nk in idx)) {
      const v = obj[k];
      if (v != null && String(v).trim() !== '') idx[nk] = String(v).trim();
    }
  }
  for (const c of claves) {
    const nc = _normClave(c);
    if (nc in idx) return idx[nc];
  }
  return null;
}

// Traduce el monto a un numero. Soporta:
//  - etiquetas de rango del landing ("De S/20,000 a S/ 50,000." -> 20000,
//    "Más de S/100,000." -> 100000) usando el LIMITE INFERIOR del bucket;
//  - numeros sueltos ("50000", "S/ 50,000" -> 50000).
// Devuelve null para "Seleccionar...", vacio o sin digitos.
function montoEtiquetaANumero(txt) {
  if (txt == null) return null;
  const t = _quitarTildes(String(txt)).toLowerCase().trim();
  if (!t || t.startsWith('seleccionar')) return null;
  const nums = (t.match(/\d[\d,]*\d|\d/g) || [])
    .map(s => parseInt(s.replace(/,/g, ''), 10))
    .filter(n => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  return Math.min(...nums); // limite inferior del rango
}

// Normaliza un nombre completo (Nombre + Apellido) para el match secundario:
// sin tildes, minusculas, solo letras/numeros, palabras ordenadas alfabetica-
// mente (asi "Morales Chumbes Javier" == "Javier Morales Chumbes").
function normalizarNombre(v) {
  if (!v) return '';
  const limpio = _quitarTildes(String(v)).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!limpio) return '';
  return limpio.split(' ').sort().join(' ');
}

function normalizarLeadMarketing(origen, payload) {
  const p = payload || {};
  const o = String(origen || '').toLowerCase();

  // UTMs (se calculan primero: sirven de respaldo para fuente/campana)
  const utmSource = _pick(p, 'utm_source', 'utmSource');
  const utmMedium = _pick(p, 'utm_medium', 'utmMedium');
  const utmCampaign = _pick(p, 'utm_campaign', 'utmCampaign');
  const utmTerm = _pick(p, 'utm_term', 'utmTerm');
  const utmContent = _pick(p, 'utm_content', 'utmContent');

  // Campos comunes con tolerancia a distintos nombres por fuente.
  // Landing usa nombres en espanol; Meta/TikTok suelen venir en ingles.
  // El nombre operativo es Nombre + Apellido concatenados.
  const nombrePila = _pick(p, 'nombre', 'name', 'full_name', 'fullname', 'nombre_completo', 'first_name', 'firstname');
  const apellido = _pick(p, 'apellido', 'apellidos', 'last_name', 'lastname', 'surname');
  const nombre = [nombrePila, apellido].filter(Boolean).join(' ') || null;

  const telefonoRaw = _pick(p, 'telefono', 'phone', 'phone_number', 'celular', 'mobile', 'telefono_celular');
  const email = _pick(p, 'email', 'correo', 'mail', 'e-mail');

  // Campos nuevos del formulario B2C (Meta): DNI + 2 preguntas iniciales de calificación.
  // Solo aplican a B2C; el B2B usa su propia normalización (normalizarB2B).
  const dni = _pick(p, 'dni', 'DNI', 'documento', 'nro_documento', 'numero_documento');
  const interesInvertir = _pick(p, 'interes_al_Invertir', 'interes_al_invertir', 'interesInvertir', 'interes', 'que_te_interesa');
  const listo7dias = _pick(p, 'invertir_en_7dias', 'invertir_en_7_dias', 'listo7dias', 'listo_7_dias', 'invertir7dias');

  // monto: se guarda el TEXTO original (trazabilidad en Leads Brutos) y se
  // deriva un numero (etiqueta de rango -> limite inferior, o numero suelto).
  const monto = _pick(p, 'monto', 'amount', 'monto_inversion', 'inversion', 'presupuesto', 'monto disponible', 'monto_disponible');
  const montoNumerico = montoEtiquetaANumero(monto);

  // fuente/campana: explicitas si vienen; si no, se respaldan con UTMs.
  const fuente = _pick(p, 'fuente', 'source', 'lead_source') || utmSource || (o === 'landing' ? 'Landing Page' : o === 'meta' ? 'Meta Lead Ads' : o === 'tiktok' ? 'TikTok Lead' : origen);
  const campana = _pick(p, 'campana', 'campaign', 'campaign_name', 'campana_nombre') || utmCampaign;
  const formulario = _pick(p, 'formulario', 'form', 'form_name', 'form_id', 'instant_form');

  // Identificadores de campana/anuncio (para reporteria)
  const campaignId = _pick(p, 'campaign_id', 'campaignId', 'campaignID');
  const adsetId = _pick(p, 'adset_id', 'adsetId', 'adgroup_id', 'ad_group_id');
  const adId = _pick(p, 'ad_id', 'adId', 'creative_id');
  const leadIdExterno = _pick(p, 'leadgen_id', 'lead_id', 'leadId', 'id');
  // Atribución por UTM (así llegan los leads de TasaTop):
  //   utm_campaign = campaña · utm_term = conjunto de anuncios · utm_content = anuncio
  // Se respaldan con los nombres de Meta/Make si vinieran.
  let conjunto = _pick(p, 'utm_term', 'utmTerm', 'adset_name', 'adsetName', 'conjunto', 'conjunto_anuncios', 'adset', 'ad_group_name');
  const anuncio = _pick(p, 'utm_content', 'utmContent', 'ad_name', 'adName', 'anuncio', 'ad', 'creative_name');
  // Recuperación: en algunos leads el conjunto (utm_term) llegó por error a utm_source.
  // Si utm_source tiene pinta de nomenclatura de anuncios (empieza con b2c_/b2b_), se usa como conjunto.
  if (!conjunto && utmSource && /^b2[bc]_/i.test(String(utmSource).trim())) conjunto = utmSource;

  const telefonoNormalizado = telefonoRaw ? normalizarCelular(telefonoRaw) : null;

  return {
    origen: o,
    nombre, telefonoRecibido: telefonoRaw, telefonoNormalizado, email,
    dni, interesInvertir, listo7dias,
    fuente, campana, conjunto, anuncio, formulario,
    campaignId, adsetId, adId, leadIdExterno,
    utmSource, utmMedium, utmCampaign, utmTerm, utmContent,
    monto, montoNumerico,
    rawJson: JSON.stringify(p)
  };
}

// Valida una fila del import. Devuelve { ok, errores[], datos }
function validarFilaImport(fila) {
  const errores = [];
  const nombre = String(fila.nombre || '').trim();
  const celular = normalizarCelular(fila.celular);
  const email = String(fila.email || '').trim();
  const fuente = String(fila.fuente || '').trim();

  if (!nombre) errores.push('Sin nombre');
  if (!celular) errores.push('Sin celular');
  else if (!/^9\d{8}$/.test(celular)) errores.push('Celular invalido (9 digitos iniciando en 9)');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores.push('Email malformado');

  let montoReal = null, montoRango = null;
  if (fila.montoPotencial !== undefined && String(fila.montoPotencial).trim() !== '') {
    montoReal = Number(String(fila.montoPotencial).replace(/[^\d.]/g, ''));
    montoRango = montoARango(fila.montoPotencial);
    if (!montoRango || !isFinite(montoReal)) { errores.push('Monto invalido (numero >= 10,000)'); montoReal = null; }
  }

  return {
    ok: errores.length === 0,
    errores,
    datos: { nombre, celular, email: email || null, fuente: fuente || null, montoReal, montoRango }
  };
}

module.exports.normalizarCelular = normalizarCelular;
module.exports.normalizarNombre = normalizarNombre;
module.exports.montoARango = montoARango;
module.exports.montoEtiquetaANumero = montoEtiquetaANumero;
module.exports.normalizarLeadMarketing = normalizarLeadMarketing;
module.exports.validarFilaImport = validarFilaImport;
module.exports.esDiaHabil = esDiaHabil;
module.exports.contarDiasHabiles = contarDiasHabiles;
module.exports.diasHabilesMes = diasHabilesMes;
module.exports.diasHabilesTranscurridos = diasHabilesTranscurridos;
module.exports.priorityScoreB2C = priorityScoreB2C;
module.exports.PScoreDefaultB2C = PScoreDefaultB2C;
