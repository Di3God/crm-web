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
  'Contactabilidad 3x5': 'Por contactar',
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
async function desbloquearLogin() {
  const usuario = $('cUsuario').value;
  if (!usuario) return;
  try {
    const r = await api('/api/desbloquear-login', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ usuario }) });
    alert('Accesos desbloqueados para ' + usuario + (r.registros ? '' : ' (no tenía bloqueos activos).'));
  } catch (e) { $('cError').textContent = e.message; $('cError').classList.add('act'); }
}

async function abrirAutoasig() {
  $('ovAutoasig').classList.add('act');
  $('autoasigLista').innerHTML = '<div class="vacio">Cargando...</div>';
  try {
    const d = await api('/api/gestoras');
    $('autoasigLista').innerHTML = d.gestoras.map(g => {
      const on = Number(g.autoasignar) === 1;
      const rkOn = Number(g.rankingVisible) === 1;
      const inact = Number(g.activo) !== 1 ? ' <span class="sub">(cuenta inactiva)</span>' : '';
      return '<div class="aa-row">' +
        '<div><b>' + g.nombre + '</b>' + inact + '<div class="sub">' + g.usuario + '</div></div>' +
        '<div style="display:flex;gap:6px">' +
        '<button class="aa-toggle ' + (on ? 'on' : 'off') + '" onclick="toggleAutoasig(\'' + g.usuario + '\',' + (on ? 0 : 1) + ')">' +
        (on ? 'Recibe leads' : 'En pausa') + '</button>' +
        '<button class="aa-toggle ' + (rkOn ? 'on' : 'off') + '" onclick="toggleRankingGP(\'' + g.usuario + '\',' + (rkOn ? 0 : 1) + ')">' +
        (rkOn ? '🏆 En ranking' : '🏆 Oculta') + '</button>' +
        '</div>' +
      '</div>';
    }).join('') +
    (d.ultimoAsignado ? '<div class="sub" style="margin-top:10px">Último lead asignado a: <b>' + d.ultimoAsignado + '</b></div>' : '');
  } catch (e) { $('autoasigLista').innerHTML = '<div class="vacio">Error al cargar.</div>'; }
}
async function toggleAutoasig(usuario, val) {
  try {
    await api('/api/gestoras/' + encodeURIComponent(usuario) + '/autoasignar',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor: val }) });
    abrirAutoasig();
  } catch (e) { alert('Error al actualizar.'); }
}
async function toggleRankingGP(usuario, val) {
  try {
    await api('/api/gestoras/' + encodeURIComponent(usuario) + '/ranking',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor: val }) });
    abrirAutoasig();
  } catch (e) { alert('Error al actualizar.'); }
}

// ---------- Metas comerciales ----------
const MT_METRICAS = [
  { k: 'asignados',   lbl: 'Leads asignados',     corto: 'Asign.' },
  { k: 'calificados', lbl: 'Calificados',         corto: 'Calif.' },
  { k: 'agendados',   lbl: 'Agendados',           corto: 'Agend.' },
  { k: 'reuniones',   lbl: 'Reuniones efectivas', corto: 'Reun.' },
  { k: 'cierres',     lbl: 'Cierres ganados',     corto: 'Cierres' },
];
let MT_DH_MES = 26;

function mtISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function mtLabelDia(d) { const n = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']; return n[d.getDay()] + ' ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); }
// Dias habiles (lun-sab) desde manana hasta el sabado de esa semana.
function mtDiasSemana() {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const manana = new Date(hoy); manana.setDate(manana.getDate() + 1);
  const fin = new Date(manana); fin.setDate(fin.getDate() + ((6 - manana.getDay() + 7) % 7));
  const dias = []; const d = new Date(manana);
  while (d <= fin) { if (d.getDay() !== 0) dias.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return dias;
}

function abrirMetas() {
  const sel = $('mtAsesor');
  sel.innerHTML = ['Mafer Lujan', 'Breezy Ortega', 'Lourdes Villavicencio', 'Dora Barreto']
    .map(g => '<option>' + g + '</option>').join('');
  const now = new Date();
  $('mtMes').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  $('mtError').classList.remove('act');
  $('ovMetas').classList.add('act');
  cargarMetas();
}

async function cargarMetas() {
  const asesor = $('mtAsesor').value, mes = $('mtMes').value;
  if (!asesor || !mes) return;
  try {
    const d = await api('/api/metas?asesor=' + encodeURIComponent(asesor) + '&mes=' + encodeURIComponent(mes));
    MT_DH_MES = d.diasHabilesMes || 26;
    renderMensual(d.mensual);
    renderSemana(d.diario);
  } catch (e) { $('mtError').textContent = e.message; $('mtError').classList.add('act'); }
}

function renderMensual(mensual) {
  mensual = mensual || {};
  let h = '';
  MT_METRICAS.forEach((m, i) => {
    const v = mensual[m.k] != null ? mensual[m.k] : '';
    h += '<div class="mt-row"><span class="mt-lbl">' + m.lbl + '</span>' +
      '<input type="number" min="0" id="mtm_' + m.k + '" value="' + v + '" oninput="mtNumEdit(\'' + m.k + '\')" style="width:84px">';
    if (i === 0) {
      h += '<span style="width:118px"></span>';
    } else {
      h += '<input type="number" min="0" max="100" id="mtp_' + m.k + '" class="mt-pct" placeholder="%" oninput="mtPctEdit(\'' + m.k + '\')">' +
        '<span class="mt-pct-lbl"> % de ' + MT_METRICAS[i - 1].corto.replace('.', '').toLowerCase() + '</span>';
    }
    h += '<span class="mt-prorr" id="mtpr_' + m.k + '" style="margin-left:10px"></span></div>';
  });
  const vm = mensual.monto != null ? mensual.monto : '';
  h += '<div class="mt-row"><span class="mt-lbl">Monto de cierre (S/)</span>' +
    '<input type="number" min="0" id="mtm_monto" value="' + vm + '" style="width:120px"></div>';
  $('mtMensual').innerHTML = h;
  MT_METRICAS.forEach(m => mtProrr(m.k));
}
// Cascada: cada % se aplica sobre el NÚMERO de la etapa anterior (no sobre el total).
function mtCascada() {
  let prev = Number($('mtm_asignados').value) || 0;
  mtProrr('asignados');
  for (let i = 1; i < MT_METRICAS.length; i++) {
    const k = MT_METRICAS[i].k;
    const pctEl = $('mtp_' + k);
    const pct = pctEl ? pctEl.value : '';
    if (pct !== '') {
      const num = Math.round(prev * (Number(pct) || 0) / 100);
      $('mtm_' + k).value = num;
      prev = num;
    } else {
      prev = Number($('mtm_' + k).value) || 0;
    }
    mtProrr(k);
  }
}
function mtPctEdit(k) { mtCascada(); }
function mtNumEdit(k) { const p = $('mtp_' + k); if (p) p.value = ''; mtCascada(); }
function mtProrr(k) {
  const el = $('mtm_' + k); if (!el) return;
  const v = Number(el.value) || 0, dh = MT_DH_MES || 26;
  const dia = v > 0 ? Math.max(1, Math.round(v / dh)) : 0;
  const sem = v > 0 ? Math.max(1, Math.round(v / dh * 6)) : 0;
  const sp = $('mtpr_' + k); if (sp) sp.textContent = v > 0 ? ('≈ ' + dia + ' / día · ' + sem + ' / semana') : '';
}

let MT_VAL = {};      // { iso: { etapa: valor } } fuente de verdad de la grilla diaria
let MT_EXP = {};      // { semanaIdx: bool } semanas expandidas
let MT_SEMANAS = [];  // semanas del periodo restante

function mtLabelCorto(d) { return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); }

// Dias habiles (lun-sab) desde manana (o dia 1 si el mes es futuro) hasta fin de mes.
function mtDiasRestantes(mes) {
  const [y, m] = mes.split('-').map(Number);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const manana = new Date(hoy); manana.setDate(manana.getDate() + 1);
  const ini = new Date(y, m - 1, 1);
  const desde = manana > ini ? manana : ini;
  const fin = new Date(y, m, 0);
  const dias = []; const d = new Date(desde);
  while (d <= fin) { if (d.getDay() !== 0) dias.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return dias;
}
function mtAgruparSemanas(dias) {
  const semanas = [], byKey = {};
  dias.forEach(d => {
    const lunes = new Date(d); lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
    const key = mtISO(lunes);
    if (byKey[key] == null) { byKey[key] = semanas.length; semanas.push({ idx: semanas.length, dias: [] }); }
    semanas[byKey[key]].dias.push(d);
  });
  semanas.forEach((s, i) => { s.label = 'Sem ' + (i + 1); s.rango = mtLabelCorto(s.dias[0]) + '–' + mtLabelCorto(s.dias[s.dias.length - 1]); });
  return semanas;
}
// Prorrateo por dia = meta mensual / dias habiles restantes (min 1).
// Prorrateo EXACTO por dia = meta mensual / dias habiles restantes (sin redondear).
function mtProrrateoDia(k) {
  const nDias = mtDiasRestantes($('mtMes').value).length || 1;
  const meta = Number(($('mtm_' + k) || {}).value) || 0;
  return meta > 0 ? meta / nDias : 0;
}
// Display: minimo 1 visual cuando hay valor; vacio si 0.
function mtMostrar(v) { v = Number(v) || 0; return v > 0 ? Math.max(1, Math.round(v)) : ''; }

function renderSemana(diario) {
  diario = diario || {};
  MT_VAL = {}; MT_EXP = {};
  Object.keys(diario).forEach(iso => { MT_VAL[iso] = Object.assign({}, diario[iso]); });
  MT_SEMANAS = mtAgruparSemanas(mtDiasRestantes($('mtMes').value));
  $('mtSemana').innerHTML = '<div id="mtGrid"></div>';
  renderGridSemanas();
}

function renderGridSemanas() {
  let h = '<div style="overflow-x:auto"><table class="mt-tabla"><thead><tr><th>Etapa</th>';
  MT_SEMANAS.forEach(s => {
    const flecha = MT_EXP[s.idx] ? ' ▾' : ' ▸';
    const span = MT_EXP[s.idx] ? ' colspan="' + s.dias.length + '"' : '';
    h += '<th' + span + '><button class="mt-wk" onclick="mtToggleSemana(' + s.idx + ')">' + s.label + flecha + '</button></th>';
  });
  h += '</tr><tr><th></th>';
  MT_SEMANAS.forEach(s => {
    if (MT_EXP[s.idx]) s.dias.forEach(d => h += '<th class="mt-sub">' + mtLabelCorto(d) + '</th>');
    else h += '<th class="mt-sub">' + s.rango + '</th>';
  });
  h += '</tr></thead><tbody>';
  MT_METRICAS.forEach(m => {
    h += '<tr><td>' + m.lbl + '</td>';
    MT_SEMANAS.forEach(s => {
      if (MT_EXP[s.idx]) {
        s.dias.forEach(d => {
          const iso = mtISO(d);
          const v = (MT_VAL[iso] && MT_VAL[iso][m.k] != null) ? mtMostrar(MT_VAL[iso][m.k]) : '';
          h += '<td><input type="number" min="0" value="' + v + '" oninput="mtSetDia(\'' + iso + '\',\'' + m.k + '\',this.value)" style="width:48px"></td>';
        });
      } else {
        let sum = 0; s.dias.forEach(d => { sum += Number((MT_VAL[mtISO(d)] || {})[m.k]) || 0; });
        h += '<td style="color:var(--muted)">' + (sum > 0 ? Math.round(sum) : '·') + '</td>';
      }
    });
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  $('mtGrid').innerHTML = h;
}
function mtSetDia(iso, k, val) { MT_VAL[iso] = MT_VAL[iso] || {}; if (val === '') delete MT_VAL[iso][k]; else MT_VAL[iso][k] = Number(val) || 0; }
function mtToggleSemana(idx) { MT_EXP[idx] = !MT_EXP[idx]; renderGridSemanas(); }

function aplicarBaseSemana() {
  const dias = mtDiasRestantes($('mtMes').value);
  MT_METRICAS.forEach(m => {
    const base = mtProrrateoDia(m.k);
    if (!base) return;
    dias.forEach(d => { const iso = mtISO(d); (MT_VAL[iso] = MT_VAL[iso] || {})[m.k] = base; });
  });
  renderGridSemanas();
}

async function mtPost(asesor, filas, okMsg) {
  $('mtError').classList.remove('act');
  try {
    const r = await api('/api/metas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asesor, filas }) });
    alert(okMsg + (r && r.guardadas != null ? ' (' + r.guardadas + ')' : ''));
  } catch (e) { $('mtError').textContent = e.message; $('mtError').classList.add('act'); }
}
function mtMensualCompleta() {
  for (const m of MT_METRICAS) { if (!(Number($('mtm_' + m.k).value) > 0)) return false; }
  return Number($('mtm_monto').value) > 0;
}
function mtDiariaCompleta() {
  const dias = mtDiasRestantes($('mtMes').value);
  if (!dias.length) return true;
  for (const d of dias) {
    const iso = mtISO(d);
    for (const m of MT_METRICAS) { if ((MT_VAL[iso] || {})[m.k] == null) return false; }
  }
  return true;
}
function mtAviso(msg) { $('mtError').textContent = msg; $('mtError').classList.add('act'); }

async function guardarMetas() {
  const asesor = $('mtAsesor').value, mes = $('mtMes').value;
  if (!asesor || !mes) return;
  $('mtError').classList.remove('act');
  if (!mtMensualCompleta()) { mtAviso('Completa todas las metas mensuales (incluido el monto) antes de guardar.'); return; }
  if (!mtDiariaCompleta()) { mtAviso('Faltan metas diarias. Usa "Aplicar prorrateo del mes" o llena los días pendientes.'); return; }
  const filas = MT_METRICAS.map(m => ({ ambito: 'mensual', periodo: mes, metrica: m.k, valor: Number($('mtm_' + m.k).value) || 0 }));
  filas.push({ ambito: 'mensual', periodo: mes, metrica: 'monto', valor: Number($('mtm_monto').value) || 0 });
  Object.keys(MT_VAL).forEach(iso => {
    MT_METRICAS.forEach(m => { if (MT_VAL[iso][m.k] != null) filas.push({ ambito: 'diario', periodo: iso, metrica: m.k, valor: Number(MT_VAL[iso][m.k]) || 0 }); });
  });
  mtPost(asesor, filas, 'Metas guardadas.');
}
async function copiarMesAnterior() {
  const asesor = $('mtAsesor').value, mes = $('mtMes').value; if (!asesor || !mes) return;
  const [y, m] = mes.split('-').map(Number);
  const prev = m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0');
  try {
    const d = await api('/api/metas?asesor=' + encodeURIComponent(asesor) + '&mes=' + prev);
    renderMensual(d.mensual);
    alert('Metas de ' + prev + ' copiadas. Revisa y guarda.');
  } catch (e) { $('mtError').textContent = e.message; $('mtError').classList.add('act'); }
}

// ---------- Menú desplegable del usuario ----------
function toggleMenuUsuario(e) { if (e) e.stopPropagation(); $('tuMenu').classList.toggle('oculto'); }
function cerrarMenuUsuario() { $('tuMenu').classList.add('oculto'); }
document.addEventListener('click', function (e) {
  const menu = $('tuMenu'), btn = $('tuBtn');
  if (menu && !menu.classList.contains('oculto') && !menu.contains(e.target) && btn && !btn.contains(e.target)) menu.classList.add('oculto');
});

// ---------- Ver metas cargadas (vista de consulta) ----------
function abrirVerMetas() {
  const now = new Date();
  $('vmMes').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  $('vmError').classList.remove('act');
  $('ovVerMetas').classList.add('act');
  verMetas();
}
async function verMetas() {
  const mes = $('vmMes').value; if (!mes) return;
  try {
    const d = await api('/api/metas/resumen?mes=' + encodeURIComponent(mes));
    const gps = ['Mafer Lujan', 'Breezy Ortega', 'Lourdes Villavicencio', 'Dora Barreto'];
    const cols = MT_METRICAS.concat([{ k: 'monto', corto: 'Monto' }]);
    const fmt = (c, v) => v == null ? '·' : (c.k === 'monto' ? 'S/ ' + Number(v).toLocaleString('es-PE') : v);
    let h = '<div style="overflow-x:auto"><table class="mt-tabla"><thead><tr><th>Gestor</th>';
    cols.forEach(c => h += '<th class="mt-sub">' + c.corto + '</th>');
    h += '</tr></thead><tbody>';
    const suma = {};
    gps.forEach(a => {
      const m = d.asesores[a] || {};
      h += '<tr><td>' + a + '</td>';
      cols.forEach(c => { if (m[c.k] != null) suma[c.k] = (suma[c.k] || 0) + Number(m[c.k]); h += '<td>' + fmt(c, m[c.k]) + '</td>'; });
      h += '</tr>';
    });
    h += '<tr class="mt-suma"><td>Equipo (jefa)</td>';
    cols.forEach(c => h += '<td>' + fmt(c, suma[c.k]) + '</td>');
    h += '</tr></tbody></table></div>';
    $('vmTabla').innerHTML = h;
  } catch (e) { $('vmError').textContent = e.message; $('vmError').classList.add('act'); }
}

// ---------- Inicio ----------
async function init() {
  try { YO = await api('/api/me'); cerrar('ovLogin'); await arrancar(); }
  catch (e) { /* sin sesion: queda el login visible */ }
}
async function arrancar() {
  $('rolBox').style.display = 'flex';
  if ($('acFab')) $('acFab').classList.remove('oculto'); // mostrar teléfono Aircall tras login
  iniciarTira(); // tira de ranking en Mis Leads
  const etiquetaRol = { admin: 'Administrador', jefa: 'Jefa de Ventas', gestora: 'GP', asistente_creditos: 'Asistente de Créditos', funcionario_b2b: 'Funcionario B2B', jefe_creditos: 'Jefe de Créditos', jefe_b2b: 'Jefe B2B' };
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
  // Módulo B2B: admin, jefa, asistente, funcionario y jefes B2B.
  if (['admin', 'jefa', 'asistente_creditos', 'funcionario_b2b', 'jefe_creditos', 'jefe_b2b'].includes(YO.rol)) {
    document.querySelectorAll('.soloB2B').forEach(e => e.classList.remove('oculto'));
  }
  // Gestión del equipo B2B (pestaña Equipo): admin y jefes B2B.
  if (['admin', 'jefe_creditos', 'jefe_b2b'].includes(YO.rol)) {
    document.querySelectorAll('.soloJefeB2B').forEach(e => e.classList.remove('oculto'));
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
  initFlatpickr();
  cargarLeads();
}

// Inicializa los selectores de fecha/hora (Flatpickr) en español. Se ejecuta 1 vez.
let FP = {};
function initFlatpickr() {
  if (typeof flatpickr === 'undefined' || FP._done) return;
  if (flatpickr.l10ns && flatpickr.l10ns.es) flatpickr.localize(flatpickr.l10ns.es);
  const dOpts  = { dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/Y', allowInput: true };
  const dtOpts = { enableTime: true, time_24hr: true, dateFormat: 'Y-m-d\\TH:i', altInput: true, altFormat: 'd/m/Y H:i', allowInput: true };
  ['fDesde','fHasta','rlDesde','rlHasta','gFechaCierre'].forEach(id => { if ($(id)) FP[id] = flatpickr('#' + id, dOpts); });
  ['gFechaReunion','gFechaProx'].forEach(id => { if ($(id)) FP[id] = flatpickr('#' + id, dtOpts); });
  FP._done = true;
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
  if (v === 'releads') cargarReleads();
  if (v === 'chat') cargarChat();
  if (v === 'leads') cargarLeads();
  if (v === 'b2b') b2bRefrescar();
}

function cerrar(id) { $(id).classList.remove('act'); }

// ---------- Mis Leads ----------
let LEADS = [], ordenCampo = 'prioridad', ordenDir = 1;

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
  const ORDEN_FE = ['Contactabilidad 3x5', 'Contactado - por calificar', 'Calificado - pendiente agendar', 'Agendado - pendiente reunion', 'Reunion efectiva - seguimiento', 'Cierre pendiente', 'Cerrado ganado', 'Cerrado perdido'];
  const etapas = [...new Set(LEADS.map(l => l.etapa))]
    .sort((a, b) => ORDEN_FE.indexOf(a) - ORDEN_FE.indexOf(b));
  fe.innerHTML = '<option value="">Toda etapa</option>' + etapas.map(e => '<option value="' + e + '">' + trEtapa(e) + '</option>').join('');
  fe.value = sel;
  render();
  cargarTarjetas();
  cargarMiDia();
  cargarReparto();
}

async function cargarTarjetas() {
  if (!veTodoJS()) { const t = $('tarjetas'); if (t) t.innerHTML = ''; return; }  // GP usa "Mi día"
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
  if (FP.fDesde) FP.fDesde.clear(); else $('fDesde').value = '';
  if (FP.fHasta) FP.fHasta.clear(); else $('fHasta').value = '';
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
  if (typeof MD_FILTRO !== 'undefined' && MD_FILTRO) {
    const h0 = new Date(); h0.setHours(0, 0, 0, 0);
    const mn = new Date(h0); mn.setDate(mn.getDate() + 1);
    const act = l => l.etapa !== 'Cerrado ganado' && l.etapa !== 'Cerrado perdido';
    if (MD_FILTRO === 'sincontactar') arr = arr.filter(l => l.etapa === 'Contactabilidad 3x5');
    else if (MD_FILTRO === 'vencidos') arr = arr.filter(l => act(l) && l.fechaProxAccion && new Date(l.fechaProxAccion) < h0);
    else if (MD_FILTRO === 'parahoy') arr = arr.filter(l => act(l) && l.fechaProxAccion && new Date(l.fechaProxAccion) >= h0 && new Date(l.fechaProxAccion) < mn);
  }
  if (ordenCampo) {
    arr.sort((a, b) => {
      // Orden por prioridad: desempate por frescura (asignado mas reciente arriba),
      // para que un lead nuevo suba al tope de su nivel y no se hunda al fondo.
      if (ordenCampo === 'prioridad') {
        if (a.ordenSort !== b.ordenSort) return (a.ordenSort - b.ordenSort) * ordenDir;
        const fa = new Date(a.fechaAsignacion || a.fechaCarga || 0).getTime();
        const fb = new Date(b.fechaAsignacion || b.fechaCarga || 0).getTime();
        return fb - fa;
      }
      let va = a[ordenCampo], vb = b[ordenCampo];
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
    const montoNum = v => Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')) || 0;
    items.forEach(l => {
      const mv = montoNum(l.montoReal || l.montoPotencial); // monto vigente, igual que la tarjeta
      total += mv;
      ponderado += mv * (l.probabilidad || 0) / 100;
      sumaProb += (l.probabilidad || 0);
    });
    const prom = items.length ? Math.round(sumaProb / items.length) : 0;
    const tarjetas = items.map(l => kanbanCard(l)).join('');
    return '<div class="kcol">' +
      '<div class="kcol-head"><span class="ktit">' + trEtapa2(c) + '</span><span class="kcnt">• ' + items.length + '</span></div>' +
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

// Lead "Nuevo": asignado HOY y aun sin contactar (en Por contactar, 0 intentos).
function esLeadNuevo(l) {
  if (!l.fechaAsignacion) return false;
  const h = new Date(), fa = new Date(l.fechaAsignacion);
  const hoy = fa.getFullYear() === h.getFullYear() && fa.getMonth() === h.getMonth() && fa.getDate() === h.getDate();
  return hoy && (l.intentos || 0) === 0 && l.etapa === 'Contactabilidad 3x5';
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
  let estadoCalif = '';
  if (!calif) {
    const intxt = (l.intentos > 0)
      ? '<span class="kestado-int">' + l.intentos + (l.intentos === 1 ? ' intento' : ' intentos') + '</span>'
      : '<span class="kestado-sc">Sin contacto</span>';
    estadoCalif = intxt + '<span class="kestado porcal">Por calificar</span>';
  }
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
      (esLeadNuevo(l) ? '<span class="kbadge-nuevo">Nuevo</span>' : '') +
      (vencida ? '<span class="kbadge-venc">Vencido</span>' : '') +
      '<span class="kprob">' + l.probabilidad + '%</span>' +
    '</div>' +
    '<div class="knom"' + nomTipAttr(l) + ' onclick="verTrazabilidad(\'' + l.codigo + '\')">' +
      (l.nombre || '—') + dotExperiencia(l.experienciaInv) + '</div>' +
    '<div class="kgp">' + fmtSoles(l.montoReal || l.montoPotencial) +
      (l.fechaAsignacion ? ' · <span class="kasig">' + fechaRelativa(l.fechaAsignacion) + '</span>' : '') +
      (l.telefono ? ' · <span class="ktel">' + l.telefono + '</span>' : '') + '</div>' +
    lineaAccion +
    (chips ? '<div class="kchips">' + chips + '</div>' : (estadoCalif ? '<div class="kchips">' + estadoCalif + '</div>' : '')) +
    '<div class="kbtns">' +
      '<button class="kbtn rg" onclick="event.stopPropagation();accionRegistrar(\'' + l.codigo + '\')">Gestionar</button>' +
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
          '<button class="acc-reg" onclick="accionRegistrar(\'' + l.codigo + '\')">Gestionar</button>' +
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
  const correo = l.email ? l.email : '';
  const asignado = l.fechaAsignacion ? fechaRelativa(l.fechaAsignacion) : '';
  // Estado de contacto SOLO en etapa "Por contactar":
  // intentos > 0 -> "N intentos" (azul); sin intentos -> "Sin contacto".
  let estadoHtml = '';
  if (l.etapa === 'Contactabilidad 3x5') {
    if (l.intentos > 0) estadoHtml = '<div class="lead-intentos">' + l.intentos + (l.intentos === 1 ? ' intento' : ' intentos') + '</div>';
    else estadoHtml = '<div class="lead-estado">Sin contacto</div>';
  }
  return '<div class="lead-cell">' +
    '<div class="lead-nom"' + nomTipAttr(l) + '>' + (l.nombre || '—') + dotExperiencia(l.experienciaInv) +
      (esLeadNuevo(l) ? '<span class="badge-nuevo">Nuevo</span>' : '') + '</div>' +
    (asignado ? '<div class="lead-asig">' + asignado + '</div>' : '') +
    (correo ? '<div class="lead-fuente" title="' + correo + '">✉ ' + correo + '</div>' : '') +
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
    `<span class="sep">·</span><span class="dato"><b id="gSubScore">Score ${gLead.score}/100</b></span>` +
    `<span class="sep">·</span><span class="dato">Prob. <b id="gSubProb">${gLead.probabilidad}%</b></span>` +
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
  // Sincroniza los selectores Flatpickr con los valores reci\u00e9n seteados/limpiados.
  if (FP.gFechaReunion) FP.gFechaReunion.clear();
  if (FP.gFechaProx) FP.gFechaProx.clear();
  if (FP.gFechaCierre) {
    if (gLead.fechaCierreEstimada) FP.gFechaCierre.setDate(gLead.fechaCierreEstimada.slice(0,10), false);
    else FP.gFechaCierre.clear();
  }

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
function accionWhatsApp(codigo) { CHAT_ABRIR_LEAD = codigo; ir('chat'); }
function accionLlamar(codigo) {
  const l = (typeof LEADS !== 'undefined' ? LEADS : []).find(x => x.codigo === codigo);
  if (l && l.telefono) {
    AC_LEAD_EN_CURSO = codigo;     // recordamos el lead para abrir su gestión al colgar
    AC_HUBO_LLAMADA = false;
    acDial(telE164(l.telefono));   // solo abre Aircall con el número marcado
  } else {
    abrirGestion(codigo, null, 'Llamada'); // sin teléfono: registro manual
  }
}
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
  // Al entrar a Reunión efectiva (o ya estar en seguimiento) se RE-CALIFICA: el cierre aparece.
  const enReunionEfectiva = (gLead && gLead.etapa === 'Reunion efectiva - seguimiento') || r === 'Reunion efectiva';
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
  const cierreVisible = (enNegociacion || enReunionEfectiva) && !modoSoloGestion;
  $('secCierre').classList.toggle('oculto', !cierreVisible);
  $('secScore').classList.add('oculto');  // barra score/probabilidad oculta (modal mas corto)
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
    $('secCalif').classList.toggle('oculto', enNegociacion || enReunionEfectiva);
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
  // Bloqueo por ETAPA: si el lead ya esta Calificado o mas adelante, la calificacion
  // INICIAL queda en solo lectura (ya fue calificado; no se re-edita).
  const ORD_ETAPAS = ['Contactabilidad 3x5','Contactado - por calificar','Calificado - pendiente agendar',
    'Agendado - pendiente reunion','Reunion efectiva - seguimiento','Cierre pendiente','Cerrado ganado','Cerrado perdido'];
  const bloquearPorEtapa = gLead && ORD_ETAPAS.indexOf(gLead.etapa) >= ORD_ETAPAS.indexOf('Calificado - pendiente agendar');
  const bloquear = modoCalifForzado === 'bloqueado' || bloquearPorResultado || bloquearPorEtapa;
  const obliga = !bloquear && (modoCalifForzado === 'obligatorio' || obligaPorResultado);

  // Habilitar/deshabilitar los 4 selects y atenuar la seccion
  ['gMonto','gTiempo','gInteres','gExperiencia','gExperienciaInv'].forEach(id => { if ($(id)) $(id).disabled = bloquear; });
  $('secCalif').classList.toggle('calif-bloq', bloquear);
  // Marca de obligatorio
  $('secCalif').classList.toggle('calif-oblig', obliga);
  let aviso = $('califAviso');
  if (aviso) aviso.textContent = bloquear
    ? (bloquearPorEtapa ? 'Calificación inicial bloqueada: el lead ya fue calificado.' : 'Calificación no disponible: el lead aún no fue calificado en esta gestión.')
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

  // Espeja el score/probabilidad EN VIVO en los chips de la cabecera (antes estáticos).
  if ($('gSubScore')) $('gSubScore').textContent = 'Score ' + score + '/100';
  if ($('gSubProb')) $('gSubProb').textContent = ((cierreVisible || gLead) ? prob + '%' : '—');
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
  // Volcar a input datetime-local (formato YYYY-MM-DDTHH:MM en hora local)
  const p = n => String(n).padStart(2, '0');
  $('gFechaProx').value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  if (FP.gFechaProx) FP.gFechaProx.setDate($('gFechaProx').value, false);
  // Marcar visualmente el boton activo
  document.querySelectorAll('#gFechaRapida .chipf').forEach(b => b.classList.remove('act'));
  if (event && event.target) event.target.classList.add('act');
}

// Botones rapidos para la fecha de reunion
function setFechaReu(tipo, val) {
  const d = new Date();
  if (tipo === 'man') { d.setDate(d.getDate() + 1); d.setHours(val, 0, 0, 0); }
  else if (tipo === 'd') { d.setDate(d.getDate() + val); d.setHours(9, 0, 0, 0); }
  const p = n => String(n).padStart(2, '0');
  $('gFechaReunion').value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  if (FP.gFechaReunion) FP.gFechaReunion.setDate($('gFechaReunion').value, false);
  document.querySelectorAll('#gFechaReuRapida .chipf').forEach(b => b.classList.remove('act'));
  if (event && event.target) event.target.classList.add('act');
}

// Sugiere la fecha prox segun cadencia (mismo calculo del servidor, en preview)
function sugerirFechaProx() {
  // El servidor autocalcula si se deja vacio; aqui no forzamos nada.
}

async function guardarGestion() {
  const etapaAntes = gLead ? gLead.etapa : null;
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
  // Al entrar a Reunión efectiva hay que RE-CALIFICAR: el cierre es obligatorio.
  if (r === 'Reunion efectiva' && !cierreCompleto()) {
    $('gError').textContent = 'La reunión ya se dio: completa la Calificación de cierre para guardar.';
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
    await cargarLeads();
    // Refuerzo positivo (dopamina): celebra la gestión / avance / cierre ganado.
    if (!modoPerdido && !esDescarte) {
      try {
        const ld = (typeof LEADS !== 'undefined' ? LEADS : []).find(x => x.codigo === gCodigo);
        const etapaDespues = ld ? ld.etapa : null;
        const ORD = { 'Contactabilidad 3x5': 0, 'Contactado - por calificar': 1, 'Calificado - pendiente agendar': 2, 'Agendado - pendiente reunion': 3, 'Reunion efectiva - seguimiento': 4, 'Cierre pendiente': 5, 'Cerrado ganado': 6 };
        if (etapaDespues === 'Cerrado ganado' || r === 'Venta ganada') celebrar('ganado');
        else if (etapaAntes != null && etapaDespues != null && (ORD[etapaDespues] || 0) > (ORD[etapaAntes] || 0)) celebrar('avance');
        else celebrar('gestion');
      } catch (e) {}
    }
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
    `<span class="sep">·</span><span class="dato">GP ${t.asesor || '—'}</span>` +
    `<span class="sep">·</span><span class="dato">Asignado: <b>${t.fechaAsignacion ? fmtFecha(t.fechaAsignacion) : '—'}</b>` +
    (veTodoJS() ? ` <a class="tz-edit" title="Editar fecha de asignación" onclick="editarFechaAsig('${t.codigo}')">✎</a>` : '') +
    `</span>`;

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
  const icoTipo = { creado: '👤', gestion: '📞', cambio: '⚑', proxima: '📅', llamada: '📞', whatsapp: '💬' };
  const colorTipo = { creado: 'verde', gestion: 'azul', cambio: 'verde', proxima: 'naranja', llamada: 'azul', whatsapp: 'verde' };
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
        <div class="tz-ev-tit">${e.titulo}${e.via === 'Aircall' ? ' <span class="tz-via">📞 Aircall</span>' : ''}${e.verificada ? ' <span class="tz-verif" title="Llamada verificada por Aircall">✓ verificada</span>' : ''}</div>
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
  const ba = $('tArchivar'); if (ba) ba.style.display = (typeof YO !== 'undefined' && YO && YO.rol === 'admin') ? '' : 'none';
}
function tipoLabel(e) {
  const m = { creado: 'Lead creado', gestion: e.canal || 'Gestión', cambio: 'Cambio de etapa', proxima: 'Próxima acción', llamada: 'Llamada', whatsapp: 'WhatsApp' };
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
  duplicado_historial: ['Duplicado (historial)', '#C2611F'],
  duplicado_perdido: ['Duplicado perdido', '#E6A100'],
  duplicado_ganado: ['Duplicado ganado', '#8E44AD'],
  incompleto: ['Incompleto', '#E6A100'],
  sin_nombre: ['Sin nombre', '#D81B8C'],
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
  if (i.estado === 'duplicado_historial') {
    btns += '<button class="bbtn verde" onclick="crearLeadBruto(' + i.id + ')" title="Crear el lead igual, pese a estar en releads">Crear igual</button>';
  }
  if (i.estado === 'sin_nombre') {
    btns += '<button class="bbtn verde" onclick="completarYCrear(' + i.id + ')" title="Escribir el nombre y crear el lead">Completar y crear</button>';
  }
  if (i.estado !== 'descartado') {
    btns += '<button class="bbtn gris" onclick="descartarBruto(' + i.id + ')">Descartar</button>';
  }
  return btns;
}

// ---------- Base de Releads ----------
let RL_PAG = 0, RL_LIM = 50, RL_TOTAL = 0, RL_SEL = new Set(), RL_BUSCA_T = null;

function releadsFiltros() {
  return {
    origen: $('rlOrigen').value,
    desde: $('rlDesde').value,
    hasta: $('rlHasta').value,
    q: $('rlQ').value.trim(),
    estado: $('rlEstado').value,
  };
}
function releadsFiltrar() { RL_PAG = 0; cargarReleads(); }
function releadsBuscarDebounce() { clearTimeout(RL_BUSCA_T); RL_BUSCA_T = setTimeout(() => { RL_PAG = 0; cargarReleads(); }, 350); }
function releadsPagina(d) {
  const max = Math.max(0, Math.ceil(RL_TOTAL / RL_LIM) - 1);
  RL_PAG = Math.min(max, Math.max(0, RL_PAG + d));
  cargarReleads();
}

async function cargarReleads() {
  // Lista de GP en el selector
  if ($('rlAsesor') && !$('rlAsesor').options.length) llenarSelect('rlAsesor', CAT.asesores, false, 'Elegir GP');
  const f = releadsFiltros();
  const qs = new URLSearchParams({ ...f, limit: RL_LIM, offset: RL_PAG * RL_LIM }).toString();
  $('releadsCont').innerHTML = '<div class="vacio">Cargando...</div>';
  let d;
  try { d = await api('/api/releads?' + qs); } catch (e) { $('releadsCont').innerHTML = '<div class="vacio">Error al cargar.</div>'; return; }
  RL_TOTAL = d.total;
  RL_SEL.clear(); actualizarSelCount(); if ($('rlSelAll')) $('rlSelAll').checked = false;

  // Resumen por estado
  const r = d.resumen || {};
  $('releadsResumen').innerHTML =
    '<span class="bchip" style="border-color:#C2611F;color:#C2611F">Pendientes: <b>' + (r.pendiente || 0) + '</b></span>' +
    '<span class="bchip" style="border-color:#1EBE57;color:#1EBE57">Asignados: <b>' + (r.asignado || 0) + '</b></span>' +
    '<span class="bchip" style="border-color:#9AA3AD;color:#9AA3AD">Descartados: <b>' + (r.descartado || 0) + '</b></span>';

  if (!d.releads.length) { $('releadsCont').innerHTML = '<div class="vacio">Sin releads con esos filtros.</div>'; renderPag(); return; }

  const filas = d.releads.map(re => {
    const monto = re.montoReal != null ? 'S/ ' + Number(re.montoReal).toLocaleString('en-US') + (re.montoRango ? ' · ' + re.montoRango : '') : '<span class="sub">—</span>';
    const asign = re.estado === 'asignado' ? '<div class="sub">→ ' + (re.asignadoA || '') + (re.codigoLead ? ' (' + re.codigoLead + ')' : '') + '</div>' : '';
    const chk = re.estado === 'pendiente' ? '<input type="checkbox" class="rl-chk" data-tel="' + re.telefono + '" onchange="releadsToggle(this)">' : '';
    return '<tr>' +
      '<td>' + chk + '</td>' +
      '<td><span class="borigen">' + (re.origen || '') + '</span></td>' +
      '<td>' + (re.nombre || '<span class="sub">—</span>') + asign + '</td>' +
      '<td>' + (re.telefono || '') + '</td>' +
      '<td>' + (re.email || '<span class="sub">—</span>') + '</td>' +
      '<td>' + monto + '</td>' +
      '<td>' + (re.fechaRegistro || '<span class="sub">—</span>') + '</td>' +
    '</tr>';
  }).join('');
  $('releadsCont').innerHTML = '<table class="tabla btabla"><thead><tr>' +
    '<th></th><th>Origen</th><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Monto</th><th>Fecha registro</th>' +
    '</tr></thead><tbody>' + filas + '</tbody></table>';
  renderPag();
}

function renderPag() {
  const totalPag = Math.max(1, Math.ceil(RL_TOTAL / RL_LIM));
  $('rlPagInfo').textContent = 'Página ' + (RL_PAG + 1) + ' de ' + totalPag + ' · ' + RL_TOTAL + ' releads';
  $('rlPrev').disabled = RL_PAG <= 0;
  $('rlNext').disabled = RL_PAG >= totalPag - 1;
}

function releadsToggle(chk) {
  if (chk.checked) RL_SEL.add(chk.dataset.tel); else RL_SEL.delete(chk.dataset.tel);
  actualizarSelCount();
}
function releadsSelAll(on) {
  document.querySelectorAll('.rl-chk').forEach(c => { c.checked = on; if (on) RL_SEL.add(c.dataset.tel); else RL_SEL.delete(c.dataset.tel); });
  actualizarSelCount();
}
function actualizarSelCount() { if ($('rlSelCount')) $('rlSelCount').textContent = RL_SEL.size + ' seleccionados'; }

async function releadsAsignar() {
  if (!RL_SEL.size) return alert('Selecciona al menos un relead.');
  const asesor = $('rlAsesor').value;
  if (!asesor) return alert('Elige una GP.');
  if (!confirm('¿Asignar ' + RL_SEL.size + ' relead(s) a ' + asesor + '? Entrarán al Kanban.')) return;
  try {
    const r = await api('/api/releads/asignar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telefonos: [...RL_SEL], asesor }) });
    alert('Asignados: ' + (r.creados + r.yaExistian) + ' (nuevos: ' + r.creados + ', ya existían: ' + r.yaExistian + ')');
    cargarReleads();
  } catch (e) { alert('Error al asignar.'); }
}
async function releadsDescartar() {
  if (!RL_SEL.size) return alert('Selecciona al menos un relead.');
  if (!confirm('¿Descartar ' + RL_SEL.size + ' relead(s)? No se trabajarán.')) return;
  try {
    await api('/api/releads/descartar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telefonos: [...RL_SEL] }) });
    cargarReleads();
  } catch (e) { alert('Error al descartar.'); }
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

async function completarYCrear(id) {
  const nombre = prompt('Escribe el nombre del lead (obligatorio):', '');
  if (nombre === null) return;               // canceló
  if (!nombre.trim()) { alert('Debes escribir un nombre para crear el lead.'); return; }
  try {
    const r = await api('/api/marketing/ingresos/' + id + '/crear-lead', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombre.trim() })
    });
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
  cargarAvance();
  cargarCadencia();
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
// Limpieza de datos de prueba (solo admin). Doble confirmación por ser destructivo.
async function limpiarPruebas() {
  if (!confirm('Esto BORRARÁ todas las gestiones y transiciones (historial de prueba) y reseteará los leads a "Por contactar".\n\nLos leads NO se eliminan. Esta acción no se puede deshacer.\n\n¿Continuar?')) return;
  const t = prompt('Para confirmar, escribe en mayúsculas: BORRAR');
  if (t !== 'BORRAR') { alert('Cancelado. No se borró nada.'); return; }
  try {
    const r = await api('/api/admin/limpiar-pruebas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmar: 'BORRAR' }) });
    alert('Listo. Gestiones borradas: ' + r.gestiones + ' · Transiciones: ' + r.transiciones + ' · Leads reseteados: ' + r.leadsReset);
    cargarLeads();
  } catch (e) { alert(e.message); }
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

// ---------- Avance vs meta del mes (embudo semanal + proyeccion) ----------
let AV_MES = '', AV_SCOPE = 'EQUIPO', AV_PROY = 'simple', AV_VISTA = 'semanas', AV_DATA = null;
const AV_FILAS = [
  { t: 'num', k: 'asignados', lbl: 'Asign.' },
  { t: 'num', k: 'calificados', lbl: 'Calif.' },
  { t: 'pct', num: 'calificados', den: 'asignados', lbl: '%Calif/Asign' },
  { t: 'num', k: 'agendados', lbl: 'Agend.' },
  { t: 'pct', num: 'agendados', den: 'calificados', lbl: '%Agend/Calif' },
  { t: 'num', k: 'reuniones', lbl: 'Reun.' },
  { t: 'pct', num: 'reuniones', den: 'agendados', lbl: '%Reun/Agend' },
  { t: 'num', k: 'negociacion', lbl: 'En negociación', soloReal: true },
  { t: 'num', k: 'cierres', lbl: 'Cierres' },
  { t: 'pct', num: 'cierres', den: 'reuniones', lbl: '%Cierres/Reun' },
  { t: 'monto', k: 'monto', lbl: 'Monto' }
];
async function cargarAvance() {
  if (!AV_MES) { const n = new Date(); AV_MES = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0'); }
  if ($('avMes')) $('avMes').value = AV_MES;
  try {
    AV_DATA = await api('/api/dashboard/avance?mes=' + AV_MES + '&scope=' + encodeURIComponent(AV_SCOPE) + '&vista=' + AV_VISTA);
    if (!AV_DATA || !AV_DATA.semanas || !AV_DATA.meta) {
      if ($('avMeta')) $('avMeta').innerHTML = '<div class="sub">El servidor está corriendo una versión anterior. Reinicia Node (server.js v1.85+) y recarga la página.</div>';
      if ($('avReal')) $('avReal').innerHTML = '';
      if ($('avProy')) $('avProy').innerHTML = '';
      return;
    }
    renderScopeAv();
    renderAvance();
  } catch (e) { if ($('avMeta')) $('avMeta').innerHTML = '<div class="sub">No se pudo cargar el avance.</div>'; }
}
function avCambiarMes() { AV_MES = $('avMes').value; cargarAvance(); }
function avSetScope(s) { AV_SCOPE = s; cargarAvance(); }
function avSetVista(v) { AV_VISTA = v; $('avVistaSem').classList.toggle('act', v === 'semanas'); $('avVistaMes').classList.toggle('act', v === 'meses'); cargarAvance(); }
function avSetProy(p) { AV_PROY = p; $('avProySimple').classList.toggle('act', p === 'simple'); $('avProyEmbudo').classList.toggle('act', p === 'embudo'); renderProy(); }
function renderScopeAv() {
  const cont = $('avScope'); if (!cont) return;
  if (!veTodoJS()) { cont.innerHTML = ''; return; }
  const opts = [['EQUIPO', 'Equipo']].concat(['Mafer Lujan', 'Breezy Ortega', 'Lourdes Villavicencio', 'Dora Barreto'].map(g => [g, g.split(' ')[0]]));
  cont.innerHTML = opts.map(([v, l]) => '<button class="av-chip' + (AV_DATA.scope === v ? ' act' : '') + '" onclick="avSetScope(\'' + v + '\')">' + l + '</button>').join('');
}
function avPct(num, den) { return den > 0 ? Math.round(num / den * 100) + '%' : '\u2014'; }
function avMontoCompacto(v) { v = Number(v || 0); if (v >= 1e6) return 'S/ ' + (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'; if (v >= 1000) return 'S/ ' + Math.round(v / 1000) + 'k'; return 'S/ ' + v; }
function avNum(v, esMonto) { return esMonto ? avMontoCompacto(v) : (v || 0); }
function avTabla(data, esMeta) {
  const sem = AV_DATA.semanas;
  let h = '<div style="overflow-x:auto"><table class="mt-tabla av-funnel"><thead><tr><th></th>';
  sem.forEach(s => h += '<th>' + s.label + '</th>');
  h += '<th class="av-total">Total</th></tr></thead><tbody>';
  AV_FILAS.forEach(f => {
    if (esMeta && f.soloReal) return;
    h += '<tr class="' + (f.t === 'pct' ? 'av-rpct' : '') + '"><td>' + f.lbl + '</td>';
    sem.forEach((s, i) => {
      if (f.t === 'num') h += '<td>' + Math.round(data[f.k].sem[i] || 0) + '</td>';
      else if (f.t === 'monto') h += '<td>' + ((esMeta && AV_VISTA === 'semanas') ? '—' : avNum(data[f.k].sem[i], true)) + '</td>';
      else h += '<td>' + avPct(data[f.num].sem[i], data[f.den].sem[i]) + '</td>';
    });
    if (f.t === 'num') h += '<td class="av-total">' + Math.round(data[f.k].total || 0) + '</td>';
    else if (f.t === 'monto') h += '<td class="av-total">' + avNum(data[f.k].total, true) + '</td>';
    else h += '<td class="av-total">' + avPct(data[f.num].total, data[f.den].total) + '</td>';
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  return h;
}
function renderAvance() {
  const d = AV_DATA; if (!d) return;
  const mesEl = $('dbAvMes'); if (mesEl) mesEl.textContent = '\u00b7 ' + d.mes + ' \u00b7 d\u00eda h\u00e1bil ' + d.dhTrans + ' de ' + d.dhMes;
  $('avMeta').innerHTML = avTabla(d.meta, true);
  $('avReal').innerHTML = avTabla(d.real, false);
  renderProy();
  renderPipeline();
}
function renderPipeline() {
  const d = AV_DATA; const cont = $('avPipeline'); if (!cont || !d || !d.pipeline) return;
  const p = d.pipeline; const m = v => avMontoCompacto(v);
  const cmp = p.metaMonto > 0 ? Math.round(p.proyeccionMes / p.metaMonto * 100) : null;
  const cmpCls = cmp == null ? '' : (cmp >= 100 ? 'av-ok' : (cmp >= 85 ? '' : 'av-low'));
  let h = '<table class="mt-tabla av-pipe"><tbody>';
  h += '<tr><td>Ganado del mes</td><td>' + m(p.ganadoMes) + '</td></tr>';
  h += '<tr><td>En negociación · por vencer (' + p.nVencer + ')</td><td>' + m(p.porVencer) + '</td></tr>';
  h += '<tr><td>En negociación · vencidas, en riesgo (' + p.nVencida + ')</td><td class="' + (p.vencida > 0 ? 'av-low' : '') + '">' + m(p.vencida) + '</td></tr>';
  h += '<tr class="mt-suma"><td>Proyección de monto (pipeline)</td><td>' + m(p.proyeccionMes) + '</td></tr>';
  h += '<tr><td>Meta de monto</td><td>' + m(p.metaMonto) + '</td></tr>';
  h += '<tr><td>Cumplimiento</td><td class="' + cmpCls + '">' + (cmp == null ? '—' : cmp + '%') + '</td></tr>';
  h += '</tbody></table>';
  cont.innerHTML = h;
}
function renderProy() {
  const d = AV_DATA; const cont = $('avProy'); if (!cont || !d) return;
  const factor = d.dhTrans > 0 ? d.dhMes / d.dhTrans : 0;
  const sr = d.selReal || {}, sm = d.selMeta || {};
  const METR = [{ k: 'asignados', l: 'Asign.' }, { k: 'calificados', l: 'Calif.' }, { k: 'agendados', l: 'Agend.' }, { k: 'reuniones', l: 'Reun.' }, { k: 'cierres', l: 'Cierres' }, { k: 'monto', l: 'Monto', monto: true }];
  const proy = {};
  if (AV_PROY === 'simple') {
    METR.forEach(m => { proy[m.k] = Math.round((sr[m.k] || 0) * factor); });
  } else {
    proy.asignados = Math.round((sr.asignados || 0) * factor);
    const conv = (a, b) => (sr[b] > 0 ? sr[a] / sr[b] : 0);
    proy.calificados = Math.round(proy.asignados * conv('calificados', 'asignados'));
    proy.agendados = Math.round(proy.calificados * conv('agendados', 'calificados'));
    proy.reuniones = Math.round(proy.agendados * conv('reuniones', 'agendados'));
    proy.cierres = Math.round(proy.reuniones * conv('cierres', 'reuniones'));
    const ticket = sr.cierres > 0 ? sr.monto / sr.cierres : 0;
    proy.monto = Math.round(proy.cierres * ticket);
  }
  let h = '<div style="overflow-x:auto"><table class="mt-tabla av-funnel"><thead><tr><th></th>';
  METR.forEach(m => h += '<th>' + m.l + '</th>'); h += '</tr></thead><tbody>';
  h += '<tr><td>Real a hoy</td>' + METR.map(m => '<td>' + avNum(sr[m.k], m.monto) + '</td>').join('') + '</tr>';
  h += '<tr><td>Proyectado fin de mes</td>' + METR.map(m => '<td>' + avNum(proy[m.k], m.monto) + '</td>').join('') + '</tr>';
  h += '<tr><td>Meta</td>' + METR.map(m => '<td>' + avNum(sm[m.k], m.monto) + '</td>').join('') + '</tr>';
  h += '<tr class="mt-suma"><td>Cumplimiento proy.</td>' + METR.map(m => {
    const meta = sm[m.k]; const cmp = meta > 0 ? Math.round(proy[m.k] / meta * 100) : null;
    const cls = cmp == null ? '' : (cmp >= 100 ? 'av-ok' : (cmp >= 85 ? '' : 'av-low'));
    return '<td class="' + cls + '">' + (cmp == null ? '\u2014' : cmp + '%') + '</td>';
  }).join('') + '</tr>';
  h += '</tbody></table></div>';
  cont.innerHTML = h;
}

// ---------- "Mi día": cabecera de pulso del GP en Mis Leads ----------
async function cargarMiDia() {
  const cont = $('miDia'); if (!cont) return;
  if (veTodoJS()) { cont.classList.add('oculto'); return; }  // solo gestoras
  try {
    const d = await api('/api/midia');
    renderMiDia(d);
    cont.classList.remove('oculto');
  } catch (e) { cont.classList.add('oculto'); }
}
function renderMiDia(d) {
  const u = d.urgencias || {};
  const speed = (d.speedMin == null) ? '—' : (d.speedMin < 60 ? d.speedMin + ' min' : (d.speedMin < 1440 ? (d.speedMin / 60).toFixed(1) + ' h' : (d.speedMin / 1440).toFixed(1) + ' d'));
  const card = (ico, tono, etiqueta, valor, sub, filtro) => {
    const act = (filtro && MD_FILTRO === filtro) ? ' md-activo' : '';
    const onclick = filtro ? ' onclick="filtroRapido(\'' + filtro + '\')" role="button" tabindex="0"' : '';
    return '<div class="md-card2 ' + tono + act + '"' + onclick + '>' +
      '<span class="md-ico">' + (ICO_HL[ico] || '') + '</span>' +
      '<div class="md-txt"><div class="md-et">' + etiqueta + '</div>' +
      '<div class="md-v">' + valor + '</div>' +
      (sub ? '<div class="md-sub">' + sub + '</div>' : '') + '</div></div>';
  };
  let h = '<div class="md-fila">';
  // "asignados hoy" = misma lógica del badge "Nuevo" (esLeadNuevo) para que SIEMPRE
  // coincida con cuántos "Nuevo" se ven en la tabla (evita desfase de zona horaria).
  const nuevosHoy = (typeof LEADS !== 'undefined' && Array.isArray(LEADS)) ? LEADS.filter(esLeadNuevo).length : (d.asignadosHoy || 0);
  h += card('user', u.nuevosSinContactar > 0 ? 'azul' : '', 'Nuevos sin contactar', u.nuevosSinContactar || 0, nuevosHoy + ' asignados hoy', 'sincontactar');
  h += card('reloj', u.vencidos > 0 ? 'rojo' : '', 'Vencidos', u.vencidos || 0, 'Requieren atención', 'vencidos');
  h += card('cal', '', 'Para hoy', u.paraHoy || 0, 'Acciones programadas', 'parahoy');
  h += card('grafico', '', 'Speed-to-call', speed, 'Asignación → 1er contacto', null);
  h += card('trofeo', 'verde', 'Ganados hoy', d.ganadosHoy || 0, 'Cierres del día', null);
  h += '</div>';
  // chips pequeños: hoy vs meta por etapa
  const mh = d.metaHoy || {}, rh = d.realHoy || {};
  const tieneMeta = ['calificados', 'agendados', 'reuniones', 'cierres'].some(k => mh[k] != null);
  const chip = (lbl, k) => {
    const real = rh[k] || 0, meta = mh[k];
    const metaDisp = (meta == null) ? null : (meta === 0 ? 0 : Math.max(1, Math.round(meta)));
    const ok = (meta != null && real >= meta);
    return '<span class="md-chip' + (ok ? ' md-ok' : '') + '">' + lbl + ': <b>' + real + (metaDisp != null ? '/' + metaDisp : '') + '</b>' + (ok ? ' ✓' : '') + '</span>';
  };
  h += '<div class="md-fila2"><span class="md-fila2-tit">Hoy vs meta</span>';
  h += chip('Calif', 'calificados') + chip('Agend', 'agendados') + chip('Reun', 'reuniones') + chip('Cierres', 'cierres');
  if (!tieneMeta) h += '<span class="md-nometa">· sin meta diaria cargada</span>';
  h += '</div>';
  $('miDia').innerHTML = h;
}
let MD_FILTRO = '';
function filtroRapido(tipo) {
  ir('leads');
  MD_FILTRO = (MD_FILTRO === tipo) ? '' : tipo;
  const fp = $('fPrioridad'), fe = $('fEtapa'); if (fp) fp.value = ''; if (fe) fe.value = '';
  render();
  if ($('miDia') && !$('miDia').classList.contains('oculto')) { try { renderMiDiaActivo(); } catch (e) {} }
}
function renderMiDiaActivo() {
  document.querySelectorAll('#miDia .md-card2').forEach(el => {
    const oc = el.getAttribute('onclick') || '';
    const m = oc.match(/filtroRapido\('([^']+)'\)/);
    el.classList.toggle('md-activo', !!(m && m[1] === MD_FILTRO));
  });
}

// ---------- "Reparto por GP": panel de la jefa en Mis Leads ----------
async function cargarReparto() {
  const cont = $('reparto'); if (!cont) return;
  if (!veTodoJS()) { cont.classList.add('oculto'); return; }  // solo jefa/admin
  try {
    const d = await api('/api/reparto');
    renderReparto(d);
    cont.classList.remove('oculto');
  } catch (e) { cont.classList.add('oculto'); }
}
function renderReparto(d) {
  const selA = ($('selAsesor') || {}).value || '';
  const selF = ($('selFiltro') || {}).value || '';
  const num = n => Number(n || 0).toLocaleString('es-PE');
  const venc = v => v > 0 ? '<span class="rp-venc">' + v + '</span>' : '<span class="rp-cero">0</span>';
  let h = '<div class="rp-head"><div class="rp-tit">Reparto por GP</div><div class="rp-sub">Click en una GP para filtrar la tabla y reasignar</div></div>';
  h += '<div class="rp-wrap"><table class="rp-tabla"><thead><tr>' +
    '<th class="rp-gp">GP</th><th>Asig. hoy</th><th>Cartera</th><th>Sin contactar</th><th>Vencidos</th><th class="rp-monto">Monto potencial</th>' +
    '</tr></thead><tbody>';
  d.filas.forEach(f => {
    const activa = selA === f.asesor && selF !== 'sin-asignar';
    h += '<tr class="rp-row' + (activa ? ' rp-activa' : '') + '" onclick="repartoFiltrar(\'' + f.asesor.replace(/'/g, "\\'") + '\')">' +
      '<td class="rp-gp">' + f.asesor + '</td><td>' + f.asignadosHoy + '</td><td>' + f.cartera + '</td>' +
      '<td>' + f.sinContactar + '</td><td>' + venc(f.vencidos) + '</td><td class="rp-monto">S/ ' + num(f.monto) + '</td></tr>';
  });
  const eq = d.equipo;
  h += '<tr class="rp-eq"><td class="rp-gp">Equipo</td><td>' + eq.asignadosHoy + '</td><td>' + eq.cartera + '</td>' +
    '<td>' + eq.sinContactar + '</td><td>' + (eq.vencidos > 0 ? '<span class="rp-venc">' + eq.vencidos + '</span>' : '0') + '</td><td class="rp-monto">S/ ' + num(eq.monto) + '</td></tr>';
  const s = d.sinAsignar; const sinAct = selF === 'sin-asignar';
  h += '<tr class="rp-row rp-sin' + (sinAct ? ' rp-activa' : '') + '" onclick="repartoSinAsignar()">' +
    '<td class="rp-gp">Sin asignar</td><td>—</td><td>' + s.cartera + '</td><td>' + s.sinContactar + '</td><td>—</td>' +
    '<td class="rp-monto">S/ ' + num(s.monto) + '</td></tr>';
  h += '</tbody></table></div>';
  $('reparto').innerHTML = h;
}
function repartoFiltrar(asesor) {
  const selA = $('selAsesor'), selF = $('selFiltro');
  if (selF) selF.value = '';
  if (selA) selA.value = (selA.value === asesor) ? '' : asesor;
  cargarLeads();
}
function repartoSinAsignar() {
  const selA = $('selAsesor'), selF = $('selFiltro');
  if (selA) selA.value = '';
  if (selF) selF.value = (selF.value === 'sin-asignar') ? '' : 'sin-asignar';
  cargarLeads();
}

// ---------- Tooltip flotante: recordatorio con el último comentario sobre el nombre ----------
function tipEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function nomTipAttr(l) { return (l && l.ultimoComentario) ? ' data-tip="' + tipEsc(l.ultimoComentario) + '"' : ''; }
function tipBoxEl() {
  let b = document.getElementById('tipBox');
  if (!b) { b = document.createElement('div'); b.id = 'tipBox'; b.className = 'tip-box'; document.body.appendChild(b); }
  return b;
}
function tipShow(target) {
  const txt = target.getAttribute('data-tip'); if (!txt) return;
  const b = tipBoxEl(); b.textContent = txt; b.style.display = 'block';
  const r = target.getBoundingClientRect();
  const bw = b.offsetWidth, bh = b.offsetHeight;
  let left = r.left; let top = r.bottom + 6;
  if (left + bw > window.innerWidth - 8) left = window.innerWidth - bw - 8;
  if (top + bh > window.innerHeight - 8) top = r.top - bh - 6;
  b.style.left = Math.max(8, left) + 'px'; b.style.top = Math.max(8, top) + 'px';
}
function tipHide() { const b = document.getElementById('tipBox'); if (b) b.style.display = 'none'; }
document.addEventListener('mouseover', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) tipShow(t); });
document.addEventListener('mouseout', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t && !t.contains(e.relatedTarget)) tipHide(); });
document.addEventListener('click', tipHide, true);

// ---------- Mensajería (Chatwoot embebido, Nivel 2) ----------
let CHAT_CONVS = [], CHAT_ACTIVA = null, CHAT_TIMER = null;
async function cargarChat() {
  const bloq = $('chatBloqueo');
  if (!veTodoJS()) { if (bloq) bloq.classList.remove('oculto'); return; } // GPs: en construcción
  if (bloq) bloq.classList.add('oculto');
  const cont = $('chatLista'); if (!cont) return;
  cont.innerHTML = '<div class="chat-cargando">Cargando…</div>';
  try {
    const d = await api('/api/chat/conversaciones');
    if (!d.configurado) {
      cont.innerHTML = '<div class="chat-aviso">Chatwoot aún no está configurado. Falta cargar las variables CHATWOOT_URL y CHATWOOT_API_TOKEN en Railway.</div>';
      return;
    }
    CHAT_CONVS = d.conversaciones || [];
    renderChatLista();
    iniciarChatSSE();
    if (CHAT_ABRIR_LEAD) {
      const c = CHAT_CONVS.find(x => x.codigoLead === CHAT_ABRIR_LEAD);
      const cod = CHAT_ABRIR_LEAD; CHAT_ABRIR_LEAD = null;
      if (c) abrirChat(c.id);
      else chatSinConversacion(cod);
    }
  } catch (e) {
    cont.innerHTML = '<div class="chat-aviso">No se pudo cargar la bandeja: ' + e.message + '</div>';
  }
}
function renderChatLista() {
  const cont = $('chatLista');
  const lista = chatConvsVisibles();
  if (!lista.length) { cont.innerHTML = '<div class="chat-aviso">No hay conversaciones.</div>'; return; }
  cont.innerHTML = lista.map(c => {
    const ini = (c.nombre || '?').trim().slice(0, 2).toUpperCase();
    const act = CHAT_ACTIVA && CHAT_ACTIVA.id === c.id ? ' chat-it-act' : '';
    const et = etapaDeLead(c.codigoLead);
    const tag = et ? '<span class="chat-tag" style="' + estiloEtapaChip(et) + '">' + (typeof trEtapa === 'function' ? trEtapa(et) : et) + '</span>' : '';
    return '<div class="chat-it' + act + '" onclick="abrirChat(' + c.id + ')">' +
      '<div class="chat-ava">' + ini + '</div>' +
      '<div class="chat-it-txt">' +
        '<div class="chat-it-top"><span class="chat-it-nom">' + chatEsc(c.nombre || '—') + '</span>' +
          '<span class="chat-it-hora">' + chatHora(c.ts) + '</span></div>' +
        (c.asesor ? '<div class="chat-it-emp">' + chatEsc(c.asesor) + '</div>' : '') +
        '<div class="chat-it-bot"><span class="chat-it-last">' + chatEsc(c.ultimo || '') + '</span>' +
          (c.noLeidos > 0 ? '<span class="chat-badge">' + c.noLeidos + '</span>' : '') + '</div>' +
        tag +
      '</div></div>';
  }).join('');
}
async function abrirChat(id) {
  CHAT_ACTIVA = CHAT_CONVS.find(c => c.id === id) || { id };
  renderChatLista();
  $('chatVacio').classList.add('oculto');
  $('chatConv').classList.remove('oculto');
  const c = CHAT_ACTIVA;
  const ini = (c.nombre || '?').trim().slice(0, 2).toUpperCase();
  const et = etapaDeLead(c.codigoLead);
  const tag = et ? '<span class="chat-tag" style="' + estiloEtapaChip(et) + '">' + (typeof trEtapa === 'function' ? trEtapa(et) : et) + '</span>' : '';
  $('chatCab').innerHTML =
    '<div class="chat-cab-l"><div class="chat-cab-ava">' + ini + '</div>' +
      '<div><div class="chat-cab-nom">' + chatEsc(c.nombre || '—') + ' ' + tag + '</div>' +
      '<div class="chat-cab-sub">' + (c.telefono || '') + (c.asesor ? ' · ' + chatEsc(c.asesor) : '') + '</div></div></div>' +
    '<div class="chat-cab-r">' +
      (c.codigoLead
        ? '<button class="btn sec" onclick="irALead(\'' + c.codigoLead + '\')">Ver lead</button>'
        : (veTodoJS() ? '<button class="btn" onclick="crearLeadDesdeChat()">+ Crear lead</button>' : '')) +
    '</div>';
  await cargarMensajes();
  renderPlantillas();
  renderFicha();
  if (CHAT_TIMER) clearInterval(CHAT_TIMER);
  CHAT_TIMER = setInterval(cargarMensajes, 20000);
  iniciarChatSSE();
}
async function cargarMensajes() {
  if (!CHAT_ACTIVA) return;
  try {
    const d = await api('/api/chat/mensajes?id=' + CHAT_ACTIVA.id);
    const hilo = $('chatHilo');
    hilo.innerHTML = (d.mensajes || []).map(m => burbujaHTML(m.entrante, m.texto, m.ts)).join('');
    hilo.scrollTop = hilo.scrollHeight; // siempre mostrar el último mensaje
  } catch (e) {}
}
function chatEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function chatHoraHM(ts) {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return isNaN(d) ? '' : d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
function burbujaHTML(entrante, texto, ts) {
  const check = entrante ? '' : ' <span class="chat-ck">✓✓</span>';
  return '<div class="chat-msg ' + (entrante ? 'chat-in' : 'chat-out') + '">' +
    '<div class="chat-burb">' + chatEsc(texto || '') +
    '<span class="chat-meta">' + chatHoraHM(ts) + check + '</span></div></div>';
}
function chatBurbuja(entrante, texto) {
  const hilo = $('chatHilo'); if (!hilo) return;
  hilo.insertAdjacentHTML('beforeend', burbujaHTML(entrante, texto, Math.floor(Date.now() / 1000)));
  hilo.scrollTop = hilo.scrollHeight;
}
async function enviarChat() {
  const inp = $('chatTexto'); const txt = inp.value.trim();
  if (!txt || !CHAT_ACTIVA) return;
  inp.value = '';
  chatBurbuja(false, txt); // optimistic: aparece al instante
  try {
    await api('/api/chat/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: CHAT_ACTIVA.id, texto: txt }) });
  } catch (e) { alert('No se pudo enviar: ' + e.message); inp.value = txt; }
}
function irALead(codigo) {
  ir('leads');
  const l = (typeof LEADS !== 'undefined' ? LEADS : []).find(x => x.codigo === codigo);
  if (l) { setTimeout(() => { try { verTrazabilidad(codigo); } catch (e) {} }, 200); }
}

// ---- Tiempo real del chat: SSE (escucha webhooks de Chatwoot) ----
let CHAT_SSE = null, CHAT_LISTA_PEND = null;
function iniciarChatSSE() {
  if (CHAT_SSE) return; // ya conectado
  try {
    CHAT_SSE = new EventSource('/api/chat/stream');
    CHAT_SSE.onmessage = (e) => {
      let d; try { d = JSON.parse(e.data); } catch (_) { return; }
      if (d.tipo !== 'mensaje') return;
      // Si el mensaje es de la conversación abierta, re-render autoritativo (evita duplicados).
      if (CHAT_ACTIVA && String(d.conversationId) === String(CHAT_ACTIVA.id)) cargarMensajes();
      // Refrescar la lista (último mensaje, no leídos, conversaciones nuevas) con debounce.
      clearTimeout(CHAT_LISTA_PEND);
      CHAT_LISTA_PEND = setTimeout(refrescarListaChat, 600);
    };
    CHAT_SSE.onerror = () => { /* EventSource reintenta solo */ };
  } catch (e) {}
}
async function refrescarListaChat() {
  try {
    const d = await api('/api/chat/conversaciones');
    if (d.configurado) { CHAT_CONVS = d.conversaciones || []; renderChatLista(); }
  } catch (e) {}
}

// ---- Etapa 4: abrir chat del lead + plantillas por etapa ----
let CHAT_ABRIR_LEAD = null;
function chatSinConversacion(codigo) {
  const l = (typeof LEADS !== 'undefined' ? LEADS : []).find(x => x.codigo === codigo);
  CHAT_ACTIVA = null;
  $('chatConv').classList.add('oculto');
  const v = $('chatVacio'); v.classList.remove('oculto');
  v.innerHTML = 'El lead <b>' + (l ? l.nombre : codigo) + '</b> aún no tiene conversación de WhatsApp abierta.<br><br>' +
    'Con la API oficial, la conversación se habilita cuando <b>el lead escribe primero</b> (o mediante una plantilla aprobada por Meta). En cuanto te escriba, aparecerá aquí.';
}
// Plantillas por etapa interna del lead. {n} = primer nombre del lead.
const PLANTILLAS_WA = {
  'Contactabilidad 3x5': [
    ['Saludo', 'Hola {n}, te saluda el equipo de TasaTop 🙌 Vi tu interés en hacer crecer tu capital con inversiones respaldadas. ¿Te parece si te cuento cómo funciona?'],
  ],
  'Contactado - por calificar': [
    ['Calificar', 'Hola {n}, para recomendarte la mejor opción cuéntame: ¿ya has invertido antes y qué monto tienes pensado destinar?'],
  ],
  'Calificado - pendiente agendar': [
    ['Agendar', '{n}, ¿tienes 10 minutos hoy o mañana para una llamada corta? Te muestro las oportunidades disponibles y resolvemos tus dudas.'],
  ],
  'Agendado - pendiente reunion': [
    ['Confirmar', 'Hola {n}, te confirmo nuestra reunión. ¿Sigue en pie el horario que coordinamos? Quedo atento 😊'],
  ],
  'Reunion efectiva - seguimiento': [
    ['Seguimiento', 'Hola {n}, ¿pudiste revisar la información que te compartí? Cualquier duda con gusto la vemos.'],
  ],
  'Cierre pendiente': [
    ['Cierre', '{n}, ya tenemos todo listo para que empieces a invertir. ¿Avanzamos con tu primera operación?'],
  ],
};
function renderPlantillas() {
  const cont = $('chatPlantillas'); if (!cont) return;
  cont.innerHTML = '';
  if (!CHAT_ACTIVA || !CHAT_ACTIVA.codigoLead) return;
  const l = (typeof LEADS !== 'undefined' ? LEADS : []).find(x => x.codigo === CHAT_ACTIVA.codigoLead);
  if (!l) return;
  const lista = PLANTILLAS_WA[l.etapa] || [];
  // Siempre ofrecer también el saludo inicial como comodín
  const saludo = PLANTILLAS_WA['Contactabilidad 3x5'][0];
  const todas = (l.etapa === 'Contactabilidad 3x5') ? lista : [saludo].concat(lista);
  cont.innerHTML = todas.map((p, i) =>
    '<span class="chat-pl" onclick="usarPlantilla(' + i + ')">' + p[0] + '</span>'
  ).join('');
  cont._plantillas = todas;
  cont._nombre = (l.nombre || '').trim().split(/\s+/)[0] || '';
}
function usarPlantilla(i) {
  const cont = $('chatPlantillas'); if (!cont || !cont._plantillas) return;
  const p = cont._plantillas[i]; if (!p) return;
  const txt = p[1].replace(/\{n\}/g, cont._nombre || '');
  const inp = $('chatTexto'); inp.value = txt; inp.focus();
}

// Crear lead desde una conversación huérfana (respeta la dedup de Leads Ingresos).
async function crearLeadDesdeChat() {
  if (!CHAT_ACTIVA) return;
  const n = CHAT_ACTIVA.nombre || '';
  const pareceTel = /^\+?\d[\d\s]*$/.test(n.trim());
  const sugerido = pareceTel ? '' : n;
  const nombre = prompt('Nombre del lead a crear (teléfono ' + (CHAT_ACTIVA.telefono || '') + '):', sugerido);
  if (nombre === null) return; // canceló
  try {
    const r = await api('/api/chat/crear-lead', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: CHAT_ACTIVA.id, nombre: nombre.trim() }),
    });
    const msg = {
      creado: '✅ Lead creado (' + r.codigoLead + ') sin asignar. Asígnalo desde la tabla o el panel de Reparto.',
      duplicado_activo: '⚠️ Este número YA es un lead activo (' + r.codigoLead + '). No se creó duplicado.',
      duplicado_ganado: '⚠️ Este número ya es un lead GANADO (' + r.codigoLead + '). Revisión manual.',
      duplicado_perdido: '⚠️ Este número ya es un lead CERRADO PERDIDO (' + r.codigoLead + '). Revisión manual.',
      duplicado_historial: '⚠️ Este número ya está en la Base de Releads. La jefa decide.',
      sin_nombre: '⚠️ Falta el nombre. Vuelve a intentar con un nombre.',
      incompleto: '⚠️ El teléfono no es válido.',
    }[r.estado] || ('Resultado: ' + r.estado);
    alert(msg + (r.mensajeError ? '\n\n' + r.mensajeError : ''));
    if (r.estado === 'creado') { await cargarLeads(); await cargarChat(); CHAT_ABRIR_LEAD = null; abrirChat(CHAT_ACTIVA.id); }
  } catch (e) { alert('No se pudo crear el lead: ' + e.message); }
}

// ---- Mensajería: filtros, búsqueda y ficha comercial (panel derecho) ----
let CHAT_FILTRO = 'todos';
function chatFiltro(f) {
  CHAT_FILTRO = f;
  document.querySelectorAll('#chatFiltros .chat-fil').forEach(el => el.classList.toggle('chat-fil-act', el.dataset.f === f));
  renderChatLista();
}
function chatConvsVisibles() {
  const q = ($('chatBuscar') ? $('chatBuscar').value : '').trim().toLowerCase();
  return CHAT_CONVS.filter(c => {
    if (CHAT_FILTRO === 'noleidos' && !(c.noLeidos > 0)) return false;
    if (CHAT_FILTRO === 'asignados' && !c.codigoLead) return false;
    if (q && !((c.nombre || '') + ' ' + (c.telefono || '')).toLowerCase().includes(q)) return false;
    return true;
  });
}
function chatHora(ts) {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  if (isNaN(d)) return '';
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
}
function etapaDeLead(codigo) {
  if (!codigo) return null;
  const l = (typeof LEADS !== 'undefined' ? LEADS : []).find(x => x.codigo === codigo);
  return l ? l.etapa : null;
}
function estiloEtapaChip(et) {
  const m = {
    'Cierre pendiente': 'color:#A32D2D;background:#FCEBEB',
    'Cerrado ganado': 'color:#0F6E4A;background:#E7F6EE',
    'Cerrado perdido': 'color:#5F5E5A;background:#EFEFEC',
    'Reunion efectiva - seguimiento': 'color:#854F0B;background:#FAEEDA',
    'Agendado - pendiente reunion': 'color:#185FA5;background:#E6F1FB',
  };
  return m[et] || 'color:#185FA5;background:#E6F1FB';
}
// Ficha comercial (panel derecho) con métricas REALES del lead
async function renderFicha() {
  const cont = $('chatFicha'); if (!cont) return;
  if (!CHAT_ACTIVA || !CHAT_ACTIVA.codigoLead) {
    cont.innerHTML = '<div class="ficha-vacia"><i>Sin lead vinculado</i><br>Crea el lead desde la cabecera para ver su ficha comercial.</div>';
    return;
  }
  cont.innerHTML = '<div class="ficha-vacia">Cargando ficha…</div>';
  try {
    const f = await api('/api/chat/ficha?codigo=' + CHAT_ACTIVA.codigoLead);
    cont.innerHTML = fichaHTML(f);
  } catch (e) { cont.innerHTML = '<div class="ficha-vacia">No se pudo cargar la ficha.</div>'; }
}
function fBar(lbl, val, col) {
  const v = Math.max(0, Math.min(100, Math.round(val || 0)));
  return '<div class="f-bar"><div class="f-bar-top"><span>' + lbl + '</span><span>' + v + '%</span></div>' +
    '<div class="f-bar-track"><div class="f-bar-fill" style="width:' + v + '%;background:' + col + '"></div></div></div>';
}
function fKpi(lbl, val) { return '<div class="f-kpi"><div class="f-kpi-l">' + lbl + '</div><div class="f-kpi-v">' + val + '</div></div>'; }
function fichaHTML(f) {
  const ini = (f.nombre || '?').trim().slice(0, 2).toUpperCase();
  const etLabel = typeof trEtapa === 'function' ? trEtapa(f.etapa) : f.etapa;
  const monto = f.monto != null ? (typeof fmtSoles === 'function' ? fmtSoles(f.monto) : ('S/ ' + f.monto)) : '—';
  let bars = fBar('Avance del proceso', f.avance, '#0B72E8');
  if (f.probabilidad != null) bars += fBar('Probabilidad de cierre', f.probabilidad, '#1FA06A');
  if (f.score != null) bars += fBar('Lead score', f.score, '#123A63');
  const kpis = [
    ['Interacciones', f.interacciones != null ? f.interacciones : '—'],
    ['Mensajes WA', (f.waEnviados || 0) + ' / ' + (f.waRecibidos || 0)],
    ['Llamadas', f.llamadas != null ? f.llamadas : '—'],
    ['Reuniones', f.reuniones != null ? f.reuniones : '—'],
    ['Días en etapa', f.diasEnEtapa != null ? f.diasEnEtapa : '—'],
    ['Origen', f.origen || '—'],
  ].map(k => fKpi(k[0], k[1])).join('');
  const prox = f.proximaAccion
    ? '<div class="f-row"><span><i class="hl">▸</i> Próxima tarea</span><b>' + (f.fechaProxAccion ? chatHora(f.fechaProxAccion) : '') + '</b></div>' +
      '<div class="f-sub">' + chatEsc(f.proximaAccion) + '</div>'
    : '';
  return '<div class="f-head">' +
      '<div class="chat-cab-ava">' + ini + '</div>' +
      '<div><div class="f-nom">' + chatEsc(f.nombre || '—') + '</div>' +
      (f.asesor ? '<div class="f-emp">' + chatEsc(f.asesor) + '</div>' : '') + '</div>' +
    '</div>' +
    '<div class="f-contact">' +
      (f.telefono ? '<div><i class="ti ti-phone"></i> ' + f.telefono + '</div>' : '') +
      (f.email ? '<div><i class="ti ti-mail"></i> ' + chatEsc(f.email) + '</div>' : '') +
    '</div>' +
    '<div class="f-sec"><div class="f-line"><span>Etapa</span><span class="chat-tag" style="' + estiloEtapaChip(f.etapa) + '">' + etLabel + '</span></div></div>' +
    '<div class="f-resumen">' + fKpi('Monto', monto) + fKpi('Ticket', f.ticket || '—') + fKpi('Ejecutivo', f.asesor || '—') + '</div>' +
    '<div class="f-titulo">Métricas del lead</div>' +
    bars +
    '<div class="f-kpis">' + kpis + '</div>' +
    (prox ? '<div class="f-titulo">Seguimiento</div>' + prox : '') +
    '<div class="f-acciones">' +
      (f.codigoLead || CHAT_ACTIVA.codigoLead ? '<button class="btn" onclick="irALead(\'' + (CHAT_ACTIVA.codigoLead) + '\')">Ver lead completo</button>' : '') +
    '</div>';
}

// ---- Refuerzo positivo (dopamina): frases que rotan sin repetirse ----
const FRASES_GESTION = [
  '¡Gestión completada! Sigue así',
  '¡Buen movimiento, {n}!',
  'Cada contacto abre una oportunidad',
  '¡Estás imparable! 🔥',
  'Lead gestionado. Vamos por el siguiente 💪',
  'Bien {n}, estás haciendo que suceda',
  '¡Acción tomada, progreso ganado!',
  'Una gestión más cerca de tu meta',
  '¡Excelente! Mantén la racha 🔥',
  'Tu constancia convierte oportunidades',
  '¡Buen trabajo! El siguiente lead te espera 🫰🏻',
  'Contactaste. Aprendiste. Avanzaste',
  '¡Vas bien, {n}!',
  'Cada gestión suma. Sigue adelante 💪',
  '¡Misión cumplida! Vamos por más',
  '¡Buen avance! No bajes el ritmo 👍',
];
const FRASES_AVANCE = [
  '¡El cierre está muy cerca! 🚀',
  '¡Tus leads en movimiento!',
  '{n}, acabas de subir el nivel 🔥',
  '¡Avance desbloqueado!',
  'Un paso más cerca del cierre',
  '¡Tu gestión dio resultado!',
  '¡Muy bien! Tu embudo se mueve 👍',
  'Esto huele a cierre',
  '¡Súper avance {n}! Mantén el impulso',
  'Tu seguimiento está funcionando {n} 💪',
  '¡Cada vez más cerca del cierre!',
  '¡El siguiente paso es tuyo!',
  'Buen trabajo: este lead es tuyo 👏',
  '¡Vamos, {n}! No pierdas el ritmo',
];
const FRASES_GANADO = [
  '🏆 ¡CERRASTE, {n}! Esto es lo que viniste a hacer. ¡Enorme!',
  '💰 ¡VENTA GANADA! {n}, te luciste. A celebrar este cierre',
  '🎉 ¡Cierre ganado! El esfuerzo se convirtió en resultado. ¡Bravo!',
  '🔥 ¡Lo lograste, {n}! Un cliente más que confía en TasaTop',
  '🚀 ¡GANADO! Así se cierra. El equipo lo celebra contigo',
  '⭐ ¡Qué cierre, {n}! De esto se trata. Vas a ser imparable',
  '💪 ¡Venta cerrada! Tu constancia tenía premio. ¡Felicitaciones!',
  '🥂 ¡Ganaste este, {n}! Un paso más hacia tu mejor mes',
];
const _ultFrase = {};
function fraseRotada(set, key) {
  if (set.length <= 1) return set[0];
  let i; do { i = Math.floor(Math.random() * set.length); } while (i === _ultFrase[key]);
  _ultFrase[key] = i; return set[i];
}
function aplicarNombre(s, nom) {
  if (nom) return s.replace(/\{n\}/g, nom);
  return s.replace(/\{n\}\s*,\s*/g, '').replace(/,?\s*\{n\}/g, '').replace(/\{n\}/g, '').replace(/^\s*,\s*/, '').trim();
}
function celebrar(tier) {
  const nom = (typeof YO !== 'undefined' && YO && YO.nombre) ? YO.nombre.split(' ')[0] : '';
  let set, cls, fuerte = false;
  if (tier === 'ganado') { set = FRASES_GANADO; cls = 'cel-ganado'; fuerte = true; }
  else if (tier === 'avance') { set = FRASES_AVANCE; cls = 'cel-avance'; }
  else { set = FRASES_GESTION; cls = 'cel-gestion'; }
  const txt = aplicarNombre(fraseRotada(set, tier), nom);
  let host = document.getElementById('celHost');
  if (!host) { host = document.createElement('div'); host.id = 'celHost'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = 'cel-toast ' + cls;
  el.textContent = txt;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('cel-in'));
  setTimeout(() => { el.classList.remove('cel-in'); setTimeout(() => el.remove(), 350); }, fuerte ? 5200 : 3600);
}

// ---- Dashboard: cumplimiento de la cadencia 3x5 (bandas horarias) ----
// ---- Dashboard: cumplimiento de la cadencia 3x5 (bandas horarias) ----
let CAD_GP_INIT = false, CAD_LEADS = [], CAD_COLS = [], CAD_PAGE = 0;
const CAD_DIAS_SEM = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
function cadFechaCol(ymd) { // "2026-06-22" -> "Lun 22"
  const d = new Date(ymd + 'T12:00:00Z');
  return isNaN(d) ? ymd : CAD_DIAS_SEM[d.getUTCDay()] + ' ' + d.getUTCDate();
}
function cadHora12(iso) { // ISO -> "08:00 am" (hora Perú)
  const d = new Date(new Date(iso).getTime() - 5 * 3600000);
  let h = d.getUTCHours(); const m = d.getUTCMinutes();
  const ap = h < 12 ? 'am' : 'pm'; let h12 = h % 12; if (h12 === 0) h12 = 12;
  return h12 + ':' + String(m).padStart(2, '0') + ' ' + ap;
}
function cadFechaHora12(iso) { // "Lun 23, 08:00 am"
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() - 5 * 3600000);
  return CAD_DIAS_SEM[d.getUTCDay()] + ' ' + d.getUTCDate() + ', ' + cadHora12(iso);
}
async function cargarCadencia() {
  try {
    const gp = $('cadGP') ? $('cadGP').value : '';
    const estado = $('cadEstado') ? $('cadEstado').value : '';
    const resultado = $('cadResultado') ? $('cadResultado').value : '';
    const desde = $('cadDesde') ? $('cadDesde').value : '';
    const hasta = $('cadHasta') ? $('cadHasta').value : '';
    const qs = new URLSearchParams();
    if (gp) qs.set('gp', gp); if (estado) qs.set('estado', estado); if (resultado) qs.set('resultado', resultado);
    if (desde) qs.set('desde', desde); if (hasta) qs.set('hasta', hasta);
    const d = await api('/api/dashboard/cadencia?' + qs.toString());

    if (!CAD_GP_INIT) {
      const sel = $('cadGP');
      (d.gpsDisponibles || []).forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
      if ($('cadDesde') && d.filtros) $('cadDesde').value = d.filtros.desde;
      if ($('cadHasta') && d.filtros) $('cadHasta').value = d.filtros.hasta;
      CAD_GP_INIT = true;
    }

    const h = d.highlights || {};
    const re = h.reaccion || {}, ef = h.efectividad || {};
    const kpis = [
      ['⚡', 'Tocados el mismo día', (re.tocadosMismoDiaPct || 0) + '%', 'reacción rápida', '#0B72E8'],
      ['⏱️', '1er intento (prom.)', re.minutosPrimerIntento != null ? re.minutosPrimerIntento + ' min' : '—', 'desde que llegó', '#BA7517'],
      ['📞', 'Tasa de conexión', (ef.tasaConexion || 0) + '%', 'de los intentos', '#7C5BD9'],
      ['✅', 'Tasa de calificados', (ef.tasaCalificacion || 0) + '%', 'de los que respondieron', '#1D9E75'],
      ['🎯', 'Conexión', ef.conexionProm != null ? ef.conexionProm : '—', 'llamada promedio', '#E0732B'],
    ];
    $('cadResumen').innerHTML = kpis.map(k =>
      '<div class="cad-kpi" style="border-left:3px solid ' + k[4] + '">' +
      '<div class="cad-kpi-top"><span class="cad-kpi-ic" style="background:' + k[4] + '22">' + k[0] + '</span>' +
      '<span class="cad-kpi-l">' + k[1] + '</span></div>' +
      '<div class="cad-kpi-v" style="color:' + k[4] + '">' + k[2] + '</div>' +
      '<div class="cad-kpi-s">' + k[3] + '</div></div>'
    ).join('');

    renderCadDistribucion(h.funnel || {}, d.distribucionGP || []);

    CAD_LEADS = d.leads || [];
    CAD_COLS = d.colDates || [];
    CAD_PAGE = 0;
    renderCadLeads();
  } catch (e) {
    if ($('cadResumen')) $('cadResumen').innerHTML = '<div class="cad-vacio">No se pudo cargar la cadencia: ' + e.message + '</div>';
  }
}
function renderCadLeads() {
  const COL = { sinresp: '#85B7EB', sincal: '#EF9F27', cal: '#1D9E75', descarte: '#E24B4A' };
  const cuadro = est => {
    if (est === 'na') return 'background:transparent;';
    if (est === 'vacio') return 'background:#EFECE3;border:1px solid #D3D1C7;';
    return 'background:' + (COL[est] || '#EFECE3') + ';';
  };
  const celda = (est, esPauta, horas) => {
    const naCls = est === 'na' ? ' cad-cu2-na' : '';
    const tip = (horas && horas.length) ? ' title="Llamado: ' + horas.join(' · ') + '"' : '';
    return '<span class="cad-cu2-wrap">' +
      '<span class="cad-cu2' + naCls + '" style="' + cuadro(est) + '"' + tip + '></span>' +
      (esPauta ? '<span class="cad-dot"></span>' : '<span class="cad-dot-sp"></span>') +
      '</span>';
  };
  const head = '<div class="cad-row cad-head"><span>Lead</span>' +
    (CAD_COLS.length ? CAD_COLS.map(c => '<span class="cad-dh">' + cadFechaCol(c) + '</span>').join('')
      : [1, 2, 3, 4, 5].map(n => '<span class="cad-dh">Día ' + n + '</span>').join('')) +
    '<span class="cad-dh2">Estado actual</span><span class="cad-dh2">Próxima acción</span></div>';

  const ini = CAD_PAGE * 10;
  const pagina = CAD_LEADS.slice(ini, ini + 10);
  const filas = pagina.map(l =>
    '<div class="cad-row">' +
      '<div class="cad-lead" onclick="verTrazabilidad(\'' + l.codigo + '\')" title="Ver trazabilidad" style="cursor:pointer">' +
        '<div class="cad-lead-n">' + (l.nombre || '—') + '</div>' +
        '<div class="cad-lead-gp">' + l.gp + ' · ' + cadFechaHora12(l.asignadoISO) + '</div></div>' +
      l.celdas.map((dia, ci) => '<div class="cad-dia">' +
        dia.map((est, s) => celda(est, ci === l.pautaCol && s === l.pautaSlot, (l.celdasHoras && l.celdasHoras[ci]) ? l.celdasHoras[ci][s] : [])).join('') +
      '</div>').join('') +
      '<div class="cad-est"><span class="cad-est-chip" style="background:' + (typeof colorEtapa === 'function' ? colorEtapa(l.etapa) : '#EEF1F5') + '">' + (l.etapaVisible || '—') + '</span></div>' +
      '<div class="cad-prox">' + (l.proximaAccion ? l.proximaAccion : '—') +
        (l.fechaProxAccion ? '<div class="cad-prox-f">' + fmtFecha(l.fechaProxAccion) + '</div>' : '') + '</div>' +
    '</div>'
  ).join('');
  $('cadLeads').innerHTML = head + (filas || '<div class="cad-vacio">No hay leads con estos filtros.</div>');

  const totalPags = Math.ceil(CAD_LEADS.length / 10);
  const pag = $('cadPaginacion');
  if (pag) {
    if (totalPags <= 1) { pag.innerHTML = CAD_LEADS.length ? '<span class="cad-pag-info">' + CAD_LEADS.length + ' lead(s)</span>' : ''; }
    else {
      pag.innerHTML =
        '<button class="cad-pag-b" ' + (CAD_PAGE === 0 ? 'disabled' : '') + ' onclick="cadPag(-1)">‹ Anterior</button>' +
        '<span class="cad-pag-info">Página ' + (CAD_PAGE + 1) + ' de ' + totalPags + ' · ' + CAD_LEADS.length + ' leads</span>' +
        '<button class="cad-pag-b" ' + (CAD_PAGE >= totalPags - 1 ? 'disabled' : '') + ' onclick="cadPag(1)">Siguiente ›</button>';
    }
  }
}
function cadPag(dir) {
  const totalPags = Math.ceil(CAD_LEADS.length / 10);
  CAD_PAGE = Math.max(0, Math.min(totalPags - 1, CAD_PAGE + dir));
  renderCadLeads();
}

// ---- Softphone Aircall embebido (Etapa C) + click-to-call (Etapa B) ----
let AC_PHONE = null, AC_LOGGED = false, AC_PENDING = null, AC_LEAD_EN_CURSO = null, AC_HUBO_LLAMADA = false;
function acEnsure() {
  if (AC_PHONE) return AC_PHONE;
  if (!window.AircallWorkspace) return null;
  try {
    AC_PHONE = new window.AircallWorkspace({
      domToLoadWorkspace: '#acWorkspace',
      size: 'auto',
      debug: false,
      onLogin: () => {
        AC_LOGGED = true;
        const h = $('acHint'); if (h) h.classList.add('oculto');
        if (AC_PENDING) { const n = AC_PENDING; AC_PENDING = null; acDial(n); }
      },
      onLogout: () => {
        AC_LOGGED = false;
        const h = $('acHint'); if (h) h.classList.remove('oculto');
      },
    });
    // Se inició una llamada saliente → marcamos que hubo llamada (para abrir la gestión al colgar).
    AC_PHONE.on('outgoing_call', () => { AC_HUBO_LLAMADA = true; });
    AC_PHONE.on('incoming_call', () => { AC_HUBO_LLAMADA = true; });
    // La llamada terminó (colgó la GP o el lead) → minimizar teléfono y abrir la gestión.
    AC_PHONE.on('call_ended', () => { acAlColgar(); });
  } catch (e) { console.error('Aircall init:', e); }
  return AC_PHONE;
}
// Al colgar: si hubo una llamada y veníamos de un lead, minimiza el teléfono y abre su gestión.
function acAlColgar() {
  const codigo = AC_LEAD_EN_CURSO;
  const hubo = AC_HUBO_LLAMADA;
  AC_LEAD_EN_CURSO = null; AC_HUBO_LLAMADA = false;
  if (!hubo || !codigo) return;
  // Minimizar el teléfono al botón flotante (mantiene la sesión viva).
  const p = $('acPhonePanel'); if (p) p.classList.add('oculto');
  if ($('acFab')) $('acFab').classList.remove('oculto');
  // Pequeño respiro para que Aircall cierre su vista de llamada antes de abrir la gestión.
  setTimeout(() => abrirGestion(codigo, null, 'Llamada'), 400);
}
// Detecta si ya hay sesion de Aircall (por si onLogin no se disparo, p.ej. login en otra pestaña).
function acVerificarSesion() {
  if (!AC_PHONE || !AC_PHONE.isLoggedIn) return;
  try {
    AC_PHONE.isLoggedIn(res => {
      AC_LOGGED = !!res;
      const h = $('acHint'); if (h) h.classList.toggle('oculto', !!res);
      if (res && AC_PENDING) { const n = AC_PENDING; AC_PENDING = null; acDial(n); }
    });
  } catch (e) {}
}
// Recarga el iframe del telefono (si la sesion se desincroniza, sin recargar toda la pagina).
function acRecargar() {
  AC_PHONE = null; AC_LOGGED = false;
  const w = $('acWorkspace'); if (w) w.innerHTML = '';
  const h = $('acHint'); if (h) h.classList.remove('oculto');
  acEnsure();
  setTimeout(acVerificarSesion, 1500);
  acToast('Recargando teléfono…');
}
function acToggle() {
  const p = $('acPhonePanel'); if (!p) return;
  const abrir = p.classList.contains('oculto');
  if (abrir) { acEnsure(); p.classList.remove('oculto'); if ($('acFab')) $('acFab').classList.add('oculto'); setTimeout(acVerificarSesion, 1200); }
  else { p.classList.add('oculto'); if ($('acFab')) $('acFab').classList.remove('oculto'); }
}
// Normaliza a E.164 (Aircall lo exige). Celular peruano de 9 dígitos -> +51.
function telE164(tel) {
  const raw = String(tel || '').trim();
  const d = raw.replace(/[^\d]/g, '');
  if (!d) return '';
  if (raw.startsWith('+')) return '+' + d;
  if (d.length === 9) return '+51' + d;
  if (d.length === 11 && d.startsWith('51')) return '+' + d;
  return '+' + d;
}
function acDial(numero) {
  if (!numero) return;
  acEnsure();
  const p = $('acPhonePanel'); if (p) p.classList.remove('oculto');
  if ($('acFab')) $('acFab').classList.add('oculto');
  if (!AC_PHONE) { acToast('El teléfono Aircall no está disponible. Recarga la página.'); return; }
  if (!AC_LOGGED) { AC_PENDING = numero; acToast('Inicia sesión en el teléfono Aircall; tu llamada saldrá enseguida.'); return; }
  AC_PHONE.send('dial_number', { phone_number: numero }, (ok, data) => {
    if (!ok) acToast('No se pudo marcar: ' + ((data && (data.error || data.message)) || 'revisa el teléfono'));
  });
}
function acToast(msg) {
  let host = document.getElementById('celHost');
  if (!host) { host = document.createElement('div'); host.id = 'celHost'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = 'cel-toast cel-gestion';
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('cel-in'));
  setTimeout(() => { el.classList.remove('cel-in'); setTimeout(() => el.remove(), 350); }, 4200);
}

// ---- Editar fecha de asignación de un lead (admin/jefa) ----
function isoAPeruLocal(iso) { // ISO UTC -> "AAAA-MM-DD HH:MM" en hora Perú
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() - 5 * 3600000);
  return isNaN(d) ? '' : d.toISOString().slice(0, 16).replace('T', ' ');
}
function peruLocalAISO(s) { // "AAAA-MM-DD HH:MM" Perú -> ISO UTC
  const t = String(s).trim();
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(t)) return null; // formato estricto
  const d = new Date(t.replace(' ', 'T') + ':00-05:00');
  return isNaN(d) ? null : d.toISOString();
}
function editarFechaAsig(codigo) {
  const l = (typeof LEADS !== 'undefined' ? LEADS : []).find(x => x.codigo === codigo);
  const actual = l && l.fechaAsignacion ? isoAPeruLocal(l.fechaAsignacion) : '';
  const v = prompt('Nueva fecha y hora de asignación (hora Perú).\nFormato: AAAA-MM-DD HH:MM', actual);
  if (v == null) return;
  const iso = peruLocalAISO(v);
  if (!iso) { alert('Fecha inválida. Usa el formato AAAA-MM-DD HH:MM (ej. 2026-06-23 09:00).'); return; }
  api('/api/leads/' + codigo + '/fecha-asignacion', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fechaAsignacion: iso }),
  }).then(() => {
    if (l) l.fechaAsignacion = iso;
    if (typeof acToast === 'function') acToast('Fecha de asignación actualizada');
    verTrazabilidad(codigo);
    if (typeof cargarLeads === 'function') cargarLeads();
  }).catch(e => alert('No se pudo actualizar: ' + e.message));
}

// Archivar el lead abierto en la trazabilidad (admin). Reversible desde Auditoría.
async function archivarDesdeTraza() {
  const codigo = tCodigoActual;
  if (!codigo) return;
  if (!confirm('¿Archivar este lead?\nSaldrá de la lista, de las gestiones de los GPs y del tablero 3x5.\nQueda guardado y se puede restaurar (o eliminar definitivamente) desde Auditoría.')) return;
  try {
    await api('/api/leads/' + codigo + '/archivar', { method: 'PUT' });
    cerrar('ovTraza');
    if (typeof acToast === 'function') acToast('Lead archivado');
    if (typeof cargarLeads === 'function') cargarLeads();
    if (typeof cargarCadencia === 'function' && $('cadResumen')) cargarCadencia();
  } catch (e) { alert('No se pudo archivar: ' + e.message); }
}

// ---- 3x5: distribución de resultados por gestora (una barra por GP) ----
function renderCadDistribucion(funnel, distGP) {
  const cont = $('cadHighlights'); if (!cont) return;
  // ----- Embudo de totales (40%) -----
  const fstages = [
    ['Asignados', funnel.llegaron || 0, '#123A63'],
    ['Tocados', funnel.tocados || 0, '#0B72E8'],
    ['Conectados', funnel.conectados || 0, '#1AA3A3'],
    ['Calificados', funnel.calificados || 0, '#1D9E75'],
  ];
  const fmax = Math.max(1, funnel.llegaron || 0);
  const base = funnel.llegaron || 0;
  const funnelHtml = fstages.map(s => {
    const w = Math.max(6, Math.round((s[1] / fmax) * 100));
    const pct = base ? Math.round((s[1] / base) * 100) : 0;
    return '<div class="cad-fn-row">' +
      '<div class="cad-fn-lbl">' + s[0] + '</div>' +
      '<div class="cad-fn-track"><div class="cad-fn-bar" style="width:' + w + '%;background:' + s[2] + '">' +
      '<span class="cad-fn-n">' + s[1] + '</span></div></div>' +
      '<div class="cad-fn-pct">' + pct + '%</div>' +
    '</div>';
  }).join('');
  const funnelBox = '<div class="hl-box cad-funnel-box"><div class="hl-box-tit">Embudo de contactabilidad</div>' + funnelHtml + '</div>';

  // ----- Distribución por gestora (60%) -----
  const segs = [
    ['cal', 'Calificó', '#1D9E75'],
    ['sincal', 'Sin calificar', '#EF9F27'],
    ['sinresp', 'Solo intentos', '#85B7EB'],
    ['descarte', 'Descarte', '#E24B4A'],
    ['vacio', 'Sin tocar', '#D3D1C7'],
  ];
  let distBox = '';
  if (distGP && distGP.length) {
    const filas = distGP.map(g => {
      const tot = g.total || 1;
      const barra = segs.map(s => {
        const n = g[s[0]];
        if (!n) return '';
        const pct = Math.round((n / tot) * 100);
        const w = n / tot * 100;
        const txt = w >= 11 ? (n + ' (' + pct + '%)') : (w >= 6 ? String(n) : '');
        const oscuro = s[0] === 'vacio';
        return '<div style="width:' + w + '%;background:' + s[2] + '" title="' + s[1] + ': ' + n + ' (' + pct + '%)">' +
          (txt ? '<span class="hl-seg-lbl" style="color:' + (oscuro ? '#5B6470' : '#fff') + '">' + txt + '</span>' : '') +
          '</div>';
      }).join('');
      return '<div class="hl-gprow"><div class="hl-gpn">' + g.nombre + ' <span class="hl-gpt">' + g.total + '</span></div>' +
        '<div class="hl-dist">' + barra + '</div></div>';
    }).join('');
    const leyenda = '<div class="hl-dist-leg">' + segs.map(s => '<span><i style="background:' + s[2] + '"></i>' + s[1] + '</span>').join('') + '</div>';
    distBox = '<div class="hl-box cad-dist-box"><div class="hl-box-tit">Distribución de resultados por gestora</div>' + filas + leyenda + '</div>';
  }
  cont.innerHTML = '<div class="cad-row2">' + funnelBox + distBox + '</div>';
}

// ---- Reporte: llegada de leads por franja horaria (3h) ----
const LLG_BANDAS = ['00:00 – 03:00', '03:00 – 06:00', '06:00 – 09:00', '09:00 – 12:00', '12:00 – 15:00', '15:00 – 18:00', '18:00 – 21:00', '21:00 – 24:00'];
let LLG_DATOS = null;
function abrirLlegadas() {
  $('ovLlegadas').classList.add('act');
  cargarLlegadas();
}
async function cargarLlegadas() {
  try {
    const desde = $('llgDesde') ? $('llgDesde').value : '';
    const hasta = $('llgHasta') ? $('llgHasta').value : '';
    const qs = new URLSearchParams();
    if (desde) qs.set('desde', desde); if (hasta) qs.set('hasta', hasta);
    const d = await api('/api/dashboard/llegadas-horario?' + qs.toString());
    LLG_DATOS = d;
    if ($('llgResumen')) {
      $('llgResumen').innerHTML =
        '<div class="llg-rc"><div class="llg-rc-v">' + d.total + '</div><div class="llg-rc-l">Total recibidos</div></div>' +
        '<div class="llg-rc"><div class="llg-rc-v" style="color:#1D9E75">' + d.nuevos + '</div><div class="llg-rc-l">Nuevos (creados)</div></div>' +
        '<div class="llg-rc"><div class="llg-rc-v" style="color:#BA7517">' + d.duplicados + '</div><div class="llg-rc-l">Duplicados</div></div>' +
        '<div class="llg-rc"><div class="llg-rc-v" style="color:#8593A4">' + d.sinNombre + '</div><div class="llg-rc-l">Sin nombre</div></div>';
    }
    const max = Math.max(1, ...d.bandas);
    $('llgChart').innerHTML = LLG_BANDAS.map((lbl, i) => {
      const n = d.bandas[i];
      const pct = (n / max) * 100;
      const pctTot = d.total ? Math.round((n / d.total) * 100) : 0;
      return '<div class="llg-row">' +
        '<div class="llg-lbl">' + lbl + '</div>' +
        '<div class="llg-bar-wrap"><div class="llg-bar" style="width:' + Math.max(n > 0 ? 3 : 0, pct) + '%"></div></div>' +
        '<div class="llg-num">' + n + '<span class="llg-pct"> · ' + pctTot + '%</span></div>' +
      '</div>';
    }).join('') + '<div class="llg-total">Total: <b>' + d.total + '</b> leads</div>';
  } catch (e) {
    if ($('llgChart')) $('llgChart').innerHTML = '<div class="cad-vacio">No se pudo cargar: ' + e.message + '</div>';
  }
}
// Dibuja el reporte en un canvas y lo copia al portapapeles como imagen PNG.
async function copiarLlegadasImagen() {
  if (!LLG_DATOS) { acToast('Aún no hay datos para copiar.'); return; }
  const d = LLG_DATOS;
  const cv = $('llgCanvas');
  const W = 760, padX = 36, rowH = 44, top = 116, bottom = 56;
  const H = top + LLG_BANDAS.length * rowH + bottom;
  const scale = 2; // nitidez retina
  cv.width = W * scale; cv.height = H * scale;
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  // Fondo
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#123A63'; ctx.fillRect(0, 0, W, 8);
  // Título
  ctx.fillStyle = '#123A63'; ctx.font = '700 22px Arial, sans-serif'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('Llegada de leads de marketing por franja horaria', padX, 48);
  ctx.fillStyle = '#7A8794'; ctx.font = '400 13px Arial, sans-serif';
  const rango = (d.desde || d.hasta) ? ('Recepción: ' + (d.desde || '…') + ' a ' + (d.hasta || 'hoy')) : 'Todos los ingresos de marketing';
  ctx.fillText(rango + '  ·  incluye duplicados', padX, 70);
  ctx.fillStyle = '#123A63'; ctx.font = '600 13px Arial, sans-serif';
  ctx.fillText('Total: ' + d.total + '   ·   Nuevos: ' + d.nuevos + '   ·   Duplicados: ' + d.duplicados + '   ·   Sin nombre: ' + d.sinNombre, padX, 88);
  ctx.strokeStyle = '#E7EBF0'; ctx.beginPath(); ctx.moveTo(padX, 100); ctx.lineTo(W - padX, 100); ctx.stroke();

  const max = Math.max(1, ...d.bandas);
  const lblW = 110, numW = 78;
  const barX = padX + lblW + 10;
  const barMax = W - padX - numW - barX - 8;
  d.bandas.forEach((n, i) => {
    const y = top + i * rowH;
    // etiqueta
    ctx.fillStyle = '#475569'; ctx.font = '600 13px Arial, sans-serif';
    ctx.fillText(LLG_BANDAS[i], padX, y + 20);
    // pista de barra
    ctx.fillStyle = '#EEF2F7';
    roundRect(ctx, barX, y + 6, barMax, 20, 6); ctx.fill();
    // barra
    const w = Math.max(n > 0 ? 6 : 0, (n / max) * barMax);
    if (w > 0) {
      const grad = ctx.createLinearGradient(barX, 0, barX + w, 0);
      grad.addColorStop(0, '#1E5FA8'); grad.addColorStop(1, '#3B82C4');
      ctx.fillStyle = grad; roundRect(ctx, barX, y + 6, w, 20, 6); ctx.fill();
    }
    // número + %
    const pctTot = d.total ? Math.round((n / d.total) * 100) : 0;
    ctx.fillStyle = '#123A63'; ctx.font = '700 15px Arial, sans-serif';
    ctx.fillText(String(n), W - padX - numW + 6, y + 21);
    ctx.fillStyle = '#9AA8B8'; ctx.font = '400 12px Arial, sans-serif';
    ctx.fillText(pctTot + '%', W - padX - numW + 34, y + 21);
  });
  // Pie
  ctx.fillStyle = '#9AA8B8'; ctx.font = '400 11px Arial, sans-serif';
  ctx.fillText('TasaTop · MiTasaTop · ' + new Date().toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), padX, H - 22);

  // Copiar al portapapeles
  cv.toBlob(async blob => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      acToast('✅ Imagen copiada. Pégala en WhatsApp o correo.');
    } catch (err) {
      // Fallback: descargar
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'llegadas-por-hora.png'; a.click();
      acToast('Imagen descargada (tu navegador no permitió copiar directo).');
    }
  }, 'image/png');
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- Ranking de contactabilidad (modal flotante) ----
let RK_TIMER = null, RK_CD_TIMER = null, RK_CD_SEG = 0;
function abrirRanking() {
  $('ovRank').classList.add('act');
  cargarRanking();
  if (RK_TIMER) clearInterval(RK_TIMER);
  RK_TIMER = setInterval(cargarRanking, 60 * 1000);
}
// Al cerrar el modal, detener timers
(function () {
  const _cerrar = window.cerrar;
  window.cerrar = function (id) {
    if (id === 'ovRank') { if (RK_TIMER) { clearInterval(RK_TIMER); RK_TIMER = null; } if (RK_CD_TIMER) { clearInterval(RK_CD_TIMER); RK_CD_TIMER = null; } }
    return _cerrar(id);
  };
})();
// Avatar circular con iniciales y color por nombre
function rkAvatar(nombre, cls) {
  const partes = String(nombre || '?').trim().split(/\s+/);
  const ini = ((partes[0] || '')[0] || '') + ((partes[1] || '')[0] || '');
  const colores = ['#E0732B', '#1D9E75', '#7C5BD9', '#0B72E8', '#E24B4A', '#BA7517', '#1AA3A3', '#C13D8C'];
  let h = 0; for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  const c = colores[h % colores.length];
  return '<span class="' + (cls || 'rk-av') + '" style="background:' + c + '">' + ini.toUpperCase() + '</span>';
}
function rkFmt(n) { return Number.isInteger(n) ? n : (Math.round(n * 10) / 10).toFixed(1); }
function rkFmtCD(seg) {
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  const z = n => String(n).padStart(2, '0');
  return z(h) + ':' + z(m) + ':' + z(s);
}
function rkTickCD() {
  if (RK_CD_SEG > 0) RK_CD_SEG--;
  if ($('rkReinicio')) $('rkReinicio').textContent = rkFmtCD(RK_CD_SEG);
}
async function cargarRanking() {
  try {
    const d = await api('/api/ranking/contactabilidad');
    const rk = d.ranking || [];
    const META = d.meta || 7;
    if ($('rkUpd')) $('rkUpd').textContent = cadHora12(d.actualizado);
    // Conteo regresivo al reinicio (medianoche Perú)
    RK_CD_SEG = d.segundosReinicio || 0;
    if ($('rkReinicio')) $('rkReinicio').textContent = rkFmtCD(RK_CD_SEG);
    if (RK_CD_TIMER) clearInterval(RK_CD_TIMER);
    RK_CD_TIMER = setInterval(rkTickCD, 1000);
    const yo = (typeof YO !== 'undefined' && YO) ? YO.nombre : '';
    const medalla = ['🥇', '🥈', '🥉'];

    // Podio (top 3) — orden visual 2-1-3, con tarima
    const top = rk.slice(0, 3);
    const ordenVis = [top[1], top[0], top[2]].filter(Boolean);
    $('rkPodio').innerHTML = ordenVis.map(g => {
      const pos = rk.indexOf(g);
      const alturas = { 0: 'rk-p1', 1: 'rk-p2', 2: 'rk-p3' };
      const mio = g.asesor === yo ? ' rk-mio' : '';
      return '<div class="rk-pod ' + (alturas[pos] || '') + mio + '">' +
        '<div class="rk-pod-rank">' + (pos + 1) + '</div>' +
        '<div class="rk-pod-n">' + primerNombre(g.asesor) + '</div>' +
        '<div class="rk-pod-v">' + rkFmt(g.puntaje) + '</div>' +
        '<div class="rk-pod-l">puntos</div>' +
      '</div>';
    }).join('') || '<div class="rk-vacio">Aún no hay actividad hoy. ¡Sé la primera! 📞</div>';

    // Tarjeta META individual (cada GP: sus calificados vs 7). Admin/jefa ve la del líder como referencia.
    const miReg = rk.find(g => g.asesor === yo) || rk[0] || { calificados: 0, racha: 0, intentos: 0 };
    const soyGP = rk.some(g => g.asesor === yo);
    const pctMeta = Math.min(100, Math.round((miReg.calificados / META) * 100));
    const metaMsg = miReg.calificados >= META ? '¡Meta cumplida! 🎉' : (pctMeta >= 50 ? 'Vas por buen camino ↑' : '¡A darle con todo!');
    if ($('rkMeta')) $('rkMeta').innerHTML =
      '<div class="rk-card-tit">🎯 ' + (soyGP ? 'Tu meta diaria' : 'Meta diaria (por GP)') + '</div>' +
      '<div class="rk-card-big">' + META + ' <small>calificados por gestora</small></div>' +
      '<div class="rk-meta-bar"><div style="width:' + pctMeta + '%"></div></div>' +
      '<div class="rk-meta-x">' + (soyGP ? 'Tú: ' : (primerNombre(miReg.asesor || '') + ': ')) + miReg.calificados + ' / ' + META + '</div>' +
      '<div class="rk-meta-msg">' + (soyGP ? metaMsg : 'Cada GP tiene su propia meta de 7') + '</div>';

    // Tarjeta RACHA — los círculos arrancan HOY hacia adelante (J,V,S,D...)
    const racha = miReg.racha || 0;
    const labels = d.diasRacha || ['', '', '', '', '', '', ''];
    const hoyActivo = (miReg.intentos || 0) > 0; // hoy se enciende con la 1ra llamada
    const dots = labels.map((dn, i) => {
      const on = i === 0 ? hoyActivo : false; // hoy: por actividad; futuros: vacíos hasta que lleguen
      return '<span class="rk-dotw"><span class="rk-dot ' + (on ? 'on' : '') + '">' + (on ? '✓' : '') + '</span><small>' + dn + '</small></span>';
    }).join('');
    if ($('rkRacha')) $('rkRacha').innerHTML =
      '<div class="rk-card-tit">🔥 Racha</div>' +
      '<div class="rk-card-big">' + racha + ' <small>días seguidos</small></div>' +
      '<div class="rk-racha-msg">' + (hoyActivo ? '¡Hoy ya arrancaste! 💪' : 'Haz tu primera llamada y enciende el día') + '</div>' +
      '<div class="rk-dots">' + dots + '</div>';

    // Tabla completa
    const head = '<div class="rk-row rk-head"><span>#</span><span>Gestora</span><span>Puntos</span><span>Intentos</span><span>Conectados</span><span>Calificados</span><span>Aircall</span></div>';
    $('rkTabla').innerHTML = head + rk.map((g, i) => {
      const mio = g.asesor === yo ? ' rk-mio-row' : '';
      const pos = i < 3 ? medalla[i] : (i + 1);
      const tag = i === 0 ? ' <span class="rk-lider">Líder del día</span>' : (g.asesor === yo ? ' <span class="rk-tu">tú</span>' : '');
      return '<div class="rk-row' + mio + '">' +
        '<span class="rk-pos">' + pos + '</span>' +
        '<span class="rk-n">' + rkAvatar(g.asesor, 'rk-av') + g.asesor + tag + '</span>' +
        '<span class="rk-big">' + rkFmt(g.puntaje) + '</span>' +
        '<span>' + g.intentos + '</span>' +
        '<span>' + g.conectados + '</span>' +
        '<span class="rk-cal">' + g.calificados + '</span>' +
        '<span class="rk-verif">' + (g.verificadas || 0) + '</span>' +
      '</div>';
    }).join('');
    RK_DATA = rk;
  } catch (e) {
    if ($('rkTabla')) $('rkTabla').innerHTML = '<div class="rk-vacio">No se pudo cargar el ranking: ' + e.message + '</div>';
  }
}
function primerNombre(n) { return String(n || '').trim().split(/\s+/)[0] || n; }

// ---- Tira rotativa de ranking en Mis Leads (siempre visible, rota cada 10s) ----
let RK_DATA = null, TIRA_DATA = null, TIRA_VISTA = 0, TIRA_ROT = null, TIRA_REFRESH = null;
async function cargarTiraData() {
  try {
    const d = await api('/api/ranking/contactabilidad');
    TIRA_DATA = d.ranking || [];
    renderTira();
  } catch (e) { /* silencioso: la tira no debe romper Mis Leads */ }
}
function iniciarTira() {
  if (!$('tiraRank')) return;
  cargarTiraData();
  if (TIRA_ROT) clearInterval(TIRA_ROT);
  TIRA_ROT = setInterval(() => { TIRA_VISTA = TIRA_VISTA ? 0 : 1; renderTira(); }, 10000);
  if (TIRA_REFRESH) clearInterval(TIRA_REFRESH);
  TIRA_REFRESH = setInterval(cargarTiraData, 3 * 60 * 1000);
}
function renderTira() {
  const el = $('tiraRank'); if (!el || !TIRA_DATA) return;
  const yo = (typeof YO !== 'undefined' && YO) ? YO.nombre : '';
  const medalla = ['🥇', '🥈', '🥉'];
  let html;
  if (TIRA_VISTA === 0) {
    // Vista A: PODIO top 3
    const top = TIRA_DATA.slice(0, 3);
    const pods = top.map((g, i) => {
      const mio = g.asesor === yo ? ' tira-mio' : '';
      return '<span class="tira-pod' + mio + '"><span class="tira-pod-m">' + medalla[i] + '</span>' +
        '<span class="tira-pod-n">' + primerNombre(g.asesor) + '</span>' +
        '<span class="tira-pod-v">' + rkFmt(g.puntaje) + ' pts</span></span>';
    }).join('');
    html = '<div class="tira-in tira-podio"><span class="tira-tit">🏆 Podio de hoy</span>' + pods + '</div>';
  } else {
    // Vista B: POSICIÓN PERSONAL (apunta al inmediato superior)
    html = '<div class="tira-in"><span class="tira-tit">📊 Tu posición</span><span class="tira-pers">' + textoPosicionPersonal(yo) + '</span></div>';
  }
  el.innerHTML = html;
  el.classList.remove('tira-fade'); void el.offsetWidth; el.classList.add('tira-fade');
}
function textoPosicionPersonal(yo) {
  const rk = TIRA_DATA || [];
  const idx = rk.findIndex(g => g.asesor === yo);
  // admin/jefa (no están en el ranking de GPs): mostrar al líder
  if (idx === -1) {
    const lider = rk[0];
    return lider ? ('Lidera <b>' + primerNombre(lider.asesor) + '</b> con <b>' + rkFmt(lider.puntaje) + ' pts</b>') : 'Aún sin actividad hoy';
  }
  const yoReg = rk[idx];
  if (idx === 0) {
    const sig = rk[1];
    if (sig) return '🥇 ¡Vas 1°! Te sigue <b>' + primerNombre(sig.asesor) + '</b> a <b>' + rkFmt(yoReg.puntaje - sig.puntaje) + ' pts</b>';
    return '🥇 ¡Vas 1°! Lideras con <b>' + rkFmt(yoReg.puntaje) + ' pts</b>';
  }
  const arriba = rk[idx - 1];
  const falta = arriba.puntaje - yoReg.puntaje;
  return 'Vas <b>' + (idx + 1) + '°</b> con <b>' + rkFmt(yoReg.puntaje) + ' pts</b> · te faltan <b>' + rkFmt(falta <= 0 ? 0.5 : falta) + '</b> para alcanzar a <b>' + primerNombre(arriba.asesor) + '</b> 🔼';
}

// ========== MÓDULO B2B (Fase 1: alta, listado) ==========
let B2B_TIMER = null;
function b2bBuscarDebounce() { clearTimeout(B2B_TIMER); B2B_TIMER = setTimeout(cargarB2B, 350); }

const B2B_ESTADO_COL = {
  'Nuevo': '#85B7EB', 'Filtro credito': '#0B72E8', 'Apto credito': '#1D9E75',
  'Filtro garantia': '#0B72E8', 'Apto garantia': '#1D9E75', 'Filtro finanzas': '#7C5BD9',
  'Expediente': '#1D9E75', 'Amarillo/nurture': '#EF9F27', 'Traspasado B2B': '#534AB7',
  'Reunion agendada': '#534AB7', 'No responde': '#888780', 'No elegible': '#E24B4A'
};
const B2B_TICKET_COL = { 'Bajo': '#85B7EB', 'Medio': '#EF9F27', 'Alto': '#1D9E75' };

async function cargarB2B() {
  const cont = $('b2bCont'); if (!cont) return;
  try {
    const estado = $('b2bEstado') ? $('b2bEstado').value : '';
    const q = $('b2bQ') ? $('b2bQ').value.trim() : '';
    const qs = new URLSearchParams();
    if (estado) qs.set('estado', estado);
    if (q) qs.set('q', q);
    const d = await api('/api/b2b/solicitudes' + (qs.toString() ? '?' + qs.toString() : ''));
    const lista = d.solicitudes || [];
    // Resumen por estado
    const porEstado = {};
    lista.forEach(s => { porEstado[s.estado] = (porEstado[s.estado] || 0) + 1; });
    $('b2bResumen').innerHTML = '<span class="b2b-chip"><b>' + d.total + '</b> solicitudes</span>' +
      Object.entries(porEstado).map(([e, n]) =>
        '<span class="b2b-chip"><i style="background:' + (B2B_ESTADO_COL[e] || '#888') + '"></i>' + trEstadoB2B(e) + ': ' + n + '</span>').join('');
    if (!lista.length) { cont.innerHTML = '<div class="vacio">No hay solicitudes con estos filtros. Crea una con “+ Nueva solicitud”.</div>'; return; }
    cont.innerHTML = '<div style="overflow-x:auto"><table class="mt-tabla b2b-tabla"><thead><tr>' +
      '<th>Código</th><th>Empresa</th><th>RUC</th><th>Contacto</th><th>Monto</th><th>Ticket</th><th>Estado</th><th>Responsable</th><th>Ingreso</th>' +
      '</tr></thead><tbody>' +
      lista.map(s =>
        '<tr>' +
        '<td><span class="b2b-cod">' + s.codigo + '</span></td>' +
        '<td><b>' + (s.razonSocial || '—') + '</b>' + (s.nombreComercial ? '<div class="b2b-sub">' + s.nombreComercial + '</div>' : '') + '</td>' +
        '<td>' + (s.ruc || '—') + '</td>' +
        '<td>' + (s.contacto || '—') + (s.telefono ? '<div class="b2b-sub">' + s.telefono + '</div>' : '') + '</td>' +
        '<td>' + (s.montoSolicitado != null ? fmtSoles(s.montoSolicitado) : '—') + '</td>' +
        '<td>' + (s.ticket ? '<span class="b2b-pill" style="background:' + (B2B_TICKET_COL[s.ticket] || '#888') + '22;color:' + (B2B_TICKET_COL[s.ticket] || '#888') + '">' + s.ticket + '</span>' : '—') + '</td>' +
        '<td><span class="b2b-pill" style="background:' + (B2B_ESTADO_COL[s.estado] || '#888') + '22;color:' + (B2B_ESTADO_COL[s.estado] || '#888') + '">' + trEstadoB2B(s.estado) + '</span></td>' +
        '<td>' + (s.responsableActual ? primerNombre(s.responsableActual) : '—') + '</td>' +
        '<td>' + (s.fechaIngreso ? fmtFecha(s.fechaIngreso) : '—') + '</td>' +
        '</tr>').join('') +
      '</tbody></table></div>';
  } catch (e) {
    cont.innerHTML = '<div class="vacio">No se pudo cargar B2B: ' + e.message + '</div>';
  }
}

function trEstadoB2B(e) {
  const M = { 'Filtro credito': 'Filtro crédito', 'Apto credito': 'Apto crédito', 'Filtro garantia': 'Filtro garantía', 'Apto garantia': 'Apto garantía', 'Filtro finanzas': 'Filtro finanzas', 'Reunion agendada': 'Reunión agendada' };
  return M[e] || e;
}

function abrirAltaB2B() {
  ['b2bRuc', 'b2bRazon', 'b2bComercial', 'b2bContacto', 'b2bTelefono', 'b2bEmail', 'b2bMonto', 'b2bTicket', 'b2bSector', 'b2bActividad', 'b2bAntiguedad', 'b2bVentas', 'b2bDestino', 'b2bRepago'].forEach(id => { if ($(id)) $(id).value = ''; });
  if ($('b2bAltaMsg')) $('b2bAltaMsg').textContent = '';
  $('ovAltaB2B').classList.add('act');
}

function b2bPreviewTicket() {
  const m = Number($('b2bMonto').value) || 0;
  let t = '';
  if (m >= 1000000) t = 'Alto'; else if (m >= 300000) t = 'Medio'; else if (m > 0) t = 'Bajo';
  $('b2bTicket').value = t;
}

async function guardarSolicitudB2B() {
  const ruc = $('b2bRuc').value.trim();
  const razon = $('b2bRazon').value.trim();
  if (!ruc && !razon) { $('b2bAltaMsg').textContent = 'Ingresa al menos RUC o razón social.'; return; }
  const body = {
    ruc, razonSocial: razon,
    nombreComercial: $('b2bComercial').value.trim(),
    contacto: $('b2bContacto').value.trim(),
    telefono: $('b2bTelefono').value.trim(),
    email: $('b2bEmail').value.trim(),
    montoSolicitado: $('b2bMonto').value ? Number($('b2bMonto').value) : null,
    sector: $('b2bSector').value.trim(),
    actividad: $('b2bActividad').value.trim(),
    antiguedadMeses: $('b2bAntiguedad').value ? Number($('b2bAntiguedad').value) : null,
    ventasEstimadas: $('b2bVentas').value ? Number($('b2bVentas').value) : null,
    destinoFondos: $('b2bDestino').value.trim(),
    fuenteRepago: $('b2bRepago').value.trim()
  };
  try {
    const r = await api('/api/b2b/solicitudes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    cerrar('ovAltaB2B');
    cargarB2B();
  } catch (e) {
    $('b2bAltaMsg').textContent = 'No se pudo registrar: ' + e.message;
  }
}

// --- B2B: toggle de paneles y bandeja de ingresos ---
function b2bRefrescar() { cargarB2B(); cargarIngresosB2B(); }

function b2bTab(which) {
  $('b2bPanelSol').classList.toggle('oculto', which !== 'sol');
  $('b2bPanelIng').classList.toggle('oculto', which !== 'ing');
  if ($('b2bPanelEq')) $('b2bPanelEq').classList.toggle('oculto', which !== 'eq');
  $('b2bTabSol').classList.toggle('act', which === 'sol');
  $('b2bTabIng').classList.toggle('act', which === 'ing');
  if ($('b2bTabEq')) $('b2bTabEq').classList.toggle('act', which === 'eq');
  if (which === 'sol') cargarB2B();
  else if (which === 'ing') cargarIngresosB2B();
  else if (which === 'eq') cargarEquipoB2B();
}

const B2B_ROL_TXT = { jefe_creditos: 'Jefe de Créditos', asistente_creditos: 'Créditos', jefe_b2b: 'Jefe B2B', funcionario_b2b: 'Funcionario' };

async function cargarEquipoB2B() {
  const cont = $('b2bEqCont'); if (!cont) return;
  try {
    const d = await api('/api/b2b/equipo');
    const eq = d.equipo || [];
    const gestiona = d.puedeGestionar;
    cont.innerHTML = '<div style="overflow-x:auto"><table class="mt-tabla b2b-tabla"><thead><tr>' +
      '<th>Nombre</th><th>Rol</th><th>Round-robin</th>' + (gestiona ? '<th></th>' : '') +
      '</tr></thead><tbody>' +
      eq.map(m => {
        const esJefe = m.rol.startsWith('jefe_');
        const enRotacion = !esJefe && m.autoasignar;
        const estadoTxt = esJefe ? '<span class="b2b-sub">Supervisa (no rota)</span>' :
          (enRotacion ? '<span class="b2b-pill" style="background:#1D9E7522;color:#1D9E75">En rotación</span>' : '<span class="b2b-pill" style="background:#88878022;color:#888780">Fuera</span>');
        const btn = (gestiona && !esJefe) ?
          '<button class="btn sec" onclick="toggleAutoB2B(\'' + m.usuario + '\')">' + (enRotacion ? 'Quitar de rotación' : 'Poner en rotación') + '</button>' : '';
        return '<tr>' +
          '<td><b>' + m.nombre + '</b><div class="b2b-sub">' + m.usuario + '</div></td>' +
          '<td>' + (B2B_ROL_TXT[m.rol] || m.rol) + '</td>' +
          '<td>' + estadoTxt + '</td>' +
          (gestiona ? '<td>' + btn + '</td>' : '') +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';
  } catch (e) {
    cont.innerHTML = '<div class="vacio">No se pudo cargar el equipo: ' + e.message + '</div>';
  }
}

async function toggleAutoB2B(usuario) {
  try {
    await api('/api/b2b/equipo/' + encodeURIComponent(usuario) + '/autoasignar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    cargarEquipoB2B();
  } catch (e) { alert('No se pudo cambiar: ' + e.message); }
}

const B2B_ING_COL = {
  'creado': '#1D9E75', 'duplicado_activo': '#EF9F27', 'duplicado_historial': '#7C5BD9',
  'sin_datos': '#888780', 'error_validacion': '#E24B4A'
};
const B2B_ING_TXT = {
  'creado': 'Creado', 'duplicado_activo': 'Duplicado activo', 'duplicado_historial': 'Duplicado en historial',
  'sin_datos': 'Sin datos', 'error_validacion': 'Error'
};

async function cargarIngresosB2B() {
  const cont = $('b2bIngCont'); if (!cont) return;
  try {
    const d = await api('/api/b2b/ingresos');
    const lista = d.ingresos || [];
    // Badge: cuántos requieren gestión manual (duplicados + sin datos + error)
    const pendientes = lista.filter(i => i.estado !== 'creado').length;
    const badge = $('b2bIngBadge');
    if (badge) { badge.textContent = pendientes; badge.classList.toggle('oculto', pendientes === 0); }
    // Resumen
    const res = d.resumen || {};
    $('b2bIngResumen').innerHTML = '<span class="b2b-chip"><b>' + d.total + '</b> ingresos</span>' +
      Object.entries(res).map(([e, n]) => '<span class="b2b-chip"><i style="background:' + (B2B_ING_COL[e] || '#888') + '"></i>' + (B2B_ING_TXT[e] || e) + ': ' + n + '</span>').join('');
    if (!lista.length) { cont.innerHTML = '<div class="vacio">Aún no llegan ingresos por webhook.</div>'; return; }
    cont.innerHTML = '<div style="overflow-x:auto"><table class="mt-tabla b2b-tabla"><thead><tr>' +
      '<th>Recibido</th><th>Origen</th><th>Estado</th><th>RUC</th><th>Empresa</th><th>Teléfono</th><th>Monto</th><th>Garantía</th><th>Solicitud</th><th>Detalle</th>' +
      '</tr></thead><tbody>' +
      lista.map(i =>
        '<tr>' +
        '<td>' + (i.fechaRecepcion ? fmtFecha(i.fechaRecepcion) : '—') + '</td>' +
        '<td>' + (i.origen || '—') + '</td>' +
        '<td><span class="b2b-pill" style="background:' + (B2B_ING_COL[i.estado] || '#888') + '22;color:' + (B2B_ING_COL[i.estado] || '#888') + '">' + (B2B_ING_TXT[i.estado] || i.estado) + '</span></td>' +
        '<td>' + (i.ruc || '—') + '</td>' +
        '<td>' + (i.razonSocial || '—') + '</td>' +
        '<td>' + (i.telefono || '—') + '</td>' +
        '<td>' + (i.monto != null ? fmtSoles(i.monto) : '—') + '</td>' +
        '<td>' + (i.tieneInmueble ? (i.tieneInmueble + (i.tipoInmueble ? ' · ' + i.tipoInmueble : '')) : '—') + '</td>' +
        '<td>' + (i.codigoSolicitud ? '<span class="b2b-cod">' + i.codigoSolicitud + '</span>' : '—') + '</td>' +
        '<td>' + (i.mensajeError ? '<span class="b2b-sub">' + i.mensajeError + '</span>' : '—') + '</td>' +
        '</tr>').join('') +
      '</tbody></table></div>';
  } catch (e) {
    cont.innerHTML = '<div class="vacio">No se pudo cargar la bandeja: ' + e.message + '</div>';
  }
}
