let CAT = null, gCodigo = null, gLead = null, YO = null, impPreview = null, asignarCodigos = [], gYaCalificado = false;
const veTodoJS = () => YO && (YO.rol === 'admin' || YO.rol === 'jefa');
const puedeAsignarJS = () => YO && (YO.rol === 'admin' || YO.rol === 'jefa');
const $ = id => document.getElementById(id);

const ETAPA_COLOR = {
  'Contactabilidad 3x5':            ['#F4CCCC','#7B0000'],
  'Contactado - por calificar':     ['#FFF2CC','#7B4C00'],
  'Calificado - pendiente agendar': ['#FFE599','#7B4C00'],
  'Agendado - pendiente reunion':   ['#D9EAD3','#1A4D1A'],
  'Reunion efectiva - seguimiento': ['#CFE2F3','#1A3A5C'],
  'Cierre pendiente':               ['#D9D2E9','#351C75'],
  'Cerrado ganado':                 ['#B6D7A8','#1A4D1A'],
  'Cerrado perdido':                ['#EFEFEF','#666666']
};
const PRIO_CLASE = { 'Muy alta': 'p-Muyalta', 'Alta': 'p-Alta', 'Media': 'p-Media', 'Baja': 'p-Baja' };

// Diccionario de etiquetas visibles (con tildes). El valor interno se mantiene
// sin tildes por estabilidad; aqui solo se traduce lo que ve el usuario.
const ES = {
  // Etapas
  'Contactabilidad 3x5': 'Contactabilidad 3x5',
  'Contactado - por calificar': 'Contactado · por calificar',
  'Calificado - pendiente agendar': 'Calificado · pendiente agendar',
  'Agendado - pendiente reunion': 'Agendado · pendiente reunión',
  'Reunion efectiva - seguimiento': 'Reunión efectiva · seguimiento',
  'Cierre pendiente': 'Cierre pendiente',
  'Cerrado ganado': 'Cerrado ganado',
  'Cerrado perdido': 'Cerrado perdido',
  // Resultados
  'No contesto': 'No contestó', 'Buzon / apagado': 'Buzón / apagado',
  'WhatsApp enviado sin respuesta': 'WhatsApp sin respuesta',
  'Respondio - no pudo hablar': 'Respondió · no pudo hablar',
  'Respondio - sin calificar': 'Respondió · sin calificar',
  'Respondio - calificado': 'Respondió · calificado',
  'Respondio - pidio informacion': 'Respondió · pidió información',
  'Respondio - interesado': 'Respondió · interesado',
  'Respondio - no interesado': 'Respondió · no interesado',
  'Respondio - no califica': 'Respondió · no califica',
  'Seguimiento post contacto': 'Seguimiento post contacto',
  'Agendo reunion': 'Agendó reunión', 'Confirmo reunion': 'Confirmó reunión',
  'No asistio a reunion': 'No asistió a reunión', 'Reprogramo reunion': 'Reprogramó reunión',
  'Reunion efectiva': 'Reunión efectiva', 'Seguimiento post reunion': 'Seguimiento post reunión',
  'Cierre pendiente': 'Cierre pendiente', 'Venta ganada': 'Venta ganada',
  'Numero invalido': 'Número inválido', 'Numero equivocado': 'Número equivocado',
  'Pidio no contactar': 'Pidió no contactar', 'Sin gestion': 'Sin gestión',
  // Proximas acciones
  'Llamar intento 3x5': 'Llamar intento 3x5', 'Enviar WhatsApp de apoyo': 'Enviar WhatsApp de apoyo',
  'Calificar lead': 'Calificar lead', 'Agendar reunion': 'Agendar reunión',
  'Llamar para calificar': 'Llamar para calificar', 'WhatsApp para calificar': 'WhatsApp para calificar',
  'Seguimiento post reunion (llamada)': 'Seguimiento post reunión (llamada)',
  'Seguimiento post reunion (whatsapp)': 'Seguimiento post reunión (WhatsApp)',
  'Evaluando': 'Evaluando', 'En negociacion': 'En negociación', 'Desistio': 'Desistió',
  'Menor a 1 ano': 'Menor a 1 año', 'Mayor a 1 ano': 'Mayor a 1 año',
  'Cerrar venta (llamada)': 'Cerrar venta (llamada)', 'Cerrar venta (whatsapp)': 'Cerrar venta (WhatsApp)',
  'Agendar reunion (llamar)': 'Agendar reunión (llamar)', 'Agendar reunion (whatsapp)': 'Agendar reunión (WhatsApp)',
  'Confirmar reunion (llamar)': 'Confirmar reunión (llamar)', 'Confirmar reunion (whatsapp)': 'Confirmar reunión (WhatsApp)',
  'Confirmar asistencia': 'Confirmar asistencia', 'Reprogramar reunion': 'Reprogramar reunión',
  'Seguimiento post reunion': 'Seguimiento post reunión', 'Enviar informacion': 'Enviar información',
  'Enviar propuesta': 'Enviar propuesta', 'Cerrar venta': 'Cerrar venta', 'Desestimar': 'Desestimar',
  // Canales / otros
  'Correo': 'Correo', 'Email': 'Correo',
  'Basica': 'Básica', 'Numero': 'Número',
  // Niveles de interes (nuevos)
  'Muy interesado': 'Muy interesado', 'Interesado': 'Interesado',
  'Solo averigua': 'Solo averigua', 'Poco interes': 'Poco interés',
  // Avance / ¿Puede avanzar? (reemplaza experiencia)
  'Decide solo': 'Decide solo', 'Decide acompanado': 'Decide acompañado',
  'Debe consultar': 'Debe consultar', 'No avanza': 'No avanza',
  // Tiempo (etiquetas amigables)
  '0 a 7 dias': 'Esta semana', '8 a 15 dias': '8-15 días',
  '16 a 30 dias': '16-30 días', '> 30 dias': '+30 días'
};
// "Cierre pendiente" se MUESTRA como "Negociación" (el dato interno no cambia).
const ETAPA_VISIBLE = {
  'Cierre pendiente': 'Negociación',
  'Contactabilidad 3x5': 'Por contactar',
  'Contactado - por calificar': 'Contactado',
  'Calificado - pendiente agendar': 'Calificado',
  'Agendado - pendiente reunion': 'Agendado',
  'Reunion efectiva - seguimiento': 'Reunión efectiva'
};
function trEtapa(v) { return ETAPA_VISIBLE[v] || tr(v); }
function tr(v) { return ES[v] || v || ''; }

async function api(url, opts) {
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Error de servidor');
  return data;
}

function llenarSelect(id, valores, conVacio, placeholder) {
  const s = $(id); s.innerHTML = '';
  if (placeholder) {
    const o = new Option(placeholder, ''); o.disabled = true; o.selected = true; s.add(o);
  } else if (conVacio) s.add(new Option('—', ''));
  (valores || []).forEach(v => s.add(new Option(tr(v), v)));
}

function fmtFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
// Fecha+hora compacta para tarjetas: "16/06 9am" / "16/06 1pm"
function fmtFechaHoraCorta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  let h = d.getHours(); const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12; if (h === 0) h = 12;
  const hora = m === 0 ? `${h}${ampm}` : `${h}:${p(m)}${ampm}`;
  return `${p(d.getDate())}/${p(d.getMonth()+1)} ${hora}`;
}
// Acciones abreviadas para que quepan en una linea en la tarjeta
const ACCION_CORTA = {
  'Llamar intento 3x5': 'Llamar',
  'Llamar para calificar': 'Llamar p/calificar',
  'WhatsApp para calificar': 'WhatsApp p/calificar',
  'Agendar reunion': 'Agendar',
  'Agendar reunion (llamar)': 'Agendar (llamar)',
  'Agendar reunion (whatsapp)': 'Agendar (WhatsApp)',
  'Confirmar reunion (llamar)': 'Confirmar (llamar)',
  'Confirmar reunion (whatsapp)': 'Confirmar (WhatsApp)',
  'Confirmar asistencia': 'Confirmar',
  'Cerrar venta (llamada)': 'Cerrar venta (llamada)',
  'Cerrar venta (whatsapp)': 'Cerrar venta (WhatsApp)',
  'Enviar informacion': 'Enviar info',
  'Seguimiento post reunion': 'Seguimiento',
  'Reprogramar reunion': 'Reprogramar',
  'Desestimar': 'Desestimar'
};
function accionCorta(a, etapa) {
  if (!a) return '';
  // "Llamar intento 3x5" solo se nombra asi en la fase de contactabilidad;
  // en cualquier etapa posterior es simplemente "Llamar".
  if (a === 'Llamar intento 3x5' && etapa && etapa !== 'Contactabilidad 3x5') return 'Llamar';
  return ACCION_CORTA[a] || tr(a);
}
// Para la tabla: nombre completo, pero "Llamar intento 3x5" -> "Llamar" fuera de la fase 3x5.
function accionTabla(a, etapa) {
  if (!a) return '';
  if (a === 'Llamar intento 3x5' && etapa && etapa !== 'Contactabilidad 3x5') return 'Llamar';
  return tr(a);
}

// ---------- Sesion ----------
async function login() {
  $('lError').classList.remove('act');
  try {
    YO = await api('/api/login', { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ usuario: $('lUsuario').value, clave: $('lClave').value }) });
    cerrar('ovLogin');
    await arrancar();
  } catch (e) {
    $('lError').textContent = e.message; $('lError').classList.add('act');
  }
}
async function logout() {
  await api('/api/logout', { method: 'POST' });
  location.reload();
}
async function abrirClave() {
  $('cNueva').value = ''; $('cError').classList.remove('act');
  const sel = $('cUsuario'); sel.innerHTML = '';
  try {
    const usuarios = await api('/api/usuarios');
    const etiqueta = { admin: 'Admin', jefa: 'Jefa', gestora: 'GP' };
    usuarios.forEach(u => sel.add(new Option(`${u.nombre} (${etiqueta[u.rol] || u.rol})`, u.usuario)));
  } catch (e) {}
  $('ovClave').classList.add('act');
}
async function cambiarClave() {
  $('cError').classList.remove('act');
  try {
    await api('/api/cambiar-clave', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ usuarioObjetivo: $('cUsuario').value, claveNueva: $('cNueva').value }) });
    cerrar('ovClave'); alert('Contrasena actualizada.');
  } catch (e) { $('cError').textContent = e.message; $('cError').classList.add('act'); }
}

// ---------- Inicio ----------
async function init() {
  try { YO = await api('/api/me'); cerrar('ovLogin'); await arrancar(); }
  catch (e) { /* sin sesion: queda el login visible */ }
}
async function arrancar() {
  $('rolBox').style.display = 'flex';
  const etiquetaRol = { admin: 'Administrador', jefa: 'Jefa de Ventas', gestora: 'GP' };
  $('rolNombre').textContent = YO.nombre;
  $('rolTipo').textContent = etiquetaRol[YO.rol] || YO.rol;
  // Admin ve todo (incluye los elementos .soloAdmin y .asignador).
  if (YO.rol === 'admin') {
    document.querySelectorAll('.soloAdmin, .asignador').forEach(e => e.classList.remove('oculto'));
  }
  // Jefa de Ventas: ve y asigna toda la cartera, pero no carga/archiva/auditoria.
  if (YO.rol === 'jefa') {
    document.querySelectorAll('.asignador').forEach(e => e.classList.remove('oculto'));
  }
  // Leads Brutos: visible para admin y jefa.
  if (YO.rol === 'admin' || YO.rol === 'jefa') {
    document.querySelectorAll('.soloAdminJefa').forEach(e => e.classList.remove('oculto'));
  }
  // Columnas de control de la tabla: visibles solo para admin/jefa
  if (YO.rol === 'admin' || YO.rol === 'jefa') document.body.classList.add('ve-todo');
  CAT = await api('/api/catalogos');
  const sel = $('selAsesor');
  sel.innerHTML = '';
  sel.add(new Option('Todas las GP', ''));
  CAT.asesores.forEach(a => sel.add(new Option(a, a)));
  llenarSelect('gCanal', CAT.canales);
  llenarSelect('gTiempo', CAT.tiempo, true);
  llenarSelect('gInteres', CAT.nivelInteres, true);
  llenarSelect('gExperiencia', CAT.avance || CAT.experiencia, true);
  llenarSelect('gExperienciaInv', CAT.experienciaInv, true);
  llenarSelect('cFondos', CAT.cFondos, false, 'Seleccionar…');
  llenarSelect('cPrioriza', CAT.cPrioriza, false, 'Seleccionar…');
  llenarSelect('cPlazo', CAT.cPlazo, false, 'Seleccionar…');
  llenarSelect('cCompetencia', CAT.cCompetencia, false, 'Seleccionar…');
  llenarSelect('cProximoPaso', CAT.cProximoPaso, false, 'Seleccionar…');
  llenarSelect('nFuente', CAT.fuentes, true);
  llenarSelect('nAsesor', CAT.asesores, true);
  llenarSelect('aAsesor', CAT.asesores);
  // Contador del resumen de conversacion
  if ($('gResumen')) $('gResumen').addEventListener('input', () => {
    $('gResumenCount').textContent = $('gResumen').value.length;
  });
  cargarLeads();
}

function ir(v) {
  document.querySelectorAll('.vista').forEach(x => x.classList.remove('act'));
  document.querySelectorAll('nav button').forEach(x => x.classList.remove('act'));
  $('v-' + v).classList.add('act');
  $('nv-' + v).classList.add('act');
  if (v === 'dash') cargarDashboard();
  if (v === 'audit') cargarAuditoria();
  if (v === 'cohortes') cargarCohortes();
  if (v === 'brutos') cargarBrutos();
  if (v === 'leads') cargarLeads();
}

function cerrar(id) { $(id).classList.remove('act'); }

// ---------- Mis Leads ----------
let LEADS = [], ordenCampo = '', ordenDir = 1;

async function cargarLeads() {
  let q = [];
  if (veTodoJS()) {
    const filtro = $('selFiltro').value;
    if (filtro) q.push('filtro=' + filtro);
    else if ($('selAsesor').value) q.push('asesor=' + encodeURIComponent($('selAsesor').value));
  }
  const desde = $('fDesde').value, hasta = $('fHasta').value;
  if (desde) q.push('desde=' + desde);
  if (hasta) q.push('hasta=' + hasta);
  // Traemos TODOS (incluye cerrados) para el Kanban; cada vista filtra lo que muestra.
  q.push('activos=0');
  LEADS = await api('/api/leads' + (q.length ? '?' + q.join('&') : ''));
  const fe = $('fEtapa'); const sel = fe.value;
  const etapas = [...new Set(LEADS.map(l => l.etapa))];
  fe.innerHTML = '<option value="">Toda etapa</option>' + etapas.map(e => '<option>' + e + '</option>').join('');
  fe.value = sel;
  render();
  cargarTarjetas();
}

async function cargarTarjetas() {
  let q = [];
  const desde = $('fDesde').value, hasta = $('fHasta').value;
  if (desde) q.push('desde=' + desde);
  if (hasta) q.push('hasta=' + hasta);
  try {
    const cards = await api('/api/highlights' + (q.length ? '?' + q.join('&') : ''));
    $('tarjetas').innerHTML = cards.map(c =>
      '<div class="tarjeta ' + c.tono + '">' +
        '<span class="hl-ico">' + (ICO_HL[c.ico] || '') + '</span>' +
        '<div class="hl-txt"><div class="hl-et">' + c.etiqueta + '</div>' +
        '<div class="hl-v">' + c.valor + '</div>' +
        (c.sub ? '<div class="hl-sub">' + c.sub + '</div>' : '') + '</div>' +
      '</div>'
    ).join('');
  } catch (e) {}
}
const ICO_HL = {
  reloj: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 11h-5V7h2v4h3v2z"/></svg>',
  cal: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>',
  user: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z"/></svg>',
  trofeo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18 2H6v2H2v4a4 4 0 004 4 6 6 0 005 5.9V20H8v2h8v-2h-3v-2.1A6 6 0 0018 12a4 4 0 004-4V4h-4V2zM4 8V6h2v4a2 2 0 01-2-2zm16 0a2 2 0 01-2 2V6h2v2z"/></svg>',
  grafico: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 17l6-6 4 4 8-8v4h2V3h-7v2h4l-7 7-4-4-7 7z"/></svg>'
};

function limpiarFechas() {
  $('fDesde').value = ''; $('fHasta').value = '';
  cargarLeads();
}

function leadsVisibles(incluirCerrados) {
  let arr = LEADS.slice();
  // La tabla oculta cerrados por defecto; el Kanban los incluye (columna Cerrado).
  if (!incluirCerrados) {
    const fe0 = $('fEtapa').value;
    if (!fe0) arr = arr.filter(l => l.etapa !== 'Cerrado ganado' && l.etapa !== 'Cerrado perdido');
  }
  const fp = $('fPrioridad').value, fe = $('fEtapa').value;
  if (fp) arr = arr.filter(l => l.prioridad === fp);
  if (fe) arr = arr.filter(l => l.etapa === fe);
  if (ordenCampo) {
    arr.sort((a, b) => {
      let va = a[ordenCampo], vb = b[ordenCampo];
      if (ordenCampo === 'prioridad') { va = a.ordenSort; vb = b.ordenSort; }
      return (va > vb ? 1 : va < vb ? -1 : 0) * ordenDir;
    });
  }
  return arr;
}

function ordenarPor(campo) {
  if (ordenCampo === campo) ordenDir *= -1; else { ordenCampo = campo; ordenDir = 1; }
  ['prioridad','probabilidad'].forEach(c => {
    if ($('ord-' + c)) $('ord-' + c).textContent = ordenCampo === c ? (ordenDir === 1 ? '▲' : '▼') : '';
  });
  render();
}

function fmtSoles(n) {
  if (n === null || n === undefined || n === '') return '';
  return 'S/ ' + Number(n).toLocaleString('es-PE');
}

let VISTA_LEADS = 'tabla';
let modoPerdido = false;
let cierreEnEdicion = false; // true cuando el usuario pulsa "Editar" el cierre en Negociacion
let modoCalifForzado = null;
let PAG_SIZE = 25, PAG_ACTUAL = 1;
function cambiarPagina(d) { PAG_ACTUAL += d; render(); }
function cambiarPagSize() { PAG_SIZE = parseInt($('pagSize').value); PAG_ACTUAL = 1; render(); }
function setVista(v) {
  VISTA_LEADS = v;
  $('tg-tabla').classList.toggle('act', v === 'tabla');
  $('tg-kanban').classList.toggle('act', v === 'kanban');
  $('contTabla').style.display = v === 'tabla' ? 'block' : 'none';
  $('contKanban').style.display = v === 'kanban' ? 'block' : 'none';
  render();
}

function renderKanban() {
  const lista = leadsVisibles(false).filter(l => l.etapa !== 'Cerrado ganado' && l.etapa !== 'Cerrado perdido');
  const cols = CAT.kanbanColumnas;
  const cont = $('contKanban');
  const porCol = {};
  cols.forEach(c => porCol[c.id] = []);
  lista.forEach(l => {
    const cid = cols.find(c => c.etapas.includes(l.etapa));
    if (cid) porCol[cid.id].push(l);
  });
  const fmtM = n => 'S/ ' + Number(n || 0).toLocaleString('es-PE');

  cont.innerHTML = '<div class="kanban">' + cols.map((c, idx) => {
    const items = porCol[c.id] || [];
    let total = 0, ponderado = 0, sumaProb = 0;
    items.forEach(l => {
      total += (l.montoReal || 0);
      ponderado += (l.montoReal || 0) * (l.probabilidad || 0) / 100;
      sumaProb += (l.probabilidad || 0);
    });
    const prom = items.length ? Math.round(sumaProb / items.length) : 0;
    const tarjetas = items.map(l => kanbanCard(l)).join('');
    return '<div class="kcol">' +
      '<div class="kcol-head"><span class="ktit">' + trEtapa2(c) + '</span><span class="kcnt">· ' + items.length + '</span></div>' +
      '<div class="kcol-metricas">' +
        '<div class="km"><span class="km-v">' + fmtM(total) + '</span></div>' +
      '</div>' +
      '<div class="kcol-body" data-col="' + c.id + '" ondragover="kDragOver(event)" ondragleave="kDragLeave(event)" ondrop="kDrop(event)">' +
        (tarjetas || '<div class="kvacio"><div class="kvacio-ic">⊟</div>Sin leads<small>Arrastra los leads<br>a esta etapa</small></div>') +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

// Nombre visible de columna (Negociacion en vez de Cierre pendiente, etc.)
function trEtapa2(col) {
  const map = { 'Negociacion': 'Negociación', 'Reunion efectiva': 'Reunión efectiva', 'Por contactar': 'Por contactar' };
  return (map[col.titulo] || col.titulo).toUpperCase();
}

// Construye una tarjeta del Kanban estilo imagen 5.
// Punto de color segun "¿Experiencia invirtiendo?" — orienta el tenor de preparacion.
function dotExperiencia(exp) {
  if (!exp) return '';
  const map = {
    'Ya invirtio en Tasatop': ['#2D7FF9', 'Ya invirtió en Tasatop'],
    'Productos similares': ['#8E44AD', 'Productos similares'],
    'Productos tradicionales': ['#9AA3AD', 'Productos tradicionales'],
    'Primera inversion': ['#9AA3AD', 'Primera inversión']
  };
  const m = map[exp]; if (!m) return '';
  return '<span class="kdot-exp" style="background:' + m[0] + '" title="Experiencia: ' + m[1] + '"></span>';
}

function kanbanCard(l) {
  const vencida = l.fechaProxAccion && new Date(l.fechaProxAccion) < new Date();
  const calif = (l.ticket || l.tiempo || l.nivelInteres || l.avance || l.experiencia);
  const prioCls = PRIO_CLASE[l.prioridad] || 'p-Baja';
  const tel = (l.telefono || '').replace(/[^0-9]/g, '');
  // Chips del score. En Reunion efectiva/Negociacion, si ya hay calificacion de cierre,
  // muestran "Proximo paso" + "Fondos disponibles" (mas relevantes en esa fase);
  // si aun no, mantienen interes/tiempo de la calificacion inicial.
  let chips = '';
  const etapaAvanzada = ['Reunion efectiva - seguimiento', 'Cierre pendiente'].includes(l.etapa);
  if (etapaAvanzada && (l.cProximoPaso || l.cFondos)) {
    if (l.cProximoPaso) chips += '<span class="kchip">' + tr(l.cProximoPaso) + '</span>';
    if (l.cFondos) chips += '<span class="kchip">' + tr(l.cFondos) + '</span>';
  } else if (calif) {
    if (l.nivelInteres) chips += '<span class="kchip">' + tr(l.nivelInteres) + '</span>';
    if (l.tiempo) chips += '<span class="kchip">' + tr(l.tiempo) + '</span>';
  }
  const estadoCalif = calif ? '' : '<span class="kestado porcal">○ Por calificar</span>';
  const fechaCorta = l.fechaProxAccion ? fmtFechaHoraCorta(l.fechaProxAccion) : '';
  const lineaAccion = l.proximaAccion
    ? '<div class="kacc' + (vencida ? ' venc' : '') + '">' +
        '<span class="kacc-ico">' + iconoAccion(l.proximaAccion) + '</span>' +
        '<span class="kacc-txt">' + accionCorta(l.proximaAccion, l.etapa) +
        (fechaCorta ? ' · ' + fechaCorta : '') + '</span>' +
      '</div>'
    : '';
  return '<div class="kcard" draggable="true" data-cod="' + l.codigo + '" data-etapa="' + l.etapa + '"' +
    ' ondragstart="kDragStart(event)" ondragend="kDragEnd(event)">' +
    '<div class="kcard-top">' +
      '<span class="kprio ' + prioCls + '">' + l.prioridad + '</span>' +
      (vencida ? '<span class="kbadge-venc">Vencido</span>' : '') +
      '<span class="kprob">' + l.probabilidad + '%</span>' +
    '</div>' +
    '<div class="knom" onclick="abrirGestion(\'' + l.codigo + '\')">' +
      (l.nombre || '—') + dotExperiencia(l.experienciaInv) + '</div>' +
    '<div class="kgp">' + fmtSoles(l.montoReal || l.montoPotencial) +
      (l.fechaAsignacion ? ' · <span class="kasig">' + fechaRelativa(l.fechaAsignacion) + '</span>' : '') + '</div>' +
    lineaAccion +
    (chips ? '<div class="kchips">' + chips + '</div>' : (estadoCalif ? '<div class="kchips">' + estadoCalif + '</div>' : '')) +
    '<div class="kbtns">' +
      '<button class="kbtn rg" onclick="event.stopPropagation();accionRegistrar(\'' + l.codigo + '\')">Registrar</button>' +
      '<button class="kbtn-ic ll" title="Llamar" onclick="event.stopPropagation();accionLlamar(\'' + l.codigo + '\')">' + ICO_TEL + '</button>' +
      '<button class="kbtn-ic wa" title="WhatsApp" onclick="event.stopPropagation();accionWhatsApp(\'' + l.codigo + '\')">' + ICO_WA + '</button>' +
    '</div>' +
  '</div>';
}

// Icono segun la proxima accion
// Iconos SVG azules para la proxima accion (telefono, calendario, avion, chat)
const ICO_ACC_TEL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="var(--azul)"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>';
const ICO_ACC_CAL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="var(--azul)"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>';
const ICO_ACC_AVION = '<svg viewBox="0 0 24 24" width="15" height="15" fill="var(--azul)"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
const ICO_ACC_CHAT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="var(--azul)"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg>';
function iconoAccion(a) {
  if (a === 'Llamar intento 3x5' || a === 'Llamar para calificar' || a === 'Cerrar venta (llamada)') return ICO_ACC_TEL;
  if (a === 'WhatsApp para calificar' || a === 'Cerrar venta (whatsapp)' || a === 'Seguimiento post reunion (whatsapp)' || a === 'Agendar reunion (whatsapp)' || a === 'Confirmar reunion (whatsapp)') return ICO_ACC_CHAT;
  if (['Agendar reunion','Confirmar asistencia','Reprogramar reunion',
       'Agendar reunion (llamar)','Agendar reunion (whatsapp)',
       'Confirmar reunion (llamar)','Confirmar reunion (whatsapp)'].includes(a)) return ICO_ACC_CAL;
  if (a === 'Enviar informacion' || a === 'Enviar propuesta') return ICO_ACC_AVION;
  if (a === 'Enviar WhatsApp de apoyo') return ICO_ACC_CHAT;
  return ICO_ACC_TEL;
}

// Colores fijos para las porciones del pie
const PIE_COLORES = ['#0B72E8', '#34A853', '#FF9900', '#7B5EA7', '#00ACC1', '#E91E63', '#9AA5B1', '#5C6BC0'];

async function cargarPie() {
  // Llenar el select de etapas una sola vez (desde las columnas kanban)
  const selEt = $('pieEtapa');
  if (selEt && selEt.options.length <= 1 && CAT && CAT.kanbanColumnas) {
    CAT.kanbanColumnas.forEach(c => selEt.add(new Option(c.titulo, c.id)));
  }
  const verPor = $('pieVerPor') ? $('pieVerPor').value : 'etapa';
  const etapa = $('pieEtapa') ? $('pieEtapa').value : '';
  let q = ['verPor=' + verPor];
  if (etapa) q.push('etapa=' + etapa);
  const selA = $('selAsesor');
  if (veTodoJS() && selA && selA.value) q.push('asesor=' + encodeURIComponent(selA.value));
  let data;
  try { data = await api('/api/distribucion?' + q.join('&')); } catch (e) { return; }
  const cont = $('pieCont');
  if (!data.items.length || data.totalMonto === 0) {
    cont.innerHTML = '<div class="kvacio" style="padding:24px 0">Sin monto para mostrar</div>';
    return;
  }
  // Construir donut SVG
  const R = 60, r = 36, cx = 75, cy = 75;
  let ang = -Math.PI / 2;
  const fmtK = n => 'S/ ' + Number(n).toLocaleString('es-PE');
  const segs = data.items.map((it, i) => {
    const frac = it.monto / data.totalMonto;
    const a2 = ang + frac * 2 * Math.PI;
    const x1 = cx + R * Math.cos(ang), y1 = cy + R * Math.sin(ang);
    const x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
    const large = frac > 0.5 ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
    ang = a2;
    return '<path d="' + path + '" fill="' + PIE_COLORES[i % PIE_COLORES.length] + '"/>';
  }).join('');
  const svg = '<div class="pie-wrap"><svg width="150" height="150" viewBox="0 0 150 150">' +
    segs + '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#fff"/></svg>' +
    '<div class="pie-centro"><div class="t">Total</div><div class="m">' + fmtK(data.totalMonto) + '</div></div></div>';
  const leyenda = '<div class="leyenda" style="flex:1;min-width:240px">' + data.items.map((it, i) =>
    '<div class="leg-item"><span class="punto" style="background:' + PIE_COLORES[i % PIE_COLORES.length] + '"></span>' +
    '<span class="nom">' + tr(it.clave) + '</span>' +
    '<span class="val">' + fmtK(it.monto) + ' (' + it.cantidad + ')</span></div>'
  ).join('') + '</div>';
  cont.innerHTML = svg + leyenda;
}

// --- Drag & drop ---
let K_DRAG = null;
function kDragStart(e) {
  K_DRAG = { cod: e.target.dataset.cod, etapa: e.target.dataset.etapa };
  e.target.classList.add('drag');
}
function kDragEnd(e) { e.target.classList.remove('drag'); document.querySelectorAll('.kcol-body.drop').forEach(x => x.classList.remove('drop')); }
function kDragOver(e) {
  e.preventDefault();
  const col = e.currentTarget.dataset.col;
  if (K_DRAG && transicionValidaJS(K_DRAG.etapa, col)) e.currentTarget.classList.add('drop');
}
function kDragLeave(e) { e.currentTarget.classList.remove('drop'); }
function kDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drop');
  if (!K_DRAG) return;
  const colDestino = e.currentTarget.dataset.col;
  if (!transicionValidaJS(K_DRAG.etapa, colDestino)) { K_DRAG = null; return; } // rebota: no valido
  const resultadoSugerido = CAT.kanbanResultadoDestino[colDestino];
  // Reglas al soltar:
  //  - "contactado": muestra solo franja Contacto, default "sin calificar", campo 3 bloqueado
  //  - "calificado"/"agendado": obliga a calificar
  let modo = null;
  if (colDestino === 'contactado') modo = 'soloContacto';
  else if (['calificado', 'agendado'].includes(colDestino)) modo = 'obligatorio';
  abrirGestion(K_DRAG.cod, resultadoSugerido, null, modo);
  K_DRAG = null;
}

// Matriz de transiciones permitidas (espejo del backend). Sin retroceso.
const K_TRANSICIONES = {
  contactar:   ['contactado', 'calificado', 'agendado'],
  contactado:  ['calificado', 'agendado'],
  calificado:  ['agendado'],
  agendado:    ['reunido'],
  reunido:     ['negociacion'],
  negociacion: []
};
function transicionValidaJS(etapaActual, colDestino) {
  const cols = CAT.kanbanColumnas;
  const colActual = cols.find(c => c.etapas.includes(etapaActual));
  const origen = colActual ? colActual.id : 'contactar';
  if (origen === colDestino) return false;
  return (K_TRANSICIONES[origen] || []).includes(colDestino);
}

function render() {
  if (VISTA_LEADS === 'kanban') { renderKanban(); $('paginacion').style.display = 'none'; return; }
  $('paginacion').style.display = 'flex';
  const listaFull = leadsVisibles();
  const tb = $('tbodyLeads');
  const esAdmin = YO.rol === 'admin';
  const puedeAsig = puedeAsignarJS();
  const cols = puedeAsig ? 18 : 17;
  // Paginacion
  const totalPag = Math.max(1, Math.ceil(listaFull.length / PAG_SIZE));
  if (PAG_ACTUAL > totalPag) PAG_ACTUAL = totalPag;
  const ini = (PAG_ACTUAL - 1) * PAG_SIZE;
  const lista = listaFull.slice(ini, ini + PAG_SIZE);
  // Barra de paginacion
  const desde = listaFull.length ? ini + 1 : 0;
  const hasta = Math.min(ini + PAG_SIZE, listaFull.length);
  $('pagInfo').textContent = `Mostrando ${desde} a ${hasta} de ${listaFull.length} leads`;
  $('pagActual').textContent = PAG_ACTUAL;
  $('pagPrev').disabled = PAG_ACTUAL <= 1;
  $('pagNext').disabled = PAG_ACTUAL >= totalPag;
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="' + cols + '" class="vacio">Sin leads en esta vista.</td></tr>'; return; }
  tb.innerHTML = lista.map(l => {
    const col = ETAPA_COLOR[l.etapa] || ['#EEE', '#333'];
    const bg = col[0], fg = col[1];
    const vencida = l.fechaProxAccion && new Date(l.fechaProxAccion) < new Date();
    const chk = puedeAsig ? '<td onclick="event.stopPropagation()"><input type="checkbox" class="selLead" value="' + l.codigo + '" style="width:auto"></td>' : '';
    const asesorCell = l.asesor
      ? l.asesor
      : (puedeAsig ? '<button class="btn sec" style="padding:3px 8px;font-size:11px" onclick="event.stopPropagation();abrirAsignarUno(\'' + l.codigo + '\',\'' + (l.nombre||'').replace(/'/g,'') + '\')">Asignar</button>' : '—');
    const dia3x5 = l.diasDesdeAsignacion ? l.diasDesdeAsignacion + '/5' : '—';
    const tel = (l.telefono || '').replace(/[^0-9]/g, '');
    return '<tr class="fila">' +
      chk +
      '<td onclick="abrirGestion(\'' + l.codigo + '\')"><span class="chip ' + (PRIO_CLASE[l.prioridad] || 'p-Baja') + '">' + l.prioridad + '</span></td>' +
      // Lead enriquecido: nombre + canal/fuente + estado de contacto
      '<td onclick="abrirGestion(\'' + l.codigo + '\')">' + celdaLead(l) + '</td>' +
      // Proxima accion con icono + subtitulo
      '<td onclick="abrirGestion(\'' + l.codigo + '\')">' + celdaAccion(l) + '</td>' +
      '<td onclick="abrirGestion(\'' + l.codigo + '\')" class="' + (vencida ? 'vencida' : '') + '">' + (l.fechaProxAccion ? fmtFecha(l.fechaProxAccion) : '—') + (vencida ? '<br><span class="badge-venc">\u26A0 Vencido</span>' : '') + '</td>' +
      '<td onclick="abrirGestion(\'' + l.codigo + '\')"><span class="et" style="background:' + bg + ';color:' + fg + '">' + trEtapa(l.etapa) + '</span></td>' +
      '<td onclick="abrirGestion(\'' + l.codigo + '\')"><div class="prob"><div class="track"><div class="fill" style="width:' + l.probabilidad + '%"></div></div><b>' + l.probabilidad + '%</b></div></td>' +
      '<td onclick="abrirGestion(\'' + l.codigo + '\')" style="white-space:nowrap">' + fmtSoles(l.montoReal || l.montoPotencial) + '</td>' +
      // Columna de accion: Registrar + Llamar + WhatsApp (solo abren registro)
      '<td class="colAccion" onclick="event.stopPropagation()">' +
        '<div class="acc-btns">' +
          '<button class="acc-reg" onclick="accionRegistrar(\'' + l.codigo + '\')">Registrar</button>' +
          '<button class="acc-ic ll" title="Llamar" onclick="accionLlamar(\'' + l.codigo + '\')">' + ICO_TEL + '</button>' +
          '<button class="acc-ic wa" title="WhatsApp" onclick="accionWhatsApp(\'' + l.codigo + '\')">' + ICO_WA + '</button>' +
        '</div>' +
      '</td>' +
      '<td class="colCtrl">' + asesorCell + '</td>' +
      '<td class="colCtrl">' + (l.telefono || '') + '</td>' +
      '<td class="colCtrl">' + tr(l.ultimoResultado) + '</td>' +
      '<td class="colCtrl" style="text-align:center">' + l.intentosHoy + '/3</td>' +
      '<td class="colCtrl" style="text-align:center">' + dia3x5 + '</td>' +
      '<td class="colCtrl" style="font-size:11.5px;color:var(--muted)">' + fmtFecha(l.fechaCarga) + '</td>' +
      '<td class="colCtrl" style="font-size:11.5px;color:var(--muted)">' + fmtFecha(l.fechaAsignacion) + '</td>' +
      '<td class="colCtrl" style="font-size:11.5px;color:var(--muted)">' + l.codigo + (esAdmin ? ' <button class=\'btn sec\' style=\'padding:2px 7px;font-size:11px\' onclick=\'event.stopPropagation();archivarLead("' + l.codigo + '","' + (l.nombre||'').replace(/"/g,'') + '")\'>Archivar</button>' : '') + '</td>' +
    '</tr>';
  }).join('');
}

// Iconos SVG inline para los botones de accion
const ICO_WA = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-.81z"/></svg>';
const ICO_TEL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>';

// Celda Lead: nombre + canal con icono + fuente + estado de contacto (rojo)
function celdaLead(l) {
  const fuente = l.fuente ? 'Fuente: ' + tr(l.fuente) : '';
  const asignado = l.fechaAsignacion ? fechaRelativa(l.fechaAsignacion) : '';
  // Estado de contacto SOLO en etapa "Por contactar":
  // intentos > 0 -> "N intentos" (azul); sin intentos -> "Sin contacto".
  let estadoHtml = '';
  if (l.etapa === 'Contactabilidad 3x5') {
    if (l.intentos > 0) estadoHtml = '<div class="lead-intentos">' + l.intentos + (l.intentos === 1 ? ' intento' : ' intentos') + '</div>';
    else estadoHtml = '<div class="lead-estado">Sin contacto</div>';
  }
  return '<div class="lead-cell">' +
    '<div class="lead-nom">' + (l.nombre || '—') + dotExperiencia(l.experienciaInv) + '</div>' +
    (asignado ? '<div class="lead-asig">' + asignado + '</div>' : '') +
    (fuente ? '<div class="lead-fuente">' + fuente + '</div>' : '') +
    estadoHtml +
  '</div>';
}
// Fecha relativa: "Hoy 10am", "Ayer", "Hace 3 días"
function fechaRelativa(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  const hoy0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const difDias = Math.round((hoy0 - d0) / 86400000);
  let h = d.getHours(); const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am'; h = h % 12; if (h === 0) h = 12;
  const hora = m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2,'0')}${ampm}`;
  if (difDias <= 0) return 'Hoy ' + hora;
  if (difDias === 1) return 'Hace 1 día';
  return 'Hace ' + difDias + ' días';
}
function grupoNoResp(r) {
  return ['No contesto','Buzon / apagado','WhatsApp enviado sin respuesta'].includes(r);
}
// Celda proxima accion: icono azul + accion + subtitulo
function celdaAccion(l) {
  if (!l.proximaAccion) return '<span style="color:var(--gris)">—</span>';
  const sub = SUBT_ACCION[l.proximaAccion] || '';
  return '<div class="acc-cell">' +
    '<span class="acc-ico">' + iconoAccion(l.proximaAccion) + '</span>' +
    '<div class="acc-txt"><div class="acc-main"><b>' + accionTabla(l.proximaAccion, l.etapa) + '</b></div>' +
    (sub ? '<div class="acc-sub">' + sub + '</div>' : '') + '</div>' +
  '</div>';
}
const SUBT_ACCION = {
  'Llamar intento 3x5': 'Intento de contacto',
  'Agendar reunion': 'Coordinar reunión',
  'Confirmar asistencia': 'Confirmar reunión agendada',
  'Enviar informacion': 'Enviar opciones de inversión',
  'Seguimiento post reunion': 'Dar seguimiento',
  'Reprogramar reunion': 'Reagendar',
  'Desestimar': 'Cerrar el lead'
};
const ICO_WA_MINI = '<svg viewBox="0 0 24 24" width="11" height="11" fill="#1EA952" style="vertical-align:-1px"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-.81z"/></svg>';
const ICO_TEL_MINI = '<svg viewBox="0 0 24 24" width="10" height="10" fill="var(--azul)" style="vertical-align:-1px"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>';

function marcarTodos(chk) {
  document.querySelectorAll('.selLead').forEach(c => c.checked = chk.checked);
}

// ---------- Exportar Excel (vista filtrada actual) ----------
function exportarExcel() {
  const lista = leadsVisibles();
  if (!lista.length) { alert('No hay leads para exportar.'); return; }
  const cab = ['Prioridad','Etapa','Proxima accion','Fecha prox accion','Probabilidad %','GP',
    'Lead','Monto','Teléfono','Ultimo resultado','Intentos dia','Dia 3x5','Cargado','Asignado','Codigo'];
  const filas = lista.map(l => [
    l.prioridad, l.etapa, l.proximaAccion || '', fmtFecha(l.fechaProxAccion), l.probabilidad,
    l.asesor || '', l.nombre, l.montoPotencial || '', l.telefono || '', l.ultimoResultado,
    l.intentosHoy + '/3', l.diasDesdeAsignacion ? l.diasDesdeAsignacion + '/5' : '',
    fmtFecha(l.fechaCarga), fmtFecha(l.fechaAsignacion), l.codigo
  ]);
  const csv = [cab].concat(filas)
    .map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'mis_leads_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}

// ---------- Asignacion ----------
function abrirAsignarUno(codigo, nombre) {
  asignarCodigos = [codigo];
  $('aSub').textContent = nombre + ' (' + codigo + ')';
  $('aError').classList.remove('act');
  $('ovAsignar').classList.add('act');
}
function abrirAsignarSeleccion() {
  asignarCodigos = [...document.querySelectorAll('.selLead:checked')].map(c => c.value);
  if (!asignarCodigos.length) { alert('Marca al menos un lead con el checkbox.'); return; }
  $('aSub').textContent = asignarCodigos.length + ' lead(s) seleccionado(s)';
  $('aError').classList.remove('act');
  $('ovAsignar').classList.add('act');
}
async function confirmarAsignar() {
  $('aError').classList.remove('act');
  try {
    const r = await api('/api/leads/asignar', { method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ codigos: asignarCodigos, asesor: $('aAsesor').value }) });
    cerrar('ovAsignar');
    alert(r.asignados + ' lead(s) asignados a ' + r.asesor + '.');
    cargarLeads();
  } catch (e) { $('aError').textContent = e.message; $('aError').classList.add('act'); }
}

// ---------- Importacion ----------
function abrirImport() {
  impPreview = null;
  $('impArchivo').value = '';
  $('impPaso1').classList.remove('oculto');
  $('impPaso2').classList.add('oculto');
  $('impError').classList.remove('act');
  $('ovImport').classList.add('act');
}

// Parser CSV simple con soporte de comillas
function parseCSV(texto) {
  const filas = [];
  let fila = [], campo = '', enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"' && texto[i+1] === '"') { campo += '"'; i++; }
      else if (c === '"') enComillas = false;
      else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ',' || c === ';') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
      if (c === '\r' && texto[i+1] === '\n') i++;
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

async function analizarCSV() {
  $('impError').classList.remove('act');
  const f = $('impArchivo').files[0];
  if (!f) { $('impError').textContent = 'Selecciona un archivo CSV.'; $('impError').classList.add('act'); return; }
  const texto = await f.text();
  const matriz = parseCSV(texto).filter(r => r.some(c => String(c).trim() !== ''));
  if (matriz.length < 2) { $('impError').textContent = 'El archivo no tiene datos (cabecera + filas).'; $('impError').classList.add('act'); return; }

  // Mapear cabeceras: Nombre, Celular, Email, Fuente, Monto Potencial (flexible)
  const cab = matriz[0].map(c => c.toLowerCase().trim());
  const idx = (claves) => cab.findIndex(c => claves.some(k => c.includes(k)));
  const iNom = idx(['nombre']), iCel = idx(['celular','telefono','tel']),
        iMail = idx(['email','correo']), iFue = idx(['fuente']), iMon = idx(['monto']);
  if (iNom < 0 || iCel < 0) {
    $('impError').textContent = 'El CSV debe tener al menos las columnas Nombre y Celular.';
    $('impError').classList.add('act'); return;
  }
  const filas = matriz.slice(1).map(r => ({
    nombre: r[iNom] || '', celular: r[iCel] || '',
    email: iMail >= 0 ? r[iMail] || '' : '',
    fuente: iFue >= 0 ? r[iFue] || '' : '',
    montoPotencial: iMon >= 0 ? r[iMon] || '' : ''
  }));

  try {
    impPreview = await api('/api/leads/importar/preview', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ filas }) });
    $('impNumVal').textContent = impPreview.validos.length;
    $('impNumDup').textContent = impPreview.duplicados.length;
    $('impNumErr').textContent = impPreview.erroneos.length;
    let det = '';
    if (impPreview.duplicados.length) det += '<b>Duplicados:</b><br>' + impPreview.duplicados.map(d =>
      `Fila ${d.fila}: ${d.nombre} (${d.celular}) — ${d.motivo}`).join('<br>') + '<br><br>';
    if (impPreview.erroneos.length) det += '<b style="color:var(--rojo)">Con error:</b><br>' + impPreview.erroneos.map(e =>
      `Fila ${e.fila}: ${e.nombre || '(sin nombre)'} — ${e.motivos.join(', ')}`).join('<br>');
    $('impDetalle').innerHTML = det || 'Todas las filas son validas.';
    $('impBtnErrores').style.display = impPreview.erroneos.length ? '' : 'none';
    $('impBtnConfirmar').disabled = !impPreview.validos.length && !impPreview.duplicados.length;
    $('impPaso1').classList.add('oculto');
    $('impPaso2').classList.remove('oculto');
  } catch (e) { $('impError').textContent = e.message; $('impError').classList.add('act'); }
}

function descargarErrores() {
  const filas = [['Fila','Nombre','Celular','Email','Motivos']].concat(
    impPreview.erroneos.map(e => [e.fila, e.nombre, e.celular, e.email || '', e.motivos.join(' | ')]));
  const csv = filas.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'errores_importacion.csv';
  a.click();
}

async function confirmarImport() {
  $('impError').classList.remove('act');
  try {
    const body = { filas: impPreview.validos };
    if ($('impActDup').checked) body.actualizarDuplicados = impPreview.duplicados.filter(d => d.motivo !== 'Repetido dentro del archivo');
    const r = await api('/api/leads/importar/confirmar', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body) });
    cerrar('ovImport');
    alert('Importados: ' + r.importados + ' nuevos' + (r.actualizados ? ' | Actualizados: ' + r.actualizados : '') +
      '.\nLos nuevos quedan SIN ASIGNAR: usa el filtro "Sin asignar" para repartirlos.');
    if (veTodoJS()) $('selFiltro').value = 'sin-asignar';
    cargarLeads();
  } catch (e) { $('impError').textContent = e.message; $('impError').classList.add('act'); }
}

// ---------- Registrar gestion ----------
async function abrirGestion(codigo, resultadoSugerido, canalDefault, modoCalif) {
  gCodigo = codigo;
  modoCalifForzado = modoCalif || null; // 'bloqueado' | 'obligatorio' | null (desde kanban)
  gLead = await api('/api/leads/' + codigo);
  $('gTitulo').textContent = 'Registrar gestión — ' + gLead.nombre;
  // Cabecera con chips: codigo · etapa(estado) · prioridad · score · prob · GP
  const bg = colorEtapa(gLead.etapa), fg = '#333';
  $('gSub').innerHTML =
    `<span class="dato">${codigo}</span><span class="sep">·</span>` +
    `<span class="chip-est" style="background:${bg};color:${fg}">${trEtapa(gLead.etapa)}</span>` +
    `<span class="chip-est" style="background:#EEF1F5;color:#555">Prioridad ${gLead.prioridad}</span>` +
    `<span class="sep">·</span><span class="dato"><b>Score ${gLead.score}/100</b></span>` +
    `<span class="sep">·</span><span class="dato">Prob. <b>${gLead.probabilidad}%</b></span>` +
    `<span class="sep">·</span><span class="dato">GP ${gLead.asesor || 'sin asignar'}</span>`;
  ['gResultado','gProxAccion','gFechaProx','gTiempo','gInteres',
   'gExperiencia','gExperienciaInv','gFechaReunion','gResumen','gFechaCierre',
   'gMonto','cMontoNum','cFondos','cPrioriza','cPlazo','cCompetencia','cProximoPaso']
    .forEach(id => { if ($(id)) $(id).value = ''; });
  if ($('gPasaNegociacion')) $('gPasaNegociacion').checked = false;
  if ($('gNoDefineMonto')) { $('gNoDefineMonto').checked = false; $('gMonto').disabled = false; }
  if ($('cNoDefineMonto')) { $('cNoDefineMonto').checked = false; $('cMontoNum').disabled = false; }
  $('gResumenCount').textContent = '0';
  $('gError').classList.remove('act');
  modoPerdido = false;
  cierreEnEdicion = false;
  califObligatoria = false;
  $('gResultado').disabled = false;
  ['gMonto','gTiempo','gInteres','gExperiencia','gExperienciaInv'].forEach(id => { if ($(id)) $(id).disabled = false; });
  // Prefill de calificacion si el lead ya tiene datos (para que el score se vea de una)
  if (gLead.montoReal != null) $('gMonto').value = Number(gLead.montoReal).toLocaleString('en-US');
  if (gLead.tiempo) $('gTiempo').value = gLead.tiempo;
  if (gLead.nivelInteres) $('gInteres').value = gLead.nivelInteres;
  if (gLead.avance || gLead.experiencia) $('gExperiencia').value = gLead.avance || gLead.experiencia;
  if (gLead.experienciaInv) $('gExperienciaInv').value = gLead.experienciaInv;
  if (gLead.montoReal != null) $('cMontoNum').value = Number(gLead.montoReal).toLocaleString('en-US');
  if (gLead.cFondos) $('cFondos').value = gLead.cFondos;
  if (gLead.cPrioriza) $('cPrioriza').value = gLead.cPrioriza;
  if (gLead.cPlazo) $('cPlazo').value = gLead.cPlazo;
  if (gLead.cCompetencia) $('cCompetencia').value = gLead.cCompetencia;
  if (gLead.cProximoPaso) $('cProximoPaso').value = gLead.cProximoPaso;
  if (gLead.fechaCierreEstimada) $('gFechaCierre').value = gLead.fechaCierreEstimada.slice(0,10);

  // Cargar SOLO los resultados permitidos para la etapa del lead, agrupados y coloreados
  const permit = await api('/api/leads/' + codigo + '/resultados-permitidos');
  gYaCalificado = permit.yaCalificado;
  const COLOR_GRUPO = {
    'Sin contacto': '#EEEEEE', 'Contacto': '#CFE2F3', 'Avanza': '#D9EAD3',
    'Se mantiene': '#FFF2CC', 'Cierra': '#F4CCCC', 'Descarte': '#EFEFEF', 'Resultados': '#FFFFFF'
  };
  const sel = $('gResultado');
  sel.innerHTML = '';
  let sugeridoDisponible = false;
  // Si el arrastre del kanban fue a "Contactado", mostrar solo la franja "Contacto".
  let grupos = permit.grupos;
  if (modoCalif === 'soloContacto') grupos = grupos.filter(([g]) => g === 'Contacto');
  grupos.forEach(([grupo, opciones]) => {
    const og = document.createElement('optgroup');
    og.label = grupo.toUpperCase();
    og.style.background = COLOR_GRUPO[grupo] || '#fff';
    opciones.forEach(o => { if (o === resultadoSugerido) sugeridoDisponible = true; og.appendChild(new Option(tr(o), o)); });
    sel.appendChild(og);
  });
  if (resultadoSugerido && sugeridoDisponible) sel.value = resultadoSugerido;
  else if (sel.options.length) sel.value = sel.options[0].value;

  // Canal por defecto segun el boton usado (WhatsApp / Llamada)
  if (canalDefault && $('gCanal')) {
    const opt = Array.from($('gCanal').options).find(o => o.value === canalDefault || o.text === canalDefault);
    if (opt) $('gCanal').value = opt.value;
  } else if ($('gCanal')) {
    const llam = Array.from($('gCanal').options).find(o => /llamada/i.test(o.text));
    if (llam) $('gCanal').value = llam.value; // por defecto Llamada
  }

  ajustarCampos();
  $('ovGestion').classList.add('act');
}

// Atajos de los botones de accion (reusados en tabla y kanban).
// Solo abren el registro con el canal correspondiente (sin enlaces externos).
function accionWhatsApp(codigo) { abrirGestion(codigo, null, 'WhatsApp'); }
function accionLlamar(codigo) { abrirGestion(codigo, null, 'Llamada'); }
function accionRegistrar(codigo) { abrirGestion(codigo, null, 'Llamada'); }

// Muestra/oculta secciones segun el resultado elegido
function ajustarCampos() {
  const r = $('gResultado').value;
  $('gProxAccion').disabled = !r;
  // Fecha de reunion: solo al AGENDAR o REPROGRAMAR (no al confirmar, que mantiene la original)
  const pideFechaReunion = ['Agendo reunion','Reprogramo reunion'].includes(r);
  document.querySelectorAll('.campoReu').forEach(e => e.classList.toggle('oculto', !pideFechaReunion));
  // Check "pasar a Negociación": solo si el lead esta en AGENDADO y el resultado es Reunion efectiva.
  const enAgendado = gLead && gLead.etapa === 'Agendado - pendiente reunion';
  const mostrarCheckNeg = enAgendado && r === 'Reunion efectiva';
  document.querySelectorAll('.campoCheckNeg').forEach(e => e.classList.toggle('oculto', !mostrarCheckNeg));
  if (!mostrarCheckNeg && $('gPasaNegociacion')) $('gPasaNegociacion').checked = false;
  const pasaNegociacion = mostrarCheckNeg && $('gPasaNegociacion') && $('gPasaNegociacion').checked;

  // Fecha estimada de cierre: si el resultado es "En negociacion", si el lead YA esta en
  // Negociacion, o si se marco el check que lo lleva a Negociacion desde Agendado.
  const enNegociacion = (gLead && gLead.etapa === 'Cierre pendiente') || r === 'En negociacion' || pasaNegociacion;
  const esSinContacto = ['No contesto', 'Buzon / apagado', 'WhatsApp enviado sin respuesta'].includes(r);
  document.querySelectorAll('.campoCierre').forEach(e => e.classList.toggle('oculto', !enNegociacion));
  // En "sin contacto" la fecha de cierre se bloquea (mantiene la ya marcada). En
  // "Seguimiento post reunion" sigue editable. En el resto de negociacion, editable.
  if ($('gFechaCierre')) $('gFechaCierre').disabled = esSinContacto;

  // Venta ganada (cierre): solo el bloque 1 (Gestion realizada) + comentario obligatorio.
  const esVentaGanada = r === 'Venta ganada';
  // Modo "solo gestion": bandera de perdido, descarte o venta ganada.
  const esDescarte = ['Numero invalido', 'Numero equivocado', 'Respondio - no interesado', 'Respondio - no califica', 'Desistio'].includes(r);
  const modoSoloGestion = modoPerdido || esDescarte || esVentaGanada;

  // Bloque de Calificacion de cierre (5 variables): visible en negociacion (salvo solo-gestion).
  // En Negociacion ya esta calificado: se muestra en SOLO LECTURA con boton "Editar".
  const cierreVisible = enNegociacion && !modoSoloGestion;
  $('secCierre').classList.toggle('oculto', !cierreVisible);
  $('secScore').classList.toggle('oculto', modoSoloGestion);
  // Bloqueo del cierre: si el lead YA esta en Negociacion (no es la 1a vez que entra),
  // el cierre va en solo lectura salvo que el usuario pulse "Editar" o sea seguimiento.
  if (cierreVisible) {
    const yaEnNegociacion = gLead && gLead.etapa === 'Cierre pendiente';
    const permitirEdicion = !yaEnNegociacion || cierreEnEdicion || r === 'Seguimiento post reunion';
    bloquearCierre(!permitirEdicion);
  }

  if (modoSoloGestion) {
    $('bloquePaso').classList.add('oculto');
    $('secCalif').classList.add('oculto');
    $('secCierre').classList.add('oculto');
    $('gResumenReq').classList.remove('oculto');
    califObligatoria = false;
    recalcularScore();
    return;
  } else {
    $('bloquePaso').classList.remove('oculto');
    $('secCalif').classList.toggle('oculto', enNegociacion);
    $('gResumenReq').classList.add('oculto');
  }

  // Proxima accion por defecto segun resultado (la primera de la lista es la default).
  let autoAccion = null;
  if (['Numero invalido', 'Numero equivocado', 'Respondio - no interesado', 'Respondio - no califica'].includes(r)) autoAccion = 'Desestimar';

  const sel = $('gProxAccion');
  const previo = sel.value;
  let acciones = (r && CAT.accionesPorResultado && CAT.accionesPorResultado[r]) || CAT.proximasAcciones;
  acciones = acciones.slice();
  // La default es la primera de la lista mapeada al resultado (Llamar.../Agendar.../Confirmar...)
  if (!autoAccion && r && CAT.accionesPorResultado && CAT.accionesPorResultado[r]) {
    autoAccion = acciones[0];
  }
  // Sin opcion vacia: siempre hay un valor seleccionable (registro obligatorio).
  sel.innerHTML = '';
  acciones.forEach(a => sel.add(new Option(tr(a), a)));
  if (autoAccion && acciones.includes(autoAccion)) sel.value = autoAccion;
  else if (acciones.includes(previo)) sel.value = previo;
  else if (acciones.length) sel.value = acciones[0];

  aplicarReglaCalificacion(r);
  recalcularScore();
}

// Regla de la seccion 3 (Calificacion) segun el resultado / modo del kanban:
//  - Bloqueada (visible pero deshabilitada): No contestó, Buzón, WhatsApp s/r,
//    Respondió no pudo hablar, Respondió sin calificar, o modo 'bloqueado' del kanban.
//  - Obligatoria: Respondió calificado, Agendó reunión, o modo 'obligatorio' del kanban.
//  - Libre: cualquier otro caso.
function aplicarReglaCalificacion(r) {
  const bloquearPorResultado = ['No contesto','Buzon / apagado','WhatsApp enviado sin respuesta',
    'Respondio - sin calificar'].includes(r);
  const obligaPorResultado = ['Respondio - calificado','Agendo reunion'].includes(r);
  const bloquear = modoCalifForzado === 'bloqueado' || bloquearPorResultado;
  const obliga = !bloquear && (modoCalifForzado === 'obligatorio' || obligaPorResultado);

  // Habilitar/deshabilitar los 4 selects y atenuar la seccion
  ['gMonto','gTiempo','gInteres','gExperiencia','gExperienciaInv'].forEach(id => { if ($(id)) $(id).disabled = bloquear; });
  $('secCalif').classList.toggle('calif-bloq', bloquear);
  // Marca de obligatorio
  $('secCalif').classList.toggle('calif-oblig', obliga);
  let aviso = $('califAviso');
  if (aviso) aviso.textContent = bloquear
    ? 'Calificación no disponible: el lead aún no fue calificado en esta gestión.'
    : (obliga ? 'Completa las 5 variables para poder guardar esta gestión.' : '');
  califObligatoria = obliga;
}
let califObligatoria = false;

// Puntajes por variable + score total + probabilidad, todo en vivo.
const PTS_TICKET = { 'S/ 200,000 a mas': 30, 'S/ 100,000 - 199,999': 25, 'S/ 50,000 - 99,999': 20, 'S/ 10,000 - 49,999': 10 };
const PTS_INTERES = { 'Muy interesado': 25, 'Interesado': 18, 'Solo consulta': 10, 'Bajo interes': 5 };
const PTS_TIEMPO = { '0 a 7 dias': 20, '8 a 15 dias': 15, '16 a 30 dias': 10, '> 30 dias': 5 };
const PTS_AVANCE = { 'Decide solo': 15, 'Decide acompanado': 11, 'Debe consultar': 7, 'No avanza': 3 };
const PTS_EXPINV = { 'Ya invirtio en Tasatop': 10, 'Productos similares': 8, 'Productos tradicionales': 5, 'Primera inversion': 3 };
// Score de cierre (optimizado)
const PTS_FONDOS = { 'Listo hoy': 25, 'En 7 dias': 18, 'Mas de 7 dias': 7, 'Sin fecha': 0 };
const PTS_CMONTO = { 'S/ 200,000 a mas': 20, 'S/ 100,000 - 199,999': 15, 'S/ 50,000 - 99,999': 8, 'S/ 10,000 - 49,999': 3 };
const PTS_COMPET = { 'No compara': 20, 'Tradicionales': 13, 'Similares': 8, 'Tiene propuesta': 3 };
const PTS_CPASO = { 'Invierte hoy': 35, 'Decide esta semana': 25, 'Enviar info': 8, 'Sin paso': 0 };
// Score inicial del monto numerico (1a calif): mismos pesos del ticket
const PTS_TICKET_INI = { 'S/ 200,000 a mas': 30, 'S/ 100,000 - 199,999': 25, 'S/ 50,000 - 99,999': 20, 'S/ 10,000 - 49,999': 10 };

// Numero -> rango (espejo del backend)
function montoARangoJS(n) {
  n = Number(n);
  if (!isFinite(n) || n < 10000) return null;
  if (n >= 200000) return 'S/ 200,000 a mas';
  if (n >= 100000) return 'S/ 100,000 - 199,999';
  if (n >= 50000) return 'S/ 50,000 - 99,999';
  return 'S/ 10,000 - 49,999';
}

// Lee el valor numerico de un campo de monto (quitando comas).
function montoVal(pref) {
  const input = pref === 'g' ? $('gMonto') : $('cMontoNum');
  const n = Number(String(input.value || '').replace(/[^\d]/g, ''));
  return isFinite(n) ? n : 0;
}

// Formatea el input con comas de miles mientras se escribe.
function fmtMontoInput(pref) {
  const input = pref === 'g' ? $('gMonto') : $('cMontoNum');
  const n = Number(String(input.value || '').replace(/[^\d]/g, ''));
  input.value = n ? n.toLocaleString('en-US') : '';
  recalcularScore();
}

// Sube/baja el monto en pasos (10,000), respetando min 10k y max 1M.
function stepMonto(pref, paso) {
  const input = pref === 'g' ? $('gMonto') : $('cMontoNum');
  if (input.disabled) return;
  let n = Number(String(input.value || '').replace(/[^\d]/g, '')) || 0;
  if (n === 0 && paso > 0) n = 10000; else n = n + paso;
  if (n < 10000) n = 10000;
  if (n > 1000000) n = 1000000;
  input.value = n.toLocaleString('en-US');
  recalcularScore();
}

// Bloquea/limpia el campo de monto al marcar "No define monto" (prefijo 'g' o 'c').
function toggleNoDefine(pref) {
  const input = pref === 'g' ? $('gMonto') : $('cMontoNum');
  const chk = pref === 'g' ? $('gNoDefineMonto') : $('cNoDefineMonto');
  if (chk.checked) { input.value = ''; input.disabled = true; }
  else input.disabled = false;
  recalcularScore();
}

// Bloquea o habilita los campos del bloque de cierre. Cuando esta bloqueado muestra
// un boton "Editar" para permitir ajustes (lead sigue vivo).
function bloquearCierre(bloquear) {
  ['cFondos','cMontoNum','cPrioriza','cPlazo','cCompetencia','cProximoPaso'].forEach(id => {
    const el = $(id); if (el) el.disabled = bloquear;
  });
  const chk = $('cNoDefineMonto'); if (chk) chk.disabled = bloquear;
  document.querySelectorAll('#secCierre .mg-monto-spin button').forEach(b => b.disabled = bloquear);
  const btn = $('btnEditarCierre');
  if (btn) btn.classList.toggle('oculto', !bloquear);
}
function editarCierre() {
  cierreEnEdicion = true;
  ajustarCampos();
}

function recalcularScore() {
  // --- Score inicial (5 variables); la 1a es monto numerico ---
  const montoIni = $('gNoDefineMonto') && $('gNoDefineMonto').checked ? null : montoVal('g');
  const rangoIni = montoIni ? montoARangoJS(montoIni) : null;
  const t = rangoIni ? (PTS_TICKET_INI[rangoIni] || 0) : 0;
  const i = PTS_INTERES[$('gInteres').value] || 0;
  const ti = PTS_TIEMPO[$('gTiempo').value] || 0;
  const a = PTS_AVANCE[$('gExperiencia').value] || 0;
  const e = PTS_EXPINV[$('gExperienciaInv').value] || 0;
  $('ptsTicket').textContent = t + ' pts';
  $('ptsInteres').textContent = i + ' pts';
  $('ptsTiempo').textContent = ti + ' pts';
  $('ptsAvance').textContent = a + ' pts';
  $('ptsExpInv').textContent = e + ' pts';
  const scoreInicial = Math.min(100, t + i + ti + a + e);

  // --- Score de cierre (si el bloque esta visible) ---
  const cierreVisible = !$('secCierre').classList.contains('oculto');
  let scoreCierre = 0, cierreCompleto = false;
  if (cierreVisible) {
    const montoC = $('cNoDefineMonto') && $('cNoDefineMonto').checked ? null : montoVal('c');
    const rangoC = montoC ? montoARangoJS(montoC) : null;
    const f = PTS_FONDOS[$('cFondos').value] || 0;
    const m = rangoC ? (PTS_CMONTO[rangoC] || 0) : 0;
    const co = PTS_COMPET[$('cCompetencia').value] || 0;
    const pa = PTS_CPASO[$('cProximoPaso').value] || 0;
    // Subpregunta de plazo: aparece si prioriza "Plazo"
    const esPlazo = $('cPrioriza').value === 'Plazo';
    document.querySelectorAll('.campoPlazo').forEach(el => el.classList.toggle('oculto', !esPlazo));
    $('ptsFondos').textContent = f + ' pts';
    $('ptsCMonto').textContent = m + ' pts';
    $('ptsCompet').textContent = co + ' pts';
    $('ptsCPaso').textContent = pa + ' pts';
    scoreCierre = Math.min(100, f + m + co + pa); // prioriza no suma
    const montoOk = (montoC && montoARangoJS(montoC)) || ($('cNoDefineMonto') && $('cNoDefineMonto').checked);
    cierreCompleto = !!($('cFondos').value && montoOk && $('cPrioriza').value && $('cCompetencia').value && $('cProximoPaso').value);
  }

  const score = cierreVisible ? scoreCierre : scoreInicial;
  $('gScoreVal').innerHTML = score + '<span>/100</span>';
  $('gScoreLbl').textContent = cierreVisible ? 'Score de cierre' : 'Score calculado';

  // Probabilidad: cierre apunta a Negociacion (tramo 50-90).
  let prob;
  if (cierreVisible && cierreCompleto) {
    prob = Math.round(50 + (90 - 50) * scoreCierre / 100);
  } else {
    const completo = t && i && ti && a && e;
    if (completo) prob = Math.round(25 + (55 - 25) * scoreInicial / 100);
    else prob = gLead ? gLead.probabilidad : 0;
  }
  $('gProbVal').textContent = (cierreVisible || gLead) ? prob + '%' : '—';
}

function colorEtapa(etapa) {
  const c = (typeof ETAPA_COLOR !== 'undefined' && ETAPA_COLOR[etapa]) || ['#EEF1F5', '#333'];
  return c[0];
}

// Marcar perdido: preselecciona el resultado de descarte disponible y enfoca el motivo.
function marcarPerdido() {
  const sel = $('gResultado');
  const opts = Array.from(sel.options).map(o => o.value);
  // En Reunion efectiva / Negociacion el descarte se llama "Desistió".
  const etapaAvanzada = gLead && ['Reunion efectiva - seguimiento','Cierre pendiente'].includes(gLead.etapa);
  let cierre;
  if (etapaAvanzada) {
    cierre = 'Desistio';
    if (!opts.includes('Desistio')) sel.add(new Option('Desistió', 'Desistio'));
  } else {
    cierre = ['Respondio - no interesado', 'Respondio - no califica'].find(v => opts.includes(v));
  }
  if (!cierre) { alert('Este lead no se puede desestimar desde su etapa actual.'); return; }
  modoPerdido = true;
  sel.value = cierre;
  sel.disabled = true; // resultado fijo en modo perdido
  ajustarCampos();
  $('gResumen').focus();
}

// True si las 5 variables de calificacion estan llenas en el modal ahora mismo.
function camposCalifLlenos() {
  const montoOk = ($('gNoDefineMonto') && $('gNoDefineMonto').checked) ||
    (montoARangoJS(montoVal('g')));
  return !!(montoOk && $('gTiempo').value && $('gInteres').value && $('gExperiencia').value && $('gExperienciaInv').value);
}

// True si las 5 preguntas del cierre estan respondidas (monto puede ser "No define").
function cierreCompleto() {
  const montoOk = ($('cNoDefineMonto') && $('cNoDefineMonto').checked) || montoARangoJS(montoVal('c'));
  return !!($('cFondos').value && montoOk && $('cPrioriza').value && $('cCompetencia').value && $('cProximoPaso').value);
}

// El monto numerico activo del bloque visible (1a calif o cierre). null si "No define".
function montoGestionActivo() {
  const cierreVisible = !$('secCierre').classList.contains('oculto');
  if (cierreVisible) {
    if ($('cNoDefineMonto').checked) return null;
    const v = montoVal('c');
    return v ? Math.round(v) : null;
  }
  if ($('gNoDefineMonto').checked) return null;
  const v = montoVal('g');
  return v ? Math.round(v) : null;
}
function noDefineActivo() {
  const cierreVisible = !$('secCierre').classList.contains('oculto');
  return cierreVisible ? $('cNoDefineMonto').checked : $('gNoDefineMonto').checked;
}
// Valida el monto del bloque visible. Devuelve mensaje de error o null si esta ok.
function validarMonto() {
  const cierreVisible = !$('secCierre').classList.contains('oculto');
  const input = cierreVisible ? $('cMontoNum') : $('gMonto');
  const chk = cierreVisible ? $('cNoDefineMonto') : $('gNoDefineMonto');
  // En modo solo gestion (perdido/descarte) o bloque calif oculto, no se valida.
  if (input.disabled || chk.checked) return null;
  if (!input.value || !input.offsetParent) return null; // vacio o no visible: no obliga aqui
  const n = montoVal(cierreVisible ? 'c' : 'g'); // lee sin comas
  if (!isFinite(n) || n < 10000) return 'El monto mínimo es S/ 10,000 (o marca "No define monto").';
  if (n > 1000000) return 'El monto máximo es S/ 1,000,000.';
  return null;
}

// Botones rapidos de fecha proxima accion.
// tipo: 'hoy'/'man' (hora fija), 'h' (mas N horas), 'd' (mas N dias 9am)
function setFecha(tipo, val) {
  const d = new Date();
  if (tipo === 'hoy') { d.setHours(val, 0, 0, 0); }
  else if (tipo === 'man') { d.setDate(d.getDate() + 1); d.setHours(val, 0, 0, 0); }
  else if (tipo === 'h') { d.setHours(d.getHours() + val, 0, 0, 0); }
  else if (tipo === 'd') { d.setDate(d.getDate() + val); d.setHours(9, 0, 0, 0); }
  // Saltar fin de semana
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  // Volcar a input datetime-local (formato YYYY-MM-DDTHH:MM en hora local)
  const p = n => String(n).padStart(2, '0');
  $('gFechaProx').value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  // Marcar visualmente el boton activo
  document.querySelectorAll('#gFechaRapida .chipf').forEach(b => b.classList.remove('act'));
  if (event && event.target) event.target.classList.add('act');
}

// Botones rapidos para la fecha de reunion
function setFechaReu(tipo, val) {
  const d = new Date();
  if (tipo === 'man') { d.setDate(d.getDate() + 1); d.setHours(val, 0, 0, 0); }
  else if (tipo === 'd') { d.setDate(d.getDate() + val); d.setHours(9, 0, 0, 0); }
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  const p = n => String(n).padStart(2, '0');
  $('gFechaReunion').value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  document.querySelectorAll('#gFechaReuRapida .chipf').forEach(b => b.classList.remove('act'));
  if (event && event.target) event.target.classList.add('act');
}

// Sugiere la fecha prox segun cadencia (mismo calculo del servidor, en preview)
function sugerirFechaProx() {
  // El servidor autocalcula si se deja vacio; aqui no forzamos nada.
}

async function guardarGestion() {
  const r = $('gResultado').value;
  const esDescarte = ['Numero invalido', 'Numero equivocado', 'Respondio - no interesado', 'Respondio - no califica', 'Desistio'].includes(r);
  // En modo perdido o descarte, el comentario (motivo) es obligatorio.
  if ((modoPerdido || esDescarte) && !$('gResumen').value.trim()) {
    $('gError').textContent = 'Escribe el motivo del descarte para poder guardar.';
    $('gError').classList.add('act');
    $('gResumen').focus();
    return;
  }
  // En Venta ganada, el comentario (como se cerro) es obligatorio.
  if (r === 'Venta ganada' && !$('gResumen').value.trim()) {
    $('gError').textContent = 'Escribe un comentario de cómo se cerró la venta para poder guardar.';
    $('gError').classList.add('act');
    $('gResumen').focus();
    return;
  }
  // Calificacion obligatoria (Respondió calificado / Agendó / modo kanban obligatorio).
  if (califObligatoria && !camposCalifLlenos()) {
    $('gError').textContent = 'Completa las 5 variables de Calificación del lead para poder guardar.';
    $('gError').classList.add('act');
    return;
  }
  // Validacion del monto numerico (1a calif y cierre): si hay valor, debe estar en rango.
  const errMonto = validarMonto();
  if (errMonto) {
    $('gError').textContent = errMonto;
    $('gError').classList.add('act');
    return;
  }
  // Si pasa a Negociacion (resultado En negociacion o check marcado), el cierre es obligatorio.
  const vaANegociacion = r === 'En negociacion' ||
    ($('gPasaNegociacion') && $('gPasaNegociacion').checked && !$('gPasaNegociacion').closest('.campoCheckNeg').classList.contains('oculto'));
  if (vaANegociacion && !cierreCompleto()) {
    $('gError').textContent = 'Completa las 5 preguntas de Calificación de cierre para pasar a Negociación.';
    $('gError').classList.add('act');
    return;
  }
  $('gGuardar').disabled = true;
  $('gError').classList.remove('act');
  try {
    const body = {
      codigo: gCodigo,
      canal: $('gCanal').value,
      resultado: $('gResultado').value,
      comentario: $('gResumen') ? ($('gResumen').value || null) : null,
      proximaAccion: $('gProxAccion').value || null,
      fechaProxAccion: $('gFechaProx').value ? new Date($('gFechaProx').value).toISOString() : null,
      ticket: (montoGestionActivo() ? montoARangoJS(montoGestionActivo()) : null),
      tiempo: $('gTiempo').value || null,
      nivelInteres: $('gInteres').value || null,
      experiencia: $('gExperiencia').value || null,
      experienciaInv: $('gExperienciaInv').value || null,
      montoGestion: montoGestionActivo(),
      noDefineMonto: noDefineActivo() ? 1 : 0,
      cFondos: $('cFondos').value || null,
      cPrioriza: $('cPrioriza').value || null,
      cPlazo: ($('cPrioriza').value === 'Plazo' ? ($('cPlazo').value || null) : null),
      cCompetencia: $('cCompetencia').value || null,
      cProximoPaso: $('cProximoPaso').value || null,
      fechaReunion: $('gFechaReunion').value ? new Date($('gFechaReunion').value).toISOString() : null,
      fechaCierreEstimada: $('gFechaCierre').value || null,
      tipoReunion: null,
      estadoReunion: $('gResultado').value === 'Reunion efectiva' ? 'Efectiva'
        : (['Agendo reunion','Confirmo reunion','Reprogramo reunion'].includes($('gResultado').value) ? 'Agendada' : null),
      closer: gLead.asesor || null,
      motivoPerdida: (modoPerdido || esDescarte) ? ($('gResumen').value || null) : null
    };
    await api('/api/gestiones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    // Si marcó el check "pasar a Negociación", registrar 2da gestion (En negociacion)
    // en el mismo guardado: el lead salta Reunion efectiva -> Negociacion. Trazabilidad
    // queda con ambos eventos.
    const pasaNeg = $('gPasaNegociacion') && $('gPasaNegociacion').checked && !$('gPasaNegociacion').closest('.campoCheckNeg').classList.contains('oculto');
    if (pasaNeg) {
      await api('/api/gestiones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: gCodigo,
          canal: $('gCanal').value,
          resultado: 'En negociacion',
          comentario: 'Pasa a negociación tras reunión efectiva.',
          proximaAccion: 'Enviar propuesta',
          fechaProxAccion: null,
          fechaCierreEstimada: $('gFechaCierre').value || null,
          closer: gLead.asesor || null
        })
      });
    }
    cerrar('ovGestion');
    cargarLeads();
  } catch (e) {
    $('gError').textContent = e.message;
    $('gError').classList.add('act');
  } finally {
    $('gGuardar').disabled = false;
  }
}

// ---------- Trazabilidad ----------
let tCodigoActual = null, tTelActual = '';
async function verTrazabilidad(codigo) {
  tCodigoActual = codigo;
  const t = await api('/api/leads/' + codigo + '/trazabilidad');
  tTelActual = t.telefono || (gLead && gLead.codigo === codigo ? gLead.telefono : '') || '';
  $('tTitulo').textContent = 'Trazabilidad — ' + t.nombre;
  // Chips cabecera
  const bg = colorEtapa(t.etapa);
  $('tChips').innerHTML =
    `<span class="dato">${t.codigo}</span><span class="sep">·</span>` +
    `<span class="chip-est" style="background:${bg};color:#333">${t.etapaVisible}</span>` +
    `<span class="chip-est" style="background:#EEF1F5;color:#555">Prioridad ${t.prioridad}</span>` +
    `<span class="sep">·</span><span class="dato"><b>Score ${t.score}/100</b></span>` +
    `<span class="sep">·</span><span class="dato">Prob. <b>${t.probabilidad}%</b></span>` +
    `<span class="sep">·</span><span class="dato">GP ${t.asesor || '—'}</span>`;

  // 4 tarjetas resumen
  const r = t.resumen;
  const venc = r.fechaProxAccion && new Date(r.fechaProxAccion) < new Date();
  const hoy = r.fechaProxAccion && fmtFecha(r.fechaProxAccion).slice(0,5) === fmtFecha(new Date().toISOString()).slice(0,5);
  $('tResumenCards').innerHTML = `
    <div class="tz-card"><span class="tz-ic azul">🕐</span><div><div class="tz-lbl">Última gestión</div><div class="tz-val">${r.ultimaGestion ? fmtFecha(r.ultimaGestion) : '—'}</div><div class="tz-sub">${tr(r.ultimoResultado || '')}</div></div></div>
    <div class="tz-card"><span class="tz-ic naranja">📅</span><div><div class="tz-lbl">Próxima acción</div><div class="tz-val">${r.proximaAccion || '—'}</div><div class="tz-sub">${r.fechaProxAccion ? fmtFecha(r.fechaProxAccion) : ''} ${venc ? '<span class="tz-pill rojo">Vencido</span>' : (hoy ? '<span class="tz-pill rosa">Hoy</span>' : '')}</div></div></div>
    <div class="tz-card"><span class="tz-ic verde">📞</span><div><div class="tz-lbl">Intentos</div><div class="tz-val">${r.intentos}</div><div class="tz-sub">${r.contactado ? 'Contacto logrado' : 'Sin contacto'}</div></div></div>
    <div class="tz-card"><span class="tz-ic morado">💰</span><div><div class="tz-lbl">Monto registrado</div><div class="tz-val">${fmtSoles(r.monto)}</div><div class="tz-sub">${r.ticket ? tr(r.ticket) : ''}</div></div></div>`;

  // Timeline
  const icoTipo = { creado: '👤', gestion: '📞', cambio: '⚑', proxima: '📅', llamada: '📞' };
  const colorTipo = { creado: 'verde', gestion: 'azul', cambio: 'verde', proxima: 'naranja', llamada: 'azul' };
  $('tEventos').innerHTML = t.eventos.map((e, i) => {
    const last = i === t.eventos.length - 1;
    let derecha = '';
    if (e.badge) derecha = `<span class="tz-pill ${e.badgeColor}">${e.badge}</span>`;
    else if (e.tipo === 'gestion' && e.score != null) derecha = `<span class="tz-pill azulito">Score ${e.score}</span> <span class="tz-pill azulito">Prob. ${e.probabilidad}%</span>`;
    else if (e.tipo === 'cambio' && e.evoEtapa) derecha = `<span class="tz-pill verdecito">${e.evoEtapa[0]} → ${e.evoEtapa[1]}</span>`;
    // Badge de gestion tardia (rojo) si aplica
    if (e.tardanza) derecha += ` <span class="tz-pill rojo">⏱ ${e.tardanza}</span>`;
    return `<div class="tz-ev">
      <div class="tz-ev-fecha">${fmtFechaDos(e.fecha)}</div>
      <div class="tz-ev-linea"><span class="tz-dot ${colorTipo[e.tipo]||'azul'}"></span>${last ? '' : '<span class="tz-rail"></span>'}</div>
      <div class="tz-ev-card">
        <div class="tz-ev-head"><span class="tz-ev-tipo ${colorTipo[e.tipo]||''}">${tipoLabel(e)}</span><span class="tz-ev-actor">${e.actor||''}</span></div>
        <div class="tz-ev-tit">${e.titulo}</div>
        ${e.sub ? `<div class="tz-ev-sub">${e.sub}</div>` : ''}
        ${derecha ? `<div class="tz-ev-badges">${derecha}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  // Estado actual
  const ea = t.estadoActual;
  $('tEstado').innerHTML = `
    <div class="tz-row"><span>Etapa</span><span class="chip-est" style="background:${colorEtapa(t.etapa)};color:#333">${ea.etapa}</span></div>
    <div class="tz-row"><span>Prioridad</span><span class="tz-pill gris">${ea.prioridad}</span></div>
    <div class="tz-row"><span>Probabilidad</span><span class="tz-prob"><b>${ea.probabilidad}%</b><span class="tz-bar"><span style="width:${ea.probabilidad}%"></span></span></span></div>
    <div class="tz-row"><span>Próxima acción</span><b>${ea.proximaAccion}</b></div>`;

  // Evolucion
  const ev = t.evolucion;
  $('tEvolucion').innerHTML = `
    <div class="tz-evo"><span>Etapa</span><span class="tz-pill gris">${ev.etapa[0]}</span><span class="tz-arrow">→</span><span class="chip-est" style="background:${colorEtapa(t.etapa)};color:#333">${ev.etapa[1]}</span></div>
    <div class="tz-evo"><span>Score</span><span class="tz-pill azulito">${ev.score[0]}</span><span class="tz-arrow">→</span><span class="tz-pill azulito">${ev.score[1]}</span></div>
    <div class="tz-evo"><span>Probabilidad</span><span class="tz-pill azulito">${ev.probabilidad[0]}%</span><span class="tz-arrow">→</span><span class="tz-pill azulito">${ev.probabilidad[1]}%</span></div>`;

  // Calificacion actual (inicial)
  const renderCal = c =>
    `<div class="tz-cal"><span class="tz-cal-ic">${c.ico}</span><span class="tz-cal-lbl">${c.etiqueta}</span><span class="tz-cal-val">${c.valor ? (c.crudo ? c.valor : tr(c.valor)) : '—'}</span><span class="tz-pill ${c.info ? 'gris' : (c.pts ? 'verdecito' : 'gris')}">${c.info ? 'info' : c.pts + ' pts'}</span></div>`;
  let calHtml = '<div class="tz-cal-tit">Calificación inicial' +
    (t.scores && t.scores.inicial != null ? ' <span class="tz-pill azulito">Score ' + t.scores.inicial + '</span>' : '') + '</div>' +
    t.calificacion.map(renderCal).join('');
  if (t.calificacionCierre) {
    calHtml += '<div class="tz-cal-tit" style="margin-top:12px;color:#8E44AD">Calificación de cierre' +
      (t.scores && t.scores.cierre != null ? ' <span class="tz-pill" style="background:#EEE0F5;color:#8E44AD">Score ' + t.scores.cierre + '</span>' : '') + '</div>' +
      t.calificacionCierre.map(renderCal).join('');
  }
  $('tCalif').innerHTML = calHtml;

  $('ovTraza').classList.add('act');
}
function tipoLabel(e) {
  const m = { creado: 'Lead creado', gestion: e.canal || 'Gestión', cambio: 'Cambio de etapa', proxima: 'Próxima acción', llamada: 'Llamada' };
  return m[e.tipo] || '';
}
// Fecha en dos lineas (dd/mm \n hh:mm) para el timeline
function fmtFechaDos(iso) {
  if (!iso) return '';
  const d = new Date(iso); const p = n => String(n).padStart(2,'0');
  return `<b>${p(d.getDate())}/${p(d.getMonth()+1)}</b><br>${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- Nuevo lead ----------
function abrirNuevoLead() {
  ['nNombre','nTeléfono','nEmail','nFuente','nAsesor'].forEach(id => $(id).value = '');
  $('nError').classList.remove('act');
  $('ovNuevo').classList.add('act');
}
async function crearLead() {
  $('nError').classList.remove('act');
  try {
    await api('/api/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: $('nNombre').value, telefono: $('nTeléfono').value,
        email: $('nEmail').value, fuente: $('nFuente').value || null,
        asesor: $('nAsesor').value || null
      })
    });
    cerrar('ovNuevo');
    ir('leads');
  } catch (e) {
    $('nError').textContent = e.message;
    $('nError').classList.add('act');
  }
}

// ---------- Leads Brutos (marketing) ----------
const ESTADO_BRUTO = {
  creado: ['Creado', '#1EBE57'],
  duplicado_activo: ['Duplicado activo', '#2D7FF9'],
  duplicado_perdido: ['Duplicado perdido', '#E6A100'],
  duplicado_ganado: ['Duplicado ganado', '#8E44AD'],
  incompleto: ['Incompleto', '#E6A100'],
  error_validacion: ['Error', '#E14B4B'],
  error_api: ['Error API', '#E14B4B'],
  descartado: ['Descartado', '#9AA3AD']
};

async function cargarBrutos() {
  $('brutosCont').innerHTML = '<div class="vacio">Cargando...</div>';
  try {
    const d = await api('/api/marketing/ingresos');
    const chips = Object.entries(d.resumen || {}).map(([est, n]) => {
      const meta = ESTADO_BRUTO[est] || [est, '#9AA3AD'];
      return '<span class="bchip" style="border-color:' + meta[1] + ';color:' + meta[1] + '">' + meta[0] + ': <b>' + n + '</b></span>';
    }).join('');
    $('brutosResumen').innerHTML = chips || '<span class="sub">Sin ingresos aún.</span>';

    if (!d.ingresos.length) { $('brutosCont').innerHTML = '<div class="vacio">Aún no han llegado leads de marketing.</div>'; return; }

    const filas = d.ingresos.map(i => {
      const meta = ESTADO_BRUTO[i.estado] || [i.estado, '#9AA3AD'];
      const fecha = i.fechaRecepcion ? fmtFecha(i.fechaRecepcion) : '';
      const leadLink = i.codigoLead
        ? '<a href="#" onclick="verLeadDesdeBruto(\'' + i.codigoLead + '\');return false">' + i.codigoLead + '</a>'
        : '<span class="sub">—</span>';
      return '<tr>' +
        '<td>' + fecha + '</td>' +
        '<td><span class="borigen">' + (i.origen || '') + '</span></td>' +
        '<td>' + (i.nombreRecibido || '<span class="sub">—</span>') + '</td>' +
        '<td>' + (i.telefonoRecibido || '<span class="sub">—</span>') + '</td>' +
        '<td>' + (i.emailRecibido || '<span class="sub">—</span>') + '</td>' +
        '<td>' + ((i.montoNumerico != null)
          ? 'S/ ' + Number(i.montoNumerico).toLocaleString('en-US') + (i.montoRangoCalc ? ' · ' + i.montoRangoCalc : '')
          : '<span class="sub">—</span>') + '</td>' +
        '<td>' + (i.campana || '<span class="sub">—</span>') + '</td>' +
        '<td><span class="bestado" style="background:' + meta[1] + '">' + meta[0] + '</span>' +
          (i.mensajeError ? '<div class="berror">' + i.mensajeError + '</div>' : '') + '</td>' +
        '<td>' + leadLink + '</td>' +
        '<td class="bacc">' + accionesBruto(i) + '</td>' +
      '</tr>';
    }).join('');

    $('brutosCont').innerHTML = '<table class="tabla btabla"><thead><tr>' +
      '<th>Fecha</th><th>Origen</th><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Monto</th><th>Campaña</th><th>Estado</th><th>Lead</th><th>Acciones</th>' +
      '</tr></thead><tbody>' + filas + '</tbody></table>';
  } catch (e) {
    $('brutosCont').innerHTML = '<div class="vacio">Error al cargar: ' + e.message + '</div>';
  }
}

function accionesBruto(i) {
  let btns = '<button class="bbtn" onclick="verRawBruto(' + i.id + ')" title="Ver JSON crudo">JSON</button>';
  if (['incompleto', 'error_validacion', 'error_api', 'duplicado_perdido', 'duplicado_ganado'].includes(i.estado)) {
    btns += '<button class="bbtn azul" onclick="reprocesarBruto(' + i.id + ')">Reprocesar</button>';
    btns += '<button class="bbtn verde" onclick="crearLeadBruto(' + i.id + ')">Crear lead</button>';
  }
  if (i.estado !== 'descartado') {
    btns += '<button class="bbtn gris" onclick="descartarBruto(' + i.id + ')">Descartar</button>';
  }
  return btns;
}

async function verRawBruto(id) {
  try {
    const i = await api('/api/marketing/ingresos/' + id);
    let pretty = i.rawJson;
    try { pretty = JSON.stringify(JSON.parse(i.rawJson), null, 2); } catch (e) {}
    alert('JSON recibido (ingreso #' + id + '):\n\n' + pretty);
  } catch (e) { alert('Error: ' + e.message); }
}
async function reprocesarBruto(id) {
  try { await api('/api/marketing/ingresos/' + id + '/reprocesar', { method: 'POST' }); cargarBrutos(); }
  catch (e) { alert('Error al reprocesar: ' + e.message); }
}
async function descartarBruto(id) {
  if (!confirm('¿Descartar este ingreso? No creará lead.')) return;
  try {
    await api('/api/marketing/ingresos/' + id + '/descartar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: 'Descartado manualmente' })
    });
    cargarBrutos();
  } catch (e) { alert('Error: ' + e.message); }
}
async function crearLeadBruto(id) {
  if (!confirm('¿Crear un lead operativo desde este ingreso?')) return;
  try {
    const r = await api('/api/marketing/ingresos/' + id + '/crear-lead', { method: 'POST' });
    alert('Lead creado: ' + r.codigoLead);
    cargarBrutos();
  } catch (e) { alert('Error: ' + e.message); }
}
function verLeadDesdeBruto(codigo) {
  ir('leads');
  setTimeout(() => verTrazabilidad(codigo), 300);
}

// ---------- Dashboard ----------
async function cargarCohortes() {
  const data = await api('/api/cohortes');
  const cont = $('cohortesCont');
  if (!data.length) { cont.innerHTML = '<div class="vacio">Aun no hay leads asignados para formar cohortes.</div>'; return; }
  const fmtMes = m => {
    const [a, mm] = m.split('-');
    const meses = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return meses[parseInt(mm)] + ' ' + a;
  };
  cont.innerHTML = data.map(c => {
    const filas = c.embudo.map(e =>
      '<div class="embudo-fila">' +
        '<span class="nom" style="width:210px">' + tr(e.etapa) + '</span>' +
        '<div class="bar"><i style="width:' + e.pct + '%;background:var(--azul)"></i></div>' +
        '<span class="num">' + e.cantidad + '</span>' +
        '<span style="width:46px;text-align:right;color:var(--muted);font-size:12px">' + e.pct + '%</span>' +
      '</div>'
    ).join('');
    const dias = c.diasPromedioCierre !== null ? c.diasPromedioCierre + ' dias' : '\u2014';
    return '<div class="panel" style="margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:10px">' +
        '<h3 style="margin:0">Cohorte ' + fmtMes(c.mes) + '</h3>' +
        '<span class="kpi" style="padding:6px 12px"><b style="font-size:16px">' + c.total + '</b> leads</span>' +
        '<span class="kpi" style="padding:6px 12px;color:var(--verde)"><b style="font-size:16px">' + c.ganados + '</b> ganados (' + c.tasaGanados + '%)</span>' +
        '<span class="kpi" style="padding:6px 12px;color:var(--rojo)"><b style="font-size:16px">' + c.perdidos + '</b> perdidos</span>' +
        '<span class="kpi" style="padding:6px 12px">Cierre prom: <b>' + dias + '</b></span>' +
      '</div>' + filas +
    '</div>';
  }).join('');
}

async function cargarDashboard() {
  const d = await api('/api/dashboard');
  const fmtS = n => 'S/ ' + Math.round(n || 0).toLocaleString('es-PE');

  // Salud del dia: 6 tarjetas
  const s = d.salud;
  const salud = [
    { ic: '👥', cls: 'azul', v: s.leadsActivos, l: 'Leads activos', sub: 'Abiertos en gestión' },
    { ic: '🕐', cls: 'rojo', v: s.vencidos, l: 'Vencidos', sub: 'Acciones atrasadas' },
    { ic: '📋', cls: 'azul', v: s.gestionadosHoy, l: 'Gestionados hoy', sub: 'Leads trabajados' },
    { ic: '📅', cls: 'celeste', v: s.agendadosHoy, l: 'Agendados hoy', sub: 'Reuniones pactadas' },
    { ic: '🏆', cls: 'verde', v: s.ganados, l: 'Ganados', sub: 'Cierres del día' },
    { ic: '💰', cls: 'morado', v: fmtS(d.pipelineTotal), l: 'Pipeline total', sub: 'Monto en embudo', grande: true }
  ];
  $('dbSalud').innerHTML = salud.map(c =>
    `<div class="db-card">
      <span class="db-ic ${c.cls}">${c.ic}</span>
      <div class="db-val ${c.grande ? 'sm' : ''}">${c.v}</div>
      <div class="db-lbl">${c.l}</div>
      <div class="db-sub">${c.sub}</div>
    </div>`
  ).join('');

  // Embudo comercial (sin prob.prom ni pipeline ponderado)
  $('dbEmbudo').innerHTML = d.embudo.map(e => {
    const [bg, fg] = ETAPA_COLOR[e.etapa] || ['#EEE', '#333'];
    let obs = '—';
    if (e.etapa === 'Contactabilidad 3x5' && e.cantidad >= 4) obs = '<span class="db-obs">⚠ Alto volumen sin contacto</span>';
    return `<tr>
      <td><span class="db-et" style="background:${bg};color:${fg}">${trEtapa(e.etapa)}</span></td>
      <td>${e.cantidad}</td>
      <td>${fmtS(e.monto)}</td>
      <td>${obs}</td>
    </tr>`;
  }).join('') +
    `<tr class="db-total"><td><b>Total</b></td><td><b>${d.embudo.reduce((a,e)=>a+e.cantidad,0)}</b></td><td><b>${fmtS(d.pipelineTotal)}</b></td><td>—</td></tr>`;

  // Alertas operativas
  const icoNivel = { rojo: '⚠', naranja: '👥', azul: '📅', verde: '✓' };
  $('dbAlertas').innerHTML = d.alertas.map(a =>
    `<div class="db-alerta">
      <span class="db-al-ic ${a.color}">${icoNivel[a.color] || 'ℹ'}</span>
      <span class="db-al-badge ${a.color}">${a.nivel}</span>
      <div class="db-al-txt"><div class="db-al-tit">${a.titulo}</div><div class="db-al-sub">${a.sub}</div></div>
      <button class="db-al-btn" onclick="irACola('${a.cola}')">Ver cola</button>
    </div>`
  ).join('');

  // Proyeccion de cierres (forecast)
  if (!d.forecast || !d.forecast.items.length) {
    $('dbForecast').innerHTML = '<div class="vacio" style="padding:18px 0">Aún no hay leads con fecha estimada de cierre.<br><span style="font-size:11.5px">Defínela al registrar una gestión en Reunión efectiva o Negociación.</span></div>';
  } else {
    $('dbForecast').innerHTML =
      `<div class="fc-total">Proyección total: <b>${fmtS(d.forecast.total)}</b> en ${d.forecast.items.length} ${d.forecast.items.length===1?'lead':'leads'}</div>` +
      d.forecast.periodos.map(p =>
        `<div class="fc-periodo"><span class="fc-per-lbl">${p.etiqueta}</span><span class="fc-per-val">${fmtS(p.monto)}</span><span class="fc-per-n">${p.cantidad} ${p.cantidad===1?'lead':'leads'}</span></div>`
      ).join('') +
      '<div class="fc-lista">' + d.forecast.items.map(it =>
        `<div class="fc-item"><span class="fc-nom">${it.nombre}</span><span class="fc-et">${trEtapa(it.etapa)}</span><span class="fc-fecha">${fmtFecha(it.fecha).slice(0,5)}</span><span class="fc-monto">${fmtS(it.monto)}</span></div>`
      ).join('') + '</div>';
  }

  // Productividad por GP
  const estadoCls = { 'En riesgo': 'rojo', 'Atención': 'naranja', 'Al día': 'verde' };
  $('dbGP').innerHTML = d.porAsesor.map(a =>
    `<tr>
      <td><b>${a.asesor}</b></td>
      <td><span class="db-estado ${estadoCls[a.estado]}">${a.estado}</span></td>
      <td>${a.activos}</td><td>${a.gestHoy}</td>
      <td class="${a.vencidos>0?'vencida':''}">${a.vencidos}</td>
      <td>${a.agendados}</td><td>${a.ganados}</td>
      <td><span class="db-prob"><b>${a.cumplimiento}%</b><span class="db-bar"><span style="width:${a.cumplimiento}%;background:var(--azul)"></span></span></span></td>
    </tr>`
  ).join('') || '<tr><td colspan="8" class="vacio">Sin datos.</td></tr>';
}

// Ir a la cola filtrada desde una alerta del dashboard
function irACola(tipo) {
  ir('leads');
  const fp = $('fPrioridad'), fe = $('fEtapa');
  if (fp) fp.value = '';
  if (fe) fe.value = '';
  if (tipo === 'porcontactar' && fe) fe.value = 'Contactabilidad 3x5';
  if (tipo === 'negociacion' && fe) fe.value = 'Cierre pendiente';
  render();
}


// ---------- Archivar / Auditoria ----------
async function archivarLead(codigo, nombre) {
  if (!confirm('Archivar el lead "' + nombre + '"?\nSaldra de la lista pero quedara guardado y se puede restaurar desde Auditoria.')) return;
  try {
    await api('/api/leads/' + codigo + '/archivar', { method: 'PUT' });
    cargarLeads();
  } catch (e) { alert(e.message); }
}

// Descarga el backup de la base (crm.db) abriendo el endpoint protegido.
function descargarBackup() {
  window.location.href = '/api/backup';
}

async function cargarAuditoria() {
  // Archivados
  const arch = await api('/api/leads-archivados');
  const ta = $('tbodyArchivados');
  ta.innerHTML = arch.length ? arch.map(l =>
    '<tr><td style="font-size:11.5px">' + l.codigo + '</td><td><b>' + l.nombre + '</b></td>' +
    '<td>' + (l.telefono||'') + '</td><td>' + (l.asesor||'\u2014') + '</td><td>' + l.etapa + '</td>' +
    '<td><button class="btn sec" style="padding:3px 9px;font-size:11px" onclick="restaurarLead(\'' + l.codigo + '\')">Restaurar</button> ' +
    '<button class="btn" style="padding:3px 9px;font-size:11px;background:var(--rojo)" onclick="eliminarLead(\'' + l.codigo + '\',\'' + l.nombre.replace(/'/g,'') + '\')">Eliminar definitivo</button></td></tr>'
  ).join('') : '<tr><td colspan="6" class="vacio">No hay leads archivados.</td></tr>';

  // Registro de actividad
  const q = [];
  if ($('aFiltroUsuario').value) q.push('usuario=' + encodeURIComponent($('aFiltroUsuario').value));
  if ($('aFiltroAccion').value) q.push('accion=' + encodeURIComponent($('aFiltroAccion').value));
  const audit = await api('/api/auditoria' + (q.length ? '?' + q.join('&') : ''));
  // poblar filtro de usuarios una vez
  const fu = $('aFiltroUsuario');
  if (fu.options.length <= 1) {
    [...new Set(audit.map(a => a.usuario))].forEach(u => fu.add(new Option(u, u)));
  }
  const tb = $('tbodyAuditoria');
  tb.innerHTML = audit.length ? audit.map(a =>
    '<tr><td style="font-size:12px;white-space:nowrap">' + fmtFechaHora(a.fecha) + '</td>' +
    '<td>' + (a.nombre || a.usuario) + '</td><td><b>' + a.accion + '</b></td>' +
    '<td style="font-size:11.5px">' + (a.objetivo || '') + '</td><td>' + (a.detalle || '') + '</td></tr>'
  ).join('') : '<tr><td colspan="5" class="vacio">Sin actividad registrada.</td></tr>';
}

async function restaurarLead(codigo) {
  try { await api('/api/leads/' + codigo + '/restaurar', { method: 'PUT' }); cargarAuditoria(); }
  catch (e) { alert(e.message); }
}

async function eliminarLead(codigo, nombre) {
  if (!confirm('ELIMINAR DEFINITIVAMENTE a "' + nombre + '"?\n\nEsto borra el lead y TODAS sus gestiones. NO se puede deshacer.')) return;
  if (!confirm('Confirma una vez mas: esta accion es irreversible.')) return;
  try { await api('/api/leads/' + codigo, { method: 'DELETE' }); cargarAuditoria(); }
  catch (e) { alert(e.message); }
}

function fmtFechaHora(iso) {
  if (!iso) return '';
  const d = new Date(iso); const p = n => String(n).padStart(2,'0');
  return p(d.getDate()) + '/' + p(d.getMonth()+1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

window.addEventListener('scroll', () => {
  $('btnArriba').classList.toggle('ver', window.scrollY > 300);
});

init();
