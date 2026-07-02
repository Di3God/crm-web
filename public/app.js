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
  iniciarHeartbeat(); // latido de presencia (Modo Supervisor)
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
  // Gestión del equipo B2B (en el menú de usuario): admin y jefes B2B.
  if (['admin', 'jefe_creditos', 'jefe_b2b'].includes(YO.rol)) {
    document.querySelectorAll('.soloEquipoB2B').forEach(e => e.classList.remove('oculto'));
  }
  // Columnas de control de la tabla: visibles solo para admin/jefa
  if (YO.rol === 'admin' || YO.rol === 'jefa') document.body.classList.add('ve-todo');

  // ===== Navegación de dos mundos: qué menú e ítems ve cada rol =====
  const ver = ids => ids.forEach(id => { const e = $(id); if (e) e.classList.remove('oculto'); });
  const verMundo = m => { const e = $('mundo' + m); if (e) e.classList.remove('oculto'); };
  let mundoInicial = null;
  const r = YO.rol;
  if (r === 'admin') {
    verMundo('B2C'); verMundo('B2B');
    ver(['mi-leads', 'mi-chat', 'mi-brutos', 'mi-releads', 'mi-dash', 'mi-atribucion', 'mi-supervisor', 'mi-audit']);
    ver(['mi-b2b-sol', 'mi-b2b-ing', 'mi-b2b-releads', 'mi-b2b-audit']);
    mundoInicial = 'B2C';
  } else if (r === 'gestora') {
    verMundo('B2C'); ver(['mi-leads']); mundoInicial = 'B2C';
  } else if (r === 'jefa') {
    verMundo('B2C'); ver(['mi-leads', 'mi-dash', 'mi-brutos', 'mi-releads', 'mi-supervisor']); mundoInicial = 'B2C';
  } else if (r === 'asistente_creditos' || r === 'funcionario_b2b') {
    verMundo('B2B'); ver(['mi-b2b-sol']); mundoInicial = 'B2B';
  } else if (r === 'jefe_creditos') {
    verMundo('B2B'); ver(['mi-b2b-sol']); mundoInicial = 'B2B';
  } else if (r === 'jefe_b2b') {
    verMundo('B2B'); ver(['mi-b2b-sol', 'mi-b2b-ing', 'mi-b2b-releads', 'mi-b2b-audit']); mundoInicial = 'B2B';
  }
  MUNDO_INICIAL = mundoInicial;
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
  // Vista inicial según el mundo del rol.
  if (MUNDO_INICIAL === 'B2B') { ir('b2b'); b2bTab('sol'); }
  else cargarLeads();
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
  if (SUP_TIMER) { clearInterval(SUP_TIMER); SUP_TIMER = null; }  // detener refresco del tablero al salir
  const vista = $('v-' + v); if (vista) vista.classList.add('act');
  const nvBtn = $('nv-' + v); if (nvBtn) nvBtn.classList.add('act');
  if (v === 'dash') cargarDashboard();
  if (v === 'audit') cargarAuditoria();
  if (v === 'cohortes') cargarCohortes();
  if (v === 'brutos') cargarBrutos();
  if (v === 'releads') cargarReleads();
  if (v === 'chat') cargarChat();
  if (v === 'leads') cargarLeads();
  if (v === 'b2b') b2bRefrescar();
  if (v === 'b2b-audit') cargarAuditoriaB2B();
  if (v === 'atribucion') cargarMarketing();
  if (v === 'supervisor') { cargarSupervisor(); SUP_TIMER = setInterval(cargarSupervisor, 20000); cargarConexiones(); }
}

// ===== Navegación de dos mundos (B2C / B2B) =====
let MUNDO_INICIAL = null;
function toggleMundo(m, ev) {
  if (ev) ev.stopPropagation();
  const abrir = $('menu' + m);
  const otro = $('menu' + (m === 'B2C' ? 'B2B' : 'B2C'));
  if (otro) otro.classList.add('oculto');
  if (abrir) abrir.classList.toggle('oculto');
}
function cerrarMundos() {
  ['menuB2C', 'menuB2B'].forEach(id => { const e = $(id); if (e) e.classList.add('oculto'); });
}
function navB2C(v) { cerrarMundos(); ir(v); }
function navB2B(which) {
  cerrarMundos();
  if (which === 'releads') { ir('b2b-releads'); return; }
  if (which === 'audit') { ir('b2b-audit'); return; }
  ir('b2b');
  b2bTab(which === 'ing' ? 'ing' : 'sol');
}
function abrirEquipoB2B() { $('ovEquipoB2B').classList.add('act'); cargarEquipoB2B(); }
// Cierra los desplegables de mundo al hacer clic fuera.
document.addEventListener('click', (e) => {
  if (!e.target.closest('.mundo')) cerrarMundos();
});

function cerrar(id) { $(id).classList.remove('act'); }

// ===== Heartbeat de presencia (Modo Supervisor) =====
let HB_TIMER = null, _hbActivo = false;
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(ev =>
  document.addEventListener(ev, () => { _hbActivo = true; }, { passive: true }));
async function enviarLatido(forzar) {
  if (!YO) return;
  if (!forzar && !(_hbActivo && document.visibilityState === 'visible')) return;
  _hbActivo = false;
  // Contexto del latido: 'gestion' si el modal de gestión está abierto; 'revision' si está
  // abierta la trazabilidad de un lead (p.ej. la jefa verificando); null si solo navega.
  const modalG = $('ovGestion');
  const enGestion = modalG && modalG.classList.contains('act');
  const modalT = $('ovTraza');
  const enRevision = !enGestion && modalT && modalT.classList.contains('act') && tCodigoActual;
  let cuerpo = { leadCodigo: null, leadNombre: null, etapa: null, modo: null };
  if (enGestion) cuerpo = { leadCodigo: gCodigo || null, leadNombre: gLead ? (gLead.nombre || null) : null, etapa: gLead ? (gLead.etapa || null) : null, modo: 'gestion' };
  else if (enRevision) cuerpo = { leadCodigo: tCodigoActual, leadNombre: tNombreActual || null, etapa: null, modo: 'revision' };
  try {
    await api('/api/presencia/latido', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });
  } catch (e) { /* silencioso: el latido no debe molestar al usuario */ }
}
function iniciarHeartbeat() {
  if (HB_TIMER) clearInterval(HB_TIMER);
  enviarLatido(true);                              // un latido al entrar (aparece en línea de inmediato)
  HB_TIMER = setInterval(() => enviarLatido(false), 30000);
}

// ===== Tablero Supervisor =====
let SUP_TIMER = null;
function supTiempo(seg) {
  if (seg == null) return 'sin actividad registrada';
  if (seg < 60) return 'activa hace ' + seg + 's';
  const m = Math.floor(seg / 60); if (m < 60) return 'hace ' + m + ' min';
  const h = Math.floor(m / 60); return 'hace ' + h + ' h';
}
async function cargarSupervisor() {
  try {
    const d = await api('/api/supervisor/presencia');
    renderSupervisor(d);
  } catch (e) {
    if ($('supTablero')) $('supTablero').innerHTML = '<div class="muted">No se pudo cargar la presencia.</div>';
  }
}
function supHora(iso) { return iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '—'; }
function supDur(seg) {
  if (seg == null) return '—';
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
  return h > 0 ? (h + 'h ' + m + 'm') : (m + ' min');
}
function renderSupervisor(d) {
  const cont = $('supTablero'); if (!cont) return;
  const col = { en_linea: '#16A34A', ausente: '#F59E0B', desconectada: '#9AA5B1' };
  const txt = { en_linea: 'En línea', ausente: 'Ausente', desconectada: 'Desconectada' };
  const eq = d.equipo || [];
  const enLinea = eq.filter(g => g.estado === 'en_linea').length;
  cont.innerHTML = eq.map(g => {
    const ini = primerNombre(g.nombre).charAt(0) + (g.nombre.split(/\s+/)[1] ? g.nombre.split(/\s+/)[1].charAt(0) : '');
    const esJefa = g.rol === 'jefa';
    const met = (l, v) => '<div class="sup-met"><span class="sup-met-l">' + l + '</span><span class="sup-met-v">' + v + '</span></div>';
    let grid = met('Primera conexión', supHora(g.primeraConexion)) + met('Tiempo en CRM', supDur(g.tiempoDentroSeg));
    if (!esJefa) grid += met('Última gestión', supHora(g.ultimaGestion));
    grid += met('Última actividad', supHora(g.ultimaInteraccion));
    // Métricas de supervisión (jefa/admin): leads revisados hoy + reasignaciones.
    if (g.supervision) grid += met('Revisados hoy', g.supervision.revisados) + met('Reasignaciones', g.supervision.reasignaciones);
    // Línea de lead: gestionando (modal de gestión) o revisando (trazabilidad abierta).
    const leadLinea = '<div class="sup-lead">' + (g.leadNombre
      ? (g.modo === 'revision' ? '👁 Revisando: <b>' + g.leadNombre + '</b>' : '📋 Gestionando: <b>' + g.leadNombre + '</b>')
      : '<span class="muted">' + (esJefa ? 'Sin lead en revisión ahora' : 'Sin lead abierto ahora') + '</span>') + '</div>';
    return `
    <div class="sup-card sup-${g.estado}">
      <div class="sup-top">
        <div class="sup-id">
          <span class="sup-ava">${ini.toUpperCase()}</span>
          <div>
            <div class="sup-nom">${primerNombre(g.nombre)}${esJefa ? ' <span class="sup-tag">Jefa</span>' : ''}</div>
            <div class="sup-nom2">${g.nombre}</div>
          </div>
        </div>
        <span class="sup-pill" style="background:${col[g.estado]}1a;color:${col[g.estado]}"><span class="sup-bolita" style="background:${col[g.estado]}"></span>${txt[g.estado]}</span>
      </div>
      <div class="sup-grid2">${grid}</div>
      ${leadLinea}
    </div>`;
  }).join('');
  if ($('supResumen')) $('supResumen').textContent = enLinea + ' de ' + eq.length + ' en línea';
  if ($('supActualizado')) $('supActualizado').textContent = 'Actualizado ' + new Date(d.actualizado).toLocaleTimeString('es-PE');
}

let SUP_CHART = null;
const SUP_COLORES = ['#0B72E8', '#16A34A', '#F59E0B', '#9333EA', '#E11D48', '#0891B2', '#CA8A04'];
async function cargarConexiones() {
  const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  if ($('supDesde') && !$('supDesde').value) $('supDesde').value = hoy;
  if ($('supHasta') && !$('supHasta').value) $('supHasta').value = hoy;
  const desde = $('supDesde') ? $('supDesde').value : hoy;
  const hasta = $('supHasta') ? $('supHasta').value : hoy;
  const modo = $('supModo') ? $('supModo').value : 'acumulado';
  let d;
  try { d = await api('/api/supervisor/conexiones?desde=' + desde + '&hasta=' + hasta); }
  catch (e) { return; }
  const labels = (d.horas || []).map(h => (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? 'am' : 'pm'));
  const div = (modo === 'promedio') ? Math.max(1, d.dias || 1) : 1;
  const datasets = (d.series || []).map((s, i) => {
    const color = SUP_COLORES[i % SUP_COLORES.length];
    const esJefa = s.rol === 'jefa';
    return {
      label: primerNombre(s.nombre) + (esJefa ? ' (Jefa)' : ''),
      data: s.datos.map(v => Math.round((v / div) * 10) / 10),
      borderColor: color, backgroundColor: color,
      borderDash: esJefa ? [6, 4] : [], tension: 0.35, borderWidth: 2,
      pointRadius: 3, pointHoverRadius: 5, fill: false
    };
  });
  // Plugin: etiqueta de datos en el punto pico de cada serie (la hora más activa).
  const picos = {
    id: 'picos',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di); if (meta.hidden) return;
        let maxV = -1, maxI = -1;
        ds.data.forEach((v, i) => { if (v > maxV) { maxV = v; maxI = i; } });
        if (maxV <= 0 || maxI < 0) return;
        const pt = meta.data[maxI]; if (!pt) return;
        ctx.save();
        ctx.font = '700 11px -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = ds.borderColor; ctx.textAlign = 'center';
        ctx.fillText(maxV + ' min', pt.x, pt.y - 8);
        ctx.restore();
      });
    }
  };
  if (SUP_CHART) SUP_CHART.destroy();
  const cv = $('supChart'); if (!cv) return;
  SUP_CHART = new Chart(cv.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 12 } } },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + c.parsed.y + ' min' } }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Minutos conectados' }, ticks: { precision: 0 } },
        x: { title: { display: true, text: 'Hora del día' }, grid: { display: false } }
      }
    },
    plugins: [picos]
  });
}

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
  cargarReuniones();
}

async function cargarTarjetas() {
  // Los scorecards bajo la tabla Control por GP se retiraron; la métrica útil ("Acciones para hoy")
  // ahora vive como tile encima de la tabla. Mantenemos el contenedor vacío.
  const t = $('tarjetas'); if (t) t.innerHTML = '';
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
// Grid de contactabilidad: 3 franjas (M manana <12h · T tarde 12-16h · N noche >16h) x 10 dias.
function renderGrid3x5(cb) {
  if (!cb || !cb.dias || !cb.dias.length) return '';
  const FR = ['M', 'T', 'N'];
  const COL = { contacto: '#1D9E75', intento: '#EF9F27', vacio: '#E9EEF4', futuro: '#FFFFFF' };
  const cols = cb.dias.map(d => {
    const celdas = d.franjas.map((f, i) => {
      const tip = d.dm + ' · ' + (i === 0 ? 'Mañana (<12h)' : i === 1 ? 'Tarde (12-16h)' : 'Noche (>16h)') + ' · ' +
        (f.estado === 'contacto' ? 'Contacto efectivo' : f.estado === 'intento' ? 'Intento sin contacto' : f.estado === 'futuro' ? 'Aún no llega' : 'Sin intento');
      return '<span class="g35-celda g35-' + f.estado + '" title="' + tip + '" style="background:' + COL[f.estado] + '"></span>';
    }).join('');
    const etCol = d.etapa && (typeof ETAPA_COLOR !== 'undefined') && ETAPA_COLOR[d.etapa] ? ETAPA_COLOR[d.etapa][0] : 'transparent';
    const etTip = d.etapa ? 'Etapa al cierre de ' + d.dm + ': ' + tr(d.etapa) : '';
    return '<div class="g35-dia"><div class="g35-celdas">' + celdas + '</div>' +
      '<div class="g35-etapa" title="' + etTip + '" style="background:' + etCol + '"></div>' +
      '<div class="g35-lbl">' + d.etiqueta + '<br><i>' + d.dm + '</i></div></div>';
  }).join('');
  const filaFr = '<div class="g35-frcol">' + FR.map(x => '<span class="g35-fr">' + x + '</span>').join('') + '<span class="g35-fr g35-fr-et">Et.</span></div>';
  return '<div class="g35-wrap"><div class="g35-head">Contactabilidad 3×5 <span class="sub">(3 franjas/día · 10 días desde la asignación)</span>' +
    '<span class="g35-leyenda"><i style="background:#1D9E75"></i>Contacto <i style="background:#EF9F27"></i>Intento <i style="background:#E9EEF4"></i>Sin intento <i style="background:#fff;border:1px dashed #C9D4E0"></i>Futuro <i style="background:linear-gradient(90deg,#F4CCCC 0 25%,#FFE599 25% 50%,#D9EAD3 50% 75%,#CFE2F3 75% 100%)"></i>Fila Et. = etapa del día</span></div>' +
    '<div class="g35-grid">' + filaFr + cols + '</div></div>';
}
let tCodigoActual = null, tTelActual = '', tNombreActual = '';
async function verTrazabilidad(codigo) {
  tCodigoActual = codigo;
  const t = await api('/api/leads/' + codigo + '/trazabilidad');
  tTelActual = t.telefono || (gLead && gLead.codigo === codigo ? gLead.telefono : '') || '';
  tNombreActual = t.nombre || '';
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

  // Grid de contactabilidad 3 franjas x 10 dias (desde la asignacion)
  $('tGrid3x5').innerHTML = renderGrid3x5(t.contactabilidad);

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
        asesor: $('nAsesor').value || null,
        fechaCreacion: ($('nFecha') && $('nFecha').value) || null,
        origenCreacion: ($('nOrigen') && $('nOrigen').value) || 'manual',
        campana: ($('nCampana') && $('nCampana').value) || null,
        conjunto: ($('nConjunto') && $('nConjunto').value) || null,
        anuncio: ($('nAnuncio') && $('nAnuncio').value) || null
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

let BRUTOS_FILAS = [];
async function cargarBrutos() {
  $('brutosCont').innerHTML = '<div class="vacio">Cargando...</div>';
  try {
    const desde = $('brutDesde') ? $('brutDesde').value : '';
    const hasta = $('brutHasta') ? $('brutHasta').value : '';
    let url = '/api/marketing/ingresos';
    const qs = [];
    if (desde) qs.push('desde=' + desde);
    if (hasta) qs.push('hasta=' + hasta);
    if (qs.length) url += '?' + qs.join('&');
    const d = await api(url);
    BRUTOS_FILAS = d.ingresos || [];
    if ($('brutTotal')) $('brutTotal').textContent = BRUTOS_FILAS.length + ' ingresos';
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
  if (i.estado === 'duplicado_activo') {
    btns += '<button class="bbtn azul" onclick="crearLeadBruto(' + i.id + ', true)" title="Cuenta como lead (costó) pero no se gestiona ni entra al embudo">Contar como lead</button>';
  }
  if (i.estado === 'sin_nombre') {
    btns += '<button class="bbtn verde" onclick="completarYCrear(' + i.id + ')" title="Escribir el nombre y crear el lead">Completar y crear</button>';
  }
  if (i.estado !== 'descartado') {
    btns += '<button class="bbtn gris" onclick="descartarBruto(' + i.id + ')">Descartar</button>';
  }
  if (i.codigoLead) {
    btns += '<button class="bbtn azul" onclick="editarAtribucionBruto(\'' + i.codigoLead + '\')" title="Editar campaña, conjunto y anuncio del lead">✏ Editar</button>';
  }
  if (YO && YO.rol === 'admin') {
    btns += '<button class="bbtn rojo" onclick="eliminarBrutoDef(' + i.id + ')" title="Eliminar definitivamente el ingreso y su lead (limpiar pruebas)">🗑 Eliminar</button>';
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
async function crearLeadBruto(id, soloConteo) {
  const msg = soloConteo
    ? '¿Contar este ingreso como lead duplicado?\n\nSuma a la cantidad de leads (porque costó), pero NO se gestiona ni entra al embudo (ya se está gestionando el original).'
    : '¿Crear un lead operativo desde este ingreso?';
  if (!confirm(msg)) return;
  try {
    const r = await api('/api/marketing/ingresos/' + id + '/crear-lead', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soloConteo: !!soloConteo })
    });
    alert(soloConteo ? 'Contado como lead duplicado: ' + r.codigoLead : 'Lead creado: ' + r.codigoLead);
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
  cargarDepuracion();
}

// ===== Depuración de Contactabilidad (3x5) =====
let DEPU = null, DEPU_PAG = 1, DEPU_ORD = 'critico', DEPU_TAB = 'depurar', DEPU_SEL = null, DEPU_SAB = null;
async function cargarDepuracion() {
  const cont = $('depuracion'); if (!cont) return;
  if (!veTodoJS()) { cont.innerHTML = ''; return; }   // solo admin/jefa
  const q = (DEPU_SAB === '0' || DEPU_SAB === '1') ? '?sabados=' + DEPU_SAB : '';
  try { DEPU = await api('/api/depuracion' + q); } catch (e) { cont.innerHTML = ''; return; }
  renderDepuracion();
}
function depuToggleSabado(on) { DEPU_SAB = on ? '1' : '0'; DEPU_PAG = 1; cargarDepuracion(); }
function depuOrdenar(filas) {
  const f = filas.slice();
  if (DEPU_ORD === 'dias') f.sort((a, b) => b.diasHabiles - a.diasHabiles);
  else if (DEPU_ORD === 'gp') f.sort((a, b) => a.asesor.localeCompare(b.asesor) || (a.intentos / a.maxPosibles) - (b.intentos / b.maxPosibles));
  else f.sort((a, b) => (a.intentos / a.maxPosibles) - (b.intentos / b.maxPosibles) || a.intentos - b.intentos); // críticos
  return f;
}
function renderDepuracion() {
  const cont = $('depuracion'); if (!cont || !DEPU) return;
  const d = DEPU, nCuar = d.enCuarentena ? d.enCuarentena.length : 0;
  let h = '<div class="db-tit">🧹 Depuración de Contactabilidad <span class="db-sub-inline">leads con +5 días hábiles aún en contactabilidad</span>' +
    '<label class="depu-sab" title="El contrato de ventas es L-V; el sábado es trabajo voluntario y por defecto no se cuenta.">' +
    '<input type="checkbox"' + (d.contarSabado ? ' checked' : '') + ' onchange="depuToggleSabado(this.checked)"> Contar sábados (voluntario)</label></div>';
  h += '<div class="depu-kpis">' +
    '<div class="depu-kpi"><div class="depu-kpi-v">' + d.total + '</div><div class="depu-kpi-l">Por depurar</div></div>' +
    '<div class="depu-kpi ok"><div class="depu-kpi-v">' + d.cumplieron + '</div><div class="depu-kpi-l">Cumplieron 3x5 · cuarentena/descarte</div></div>' +
    '<div class="depu-kpi warn"><div class="depu-kpi-v">' + d.noCumplieron + '</div><div class="depu-kpi-l">No cumplieron · falta protocolo</div></div>' +
    '<div class="depu-kpi"><div class="depu-kpi-v">' + nCuar + '</div><div class="depu-kpi-l">En cuarentena</div></div>' +
    '</div>';
  if (d.porGP && d.porGP.length) {
    h += '<div class="depu-porgp">';
    d.porGP.forEach(g => h += '<span class="depu-gp-chip"><b>' + primerNombre(g.asesor) + '</b> ' + g.total + ' <small>(' + g.cumplieron + ' cumpl · ' + g.noCumplieron + ' no)</small></span>');
    h += '</div>';
  }
  h += '<div class="depu-tabs">' +
    '<button class="depu-tab' + (DEPU_TAB === 'depurar' ? ' act' : '') + '" onclick="depuTab(\'depurar\')">Por depurar (' + d.total + ')</button>' +
    '<button class="depu-tab' + (DEPU_TAB === 'cuarentena' ? ' act' : '') + '" onclick="depuTab(\'cuarentena\')">En cuarentena (' + nCuar + ')</button>' +
    '</div>';
  h += DEPU_TAB === 'depurar' ? depuTablaDepurar() : depuTablaCuarentena();
  cont.innerHTML = h;
}
function depuTablaDepurar() {
  const filas = depuOrdenar(DEPU.filas), PP = 10, tot = filas.length, pags = Math.max(1, Math.ceil(tot / PP));
  if (DEPU_PAG > pags) DEPU_PAG = pags;
  const ini = (DEPU_PAG - 1) * PP, pagina = filas.slice(ini, ini + PP);
  let h = '<div class="depu-orden">Ordenar: <select onchange="DEPU_ORD=this.value;DEPU_PAG=1;renderDepuracion()">' +
    [['critico', 'Más críticos (menos contactos)'], ['dias', 'Más días hábiles'], ['gp', 'Por gestora']]
      .map(o => '<option value="' + o[0] + '"' + (DEPU_ORD === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
    '</select></div>';
  if (!tot) return h + '<div class="depu-vacio">✓ Nada por depurar — ningún lead lleva +5 días hábiles en contactabilidad.</div>';
  h += '<div style="overflow-x:auto"><table class="depu-tabla"><thead><tr><th>Lead</th><th>GP</th><th>Días háb.</th><th>Contactos</th><th>3x5</th><th>Último resultado</th><th>Acciones</th></tr></thead><tbody>';
  pagina.forEach(f => {
    const pct = Math.round(f.intentos / f.maxPosibles * 100);
    const col = pct >= 100 ? '#16A34A' : pct >= 60 ? '#F59E0B' : '#CC0000';
    h += '<tr class="depu-row' + (DEPU_SEL === f.codigo ? ' sel' : '') + '" onclick="depuSel(\'' + f.codigo + '\')">' +
      '<td><b>' + f.nombre + '</b><br><small class="muted">' + f.codigo + '</small></td>' +
      '<td>' + primerNombre(f.asesor) + '</td>' +
      '<td>' + f.diasHabiles + '</td>' +
      '<td><div class="depu-bar"><div class="depu-bar-in" style="width:' + pct + '%;background:' + col + '"></div></div><small>' + f.intentos + ' / ' + f.maxPosibles + '</small></td>' +
      '<td>' + (f.cumplio ? '<span class="depu-badge ok">Cumplió</span>' : '<span class="depu-badge no">Incompleto</span>') + '</td>' +
      '<td><small>' + (f.ultimoResultado || '—') + '</small></td>' +
      '<td class="depu-acc" onclick="event.stopPropagation()">' +
      '<button class="btn-mini sec" onclick="depuAccion(\'' + f.codigo + '\',\'cuarentena\')">Cuarentena</button>' +
      '<button class="btn-mini rojo" onclick="depuAccion(\'' + f.codigo + '\',\'descartar\')">Descartar</button>' +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  h += '<div class="depu-pag">' +
    '<button class="btn-mini sec" ' + (DEPU_PAG <= 1 ? 'disabled' : '') + ' onclick="DEPU_PAG--;renderDepuracion()">‹</button>' +
    '<span>' + DEPU_PAG + ' / ' + pags + '</span>' +
    '<button class="btn-mini sec" ' + (DEPU_PAG >= pags ? 'disabled' : '') + ' onclick="DEPU_PAG++;renderDepuracion()">›</button>' +
    '<small class="muted">' + tot + ' leads</small></div>';
  if (DEPU_SEL) { const f = DEPU.filas.find(x => x.codigo === DEPU_SEL); if (f) h += depuDetalle(f); }
  return h;
}
function depuDetalle(f) {
  const fr = ['Mañana (00–12)', 'Tarde (12–16)', 'Noche (16–24)'];
  let h = '<div class="depu-detalle"><div class="depu-det-tit">Cobertura 3x5 de ' + f.nombre + (f.telefono ? ' · ' + f.telefono : '') + '</div>';
  h += '<table class="depu-grid"><thead><tr><th></th>';
  for (let dia = 1; dia <= 5; dia++) h += '<th>Día ' + dia + '</th>';
  h += '</tr></thead><tbody>';
  fr.forEach((nom, fi) => {
    h += '<tr><td class="depu-fr">' + nom + '</td>';
    for (let dia = 0; dia < 5; dia++) { const on = f.grid[dia][fi]; h += '<td class="depu-cell ' + (on ? 'on' : 'off') + '">' + (on ? '✓' : '·') + '</td>'; }
    h += '</tr>';
  });
  h += '</tbody></table><div class="depu-det-acc"><button class="btn sec" onclick="verLeadDesdeBruto(\'' + f.codigo + '\')">Ver lead / reasignar</button></div></div>';
  return h;
}
function depuTablaCuarentena() {
  const cs = DEPU.enCuarentena || [];
  if (!cs.length) return '<div class="depu-vacio">No hay leads en cuarentena.</div>';
  let h = '<div style="overflow-x:auto"><table class="depu-tabla"><thead><tr><th>Lead</th><th>GP</th><th>Desde</th><th></th></tr></thead><tbody>';
  cs.forEach(c => h += '<tr><td><b>' + c.nombre + '</b><br><small class="muted">' + c.codigo + '</small></td><td>' + (c.asesor ? primerNombre(c.asesor) : '—') + '</td><td><small>' + (c.cuarentenaFecha ? fmtFecha(c.cuarentenaFecha) : '—') + '</small></td><td><button class="btn-mini" onclick="depuAccion(\'' + c.codigo + '\',\'reactivar\')">Reactivar</button></td></tr>');
  h += '</tbody></table></div>';
  return h;
}
function depuTab(t) { DEPU_TAB = t; DEPU_PAG = 1; DEPU_SEL = null; renderDepuracion(); }
function depuSel(cod) { DEPU_SEL = (DEPU_SEL === cod ? null : cod); renderDepuracion(); }
async function depuAccion(cod, accion) {
  const lbl = { cuarentena: 'enviar a cuarentena', descartar: 'descartar', reactivar: 'reactivar' };
  if (!confirm('¿Seguro de ' + lbl[accion] + ' este lead?')) return;
  const ep = '/api/leads/' + cod + '/' + accion;
  try { await api(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
  catch (e) { alert('No se pudo completar la acción.'); return; }
  DEPU_SEL = null; await cargarDepuracion();
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
  const money = n => 'S/ ' + Math.round(n || 0).toLocaleString('es-PE');
  const t = d.tiles || {};
  const vel = (t.velocidadMin == null) ? '—' : (t.velocidadMin < 60 ? t.velocidadMin + ' min' : (t.velocidadMin / 60).toFixed(1) + ' h');

  // ---- Tiles accionables ----
  const tile = (ico, tono, val, lbl, sub, filtro) => {
    const oc = filtro ? ' onclick="repartoTileFiltro(\'' + filtro + '\')" role="button" tabindex="0"' : '';
    return '<div class="rp-tile ' + tono + (filtro ? ' rp-clic' : '') + '"' + oc + '>' +
      '<span class="rp-tile-ic">' + ico + '</span><div class="rp-tile-tx">' +
      '<div class="rp-tile-v">' + val + '</div><div class="rp-tile-l">' + lbl + '</div>' +
      (sub ? '<div class="rp-tile-s">' + sub + '</div>' : '') + '</div></div>';
  };
  let tiles = '<div class="rp-tiles">';
  tiles += tile('⏱', 'azul', vel, 'Velocidad 1er contacto', 'asignación → contacto (7d)', '');
  tiles += tile('🆕', t.frescos && t.frescos.mas24h > 0 ? 'rojo' : '', (t.frescos ? t.frescos.total : 0), 'Frescos sin tocar', (t.frescos ? t.frescos.mas24h : 0) + ' llevan +24h', 'sincontactar');
  tiles += tile('🔥', t.calientes && t.calientes.count > 0 ? 'naranja' : '', (t.calientes ? t.calientes.count : 0), 'Calientes en riesgo', money(t.calientes ? t.calientes.monto : 0), '');
  tiles += tile('📅', '', t.accionesHoy || 0, 'Acciones para hoy', 'tareas programadas hoy', 'parahoy');
  tiles += tile('⏳', t.vencidos > 0 ? 'rojo' : '', t.vencidos || 0, 'Vencidos', 'acción atrasada', 'vencidos');
  tiles += tile('✅', 'verde', (t.cerradosHoy ? t.cerradosHoy.count : 0), 'Cerrados hoy', money(t.cerradosHoy ? t.cerradosHoy.monto : 0), '');
  tiles += tile('📥', t.sinAsignar > 0 ? 'azul' : '', t.sinAsignar || 0, 'Sin asignar', 'por distribuir', 'sin-asignar');
  tiles += '</div>';

  // ---- Franja "requiere acción ahora" ----
  let franja = '';
  const al = d.alertas || [];
  if (!al.length) {
    franja = '<div class="rp-alerts"><span class="rp-ok">✓ Todo al día — sin pendientes urgentes</span></div>';
  } else {
    franja = '<div class="rp-alerts"><span class="rp-alerts-tit">Requiere acción ahora:</span>' +
      al.map(a => {
        const oc = a.filtro ? ' onclick="repartoTileFiltro(\'' + a.filtro + '\')" role="button" tabindex="0"' : '';
        return '<span class="rp-alert' + (a.filtro ? ' rp-clic' : '') + '"' + oc + '>' + a.icono + ' <b>' + a.n + '</b> ' + a.texto + '</span>';
      }).join('') + '</div>';
  }

  // ---- Tabla de control por GP ----
  const dot = est => '<span class="rp-dot rp-dot-' + (est || 'desconectada') + '" title="' + (est === 'en_linea' ? 'En línea' : est === 'ausente' ? 'Ausente' : 'Desconectada') + '"></span>';
  const cR = (v, tono) => v > 0 ? '<span class="rp-' + tono + '">' + v + '</span>' : '<span class="rp-cero">0</span>';
  let h = '<div class="rp-head"><div class="rp-tit">Control por GP</div><div class="rp-sub">Click en una GP para filtrar la tabla y reasignar · el punto = actividad en vivo</div></div>';
  h += '<div class="rp-wrap"><table class="rp-tabla rp-ctrl"><thead><tr>' +
    '<th class="rp-gp">GP</th><th>Asig. hoy</th><th>Cartera</th><th>Sin tocar +24h</th><th>Vencidos</th><th>🔥 Calientes</th><th>Agendados hoy</th>' +
    '</tr></thead><tbody>';
  d.filas.forEach(f => {
    const activa = selA === f.asesor && selF !== 'sin-asignar';
    h += '<tr class="rp-row rp-sal-' + (f.salud || 'gris') + (activa ? ' rp-activa' : '') + '" onclick="repartoFiltrar(\'' + f.asesor.replace(/'/g, "\\'") + '\')">' +
      '<td class="rp-gp">' + dot(f.estado) + f.asesor + '</td>' +
      '<td>' + f.asignadosHoy + '</td><td>' + f.cartera + '</td>' +
      '<td>' + cR(f.sinTocar24h, 'venc') + '</td><td>' + cR(f.vencidos, 'venc') + '</td>' +
      '<td>' + cR(f.calientes, 'cal') + '</td><td>' + cR(f.agendHM, 'ok') + '</td></tr>';
  });
  const eq = d.equipo;
  h += '<tr class="rp-eq"><td class="rp-gp">Equipo</td><td>' + eq.asignadosHoy + '</td><td>' + eq.cartera + '</td>' +
    '<td>' + (eq.sinTocar24h > 0 ? '<span class="rp-venc">' + eq.sinTocar24h + '</span>' : '0') + '</td>' +
    '<td>' + (eq.vencidos > 0 ? '<span class="rp-venc">' + eq.vencidos + '</span>' : '0') + '</td>' +
    '<td>' + (eq.calientes > 0 ? '<span class="rp-cal">' + eq.calientes + '</span>' : '0') + '</td>' +
    '<td>' + eq.agendHM + '</td></tr>';
  const s = d.sinAsignar; const sinAct = selF === 'sin-asignar';
  h += '<tr class="rp-row rp-sin' + (sinAct ? ' rp-activa' : '') + '" onclick="repartoSinAsignar()">' +
    '<td class="rp-gp">Sin asignar</td><td>—</td><td>' + s.cartera + '</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>';
  h += '</tbody></table></div>';

  $('reparto').innerHTML = tiles + franja + h;
}
function repartoTileFiltro(filtro) {
  if (!filtro) return;
  if (filtro === 'sin-asignar') { repartoSinAsignar(); return; }
  filtroRapido(filtro); // sincontactar / vencidos / parahoy
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

// ===== Reuniones agendadas (bloque dentro de Mis Leads, entre Control por GP y Gestión de oportunidades) =====
async function cargarReuniones() {
  const cont = $('reuBloque'); if (!cont) return;
  let d;
  try { d = await api('/api/reuniones'); } catch (e) { cont.classList.add('oculto'); return; }
  const rs = d.reuniones || [];
  if (!rs.length) { cont.classList.add('oculto'); cont.innerHTML = ''; return; }
  cont.classList.remove('oculto');
  const ahora = new Date();
  const hoyClave = fmtFechaHora(new Date().toISOString()).slice(0, 10); // dd/mm/yyyy
  let pasadas = 0, hoyN = 0, hayReprog = false;
  const estPill = { 'Confirmada': '#1D9E75', 'Reprogramada': '#EF9F27', 'Agendada': '#0B72E8' };
  rs.forEach(r => { if (r.fechaReprogramada) hayReprog = true; });
  const filas = rs.map(r => {
    const f = new Date(r.fechaOrden || r.fechaReunion);
    const vencida = f < ahora;
    const esHoy = fmtFechaHora(r.fechaOrden || r.fechaReunion).slice(0, 10) === hoyClave;
    if (vencida && !esHoy) pasadas++; if (esHoy) hoyN++;
    const badge = (vencida && !esHoy) ? '<span class="badge-venc">⚠ Pasó</span>'
      : (esHoy ? '<span class="tz-pill rosa">Hoy</span>' : '');
    const cEst = estPill[r.estadoLabel] || '#6B7A8D';
    const colReprog = hayReprog
      ? '<td>' + (r.fechaReprogramada ? '<b style="color:#B26A00">' + fmtFechaHora(r.fechaReprogramada) + '</b>' : '—') + '</td>'
      : '';
    return '<tr>' +
      '<td><b>' + fmtFechaHora(r.fechaReunion) + '</b> ' + badge + '</td>' +
      colReprog +
      '<td onclick="irALead(\'' + r.codigo + '\')" style="cursor:pointer"><b style="color:var(--azul)">' + (r.nombre || r.codigo) + '</b></td>' +
      '<td>' + (r.asesor || '—') + '</td>' +
      '<td><span class="b2b-pill" style="background:' + cEst + '22;color:' + cEst + '">' + (r.estadoLabel || 'Agendada') + '</span></td>' +
      '<td>' + (r.telefono || '—') + '</td>' +
      '</tr>';
  }).join('');
  const thReprog = hayReprog ? '<th>Reprogramada para</th>' : '';
  const resumen = rs.length + ' reunión(es)' + (hoyN ? ' · ' + hoyN + ' hoy' : '') + (pasadas ? ' · ' + pasadas + ' por actualizar' : '');
  cont.innerHTML =
    '<div class="barra barra-leads" style="margin-bottom:8px"><h2>Reuniones agendadas</h2><span class="sub" style="color:var(--muted)">' + resumen + '</span></div>' +
    '<table class="tabla"><thead><tr><th>Fecha y hora</th>' + thReprog + '<th>Lead</th><th>GP</th><th>Estado</th><th>Teléfono</th></tr></thead><tbody>' + filas + '</tbody></table>';
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

    // Tarjeta META GLOBAL del equipo: agendamientos de hoy vs 8.
    const metaGlobal = d.metaGlobal || META;
    const agEquipo = d.agendadosEquipo || 0;
    const pctMeta = Math.min(100, Math.round((agEquipo / metaGlobal) * 100));
    const metaMsg = agEquipo >= metaGlobal ? '¡Meta del equipo cumplida! 🎉' : (pctMeta >= 50 ? 'El equipo va por buen camino ↑' : '¡Agendemos reuniones!');
    if ($('rkMeta')) $('rkMeta').innerHTML =
      '<div class="rk-card-tit">🎯 Meta del equipo (hoy)</div>' +
      '<div class="rk-card-big">' + metaGlobal + ' <small>agendamientos</small></div>' +
      '<div class="rk-meta-bar"><div style="width:' + pctMeta + '%"></div></div>' +
      '<div class="rk-meta-x">Equipo: ' + agEquipo + ' / ' + metaGlobal + '</div>' +
      '<div class="rk-meta-msg">' + metaMsg + '</div>';

    // Tarjeta RACHA — los círculos arrancan HOY hacia adelante (J,V,S,D...)
    const miReg = rk.find(g => g.asesor === yo) || rk[0] || { dias: [], intentos: 0 };
    const hist = d.diasHist || [];
    const misDias = miReg.dias || [];
    const diasActivos = misDias.filter(Boolean).length;
    const hoyActivo = misDias.length ? misDias[misDias.length - 1] : false;
    const dots = hist.map((dd, i) => {
      const on = misDias[i];
      const esHoy = i === hist.length - 1;
      // check verde si gestionó ese día; ámbar si no gestionó; hoy pendiente = ámbar hasta su 1ra gestión
      const cls = on ? 'on' : (esHoy ? 'hoy' : 'off');
      return '<span class="rk-dotw"><span class="rk-dot ' + cls + '">' + (on ? '✓' : '') + '</span><small>' + dd.label + '</small></span>';
    }).join('');
    if ($('rkRacha')) $('rkRacha').innerHTML =
      '<div class="rk-card-tit">🔥 Constancia</div>' +
      '<div class="rk-card-big">' + diasActivos + ' <small>de ' + hist.length + ' días</small></div>' +
      '<div class="rk-racha-msg">' + (hoyActivo ? '¡Hoy ya gestionaste! 💪' : 'Haz tu primera gestión y enciende el día') + '</div>' +
      '<div class="rk-dots">' + dots + '</div>';

    // Tabla completa
    const head = '<div class="rk-row rk-head"><span>Gestora</span><span>Puntos</span><span>Intentos</span><span>Conectados</span><span>Calificados</span><span>Agendados</span><span>Call</span></div>';
    $('rkTabla').innerHTML = head + rk.map((g, i) => {
      const mio = g.asesor === yo ? ' rk-mio-row' : '';
      const pos = i < 3 ? medalla[i] : (i + 1);
      const tag = i === 0 ? ' <span class="rk-lider">Líder del día</span>' : (g.asesor === yo ? ' <span class="rk-tu">tú</span>' : '');
      const ult = g.ultimaGestion ? ' <span class="rk-ult" title="Hora de su última gestión hoy">⏱ ' + rkHora(g.ultimaGestion) + '</span>' : '';
      return '<div class="rk-row' + mio + '">' +
        '<span class="rk-n"><span class="rk-pos">' + pos + '</span> ' + rkAvatar(g.asesor, 'rk-av') + g.asesor + tag + ult + '</span>' +
        '<span class="rk-big">' + rkFmt(g.puntaje) + '</span>' +
        '<span>' + g.intentos + '</span>' +
        '<span>' + g.conectados + '</span>' +
        '<span class="rk-cal">' + g.calificados + '</span>' +
        '<span class="rk-agend">' + (g.agendados || 0) + '</span>' +
        '<span class="rk-verif">' + (g.verificadas || 0) + '</span>' +
      '</div>';
    }).join('');
    RK_DATA = rk;
  } catch (e) {
    if ($('rkTabla')) $('rkTabla').innerHTML = '<div class="rk-vacio">No se pudo cargar el ranking: ' + e.message + '</div>';
  }
}
function primerNombre(n) { return String(n || '').trim().split(/\s+/)[0] || n; }
function rkHora(iso) { if (!iso) return ''; const d = new Date(iso); const p = n => String(n).padStart(2, '0'); return p(d.getHours()) + ':' + p(d.getMinutes()); }

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
  'Reunion agendada': '#534AB7', 'No responde': '#888780', 'No elegible': '#E24B4A' , 'Reunion comercial': '#7C5CD6' };
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
    const puedeGestionar = d.puedeGestionar || puedeReasignarB2B();
    const barra = puedeGestionar ? '<div class="b2b-lote-bar" id="b2bLoteBar">' +
      '<label class="b2b-lote-all"><input type="checkbox" id="b2bSelAll" onchange="b2bToggleAll(this)"> Seleccionar todos</label>' +
      '<span id="b2bSelCount" class="sub">0 seleccionados</span>' +
      '<button class="btn sec" onclick="abrirReasignarLote()">↻ Reasignar seleccionados</button>' +
      '<button class="btn sec" onclick="verDuplicadosB2B()">⧉ Ver duplicados</button>' +
      '</div>' : '';
    const colSel = puedeGestionar ? '<th style="width:28px"></th>' : '';
    cont.innerHTML = barra + '<div style="overflow-x:auto"><table class="mt-tabla b2b-tabla"><thead><tr>' +
      colSel + '<th>Código</th><th>Empresa</th><th>RUC</th><th>SUNAT</th><th>Contacto</th><th>Sector / Rubro</th><th>Antigüedad</th><th>Ubicación</th><th>Monto</th><th>Ticket</th><th>Estado</th><th>Responsable</th><th>Ingreso</th><th></th>' +
      '</tr></thead><tbody>' +
      lista.map(s =>
        '<tr>' +
        (puedeGestionar ? '<td><input type="checkbox" class="b2b-sel" value="' + s.codigo + '" onchange="b2bSelChange()"></td>' : '') +
        '<td><span class="b2b-cod b2b-cod-link" onclick="abrirFichaB2B(\'' + s.codigo + '\')" title="Abrir ficha">' + s.codigo + '</span></td>' +
        '<td><b>' + (s.razonSocial || '—') + '</b>' + (s.nombreComercial ? '<div class="b2b-sub">' + s.nombreComercial + '</div>' : '') + '</td>' +
        '<td>' + (s.ruc || '—') + '</td>' +
        '<td>' + celdaSunat(s) + '</td>' +
        '<td>' + (s.contacto || '—') + (s.telefono ? '<div class="b2b-sub">' + s.telefono + '</div>' : '') + '</td>' +
        '<td>' + (s.sector ? '<span class="b2b-sub">' + s.sector + '</span>' : '—') + '</td>' +
        '<td>' + fmtAntiguedad(s.antiguedadMeses) + '</td>' +
        '<td>' + fmtUbicacion(s) + '</td>' +
        '<td>' + (s.montoSolicitado != null ? fmtSoles(s.montoSolicitado) : '—') + '</td>' +
        '<td>' + (s.ticket ? '<span class="b2b-pill" style="background:' + (B2B_TICKET_COL[s.ticket] || '#888') + '22;color:' + (B2B_TICKET_COL[s.ticket] || '#888') + '">' + s.ticket + '</span>' : '—') + '</td>' +
        '<td><span class="b2b-pill" style="background:' + (B2B_ESTADO_COL[s.estado] || '#888') + '22;color:' + (B2B_ESTADO_COL[s.estado] || '#888') + '">' + trEstadoB2B(s.estado) + '</span></td>' +
        '<td>' + (s.responsableActual ? primerNombre(s.responsableActual) : '—') + '</td>' +
        '<td>' + (s.fechaIngreso ? fmtFecha(s.fechaIngreso) : '—') + '</td>' +
        '<td class="b2b-acc">' + celdaAccionesB2B(s) + '</td>' +
        '</tr>').join('') +
      '</tbody></table></div>';
  } catch (e) {
    cont.innerHTML = '<div class="vacio">No se pudo cargar B2B: ' + e.message + '</div>';
  }
}
// ¿El usuario puede reasignar/gestionar? (jefe_b2b, jefe_creditos, admin)
function puedeReasignarB2B() {
  const rol = (typeof YO !== 'undefined' && YO && YO.rol) || '';
  return ['admin', 'jefa', 'jefe_b2b', 'jefe_creditos'].includes(rol);
}
function b2bToggleAll(chk) { document.querySelectorAll('.b2b-sel').forEach(c => { c.checked = chk.checked; }); b2bSelChange(); }
function b2bSelChange() { const n = document.querySelectorAll('.b2b-sel:checked').length; const el = $('b2bSelCount'); if (el) el.textContent = n + ' seleccionados'; }
function b2bSeleccionados() { return Array.from(document.querySelectorAll('.b2b-sel:checked')).map(c => c.value); }

function trEstadoB2B(e) {
  const M = { 'Filtro credito': '2 · Filtro crédito', 'Apto credito': 'Apto crédito', 'Filtro garantia': '3 · Filtro garantía', 'Apto garantia': 'Apto garantía', 'Reunion comercial': 'Reunión comercial', 'Filtro finanzas': 'Filtro finanzas', 'Reunion agendada': 'Reunión agendada' };
  return M[e] || e;
}

function fmtAntiguedad(meses) {
  if (meses == null || meses === '') return '—';
  const m = Number(meses);
  if (!isFinite(m) || m < 0) return '—';
  const a = Math.floor(m / 12), r = m % 12;
  const pa = a === 1 ? '1 año' : a + ' años';
  const pr = r === 1 ? '1 mes' : r + ' meses';
  if (a === 0) return pr;       // 5 -> "5 meses", 1 -> "1 mes"
  if (r === 0) return pa;       // 24 -> "2 años"
  return pa + ' ' + pr;         // 15 -> "1 año 3 meses", 25 -> "2 años 1 mes"
}

function fmtUbicacion(s) {
  const dep = s.sunatDepartamento, dist = s.sunatDistrito;
  if (!dep && !dist) return '—';
  if (dep && dist) return '<span class="b2b-sub">' + dist + '<br>' + dep + '</span>';
  return '<span class="b2b-sub">' + (dist || dep) + '</span>';
}

// Acciones por solicitud: archivar (todos) y eliminar (admin/jefes).
function celdaAccionesB2B(s) {
  const esJefe = ['admin', 'jefe_creditos', 'jefe_b2b'].includes(YO.rol);
  const nom = (s.razonSocial || s.contacto || s.ruc || s.codigo).replace(/'/g, '');
  // En la vista de desestimados, la acción principal es reactivar.
  if (s.archivado || s.estado === 'No elegible') {
    let h = '<button class="btn-sunat" title="Reactivar" onclick="reactivarB2B(\'' + s.codigo + '\')">↩ Reactivar</button>';
    if (esJefe) h += ' <button class="btn-sunat" title="Eliminar" style="color:#C0392B;border-color:#E8B5AD" onclick="eliminarB2B(\'' + s.codigo + '\',\'' + nom + '\')">🗑</button>';
    return h;
  }
  let h = '<button class="btn-sunat" title="Archivar" onclick="archivarB2B(\'' + s.codigo + '\')">🗄</button>';
  if (esJefe) h += ' <button class="btn-sunat" title="Eliminar" style="color:#C0392B;border-color:#E8B5AD" onclick="eliminarB2B(\'' + s.codigo + '\',\'' + nom + '\')">🗑</button>';
  return h;
}

// Semáforo SUNAT + botón validar/reconsultar, leyendo de sunatRaw.
function celdaSunat(s) {
  const btn = (txt) => s.ruc ? '<button class="btn-sunat" onclick="validarSunat(\'' + s.codigo + '\', this)">' + txt + '</button>' : '';
  if (s.sunatEstado === 'ok' && s.sunatRaw) {
    let d = {}; try { d = JSON.parse(s.sunatRaw); } catch (e) { }
    const est = (d.estado || '').toUpperCase();
    const cond = (d.condicion || '').toUpperCase();
    const activo = est.includes('ACTIVO');
    const habido = cond === 'HABIDO';
    const ok = activo && habido;
    const col = ok ? '#1D9E75' : (activo || habido ? '#EF9F27' : '#E24B4A');
    const acti = Array.isArray(d.actividadesEconomicas) && d.actividadesEconomicas[0] ? d.actividadesEconomicas[0] : '';
    return '<span class="b2b-pill" style="background:' + col + '22;color:' + col + '" title="' + (acti ? acti.replace(/"/g, "'") : '') + '">' +
      (d.estado || '?') + ' · ' + (d.condicion || '?') + '</span>' +
      ' <button class="btn-sunat" onclick="validarSunat(\'' + s.codigo + '\', this)" title="Reconsultar">⟳</button>';
  }
  if (s.sunatEstado === 'error') return '<span class="b2b-sub" style="color:#E24B4A">Error</span> ' + btn('Reintentar');
  if (s.sunatEstado === 'pendiente') return '<span class="b2b-sub">Pendiente</span> ' + btn('Validar');
  return btn('Validar SUNAT') || '—';
}

async function validarSunat(codigo, btnEl) {
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '…'; }
  try {
    await api('/api/b2b/solicitudes/' + encodeURIComponent(codigo) + '/sunat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (typeof B2B_VISTA !== 'undefined' && B2B_VISTA === 'kanban') cargarKanbanB2B(); else cargarB2B();
    if (FICHA && FICHA.solicitud && FICHA.solicitud.codigo === codigo && typeof abrirFichaB2B === 'function') abrirFichaB2B(codigo);
  } catch (e) {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = '✕'; }
    alert('No se pudo validar SUNAT: ' + e.message);
  }
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
  const contacto = $('b2bContacto').value.trim();
  if (!ruc && !razon && !contacto) { $('b2bAltaMsg').textContent = 'Ingresa al menos RUC o nombre de contacto.'; return; }
  const body = {
    ruc, razonSocial: razon,
    nombreComercial: $('b2bComercial').value.trim(),
    contacto,
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
    if (B2B_VISTA === 'kanban') cargarKanbanB2B(); else cargarB2B();
  } catch (e) {
    $('b2bAltaMsg').textContent = 'No se pudo registrar: ' + e.message;
  }
}

// --- B2B: toggle de paneles y bandeja de ingresos ---
function b2bRefrescar() { if (B2B_VISTA === 'kanban') cargarKanbanB2B(); else cargarB2B(); cargarIngresosB2B(); }

function b2bTab(which) {
  // La barra de tabs Solicitudes/Bandeja se retiró (v1.222): la bandeja vive en el submenú.
  const ps = $('b2bPanelSol'), pi = $('b2bPanelIng');
  if (ps) ps.classList.toggle('oculto', which === 'ing');
  if (pi) pi.classList.toggle('oculto', which !== 'ing');
  if (which === 'ing') cargarIngresosB2B();
  else b2bVista(B2B_VISTA);
}

// ===== Kanban B2B =====
let B2B_VISTA = 'tabla';        // 'tabla' | 'kanban' (tabla primero; el usuario cambia a Kanban)
let B2B_KANBAN_DRAG = null;      // { codigo, desde }
const B2B_KANBAN_COLS = [
  { id: 'Solicitud', label: 'Solicitud / SUNAT', hint: 'Intake · validar RUC · triaje' },
  { id: 'Filtro credito', label: 'Filtro Crédito', hint: '' },
  { id: 'Filtro garantia', label: 'Filtro Garantía', hint: '' },
  { id: 'Reunion comercial', label: 'Reunión Comercial', hint: 'Agendar · realizar · apto pasa a Finanzas' },
  { id: 'Filtro finanzas', label: 'Finanzas y Negocio', hint: 'Push de información financiera' },
  { id: 'Business case', label: 'Business Case', hint: '' }
];
// Orden de las 3 etapas de filtro (para pintar el progreso C/G/F en las tarjetas).
const B2B_ETAPAS_FILTRO = ['Filtro credito', 'Filtro garantia', 'Filtro finanzas'];
const SEM_COL = { Verde: '#2E8B57', Amarillo: '#E0A800', Rojo: '#CC0000' };

function b2bVista(v) {
  B2B_VISTA = v;
  $('b2bViewKanban').classList.toggle('act', v === 'kanban');
  $('b2bViewTabla').classList.toggle('act', v === 'tabla');
  $('b2bTablero').classList.toggle('oculto', v !== 'kanban');
  $('b2bTablaWrap').classList.toggle('oculto', v !== 'tabla');
  if ($('b2bKanbanFiltros')) $('b2bKanbanFiltros').classList.toggle('oculto', v !== 'kanban');
  if ($('b2bTablaFiltros')) $('b2bTablaFiltros').classList.toggle('oculto', v !== 'tabla');
  if (v === 'kanban') cargarKanbanB2B(); else cargarB2B();
}

let B2B_KANBAN_CARDS = [];
let B2B_KANBAN_META = { puedeGestionar: false };
// Scorecards de resumen arriba del tablero. Icono a la derecha del número, mismo tamaño.
// Los que aplican filtran el tablero (con observación, SLA vencido, calientes, business case).
let B2B_SC_FILTRO = null; // criterio activo: 'obs' | 'vencido' | 'caliente' | 'bc' | null
async function cargarScorecardsB2B() {
  const cont = $('b2bScorecards'); if (!cont) return;
  try {
    const r = await api('/api/b2b/resumen');
    const soles = n => 'S/ ' + Number(n || 0).toLocaleString('es-PE');
    const cards = [
      { ic: '📋', val: r.activos, lbl: 'En tablero', cls: '', f: null },
      { ic: '💰', val: soles(r.potencial), lbl: 'Potencial estimado', cls: 'sc-azul', f: null },
      { ic: '⚠️', val: r.conObs, lbl: 'Con observación', cls: r.conObs ? 'sc-amar' : '', f: 'obs' },
      { ic: '⏰', val: r.vencidos, lbl: 'SLA vencido', cls: r.vencidos ? 'sc-rojo' : '', f: 'vencido' },
      { ic: '🔥', val: r.calientes, lbl: 'Calientes', cls: r.calientes ? 'sc-rojo' : '', f: 'caliente' },
      { ic: '📁', val: r.expediente, lbl: 'En business case', cls: 'sc-verde', f: 'bc' }
    ];
    cont.innerHTML = cards.map(c => {
      const clic = c.f ? ' sc-clic' + (B2B_SC_FILTRO === c.f ? ' sc-on' : '') : '';
      const onclick = c.f ? ' onclick="b2bScFiltro(\'' + c.f + '\')"' : '';
      return '<div class="sc-card ' + c.cls + clic + '"' + onclick + '>' +
        '<div class="sc-row"><span class="sc-val">' + c.val + '</span><span class="sc-ic">' + c.ic + '</span></div>' +
        '<div class="sc-lbl">' + c.lbl + '</div></div>';
    }).join('');
    cont.classList.remove('oculto');
  } catch (e) { cont.classList.add('oculto'); }
}
// Aplica/limpia el filtro de scorecard sobre el tablero (toggle).
function b2bScFiltro(f) {
  B2B_SC_FILTRO = (B2B_SC_FILTRO === f) ? null : f;
  if (B2B_VISTA !== 'kanban') b2bVista('kanban');
  cargarScorecardsB2B(); // refresca el resaltado
  renderKanbanFiltrado();
}

async function cargarKanbanB2B() {
  const cont = $('b2bTablero'); if (!cont) return;
  cargarScorecardsB2B();
  cont.innerHTML = '<div class="vacio">Cargando…</div>';
  try {
    const d = await api('/api/b2b/kanban');
    B2B_KANBAN_CARDS = d.cards || [];
    B2B_KANBAN_META.puedeGestionar = d.puedeGestionar;
    B2B_KANBAN_MONTOS = d.montos || {};
    poblarFiltrosKanbanB2B(B2B_KANBAN_CARDS);
    renderKanbanFiltrado();
  } catch (e) {
    cont.innerHTML = '<div class="vacio">No se pudo cargar el kanban: ' + (e.message || '') + '</div>';
  }
}
let B2B_KANBAN_MONTOS = {};

// Llena las opciones de los filtros (persona) manteniendo la selección actual.
function poblarFiltrosKanbanB2B(cards) {
  const selP = $('b2bkfPersona'); if (!selP) return;
  const prev = selP.value;
  const personas = Array.from(new Set(cards.map(c => c.responsableActual).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  selP.innerHTML = '<option value="">Toda persona</option>' +
    personas.map(p => '<option value="' + p.replace(/"/g, '&quot;') + '"' + (p === prev ? ' selected' : '') + '>' + primerNombre(p) + '</option>').join('');
  const selE = $('b2bkfEtapa');
  if (selE && selE.options.length <= 1) {
    selE.innerHTML = '<option value="">Toda etapa</option>' + B2B_KANBAN_COLS.map(c => '<option value="' + c.id + '">' + c.label + '</option>').join('');
  }
}

// Aplica los filtros (fecha / persona / etapa) sobre las tarjetas y re-renderiza.
function renderKanbanFiltrado() {
  const fFecha = ($('b2bkfFecha') && $('b2bkfFecha').value) || '';
  const fPersona = ($('b2bkfPersona') && $('b2bkfPersona').value) || '';
  const fEtapa = ($('b2bkfEtapa') && $('b2bkfEtapa').value) || '';
  let corte = 0;
  if (fFecha === 'hoy') { const d = new Date(); d.setHours(0, 0, 0, 0); corte = d.getTime(); }
  else if (fFecha === '7') corte = Date.now() - 7 * 86400000;
  else if (fFecha === '30') corte = Date.now() - 30 * 86400000;
  const filtradas = B2B_KANBAN_CARDS.filter(c => {
    if (corte && !(c.fechaIngreso && new Date(c.fechaIngreso).getTime() >= corte)) return false;
    if (fPersona && c.responsableActual !== fPersona) return false;
    if (fEtapa && c.etapaKanban !== fEtapa) return false;
    if (B2B_SC_FILTRO === 'obs' && !(c.observaciones && c.observaciones.length)) return false;
    if (B2B_SC_FILTRO === 'vencido' && !(c.sla && c.sla.vencido)) return false;
    if (B2B_SC_FILTRO === 'caliente' && !(c.puntaje && c.puntaje.prob >= 60)) return false;
    if (B2B_SC_FILTRO === 'bc' && c.etapaKanban !== 'Business case') return false;
    return true;
  });
  renderKanbanB2B(filtradas, {}, B2B_KANBAN_META.puedeGestionar);
}

function b2bKanbanCard(c) {
  const nombre = c.razonSocial || c.nombreComercial || c.contacto || c.ruc || c.codigo;
  const montoNum = c.montoEfectivo != null ? c.montoEfectivo : (c.montoSolicitado != null ? Number(c.montoSolicitado) : null);
  const monto = montoNum != null ? 'S/ ' + Number(montoNum).toLocaleString('es-PE') : (c.montoRango || '');
  const sem = c.semaforos || {};
  const pj = c.puntaje || {};
  // Probabilidad de éxito, va AL COSTADO del monto.
  const probChip = pj.banda ? '<span class="kb-prob kb-prob-' + (pj.prioridad || 'p4').toLowerCase().replace('—', 'x') + '" title="Probabilidad de cierre · ' + pj.banda + '">' + (pj.emoji || '') + ' ' + (pj.prob != null ? pj.prob + '%' : '') + '</span>' : '';
  // Semáforo de la ETAPA actual para el borde de color de la card.
  const semActual = pj.banda || (sem.credito || sem.garantia || sem.finanzas || null);
  // Ubicación (se jala de SUNAT).
  const ubic = fmtUbicacion(c);
  const ubicHtml = (ubic && ubic !== '—') ? '<div class="kb-ubic">📍 ' + ubic + '</div>' : '';
  // Dots de etapa: S (SUNAT) + C + G + F. Verde si superada, amarillo parpadeante si es la actual.
  const PASOS = [
    { k: 'sunat', ini: 'S', col: 'Solicitud' },
    { k: 'credito', ini: 'C', col: 'Filtro credito' },
    { k: 'garantia', ini: 'G', col: 'Filtro garantia' },
    { k: 'reunion', ini: 'R', col: 'Reunion comercial' },
    { k: 'finanzas', ini: 'F', col: 'Filtro finanzas' }
  ];
  const ordenCols = ['Solicitud', 'Filtro credito', 'Filtro garantia', 'Reunion comercial', 'Filtro finanzas', 'Business case'];
  const idxCol = ordenCols.indexOf(c.etapaKanban);
  const dots = PASOS.map(p => {
    const v = sem[p.k];
    const idxPaso = ordenCols.indexOf(p.col);
    const esActual = p.col === c.etapaKanban;
    let cls = 'kb-dot', col = '#DDE4EC';
    if (v) col = SEM_COL[v];                          // tiene semáforo evaluado
    if (idxPaso < idxCol && !v) col = SEM_COL['Verde']; // etapa ya superada sin registro => verde
    if (esActual) cls += ' kb-dot-actual';           // etapa actual: amarillo parpadeante (CSS)
    else if (idxPaso < idxCol) cls += ' kb-dot-done';
    return '<span class="' + cls + '" title="' + p.ini + (v ? ': ' + v : '') + '" style="background:' + col + '">' + p.ini + '</span>';
  }).join('');
  const resp = c.responsableActual ? '<span class="kb-resp">' + primerNombre(c.responsableActual) + '</span>' : '<span class="kb-resp kb-sin">Sin asignar</span>';
  // Etiquetas de observación (columna Solicitud): "Validar RUC" (unificado), falta número, etc.
  const obs = (c.observaciones || []);
  const obsHtml = obs.length ? '<div class="kb-obs">' + obs.map(o =>
    '<span class="kb-tag kb-tag-' + (o.tipo === 'falta_numero' ? 'num' : 'ruc') + '">' + labelObsKanban(o) + '</span>').join('') + '</div>' : '';
  // Acción + tiempo REGRESIVO hasta el vencimiento del SLA.
  const sla = c.sla || {};
  let slaHtml = '';
  if (sla.accion) {
    // La acción mostrada: la última gestión registrada en esta etapa, si existe; si no, la acción del SLA.
    const accionTxt = c.ultimaGestionEtapa || sla.accion;
    let cuando;
    if (sla.estado === 'vencido') cuando = '<span class="kb-sla-venc">⚠ Vencido</span>';
    else cuando = '<span class="kb-sla-quedan">⏳ Quedan ' + fmtHorasRestantes(sla.horasRestantes) + '</span>';
    slaHtml = '<div class="kb-sla">📌 ' + accionTxt + ' · ' + cuando + '</div>';
  }
  return '<div class="kb-card' + (sla.estado === 'vencido' ? ' kb-card-venc' : '') + (semActual ? ' kb-card-' + semActual.toLowerCase() : '') + '" draggable="true" data-cod="' + c.codigo + '" data-col="' + c.etapaKanban + '" ' +
    'ondragstart="b2bDragStart(event)" ondragend="b2bDragEnd(event)" onclick="abrirFichaB2B(\'' + c.codigo + '\')">' +
    '<div class="kb-top"><b>' + nombre + '</b>' + (c.ticket ? '<span class="kb-ticket kb-ticket-' + (c.ticket || '').toLowerCase() + '">' + c.ticket + '</span>' : '') + '</div>' +
    '<div class="kb-sub">' + (c.contacto ? primerNombre(c.contacto) + ' · ' : '') + (c.ruc || '—') + '</div>' +
    ubicHtml +
    (monto ? '<div class="kb-monto-row"><span class="kb-monto">' + monto + '</span>' + probChip + '</div>' : (probChip ? '<div class="kb-monto-row">' + probChip + '</div>' : '')) +
    obsHtml +
    slaHtml +
    '<div class="kb-foot">' + dots + resp + '</div>' +
    '</div>';
}
// Texto de las etiquetas de observación del kanban (RUC unificado a "Validar RUC").
function labelObsKanban(o) {
  if (o.tipo === 'falta_numero') return o.label || 'Falta número';
  if (o.tipo === 'ruc' || /ruc/i.test(o.tipo || '') || /ruc/i.test(o.label || '')) return 'Validar RUC';
  return o.label || 'Validar RUC';
}
// Formatea horas restantes en "Xh" o "Xd Yh"; negativo -> vencido.
function fmtHorasRestantes(h) {
  if (h == null) return '—';
  if (h <= 0) return 'vencido';
  if (h < 24) return h + 'h';
  const d = Math.floor(h / 24), r = h % 24;
  return d + 'd' + (r ? ' ' + r + 'h' : '');
}

function renderKanbanB2B(cards, conteos, puedeGestionar) {
  const porCol = {};
  B2B_KANBAN_COLS.forEach(c => { porCol[c.id] = []; });
  cards.forEach(c => { (porCol[c.etapaKanban] = porCol[c.etapaKanban] || []).push(c); });
  const fmtS = n => 'S/ ' + Number(n || 0).toLocaleString('es-PE');
  const html = '<div class="kb-board">' + B2B_KANBAN_COLS.map(col => {
    const items = porCol[col.id] || [];
    const montoCol = items.reduce((a, c) => a + (Number(c.montoEfectivo) || 0), 0);
    return '<div class="kb-col" data-col="' + col.id + '" ondragover="b2bDragOver(event)" ondragleave="b2bDragLeave(event)" ondrop="b2bDrop(event)">' +
      '<div class="kb-colhead"><span>' + col.label + '</span><span class="kb-count">' + items.length + '</span></div>' +
      '<div class="kb-colpot" title="Monto potencial acumulado en esta etapa">' + fmtS(montoCol) + '</div>' +
      (col.hint ? '<div class="kb-colhint">' + col.hint + '</div>' : '') +
      '<div class="kb-colbody">' + (items.length ? items.map(b2bKanbanCard).join('') : '<div class="kb-vacio">—</div>') + '</div>' +
      '</div>';
  }).join('') + '</div>';
  $('b2bTablero').innerHTML = html;
}

function renderDesestimadosB2B(cards) {
  const n = cards.length;
  $('b2bTablero').innerHTML = '<div class="kb-desest-msg">' +
    '<div class="kb-desest-ic">🗂️</div>' +
    '<h3>Los desestimados se ven en la vista Tabla</h3>' +
    '<p>Hay <b>' + n + '</b> ' + (n === 1 ? 'solicitud desestimada' : 'solicitudes desestimadas') + '. ' +
    'Para revisarlas y reactivarlas, cambia a la vista <b>Tabla</b> y usa el estado <b>“Desestimados”</b>.</p>' +
    '<button class="btn" onclick="b2bIrDesestTabla()">☰ Ver en Tabla</button>' +
    '</div>';
}
// Cambia a la vista tabla con el filtro de estado en Desestimados y destilda el check del kanban.
function b2bIrDesestTabla() {
  const chk = $('b2bVerDesest'); if (chk) chk.checked = false;
  b2bVista('tabla');
  const sel = $('b2bEstado'); if (sel) { sel.value = 'Desestimados'; }
  cargarB2B();
}

function b2bDragStart(ev) {
  const card = ev.currentTarget;
  B2B_KANBAN_DRAG = { codigo: card.dataset.cod, desde: card.dataset.col };
  ev.dataTransfer.effectAllowed = 'move';
  try { ev.dataTransfer.setData('text/plain', card.dataset.cod); } catch (e) { }
  setTimeout(() => card.classList.add('kb-dragging'), 0);
}
function b2bDragEnd(ev) { ev.currentTarget.classList.remove('kb-dragging'); document.querySelectorAll('.kb-col.kb-over').forEach(c => c.classList.remove('kb-over')); }
function b2bDragOver(ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; ev.currentTarget.classList.add('kb-over'); }
function b2bDragLeave(ev) { ev.currentTarget.classList.remove('kb-over'); }
async function b2bDrop(ev) {
  ev.preventDefault();
  const col = ev.currentTarget; col.classList.remove('kb-over');
  const drag = B2B_KANBAN_DRAG; B2B_KANBAN_DRAG = null;
  if (!drag) return;
  const hacia = col.dataset.col;
  if (hacia === drag.desde) return;
  try {
    await api('/api/b2b/solicitudes/' + drag.codigo + '/mover', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hacia })
    });
    cargarKanbanB2B();
  } catch (e) {
    alert(e.message || 'No se pudo mover');
    cargarKanbanB2B();
  }
}

async function reactivarB2B(codigo) {
  if (!confirm('¿Reactivar esta solicitud y devolverla al tablero?')) return;
  try {
    await api('/api/b2b/solicitudes/' + codigo + '/reactivar', { method: 'PUT' });
    if (typeof cerrar === 'function') cerrar('ovFichaB2B');
    if (B2B_VISTA === 'kanban') cargarKanbanB2B(); else cargarB2B();
  } catch (e) { alert(e.message || 'No se pudo reactivar'); }
}

async function descartarB2B(codigo) {
  const motivo = prompt('Motivo del descarte:', '');
  if (motivo === null) return;
  try {
    await api('/api/b2b/solicitudes/' + codigo + '/descartar', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo || 'Descartado' })
    });
    if (typeof cerrar === 'function') cerrar('ovFichaB2B');
    if (B2B_VISTA === 'kanban') cargarKanbanB2B(); else cargarB2B();
  } catch (e) { alert(e.message || 'No se pudo descartar'); }
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

// ========== Auditoría B2B + archivar/eliminar solicitudes ==========
async function cargarAuditoriaB2B() {
  // Solicitudes archivadas
  const tb = $('b2bArchivadas');
  try {
    const d = await api('/api/b2b/solicitudes?archivados=1');
    const arch = d.solicitudes || [];
    tb.innerHTML = arch.length ? arch.map(s =>
      '<tr>' +
      '<td><span class="b2b-cod">' + s.codigo + '</span></td>' +
      '<td>' + (s.razonSocial || '—') + '</td>' +
      '<td>' + (s.ruc || '—') + '</td>' +
      '<td>' + trEstadoB2B(s.estado) + '</td>' +
      '<td><button class="btn-sunat" onclick="archivarB2B(\'' + s.codigo + '\')">Desarchivar</button> ' +
      '<button class="btn-sunat" style="color:#C0392B;border-color:#E8B5AD" onclick="eliminarB2B(\'' + s.codigo + '\',\'' + (s.razonSocial || s.ruc || s.codigo).replace(/'/g, '') + '\')">Eliminar</button></td>' +
      '</tr>').join('') : '<tr><td colspan="5" class="vacio">No hay solicitudes archivadas.</td></tr>';
  } catch (e) { tb.innerHTML = '<tr><td colspan="5" class="vacio">' + e.message + '</td></tr>'; }

  // Registro de actividad B2B
  const cont = $('b2bAuditCont');
  try {
    const audit = await api('/api/b2b/auditoria');
    if (!audit.length) { cont.innerHTML = '<div class="vacio">Sin actividad registrada aún.</div>'; return; }
    cont.innerHTML = '<div style="overflow-x:auto"><table style="box-shadow:none"><thead><tr>' +
      '<th>Fecha</th><th>Usuario</th><th>Acción</th><th>Código</th><th>Detalle</th>' +
      '</tr></thead><tbody>' +
      audit.map(a =>
        '<tr>' +
        '<td>' + fmtFechaHora(a.fecha) + '</td>' +
        '<td>' + (a.usuario || '—') + '</td>' +
        '<td>' + trAccionB2B(a.accion) + '</td>' +
        '<td><span class="b2b-cod">' + (a.codigo || '—') + '</span></td>' +
        '<td class="b2b-sub">' + (a.detalle || '') + '</td>' +
        '</tr>').join('') +
      '</tbody></table></div>';
  } catch (e) {
    cont.innerHTML = '<div class="vacio">No se pudo cargar: ' + e.message + '</div>';
  }
}

function trAccionB2B(a) {
  const M = {
    b2b_alta_solicitud: 'Alta de solicitud', b2b_validar_sunat: 'Validación SUNAT',
    b2b_toggle_rotacion: 'Cambio de rotación', b2b_archivar_solicitud: 'Archivar/desarchivar',
    b2b_eliminar_solicitud: 'Eliminar solicitud'
  };
  return M[a] || a;
}

async function archivarB2B(codigo) {
  try { await api('/api/b2b/solicitudes/' + encodeURIComponent(codigo) + '/archivar', { method: 'PUT' }); cargarB2B(); if ($('v-b2b-audit').classList.contains('act')) cargarAuditoriaB2B(); }
  catch (e) { alert('No se pudo archivar: ' + e.message); }
}

async function eliminarB2B(codigo, nombre) {
  if (!confirm('¿Eliminar definitivamente la solicitud de ' + (nombre || codigo) + '? Esta acción no se puede deshacer.')) return;
  try { await api('/api/b2b/solicitudes/' + encodeURIComponent(codigo), { method: 'DELETE' }); cargarB2B(); if ($('v-b2b-audit') && $('v-b2b-audit').classList.contains('act')) cargarAuditoriaB2B(); }
  catch (e) { alert('No se pudo eliminar: ' + e.message); }
}

// ========================= FICHA DE SOLICITUD B2B =========================
let FICHA = null;          // datos cargados de la ficha actual
let FICHA_ETAPA_OPEN = 'solicitud';  // etapa abierta en el acordeón

const FB_CHECKLIST_GARANTIA = [
  ['tipo', 'Tipo de inmueble identificado'],
  ['sunarp', 'Inscrito en SUNARP / partida registral'],
  ['titularidad', 'Titularidad clara'],
  ['copropietarios', 'Copropietarios identificados'],
  ['sinCargas', 'Sin cargas (hipoteca, embargo, litigio)'],
  ['ubicacion', 'Ubicación y zona aceptable'],
  ['material', 'Material noble y servicios básicos'],
  ['primeraHipoteca', 'Dispuesto a primera hipoteca'],
  ['fotos', 'Fotos y link de ubicación recibidos'],
  ['docsSolicitados', 'Documentos mínimos solicitados']
];
const FB_DOCS_GARANTIA = ['Copia literal SUNARP', 'HR / PU', 'DNI propietarios', 'Recibo de luz', 'Fotos del inmueble'];

async function abrirFichaB2B(codigo) {
  $('ovFichaB2B').classList.add('act');
  $('fbAcordeon').innerHTML = '<div class="vacio">Cargando…</div>';
  try {
    await cargarCriteriosB2B();
    await cargarFiltrosCatalogo();
    FICHA = await api('/api/b2b/solicitudes/' + encodeURIComponent(codigo) + '/ficha');
    renderFichaB2B();
  } catch (e) {
    $('fbAcordeon').innerHTML = '<div class="vacio">No se pudo cargar: ' + e.message + '</div>';
  }
}

let B2B_EQUIPO_CACHE = null;
async function equipoB2BCache(forzar) {
  if (B2B_EQUIPO_CACHE && !forzar) return B2B_EQUIPO_CACHE;
  try { B2B_EQUIPO_CACHE = await api('/api/b2b/equipo'); } catch (e) { B2B_EQUIPO_CACHE = { equipo: [], puedeGestionar: false }; }
  return B2B_EQUIPO_CACHE;
}
async function renderResponsableB2B(s) {
  const cont = $('fbResponsable'); if (!cont) return;
  const actual = s.responsableActual || null;
  const d = await equipoB2BCache();
  const activos = (d.equipo || []).filter(m => m.activo);
  const nombre = actual ? primerNombre(actual) : 'Sin asignar';
  if (!d.puedeGestionar || !activos.length) {
    cont.innerHTML = 'Responsable: <b>' + nombre + '</b>';
    return;
  }
  const items = activos.map(m =>
    '<button class="asg-item' + (m.nombre === actual ? ' asg-item-act' : '') + '" onclick="reasignarB2B(\'' + s.codigo + '\',\'' + m.usuario + '\')">' +
    m.nombre + (m.rol.startsWith('jefe_') ? ' <span class="asg-rol">jefe</span>' : '') + (m.nombre === actual ? ' <span class="asg-check">✓</span>' : '') + '</button>').join('');
  cont.innerHTML = 'Responsable: <b>' + nombre + '</b>' +
    '<span class="asg-wrap">' +
    '<button class="btn sec asg-btn" onclick="toggleAsignarB2B(event)">' + (actual ? 'Cambiar' : 'Asignar') + '</button>' +
    '<div class="asg-menu oculto" id="asgMenu"><div class="asg-menu-tit">Asignar a</div>' + items + '</div>' +
    '</span>';
}
function toggleAsignarB2B(ev) {
  ev.stopPropagation();
  const m = $('asgMenu'); if (!m) return;
  const abierto = !m.classList.contains('oculto');
  m.classList.toggle('oculto', abierto);
  if (!abierto) setTimeout(() => document.addEventListener('click', cerrarAsignarB2B, { once: true }), 0);
}
function cerrarAsignarB2B() { const m = $('asgMenu'); if (m) m.classList.add('oculto'); }
async function reasignarB2B(codigo, usuario) {
  if (!usuario) return;
  cerrarAsignarB2B();
  try {
    const r = await api('/api/b2b/solicitudes/' + codigo + '/reasignar', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario })
    });
    if (FICHA && FICHA.solicitud) FICHA.solicitud.responsableActual = r.responsable;
    renderResponsableB2B(FICHA.solicitud);
    if (B2B_VISTA === 'kanban' && typeof cargarKanbanB2B === 'function') cargarKanbanB2B();
    else if (typeof cargarB2B === 'function') cargarB2B();
  } catch (e) {
    alert(e.message || 'No se pudo reasignar');
    renderResponsableB2B(FICHA.solicitud);
  }
}

// ===== Reasignar en LOTE =====
async function abrirReasignarLote() {
  const cods = b2bSeleccionados();
  if (!cods.length) { alert('Selecciona al menos un lead (marca las casillas).'); return; }
  if (!B2B_EQUIPO_CACHE) { try { B2B_EQUIPO_CACHE = await api('/api/b2b/equipo'); } catch (e) { } }
  const eq = (B2B_EQUIPO_CACHE && B2B_EQUIPO_CACHE.equipo) || [];
  const opts = eq.map(m => '<option value="' + m.usuario + '">' + m.nombre + '</option>').join('');
  const html = '<div class="gm-back" onclick="if(event.target===this)cerrarOverlayGenerico()"><div class="gm-card" style="width:400px">' +
    '<div class="gm-head"><b>Reasignar ' + cods.length + ' lead(s)</b><button class="gm-x" onclick="cerrarOverlayGenerico()">✕</button></div>' +
    '<div class="gm-row"><label>Asignar a</label><select id="loteDestino" class="mtr-in">' + (opts || '<option value="">Sin operadores</option>') + '</select></div>' +
    '<div class="error" id="loteMsg"></div>' +
    '<div class="gm-foot"><button class="btn sec" onclick="cerrarOverlayGenerico()">Cancelar</button><button class="btn" onclick="confirmarReasignarLote()">Reasignar</button></div>' +
    '</div></div>';
  montarOverlayGenerico(html);
}
async function confirmarReasignarLote() {
  const usuario = $('loteDestino') && $('loteDestino').value;
  const codigos = b2bSeleccionados();
  if (!usuario) { $('loteMsg').textContent = 'Elige un operador.'; return; }
  try {
    const r = await api('/api/b2b/solicitudes/reasignar-lote', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigos, usuario }) });
    cerrarOverlayGenerico();
    cargarB2B();
    alert(r.reasignados + ' lead(s) reasignados a ' + r.responsable);
  } catch (e) { $('loteMsg').textContent = e.message || 'No se pudo reasignar.'; }
}

// ===== Duplicados por RUC =====
async function verDuplicadosB2B() {
  let d; try { d = await api('/api/b2b/duplicados'); } catch (e) { alert('No se pudo cargar duplicados: ' + e.message); return; }
  const grupos = d.grupos || [];
  let cuerpo;
  if (!grupos.length) cuerpo = '<div class="sub" style="padding:10px">No hay RUCs duplicados en solicitudes activas. 👍</div>';
  else cuerpo = grupos.map(g => {
    const rows = g.solicitudes.map((s, i) => '<label class="dup-row"><input type="radio" name="dup_' + g.ruc + '" value="' + s.codigo + '"' + (i === 0 ? ' checked' : '') + '> ' +
      '<b>' + s.codigo + '</b> · ' + (s.razonSocial || '—') + ' · ' + trEstadoB2B(s.estado) + ' · ' + (s.responsableActual ? primerNombre(s.responsableActual) : 'sin asignar') +
      ' <span class="sub">(' + (s.fechaIngreso ? fmtFecha(s.fechaIngreso) : '') + ')</span></label>').join('');
    return '<div class="dup-grupo"><div class="dup-ruc">RUC ' + g.ruc + ' · ' + g.n + ' solicitudes</div>' + rows +
      '<div class="dup-acc">' +
      '<span class="sub">Elige la que se conserva y:</span> ' +
      '<button class="btn sec" onclick="fusionarDup(\'' + g.ruc + '\')">⧉ Fusionar en la elegida</button> ' +
      '<button class="btn sec" onclick="descartarOtrosDup(\'' + g.ruc + '\')">✕ Descartar las demás</button>' +
      '</div></div>';
  }).join('');
  const html = '<div class="tl-back" onclick="if(event.target===this)cerrarOverlayGenerico()"><div class="tl-card" style="width:560px">' +
    '<div class="tl-head"><b>Duplicados por RUC</b><button class="gm-x" onclick="cerrarOverlayGenerico()">✕</button></div>' +
    '<p class="sub" style="margin:0 0 10px">Fusionar mueve las gestiones a la solicitud elegida y descarta las demás. Descartar solo saca las otras del tablero.</p>' +
    cuerpo + '</div></div>';
  montarOverlayGenerico(html);
}
function dupElegida(ruc) { const el = document.querySelector('input[name="dup_' + ruc + '"]:checked'); return el ? el.value : null; }
function dupTodas(ruc) { return Array.from(document.querySelectorAll('input[name="dup_' + ruc + '"]')).map(e => e.value); }
async function fusionarDup(ruc) {
  const destino = dupElegida(ruc); if (!destino) return;
  const origenes = dupTodas(ruc).filter(c => c !== destino);
  if (!confirm('Fusionar ' + origenes.length + ' solicitud(es) en ' + destino + '? Las gestiones se moverán a la elegida y las demás se descartarán.')) return;
  try { await api('/api/b2b/solicitudes/fusionar-duplicados', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destino, origenes }) }); cerrarOverlayGenerico(); cargarB2B(); alert('Duplicados fusionados.'); }
  catch (e) { alert(e.message || 'No se pudo fusionar.'); }
}
async function descartarOtrosDup(ruc) {
  const conservar = dupElegida(ruc); if (!conservar) return;
  const otras = dupTodas(ruc).filter(c => c !== conservar);
  if (!confirm('Descartar ' + otras.length + ' duplicado(s) y conservar ' + conservar + '?')) return;
  try { for (const o of otras) await api('/api/b2b/solicitudes/' + o + '/descartar-duplicado', { method: 'PUT' }); cerrarOverlayGenerico(); cargarB2B(); alert('Duplicados descartados.'); }
  catch (e) { alert(e.message || 'No se pudo descartar.'); }
}

// ===== Limpiar historial (dentro del timeline; solo jefe/admin) =====
async function limpiarHistorialB2B() {
  if (!confirm('¿Limpiar TODO el historial de gestiones de este lead? El lead se conserva y vuelve a su etapa base (SUNAT/Crédito). Esta acción no se puede deshacer.')) return;
  try {
    const r = await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/gestiones', { method: 'DELETE' });
    if ($('tlHost')) $('tlHost').remove();
    abrirFichaB2B(FICHA.solicitud.codigo);
    alert(r.eliminadas + ' gestiones eliminadas. El lead volvió a su etapa base.');
  } catch (e) { alert(e.message || 'No se pudo limpiar.'); }
}

// Overlay genérico reutilizable
function montarOverlayGenerico(html) { cerrarOverlayGenerico(); const h = document.createElement('div'); h.id = 'ovGen'; h.innerHTML = html; document.body.appendChild(h); }
function cerrarOverlayGenerico() { const h = $('ovGen'); if (h) h.remove(); }

async function validarRucB2B() {
  const inp = $('fbRucEdit'); if (!inp) return;
  const ruc = (inp.value || '').trim();
  if (!/^(10|15|17|20)\d{9}$/.test(ruc)) { alert('El RUC debe tener 11 dígitos y empezar en 10, 15, 17 o 20.'); return; }
  inp.disabled = true;
  const btn = inp.nextElementSibling; if (btn) { btn.disabled = true; btn.textContent = '⏳ Validando…'; }
  try {
    const r = await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/sunat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruc })
    });
    if (r.solicitud) {
      Object.assign(FICHA.solicitud, r.solicitud);
      FICHA.solicitud.sunatEstado = r.solicitud.sunatEstado;
    }
    // Recarga la ficha completa: la etapa puede avanzar sola si SUNAT quedó OK.
    abrirFichaB2B(FICHA.solicitud.codigo);
    if (!r.ok) setTimeout(() => alert('SUNAT no validó el RUC: ' + (r.motivo || 'sin detalle') + '. Revisa el número.'), 200);
  } catch (e) {
    alert(e.message || 'No se pudo validar el RUC.');
    inp.disabled = false; if (btn) { btn.disabled = false; btn.textContent = '🔎 Validar'; }
  }
}

// Stepper del viaje del lead: 5 pasos con semáforo, etapa actual resaltada.
function stepperFichaB2B() {
  const f = FICHA.filtros || {};
  const col = FICHA.etapaKanban || 'Solicitud';
  const PASOS = [
    { n: 1, t: 'SUNAT', col: 'Solicitud', sem: f.sunat && f.sunat.semaforo },
    { n: 2, t: 'Crédito', col: 'Filtro credito', sem: f.credito && f.credito.semaforo },
    { n: 3, t: 'Garantía', col: 'Filtro garantia', sem: f.garantia && f.garantia.semaforo },
    { n: 4, t: 'Reunión', col: 'Reunion comercial', sem: null },
    { n: 5, t: 'Finanzas', col: 'Filtro finanzas', sem: f.finanzas && f.finanzas.semaforo },
    { n: 6, t: 'Business Case', col: 'Business case', sem: null }
  ];
  const orden = PASOS.map(p => p.col);
  const idxAct = orden.indexOf(col === 'Desestimado' ? 'Solicitud' : col);
  return '<div class="fb-stepper">' + PASOS.map((p, i) => {
    let cls = 'fbs-paso', dotStyle = '';
    if (i === idxAct) cls += ' fbs-actual';
    else if (i < idxAct) cls += ' fbs-done';
    if (p.sem) dotStyle = ' style="background:' + (SEM_COL[p.sem] || '#DDE4EC') + '"';
    else if (i < idxAct) dotStyle = ' style="background:' + SEM_COL['Verde'] + '"';
    const linea = i < PASOS.length - 1 ? '<span class="fbs-linea' + (i < idxAct ? ' fbs-linea-done' : '') + '"></span>' : '';
    return '<span class="' + cls + '"><span class="fbs-dot"' + dotStyle + '>' + p.n + '</span><span class="fbs-txt">' + p.t + (p.sem ? ' <i class="fbs-sem">' + p.sem + '</i>' : '') + '</span></span>' + linea;
  }).join('') + '</div>';
}

// Panel de la etapa Reunion comercial: espera/realizacion de la reunion; pase MANUAL a Finanzas.
function panelReunion(modo) {
  const open = FICHA_ETAPA_OPEN === 'reunion';
  const enReunion = FICHA.etapaKanban === 'Reunion comercial';
  const pasada = ['Filtro finanzas', 'Business case'].includes(FICHA.etapaKanban);
  const head = pasada ? '<span class="fb-pill" style="background:#E7F6EF;color:#1D9E75">✓ Realizada</span>'
    : (enReunion ? '<span class="fb-pill" style="background:#FFF4E0;color:#B7791F">En espera</span>' : '<span class="sub">pendiente</span>');
  if (!open) return fbPanelWrap('reunion', '🤝', '4 · Reunión comercial', head, false, '', false, modo, 'Reunion comercial');
  const cuerpo = '<div class="fb-body">' +
    '<p class="sub" style="margin:0 0 10px">El lead completó garantía y espera la reunión comercial. Registra las gestiones de agendamiento con "＋ Gestión". Cuando la reunión se realice y el cliente esté apto, pásalo a Finanzas para el push de información financiera.</p>' +
    (pasada ? '<div class="sub">✓ Este lead ya pasó la reunión comercial.</div>'
      : '<div class="fb-acc"><button class="btn" onclick="reunionEfectivaB2B()">✅ Reunión efectiva → pasar a Finanzas</button></div>') +
    '</div>';
  return fbPanelWrap('reunion', '🤝', '4 · Reunión comercial', head, true, cuerpo, false, modo, 'Reunion comercial');
}
async function reunionEfectivaB2B() {
  if (!confirm('¿Confirmas que la reunión comercial se realizó y el cliente está apto? Pasará a Filtro finanzas.')) return;
  try {
    await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/mover', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hacia: 'Filtro finanzas' })
    });
    abrirFichaB2B(FICHA.solicitud.codigo);
  } catch (e) { alert(e.message || 'No se pudo avanzar.'); }
}

function resumenFichaB2B() {
  const pj = FICHA.puntaje || {}; const sla = FICHA.sla || {};
  const prob = pj.banda ? '<span class="fbr-prob fbr-' + (pj.prioridad || 'p4').toLowerCase().replace('—', 'x') + '">' + (pj.emoji || '') + ' ' + (pj.prob != null ? pj.prob + '% · ' : '') + pj.banda + '</span>' : '';
  let accion = '';
  if (sla.accion) {
    // Estado SLA de la etapa: días hábiles usados vs. máximo permitido.
    let slaTag = '';
    if (sla.horas != null) {
      const cls = sla.estado === 'vencido' ? 'fbr-sla-venc' : (sla.estado === 'porvencer' ? 'fbr-sla-porv' : 'fbr-sla-ok');
      const txt = sla.estado === 'vencido'
        ? '⚠ SLA vencido (' + sla.usadas + '/' + sla.horas + 'h)'
        : (sla.estado === 'porvencer'
          ? '⏳ SLA por vencer (' + sla.usadas + '/' + sla.horas + 'h)'
          : '⏱ ' + sla.usadas + '/' + sla.horas + 'h en etapa');
      slaTag = '<span class="fbr-sla ' + cls + '">' + txt + '</span>';
    }
    accion = '<span class="fbr-accion">📌 <b>' + sla.accion + '</b></span>' + slaTag;
  }
  return (prob || accion) ? '<div class="fb-resumen">' + prob + accion + '</div>' : '';
}

function renderFichaB2B() {
  const s = FICHA.solicitud;
  $('fbTitulo').textContent = s.razonSocial || s.ruc || s.codigo;
  $('fbSubtitulo').innerHTML = s.codigo + ' · RUC ' + (s.ruc || '—') + (s.ticket ? ' · ticket <b>' + s.ticket + '</b>' : '') + ' · ' + trEstadoB2B(s.estado);
  renderResponsableB2B(s);
  const acc = $('fbAcciones');
  if (acc) {
    if (s.estado === 'No elegible' || s.archivado) {
      acc.innerHTML = '<span class="fb-desc-tag">Desestimado' + (s.motivoDescarte ? ' · ' + s.motivoDescarte : '') + '</span>' +
        '<button class="btn sec" onclick="reactivarB2B(\'' + s.codigo + '\')">↩ Reactivar</button>';
    } else {
      acc.innerHTML = '';
    }
  }
  // La bandera de descartar arriba solo aplica a solicitudes activas.
  const flag = $('fbDescartar');
  if (flag) flag.classList.toggle('oculto', s.estado === 'No elegible' || !!s.archivado);

  // ===== Etapa activa (automática) y modo de cada panel =====
  // Orden de etapas y a qué columna Kanban corresponde cada panel.
  const ORDEN_ETAPAS = ['fsunat', 'credito', 'garantia', 'reunion', 'finanzas', 'businesscase'];
  const COL_DE_PANEL = { fsunat: 'Solicitud', credito: 'Filtro credito', garantia: 'Filtro garantia', reunion: 'Reunion comercial', finanzas: 'Filtro finanzas', businesscase: 'Business case' };
  // La etapa activa la define el backend (etapaKanban). SUNAT/Solicitud comparten el primer panel.
  let colActiva = FICHA.etapaKanban || 'Solicitud';
  if (colActiva === 'Desestimado') colActiva = 'Solicitud';
  const idxActivo = ORDEN_ETAPAS.findIndex(p => COL_DE_PANEL[p] === colActiva);
  // Etapas LIBERADAS: todos los paneles son editables (sin lectura/bloqueado), navegación libre.
  const modoPanel = (panel) => 'editable';
  FICHA._modoPanel = modoPanel; FICHA._colActiva = colActiva;

  const semCredito = (FICHA.filtros.credito && FICHA.filtros.credito.semaforo) || null;
  const semGarantia = (FICHA.filtros.garantia && FICHA.filtros.garantia.semaforo) || null;
  const semFinanzas = (FICHA.filtros.finanzas && FICHA.filtros.finanzas.semaforo) || null;

  const panels = [
    panelSolicitud(s),
    panelFiltroSunat(s, modoPanel('fsunat')),
    panelCredito(semCredito, modoPanel('credito')),
    panelGarantia(modoPanel('garantia') !== 'bloqueado', semGarantia, modoPanel('garantia')),
    panelReunion(modoPanel('reunion')),
    panelFinanzas(modoPanel('finanzas') !== 'bloqueado', semFinanzas, modoPanel('finanzas')),
    panelBusinessCase(modoPanel('businesscase') !== 'bloqueado', modoPanel('businesscase'))
  ];
  $('fbAcordeon').innerHTML = stepperFichaB2B() + resumenFichaB2B() + panels.join('');
  (FICHA.creditoSujetos || []).forEach(su => { delete su._nuevo; });
  cargarGestionesB2B(s.codigo);
  aplicarBloqueoPaneles();
}
// Deshabilita inputs de los paneles en modo 'lectura' o 'bloqueado' (deja editable solo el monto).
// Etapas LIBERADAS: todos los paneles quedan editables en cualquier etapa (sin bloqueo).
let B2B_MODO_DEMO = true;
function aplicarBloqueoPaneles() { return; /* sin bloqueos: navegación libre entre etapas */ }
function _aplicarBloqueoPanelesOriginal() {
  if (B2B_MODO_DEMO) return;
  document.querySelectorAll('.fb-panel[data-modo]').forEach(pnl => {
    const modo = pnl.getAttribute('data-modo');
    if (modo === 'editable') return;
    pnl.querySelectorAll('input, select, textarea, button').forEach(el => {
      // El monto siempre editable; el botón de editar monto también.
      if (el.getAttribute('onclick') && /editarMontoB2B/.test(el.getAttribute('onclick'))) return;
      if (el.classList.contains('fb-gestion-btn')) return; // el botón de gestión queda activo
      el.setAttribute('disabled', 'disabled');
      el.classList.add('fb-locked');
    });
  });
}

// ===== Bitácora de gestiones (trazabilidad, próxima acción obligatoria) =====
// ===== Modal de gestión (2 pasos: resultado + próxima acción). Se abre desde cada etapa. =====
let GESTION_COL = null;
function abrirModalGestion(col) {
  GESTION_COL = col;
  const acciones = (FICHA.accionesPorEtapa && FICHA.accionesPorEtapa[col]) || FICHA.accionesEtapa || [];
  const resultados = FICHA.resultadosGestion || ['Contactado', 'No contestó', 'Volver a llamar', 'Pidió información', 'Envió documentos', 'No interesado'];
  const canales = FICHA.canalesGestion || ['Llamada', 'WhatsApp'];
  const etLabel = trEstadoB2B(col);
  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
  const html = '<div class="gm-back" onclick="if(event.target===this)cerrarModalGestion()">' +
    '<div class="gm-card">' +
    '<div class="gm-head"><b>Registrar gestión</b> <span class="sub">· etapa ' + etLabel + '</span>' +
    '<button class="gm-x" onclick="cerrarModalGestion()">✕</button></div>' +
    // Paso 1
    '<div class="gm-step">1 · ¿Qué pasó?</div>' +
    '<div class="gm-row"><label>Canal</label><select id="gmCanal" class="mtr-in">' + canales.map(c => '<option>' + c + '</option>').join('') + '</select></div>' +
    '<div class="gm-row"><label>Resultado</label><select id="gmResultado" class="mtr-in">' + resultados.map(r => '<option>' + r + '</option>').join('') + '</select></div>' +
    '<div class="gm-row"><label>Comentario</label><textarea id="gmComentario" class="mtr-in gm-ta" maxlength="300" placeholder="Detalle breve (opcional)"></textarea></div>' +
    // Paso 2
    '<div class="gm-step">2 · ¿Qué sigue? <span class="gm-oblig">obligatorio</span></div>' +
    '<div class="gm-row"><label>Próxima acción</label><select id="gmProxAccion" class="mtr-in"><option value="">— elige —</option>' + acciones.map(a => '<option>' + a + '</option>').join('') + '<option value="__otro">Otra…</option></select></div>' +
    '<div class="gm-row" id="gmOtroWrap" style="display:none"><label>Especifica</label><input id="gmProxOtro" class="mtr-in" placeholder="Describe la próxima acción"></div>' +
    '<div class="gm-row"><label>¿Cuándo?</label><input id="gmProxFecha" type="datetime-local" class="mtr-in" value="' + manana + '"></div>' +
    '<div class="error" id="gmMsg"></div>' +
    '<div class="gm-foot"><button class="btn sec" onclick="cerrarModalGestion()">Cancelar</button><button class="btn" onclick="guardarModalGestion()">Registrar</button></div>' +
    '</div></div>';
  const host = document.createElement('div'); host.id = 'gmHost'; host.innerHTML = html;
  document.body.appendChild(host);
  const sel = $('gmProxAccion'); if (sel) sel.onchange = () => { $('gmOtroWrap').style.display = sel.value === '__otro' ? '' : 'none'; };
}
function cerrarModalGestion() { const h = $('gmHost'); if (h) h.remove(); GESTION_COL = null; }
async function guardarModalGestion() {
  const msg = $('gmMsg');
  let prox = $('gmProxAccion').value;
  if (prox === '__otro') prox = ($('gmProxOtro').value || '').trim();
  const fecha = ($('gmProxFecha').value || '').trim();
  if (!prox) { if (msg) msg.textContent = 'Define la próxima acción.'; return; }
  if (!fecha) { if (msg) msg.textContent = 'Define la fecha de la próxima acción.'; return; }
  try {
    await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/gestiones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canal: $('gmCanal').value, resultado: $('gmResultado').value, comentario: ($('gmComentario').value || '').trim(), proximaAccion: prox, fechaProxAccion: new Date(fecha).toISOString() })
    });
    cerrarModalGestion();
    abrirFichaB2B(FICHA.solicitud.codigo); // refresca ficha (y timeline)
  } catch (e) { if (msg) msg.textContent = e.message || 'No se pudo registrar.'; }
}
// Carga las gestiones para el TIMELINE (panel "ⓘ").
async function cargarGestionesB2B(codigo) {
  try {
    const d = await api('/api/b2b/solicitudes/' + encodeURIComponent(codigo) + '/gestiones');
    FICHA._gestiones = d.gestiones || [];
  } catch (e) { FICHA._gestiones = []; }
}
// Abre/cierra el timeline de trazabilidad (botón ⓘ junto a la bandera).
function toggleTimelineB2B() {
  let h = $('tlHost');
  if (h) { h.remove(); return; }
  const g = FICHA._gestiones || [];
  const items = g.length ? g.map(x => {
    const f = new Date(x.fecha);
    const fFmt = f.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    const fp = x.fechaProxAccion ? new Date(x.fechaProxAccion).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    return '<div class="tl-item"><div class="tl-dot"></div><div class="tl-body">' +
      '<div class="tl-top"><b>' + trEstadoB2B(x.etapa || '') + '</b> <span class="sub">' + fFmt + ' · ' + primerNombre(x.responsable || '') + '</span></div>' +
      '<div class="tl-res">' + (x.canal || '') + (x.resultado ? ' · ' + x.resultado : '') + '</div>' +
      (x.comentario ? '<div class="tl-com">' + x.comentario.replace(/</g, '&lt;') + '</div>' : '') +
      '<div class="tl-prox">➡ <b>' + (x.proximaAccion || '') + '</b> · 📅 ' + fp + '</div>' +
      '</div></div>';
  }).join('') : '<div class="sub" style="padding:8px">Sin gestiones registradas todavía.</div>';
  const puedeLimpiar = puedeReasignarB2B();
  const footer = (puedeLimpiar && g.length) ? '<div class="tl-foot"><button class="btn sec tl-limpiar" onclick="limpiarHistorialB2B()">🗑 Limpiar historial</button></div>' : '';
  const html = '<div class="tl-back" onclick="if(event.target===this)toggleTimelineB2B()">' +
    '<div class="tl-card"><div class="tl-head"><b>Trazabilidad del lead</b><button class="gm-x" onclick="toggleTimelineB2B()">✕</button></div>' +
    '<div class="tl-list">' + items + '</div>' + footer + '</div></div>';
  const host = document.createElement('div'); host.id = 'tlHost'; host.innerHTML = html;
  document.body.appendChild(host);
}

function fbPill(sem) {
  if (!sem) return '';
  const c = { Verde: '#1D9E75', Amarillo: '#EF9F27', Rojo: '#E24B4A' }[sem] || '#888';
  return '<span class="b2b-pill" style="background:' + c + '22;color:' + c + '">' + sem + '</span>';
}

// ===== Motor de DOS CAPAS en el cliente (espejo del server, para vista previa en vivo) =====
let FILTROS_B2B_CACHE = null;
async function cargarFiltrosCatalogo() {
  if (FILTROS_B2B_CACHE) return FILTROS_B2B_CACHE;
  try { const d = await api('/api/b2b/filtros-catalogo'); FILTROS_B2B_CACHE = d.filtros || {}; }
  catch (e) { FILTROS_B2B_CACHE = {}; }
  return FILTROS_B2B_CACHE;
}
const RANGOS_VENTAS_TK = { Bajo: [500000, 3000000], Medio: [3000000, 10000000], Alto: [10000000, Infinity] };
const ANTIG_MIN_TK = { Bajo: 18, Medio: 24, Alto: 36 };
function evalGateJS(g, valores, ticket) {
  const val = valores[g.clave]; const vacio = (val === undefined || val === null || val === '');
  if (g.tipo === 'textoReq') { if (g.requiereSi && valores[g.requiereSi.clave] === g.requiereSi.val) { return vacio ? { resultado: 'escalado', motivo: g.motivo } : { resultado: 'ok' }; } return { resultado: 'ok' }; }
  if (g.tipo === 'numReq') { if (vacio) return { resultado: 'escalado', motivo: g.motivo }; const n = Number(val); return (!isFinite(n) || n <= 0) ? { resultado: 'escalado', motivo: g.motivo } : { resultado: 'ok' }; }
  if (g.tipo === 'linkReq') { if (vacio) return { resultado: 'escalado', motivo: g.motivo }; return /^https?:\/\//i.test(String(val)) ? { resultado: 'ok' } : { resultado: 'escalado', motivo: g.motivo }; }
  if (g.tipo === 'numMinTicket') { if (vacio) return { resultado: 'ok' }; const min = g.minTicket[ticket] != null ? g.minTicket[ticket] : g.minTicket.Bajo; return Number(val) < min ? { resultado: 'ko', motivo: g.motivo } : { resultado: 'ok' }; }
  if (g.tipo === 'numMaxTicket') { if (vacio) return { resultado: 'ok' }; const max = g.maxTicket[ticket] != null ? g.maxTicket[ticket] : g.maxTicket.Bajo; return Number(val) > max ? { resultado: 'ko', motivo: g.motivo } : { resultado: 'ok' }; }
  if (g.tipo === 'numObsTicket') { if (vacio) return { resultado: 'ok' }; const max = g.maxTicket[ticket] != null ? g.maxTicket[ticket] : g.maxTicket.Bajo; return Number(val) > max ? { resultado: 'observado', motivo: g.motivo } : { resultado: 'ok' }; }
  if (g.tipo === 'docTicket') { const req = g.requeridoTicket && g.requeridoTicket[ticket]; if (!req) return { resultado: 'ok' }; return (vacio || val !== 'si') ? { resultado: 'escalado', motivo: g.motivo } : { resultado: 'ok' }; }
  if (vacio) { if (g.oblig) return { resultado: 'escalado', motivo: g.motivo || ('Falta ' + (g.etiqueta || g.clave)) }; return { resultado: 'ok' }; }
  const op = (g.opciones || []).find(o => o.v === val); return op ? { resultado: op.resultado || 'ok', motivo: op.motivo } : { resultado: 'ok' };
}
function evalScoreJS(it, valores, ticket) {
  const val = valores[it.clave]; const vacio = (val === undefined || val === null || val === '');
  if (it.tipo === 'select') { if (vacio) return null; const op = (it.opciones || []).find(o => o.v === val); return op ? op.frac * it.peso : 0; }
  if (it.tipo === 'limpiezaNum') { if (vacio) return null; const n = Number(val); if (!isFinite(n)) return null; return (n === 0 ? 1 : 0.4) * it.peso; }
  if (it.tipo === 'ventasTicket') { if (vacio) return null; const n = Number(val); if (!isFinite(n)) return null; const r = RANGOS_VENTAS_TK[ticket] || RANGOS_VENTAS_TK.Bajo; const frac = n < r[0] ? 0.3 : (n > r[1] ? 0.7 : 1); return frac * it.peso; }
  if (it.tipo === 'colchonTicket') { if (vacio) return null; const min = ANTIG_MIN_TK[ticket] != null ? ANTIG_MIN_TK[ticket] : ANTIG_MIN_TK.Bajo; const c = Number(val) - min; if (!isFinite(c)) return null; return Math.max(0, Math.min(1, c / 24)) * it.peso; }
  return null;
}
// Fórmulas de ratios financieros (espejo del server; las funciones calc no viajan por JSON).
const RATIO_CALC_JS = {
  dscr: (v) => (v.flujoMensual && v.cuotaMensual) ? v.flujoMensual / v.cuotaMensual : null,
  endeudamiento: (v) => (v.deudaFin != null && v.patrimonio) ? v.deudaFin / v.patrimonio : null,
  cargaFin: (v) => (v.cuotaMensual && v.ventasAct) ? (v.cuotaMensual * 12) / v.ventasAct : null,
  margen: (v) => (v.utilidadAct != null && v.ventasAct) ? v.utilidadAct / v.ventasAct : null,
  crecimiento: (v) => (v.ventasAct != null && v.ventasAnt) ? (v.ventasAct / v.ventasAnt - 1) : null
};
// Cuota estimada gruesa (cuota fija 25% a 12m) sobre el monto sincerado; alimenta el DSCR.
const CUOTA_REF_JS = { tasaAnual: 0.25, meses: 12 };
function cuotaEstimadaJS(monto) {
  const m = Number(monto); if (!isFinite(m) || m <= 0) return null;
  const i = CUOTA_REF_JS.tasaAnual / 12, n = CUOTA_REF_JS.meses;
  return m * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
}
function evaluarRatiosJS(cat, valores, ticket) {
  const v = {};
  (cat.insumos || []).forEach(i => { const n = Number(valores[i.clave]); v[i.clave] = isFinite(n) ? n : null; });
  const monto = FICHA.solicitud && Number(FICHA.solicitud.montoSolicitado);
  const cuotaEst = cuotaEstimadaJS(monto);
  v.cuotaMensual = cuotaEst;
  let ganado = 0, pesoTotal = 0; const detalle = []; const observaciones = []; let capacidad = null;
  (cat.ratios || []).forEach(r => {
    pesoTotal += r.peso;
    const fn = RATIO_CALC_JS[r.clave]; const val = fn ? fn(v) : null;
    const umbral = r.umbral[ticket] != null ? r.umbral[ticket] : r.umbral.Bajo;
    let cumple = null;
    if (val != null && isFinite(val)) {
      cumple = r.dir === 'min' ? (val >= umbral) : (val <= umbral);
      if (cumple) ganado += r.peso; else observaciones.push(r.etiqueta + ' fuera de umbral');
    } else observaciones.push(r.etiqueta + ': falta dato');
    detalle.push({ clave: r.clave, etiqueta: r.etiqueta, valor: val, umbral, dir: r.dir, fmt: r.fmt, cumple });
    if (r.clave === 'dscr' && v.flujoMensual) capacidad = v.flujoMensual / umbral;
  });
  const puntaje = pesoTotal ? Math.round(ganado / pesoTotal * 100) : 0;
  return { puntaje, detalle, observaciones, capacidad, cuotaEst };
}
function penalJS(p, valores) {
  const val = valores[p.clave];
  if (val === undefined || val === null || val === '') return 0;
  if (p.tipo === 'penalPorUnidad' || p.tipo === 'penalPorPct') { const n = Number(val); return isFinite(n) && n > 0 ? n * p.pena : 0; }
  if (p.tipo === 'penalEscala' || p.tipo === 'penalMonto') { const n = Number(val); if (!isFinite(n) || n <= 0) return 0; const t = p.tramos.find(t => n <= t.hasta); return t ? t.pena : 0; }
  if (p.tipo === 'penalSelect') { return p.mapa[val] || 0; }
  return 0;
}
function evaluarFiltro2JS(cat, valores, ticket) {
  valores = valores || {}; ticket = ticket || 'Bajo';
  const kos = [], escalados = [], observados = [];
  (cat.gates || []).forEach(g => { const r = evalGateJS(g, valores, ticket); if (r.resultado === 'ko') kos.push(r.motivo || g.etiqueta); else if (r.resultado === 'escalado') escalados.push(r.motivo || g.etiqueta); else if (r.resultado === 'observado') observados.push(r.motivo || g.etiqueta); });
  if (kos.length) return { semaforo: 'Rojo', puntaje: 0, kos, escalados, observados, ko: true };
  let total = 0, pesoTotal = 0, faltan = 0;
  (cat.score || []).forEach(it => { pesoTotal += it.peso; const p = evalScoreJS(it, valores, ticket); if (p == null) faltan++; else total += p; });
  let puntaje = pesoTotal ? Math.round(total / pesoTotal * 100) : 100;
  let ratios = null;
  if (cat.ratios && cat.ratios.length) { ratios = evaluarRatiosJS(cat, valores, ticket); puntaje = ratios.puntaje; ratios.observaciones.forEach(o => observados.push(o)); }
  (cat.analisis || []).forEach(a => { const v = valores[a.clave]; const vacio = (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)); if (vacio) escalados.push(a.motivo || ('Falta ' + a.etiqueta)); });
  let penalTotal = 0; (cat.penal || []).forEach(p => { penalTotal += penalJS(p, valores); });
  if (penalTotal) puntaje = Math.max(0, Math.round(puntaje - penalTotal));
  const soloGates = !(cat.score && cat.score.length) && !(cat.ratios && cat.ratios.length);
  if (soloGates && observados.length) { puntaje = Math.max(50, 100 - observados.length * 12); }
  let semaforo = puntaje >= 80 ? 'Verde' : (puntaje >= 50 ? 'Amarillo' : 'Rojo');
  if (escalados.length && semaforo === 'Verde') semaforo = 'Amarillo';
  if (observados.length && semaforo !== 'Rojo') semaforo = 'Amarillo';
  else if (observados.length && semaforo === 'Rojo' && !kos.length) semaforo = 'Amarillo';
  return { semaforo, puntaje, kos, escalados, observados, ko: false, faltan, ratios };
}
function inputFiltro2(campo, valores, prefijo, tipo, ticket) {
  const val = valores[campo.clave];
  const cb = 'recalcFiltro2(\'' + prefijo + '\',\'' + tipo + '\',\'' + ticket + '\')';
  // Gate automático (SUNAT): se calcula solo. Se muestra como CHIP de lectura con color por resultado.
  if (campo.tipo === 'select' && campo.auto) {
    const op = campo.opciones.find(o => o.v === val);
    let chip;
    if (!op) chip = '<span class="mtr-chip mtr-chip-p">Se autocompleta con SUNAT</span>';
    else {
      const cls = op.resultado === 'ok' ? 'mtr-chip-ok' : (op.resultado === 'observado' ? 'mtr-chip-obs' : 'mtr-chip-ko');
      chip = '<span class="mtr-chip ' + cls + '">' + op.label + '</span>';
    }
    return chip + '<input type="hidden" data-f2="' + prefijo + '" data-k="' + campo.clave + '" value="' + (val != null ? val : '') + '">';
  }
  if (campo.tipo === 'select') {
    let h = '<select class="mtr-in" data-f2="' + prefijo + '" data-k="' + campo.clave + '" onchange="' + cb + '"><option value="">—</option>' +
      campo.opciones.map(o => '<option value="' + o.v + '"' + (val === o.v ? ' selected' : '') + '>' + o.label + '</option>').join('') + '</select>';
    // Sub-control que se despliega según el valor gatillo del gate (por defecto 'si').
    if (campo.despliega) { const gatillo = campo.despliegaSi || 'si'; h += subControlFiltro2(campo.despliega, valores, prefijo, tipo, ticket, val === gatillo); }
    return h;
  }
  // Antigüedad en años y meses (solo lectura del cálculo; el número real va en hidden).
  if (campo.formato === 'aniosMeses') {
    const meses = val != null && val !== '' ? Number(val) : null;
    const txt = meses != null && isFinite(meses) ? fmtAniosMeses(meses) : '—';
    return '<span class="mtr-am">' + txt + '</span><input type="hidden" data-f2="' + prefijo + '" data-k="' + campo.clave + '" value="' + (meses != null ? meses : '') + '">';
  }
  // Numérico con límite por ticket (KO o observado). Unidad clara + bloqueo de letras + límite visible.
  if (campo.tipo === 'numMaxTicket' || campo.tipo === 'numObsTicket') {
    const max = campo.maxTicket && (campo.maxTicket[ticket] != null ? campo.maxTicket[ticket] : campo.maxTicket.Bajo);
    const esMonto = campo.unidad === 'monto';
    const esPct = campo.unidad === 'porcentaje';
    // Texto del límite: KO vs observado.
    const lim = campo.tipo === 'numMaxTicket'
      ? (max === 0 ? 'no permitido' : 'máx ' + max)
      : (esMonto ? 'obs. > S/' + Number(max).toLocaleString('es-PE') : esPct ? 'obs. > ' + max + '%' : 'obs. > ' + max);
    // UX: desplegable por RANGOS en vez de tipeo manual. El value sigue siendo numérico,
    // así el motor (server y espejo) evalúa igual contra el límite del ticket.
    let ops;
    if (esPct) ops = [[null, '—'], [0, '0%'], [10, 'Hasta 10%'], [25, 'Hasta 25%'], [50, 'Hasta 50%'], [75, 'Hasta 75%'], [100, 'Más de 75%']];
    else if (esMonto) ops = [[null, '—'], [0, 'Sin morosos (S/ 0)'], [500, 'Hasta S/ 500'], [1000, 'Hasta S/ 1,000'], [3000, 'S/ 1,001 – 3,000'], [5000, 'S/ 3,001 – 5,000'], [10000, 'Más de S/ 5,000']];
    else if (campo.tipo === 'numMaxTicket' && max === 0) ops = [[null, '—'], [0, 'No registra'], [1, 'Sí registra (1 o más)']];
    else ops = [[null, '—'], [0, '0'], [1, '1'], [2, '2'], [3, '3'], [5, 'Más de 3']];
    const sel = '<select class="mtr-in" data-f2="' + prefijo + '" data-k="' + campo.clave + '" onchange="' + cb + '">' +
      ops.map(o => '<option value="' + (o[0] == null ? '' : o[0]) + '"' + (String(val ?? '') === String(o[0] ?? '') ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
    return '<span class="mtr-numwrap">' + sel + '<span class="mtr-lim">' + lim + '</span></span>';
  }
  // Numérico activable (legacy, ya no usado en crédito).
  if (campo.activable) {
    const activo = val != null && val !== '';
    return '<label class="mtr-act"><input type="checkbox" ' + (activo ? 'checked' : '') + ' onchange="toggleActivable(this,\'' + prefijo + '\',\'' + campo.clave + '\',\'' + tipo + '\',\'' + ticket + '\')"> aplica</label>' +
      '<input type="number" step="any" class="mtr-in mtr-num" data-f2="' + prefijo + '" data-k="' + campo.clave + '" value="' + (activo ? val : '') + '"' + (activo ? '' : ' disabled') + ' oninput="' + cb + '">';
  }
  return '<input type="number" step="any" class="mtr-in mtr-num" data-f2="' + prefijo + '" data-k="' + campo.clave + '" value="' + (val != null ? val : '') + '" oninput="' + cb + '">';
}
// Bloquea la entrada de caracteres no numéricos. permitePunto=true admite un punto decimal (montos).
function b2bSoloNumero(e, permitePunto) {
  const ch = e.key || String.fromCharCode(e.which);
  if (ch === 'Enter' || ch === 'Backspace' || ch === 'Tab') return true;
  if (/[0-9]/.test(ch)) return true;
  if (permitePunto && ch === '.' && !(e.target.value || '').includes('.')) return true;
  e.preventDefault(); return false;
}
// Sub-control desplegable (cantidad de protestados / monto de coactiva).
function subControlFiltro2(clave, valores, prefijo, tipo, ticket, visible) {
  const cb = 'recalcFiltro2(\'' + prefijo + '\',\'' + tipo + '\',\'' + ticket + '\')';
  const val = valores[clave];
  const defs = {
    protestadosCant: { tipo: 'num', ph: '¿cuántos?', suf: 'docs' },
    coactivaMonto: { tipo: 'sel', opciones: [{ v: 'm1', label: '< S/ 1,000' }, { v: 'm2', label: 'S/ 1,000 – 5,000' }, { v: 'm3', label: '> S/ 5,000' }] },
    partidaRegistral: { tipo: 'txt', ph: 'N.º de partida registral' },
    dniNumero: { tipo: 'txt', ph: 'N.º de DNI', maxlength: 8 },
    zonaMaps: { tipo: 'txt', ph: 'https://maps.google.com/…' }
  };
  const d = defs[clave]; if (!d) return '';
  const style = visible ? '' : 'display:none';
  let inner;
  if (d.tipo === 'sel') {
    inner = '<select class="mtr-in mtr-sub" data-f2="' + prefijo + '" data-k="' + clave + '" onchange="' + cb + '"><option value="">—</option>' +
      d.opciones.map(o => '<option value="' + o.v + '"' + (val === o.v ? ' selected' : '') + '>' + o.label + '</option>').join('') + '</select>';
  } else if (d.tipo === 'txt') {
    inner = '<input type="text" class="mtr-in mtr-sub mtr-txt" data-f2="' + prefijo + '" data-k="' + clave + '" value="' + (val != null ? String(val).replace(/"/g, '&quot;') : '') + '"' + (d.maxlength ? ' maxlength="' + d.maxlength + '"' : '') + ' placeholder="' + d.ph + '" oninput="' + cb + '">';
  } else {
    inner = '<input type="number" step="1" min="0" class="mtr-in mtr-num mtr-sub" data-f2="' + prefijo + '" data-k="' + clave + '" value="' + (val != null ? val : '') + '" placeholder="' + d.ph + '" oninput="' + cb + '">' + (d.suf ? '<span class="mtr-suf">' + d.suf + '</span>' : '');
  }
  return '<span class="mtr-subwrap" data-subfor="' + clave + '" style="' + style + '">' + inner + '</span>';
}
// Formatea meses a "X años Y meses".
function fmtAniosMeses(m) {
  m = Number(m); if (!isFinite(m) || m < 0) return '—';
  const a = Math.floor(m / 12), me = m % 12;
  const pa = a > 0 ? a + (a === 1 ? ' año' : ' años') : '';
  const pm = me > 0 ? me + (me === 1 ? ' mes' : ' meses') : '';
  return (pa && pm) ? pa + ' y ' + pm : (pa || pm || '0 meses');
}
// Activa/desactiva un input numérico activable.
function toggleActivable(chk, prefijo, clave, tipo, ticket) {
  const inp = document.querySelector('[data-f2="' + prefijo + '"][data-k="' + clave + '"]');
  if (inp) { inp.disabled = !chk.checked; if (!chk.checked) inp.value = ''; else inp.focus(); }
  recalcFiltro2(prefijo, tipo, ticket);
}
function bandaFiltro2HTML(ev) {
  let h = '<span class="mtr-pill">' + (SEM_EMOJI[ev.semaforo] || '') + ' ' + ev.semaforo + ' · ' + ev.puntaje + '%</span>';
  if (ev.kos && ev.kos.length) h += '<div class="f2-ko">✕ KO: ' + ev.kos.join(' · ') + '</div>';
  if (ev.observados && ev.observados.length) h += '<div class="f2-obs">👁 Observado: ' + ev.observados.join(' · ') + '</div>';
  if (ev.escalados && ev.escalados.length) h += '<div class="f2-esc">⚠ Escalado a excepción: ' + ev.escalados.join(' · ') + '</div>';
  return h;
}
function renderFiltroDosCapas(tipo, valores, prefijo, ticket) {
  const cat = (FILTROS_B2B_CACHE && FILTROS_B2B_CACHE[tipo]); if (!cat) return '<div class="sub">Catálogo no disponible.</div>';
  valores = valores || {};
  const gatesHtml = cat.gates.filter(g => g.tipo !== 'textoReq').map(g =>
    '<div class="mtr-row"><span class="f2-dot" id="' + prefijo + '_g_' + g.clave + '"></span><span class="mtr-lbl">' + g.etiqueta + '</span>' +
    '<span class="mtr-ctrl">' + inputFiltro2(g, valores, prefijo, tipo, ticket) + (g.sufijo && g.formato !== 'aniosMeses' ? '<span class="mtr-suf">' + g.sufijo + '</span>' : '') + '</span></div>').join('');
  const scoreVisibles = cat.score.filter(it => !it.refGate);
  const scoreHtml = scoreVisibles.map(it =>
    '<div class="mtr-row"><span class="mtr-lbl">' + it.etiqueta + ' <span class="f2-peso">(' + it.peso + ')</span></span>' +
    '<span class="mtr-ctrl">' + inputFiltro2(it, valores, prefijo, tipo, ticket) + (it.sufijo ? '<span class="mtr-suf">' + it.sufijo + '</span>' : '') + '</span></div>').join('');
  // Penalizaciones activables (solo crédito): checkbox que habilita el input y castiga el puntaje.
  const penalActivables = (cat.penal || []).filter(p => p.activable);
  const etiquetasPenal = {
    refis: 'Refinanciamientos últ. 12m', cppHist: 'CPP histórico (cantidad)',
    morososMonto: 'Documentos morosos (monto S/)', cppEvalPct: 'CPP en evaluación (%)'
  };
  const sufPenal = { morososMonto: 'S/', cppEvalPct: '%' };
  const penalHtml = penalActivables.map(p =>
    '<div class="mtr-row"><span class="mtr-lbl">' + (etiquetasPenal[p.clave] || p.clave) + '</span>' +
    '<span class="mtr-ctrl">' + inputFiltro2({ clave: p.clave, tipo: 'num', activable: true }, valores, prefijo, tipo, ticket) +
    (sufPenal[p.clave] ? '<span class="mtr-suf">' + sufPenal[p.clave] + '</span>' : '') + '</span></div>').join('');
  const ev = evaluarFiltro2JS(cat, valores, ticket);
  let html = '<div class="f2-box"><div class="fb-sec">Gates (eliminatorios)</div>' + gatesHtml;
  if (scoreHtml) html += '<div class="fb-sec">Puntaje de calidad</div>' + scoreHtml;
  if (penalHtml) html += '<div class="fb-sec">Antecedentes (activa el que aplique)</div>' + penalHtml;
  // Bloque de insumos numéricos + ratios calculados (finanzas).
  if (cat.insumos && cat.insumos.length) {
    const insHtml = cat.insumos.map(i => {
      const val = valores[i.clave];
      return '<div class="mtr-row"><span class="mtr-lbl">' + i.etiqueta + '</span><span class="mtr-ctrl">' +
        '<input type="number" step="any" class="mtr-in mtr-num" data-f2="' + prefijo + '" data-k="' + i.clave + '" value="' + (val != null ? val : '') + '" oninput="recalcFiltro2(\'' + prefijo + '\',\'' + tipo + '\',\'' + ticket + '\')">' +
        (i.sufijo ? '<span class="mtr-suf">' + i.sufijo + '</span>' : '') + '</span></div>';
    }).join('');
    html += '<div class="fb-sec">Cifras financieras (2 años, cierre de año)</div>' + insHtml;
    html += '<div class="fb-sec">Ratios calculados</div><div id="' + prefijo + '_ratios">' + ratiosTablaHTML(ev.ratios) + '</div>';
  }
  // Bloque de análisis comercial/financiero (obligatorio; el Business Case lo hereda).
  if (cat.analisis && cat.analisis.length) {
    const cb = 'recalcFiltro2(\'' + prefijo + '\',\'' + tipo + '\',\'' + ticket + '\')';
    const anHtml = cat.analisis.map(a => {
      const val = valores[a.clave];
      if (a.tipo === 'selectReq') {
        return '<div class="mtr-row"><span class="mtr-lbl">' + a.etiqueta + '</span><span class="mtr-ctrl">' +
          '<select class="mtr-in" style="max-width:none;width:240px" data-f2="' + prefijo + '" data-k="' + a.clave + '" onchange="' + cb + '"><option value="">—</option>' +
          a.opciones.map(o => '<option value="' + o.v + '"' + (val === o.v ? ' selected' : '') + '>' + o.label + '</option>').join('') + '</select></span></div>';
      }
      if (a.tipo === 'multiReq') {
        const arr = Array.isArray(val) ? val : (val ? String(val).split(',') : []);
        const chips = a.opciones.map(o => {
          const on = arr.includes(o.v);
          return '<label class="an-chip' + (on ? ' an-chip-on' : '') + '"><input type="checkbox" ' + (on ? 'checked' : '') + ' data-f2multi="' + prefijo + '" data-k="' + a.clave + '" value="' + o.v + '" onchange="' + cb + '"> ' + o.label + '</label>';
        }).join('');
        return '<div class="mtr-row mtr-row-multi"><span class="mtr-lbl">' + a.etiqueta + '</span><div class="an-chips">' + chips + '</div></div>';
      }
      // textoLibreReq
      return '<div class="mtr-row mtr-row-multi"><span class="mtr-lbl">' + a.etiqueta + '</span>' +
        '<textarea class="mtr-in an-textarea" data-f2="' + prefijo + '" data-k="' + a.clave + '" placeholder="Explica por qué el caso merece evaluación…" oninput="' + cb + '">' + (val ? String(val).replace(/</g, '&lt;') : '') + '</textarea></div>';
    }).join('');
    html += '<div class="fb-sec">Análisis del caso (para el Business Case)</div>' + anHtml;
  }
  html += '<div class="f2-foot" id="' + prefijo + '_foot">' + bandaFiltro2HTML(ev) + '</div></div>';
  return html;
}
// Tabla de ratios con su umbral, valor calculado y semáforo; + cruce de capacidad para DSCR.
function ratiosTablaHTML(ratios) {
  if (!ratios || !ratios.detalle) return '<div class="sub">Ingresa las cifras para calcular los ratios.</div>';
  const fmtVal = (v, f) => v == null ? '—' : (f === '%' ? (v * 100).toFixed(1) + '%' : v.toFixed(2) + 'x');
  const fmtUmb = (u, f, dir) => (dir === 'min' ? '≥ ' : '≤ ') + (f === '%' ? (u * 100).toFixed(0) + '%' : u.toFixed(1) + 'x');
  // Nota de la cuota estimada usada para el DSCR (gruesa: 25% a 12m sobre el monto sincerado).
  let cuotaNota = '';
  if (ratios.cuotaEst != null) cuotaNota = '<div class="rt-cuota">Cuota estimada (25% a 12m sobre el monto): <b>S/ ' + Math.round(ratios.cuotaEst).toLocaleString('es-PE') + '</b>/mes</div>';
  else cuotaNota = '<div class="rt-cuota rt-cuota-pend">Define el monto exacto (botón Editar en Solicitud) para estimar la cuota del DSCR.</div>';
  let rows = ratios.detalle.map(d => {
    const est = d.cumple == null ? '<span class="rt-na">sin dato</span>' : (d.cumple ? '<span class="rt-ok">✓ cumple</span>' : '<span class="rt-obs">⚠ observar</span>');
    return '<tr><td>' + d.etiqueta + '</td><td class="rt-c">' + fmtUmb(d.umbral, d.fmt, d.dir) + '</td><td class="rt-c"><b>' + fmtVal(d.valor, d.fmt) + '</b></td><td class="rt-c">' + est + '</td></tr>';
  }).join('');
  let cap = '';
  const dscr = ratios.detalle.find(d => d.clave === 'dscr');
  if (dscr && dscr.cumple === false && ratios.capacidad != null) {
    cap = '<div class="rt-cap">💡 Capacidad de pago: la cuota máxima que soporta el flujo es <b>S/ ' + Math.floor(ratios.capacidad).toLocaleString('es-PE') + '</b>/mes. Considera reducir el monto a ese nivel.</div>';
  }
  return cuotaNota + '<table class="rt-tabla"><thead><tr><th>Ratio</th><th>Umbral</th><th>Valor</th><th>Estado</th></tr></thead><tbody>' + rows + '</tbody></table>' + cap;
}
function leerFiltro2(prefijo) {
  const o = {}; document.querySelectorAll('[data-f2="' + prefijo + '"]').forEach(el => { const v = el.value; if (v !== '' && v != null) o[el.getAttribute('data-k')] = v; });
  // Multi-selección (mitigantes): junta los checkboxes marcados en un array.
  document.querySelectorAll('[data-f2multi="' + prefijo + '"]:checked').forEach(el => {
    const k = el.getAttribute('data-k'); if (!o[k]) o[k] = []; if (Array.isArray(o[k])) o[k].push(el.value);
  });
  return o;
}
function recalcFiltro2(prefijo, tipo, ticket) {
  const cat = (FILTROS_B2B_CACHE && FILTROS_B2B_CACHE[tipo]); if (!cat) return;
  const valores = leerFiltro2(prefijo);
  // Muestra/oculta sub-controles según la condición de su gate hijo (requiereSi) o, por defecto, padre=='si'.
  (cat.gates || []).forEach(g => {
    if (!g.despliega) return;
    const hijo = (cat.gates || []).find(x => x.clave === g.despliega);
    const sub = document.querySelector('.mtr-subwrap[data-subfor="' + g.despliega + '"]');
    if (!sub) return;
    let mostrar;
    if (hijo && hijo.requiereSi) mostrar = (valores[hijo.requiereSi.clave] === hijo.requiereSi.val);
    else mostrar = (valores[g.clave] === 'si');
    sub.style.display = mostrar ? '' : 'none';
  });
  cat.gates.forEach(g => { const el = $(prefijo + '_g_' + g.clave); if (el) { const r = evalGateJS(g, valores, ticket); el.className = 'f2-dot ' + (r.resultado === 'ko' ? 'f2-ko-dot' : r.resultado === 'escalado' ? 'f2-esc-dot' : r.resultado === 'observado' ? 'f2-obs-dot' : (valores[g.clave] ? 'f2-ok-dot' : '')); } });
  const foot = $(prefijo + '_foot'); if (foot) foot.innerHTML = bandaFiltro2HTML(evaluarFiltro2JS(cat, valores, ticket));
  const rt = $(prefijo + '_ratios'); if (rt && cat.ratios) rt.innerHTML = ratiosTablaHTML(evaluarFiltro2JS(cat, valores, ticket).ratios);
}
// Autocompleta los gates de SUNAT desde los datos ya conocidos (RUC, sunatRaw, antigüedad, ventas).
function autoValoresSunat(s) {
  let raw = {}; try { raw = s.sunatRaw ? (typeof s.sunatRaw === 'string' ? JSON.parse(s.sunatRaw) : s.sunatRaw) : {}; } catch (e) { }
  const v = {};
  if (s.ruc) v.personaJuridica = String(s.ruc).startsWith('20') ? 'si' : (String(s.ruc).startsWith('10') ? 'observar' : 'no');
  if (raw.estado) {
    if (/activ/i.test(raw.estado)) v.estado = 'activo';
    else if (/baja\s*prov|de\s*oficio|provision/i.test(raw.estado)) v.estado = 'bajaprov';
    else v.estado = 'no';
  }
  if (raw.condicion) v.condicion = /^\s*habido/i.test(raw.condicion) ? 'habido' : 'no';
  if (s.antiguedadMeses != null) v.antiguedad = s.antiguedadMeses;
  return v;
}
// Boton "i": detalle de lo observado/KO en un filtro guardado (motivos persistidos).
function btnInfoFiltro(tipo) {
  const f = FICHA.filtros && FICHA.filtros[tipo];
  if (!f || !f.semaforo || f.semaforo === 'Verde') return '';
  return ' <button class="fb-flag fb-info" style="font-size:13px;padding:1px 7px" title="Ver qué está observado" onclick="event.stopPropagation();verInfoFiltro(\'' + tipo + '\')">i</button>';
}
function verInfoFiltro(tipo) {
  const f = (FICHA.filtros && FICHA.filtros[tipo]) || {};
  let m = f.motivos; try { if (typeof m === 'string') m = JSON.parse(m); } catch (e) { m = null; }
  const kos = (m && m.kos) || [], obs = (m && (m.escalados || m.observados)) || [];
  let txt = '';
  if (kos.length) txt += '⛔ ELIMINATORIOS:\n• ' + kos.join('\n• ') + '\n\n';
  if (obs.length) txt += '👁 OBSERVADO:\n• ' + obs.join('\n• ');
  alert(txt || 'Filtro ' + tipo + ': ' + (f.semaforo || 'sin evaluar') + (f.puntaje != null ? ' · ' + f.puntaje + '%' : '') + '\n(Sin detalle de motivos guardado.)');
}

function panelFiltroSunat(s, modo) {
  const open = FICHA_ETAPA_OPEN === 'fsunat';
  const f = FICHA.filtros.sunat || {};
  const sem = f.semaforo || null;
  let head = '<span class="sub">pendiente</span>';
  if (sem === 'Verde') head = '<span class="fb-pill" style="background:#E7F6EF;color:#1D9E75;font-weight:800">AVANZA ✓' + (f.puntaje != null ? ' · ' + f.puntaje + '%' : '') + '</span>';
  else if (sem === 'Amarillo') head = '<span class="fb-pill" style="background:#FFF4E0;color:#B7791F;font-weight:800">Avanza con observación' + (f.puntaje != null ? ' · ' + f.puntaje + '%' : '') + '</span>';
  else if (sem === 'Rojo') head = '<span class="fb-pill" style="background:#FDE8E7;color:#CC0000;font-weight:800">DESESTIMADO</span>';
  head += btnInfoFiltro('sunat');
  if (!open) return fbPanelWrap('fsunat', '🏢', '1 · Filtro SUNAT', head, false, '', false, modo, 'Solicitud');
  const ticket = s.ticket || 'Bajo';
  const saved = (f.checklist && typeof f.checklist === 'object') ? f.checklist : {};
  const auto = autoValoresSunat(s);
  // El checklist guardado completa/corrige lo demás, pero personaJuridica SIEMPRE se deriva del prefijo del RUC.
  const valores = Object.assign(auto, saved);
  if (auto.personaJuridica != null) valores.personaJuridica = auto.personaJuridica;
  // Datos de empresa (antes panel separado) ahora fusionados en la cabecera del filtro.
  let raw = {}; try { raw = s.sunatRaw ? (typeof s.sunatRaw === 'string' ? JSON.parse(s.sunatRaw) : s.sunatRaw) : {}; } catch (e) { }
  const estadoTxt = raw.estado || null, condTxt = raw.condicion || null;
  const chip = (txt, ok) => '<span class="emp-flag ' + (ok ? 'emp-ok' : 'emp-warn') + '">' + (ok ? '✓' : '!') + ' ' + txt + '</span>';
  const flags = (estadoTxt || condTxt) ? '<div class="emp-flags">' +
    (estadoTxt ? chip(estadoTxt, /activ/i.test(estadoTxt)) : '') +
    (condTxt ? chip(condTxt, /^\s*habido/i.test(condTxt)) : '') + '</div>' : '';
  const datosEmp = '<div class="fb-emp-datos">' +
    fbCampo('Razón social', s.razonSocial) + fbCampo('RUC', s.ruc) +
    fbCampoOpt('Nombre comercial', s.nombreComercial) + fbCampoOpt('Sector', s.sector) +
    fbCampoOpt('Actividad', s.actividad) + fbCampo('Antigüedad', fmtAntiguedad(s.antiguedadMeses)) + '</div>';
  const cuerpo = '<div class="fb-body">' + flags + datosEmp +
    '<p class="sub">Ticket <b>' + ticket + '</b>. Los datos de SUNAT se autocompletan; RUC 20 pasa por defecto, RUC 10 queda observado.</p>' +
    renderFiltroDosCapas('sunat', valores, 'fsunat', ticket) +
    '<div class="fb-acc"><button class="btn" onclick="guardarFiltroSunat()">Guardar</button></div></div>';
  return fbPanelWrap('fsunat', '🏢', '1 · Filtro SUNAT', head, true, cuerpo, false, modo, 'Solicitud');
}
async function guardarFiltroSunat() {
  try {
    const valores = leerFiltro2('fsunat');
    const r = await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/filtro/sunat', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checklist: valores }) });
    FICHA.filtros.sunat = Object.assign({}, FICHA.filtros.sunat, { checklist: valores, semaforo: r.semaforo, puntaje: r.puntaje, motivos: r.motivos });
    setPanelPill('fsunat', r.semaforo);
    if (typeof cargarKanbanB2B === 'function' && B2B_VISTA === 'kanban') cargarKanbanB2B();
  } catch (e) { alert('No se pudo guardar: ' + e.message); }
}

function panelSolicitud(s) {
  const open = FICHA_ETAPA_OPEN === 'solicitud';
  let cuerpo = '';
  if (open) {
    const montoStr = s.montoSolicitado != null ? fmtSoles(s.montoSolicitado) : (s.montoRango || '—');
    const montoExtra = (s.montoSolicitado != null && s.montoRango) ? ' <span class="sub">(' + s.montoRango + ')</span>' : '';
    const montoFila = '<div class="fb-campo"><span class="fb-k">Monto solicitado</span><span class="fb-v">' + montoStr + montoExtra +
      ' <button class="btn-sunat" style="margin-left:8px;padding:2px 8px;font-size:11px" onclick="editarMontoB2B()">✏️ Editar</button></span></div>';
    // RUC: se muestra el que pusieron inicialmente. Editable SOLO en la etapa Solicitud/SUNAT.
    const enSolicitud = (FICHA.etapaKanban === 'Solicitud') || B2B_MODO_DEMO;
    const rucVal = s.ruc || '';
    const rucEstado = s.sunatEstado === 'ok' ? '<span class="ruc-ok">✓ validado</span>' : (s.sunatEstado === 'error' ? '<span class="ruc-err">⚠ no valida en SUNAT</span>' : (rucVal && !/^(10|15|17|20)\d{9}$/.test(String(rucVal).trim()) ? '<span class="ruc-err">⚠ RUC inválido</span>' : '<span class="sub">pendiente</span>'));
    const rucFila = enSolicitud
      ? '<div class="fb-campo"><span class="fb-k">RUC</span><span class="fb-v">' +
        '<input id="fbRucEdit" class="mtr-in" style="width:150px" value="' + rucVal + '" maxlength="11" onkeypress="return b2bSoloNumero(event,false)"> ' +
        '<button class="btn-sunat" style="padding:2px 10px;font-size:11px" onclick="validarRucB2B()">🔎 Validar</button> ' + rucEstado + '</span></div>'
      : '<div class="fb-campo"><span class="fb-k">RUC</span><span class="fb-v">' + (rucVal || '—') + ' ' + rucEstado + '</span></div>';
    const garantia = '<div class="fb-sec">Garantía declarada</div>' +
      fbCampo('¿Tiene inmueble?', s.tieneInmueble) +
      fbCampoOpt('Tipo de inmueble', s.tipoInmueble) +
      fbCampoOpt('Área (m²)', s.areaInmueble) +
      fbCampoOpt('Registrado SUNARP', s.registradoSunarp) +
      fbCampoOpt('Ubicación del inmueble', s.departamentoInmueble);
    cuerpo = '<div class="fb-body">' +
      rucFila +
      fbCampo('Contacto', s.contacto) + fbCampo('Teléfono', s.telefono) + fbCampoOpt('Email', s.email) +
      montoFila +
      fbCampoOpt('Destino de fondos', s.destinoFondos) +
      garantia +
      '</div>';
  }
  const rucHead = s.ruc ? '<span class="fb-ruc-head">RUC ' + s.ruc + '</span>' : '<span class="fb-ruc-head fb-ruc-falta">sin RUC</span>';
  return fbPanelWrap('solicitud', '📥', 'Solicitud', rucHead + ' <span style="font-size:12px;color:#6B7A8D">datos del lead</span>', open, cuerpo);
}

function consolidadoCreditoJS() {
  const orden = { Verde: 0, Amarillo: 1, Rojo: 2 };
  let peor = null, pv = -1;
  (FICHA.creditoSujetos || []).forEach(su => {
    if (su.semaforo && orden[su.semaforo] != null && orden[su.semaforo] > pv) { pv = orden[su.semaforo]; peor = su.semaforo; }
  });
  return peor;
}

// ===== Motor de MÉTRICAS en el cliente (espejo del server: color en vivo, sin llamadas) =====
let CRITERIOS_B2B_CACHE = null;
async function cargarCriteriosB2B() {
  if (CRITERIOS_B2B_CACHE) return CRITERIOS_B2B_CACHE;
  try { const d = await api('/api/b2b/criterios'); CRITERIOS_B2B_CACHE = d.criterios || {}; }
  catch (e) { CRITERIOS_B2B_CACHE = {}; }
  return CRITERIOS_B2B_CACHE;
}
const SEM_ORDEN = { Verde: 0, Amarillo: 1, Rojo: 2 };
const SEM_DOT = { Verde: '#1D9E75', Amarillo: '#E0A800', Rojo: '#CC0000' };
const SEM_EMOJI = { Verde: '🟢', Amarillo: '🟡', Rojo: '🔴' };
const ORDEN_SEM_JS = { Verde: 0, Amarillo: 1, Rojo: 2 };
function colorCriterioJS(crit, valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (crit.tipo === 'select') { const o = (crit.opciones || []).find(o => o.v === valor); return o ? o.color : null; }
  if (crit.tipo === 'num') {
    const n = Number(valor); if (!isFinite(n)) return null;
    for (const r of (crit.reglas || [])) {
      if (r.op === '<=' && n <= r.val) return r.color;
      if (r.op === '>=' && n >= r.val) return r.color;
      if (r.op === '<' && n < r.val) return r.color;
      if (r.op === '>' && n > r.val) return r.color;
      if (r.op === '==' && n === r.val) return r.color;
    }
    return crit.resto || null;
  }
  return null;
}
function peorColorJS(a, b) { if (a == null) return b; if (b == null) return a; return SEM_ORDEN[a] >= SEM_ORDEN[b] ? a : b; }
function evalChecklistJS(tipo, valores) {
  const items = (CRITERIOS_B2B_CACHE && CRITERIOS_B2B_CACHE[tipo]) || [];
  let sem = null, faltan = 0;
  items.forEach(c => { const col = colorCriterioJS(c, valores ? valores[c.clave] : undefined); if (col == null) faltan++; else sem = peorColorJS(sem, col); });
  return { semaforo: sem, faltan, total: items.length };
}
function pillMetricasHTML(ev) {
  return (ev.semaforo ? SEM_EMOJI[ev.semaforo] + ' ' + ev.semaforo : 'sin evaluar') +
    (ev.faltan ? ' <span class="mtr-faltan">· faltan ' + ev.faltan + '</span>' : '');
}
// Renderiza los inputs de métricas de un filtro. prefijo = id único ('gar','fin','suj12').
function renderMetricasB2B(tipo, valores, prefijo) {
  const items = (CRITERIOS_B2B_CACHE && CRITERIOS_B2B_CACHE[tipo]) || [];
  valores = valores || {};
  const filas = items.map(c => {
    const val = valores[c.clave];
    const col = colorCriterioJS(c, val);
    const dot = '<span class="mtr-dot" id="' + prefijo + '_dot_' + c.clave + '" style="background:' + (col ? SEM_DOT[col] : '#DDE4EC') + '"></span>';
    let input;
    if (c.tipo === 'select') {
      input = '<select class="mtr-in" data-mtr="' + prefijo + '" data-k="' + c.clave + '" onchange="recalcMetricasB2B(\'' + prefijo + '\',\'' + tipo + '\')">' +
        '<option value="">—</option>' +
        c.opciones.map(o => '<option value="' + o.v + '"' + (val === o.v ? ' selected' : '') + '>' + o.label + '</option>').join('') + '</select>';
    } else {
      input = '<input type="number" step="any" class="mtr-in mtr-num" data-mtr="' + prefijo + '" data-k="' + c.clave + '" value="' + (val != null ? val : '') + '" oninput="recalcMetricasB2B(\'' + prefijo + '\',\'' + tipo + '\')">';
    }
    return '<div class="mtr-row">' + dot + '<span class="mtr-lbl">' + c.etiqueta + '</span>' + input + (c.sufijo ? '<span class="mtr-suf">' + c.sufijo + '</span>' : '') + '</div>';
  }).join('');
  const ev = evalChecklistJS(tipo, valores);
  return '<div class="mtr-box">' + filas +
    '<div class="mtr-foot">Semáforo (calculado): <span class="mtr-pill" id="' + prefijo + '_pill">' + pillMetricasHTML(ev) + '</span></div></div>';
}
function leerMetricas(prefijo) {
  const o = {};
  document.querySelectorAll('[data-mtr="' + prefijo + '"]').forEach(el => { const v = el.value; if (v !== '' && v != null) o[el.getAttribute('data-k')] = v; });
  return o;
}
function recalcMetricasB2B(prefijo, tipo) {
  const valores = leerMetricas(prefijo);
  const items = (CRITERIOS_B2B_CACHE && CRITERIOS_B2B_CACHE[tipo]) || [];
  items.forEach(c => { const dot = $(prefijo + '_dot_' + c.clave); if (dot) { const col = colorCriterioJS(c, valores[c.clave]); dot.style.background = col ? SEM_DOT[col] : '#DDE4EC'; } });
  const pill = $(prefijo + '_pill'); if (pill) pill.innerHTML = pillMetricasHTML(evalChecklistJS(tipo, valores));
  if (prefijo.indexOf('suj') === 0) actualizarConsolidadoVivo();
}
// Consolidado de crédito en vivo (misma regla del server: empresa ancla).
function consolidadoCreditoVivoJS() {
  const sujetos = FICHA.creditoSujetos || [];
  const ticket = (FICHA.solicitud && FICHA.solicitud.ticket) || 'Bajo';
  const cat = FILTROS_B2B_CACHE && FILTROS_B2B_CACHE.credito;
  let peor = null;
  sujetos.forEach(su => {
    const sem = cat ? evaluarFiltro2JS(cat, leerFiltro2('suj' + su.id), ticket).semaforo : null;
    if (sem && (peor == null || ORDEN_SEM_JS[sem] > ORDEN_SEM_JS[peor])) peor = sem;
  });
  return peor;
}
function actualizarConsolidadoVivo() {
  const cons = consolidadoCreditoVivoJS();
  const el = $('fbCredConsolidado');
  if (el) el.innerHTML = cons ? (SEM_EMOJI[cons] + ' ' + cons + ' <span class="sub" style="font-size:11px">consolidado</span>') : '<span class="sub">pendiente</span>';
}
function setPanelPill(tipo, sem) {
  const el = $('fbEstado_' + tipo);
  if (el) el.innerHTML = sem ? (SEM_EMOJI[sem] + ' ' + sem) : '<span class="sub">pendiente</span>';
}

function consolidadoGuardadoJS() {
  const sujetos = FICHA.creditoSujetos || [];
  let peor = null;
  sujetos.forEach(su => { if (su.semaforo && (peor == null || ORDEN_SEM_JS[su.semaforo] > ORDEN_SEM_JS[peor])) peor = su.semaforo; });
  return peor;
}

function panelCredito(semGuardado, modo) {
  const cons = consolidadoGuardadoJS() || semGuardado;
  const open = FICHA_ETAPA_OPEN === 'credito';
  let estadoHtml = cons ? (fbPill(cons) + ' <span class="sub" style="font-size:11px">consolidado</span>') : '<span class="sub">pendiente</span>';
  estadoHtml += btnInfoFiltro('credito');
  if (!open) return fbPanelWrap('credito', '📋', '2 · Filtro crédito', estadoHtml, false, '', false, modo, 'Filtro credito');
  const sujetos = FICHA.creditoSujetos || [];
  const empresa = sujetos.find(x => x.tipoSujeto === 'empresa');
  const reps = sujetos.filter(x => x.tipoSujeto === 'representante');
  const vinc = sujetos.filter(x => x.tipoSujeto === 'vinculada');

  let html = '<div class="fb-body">';
  html += '<div class="fb-cred-cons">Consolidado: <span id="fbCredConsolidado">' + (cons ? (SEM_EMOJI[cons] + ' ' + cons + ' <span class="sub" style="font-size:11px">consolidado</span>') : '<span class="sub">pendiente</span>') + '</span></div>';
  html += '<p class="sub">Empresa, representantes y vinculadas se evalúan con el mismo motor (gates KO + puntaje), dependiente del ticket. Consolidación = <b>peor caso</b>: un sujeto en Rojo (KO seco, Dudoso/Pérdida, listas, o límites del ticket excedidos) contagia y hace Rojo todo el filtro.</p>';
  html += '<div class="fb-sec">Empresa</div>';
  html += empresa ? sujetoCard(empresa, false) : '<div class="sub">—</div>';
  html += '<div class="fb-sec">Representantes (' + reps.length + ')</div>';
  html += reps.map(r => sujetoCard(r, true)).join('') || '<div class="sub" style="margin-bottom:8px">Aún no agregas representantes.</div>';
  html += '<button class="btn-sunat" onclick="agregarSujeto(\'representante\')">＋ Agregar representante</button>';
  html += '<div class="fb-sec">Empresas vinculadas (' + vinc.length + ')</div>';
  html += vinc.map(v => sujetoCard(v, true)).join('') || '<div class="sub" style="margin-bottom:8px">Sin empresas vinculadas.</div>';
  html += '<button class="btn-sunat" onclick="agregarSujeto(\'vinculada\')">＋ Agregar vinculada</button>';
  // Link único de Drive para los archivos de esta etapa de crédito.
  const linkVal = (FICHA.solicitud && FICHA.solicitud.creditoLinkDrive) ? FICHA.solicitud.creditoLinkDrive.replace(/"/g, '&quot;') : '';
  html += '<div class="fb-sec">Archivos de crédito (link de Drive)</div>' +
    '<div class="fb-link-drive">' +
    '<input type="url" id="fbCredLink" class="mtr-in" style="flex:1;min-width:0" placeholder="https://drive.google.com/…" value="' + linkVal + '">' +
    '<button class="btn-sunat" onclick="guardarLinkCredito()">Guardar link</button>' +
    (linkVal ? '<a class="btn-sunat" href="' + linkVal + '" target="_blank" rel="noopener">🔗 Abrir</a>' : '') +
    '</div>' +
    '<div class="sub" style="font-size:11px;margin-top:4px">Pega la carpeta de Drive donde el equipo sube reportes de central, DJ, sustentos, etc.</div>';
  html += '<div class="fb-acc" style="margin-top:16px"><button class="btn" onclick="guardarCredito()">Guardar</button></div>';
  html += '</div>';
  return fbPanelWrap('credito', '📋', '2 · Filtro crédito', estadoHtml, true, html, false, modo, 'Filtro credito');
}

function sujetoCard(su, editable) {
  let valores = {};
  try { valores = typeof su.checklist === 'string' ? JSON.parse(su.checklist || '{}') : (su.checklist || {}); } catch (e) { valores = {}; }
  const ticket = (FICHA.solicitud && FICHA.solicitud.ticket) || 'Bajo';
  const docs = (FICHA.documentos || []).filter(d => d.sujetoId === su.id);
  const nombreHtml = editable
    ? '<input class="fb-suj-nom" id="suj_nom_' + su.id + '" value="' + (su.nombre ? su.nombre.replace(/"/g, '&quot;') : '') + '" placeholder="Nombre">'
    : '<b>' + (su.nombre || '—') + '</b>' + (su.documento ? ' <span class="sub">· ' + su.documento + '</span>' : '');
  const delBtn = editable ? '<button class="btn-sunat" style="color:#C0392B;border-color:#E8B5AD" onclick="eliminarSujeto(' + su.id + ')" title="Quitar">✕</button>' : '';
  const metricas = renderFiltroDosCapas('credito', valores, 'suj' + su.id, ticket);
  const docsList = docs.map(d => docAnchor(d) + ' <button class="btn-sunat" style="color:#C0392B;border-color:#E8B5AD" onclick="eliminarDoc(' + d.id + ')">✕</button>').join(' ');
  const docHtml = '<div class="fb-doc" style="margin-top:8px">' +
    (docs.length ? docsList + ' ' : '<span class="fb-doc-pend">Reporte de central pendiente</span> ') +
    '<button class="btn-sunat" onclick="agregarLinkDoc(\'credito\',\'Reporte central\',' + su.id + ')">🔗 Agregar link</button>' +
    '</div>';
  return '<div class="fb-suj' + (su._nuevo ? ' fb-suj-nueva' : '') + '"><div class="fb-suj-head">' + nombreHtml + '<span style="margin-left:auto">' + delBtn + '</span></div>' + metricas + docHtml + '</div>';
}

function recalcConsolidado() {
  // Guarda el estado actual en memoria y re-renderiza para refrescar el pill consolidado en vivo.
  sincronizarFichaDOM();
  renderFichaB2B();
}

function consolidadoGarantiaVivoJS() {
  const inms = FICHA.garantiaInmuebles || [];
  const ticket = (FICHA.solicitud && FICHA.solicitud.ticket) || 'Bajo';
  const cat = FILTROS_B2B_CACHE && FILTROS_B2B_CACHE.garantia;
  let mejor = null;
  inms.forEach(i => {
    const sem = cat ? evaluarFiltro2JS(cat, leerFiltro2('inm' + i.id), ticket).semaforo : null;
    if (sem && (mejor == null || ORDEN_SEM_JS[sem] < ORDEN_SEM_JS[mejor])) mejor = sem;
  });
  return mejor;
}
function consolidadoGarantiaGuardadoJS() {
  const inms = FICHA.garantiaInmuebles || [];
  let mejor = null;
  inms.forEach(i => { if (i.semaforo && (mejor == null || ORDEN_SEM_JS[i.semaforo] < ORDEN_SEM_JS[mejor])) mejor = i.semaforo; });
  return mejor;
}
function actualizarConsolidadoGarantiaVivo() {
  const cons = consolidadoGarantiaVivoJS();
  const el = $('fbGarConsolidado');
  if (el) el.innerHTML = cons ? (SEM_EMOJI[cons] + ' ' + cons + ' <span class="sub" style="font-size:11px">mejor inmueble</span>') : '<span class="sub">pendiente</span>';
}
function inmuebleCard(inm) {
  let valores = {};
  try { valores = typeof inm.checklist === 'string' ? JSON.parse(inm.checklist || '{}') : (inm.checklist || {}); } catch (e) { valores = {}; }
  const ticket = (FICHA.solicitud && FICHA.solicitud.ticket) || 'Bajo';
  const pf = 'inm' + inm.id;
  const head = '<input class="fb-suj-nom" id="inm_alias_' + inm.id + '" value="' + (inm.alias ? inm.alias.replace(/"/g, '&quot;') : '') + '" placeholder="Alias / dirección">' +
    '<input class="fb-suj-nom" id="inm_distrito_' + inm.id + '" value="' + (inm.distrito ? inm.distrito.replace(/"/g, '&quot;') : '') + '" placeholder="Distrito" style="max-width:150px">' +
    '<span style="margin-left:auto"><button class="btn-sunat" style="color:#C0392B;border-color:#E8B5AD" onclick="eliminarInmueble(' + inm.id + ')" title="Quitar">✕</button></span>';
  return '<div class="fb-suj' + (inm._nuevo ? ' fb-suj-nueva' : '') + '"><div class="fb-suj-head">' + head + '</div>' +
    renderGarantiaInmueble(valores, pf, ticket) + '</div>';
}
// Render de un inmueble: casilla Apto, valor ref + moneda, LTV calculado, y un ÚNICO link de Drive.
function renderGarantiaInmueble(valores, prefijo, ticket) {
  const cat = FILTROS_B2B_CACHE && FILTROS_B2B_CACHE.garantia; if (!cat) return '<div class="sub">Catálogo no disponible.</div>';
  const cb = 'recalcGarantia(\'' + prefijo + '\',\'' + ticket + '\')';
  // 1) Casilla Apto.
  const apto = valores.apto || '';
  const aptoHtml = '<div class="mtr-row"><span class="mtr-lbl"><b>Apto / saneado (SUNARP)</b></span><span class="mtr-ctrl">' +
    '<select class="mtr-in" data-f2="' + prefijo + '" data-k="apto" onchange="' + cb + '">' +
    '<option value="">—</option>' +
    '<option value="si"' + (apto === 'si' ? ' selected' : '') + '>Sí</option>' +
    '<option value="observado"' + (apto === 'observado' ? ' selected' : '') + '>Observado</option>' +
    '<option value="no"' + (apto === 'no' ? ' selected' : '') + '>No</option>' +
    '</select></span></div>';
  // 2) Valor referencial + moneda.
  const moneda = valores.valorRefMoneda || 'soles';
  const valorHtml = '<div class="mtr-row"><span class="mtr-lbl"><b>Valor referencial</b></span><span class="mtr-ctrl">' +
    '<select class="mtr-in" style="width:74px" data-f2="' + prefijo + '" data-k="valorRefMoneda" onchange="' + cb + '">' +
    '<option value="soles"' + (moneda === 'soles' ? ' selected' : '') + '>S/</option>' +
    '<option value="dolares"' + (moneda === 'dolares' ? ' selected' : '') + '>US$</option>' +
    '</select>' +
    '<input type="text" inputmode="decimal" class="mtr-in mtr-num" style="width:110px" data-f2="' + prefijo + '" data-k="valorRef" value="' + (valores.valorRef != null ? valores.valorRef : '') + '" placeholder="0" onkeypress="return b2bSoloNumero(event,true)" oninput="' + cb + '"></span></div>';
  // 3) LTV calculado (en vivo).
  const ltvHtml = '<div class="mtr-row"><span class="mtr-lbl"><b>LTV</b> <span class="sub" style="font-size:11px">(monto ÷ valor ref)</span></span>' +
    '<span class="mtr-ctrl"><span id="' + prefijo + '_ltv" class="gd-ltv">' + ltvTextoJS(valores, ticket) + '</span></span></div>';
  // 4) Un único link de Drive con TODOS los documentos (último campo, obligatorio).
  const link = valores.linkDrive || ''; const linkOk = link && /^https?:\/\//i.test(link);
  const linkHtml = '<div class="gd-row gd-row-link"><span class="gd-lbl"><b>Link de Drive</b> <span class="sub" style="font-size:11px">(copia literal, HR/PU, DNI, recibo, fotos)</span></span>' +
    '<span class="gd-st ' + (linkOk ? 'gd-ok' : 'gd-pend') + '">' + (linkOk ? '✓' : 'pendiente') + '</span>' +
    '<input type="url" class="mtr-in gd-link" data-f2="' + prefijo + '" data-k="linkDrive" value="' + (link ? link.replace(/"/g, '&quot;') : '') + '" placeholder="https://drive.google.com/…" oninput="' + cb + '">' +
    (linkOk ? '<a class="gd-open" href="' + link + '" target="_blank" rel="noopener">abrir</a>' : '') + '</div>';
  const ev = evaluarFiltro2JS(cat, valores, ticket);
  return '<div class="f2-box"><div class="fb-sec">Evaluación</div>' + aptoHtml + valorHtml + ltvHtml +
    '<div class="fb-sec">Documentos</div>' + linkHtml +
    '<div class="f2-foot" id="' + prefijo + '_foot">' + bandaFiltro2HTML(ev) + '</div></div>';
}
// Calcula el LTV en el cliente para mostrarlo (TC 3.45 si el inmueble está en dólares).
function ltvInfoJS(valores) {
  const cat = FILTROS_B2B_CACHE && FILTROS_B2B_CACHE.garantia;
  const cfg = (cat && cat.ltv) || { tc: 3.45, umbralObservado: 0.35 };
  const monto = FICHA.solicitud && Number(FICHA.solicitud.montoSolicitado);
  const valorRef = Number(valores.valorRef);
  if (!isFinite(valorRef) || valorRef <= 0 || !monto) return null;
  const moneda = valores.valorRefMoneda || 'soles';
  const valorSoles = moneda === 'dolares' ? valorRef * cfg.tc : valorRef;
  const ltv = monto / valorSoles;
  return { ltv, obs: ltv > cfg.umbralObservado, moneda, valorSoles, tc: cfg.tc, umbral: cfg.umbralObservado };
}
function ltvTextoJS(valores, ticket) {
  const info = ltvInfoJS(valores);
  if (!info) return '<span class="sub">ingresa valor referencial y monto exacto</span>';
  const pct = (info.ltv * 100).toFixed(1) + '%';
  const clase = info.obs ? 'gd-ltv-obs' : 'gd-ltv-ok';
  const nota = info.moneda === 'dolares' ? ' <span class="sub" style="font-size:10.5px">(TC ' + info.tc + ')</span>' : '';
  const est = info.obs ? ' · observado (< ' + (info.umbral * 100) + '%)' : ' · verde';
  return '<span class="' + clase + '">' + pct + est + '</span>' + nota;
}
// Recalcula un inmueble en vivo: LTV + banda de semáforo.
function recalcGarantia(prefijo, ticket) {
  const cat = FILTROS_B2B_CACHE && FILTROS_B2B_CACHE.garantia; if (!cat) return;
  const valores = leerFiltro2(prefijo);
  const ltvEl = $(prefijo + '_ltv'); if (ltvEl) ltvEl.innerHTML = ltvTextoJS(valores, ticket);
  // Refleja el LTV bajo como observación en la evaluación en vivo.
  const ev = evaluarFiltro2JS(cat, valores, ticket);
  const info = ltvInfoJS(valores);
  if (info && info.obs && ev.semaforo === 'Verde') { ev.semaforo = 'Amarillo'; if (!ev.observados) ev.observados = []; ev.observados.push('LTV < ' + (info.umbral * 100) + '%'); }
  const foot = $(prefijo + '_foot'); if (foot) foot.innerHTML = bandaFiltro2HTML(ev);
  // Actualiza el estado del link único (pendiente/✓).
  const inp = document.querySelector('[data-f2="' + prefijo + '"][data-k="linkDrive"]');
  if (inp) { const row = inp.closest('.gd-row'); const st = row && row.querySelector('.gd-st'); const ok = inp.value && /^https?:\/\//i.test(inp.value); if (st) { st.className = 'gd-st ' + (ok ? 'gd-ok' : 'gd-pend'); st.textContent = ok ? '✓' : 'pendiente'; } }
  actualizarConsolidadoGarantiaVivo();
}
function panelGarantia(desbloqueada, sem, modo) {
  if (!desbloqueada) return fbPanelWrap('garantia', '🏠', '3 · Filtro garantía', '<span class="sub" style="color:#94a3b8">🔒 requiere crédito en verde</span>', false, '', true);
  const cons = consolidadoGarantiaGuardadoJS() || sem;
  const open = FICHA_ETAPA_OPEN === 'garantia';
  let estadoHtml = cons ? (fbPill(cons) + ' <span class="sub" style="font-size:11px">mejor inmueble</span>') : '<span class="b2b-pill" style="background:#EF9F2722;color:#EF9F27">En proceso</span>';
  estadoHtml += btnInfoFiltro('garantia');
  if (!open) return fbPanelWrap('garantia', '🏠', '3 · Filtro garantía', estadoHtml, false, '', false, modo, 'Filtro garantia');
  const inms = FICHA.garantiaInmuebles || [];
  let html = '<div class="fb-body">';
  html += '<div class="fb-cred-cons">Consolidado: <span id="fbGarConsolidado">' + (cons ? (SEM_EMOJI[cons] + ' ' + cons + ' <span class="sub" style="font-size:11px">mejor inmueble</span>') : '<span class="sub">pendiente</span>') + '</span></div>';
  html += '<p class="sub">Registra uno o varios inmuebles. Consolidación = <b>mejor caso</b>: basta con que UN inmueble pase. Objetivo: verificar que el inmueble esté <b>apto/saneado en SUNARP</b> (evidencia: los documentos) y fijar un <b>valor referencial</b> para calcular el LTV. Los documentos, la casilla Apto y el valor referencial son obligatorios para avanzar.</p>';
  html += inms.map(inmuebleCard).join('') || '<div class="sub" style="margin-bottom:8px">Aún no agregas inmuebles.</div>';
  html += '<button class="btn-sunat" onclick="agregarInmueble()">＋ Agregar inmueble</button>';
  html += '<div class="fb-acc" style="margin-top:16px"><button class="btn" onclick="guardarGarantia()">Guardar</button></div>';
  html += '</div>';
  return fbPanelWrap('garantia', '🏠', '3 · Filtro garantía', estadoHtml, true, html, false, modo, 'Filtro garantia');
}

function panelFinanzas(desbloqueada, sem, modo) {
  if (!desbloqueada) return fbPanelWrap('finanzas', '💰', '5 · Filtro finanzas y negocio', '<span class="sub" style="color:#94a3b8">🔒 requiere garantía en verde</span>', false, '', true);
  const open = FICHA_ETAPA_OPEN === 'finanzas';
  const f = FICHA.filtros.finanzas || {};
  let head = '<span class="sub">pendiente</span>';
  if (sem === 'Verde') head = '<span class="fb-pill" style="background:#E7F6EF;color:#1D9E75;font-weight:800">AVANZA ✓' + (f.puntaje != null ? ' · ' + f.puntaje + '%' : '') + '</span>';
  else if (sem === 'Amarillo') head = '<span class="fb-pill" style="background:#FFF4E0;color:#B7791F;font-weight:800">Avanza con observación' + (f.puntaje != null ? ' · ' + f.puntaje + '%' : '') + '</span>';
  else if (sem === 'Rojo') head = '<span class="fb-pill" style="background:#FDE8E7;color:#CC0000;font-weight:800">DESESTIMADO</span>';
  head += btnInfoFiltro('sunat');
  if (!open) return fbPanelWrap('finanzas', '💰', '5 · Filtro finanzas y negocio', head, false, '', false, modo, 'Filtro finanzas');
  const ticket = (FICHA.solicitud && FICHA.solicitud.ticket) || 'Bajo';
  let chkF = {};
  try { const raw = f.checklist; chkF = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); } catch (e) { chkF = {}; }
  const cuerpo = '<div class="fb-body"><p class="sub">Ticket <b>' + ticket + '</b> · umbrales por ticket.</p>' +
    renderFiltroDosCapas('finanzas', chkF, 'fin', ticket) +
    '<div class="fb-acc"><button class="btn" onclick="guardarFinanzas()">Guardar</button></div></div>';
  return fbPanelWrap('finanzas', '💰', '5 · Filtro finanzas y negocio', head, true, cuerpo, false, modo, 'Filtro finanzas');
}

// Semáforo global del Business Case: peor caso entre los 4 filtros (gobernanza).
function semGlobalB2B() {
  const f = FICHA.filtros || {};
  const sems = ['sunat', 'credito', 'garantia', 'finanzas'].map(k => f[k] && f[k].semaforo).filter(Boolean);
  if (!sems.length) return null;
  let peor = null;
  sems.forEach(x => { if (peor == null || ORDEN_SEM_JS[x] > ORDEN_SEM_JS[peor]) peor = x; });
  return peor;
}
function panelBusinessCase(desbloqueada, modo) {
  if (!desbloqueada) return fbPanelWrap('businesscase', '📑', 'Business case', '<span class="sub" style="color:#94a3b8">🔒 requiere finanzas en verde</span>', false, '', true);
  const glob = semGlobalB2B();
  const open = FICHA_ETAPA_OPEN === 'businesscase';
  const estadoHtml = glob ? fbPill(glob) : '<span class="sub">pendiente</span>';
  if (!open) return fbPanelWrap('businesscase', '📑', '6 · Business case', estadoHtml, false, '', false, modo, 'Business case');
  const s = FICHA.solicitud; const f = FICHA.filtros || {};
  const fila = (k, label) => {
    const ff = f[k] || {};
    const sem = ff.semaforo;
    const pts = ff.puntaje != null ? (' · ' + ff.puntaje + '%') : '';
    const kos = (ff.motivos && ff.motivos.kos && ff.motivos.kos.length) ? ('<div class="f2-ko">✕ ' + ff.motivos.kos.join(' · ') + '</div>') : '';
    return '<div class="bc-row"><span class="mtr-lbl">' + label + '</span><span>' + (sem ? (SEM_EMOJI[sem] + ' ' + sem + pts) : '<span class="sub">pendiente</span>') + '</span>' + kos + '</div>';
  };
  const gobText = glob === 'Rojo' ? 'Al menos un filtro en Rojo → operación BLOQUEADA / a descartar.' :
    glob === 'Amarillo' ? 'Hay filtros en Amarillo → avanza con excepción / aprobación de comité.' :
      glob === 'Verde' ? 'Todos los filtros en Verde → apto para expediente.' : 'Faltan filtros por evaluar.';
  let html = '<div class="fb-body">';
  html += '<div class="fb-cred-cons">Semáforo global: <span>' + (glob ? (SEM_EMOJI[glob] + ' ' + glob) : '<span class="sub">pendiente</span>') + '</span></div>';
  html += '<p class="sub">' + gobText + '</p>';
  html += '<div class="fb-sec">Veredicto por filtro (peor caso gobierna)</div>';
  html += fila('sunat', 'SUNAT (elegibilidad)') + fila('credito', 'Crédito') + fila('garantia', 'Garantía') + fila('finanzas', 'Finanzas y negocio');
  html += '<div class="fb-sec">Resumen comercial</div>';
  const montoTxt = s.montoSolicitado != null ? fmtSoles(s.montoSolicitado) : (s.montoRango || '—');
  html += '<div class="bc-resumen">' +
    '<div><span class="sub">Empresa</span><b>' + (s.razonSocial || '—') + '</b></div>' +
    '<div><span class="sub">RUC</span><b>' + (s.ruc || '—') + '</b></div>' +
    '<div><span class="sub">Ticket</span><b>' + (s.ticket || '—') + '</b></div>' +
    '<div><span class="sub">Sector</span><b>' + (s.sector || '—') + '</b></div>' +
    '<div><span class="sub">Monto solicitado</span><b>' + montoTxt + '</b></div>' +
    '<div><span class="sub">Contacto</span><b>' + (s.contacto || '—') + (s.telefono ? ' · ' + s.telefono : '') + '</b></div>' +
    '</div>';
  // Datos clave heredados de los filtros (auto).
  html += bcDatosClaveHTML();
  // Análisis heredado del filtro Finanzas (destino, repago, mitigantes, motivo).
  html += bcAnalisisHTML();
  // Observaciones automáticas: todo lo que quedó en amarillo/escalado en los 4 filtros.
  html += bcObservacionesHTML();
  // Recomendación auto-sugerida según el consolidado.
  const rec = glob === 'Rojo' ? { t: 'Descartar', c: '#E24B4A' } : glob === 'Amarillo' ? { t: 'Avanzar con observaciones', c: '#EF9F27' } : glob === 'Verde' ? { t: 'Avanzar a expediente', c: '#1D9E75' } : { t: 'Pendiente de completar filtros', c: '#94a3b8' };
  html += '<div class="fb-sec">Recomendación comercial</div><div class="bc-rec" style="border-color:' + rec.c + '55;background:' + rec.c + '11"><b style="color:' + rec.c + '">' + rec.t + '</b></div>';
  html += '</div>';
  return fbPanelWrap('businesscase', '📑', '6 · Business case', estadoHtml, true, html, false, modo, 'Business case');
}
// Datos clave que el Business Case hereda de los filtros ya cargados.
function bcDatosClaveHTML() {
  const f = FICHA.filtros || {};
  let chkF = {}, chkC = {};
  try { chkF = typeof f.finanzas?.checklist === 'string' ? JSON.parse(f.finanzas.checklist) : (f.finanzas?.checklist || {}); } catch (e) { }
  // Mejor inmueble de garantía (valor ref + LTV).
  const inms = FICHA.garantiaInmuebles || [];
  let mejor = null;
  inms.forEach(i => { if (i.semaforo && (mejor == null || ORDEN_SEM_JS[i.semaforo] < ORDEN_SEM_JS[mejor.semaforo])) mejor = i; });
  let garVal = '—', ltvTxt = '—';
  if (mejor) { try { const cg = typeof mejor.checklist === 'string' ? JSON.parse(mejor.checklist) : mejor.checklist; if (cg && cg.valorRef) garVal = (cg.valorRefMoneda === 'dolares' ? 'US$ ' : 'S/ ') + Number(cg.valorRef).toLocaleString('es-PE'); const info = ltvInfoJS(cg || {}); if (info) ltvTxt = (info.ltv * 100).toFixed(1) + '%'; } catch (e) { } }
  const ev = FILTROS_B2B_CACHE && FILTROS_B2B_CACHE.finanzas ? evaluarFiltro2JS(FILTROS_B2B_CACHE.finanzas, chkF, FICHA.solicitud.ticket || 'Bajo') : null;
  let dscr = '—', endeud = '—', margen = '—';
  if (ev && ev.ratios) { const g = (k) => ev.ratios.detalle.find(d => d.clave === k); const d = g('dscr'), e = g('endeudamiento'), m = g('margen'); if (d && d.valor != null) dscr = d.valor.toFixed(2) + 'x'; if (e && e.valor != null) endeud = e.valor.toFixed(2) + 'x'; if (m && m.valor != null) margen = (m.valor * 100).toFixed(1) + '%'; }
  return '<div class="fb-sec">Datos clave (heredados de los filtros)</div><div class="bc-resumen">' +
    '<div><span class="sub">Valor garantía (ref.)</span><b>' + garVal + '</b></div>' +
    '<div><span class="sub">LTV</span><b>' + ltvTxt + '</b></div>' +
    '<div><span class="sub">DSCR</span><b>' + dscr + '</b></div>' +
    '<div><span class="sub">Endeudamiento</span><b>' + endeud + '</b></div>' +
    '<div><span class="sub">Margen neto</span><b>' + margen + '</b></div>' +
    '</div>';
}
// Análisis heredado del filtro Finanzas.
function bcAnalisisHTML() {
  const f = FICHA.filtros || {};
  let chk = {};
  try { chk = typeof f.finanzas?.checklist === 'string' ? JSON.parse(f.finanzas.checklist) : (f.finanzas?.checklist || {}); } catch (e) { }
  const cat = FILTROS_B2B_CACHE && FILTROS_B2B_CACHE.finanzas;
  if (!cat || !cat.analisis) return '';
  const lbl = (clave, v) => { const a = cat.analisis.find(x => x.clave === clave); if (!a || !a.opciones) return v; if (Array.isArray(v)) return v.map(x => { const o = a.opciones.find(o => o.v === x); return o ? o.label : x; }).join(', '); const o = a.opciones.find(o => o.v === v); return o ? o.label : v; };
  const destino = chk.destinoFondos ? lbl('destinoFondos', chk.destinoFondos) : '—';
  const repago = chk.fuenteRepago ? lbl('fuenteRepago', chk.fuenteRepago) : '—';
  let mit = chk.mitigantes; if (typeof mit === 'string') mit = mit.split(',');
  const mitTxt = (Array.isArray(mit) && mit.length) ? lbl('mitigantes', mit) : '—';
  const motivo = chk.motivoEvaluacion || '—';
  return '<div class="fb-sec">Análisis del caso</div><div class="bc-analisis">' +
    '<div><span class="sub">Destino de los fondos</span> ' + destino + '</div>' +
    '<div><span class="sub">Fuente de repago</span> ' + repago + '</div>' +
    '<div><span class="sub">Mitigantes</span> ' + mitTxt + '</div>' +
    '<div><span class="sub">Motivo de evaluación</span> ' + (motivo !== '—' ? String(motivo).replace(/</g, '&lt;') : '—') + '</div>' +
    '</div>';
}
// Lista automática de observaciones (amarillos/escalados) de los 4 filtros.
function bcObservacionesHTML() {
  const f = FICHA.filtros || {};
  const items = [];
  ['sunat', 'credito', 'garantia', 'finanzas'].forEach(k => {
    const ff = f[k] || {}; const m = ff.motivos || {};
    (m.escalados || []).forEach(x => items.push({ k, x }));
  });
  if (!items.length) return '<div class="fb-sec">Observaciones a levantar</div><div class="sub" style="padding:4px 0">Sin observaciones registradas.</div>';
  const nom = { sunat: 'SUNAT', credito: 'Crédito', garantia: 'Garantía', finanzas: 'Finanzas' };
  return '<div class="fb-sec">Observaciones a levantar</div><ul class="bc-obs">' +
    items.map(i => '<li><b>' + nom[i.k] + ':</b> ' + i.x + '</li>').join('') + '</ul>';
}

function fbPanelWrap(tipo, ic, titulo, estadoHtml, open, cuerpo, bloqueado, modo, colGestion) {
  const cls = open ? ' fb-panel-open' : '';
  const onclick = bloqueado ? '' : ' onclick="fbToggle(\'' + tipo + '\')"';
  const modoAttr = modo ? ' data-modo="' + modo + '"' : '';
  // Botón de gestión: solo en la etapa editable (actual), para registrar contacto + próxima acción.
  const btnGestion = (modo === 'editable' && colGestion)
    ? '<button class="fb-gestion-btn" onclick="event.stopPropagation();abrirModalGestion(\'' + colGestion + '\')">＋ Gestión</button>'
    : '';
  const candado = (modo === 'lectura') ? '<span class="fb-lock-tag">🔒 solo lectura</span>' : (modo === 'bloqueado' ? '<span class="fb-lock-tag fb-lock-fut">🔒 bloqueada</span>' : '');
  return '<div class="fb-panel' + cls + '"' + modoAttr + '>' +
    '<div class="fb-panel-head"' + onclick + '>' +
    '<span class="fb-ic">' + ic + '</span>' +
    '<span class="fb-titulo">' + titulo + '</span>' +
    '<span class="fb-estado" id="fbEstado_' + tipo + '">' + estadoHtml + '</span>' +
    candado + btnGestion +
    (bloqueado ? '' : '<span class="fb-caret">' + (open ? '▴' : '▾') + '</span>') +
    '</div>' + (cuerpo || '') + '</div>';
}

function fbToggle(tipo) { sincronizarFichaDOM(); FICHA_ETAPA_OPEN = (FICHA_ETAPA_OPEN === tipo) ? null : tipo; renderFichaB2B(); }

// Captura el estado actual del DOM (checkboxes, semáforos, inputs) hacia FICHA en memoria,
// para que al re-renderizar (agregar sujeto, subir doc) NO se pierda lo que el usuario marcó.
function sincronizarFichaDOM() {
  if (!FICHA) return;
  // Garantía: datos del inmueble
  ['tipoInmueble', 'distrito', 'propietario', 'partidaRegistral', 'valorEstimado', 'cargas'].forEach(id => {
    const el = $('fb_' + id); if (el) { FICHA.garantia = FICHA.garantia || {}; FICHA.garantia[id] = el.value; }
  });
  // SUNAT y Finanzas → motor de dos capas (data-f2); Garantía sigue en el motor viejo (data-mtr).
  if (document.querySelector('[data-f2="fsunat"]')) { FICHA.filtros.sunat = FICHA.filtros.sunat || {}; FICHA.filtros.sunat.checklist = leerFiltro2('fsunat'); }
  if (document.querySelector('[data-mtr="gar"]')) { FICHA.filtros.garantia = FICHA.filtros.garantia || {}; FICHA.filtros.garantia.checklist = leerMetricas('gar'); }
  if (document.querySelector('[data-f2="fin"]')) { FICHA.filtros.finanzas = FICHA.filtros.finanzas || {}; FICHA.filtros.finanzas.checklist = leerFiltro2('fin'); }
  // Crédito: por cada sujeto, nombre + valores (dos capas)
  (FICHA.creditoSujetos || []).forEach(su => {
    const nom = $('suj_nom_' + su.id); if (nom) su.nombre = nom.value;
    if (document.querySelector('[data-f2="suj' + su.id + '"]')) su.checklist = leerFiltro2('suj' + su.id);
  });
  // Garantía: por cada inmueble, alias/distrito + valores (dos capas)
  (FICHA.garantiaInmuebles || []).forEach(inm => {
    const al = $('inm_alias_' + inm.id); if (al) inm.alias = al.value;
    const di = $('inm_distrito_' + inm.id); if (di) inm.distrito = di.value;
    if (document.querySelector('[data-f2="inm' + inm.id + '"]')) inm.checklist = leerFiltro2('inm' + inm.id);
  });
}

function fbCampo(label, val) {
  return '<div class="fb-campo"><span>' + label + '</span><b>' + (val || '—') + '</b></div>';
}
function fbCampoOpt(label, val) {
  return (val != null && String(val).trim() !== '') ? fbCampo(label, val) : '';
}
function fbInput(id, label, val, tipo) {
  return '<label class="fb-in"><span>' + label + '</span><input id="fb_' + id + '" type="' + (tipo || 'text') + '" value="' + (val != null ? String(val).replace(/"/g, '&quot;') : '') + '"></label>';
}
function fbSemaforoBar(tipo) {
  const sem = (FICHA.filtros[tipo] && FICHA.filtros[tipo].semaforo) || '';
  return '<div class="fb-sem"><span>Semáforo:</span>' +
    ['Verde', 'Amarillo', 'Rojo'].map(o =>
      '<label class="fb-sem-op"><input type="radio" name="fbsem_' + tipo + '" value="' + o + '"' + (sem === o ? ' checked' : '') + '> ' +
      ({ Verde: '🟢', Amarillo: '🟡', Rojo: '🔴' }[o]) + ' ' + o + '</label>').join('') +
    '</div>';
}

function renderDocsGarantia() {
  const docs = (FICHA.documentos || []).filter(d => d.etapa === 'garantia');
  const filas = FB_DOCS_GARANTIA.map(tipo => {
    const sub = docs.find(d => d.tipoDoc === tipo);
    if (sub) {
      return '<div class="fb-doc"><span>' + tipo + '</span>' + docAnchor(sub) +
        '<button class="btn-sunat" style="color:#C0392B;border-color:#E8B5AD" onclick="eliminarDoc(' + sub.id + ')">✕</button></div>';
    }
    return '<div class="fb-doc"><span>' + tipo + '</span>' +
      '<span class="fb-doc-pend">pendiente</span>' +
      '<button class="btn-sunat" onclick="agregarLinkDoc(\'garantia\',\'' + tipo.replace(/'/g, "\\'") + '\',null)">🔗 Agregar link</button></div>';
  }).join('');
  const otros = docs.filter(d => !FB_DOCS_GARANTIA.includes(d.tipoDoc));
  const otrosHtml = otros.map(d => '<div class="fb-doc"><span>' + d.tipoDoc + '</span>' + docAnchor(d) +
    '<button class="btn-sunat" style="color:#C0392B;border-color:#E8B5AD" onclick="eliminarDoc(' + d.id + ')">✕</button></div>').join('');
  return '<div class="fb-docs"><div class="fb-doc-note">Pega el link de una carpeta o archivo de Drive (persiste al actualizar el sistema).</div>' + filas + otrosHtml + '</div>';
}

// Ancla a un documento: link de Drive (🔗) o archivo subido (📄).
function docAnchor(d) {
  const url = d.enlace ? d.enlace : ('/api/b2b/documentos/' + d.id + '/descargar');
  const txt = d.enlace ? (d.nombreArchivo && d.nombreArchivo !== d.enlace ? d.nombreArchivo : 'Abrir en Drive') : (d.nombreArchivo || 'archivo');
  return '<a href="' + url + '" target="_blank" rel="noopener" class="fb-doc-link">' + (d.enlace ? '🔗 ' : '📄 ') + txt + '</a>';
}

// Guarda un documento como link de Drive (reemplaza la subida que se cae al deployar).
async function agregarLinkDoc(etapa, tipoDoc, sujetoId) {
  const url = (prompt('Pega el link de Drive (carpeta o archivo):', 'https://') || '').trim();
  if (!url || url === 'https://') return;
  if (!/^https?:\/\//i.test(url)) { alert('El link debe empezar con http:// o https://'); return; }
  sincronizarFichaDOM();
  try {
    const r = await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/documentos/enlace', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etapa, tipoDoc, sujetoId: sujetoId || null, url, nombre: tipoDoc })
    });
    FICHA.documentos = FICHA.documentos || [];
    FICHA.documentos.unshift({ id: r.id, etapa, tipoDoc, nombreArchivo: tipoDoc, enlace: url, sujetoId: sujetoId ? Number(sujetoId) : null });
    renderFichaB2B();
  } catch (e) { alert('No se pudo guardar el link: ' + e.message); }
}

function leerSemaforo(tipo) {
  const sel = document.querySelector('input[name="fbsem_' + tipo + '"]:checked');
  return sel ? sel.value : null;
}
function leerChecklistGarantia() {
  const o = {};
  document.querySelectorAll('#fbAcordeon input[data-chk]').forEach(c => { o[c.getAttribute('data-chk')] = c.checked; });
  return o;
}

async function agregarInmueble() {
  sincronizarFichaDOM();
  try {
    const r = await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/garantia/inmueble', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    FICHA.garantiaInmuebles = FICHA.garantiaInmuebles || [];
    FICHA.garantiaInmuebles.push({ id: r.id, alias: 'Inmueble ' + (FICHA.garantiaInmuebles.length + 1), distrito: null, checklist: {}, semaforo: null, _nuevo: true });
    renderFichaB2B();
  } catch (e) { alert('No se pudo agregar: ' + e.message); }
}
async function eliminarInmueble(id) {
  if (!confirm('¿Quitar este inmueble?')) return;
  sincronizarFichaDOM();
  try {
    const r = await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/garantia/inmueble/' + id, { method: 'DELETE' });
    FICHA.garantiaInmuebles = (FICHA.garantiaInmuebles || []).filter(i => i.id !== id);
    FICHA.filtros.garantia = Object.assign({}, FICHA.filtros.garantia, { semaforo: r.consolidado });
    renderFichaB2B();
  } catch (e) { alert('No se pudo quitar: ' + e.message); }
}
async function guardarGarantia() {
  const inms = FICHA.garantiaInmuebles || [];
  try {
    let cons = null;
    for (const inm of inms) {
      const valores = leerFiltro2('inm' + inm.id);
      const aliasEl = $('inm_alias_' + inm.id); const distEl = $('inm_distrito_' + inm.id);
      const body = { checklist: valores };
      if (aliasEl) body.alias = aliasEl.value.trim();
      if (distEl) body.distrito = distEl.value.trim();
      const r = await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/garantia/inmueble/' + inm.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      inm.checklist = valores; inm.semaforo = r.semaforo; inm.puntaje = r.puntaje;
      cons = r.consolidado;
    }
    FICHA.filtros.garantia = Object.assign({}, FICHA.filtros.garantia, { semaforo: cons });
    setPanelPill('garantia', cons);
    actualizarConsolidadoGarantiaVivo();
    if (typeof cargarKanbanB2B === 'function' && B2B_VISTA === 'kanban') cargarKanbanB2B();
  } catch (e) { alert('No se pudo guardar: ' + e.message); }
}

async function guardarFinanzas() {
  try {
    const valores = leerFiltro2('fin');
    const r = await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/filtro/finanzas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checklist: valores }) });
    FICHA.filtros.finanzas = Object.assign({}, FICHA.filtros.finanzas, { checklist: valores, semaforo: r.semaforo, puntaje: r.puntaje, motivos: r.motivos });
    setPanelPill('finanzas', r.semaforo);
    if (typeof cargarKanbanB2B === 'function' && B2B_VISTA === 'kanban') cargarKanbanB2B();
  } catch (e) { alert('No se pudo guardar: ' + e.message); }
}

function flashGuardado(prefijo) {
  const p = $(prefijo + '_pill');
  if (p) { p.classList.add('mtr-saved'); setTimeout(() => p.classList.remove('mtr-saved'), 1200); }
}

async function avanzarEtapa(tipo) {
  // Crédito: guarda los sujetos y avanza por el consolidado (lo calcula el backend).
  if (tipo === 'credito') {
    const cons = consolidadoCreditoJS();
    if (!cons) { alert('Marca el semáforo de cada sujeto antes de avanzar.'); return; }
    if (!confirm('Consolidado de crédito: ' + cons + '. La solicitud ' + (cons === 'Verde' ? 'avanza a garantía' : cons === 'Rojo' ? 'pasa a No elegible' : 'pasa a nurture') + '. ¿Continuar?')) return;
    try {
      await guardarCreditoSilencioso();
      await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/avanzar', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipoFiltro: 'credito' }) });
      cargarB2B();
      await abrirFichaB2B(FICHA.solicitud.codigo);
    } catch (e) { alert('No se pudo avanzar: ' + e.message); }
    return;
  }
  const sem = leerSemaforo(tipo);
  if (!sem) { alert('Marca el semáforo antes de avanzar.'); return; }
  if (!confirm('Con semáforo ' + sem + ', la solicitud ' + (sem === 'Verde' ? 'avanza a la siguiente etapa' : sem === 'Rojo' ? 'pasa a No elegible' : 'pasa a nurture') + '. ¿Continuar?')) return;
  try {
    // Guarda el filtro primero (con checklist si es garantía)
    const body = { semaforo: sem };
    if (tipo === 'garantia') body.checklist = leerChecklistGarantia();
    await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/filtro/' + tipo, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/avanzar', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipoFiltro: tipo, semaforo: sem }) });
    cargarB2B();
    await abrirFichaB2B(FICHA.solicitud.codigo);
  } catch (e) { alert('No se pudo avanzar: ' + e.message); }
}

// Guarda los sujetos de crédito sin recargar la ficha (uso interno de avanzar).
async function guardarCreditoSilencioso() {
  for (const su of (FICHA.creditoSujetos || [])) {
    const valores = document.querySelector('[data-f2="suj' + su.id + '"]') ? leerFiltro2('suj' + su.id) : (su.checklist || {});
    const nomEl = $('suj_nom_' + su.id);
    const body = { checklist: valores };
    if (nomEl) body.nombre = nomEl.value.trim();
    await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/credito/sujeto/' + su.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
}

function subirDoc(tipoDoc) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,image/*';
  input.onchange = async () => {
    if (!input.files || !input.files[0]) return;
    sincronizarFichaDOM();  // conserva el checklist de garantía antes de re-renderizar
    const f = input.files[0];
    const fd = new FormData();
    fd.append('archivo', f);
    fd.append('etapa', 'garantia');
    fd.append('tipoDoc', tipoDoc);
    try {
      const r = await fetch('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/documentos', { method: 'POST', body: fd });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || ('HTTP ' + r.status)); }
      const j = await r.json();
      FICHA.documentos = FICHA.documentos || [];
      FICHA.documentos.unshift({ id: j.id, etapa: 'garantia', tipoDoc: tipoDoc, nombreArchivo: f.name, mime: f.type, tamano: f.size, sujetoId: null });
      renderFichaB2B();
    } catch (e) { alert('No se pudo subir: ' + e.message); }
  };
  input.click();
}

async function eliminarDoc(id) {
  if (!confirm('¿Eliminar este documento?')) return;
  sincronizarFichaDOM();
  try {
    await api('/api/b2b/documentos/' + id, { method: 'DELETE' });
    FICHA.documentos = (FICHA.documentos || []).filter(d => d.id !== id);
    renderFichaB2B();
  } catch (e) { alert('No se pudo eliminar: ' + e.message); }
}

// ===== Acciones del filtro de crédito =====
async function editarMontoB2B() {
  const actual = FICHA.solicitud && FICHA.solicitud.montoSolicitado;
  const inp = prompt('Monto exacto solicitado por el empresario (S/):', actual != null ? actual : '');
  if (inp == null) return;
  const monto = Number(String(inp).replace(/[^0-9.]/g, ''));
  if (!isFinite(monto) || monto <= 0) { alert('Monto inválido'); return; }
  try {
    const r = await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/monto', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monto })
    });
    FICHA.solicitud.montoSolicitado = r.montoSolicitado;
    FICHA.solicitud.montoRango = null;
    FICHA.solicitud.ticket = r.ticket;
    renderFichaB2B();
  } catch (e) { alert('No se pudo actualizar el monto: ' + e.message); }
}

async function guardarLinkCredito() {
  const el = $('fbCredLink'); if (!el) return;
  const link = el.value.trim();
  try {
    const r = await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/credito/link', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link })
    });
    FICHA.solicitud.creditoLinkDrive = r.link || null;
    renderFichaB2B();
  } catch (e) { alert('No se pudo guardar el link: ' + e.message); }
}

async function guardarCredito() {
  const sujetos = FICHA.creditoSujetos || [];
  try {
    let cons = null;
    for (const su of sujetos) {
      const valores = leerFiltro2('suj' + su.id);
      const nomEl = $('suj_nom_' + su.id);
      const body = { checklist: valores };
      if (nomEl) body.nombre = nomEl.value.trim();
      const r = await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/credito/sujeto/' + su.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      su.checklist = valores; su.semaforo = r.semaforo; su.puntaje = r.puntaje; su.motivos = r.motivos; // el server calcula todo
      cons = r.consolidado;
    }
    FICHA.filtros.credito = Object.assign({}, FICHA.filtros.credito, { semaforo: cons });
    setPanelPill('credito', cons);
    actualizarConsolidadoVivo();
    if (typeof cargarKanbanB2B === 'function' && B2B_VISTA === 'kanban') cargarKanbanB2B();
  } catch (e) { alert('No se pudo guardar: ' + e.message); }
}

async function agregarSujeto(tipo) {
  sincronizarFichaDOM();  // conserva lo marcado en los demás sujetos
  try {
    const r = await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/credito/sujeto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipoSujeto: tipo }) });
    FICHA.creditoSujetos = FICHA.creditoSujetos || [];
    FICHA.creditoSujetos.push({ id: r.id, tipoSujeto: tipo, nombre: '', documento: null, checklist: {}, semaforo: null, _nuevo: true });
    renderFichaB2B();
    // resalta el recién agregado un instante
    setTimeout(() => { const el = document.querySelector('.fb-suj-nueva'); if (el) el.classList.remove('fb-suj-nueva'); }, 1200);
  } catch (e) { alert('No se pudo agregar: ' + e.message); }
}

async function eliminarSujeto(id) {
  if (!confirm('¿Quitar este sujeto del análisis de crédito?')) return;
  sincronizarFichaDOM();
  try {
    await api('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/credito/sujeto/' + id, { method: 'DELETE' });
    FICHA.creditoSujetos = (FICHA.creditoSujetos || []).filter(s => s.id !== id);
    FICHA.documentos = (FICHA.documentos || []).filter(d => d.sujetoId !== id);
    renderFichaB2B();
  } catch (e) { alert('No se pudo eliminar: ' + e.message); }
}

function subirDocSujeto(sujetoId) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.pdf,image/*';
  input.onchange = async () => {
    if (!input.files || !input.files[0]) return;
    sincronizarFichaDOM();  // conserva lo marcado antes de re-renderizar
    const f = input.files[0];
    const fd = new FormData();
    fd.append('archivo', f);
    fd.append('etapa', 'credito');
    fd.append('tipoDoc', 'Reporte Sentinel');
    fd.append('sujetoId', sujetoId);
    try {
      const r = await fetch('/api/b2b/solicitudes/' + encodeURIComponent(FICHA.solicitud.codigo) + '/documentos', { method: 'POST', body: fd });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || ('HTTP ' + r.status)); }
      const j = await r.json();
      FICHA.documentos = FICHA.documentos || [];
      FICHA.documentos.unshift({ id: j.id, etapa: 'credito', tipoDoc: 'Reporte Sentinel', nombreArchivo: f.name, mime: f.type, tamano: f.size, sujetoId: Number(sujetoId) });
      renderFichaB2B();
    } catch (e) { alert('No se pudo subir: ' + e.message); }
  };
  input.click();
}

// ===================== ATRIBUCIÓN DE ANUNCIOS =====================
let ATRIB_NIVEL = 'anuncio';
let ATRIB_DATA = null;

function setNivelAtrib(n) {
  ATRIB_NIVEL = n;
  document.querySelectorAll('.atr-niv').forEach(b => b.classList.toggle('act', b.getAttribute('data-niv') === n));
  cargarAtribucion();
}

async function cargarAtribucion() {
  const cont = $('atrCont');
  cont.innerHTML = '<div class="vacio">Cargando…</div>';
  try {
    ATRIB_DATA = await api('/api/atribucion?nivel=' + ATRIB_NIVEL);
    if ($('atrTotal')) $('atrTotal').textContent = ATRIB_DATA.totalLeads + ' leads';
    renderAtribucion();
  } catch (e) {
    cont.innerHTML = '<div class="vacio">No se pudo cargar: ' + e.message + '</div>';
  }
}

function renderAtribucion() {
  const cont = $('atrCont');
  const filas = ATRIB_DATA.filas || [];
  if (!filas.length) { cont.innerHTML = '<div class="vacio">Aún no hay leads con atribución para este nivel.</div>'; return; }
  const esAnuncio = ATRIB_NIVEL === 'anuncio';
  const head = '<table class="atr-tabla"><thead><tr>' +
    '<th class="atr-l">' + (ATRIB_NIVEL === 'campana' ? 'Campaña' : ATRIB_NIVEL === 'conjunto' ? 'Conjunto' : 'Anuncio') + '</th>' +
    '<th>Leads</th><th>Contact.</th><th>Calif.</th><th>Agend.</th><th>Reunión</th><th>Cierre</th><th>Conv.</th>' +
    '</tr></thead><tbody>';
  const body = filas.map((f, i) => {
    const convCol = f.conversion >= 3 ? 'atr-conv-ok' : (f.conversion > 0 ? '' : 'atr-conv-0');
    const thumb = esAnuncio
      ? '<div class="atr-thumb">' + (f.imagenUrl ? '<img src="' + f.imagenUrl + '" alt="" onerror="this.parentNode.classList.add(\'atr-thumb-err\')">' : '<span>📷</span>') + '</div>'
      : '';
    const sub = esAnuncio && (f.campana || f.conjunto) ? '<div class="atr-sub">' + [f.conjunto, f.campana].filter(Boolean)[0] + '</div>' : '';
    return '<tr onclick="abrirAnuncio(' + i + ')" style="cursor:pointer">' +
      '<td class="atr-l"><div class="atr-fuente">' + thumb + '<div class="atr-fuente-txt"><div class="atr-nom">' + f.fuente + '</div>' + sub + '</div></div></td>' +
      '<td>' + f.leads + '</td>' +
      '<td>' + f.contactado + '</td>' +
      '<td>' + f.calificado + '</td>' +
      '<td class="atr-agend">' + f.agendado + '</td>' +
      '<td>' + f.reunion + '</td>' +
      '<td><b>' + f.cierre + '</b></td>' +
      '<td class="' + convCol + '">' + f.conversion + '%</td>' +
      '</tr>';
  }).join('');
  cont.innerHTML = head + body + '</tbody></table>';
}

function abrirAnuncio(i) {
  const f = (ATRIB_DATA.filas || [])[i];
  if (!f) return;
  if (ATRIB_NIVEL !== 'anuncio') return;  // detalle con imagen solo a nivel anuncio
  const url = prompt('Pega la URL de la imagen del anuncio "' + f.fuente + '"\n(deja vacío para quitarla):', f.imagenUrl || '');
  if (url === null) return;
  api('/api/anuncios/imagen', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ anuncio: f.fuente, campana: f.campana, conjunto: f.conjunto, imagenUrl: url.trim() || null }) })
    .then(() => cargarAtribucion())
    .catch(e => alert('No se pudo guardar: ' + e.message));
}

// ===================== MARKETING: pestañas y detalle de leads =====================
let MKT_TAB = 'embudo';
let MKT_LEADS = [];
let MKT_ORIGEN = 'make';  // make = solo campañas (Make), relead, todos

function setOrigenMkt(o) {
  MKT_ORIGEN = o;
  document.querySelectorAll('[data-org]').forEach(b => b.classList.toggle('act', b.getAttribute('data-org') === o));
  renderMktLeads();
}

function cargarMarketing() {
  cargarAtribucion();      // pestaña embudo (ya existente)
  cargarMktLeads();        // pestaña detalle
}

function setTabMkt(t) {
  MKT_TAB = t;
  document.querySelectorAll('.atr-tab').forEach(b => b.classList.toggle('act', b.getAttribute('data-tab') === t));
  $('mktEmbudo').style.display = t === 'embudo' ? '' : 'none';
  $('mktLeads').style.display = t === 'leads' ? '' : 'none';
  $('mktInversion').style.display = t === 'inversion' ? '' : 'none';
  if (t === 'inversion') cargarInversion();
}

async function cargarMktLeads() {
  const cont = $('mktLeadsCont');
  cont.innerHTML = '<div class="vacio">Cargando…</div>';
  const desde = $('mktDesde') ? $('mktDesde').value : '';
  const hasta = $('mktHasta') ? $('mktHasta').value : '';
  let url = '/api/marketing/leads';
  const qs = [];
  if (desde) qs.push('desde=' + desde);
  if (hasta) qs.push('hasta=' + hasta);
  if (qs.length) url += '?' + qs.join('&');
  try {
    const d = await api(url);
    MKT_LEADS = d.filas || [];
    renderMktLeads();
  } catch (e) {
    cont.innerHTML = '<div class="vacio">No se pudo cargar: ' + e.message + '</div>';
  }
}

function limpiarFechasMkt() {
  if ($('mktDesde')) $('mktDesde').value = '';
  if ($('mktHasta')) $('mktHasta').value = '';
  cargarMktLeads();
}

function mktFiltrados() {
  let base = MKT_LEADS;
  if (MKT_ORIGEN !== 'todos') base = base.filter(l => (l.origenCreacion || 'manual') === MKT_ORIGEN);
  const q = ($('mktBuscar') ? $('mktBuscar').value : '').trim().toLowerCase();
  if (!q) return base;
  return base.filter(l => [l.nombre, l.codigo, l.campana, l.conjunto, l.anuncio, l.asesor].some(v => String(v || '').toLowerCase().includes(q)));
}

function mktOrigenLabel(o) {
  return { make: 'Campaña', relead: 'Relead', manual: 'Manual' }[o] || (o || 'Manual');
}

function renderMktLeads() {
  const cont = $('mktLeadsCont');
  const filas = mktFiltrados();
  if ($('mktTotal')) $('mktTotal').textContent = filas.length + ' de ' + MKT_LEADS.length + ' leads';
  if (!MKT_LEADS.length) { cont.innerHTML = '<div class="vacio">No hay leads.</div>'; return; }
  const head = '<div style="overflow-x:auto"><table class="mkt-tabla"><thead><tr>' +
    '<th>Código</th><th>Nombre</th><th>Origen</th><th>Campaña</th><th>Conjunto</th><th>Anuncio</th><th>Creado</th><th>Asignado</th><th>Asesor</th><th>Etapa</th><th>Estado</th>' +
    '</tr></thead><tbody>' +
    filas.map(l =>
      '<tr>' +
      '<td class="mkt-cod">' + l.codigo + '</td>' +
      '<td>' + (l.nombre || '—') + '</td>' +
      '<td>' + mktOrigenBadge(l.origenCreacion) + (l.esDuplicadoActivo ? ' <span style="background:#FAEEDA;color:#854F0B;font-size:10px;padding:1px 6px;border-radius:9px;white-space:nowrap">dup. activo</span>' : '') + '</td>' +
      '<td class="mkt-attr">' + (l.campana || '<span class="mkt-vacio">(sin dato)</span>') + '</td>' +
      '<td class="mkt-attr">' + (l.conjunto || '<span class="mkt-vacio">(sin dato)</span>') + '</td>' +
      '<td class="mkt-attr">' + (l.anuncio || '<span class="mkt-vacio">(sin dato)</span>') + '</td>' +
      '<td>' + fmtFecha(l.fechaCarga) + '</td>' +
      '<td>' + (l.fechaAsignacion ? fmtFecha(l.fechaAsignacion) : '—') + '</td>' +
      '<td>' + (l.asesor ? primerNombre(l.asesor) : '<span class="mkt-vacio">sin asignar</span>') + '</td>' +
      '<td>' + (l.etapa || '—') + '</td>' +
      '<td>' + mktEstadoBadge(l) + '</td>' +
      '</tr>').join('') +
    '</tbody></table></div>';
  cont.innerHTML = head;
}

function mktOrigenBadge(o) {
  const e = mktOrigenLabel(o);
  const col = { Campaña: '#1D9E75', Relead: '#EF9F27', Manual: '#64748B' }[e] || '#64748B';
  return '<span style="background:' + col + '1a;color:' + col + ';font-size:11px;padding:2px 8px;border-radius:10px;white-space:nowrap">' + e + '</span>';
}

function mktEstado(l) {
  if (l.archivado) return 'Archivado';
  if (l.etapa === 'Cerrado ganado') return 'Ganado';
  if (l.etapa === 'Cerrado perdido') return 'Perdido';
  return 'Activo';
}
function mktEstadoBadge(l) {
  const e = mktEstado(l);
  const col = { Activo: '#1D9E75', Ganado: '#0B72E8', Perdido: '#C0392B', Archivado: '#64748B' }[e];
  return '<span style="background:' + col + '1a;color:' + col + ';font-size:11px;padding:2px 8px;border-radius:10px;white-space:nowrap">' + e + '</span>';
}

function descargarMktLeads() {
  const filas = mktFiltrados();
  const cols = ['codigo', 'nombre', 'telefono', 'origen', 'campana', 'conjunto', 'anuncio', 'fuente', 'fechaCarga', 'fechaAsignacion', 'asesor', 'etapa', 'estado'];
  const titulos = ['Codigo', 'Nombre', 'Telefono', 'Origen', 'Campana', 'Conjunto', 'Anuncio', 'Fuente', 'FechaCreacion', 'FechaAsignacion', 'Asesor', 'Etapa', 'Estado'];
  const esc = v => {
    const s = String(v == null ? '' : v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lineas = [titulos.join(',')];
  filas.forEach(l => {
    const row = { ...l, estado: mktEstado(l), origen: mktOrigenLabel(l.origenCreacion) };
    lineas.push(cols.map(c => esc(row[c])).join(','));
  });
  const csv = '\uFEFF' + lineas.join('\r\n');  // BOM para que Excel respete tildes
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'marketing_leads_' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===================== EDITAR ATRIBUCIÓN DEL LEAD (desde Ingresos) =====================
async function editarAtribucionBruto(codigo) {
  let lead;
  try { lead = await api('/api/leads/' + codigo); } catch (e) { alert('No se pudo cargar el lead: ' + e.message); return; }
  const v = s => (s == null ? '' : String(s)).replace(/"/g, '&quot;');
  let ov = $('ovEditAtrib');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'ovEditAtrib';
    ov.className = 'overlay';
    document.body.appendChild(ov);
  }
  ov.innerHTML =
    '<div class="ea-modal">' +
      '<div class="ea-head"><b>Editar atribución del lead</b>' +
        '<button class="ea-x" onclick="cerrarEditAtrib()">✕</button></div>' +
      '<div class="ea-sub">' + codigo + ' · ' + (lead.nombre || 'Sin nombre') + '</div>' +
      '<label class="ea-l">Nombre</label>' +
      '<input id="eaNombre" class="ea-i" value="' + v(lead.nombre) + '">' +
      '<label class="ea-l">Campaña <span class="ea-utm">utm_campaign</span></label>' +
      '<input id="eaCampana" class="ea-i" value="' + v(lead.campana) + '" placeholder="(sin dato)">' +
      '<label class="ea-l">Conjunto de anuncios <span class="ea-utm">utm_term</span></label>' +
      '<input id="eaConjunto" class="ea-i" value="' + v(lead.conjunto) + '" placeholder="(sin dato)">' +
      '<label class="ea-l">Anuncio <span class="ea-utm">utm_content</span></label>' +
      '<input id="eaAnuncio" class="ea-i" value="' + v(lead.anuncio) + '" placeholder="(sin dato)">' +
      '<div class="ea-nota">Se actualiza en el lead, su registro de ingreso y el catálogo de anuncios.</div>' +
      '<div class="ea-acc">' +
        '<button class="btn sec" onclick="cerrarEditAtrib()">Cancelar</button>' +
        '<button class="btn" id="eaGuardar" onclick="guardarAtribucionBruto(\'' + codigo + '\')">Guardar cambios</button>' +
      '</div>' +
    '</div>';
  ov.classList.add('act');
}

function cerrarEditAtrib() {
  const ov = $('ovEditAtrib');
  if (ov) ov.classList.remove('act');
}

async function guardarAtribucionBruto(codigo) {
  const body = {
    nombre: $('eaNombre').value.trim(),
    campana: $('eaCampana').value.trim(),
    conjunto: $('eaConjunto').value.trim(),
    anuncio: $('eaAnuncio').value.trim()
  };
  const btn = $('eaGuardar');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    await api('/api/leads/' + codigo + '/atribucion', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    cerrarEditAtrib();
    cargarBrutos();
  } catch (e) {
    alert('No se pudo guardar: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
  }
}

// ===================== MARKETING: INVERSIÓN (gasto × embudo) =====================
let INV_NIVEL = 'anuncio';
let INV_DATA = null;

function setNivelInv(n) {
  INV_NIVEL = n;
  document.querySelectorAll('[data-inv]').forEach(b => b.classList.toggle('act', b.getAttribute('data-inv') === n));
  cargarInversion();
}

// Convierte una fecha de Excel (Date o texto) a YYYY-MM-DD usando componentes locales (sin correrla por TZ).
function excelFecha(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    const p = n => String(n).padStart(2, '0');
    return v.getFullYear() + '-' + p(v.getMonth() + 1) + '-' + p(v.getDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);  // DD/MM/YYYY
  if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  return s.slice(0, 10);
}

// Mapea los encabezados del Excel a las claves que espera el servidor.
function mapaFilaGasto(row) {
  const g = (...names) => { for (const n of names) { if (row[n] != null && row[n] !== '') return row[n]; } return null; };
  return {
    fecha: g('Date', 'Fecha', 'date'),
    campana: g('Campaign name', 'Campaign', 'campana'),
    conjunto: g('AdSet name', 'Adset name', 'conjunto'),
    anuncio: g('Ad name', 'anuncio'),
    adId: g('Ad id', 'Ad ID', 'adId'),
    creativeUrl: g('Ad creative url', 'Ad creative URL', 'creativeUrl'),
    igLink: g('Link to instagram post', 'igLink'),
    objective: g('Objective', 'objective'),
    status: g('Ad status', 'status'),
    costo: g('Total Cost', 'Cost', 'costo'),
    impresiones: g('Impressions', 'impresiones'),
    clicks: g('Unique clicks', 'Clicks', 'clicks'),
    fbLeads: g('On Facebook Leads', 'fbLeads'),
    mensajes: g('New messaging conversations', 'mensajes'),
    landingB2C: g('LandindB2C', 'LandingB2C', 'landingB2C'),
    landingB2B: g('LandingB2B', 'landingB2B'),
    resultados: g('Resultados', 'Results', 'resultados'),
    nomenclatura: g('Nomenclatura', 'nomenclatura'),
    mes: g('Mes', 'mes'),
    tipoCampana: g('Tipo de Campaña', 'tipoCampana'),
    objetivoCampana: g('Objetivo de Campaña', 'objetivoCampana')
  };
}

async function cargarExcelGasto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (typeof XLSX === 'undefined') { alert('No se pudo cargar el lector de Excel (revisa tu conexión).'); return; }
  if ($('invStatus')) $('invStatus').textContent = 'Leyendo ' + file.name + '…';
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { defval: null });
    const filas = json.map(mapaFilaGasto).filter(f => f.fecha && f.anuncio);
    if (!filas.length) { alert('No se encontraron filas válidas (revisa que tenga columnas Date y Ad name).'); if ($('invStatus')) $('invStatus').textContent = ''; return; }
    // Normaliza la fecha del Excel a YYYY-MM-DD SIN correrla por zona horaria.
    filas.forEach(f => { f.fecha = excelFecha(f.fecha); });
    const r = await api('/api/marketing/gasto/cargar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filas }) });
    if ($('invStatus')) $('invStatus').textContent = r.cargadas + ' filas cargadas' + (r.omitidas ? ' · ' + r.omitidas + ' omitidas' : '');
    input.value = '';
    cargarInversion();
  } catch (e) {
    alert('No se pudo cargar el Excel: ' + e.message);
    if ($('invStatus')) $('invStatus').textContent = '';
  }
}

async function cargarInversion() {
  const cont = $('invCont');
  cont.innerHTML = '<div class="vacio">Cargando…</div>';
  const desde = $('invDesde') ? $('invDesde').value : '';
  const hasta = $('invHasta') ? $('invHasta').value : '';
  let url = '/api/marketing/inversion?nivel=anuncio';  // siempre a nivel anuncio; el árbol se arma en el cliente
  if (desde) url += '&desde=' + desde;
  if (hasta) url += '&hasta=' + hasta;
  try {
    INV_DATA = await api(url);
    renderInversion();
  } catch (e) {
    cont.innerHTML = '<div class="vacio">No se pudo cargar: ' + e.message + '</div>';
  }
}

function limpiarFechasInv() {
  if ($('invDesde')) $('invDesde').value = '';
  if ($('invHasta')) $('invHasta').value = '';
  cargarInversion();
}

function fmtSolesInv(v) { return v == null ? '—' : 'S/ ' + Number(v).toLocaleString('es-PE', { maximumFractionDigits: v < 100 ? 1 : 0 }); }

// Estado de expansión del árbol (claves de campaña y conjunto abiertos)
let INV_EXPAND = {};

function invAggNuevo() { return { costo: 0, resultadosMeta: 0, leadsCRM: 0, tocados: 0, contactado: 0, calificado: 0, agendado: 0, reunion: 0, negociacion: 0, cierre: 0 }; }
function invAggSumar(a, f) {
  a.costo += f.costo || 0; a.resultadosMeta += f.resultadosMeta || 0; a.leadsCRM += f.leadsCRM || 0;
  a.tocados += f.tocados || 0; a.contactado += f.contactado || 0; a.calificado += f.calificado || 0;
  a.agendado += f.agendado || 0; a.reunion += f.reunion || 0; a.negociacion += f.negociacion || 0; a.cierre += f.cierre || 0;
}
function invMetricas(a) {
  const r2 = n => Math.round(n * 100) / 100;
  return { cplReal: a.leadsCRM ? r2(a.costo / a.leadsCRM) : null, costoCierre: a.cierre ? r2(a.costo / a.cierre) : null };
}

function invArbol(filas) {
  const camps = {};
  filas.forEach(f => {
    const cK = f.campana || '(sin campaña)';
    const jK = f.conjunto || '(sin conjunto)';
    if (!camps[cK]) camps[cK] = { nombre: cK, agg: invAggNuevo(), conjuntos: {} };
    const C = camps[cK];
    if (!C.conjuntos[jK]) C.conjuntos[jK] = { nombre: jK, agg: invAggNuevo(), anuncios: [] };
    C.conjuntos[jK].anuncios.push(f);
    invAggSumar(C.conjuntos[jK].agg, f);
    invAggSumar(C.agg, f);
  });
  return Object.values(camps).sort((a, b) => b.agg.costo - a.agg.costo);
}

function invExpandirTodo(abrir) {
  INV_EXPAND = {};
  if (abrir) {
    const filas = (INV_DATA && INV_DATA.filas) || [];
    invArbol(filas).forEach(C => { INV_EXPAND['c:' + C.nombre] = true; Object.values(C.conjuntos).forEach(J => { INV_EXPAND['j:' + C.nombre + '|' + J.nombre] = true; }); });
  }
  renderInversion();
}
function invToggle(key) { INV_EXPAND[key] = !INV_EXPAND[key]; renderInversion(); }

function invCeldasMetricas(a, T) {
  const m = invMetricas(a);
  const cplMal = (m.cplReal != null && T.cplReal != null && m.cplReal > T.cplReal * 1.3) ? 'inv-malo' : '';
  return '<td>' + fmtSolesInv(a.costo) + '</td>' +
    '<td class="inv-muted" title="Resultados que reporta Meta (Excel de gasto)">' + a.resultadosMeta + '</td>' +
    '<td><b>' + a.leadsCRM + '</b></td>' +
    '<td>' + a.tocados + '</td>' +
    '<td>' + a.contactado + '</td>' +
    '<td>' + a.calificado + '</td>' +
    '<td class="inv-agend">' + a.agendado + '</td>' +
    '<td>' + a.reunion + '</td>' +
    '<td>' + a.negociacion + '</td>' +
    '<td><b>' + a.cierre + '</b></td>' +
    '<td class="' + cplMal + '">' + fmtSolesInv(m.cplReal) + '</td>' +
    '<td>' + (m.costoCierre != null ? fmtSolesInv(m.costoCierre) : '<span class="inv-muted">—</span>') + '</td>';
}

function renderInversion() {
  const cont = $('invCont'), cards = $('invCards');
  const filas = (INV_DATA && INV_DATA.filas) || [];
  const T = (INV_DATA && INV_DATA.totales) || {};
  if (!filas.length) {
    cards.innerHTML = '';
    cont.innerHTML = '<div class="vacio">No hay gasto en este rango. Carga el Excel o ajusta las fechas.</div>';
    return;
  }
  cards.innerHTML =
    '<div class="inv-cards">' +
      tarjetaInv('Gasto total', fmtSolesInv(T.costo)) +
      tarjetaInv('Leads Meta vs CRM', (T.resultadosMeta || 0) + ' <small>/ ' + (T.leadsCRM || 0) + '</small>', T.captura != null ? ('captura ' + T.captura + '%') : '') +
      tarjetaInv('CPL real (CRM)', fmtSolesInv(T.cplReal), T.cplMeta != null ? ('Meta: ' + fmtSolesInv(T.cplMeta)) : '') +
      tarjetaInv('Costo por cierre', fmtSolesInv(T.costoCierre), (T.cierre || 0) + ' cierres') +
    '</div>';

  const arbol = invArbol(filas);
  let body = '';
  arbol.forEach(C => {
    const cKey = 'c:' + C.nombre, cAbierto = !!INV_EXPAND[cKey];
    const nConj = Object.keys(C.conjuntos).length;
    body += '<tr class="inv-row inv-camp" onclick="invToggle(\'' + cKey.replace(/'/g, "\\'") + '\')">' +
      '<td class="inv-l"><span class="inv-tg">' + (cAbierto ? '▾' : '▸') + '</span><span class="inv-ic">📣</span><b>' + C.nombre + '</b> <span class="inv-cnt">' + nConj + ' conj.</span></td>' +
      invCeldasMetricas(C.agg, T) + '</tr>';
    if (!cAbierto) return;
    Object.values(C.conjuntos).sort((a, b) => b.agg.costo - a.agg.costo).forEach(J => {
      const jKey = 'j:' + C.nombre + '|' + J.nombre, jAbierto = !!INV_EXPAND[jKey];
      body += '<tr class="inv-row inv-conj" onclick="invToggle(\'' + jKey.replace(/'/g, "\\'") + '\')">' +
        '<td class="inv-l" style="padding-left:26px"><span class="inv-tg">' + (jAbierto ? '▾' : '▸') + '</span><span class="inv-ic">📁</span>' + J.nombre + ' <span class="inv-cnt">' + J.anuncios.length + ' anun.</span></td>' +
        invCeldasMetricas(J.agg, T) + '</tr>';
      if (!jAbierto) return;
      J.anuncios.slice().sort((a, b) => (b.costo || 0) - (a.costo || 0)).forEach(f => {
        const icono = f.creativeUrl ? '<img src="' + f.creativeUrl + '" alt="" onerror="this.parentNode.classList.add(\'inv-thumb-err\')">' : '<span>📷</span>';
        body += '<tr class="inv-row inv-anun">' +
          '<td class="inv-l" style="padding-left:50px"><div class="inv-an"><div class="inv-thumb">' + icono + '</div><div class="inv-an-txt"><div class="inv-nom">' + (f.etiqueta || f.anuncio || '(sin dato)') + '</div>' + (f.status ? '<div class="inv-sub">' + invStatusBadge(f.status) + '</div>' : '') + '</div></div></td>' +
          invCeldasMetricas(f, T) + '</tr>';
      });
    });
  });

  cont.innerHTML = '<div style="overflow-x:auto"><table class="inv-tabla"><thead><tr>' +
    '<th class="inv-l">Campaña / Conjunto / Anuncio</th><th>Gasto</th>' +
    '<th>Leads Ad</th><th>Leads CRM</th><th>Tocados</th><th>Contact.</th><th>Calif.</th><th>Agend.</th><th>Reunión</th><th>Negociación</th><th>Cierre</th>' +
    '<th>CPL real</th><th>S//cierre</th>' +
    '</tr></thead><tbody>' + body + '</tbody></table></div>';
}

function tarjetaInv(label, valor, sub) {
  return '<div class="inv-card"><div class="inv-card-l">' + label + '</div><div class="inv-card-v">' + valor + '</div>' + (sub ? '<div class="inv-card-s">' + sub + '</div>' : '') + '</div>';
}

function invStatusBadge(s) {
  if (!s) return '<span class="inv-st off">—</span>';
  const up = String(s).toUpperCase();
  if (up.includes('ACTIVE') || up.includes('OK')) return '<span class="inv-st on">● activo</span>';
  if (up.includes('PAUSED')) return '<span class="inv-st off">○ pausado</span>';
  return '<span class="inv-st off">' + s + '</span>';
}

// ===================== INGRESOS: eliminar definitivo, filtros y descarga =====================
async function eliminarBrutoDef(id) {
  const fila = (BRUTOS_FILAS || []).find(x => x.id === id);
  const quien = fila ? (fila.nombreRecibido || fila.telefonoRecibido || ('ingreso ' + id)) : ('ingreso ' + id);
  const conLead = fila && fila.codigoLead ? ('\n\nEsto también borra el lead ' + fila.codigoLead + ' y sus gestiones.') : '';
  if (!confirm('¿Eliminar DEFINITIVAMENTE "' + quien + '"?' + conLead + '\n\nNo se puede deshacer.')) return;
  try {
    await api('/api/marketing/ingresos/' + id, { method: 'DELETE' });
    cargarBrutos();
  } catch (e) {
    alert('No se pudo eliminar: ' + e.message);
  }
}

function limpiarFechasBrut() {
  if ($('brutDesde')) $('brutDesde').value = '';
  if ($('brutHasta')) $('brutHasta').value = '';
  cargarBrutos();
}

function descargarBrutos() {
  const filas = BRUTOS_FILAS || [];
  if (!filas.length) { alert('No hay ingresos para descargar.'); return; }
  const cols = ['id', 'fechaRecepcion', 'origen', 'estado', 'nombreRecibido', 'telefonoRecibido', 'emailRecibido', 'montoNumerico', 'campana', 'conjunto', 'anuncio', 'fuente', 'codigoLead', 'mensajeError'];
  const titulos = ['ID', 'FechaCreacion', 'Origen', 'Estado', 'Nombre', 'Telefono', 'Email', 'Monto', 'Campana', 'Conjunto', 'Anuncio', 'Fuente', 'CodigoLead', 'Mensaje'];
  const esc = v => {
    const s = String(v == null ? '' : v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lineas = [titulos.join(',')];
  filas.forEach(f => lineas.push(cols.map(c => esc(f[c])).join(',')));
  const csv = '\uFEFF' + lineas.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ingresos_marketing_' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===================== RECUPERAR LEADS BORRADOS (desde backup) =====================
async function abrirRecuperar() {
  const panel = $('recuperarPanel');
  panel.style.display = '';
  $('recResultado').innerHTML = '';
  try {
    const d = await api('/api/admin/backups');
    const sel = $('recBackup');
    sel.innerHTML = '';
    if (!d.backups || !d.backups.length) {
      sel.innerHTML = '<option value="">(no hay respaldos)</option>';
      $('recBackupInfo').textContent = 'No se encontraron snapshots en el volumen.';
      return;
    }
    d.backups.forEach(b => sel.add(new Option(b.fecha + ' (' + b.tamano + ')', b.archivo)));
    $('recBackupInfo').textContent = d.backups.length + ' respaldos · elige uno ANTERIOR al borrado';
  } catch (e) {
    $('recBackupInfo').textContent = 'No se pudieron listar los respaldos: ' + e.message;
  }
}

function recCodigosArray() {
  return ($('recCodigos').value || '').split(/[\n,;\s]+/).map(s => s.trim()).filter(Boolean);
}

async function previewRecuperar() { await correrRecuperar(true); }
async function ejecutarRecuperar() {
  const n = recCodigosArray().length;
  if (!confirm('¿Recuperar ' + n + ' lead(s) desde el respaldo seleccionado?\n\nSe restauran el lead, sus gestiones y su ingreso. Los que ya existan se omiten.')) return;
  await correrRecuperar(false);
}

async function correrRecuperar(soloPreview) {
  const archivo = $('recBackup').value;
  const codigos = recCodigosArray();
  if (!archivo) { alert('Elige un respaldo.'); return; }
  if (!codigos.length) { alert('Pega al menos un código de lead.'); return; }
  $('recResultado').innerHTML = '<div class="sub">Procesando…</div>';
  try {
    const url = soloPreview ? '/api/admin/recuperar-leads/preview' : '/api/admin/recuperar-leads';
    const d = await api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archivo, codigos }) });
    const filas = d.resultado.map(r => {
      let estado;
      if (r.error) estado = '<span style="color:#C0392B">' + r.error + '</span>';
      else if (r.yaExiste) estado = '<span style="color:#94a3b8">ya existe, se omite</span>';
      else if (soloPreview) estado = '<span style="color:#0B72E8">listo para recuperar</span>';
      else estado = '<span style="color:#1D9E75">✓ recuperado</span>';
      return '<tr><td style="font-family:monospace;font-size:11.5px">' + r.codigo + '</td><td>' + (r.lead || '—') + '</td><td style="text-align:center">' + r.gestiones + '</td><td style="text-align:center">' + r.ingresos + '</td><td>' + estado + '</td></tr>';
    }).join('');
    $('recResultado').innerHTML =
      '<div class="sub" style="margin-bottom:4px">' + (soloPreview ? 'Previsualización (no se ha tocado nada todavía):' : 'Resultado:') + '</div>' +
      '<table class="mkt-tabla"><thead><tr><th>Código</th><th>Nombre</th><th>Gestiones</th><th>Ingresos</th><th>Estado</th></tr></thead><tbody>' + filas + '</tbody></table>';
  } catch (e) {
    $('recResultado').innerHTML = '<div style="color:#C0392B">Error: ' + e.message + '</div>';
  }
}

// ===================== MODAL TENDENCIAS (gráficos) =====================
let TEND_DATA = null, TEND_VISTA = 'leads', TEND_CHART = null;

function abrirTendencias() {
  $('ovTend').classList.add('act');
  // hereda el filtro de fechas de Inversión si lo hay
  if ($('tendDesde') && $('invDesde')) $('tendDesde').value = $('invDesde').value || '';
  if ($('tendHasta') && $('invHasta')) $('tendHasta').value = $('invHasta').value || '';
  cargarTendencias();
}

function limpiarFechasTend() {
  $('tendDesde').value = ''; $('tendHasta').value = '';
  cargarTendencias();
}

function setVistaTend(v) {
  TEND_VISTA = v;
  document.querySelectorAll('[data-tv]').forEach(b => b.classList.toggle('act', b.getAttribute('data-tv') === v));
  if ($('tendMetricaY')) $('tendMetricaY').style.display = (v === 'cuadrante') ? '' : 'none';
  if ($('tendMetricaX')) $('tendMetricaX').style.display = (v === 'cuadrante') ? '' : 'none';
  if ($('tendEjes')) $('tendEjes').style.display = (v === 'cuadrante') ? '' : 'none';
  if ($('tendCard')) $('tendCard').style.display = 'none';
  renderTendencias();
}

function tendCampanaCambio() {
  // refiltra el selector de conjuntos según la campaña elegida, luego recarga
  poblarConjuntosTend();
  cargarTendencias();
}

function poblarCamposTend() {
  if (!TEND_DATA) return;
  const selC = $('tendCampana'), prevC = selC.value;
  selC.innerHTML = '<option value="">Todas las campañas</option>';
  (TEND_DATA.campanas || []).forEach(c => selC.add(new Option(c, c)));
  selC.value = prevC || '';
  poblarConjuntosTend();
}

function poblarConjuntosTend() {
  if (!TEND_DATA) return;
  const selJ = $('tendConjunto'), prevJ = selJ.value, camp = $('tendCampana').value;
  selJ.innerHTML = '<option value="">Todos los conjuntos</option>';
  (TEND_DATA.conjuntos || []).filter(x => !camp || x.campana === camp).forEach(x => selJ.add(new Option(x.conjunto, x.conjunto)));
  selJ.value = prevJ || '';
}

async function cargarTendencias() {
  $('tendMsg').textContent = 'Cargando…';
  const qs = [];
  if ($('tendDesde').value) qs.push('desde=' + $('tendDesde').value);
  if ($('tendHasta').value) qs.push('hasta=' + $('tendHasta').value);
  if ($('tendCampana').value) qs.push('campana=' + encodeURIComponent($('tendCampana').value));
  if ($('tendConjunto').value) qs.push('conjunto=' + encodeURIComponent($('tendConjunto').value));
  try {
    TEND_DATA = await api('/api/marketing/tendencias' + (qs.length ? '?' + qs.join('&') : ''));
    poblarCamposTend();
    $('tendMsg').textContent = '';
    renderTendencias();
  } catch (e) {
    $('tendMsg').textContent = 'No se pudo cargar: ' + e.message;
  }
}

function tendLeyenda(items) {
  $('tendLegend').innerHTML = items.map(it =>
    '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:' + (it.line ? '3px' : '11px') + ';border-radius:2px;background:' + it.color + '"></span>' + it.label + '</span>'
  ).join('');
}

function renderTendencias() {
  if (!TEND_DATA) return;
  const dias = TEND_DATA.dias || [];
  if (TEND_CHART) { TEND_CHART.destroy(); TEND_CHART = null; }
  const ctx = $('tendChart');
  if ((TEND_VISTA === 'leads' || TEND_VISTA === 'costo') && !dias.length) { $('tendMsg').textContent = 'No hay datos en este rango/filtro.'; return; }
  if (TEND_VISTA === 'cuadrante' && !((TEND_DATA.anuncios || []).length)) { $('tendMsg').textContent = 'No hay anuncios con datos en este rango/filtro.'; return; }
  $('tendMsg').textContent = '';
  const ejeBase = { grid: { color: '#EEF1F4' }, ticks: { color: '#94a3b8', font: { size: 11 } }, beginAtZero: true };

  if (TEND_VISTA === 'leads') {
    tendLeyenda([{ label: 'Leads Ad (Meta)', color: '#2a78d6', line: 1 }, { label: 'Leads CRM', color: '#1baf7a', line: 1 }, { label: 'Captación %', color: '#eda100' }]);
    TEND_CHART = new Chart(ctx, {
      data: {
        labels: dias.map(d => fmtDiaCorto(d.fecha)),
        datasets: [
          { type: 'line', label: 'Leads Ad', data: dias.map(d => d.leadsAd), borderColor: '#2a78d6', backgroundColor: '#2a78d6', borderWidth: 2, tension: .3, pointRadius: 3, yAxisID: 'y' },
          { type: 'line', label: 'Leads CRM', data: dias.map(d => d.leadsCRM), borderColor: '#1baf7a', backgroundColor: '#1baf7a', borderWidth: 2, borderDash: [6, 4], tension: .3, pointRadius: 3, yAxisID: 'y' },
          { type: 'bar', label: 'Captación %', data: dias.map(d => d.captura), backgroundColor: 'rgba(237,161,0,.22)', borderColor: '#eda100', borderWidth: 1, yAxisID: 'y2' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } }, y: { ...ejeBase, title: { display: true, text: 'Leads', color: '#94a3b8' } }, y2: { position: 'right', beginAtZero: true, max: 100, grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => v + '%' } } }
      }
    });
  } else if (TEND_VISTA === 'costo') {
    tendLeyenda([{ label: 'Gasto (S/)', color: '#534AB7' }, { label: 'CPL real (S/)', color: '#D85A30', line: 1 }]);
    TEND_CHART = new Chart(ctx, {
      data: {
        labels: dias.map(d => fmtDiaCorto(d.fecha)),
        datasets: [
          { type: 'bar', label: 'Gasto', data: dias.map(d => d.gasto), backgroundColor: 'rgba(83,74,183,.25)', borderColor: '#534AB7', borderWidth: 1, yAxisID: 'y' },
          { type: 'line', label: 'CPL real', data: dias.map(d => d.cpl), borderColor: '#D85A30', backgroundColor: '#D85A30', borderWidth: 2, tension: .3, pointRadius: 3, yAxisID: 'y2' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } }, y: { ...ejeBase, title: { display: true, text: 'Gasto S/', color: '#94a3b8' } }, y2: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => 'S/' + v }, title: { display: true, text: 'CPL', color: '#94a3b8' } } }
      }
    });
  } else if (TEND_VISTA === 'embudo') {
    // Embudo del periodo (barras horizontales descendentes)
    const e = TEND_DATA.embudo || {};
    const etapas = [['Leads', e.leadsCRM], ['Tocados', e.tocados], ['Contactados', e.contactado], ['Calificados', e.calificado], ['Agendados', e.agendado], ['Reunión', e.reunion], ['Negociación', e.negociacion], ['Cierre', e.cierre]];
    tendLeyenda([{ label: 'Leads que llegan a cada etapa (periodo filtrado)', color: '#185FA5' }]);
    TEND_CHART = new Chart(ctx, {
      type: 'bar',
      data: { labels: etapas.map(x => x[0]), datasets: [{ label: 'Leads', data: etapas.map(x => x[1] || 0), backgroundColor: '#378ADD', borderColor: '#185FA5', borderWidth: 1 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => { const base = etapas[0][1] || 0; const pct = base ? Math.round((c.parsed.x / base) * 100) : 0; return c.parsed.x + ' leads (' + pct + '% del total)'; } } } },
        scales: { x: { ...ejeBase }, y: { grid: { display: false }, ticks: { color: '#475569', font: { size: 12 } } } }
      }
    });
  } else {
    renderCuadrante(ctx);
  }
}

// Mediana de un arreglo de números
function tendMediana(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

let TEND_IMGS = {};
function renderCuadrante(ctx) {
  const metricaY = $('tendMetricaY') ? $('tendMetricaY').value : 'agendado';
  const metricaX = $('tendMetricaX') ? $('tendMetricaX').value : 'costo';
  const etiquetaY = metricaY === 'leadsCRM' ? 'Leads CRM' : metricaY === 'cierre' ? 'Cierres' : 'Agendados';
  const esCPL = metricaX === 'cpl';
  const valX = a => esCPL ? (a.leadsCRM ? Math.round((a.costo / a.leadsCRM) * 100) / 100 : null) : (a.costo || 0);
  let ans = (TEND_DATA.anuncios || []).filter(a => (a.costo || 0) > 0 || (a.leadsCRM || 0) > 0 || (a[metricaY] || 0) > 0);
  let excluidos = 0;
  if (esCPL) { const total = ans.length; ans = ans.filter(a => a.leadsCRM > 0); excluidos = total - ans.length; }
  if (!ans.length) { $('tendMsg').textContent = 'No hay anuncios con datos para esta métrica.'; return; }

  const MX = tendMediana(ans.map(valX).filter(v => v != null));
  const MY = tendMediana(ans.map(a => a[metricaY] || 0));
  const rawMaxX = Math.max(...ans.map(a => valX(a) || 0), 1);
  let maxX = Math.max(1, Math.ceil((rawMaxX * 1.12) / (rawMaxX > 20 ? 5 : 1)) * (rawMaxX > 20 ? 5 : 1));
  let maxY = Math.max(2, Math.ceil(Math.max(...ans.map(a => a[metricaY] || 0)) + 1));
  let corteX = MX, corteY = MY;
  // Overrides manuales (vacío = automático)
  const numIn = id => { const v = $(id) ? $(id).value : ''; return v !== '' && !isNaN(Number(v)) ? Number(v) : null; };
  const oMaxX = numIn('tendMaxX'), oMaxY = numIn('tendMaxY'), oCorteX = numIn('tendCorteX'), oCorteY = numIn('tendCorteY');
  if (oMaxX != null) maxX = oMaxX;
  if (oMaxY != null) maxY = oMaxY;
  if (oCorteX != null) corteX = oCorteX;
  if (oCorteY != null) corteY = oCorteY;
  const radio = a => Math.max(15, 9 + (a.leadsCRM || 0) * 1.3);  // mínimo 15px para que se vea la foto
  const colorCorte = a => {
    const altoY = (a[metricaY] || 0) >= corteY, caro = (valX(a) || 0) >= corteX;
    if (altoY && !caro) return '#1baf7a';
    if (altoY && caro) return '#2a78d6';
    if (!altoY && !caro) return '#888780';
    return '#e34948';
  };

  tendLeyenda([
    { label: 'Escalar (rinde + barato)', color: '#1baf7a' }, { label: 'Optimizar (rinde + caro)', color: '#2a78d6' },
    { label: 'Observar (flojo + barato)', color: '#888780' }, { label: 'Pausar (flojo + caro)', color: '#e34948' }
  ]);
  $('tendMsg').textContent = esCPL && excluidos ? (excluidos + ' anuncio(s) sin leads no se muestran en modo CPL.') : '';
  if ($('tendCard')) $('tendCard').style.display = 'none';

  // Precarga de imágenes de los anuncios (se redibuja al cargar cada una)
  ans.forEach(a => {
    if (a.creativeUrl && !TEND_IMGS[a.creativeUrl]) {
      const im = new Image();
      im.onload = () => { try { if (TEND_CHART) TEND_CHART.draw(); } catch (e) {} };
      im.onerror = () => {};
      im.src = a.creativeUrl; TEND_IMGS[a.creativeUrl] = im;
    }
  });

  const quadBg = {
    id: 'quadBg',
    beforeDraw(ch) {
      try {
      const { ctx: c, chartArea: a, scales: { x, y } } = ch; if (!a) return;
      const px = x.getPixelForValue(corteX), py = y.getPixelForValue(corteY);
      const fill = (x0, y0, x1, y1, col) => { c.fillStyle = col; c.fillRect(x0, y0, x1 - x0, y1 - y0); };
      fill(a.left, a.top, px, py, 'rgba(27,175,122,.07)');
      fill(px, a.top, a.right, py, 'rgba(42,120,214,.07)');
      fill(a.left, py, px, a.bottom, 'rgba(136,135,128,.06)');
      fill(px, py, a.right, a.bottom, 'rgba(227,73,72,.07)');
      c.save(); c.strokeStyle = '#c3c2b7'; c.setLineDash([5, 4]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(px, a.top); c.lineTo(px, a.bottom); c.stroke();
      c.beginPath(); c.moveTo(a.left, py); c.lineTo(a.right, py); c.stroke();
      c.setLineDash([]); c.font = '600 11px sans-serif';
      c.fillStyle = '#0F6E56'; c.textAlign = 'left'; c.fillText('Escalar', a.left + 6, a.top + 14);
      c.fillStyle = '#185FA5'; c.textAlign = 'right'; c.fillText('Optimizar', a.right - 6, a.top + 14);
      c.fillStyle = '#5F5E5A'; c.textAlign = 'left'; c.fillText('Observar', a.left + 6, a.bottom - 8);
      c.fillStyle = '#A32D2D'; c.textAlign = 'right'; c.fillText('Pausar', a.right - 6, a.bottom - 8);
      c.restore();
      } catch (e) { /* el fondo de cuadrantes nunca debe tumbar el gráfico */ }
    }
  };
  const fotos = {
    id: 'fotos',
    afterDatasetsDraw(ch) {
      const c = ch.ctx;
      ch.data.datasets.forEach((ds, i) => {
        try {
          const pt = ch.getDatasetMeta(i).data[0]; if (!pt) return;
          const a = ans[i]; const img = a && a.creativeUrl ? TEND_IMGS[a.creativeUrl] : null;
          const r = (pt.options && pt.options.radius) || 12;
          if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
            const s = Math.min(img.naturalWidth, img.naturalHeight);
            const sc = s > 0 ? (r * 2) / s : 0;
            const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
            if (isFinite(w) && isFinite(h) && w > 0 && h > 0) {
              c.save();
              c.beginPath(); c.arc(pt.x, pt.y, r - 1.5, 0, Math.PI * 2); c.closePath(); c.clip();
              c.drawImage(img, pt.x - w / 2, pt.y - h / 2, w, h);
              c.restore();
              c.beginPath(); c.arc(pt.x, pt.y, r, 0, Math.PI * 2); c.strokeStyle = colorCorte(a); c.lineWidth = 2.5; c.stroke();
            }
          }
        } catch (e) { /* una imagen problemática nunca debe tumbar el gráfico */ }
      });
    }
  };

  try {
  TEND_CHART = new Chart(ctx, {
    type: 'bubble',
    data: { datasets: ans.map(a => ({ label: a.anuncio, clip: false, data: [{ x: valX(a) || 0, y: a[metricaY] || 0, r: radio(a) }], backgroundColor: colorCorte(a) + 'cc', borderColor: colorCorte(a), borderWidth: 1 })) },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 6, right: 18, bottom: 16, left: 6 } },
      onClick: (ev, els) => {
        if (els && els.length) mostrarTarjetaAnuncio(ans[els[0].datasetIndex], ev, esCPL, etiquetaY);
        else if ($('tendCard')) $('tendCard').style.display = 'none';
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => { const a = ans[c.datasetIndex]; const xv = valX(a); const sl = esCPL && !a.leadsCRM ? ' (sin leads)' : ''; return a.anuncio + ' · ' + (esCPL ? 'CPL S/' + xv + sl : 'S/' + (a.costo || 0)) + ' · ' + (a[metricaY] || 0) + ' ' + etiquetaY.toLowerCase() + ' · ' + (a.leadsCRM || 0) + ' leads'; }, afterLabel: c => { const a = ans[c.datasetIndex]; return '📣 ' + (a.campana || '—') + '\n📁 ' + (a.conjunto || '—'); } } } },
      scales: {
        x: { title: { display: true, text: (esCPL ? 'Costo por lead (S/)' : 'Costo (gasto S/)') + '  →', color: '#94a3b8', font: { size: 11 } }, grid: { color: '#EEF1F4' }, ticks: { color: '#94a3b8', callback: v => 'S/' + Math.round(v) }, min: 0, max: maxX },
        y: { title: { display: true, text: 'Desempeño (' + etiquetaY + ')  →', color: '#94a3b8', font: { size: 11 } }, grid: { color: '#EEF1F4' }, ticks: { color: '#94a3b8', stepSize: 1, precision: 0, callback: v => v < 0 ? '' : v }, min: 0, max: maxY }
      }
    },
    plugins: [quadBg, fotos]
  });
  } catch (e) { $('tendMsg').textContent = 'No se pudo dibujar el cuadrante: ' + e.message; console.error('renderCuadrante:', e); }
}

// Tarjeta flotante al hacer clic en una burbuja: muestra a qué campaña/conjunto pertenece + métricas
function mostrarTarjetaAnuncio(a, ev, esCPL, etiquetaY) {
  const card = $('tendCard'); if (!card || !a) return;
  const cpl = a.leadsCRM ? (Math.round((a.costo / a.leadsCRM) * 100) / 100) : null;
  card.innerHTML =
    '<div style="font-weight:600;margin-bottom:6px;word-break:break-word">' + (a.anuncio || '(sin anuncio)') + '</div>' +
    '<div style="color:var(--muted);margin-bottom:2px">📣 <b style="color:var(--ink);font-weight:600">Campaña:</b> ' + (a.campana || '—') + '</div>' +
    '<div style="color:var(--muted);margin-bottom:6px">📁 <b style="color:var(--ink);font-weight:600">Conjunto:</b> ' + (a.conjunto || '—') + '</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px;color:#475569">' +
      '<span>Gasto: <b>S/' + (a.costo || 0) + '</b></span>' +
      '<span>Leads: <b>' + (a.leadsCRM || 0) + '</b></span>' +
      '<span>Agend.: <b>' + (a.agendado || 0) + '</b></span>' +
      '<span>Cierres: <b>' + (a.cierre || 0) + '</b></span>' +
      '<span>CPL: <b>' + (cpl != null ? 'S/' + cpl : '—') + '</b></span>' +
    '</div>' +
    '<div style="text-align:right;margin-top:4px"><span style="cursor:pointer;color:#94a3b8" onclick="$(\'tendCard\').style.display=\'none\'">cerrar ✕</span></div>';
  const wrap = card.parentNode.getBoundingClientRect();
  let left = (ev.x || 60) + 12, top = (ev.y || 60) + 12;
  if (left + 248 > wrap.width) left = Math.max(4, (ev.x || 60) - 252);
  if (top + 150 > wrap.height) top = Math.max(4, (ev.y || 60) - 150);
  card.style.left = left + 'px'; card.style.top = top + 'px'; card.style.display = 'block';
}

function fmtDiaCorto(f) { if (!f) return ''; const p = f.split('-'); return p.length === 3 ? (p[2] + '/' + p[1]) : f; }

async function probarReporte() {
  if (!confirm('¿Enviar ahora el reporte del Ranking del día al correo configurado?')) return;
  try {
    const r = await api('/api/admin/reporte-prueba', { method: 'POST' });
    if (!r.mailerActivo) alert('El correo no está configurado (falta RESEND_API_KEY en Railway).');
    else if (!r.enviadoA || r.enviadoA === '(no configurado)') alert('Falta configurar REPORTE_EMAIL en Railway con tu correo.');
    else alert('Reporte enviado a: ' + r.enviadoA + '\n\nRevisa tu bandeja (y spam).');
  } catch (e) { alert('Error: ' + e.message); }
}

async function waPrueba(tipo, texto) {
  try {
    const r = await api('/api/admin/wa-prueba', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, texto }) });
    if (!r.ok) alert('No se envió: ' + (r.error || 'error') + '\n\nConfigura WA_BOT_URL, WA_BOT_TOKEN y WA_GRUPO_PRUEBAS_JID en Railway.');
    else alert('Enviado al ' + r.enviadoA + ' ✅\n\nRevisa el grupo de WhatsApp.');
  } catch (e) { alert('Error: ' + e.message); }
}
function waPruebaLibre() {
  const t = prompt('Mensaje a enviar al grupo de pruebas (acepta *negrita* y saltos de línea):');
  if (t && t.trim()) waPrueba('libre', t.trim());
}
