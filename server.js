// =============================================================
// CRM TASATOP WEB v1.1 - SERVIDOR
// Novedades v1.1:
//  - Login con usuario/contrasena y roles (admin / gestora)
//  - Importacion masiva de leads con vista previa (validos/duplicados/errores)
//  - Asignacion individual y en bloque, horas de carga/asignacion visibles
// Levantar con:  node server.js   ->  http://localhost:3000
// =============================================================

const express = require('express');
const path = require('path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const L = require('./logic');
const mailer = require('./mailer');

// Ruta de la base de datos:
//  - Si existe la variable de entorno DB_PATH (p.ej. en Railway con Volume montado),
//    se usa esa ruta y se crea su carpeta automaticamente si no existe.
//  - Si no existe DB_PATH, se mantiene el comportamiento actual: crm.db junto al server.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'crm.db');
const DB_DIR = path.dirname(DB_PATH);
try {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log('Directorio de base creado:', DB_DIR);
  }
} catch (e) {
  console.error('No se pudo crear el directorio de la base:', DB_DIR, e.message);
}
console.log('Usando base de datos en:', DB_PATH);
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    telefono TEXT,
    email TEXT,
    fuente TEXT,
    campana TEXT,
    asesor TEXT,
    fechaCarga TEXT NOT NULL,
    fechaAsignacion TEXT
  );
  CREATE TABLE IF NOT EXISTS gestiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL,
    fecha TEXT NOT NULL,
    asesor TEXT NOT NULL,
    canal TEXT NOT NULL,
    resultado TEXT NOT NULL,
    grupoLimpio TEXT,
    proximaAccion TEXT,
    comentario TEXT,
    fechaProxAccion TEXT,
    ticket TEXT, tiempo TEXT, nivelInteres TEXT, experiencia TEXT,
    objecion TEXT, fechaReunion TEXT, tipoReunion TEXT, estadoReunion TEXT,
    closer TEXT, motivoPerdida TEXT
  );
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('admin','jefa','gestora')),
    hash TEXT NOT NULL,
    sal TEXT NOT NULL,
    activo INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS sesiones (
    token TEXT PRIMARY KEY,
    usuario TEXT NOT NULL,
    creada TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS llamadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aircall_id TEXT UNIQUE,
    codigo TEXT,
    telefono TEXT,
    direccion TEXT,
    contestada INTEGER,
    duracion INTEGER,
    agente TEXT,
    fecha TEXT NOT NULL,
    crudo TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_llamadas_codigo ON llamadas(codigo);
  CREATE INDEX IF NOT EXISTS idx_gestiones_codigo ON gestiones(codigo);
`);
// Migracion suave para bases creadas con v1.0
try { db.exec('ALTER TABLE leads ADD COLUMN montoPotencial TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE leads ADD COLUMN montoReal INTEGER'); } catch (e) {}
try { db.exec('ALTER TABLE leads ADD COLUMN montoRango TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE leads ADD COLUMN archivado INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE leads ADD COLUMN fechaCierreEstimada TEXT'); } catch (e) {}
db.exec(`
  CREATE TABLE IF NOT EXISTS auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    usuario TEXT NOT NULL,
    nombre TEXT,
    accion TEXT NOT NULL,
    objetivo TEXT,
    detalle TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha);
`);
function auditar(req, accion, objetivo, detalle) {
  try {
    db.prepare('INSERT INTO auditoria (fecha,usuario,nombre,accion,objetivo,detalle) VALUES (?,?,?,?,?,?)')
      .run(new Date().toISOString(), req.user ? req.user.usuario : '?',
           req.user ? req.user.nombre : '?', accion, objetivo || null, detalle || null);
  } catch (e) {}
}

// ---------- Usuarios iniciales ----------
function hashClave(clave, sal) {
  return crypto.scryptSync(clave, sal, 32).toString('hex');
}
function crearUsuario(usuario, nombre, rol, clave) {
  const sal = crypto.randomBytes(8).toString('hex');
  db.prepare('INSERT OR IGNORE INTO usuarios (usuario,nombre,rol,hash,sal) VALUES (?,?,?,?,?)')
    .run(usuario, nombre, rol, hashClave(clave, sal), sal);
}
if (db.prepare('SELECT COUNT(*) AS c FROM usuarios').get().c === 0) {
  // Usuarios reales. Login por correo. Clave inicial para todos: 12345678
  // (solo el admin puede cambiar contrasenas).
  crearUsuario('jnazario@tasatop.com', 'Julio Nazario', 'admin', '12345678');
  crearUsuario('dcubas@tasatop.com', 'Diego Cubas', 'admin', '12345678');
  crearUsuario('jdelgado@tasatop.com', 'Jenny Delgado', 'jefa', '12345678');
  crearUsuario('mlujan@tasatop.com', 'Mafer Lujan', 'gestora', '12345678');
  crearUsuario('bortega@tasatop.com', 'Breezy Ortega', 'gestora', '12345678');
  crearUsuario('lvillavicencio@tasatop.com', 'Lourdes Villavicencio', 'gestora', '12345678');
  console.log('Usuarios creados (clave inicial 12345678): 2 admin, 1 jefa, 3 GP');
}

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Sesiones ----------
function leerToken(req) {
  const c = req.headers.cookie || '';
  const m = c.match(/(?:^|;\s*)sesion=([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}
function usuarioDeSesion(req) {
  const token = leerToken(req);
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sesiones WHERE token = ?').get(token);
  if (!s) return null;
  return db.prepare('SELECT usuario,nombre,rol FROM usuarios WHERE usuario = ? AND activo = 1').get(s.usuario) || null;
}

app.post('/api/login', (req, res) => {
  const { usuario, clave } = req.body || {};
  const u = db.prepare('SELECT * FROM usuarios WHERE usuario = ? AND activo = 1').get(String(usuario || '').toLowerCase());
  if (!u || hashClave(clave || '', u.sal) !== u.hash) {
    return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sesiones (token,usuario,creada) VALUES (?,?,?)')
    .run(token, u.usuario, new Date().toISOString());
  res.setHeader('Set-Cookie', `sesion=${token}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`);
  res.json({ usuario: u.usuario, nombre: u.nombre, rol: u.rol });
});

app.post('/api/logout', (req, res) => {
  const token = leerToken(req);
  if (token) db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', 'sesion=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u) return res.status(401).json({ error: 'Sin sesion' });
  res.json(u);
});

// Solo el admin gestiona contrasenas. Puede cambiar la suya o la de cualquier usuario.
app.post('/api/cambiar-clave', (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u) return res.status(401).json({ error: 'Sin sesion' });
  if (u.rol !== 'admin') return res.status(403).json({ error: 'Solo el administrador puede cambiar contrasenas' });
  const { usuarioObjetivo, claveNueva } = req.body || {};
  const destino = usuarioObjetivo ? String(usuarioObjetivo).toLowerCase() : u.usuario;
  const full = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(destino);
  if (!full) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!claveNueva || claveNueva.length < 8) {
    return res.status(422).json({ error: 'La nueva contrasena debe tener al menos 8 caracteres' });
  }
  const sal = crypto.randomBytes(8).toString('hex');
  db.prepare('UPDATE usuarios SET hash = ?, sal = ? WHERE usuario = ?')
    .run(hashClave(claveNueva, sal), sal, destino);
  auditar(req, 'cambiar-clave', destino, 'Contrasena actualizada por admin');
  res.json({ ok: true });
});

// Lista de usuarios (solo admin) para el panel de gestion de claves.
app.get('/api/usuarios', (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || u.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  const lista = db.prepare('SELECT usuario, nombre, rol FROM usuarios WHERE activo = 1 ORDER BY rol, nombre').all();
  res.json(lista);
});

// ---------- Webhook de Aircall (Etapa 1) ----------
// Recibe eventos de llamada de Aircall y los registra en la trazabilidad del lead.
// NO usa login (Aircall no inicia sesion); se protege con un token secreto en la URL:
//   POST /api/webhooks/aircall/:token   (token = variable de entorno AIRCALL_WEBHOOK_TOKEN)
// Match del lead por numero de telefono (ultimos 9 digitos).
app.post('/api/webhooks/aircall/:token', (req, res) => {
  const esperado = process.env.AIRCALL_WEBHOOK_TOKEN || '';
  if (!esperado || req.params.token !== esperado) {
    return res.status(403).json({ error: 'Token invalido' });
  }
  try {
    const ev = req.body || {};
    // Aircall envia { event: 'call.ended', data: { ... } }
    const tipo = ev.event || '';
    const c = ev.data || {};
    // Solo registramos llamadas finalizadas (tienen duracion y desenlace)
    if (tipo !== 'call.ended' && tipo !== 'call.hungup' && tipo !== 'call.created') {
      return res.json({ ok: true, ignorado: tipo });
    }
    // Numero del lead: en salientes es 'to', en entrantes es 'from'
    const direccion = c.direction === 'inbound' ? 'entrante' : 'saliente';
    const numeroLead = direccion === 'entrante' ? (c.from || c.raw_digits) : (c.to || c.raw_digits);
    const cel9 = L.normalizarCelular(numeroLead || '');
    // Buscar lead cuyo telefono termine en esos 9 digitos
    let lead = null;
    if (cel9) {
      lead = db.prepare("SELECT * FROM leads WHERE COALESCE(archivado,0)=0 AND replace(replace(telefono,' ',''),'-','') LIKE ?")
        .get('%' + cel9);
    }
    const contestada = (c.answered_at || c.status === 'answered' || c.duration > 0) ? 1 : 0;
    const duracion = Number(c.duration || 0);
    const agente = (c.user && (c.user.name || c.user.email)) || c.agent || null;
    const fecha = new Date((c.ended_at ? c.ended_at * 1000 : Date.now())).toISOString();
    const aircallId = String(c.id || ('ac-' + Date.now()));

    db.prepare(`INSERT OR IGNORE INTO llamadas
      (aircall_id, codigo, telefono, direccion, contestada, duracion, agente, fecha, crudo)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(aircallId, lead ? lead.codigo : null, numeroLead || null, direccion,
           contestada, duracion, agente, fecha, JSON.stringify(ev).slice(0, 4000));

    console.log('[aircall] Llamada', direccion, contestada ? 'contestada' : 'no contestada',
      duracion + 's', '->', lead ? lead.codigo : 'sin match', numeroLead);
    res.json({ ok: true, lead: lead ? lead.codigo : null });
  } catch (e) {
    console.error('[aircall] Error procesando webhook:', e.message);
    res.json({ ok: false, error: e.message }); // 200 igual, para que Aircall no reintente en bucle
  }
});

// Middleware: toda la API (salvo login) requiere sesion.
app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  const u = usuarioDeSesion(req);
  if (!u) return res.status(401).json({ error: 'Sin sesion. Inicia sesion.' });
  req.user = u;
  next();
});
function soloAdmin(req, res, next) {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  next();
}
// Admin y Jefa de Ventas pueden asignar/reasignar leads.
function puedeAsignar(req, res, next) {
  if (req.user.rol !== 'admin' && req.user.rol !== 'jefa') {
    return res.status(403).json({ error: 'No autorizado para asignar' });
  }
  next();
}
// True si el usuario ve toda la cartera (admin y jefa). La GP solo ve lo suyo.
function veTodo(user) {
  return user.rol === 'admin' || user.rol === 'jefa';
}

// ---------- Helpers de leads ----------
function gestionesDeLead(codigo) {
  return db.prepare('SELECT * FROM gestiones WHERE codigo = ? ORDER BY fecha ASC, id ASC').all(codigo);
}
function leadConsolidado(lead, gestiones) {
  const g = Array.isArray(gestiones) ? gestiones : gestionesDeLead(lead.codigo);
  return L.consolidarLead(lead, g);
}
function generarCodigo() {
  const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const pref = `TST-${hoy}-`;
  const n = db.prepare('SELECT COUNT(*) AS c FROM leads WHERE codigo LIKE ?').get(pref + '%').c;
  return pref + String(n + 1).padStart(6, '0');
}

// ---------- Catalogos ----------
app.get('/api/catalogos', (req, res) => {
  res.json({
    asesores: L.ASESORES, canales: L.CANALES, fuentes: L.FUENTES,
    resultados: L.RESULTADOS, proximasAcciones: L.PROXIMAS_ACCIONES,
    nivelInteres: L.NIVEL_INTERES, ticketRango: L.TICKET_RANGO,
    tiempo: L.TIEMPO, experiencia: L.EXPERIENCIA, avance: L.AVANCE,
    tipoReunion: L.TIPO_REUNION, estadoReunion: L.ESTADO_REUNION,
    objeciones: L.OBJECIONES, motivosPerdida: L.MOTIVOS_PERDIDA,
    accionesPorResultado: require('./logic').ACCIONES_POR_RESULTADO || {},
    kanbanColumnas: L.KANBAN_COLUMNAS, kanbanResultadoDestino: L.KANBAN_RESULTADO_DESTINO
  });
});

// ---------- Leads ----------
app.post('/api/leads', soloAdmin, (req, res) => {
  const { nombre, telefono, email, fuente, campana, asesor, montoReal } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Falta nombre del lead' });
  if (asesor && !L.ASESORES.includes(asesor)) {
    return res.status(400).json({ error: 'Asesor no valido. Opciones: ' + L.ASESORES.join(', ') });
  }
  const codigo = generarCodigo();
  const ahora = new Date().toISOString();
  const monto = montoReal ? Number(montoReal) : null;
  db.prepare(`INSERT INTO leads (codigo,nombre,telefono,email,fuente,campana,asesor,montoReal,montoPotencial,fechaCarga,fechaAsignacion)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(codigo, nombre, L.normalizarCelular(telefono) || telefono || null, email || null,
         fuente || null, campana || null, asesor || null, monto, monto, ahora, asesor ? ahora : null);
  res.json(leadConsolidado(db.prepare('SELECT * FROM leads WHERE codigo = ?').get(codigo)));
});

// IMPORTACION MASIVA - Paso 1: vista previa
app.post('/api/leads/importar/preview', soloAdmin, (req, res) => {
  const filas = req.body.filas || [];
  if (!filas.length) return res.status(400).json({ error: 'No hay filas para analizar' });
  if (filas.length > 2000) return res.status(400).json({ error: 'Maximo 2000 filas por importacion' });

  const existentesCel = new Set(db.prepare('SELECT telefono FROM leads WHERE telefono IS NOT NULL').all().map(r => r.telefono));
  const existentesMail = new Set(db.prepare('SELECT lower(email) AS e FROM leads WHERE email IS NOT NULL').all().map(r => r.e));
  const vistosCel = new Set(), vistosMail = new Set();

  const validos = [], duplicados = [], erroneos = [];
  filas.forEach((fila, i) => {
    const v = L.validarFilaImport(fila);
    const num = i + 1;
    if (!v.ok) { erroneos.push({ fila: num, ...v.datos, motivos: v.errores }); return; }
    const cel = v.datos.celular;
    const mail = (v.datos.email || '').toLowerCase();
    if (existentesCel.has(cel) || (mail && existentesMail.has(mail))) {
      duplicados.push({ fila: num, ...v.datos, motivo: existentesCel.has(cel) ? 'Celular ya existe en la base' : 'Email ya existe en la base' });
      return;
    }
    if (vistosCel.has(cel) || (mail && vistosMail.has(mail))) {
      duplicados.push({ fila: num, ...v.datos, motivo: 'Repetido dentro del archivo' });
      return;
    }
    vistosCel.add(cel); if (mail) vistosMail.add(mail);
    validos.push({ fila: num, ...v.datos });
  });

  res.json({ total: filas.length, validos, duplicados, erroneos });
});

// IMPORTACION MASIVA - Paso 2: confirmar
app.post('/api/leads/importar/confirmar', soloAdmin, (req, res) => {
  const filas = req.body.filas || [];
  const actualizar = req.body.actualizarDuplicados || [];
  const ahora = new Date().toISOString();
  let importados = 0, actualizados = 0;

  filas.forEach(f => {
    const codigo = generarCodigo();
    db.prepare(`INSERT INTO leads (codigo,nombre,telefono,email,fuente,montoReal,montoRango,montoPotencial,fechaCarga)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(codigo, f.nombre, f.celular, f.email || null, f.fuente || null,
           f.montoReal || null, f.montoRango || null, f.montoReal || null, ahora);
    importados++;
  });

  actualizar.forEach(f => {
    const lead = db.prepare('SELECT * FROM leads WHERE telefono = ?').get(f.celular)
      || (f.email ? db.prepare('SELECT * FROM leads WHERE lower(email) = lower(?)').get(f.email) : null);
    if (!lead) return;
    db.prepare(`UPDATE leads SET
        email = COALESCE(email, ?),
        fuente = COALESCE(fuente, ?),
        montoReal = COALESCE(montoReal, ?),
        montoRango = COALESCE(montoRango, ?),
        montoPotencial = COALESCE(montoPotencial, ?)
      WHERE codigo = ?`)
      .run(f.email || null, f.fuente || null, f.montoReal || null, f.montoRango || null, f.montoReal || null, lead.codigo);
    actualizados++;
  });

  auditar(req, 'importar', null, `${importados} nuevos, ${actualizados} actualizados`);
  res.json({ importados, actualizados });
});

// Asignacion individual o en bloque (admin)
app.put('/api/leads/asignar', puedeAsignar, (req, res) => {
  const { codigos, asesor } = req.body;
  if (!Array.isArray(codigos) || !codigos.length) return res.status(400).json({ error: 'Faltan codigos' });
  if (!L.ASESORES.includes(asesor)) {
    return res.status(400).json({ error: 'Asesor no valido. Opciones: ' + L.ASESORES.join(', ') });
  }
  const ahora = new Date().toISOString();
  const st = db.prepare('UPDATE leads SET asesor = ?, fechaAsignacion = ? WHERE codigo = ?');
  let n = 0;
  codigos.forEach(c => { if (st.run(asesor, ahora, c).changes) n++; });
  auditar(req, 'asignar', codigos.length === 1 ? codigos[0] : `${n} leads`, 'Asignados a ' + asesor);

  // Notificacion por correo a la GP (en modo prueba va a CORREO_PRUEBA).
  // Correos por GP via env: CORREOS_GP='Mafer:mafer@...,Lourdes:lourdes@...'
  if (mailer.activo()) {
    const mapa = {};
    (process.env.CORREOS_GP || '').split(',').forEach(par => {
      const [nombre, mail] = par.split(':');
      if (nombre && mail) mapa[nombre.trim()] = mail.trim();
    });
    const correoGP = mapa[asesor] || null;
    // Enviar un correo por cada lead asignado (sin bloquear la respuesta)
    codigos.forEach(c => {
      const lead = db.prepare('SELECT * FROM leads WHERE codigo = ?').get(c);
      if (lead) mailer.correoLeadAsignado(lead, correoGP).catch(() => {});
    });
  }

  res.json({ asignados: n, asesor });
});

// Cola de leads. Gestora: solo los suyos. Admin: todos / sin-asignar / por asesor.
// Filtra leads por rango de fecha de asignacion (inclusive). Vacios = sin limite.
function filtrarPorAsignacion(leads, desde, hasta) {
  if (!desde && !hasta) return leads;
  const d = desde ? new Date(desde + 'T00:00:00') : null;
  const h = hasta ? new Date(hasta + 'T23:59:59') : null;
  return leads.filter(l => {
    if (!l.fechaAsignacion) return false;
    const f = new Date(l.fechaAsignacion);
    if (d && f < d) return false;
    if (h && f > h) return false;
    return true;
  });
}

// Tarjetas de resumen (highlights). 4 segun rol, respetando rango de fechas.
app.get('/api/highlights', (req, res) => {
  let leads = db.prepare('SELECT * FROM leads WHERE COALESCE(archivado,0) = 0').all();
  const verTodo = veTodo(req.user);
  if (!verTodo) leads = leads.filter(l => l.asesor === req.user.nombre);
  // Sin asignar se cuenta antes de aplicar el filtro de asesor (solo admin/jefa)
  const sinAsignarTotal = verTodo ? leads.filter(l => !l.asesor).length : 0;
  // El resto de tarjetas respeta el rango de fecha de asignacion
  const enRango = filtrarPorAsignacion(leads.filter(l => l.asesor), req.query.desde, req.query.hasta)
    .map(leadConsolidado);

  const ahora = new Date();
  const hoyStr = ahora.toISOString().slice(0, 10);
  const finHoy = new Date(hoyStr + 'T23:59:59');

  const vivos = enRango.filter(l => l.etapa !== 'Cerrado ganado' && l.etapa !== 'Cerrado perdido');
  const vencidos = vivos.filter(l => l.fechaProxAccion && new Date(l.fechaProxAccion) < ahora).length;
  const paraHoy = vivos.filter(l => l.fechaProxAccion &&
    new Date(l.fechaProxAccion) >= ahora && new Date(l.fechaProxAccion) <= finHoy).length;
  const ganados = enRango.filter(l => l.etapa === 'Cerrado ganado').length;

  // Tasa de avance: % de leads que pasaron de 3x5 a contactado o mas (solo GP)
  const totalConGestion = enRango.filter(l => l.etapa !== 'Contactabilidad 3x5').length;
  const tasaAvance = enRango.length ? Math.round(totalConGestion / enRango.length * 100) : 0;

  if (verTodo) {
    res.json([
      { clave: 'vencidos', etiqueta: 'Vencidos', valor: vencidos, tono: 'rojo', ico: 'reloj', sub: 'Requieren atención' },
      { clave: 'hoy', etiqueta: 'Para hoy', valor: paraHoy, tono: 'azul', ico: 'cal', sub: 'Acciones programadas' },
      { clave: 'sinasignar', etiqueta: 'Sin asignar', valor: sinAsignarTotal, tono: 'naranja', ico: 'user', sub: 'Por distribuir' },
      { clave: 'ganados', etiqueta: 'Ganados', valor: ganados, tono: 'verde', ico: 'trofeo', sub: 'Cierres del día' }
    ]);
  } else {
    res.json([
      { clave: 'vencidos', etiqueta: 'Vencidos', valor: vencidos, tono: 'rojo', ico: 'reloj', sub: 'Requieren atención' },
      { clave: 'hoy', etiqueta: 'Para hoy', valor: paraHoy, tono: 'azul', ico: 'cal', sub: 'Acciones programadas' },
      { clave: 'avance', etiqueta: 'Avance del día', valor: tasaAvance + '%', tono: 'morado', ico: 'grafico', sub: 'Leads avanzados' },
      { clave: 'ganados', etiqueta: 'Ganados', valor: ganados, tono: 'verde', ico: 'trofeo', sub: 'Cierres del día' }
    ]);
  }
});

// Distribucion para el pie del Kanban: monto agrupado por etapa, GP o prioridad.
app.get('/api/distribucion', (req, res) => {
  let leads = db.prepare('SELECT * FROM leads WHERE COALESCE(archivado,0) = 0').all();
  if (!veTodo(req.user)) leads = leads.filter(l => l.asesor === req.user.nombre);
  else if (req.query.asesor) leads = leads.filter(l => l.asesor === req.query.asesor);
  leads = filtrarPorAsignacion(leads.filter(l => l.asesor), req.query.desde, req.query.hasta);
  let lista = leads.map(leadConsolidado);

  // Filtro opcional por columna kanban (etapa)
  const filtroCol = req.query.etapa;
  if (filtroCol) {
    const col = L.KANBAN_COLUMNAS.find(c => c.id === filtroCol);
    if (col) lista = lista.filter(l => col.etapas.includes(l.etapa));
  }

  const verPor = req.query.verPor || 'etapa';
  const grupos = {};
  const orden = [];
  lista.forEach(l => {
    let clave;
    if (verPor === 'gp') clave = l.asesor || 'Sin asignar';
    else if (verPor === 'prioridad') clave = l.prioridad || 'Baja';
    else { // etapa -> nombre de columna kanban
      const col = L.KANBAN_COLUMNAS.find(c => c.etapas.includes(l.etapa));
      clave = col ? col.titulo : l.etapa;
    }
    if (!grupos[clave]) { grupos[clave] = { clave, monto: 0, cantidad: 0 }; orden.push(clave); }
    grupos[clave].monto += (l.montoReal || 0);
    grupos[clave].cantidad += 1;
  });
  const items = orden.map(k => grupos[k]);
  const totalMonto = items.reduce((s, i) => s + i.monto, 0);
  const totalLeads = items.reduce((s, i) => s + i.cantidad, 0);
  res.json({ items, totalMonto, totalLeads });
});

app.get('/api/leads', (req, res) => {
  let leads = db.prepare('SELECT * FROM leads WHERE COALESCE(archivado,0) = 0').all();
  if (!veTodo(req.user)) {
    leads = leads.filter(l => l.asesor === req.user.nombre);
  } else {
    if (req.query.filtro === 'sin-asignar') leads = leads.filter(l => !l.asesor);
    else if (req.query.asesor) leads = leads.filter(l => l.asesor === req.query.asesor);
  }
  // Filtro por rango de fecha de ASIGNACION (desde / hasta, formato YYYY-MM-DD)
  leads = filtrarPorAsignacion(leads, req.query.desde, req.query.hasta);
  let lista = leads.map(leadConsolidado);
  if (req.query.activos !== '0') {
    lista = lista.filter(l => l.etapa !== 'Cerrado ganado' && l.etapa !== 'Cerrado perdido');
  }
  lista.sort((a, b) =>
    (a.ordenSort - b.ordenSort) ||
    (new Date(a.fechaProxAccion || '9999') - new Date(b.fechaProxAccion || '9999'))
  );
  res.json(lista);
});

app.get('/api/leads/:codigo', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE codigo = ?').get(req.params.codigo);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
  if (!veTodo(req.user) && lead.asesor !== req.user.nombre) {
    return res.status(403).json({ error: 'Este lead no esta asignado a ti' });
  }
  res.json(leadConsolidado(lead));
});

// Resultados permitidos segun la etapa actual del lead (agrupados)
app.get('/api/leads/:codigo/resultados-permitidos', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE codigo = ?').get(req.params.codigo);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
  const c = leadConsolidado(lead);
  res.json({
    etapa: c.etapa,
    yaCalificado: !!(c.ticket || c.tiempo || c.nivelInteres || c.experiencia),
    grupos: L.obtenerResultadosPermitidos(c.etapa)
  });
});

// ---------- Gestiones ----------
app.post('/api/gestiones', (req, res) => {
  const g = req.body;
  const lead = db.prepare('SELECT * FROM leads WHERE codigo = ?').get(g.codigo);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

  if (!veTodo(req.user)) {
    if (lead.asesor !== req.user.nombre) {
      return res.status(403).json({ error: `Este lead esta asignado a ${lead.asesor || 'nadie'}.` });
    }
    g.asesor = req.user.nombre;
  } else {
    // Admin o Jefa gestionan como apoyo: el lead sigue atribuido a su GP duena.
    g.asesor = lead.asesor;
  }
  if (!g.asesor) return res.status(422).json({ error: 'El lead no tiene asesor asignado. Asignalo primero.' });

  // yaCalificado: si el lead ya tiene calificacion previa, no re-exigir factores en "Agendo reunion".
  const estadoActual = leadConsolidado(lead);
  g.yaCalificado = !!(estadoActual.ticket || estadoActual.tiempo || estadoActual.nivelInteres || estadoActual.experiencia);

  const validacion = L.validarGestion(g);
  if (validacion !== 'OK') return res.status(422).json({ error: validacion });

  // #13 Anti-registro masivo: maximo de gestiones por asesor en la ultima hora.
  const LIMITE_HORA = 12;
  const haceUnaHora = new Date(Date.now() - 3600 * 1000).toISOString();
  const enUltimaHora = db.prepare(
    'SELECT COUNT(*) AS c FROM gestiones WHERE asesor = ? AND fecha >= ?'
  ).get(g.asesor, haceUnaHora).c;
  if (enUltimaHora >= LIMITE_HORA) {
    return res.status(422).json({ error: `Demasiadas gestiones en poco tiempo (${LIMITE_HORA}/hora). Revisa y reintenta en unos minutos.` });
  }

  let fechaProx = g.fechaProxAccion || null;
  if (!fechaProx && g.proximaAccion) {
    const auto = L.autocalcularFechaProxAccion(g.proximaAccion, g.fechaReunion || null);
    fechaProx = auto ? auto.toISOString() : null;
  }

  db.prepare(`INSERT INTO gestiones
    (codigo,fecha,asesor,canal,resultado,grupoLimpio,proximaAccion,comentario,fechaProxAccion,
     ticket,tiempo,nivelInteres,experiencia,objecion,fechaReunion,tipoReunion,estadoReunion,closer,motivoPerdida)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      g.codigo, new Date().toISOString(), g.asesor, g.canal, g.resultado,
      L.grupoLimpio(g.resultado), g.proximaAccion || null, g.comentario || null, fechaProx,
      g.ticket || null, g.tiempo || null, g.nivelInteres || null, g.experiencia || null,
      g.objecion || null, g.fechaReunion || null, g.tipoReunion || null,
      g.estadoReunion || null, g.closer || null, g.motivoPerdida || null
    );

  // Fecha estimada de cierre: se guarda en el lead (proyeccion). null la limpia.
  if (g.fechaCierreEstimada !== undefined) {
    db.prepare('UPDATE leads SET fechaCierreEstimada = ? WHERE codigo = ?')
      .run(g.fechaCierreEstimada || null, g.codigo);
  }

  res.json(leadConsolidado(lead));
});

// ---------- Trazabilidad ----------
app.get('/api/leads/:codigo/trazabilidad', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE codigo = ?').get(req.params.codigo);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
  if (!veTodo(req.user) && lead.asesor !== req.user.nombre) {
    return res.status(403).json({ error: 'Este lead no esta asignado a ti' });
  }
  const gestiones = gestionesDeLead(lead.codigo);
  const cons = leadConsolidado(lead);
  const llamadas = db.prepare('SELECT * FROM llamadas WHERE codigo = ? ORDER BY fecha ASC').all(lead.codigo);

  // --- Timeline: construir eventos cronologicos con score/prob progresivos ---
  const eventos = [];
  // Evento: lead creado
  eventos.push({
    tipo: 'creado', fecha: lead.fechaAsignacion || lead.fechaCarga,
    titulo: 'Ingreso de lead', sub: lead.asesor ? 'Asignado a ' + lead.asesor : 'Sin asignar',
    actor: 'Sistema', badge: 'Nuevo', badgeColor: 'verde'
  });
  // Para score/prob progresivo: recalculamos el consolidado acumulando gestiones.
  let scorePrev = 0, etapaPrev = 'Contactabilidad 3x5', probPrev = L.calcularProbabilidad({ etapa: 'Contactabilidad 3x5', score: 0, intentos: 0 });
  let proxAccionPrev = null; // fecha de la proxima accion que dejo la gestion anterior
  gestiones.forEach((g, i) => {
    const parcial = leadConsolidado(lead, gestiones.slice(0, i + 1));
    const grupo = L.grupoLimpio(g.resultado);
    const subio = parcial.etapa !== etapaPrev;
    // ¿Esta gestion atendio una accion que ya estaba vencida?
    let tardanza = null;
    if (proxAccionPrev) {
      const desfaseMs = new Date(g.fecha) - new Date(proxAccionPrev);
      if (desfaseMs > 6 * 3600 * 1000) tardanza = textoDesfase(desfaseMs); // > 6h se considera tarde
    }
    eventos.push({
      tipo: 'gestion', fecha: g.fecha,
      titulo: tituloResultado(g.resultado), sub: g.comentario || subtituloResultado(g.resultado, g),
      actor: g.asesor || lead.asesor || '', canal: g.canal,
      score: parcial.score, probabilidad: parcial.probabilidad,
      sinContacto: grupo === 'No_respondio',
      intentoNum: grupo === 'No_respondio' ? eventos.filter(e => e.sinContacto).length + 1 : null,
      tardanza
    });
    // Si hubo cambio de etapa, insertar evento de sistema
    if (subio) {
      eventos.push({
        tipo: 'cambio', fecha: g.fecha,
        titulo: 'Pasó a ' + trEtapaServer(parcial.etapa),
        sub: parcial.score > scorePrev && parcial.etapa === 'Calificado - pendiente agendar'
          ? 'Se completaron las 4 variables del score.' : 'Avance de etapa.',
        actor: 'Sistema', evoEtapa: [trEtapaServer(etapaPrev), trEtapaServer(parcial.etapa)]
      });
    }
    scorePrev = parcial.score; etapaPrev = parcial.etapa; probPrev = parcial.probabilidad;
    proxAccionPrev = g.fechaProxAccion || null;
  });
  // Evento: proxima accion pendiente (si hay)
  if (cons.proximaAccion && cons.fechaProxAccion) {
    const venc = new Date(cons.fechaProxAccion) < new Date();
    eventos.push({
      tipo: 'proxima', fecha: cons.fechaProxAccion,
      titulo: trAccionServer(cons.proximaAccion, cons.etapa),
      sub: venc ? 'Acción vencida' : 'Pendiente',
      actor: lead.asesor || '', badge: venc ? 'Vencido' : 'Pendiente', badgeColor: venc ? 'rojo' : 'naranja',
      futuro: true
    });
  }
  // Llamadas Aircall como eventos
  llamadas.forEach(ll => {
    eventos.push({
      tipo: 'llamada', fecha: ll.fecha,
      titulo: 'Llamada ' + ll.direccion, sub: (ll.contestada ? 'Contestada' : 'No contestada') +
        (ll.duracion ? ' · ' + Math.floor(ll.duracion/60) + ':' + String(ll.duracion%60).padStart(2,'0') : ''),
      actor: ll.agente || ''
    });
  });
  // Ordenar: futuros primero (arriba), luego por fecha desc
  eventos.sort((a, b) => {
    if (a.futuro && !b.futuro) return -1;
    if (!a.futuro && b.futuro) return 1;
    return new Date(b.fecha) - new Date(a.fecha);
  });

  // --- Evolucion (primer score/prob/etapa -> actual) ---
  const primeraGest = gestiones[0];
  const evoInicial = primeraGest ? leadConsolidado(lead, [primeraGest]) : { score: 0, probabilidad: probPrev, etapa: 'Contactabilidad 3x5' };

  // --- Calificacion actual con puntos ---
  const ptsTicket = { 'S/ 200,000 a mas': 30, 'S/ 100,000 - 199,999': 25, 'S/ 50,000 - 99,999': 20, 'S/ 10,000 - 49,999': 10 };
  const ptsInteres = { 'Muy interesado': 30, 'Interesado': 20, 'Solo averigua': 10, 'Poco interes': 5 };
  const ptsTiempo = { '0 a 7 dias': 20, '8 a 15 dias': 15, '16 a 30 dias': 10, '> 30 dias': 5 };
  const ptsAvance = { 'Decide solo': 20, 'Decide acompanado': 15, 'Debe consultar': 10, 'No avanza': 5 };
  const av = cons.avance || cons.experiencia;
  const calificacion = [
    { ico: '$', etiqueta: 'Monto', valor: cons.ticket, pts: ptsTicket[cons.ticket] || 0 },
    { ico: '♥', etiqueta: 'Interés', valor: cons.nivelInteres, pts: ptsInteres[cons.nivelInteres] || 0 },
    { ico: '◷', etiqueta: 'Plazo', valor: cons.tiempo, pts: ptsTiempo[cons.tiempo] || 0 },
    { ico: '👤', etiqueta: 'Avance', valor: av, pts: ptsAvance[av] || 0 }
  ];

  const intentosContacto = gestiones.filter(g => L.grupoLimpio(g.resultado) === 'No_respondio').length;
  const contactado = gestiones.some(g => !['No_respondio'].includes(L.grupoLimpio(g.resultado)) && g.resultado !== 'Sin gestion');

  res.json({
    codigo: lead.codigo, nombre: lead.nombre, telefono: lead.telefono,
    etapa: cons.etapa, etapaVisible: trEtapaServer(cons.etapa),
    prioridad: cons.prioridad, score: cons.score, probabilidad: cons.probabilidad,
    asesor: lead.asesor,
    resumen: {
      ultimaGestion: cons.ultimaGestion, ultimoResultado: cons.ultimoResultado,
      proximaAccion: cons.proximaAccion ? trAccionServer(cons.proximaAccion, cons.etapa) : null,
      fechaProxAccion: cons.fechaProxAccion,
      intentos: intentosContacto, contactado,
      monto: cons.montoReal || cons.montoPotencial, ticket: cons.ticket
    },
    estadoActual: {
      etapa: trEtapaServer(cons.etapa), prioridad: cons.prioridad,
      probabilidad: cons.probabilidad, proximaAccion: cons.proximaAccion ? trAccionServer(cons.proximaAccion, cons.etapa) : '—'
    },
    evolucion: {
      etapa: [trEtapaServer(evoInicial.etapa), trEtapaServer(cons.etapa)],
      score: [evoInicial.score, cons.score],
      probabilidad: [evoInicial.probabilidad, cons.probabilidad]
    },
    calificacion,
    eventos
  });
});

// Helpers de presentacion en el server (espejo de los del front)
function trEtapaServer(e) {
  const m = {
    'Contactabilidad 3x5': 'Por contactar', 'Contactado - por calificar': 'Contactado',
    'Calificado - pendiente agendar': 'Calificado', 'Agendado - pendiente reunion': 'Agendado',
    'Reunion efectiva - seguimiento': 'Reunión efectiva', 'Cierre pendiente': 'Negociación',
    'Cerrado ganado': 'Ganado', 'Cerrado perdido': 'Perdido'
  };
  return m[e] || e;
}
function trAccionServer(a, etapa) {
  if (a === 'Llamar intento 3x5' && etapa && etapa !== 'Contactabilidad 3x5') return 'Llamar';
  const m = { 'Llamar intento 3x5': 'Llamar intento 3x5', 'Agendar reunion': 'Agendar reunión',
    'Confirmar asistencia': 'Confirmar asistencia', 'Enviar informacion': 'Enviar información',
    'Seguimiento post reunion': 'Seguimiento', 'Reprogramar reunion': 'Reprogramar', 'Desestimar': 'Desestimar',
    'Enviar propuesta': 'Enviar propuesta', 'Cerrar venta': 'Cerrar venta' };
  return m[a] || a;
}
function tituloResultado(r) {
  const m = {
    'No contesto': 'No contestó', 'Buzon / apagado': 'Buzón / apagado',
    'WhatsApp enviado sin respuesta': 'WhatsApp sin respuesta',
    'Respondio - no pudo hablar': 'Respondió · no pudo hablar',
    'Respondio - sin calificar': 'Respondió · sin calificar',
    'Respondio - calificado': 'Respondió · calificado',
    'Evaluando': 'Evaluando',
    'En negociacion': 'En negociación',
    'Desistio': 'Desistió',
    'Respondio - pidio informacion': 'Respondió · pidió información',
    'Respondio - interesado': 'Respondió · interesado',
    'Respondio - no interesado': 'Respondió · no interesado',
    'Respondio - no califica': 'Respondió · no califica',
    'Agendo reunion': 'Agendó reunión', 'Confirmo reunion': 'Confirmó reunión',
    'Reunion efectiva': 'Reunión efectiva', 'Venta ganada': 'Venta ganada'
  };
  return m[r] || r;
}
function subtituloResultado(r, g) {
  if (L.grupoLimpio(r) === 'No_respondio') return 'Intento de contacto.';
  return '';
}
// Texto legible del desfase de una gestion tardia
function textoDesfase(ms) {
  const horas = Math.round(ms / 3600000);
  if (horas < 24) return 'Gestionado ' + horas + 'h tarde';
  const dias = Math.round(horas / 24);
  return 'Gestionado ' + dias + (dias === 1 ? ' día tarde' : ' días tarde');
}

// ---------- Archivar / Restaurar / Eliminar (solo admin) ----------
// Archivar: borrado logico, sale de la vista pero queda en BD.
app.put('/api/leads/:codigo/archivar', soloAdmin, (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE codigo = ?').get(req.params.codigo);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
  db.prepare('UPDATE leads SET archivado = 1 WHERE codigo = ?').run(req.params.codigo);
  auditar(req, 'archivar', req.params.codigo, lead.nombre);
  res.json({ ok: true });
});

app.put('/api/leads/:codigo/restaurar', soloAdmin, (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE codigo = ?').get(req.params.codigo);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
  db.prepare('UPDATE leads SET archivado = 0 WHERE codigo = ?').run(req.params.codigo);
  auditar(req, 'restaurar', req.params.codigo, lead.nombre);
  res.json({ ok: true });
});

// Eliminar definitivo: borra el lead y todas sus gestiones. Irreversible.
app.delete('/api/leads/:codigo', soloAdmin, (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE codigo = ?').get(req.params.codigo);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
  const ng = db.prepare('SELECT COUNT(*) AS c FROM gestiones WHERE codigo = ?').get(req.params.codigo).c;
  db.prepare('DELETE FROM gestiones WHERE codigo = ?').run(req.params.codigo);
  db.prepare('DELETE FROM leads WHERE codigo = ?').run(req.params.codigo);
  auditar(req, 'eliminar definitivo', req.params.codigo, `${lead.nombre} (${ng} gestiones borradas)`);
  res.json({ ok: true });
});

// Listar archivados (solo admin)
app.get('/api/leads-archivados', soloAdmin, (req, res) => {
  const leads = db.prepare('SELECT * FROM leads WHERE archivado = 1').all().map(leadConsolidado);
  res.json(leads);
});

// Registro de auditoria (solo admin), filtrable por usuario/accion/fecha
app.get('/api/auditoria', soloAdmin, (req, res) => {
  let filas = db.prepare('SELECT * FROM auditoria ORDER BY fecha DESC LIMIT 1000').all();
  if (req.query.usuario) filas = filas.filter(f => f.usuario === req.query.usuario);
  if (req.query.accion) filas = filas.filter(f => f.accion === req.query.accion);
  res.json(filas);
});

// Backup: descarga el archivo de base de datos completo (solo admin).
app.get('/api/backup', soloAdmin, (req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: 'Base no encontrada' });
  const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  auditar(req, 'descargar backup', '-', 'backup manual');
  res.download(DB_PATH, `crm-backup-${fecha}.db`);
});

// Analisis de cohortes (solo admin): leads agrupados por mes de asignacion
app.get('/api/cohortes', soloAdmin, (req, res) => {
  const leads = db.prepare('SELECT * FROM leads WHERE COALESCE(archivado,0) = 0').all();
  const registros = leads.map(lead => {
    const gestiones = gestionesDeLead(lead.codigo);
    return { lead, gestiones, consolidado: L.consolidarLead(lead, gestiones) };
  });
  res.json(L.analizarCohortes(registros));
});

// ---------- Dashboard ----------
app.get('/api/dashboard', (req, res) => {
  let leads = db.prepare('SELECT * FROM leads WHERE COALESCE(archivado,0) = 0').all();
  if (!veTodo(req.user)) leads = leads.filter(l => l.asesor === req.user.nombre);
  leads = leads.map(leadConsolidado);

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const man = new Date(hoy); man.setDate(man.getDate() + 1);
  let deHoy = db.prepare('SELECT * FROM gestiones WHERE fecha >= ? AND fecha < ?')
    .all(hoy.toISOString(), man.toISOString());
  if (!veTodo(req.user)) deHoy = deHoy.filter(g => g.asesor === req.user.nombre);
  const unicos = arr => [...new Set(arr.filter(Boolean))];
  const ahoraTs = new Date();
  const monto = l => (l.montoReal || l.pipelineEstimado || 0);
  const esCerrado = e => e === 'Cerrado ganado' || e === 'Cerrado perdido';
  const activos = leads.filter(l => !esCerrado(l.etapa));

  // --- Embudo: 5 etapas activas con prob.prom y pipeline ponderado ---
  const etapasEmbudo = [
    'Contactabilidad 3x5', 'Calificado - pendiente agendar',
    'Agendado - pendiente reunion', 'Reunion efectiva - seguimiento', 'Cierre pendiente'
  ];
  // Nota: Contactado se une visualmente con Por contactar para el embudo comercial
  const embudo = etapasEmbudo.map(et => {
    let rows;
    if (et === 'Contactabilidad 3x5') rows = leads.filter(l => l.etapa === 'Contactabilidad 3x5' || l.etapa === 'Contactado - por calificar');
    else rows = leads.filter(l => l.etapa === et);
    const total = rows.reduce((s, l) => s + monto(l), 0);
    const ponderado = rows.reduce((s, l) => s + monto(l) * (l.probabilidad || 0) / 100, 0);
    const probProm = rows.length ? Math.round(rows.reduce((s, l) => s + (l.probabilidad || 0), 0) / rows.length) : 0;
    return { etapa: et, cantidad: rows.length, monto: total, ponderado: Math.round(ponderado), probProm };
  });

  // --- Pipeline global ---
  const pipelineTotal = activos.reduce((s, l) => s + monto(l), 0);
  const pipelinePonderado = Math.round(activos.reduce((s, l) => s + monto(l) * (l.probabilidad || 0) / 100, 0));
  const conMonto = activos.filter(l => monto(l) > 0);
  const ticketProm = conMonto.length ? Math.round(pipelineTotal / conMonto.length) : 0;

  // --- Salud del dia ---
  const vencidosTot = activos.filter(l => l.fechaProxAccion && new Date(l.fechaProxAccion) < ahoraTs).length;
  const gestionadosHoy = unicos(deHoy.map(g => g.codigo)).length;
  const agendadosHoy = unicos(deHoy.filter(g => g.grupoLimpio === 'Agendo_reunion').map(g => g.codigo)).length;
  const ganadosHoy = unicos(deHoy.filter(g => g.grupoLimpio === 'Ganado' || g.resultado === 'Venta ganada').map(g => g.codigo)).length;
  const porContactar = leads.filter(l => l.etapa === 'Contactabilidad 3x5').length;
  const enNegociacion = leads.filter(l => l.etapa === 'Cierre pendiente').length;

  // --- Alertas operativas ---
  const alertas = [];
  if (vencidosTot > 0) alertas.push({ nivel: 'Alto', color: 'rojo', titulo: vencidosTot + (vencidosTot === 1 ? ' acción vencida' : ' acciones vencidas'), sub: 'Requieren atención inmediata', cola: 'vencidos' });
  if (porContactar > 0) alertas.push({ nivel: 'Medio', color: 'naranja', titulo: porContactar + ' leads por contactar', sub: 'Leads nuevos sin gestionar', cola: 'porcontactar' });
  const reunion24 = activos.filter(l => l.fechaReunion && new Date(l.fechaReunion) <= new Date(ahoraTs.getTime() + 24*3600*1000) && new Date(l.fechaReunion) >= ahoraTs).length;
  alertas.push({ nivel: 'Info', color: 'azul', titulo: reunion24 + (reunion24 === 1 ? ' reunión en próximas 24h' : ' reuniones en próximas 24h'), sub: 'Requiere preparación y confirmación', cola: 'reunion' });
  alertas.push({ nivel: 'Ok', color: 'verde', titulo: enNegociacion + ' cierres pendientes', sub: enNegociacion > 0 ? 'En etapa de negociación' : 'Sin cierres próximos', cola: 'negociacion' });

  // --- Productividad por GP ---
  const asesoresVisibles = veTodo(req.user) ? L.ASESORES : [req.user.nombre];
  const porAsesor = asesoresVisibles.map(a => {
    const rows = deHoy.filter(g => g.asesor === a);
    const susLeads = leads.filter(l => l.asesor === a);
    const susActivos = susLeads.filter(l => !esCerrado(l.etapa));
    const vencidos = susActivos.filter(l => l.fechaProxAccion && new Date(l.fechaProxAccion) < ahoraTs).length;
    const gestHoy = unicos(rows.map(g => g.codigo)).length;
    const agend = unicos(rows.filter(g => g.grupoLimpio === 'Agendo_reunion').map(g => g.codigo)).length;
    const gan = susLeads.filter(l => l.etapa === 'Cerrado ganado').length;
    // Cumplimiento: gestionados hoy / meta diaria (asumimos meta 3 por activo, tope visual)
    const meta = Math.max(1, Math.min(susActivos.length, 10));
    const cumpl = Math.min(100, Math.round((gestHoy / meta) * 100));
    const estado = vencidos > 2 ? 'En riesgo' : (vencidos > 0 ? 'Atención' : 'Al día');
    return { asesor: a, activos: susActivos.length, gestHoy, vencidos, agendados: agend, ganados: gan, cumplimiento: cumpl, estado };
  });

  // --- Forecast: leads con fecha estimada de cierre (proyeccion de ingresos) ---
  const conCierre = activos.filter(l => l.fechaCierreEstimada);
  const fcItems = conCierre.map(l => ({
    nombre: l.nombre, etapa: l.etapa, fecha: l.fechaCierreEstimada, monto: monto(l)
  })).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const fcTotal = fcItems.reduce((s, i) => s + i.monto, 0);
  // Agrupar por periodo: Esta semana / Próx. semana / Este mes / Más adelante
  const hoyD = new Date(); hoyD.setHours(0, 0, 0, 0);
  const finSemana = new Date(hoyD); finSemana.setDate(finSemana.getDate() + (7 - hoyD.getDay()));
  const finProxSem = new Date(finSemana); finProxSem.setDate(finProxSem.getDate() + 7);
  const finMes = new Date(hoyD.getFullYear(), hoyD.getMonth() + 1, 0, 23, 59, 59);
  const periodosDef = [
    { etiqueta: 'Esta semana', test: f => f <= finSemana },
    { etiqueta: 'Próxima semana', test: f => f > finSemana && f <= finProxSem },
    { etiqueta: 'Resto del mes', test: f => f > finProxSem && f <= finMes },
    { etiqueta: 'Más adelante', test: f => f > finMes }
  ];
  const fcPeriodos = periodosDef.map(p => {
    const items = fcItems.filter(i => p.test(new Date(i.fecha)));
    return { etiqueta: p.etiqueta, monto: items.reduce((s, i) => s + i.monto, 0), cantidad: items.length };
  }).filter(p => p.cantidad > 0);

  res.json({
    salud: {
      leadsActivos: activos.length, vencidos: vencidosTot, gestionadosHoy,
      agendadosHoy, ganados: ganadosHoy, pipelinePonderado
    },
    embudo, pipelineTotal, pipelinePonderado, ticketProm,
    alertas, porAsesor,
    forecast: { total: fcTotal, items: fcItems, periodos: fcPeriodos },
    totalActivos: activos.length
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CRM Tasatop Web v1.44 (volume + db_path) corriendo en puerto ${PORT}`));
