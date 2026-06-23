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
  CREATE TABLE IF NOT EXISTS login_intentos (
    clave TEXT PRIMARY KEY,
    usuario TEXT,
    fallos INTEGER DEFAULT 0,
    primer_fallo TEXT,
    bloqueado_hasta TEXT
  );
  CREATE TABLE IF NOT EXISTS transiciones_etapa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL,
    etapa_origen TEXT,
    etapa_destino TEXT NOT NULL,
    fecha TEXT NOT NULL,
    asesor TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_trans_codigo ON transiciones_etapa(codigo);
  CREATE TABLE IF NOT EXISTS metas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asesor TEXT NOT NULL,
    ambito TEXT NOT NULL,
    periodo TEXT NOT NULL,
    metrica TEXT NOT NULL,
    valor REAL NOT NULL,
    UNIQUE(asesor, ambito, periodo, metrica)
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
  CREATE TABLE IF NOT EXISTS chat_actividad (
    codigo TEXT NOT NULL,
    dia TEXT NOT NULL,
    entrantes INTEGER DEFAULT 0,
    salientes INTEGER DEFAULT 0,
    ultimo TEXT,
    PRIMARY KEY (codigo, dia)
  );
`);
// Migracion suave para bases creadas con v1.0
try { db.exec('ALTER TABLE leads ADD COLUMN montoPotencial TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE leads ADD COLUMN montoReal INTEGER'); } catch (e) {}
try { db.exec('ALTER TABLE leads ADD COLUMN montoRango TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE leads ADD COLUMN archivado INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE leads ADD COLUMN fechaCierreEstimada TEXT'); } catch (e) {}
// v1.45: 5a variable de calificacion (experiencia invirtiendo) + 5 variables de cierre (negociacion)
try { db.exec('ALTER TABLE gestiones ADD COLUMN experienciaInv TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE gestiones ADD COLUMN cFondos TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE gestiones ADD COLUMN cMonto TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE gestiones ADD COLUMN cCriterio TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE gestiones ADD COLUMN cCompetencia TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE gestiones ADD COLUMN cProximoPaso TEXT'); } catch (e) {}
// v1.46: monto numerico ingresado en la gestion (1a calif o negociacion) + prioriza/plazo
try { db.exec('ALTER TABLE gestiones ADD COLUMN montoGestion INTEGER'); } catch (e) {}
try { db.exec('ALTER TABLE gestiones ADD COLUMN noDefineMonto INTEGER'); } catch (e) {}
try { db.exec('ALTER TABLE gestiones ADD COLUMN cPrioriza TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE gestiones ADD COLUMN cPlazo TEXT'); } catch (e) {}
// v1.49 (fase 2): bandeja de leads brutos de marketing. Guarda TODO lo que llega,
// nada se pierde, con raw_json completo para reprocesar.
db.exec(`
  CREATE TABLE IF NOT EXISTS marketing_ingresos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fechaRecepcion TEXT NOT NULL,
    origen TEXT NOT NULL,
    estado TEXT NOT NULL,
    nombreRecibido TEXT,
    telefonoRecibido TEXT,
    telefonoNormalizado TEXT,
    emailRecibido TEXT,
    fuente TEXT,
    campana TEXT,
    formulario TEXT,
    campaignId TEXT,
    adsetId TEXT,
    adId TEXT,
    leadIdExterno TEXT,
    utmSource TEXT,
    utmMedium TEXT,
    utmCampaign TEXT,
    utmContent TEXT,
    montoRecibido TEXT,
    codigoLead TEXT,
    mensajeError TEXT,
    rawJson TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_mktg_estado ON marketing_ingresos(estado);
  CREATE INDEX IF NOT EXISTS idx_mktg_tel ON marketing_ingresos(telefonoNormalizado);
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS marketing_historial (
    telefono TEXT PRIMARY KEY,
    nombre TEXT,
    fechaRegistro TEXT,
    origen TEXT,
    campana TEXT,
    creado TEXT
  );
`);
// Columnas extra para que el historial sea "Base de Releads" (idempotente).
['email TEXT', 'montoReal INTEGER', 'montoRango TEXT', 'fechaISO TEXT',
 "estado TEXT DEFAULT 'pendiente'", 'codigoLead TEXT', 'asignadoA TEXT', 'fechaAsignado TEXT'
].forEach(col => { try { db.exec(`ALTER TABLE marketing_historial ADD COLUMN ${col}`); } catch (e) { /* ya existe */ } });
db.exec('CREATE INDEX IF NOT EXISTS idx_hist_estado ON marketing_historial(estado);');
db.exec('CREATE INDEX IF NOT EXISTS idx_hist_fechaiso ON marketing_historial(fechaISO);');
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
// Alta idempotente de GP nuevas (no recrea ni pisa las existentes).
crearUsuario('dbarreto@tasatop.com', 'Dora Barreto', 'gestora', '12345678');

// Columna para el interruptor de auto-asignacion (1 = recibe leads automaticos).
try { db.exec('ALTER TABLE usuarios ADD COLUMN autoasignar INTEGER DEFAULT 1'); } catch (e) { /* ya existe */ }
// Estado del round-robin (clave/valor).
db.exec("CREATE TABLE IF NOT EXISTS app_config (clave TEXT PRIMARY KEY, valor TEXT);");

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

// Control de intentos de login: 5 fallos -> bloqueo 15 min (por usuario+IP).
const LOGIN_MAX_FALLOS = 5;
const LOGIN_BLOQUEO_MS = 15 * 60 * 1000;
function ipDe(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'desconocida';
}

// Healthcheck para Railway: responde 200 apenas el servidor esta arriba.
// Configurar en Railway -> Settings -> Healthcheck Path: /health
app.get('/health', (req, res) => res.status(200).json({ ok: true, uptime: Math.round(process.uptime()) }));

app.post('/api/login', (req, res) => {
  const { usuario, clave } = req.body || {};
  const userLower = String(usuario || '').toLowerCase();
  const claveCtrl = userLower + '|' + ipDe(req);
  const ahora = Date.now();

  // ¿Esta bloqueado?
  const ctrl = db.prepare('SELECT * FROM login_intentos WHERE clave = ?').get(claveCtrl);
  if (ctrl && ctrl.bloqueado_hasta && new Date(ctrl.bloqueado_hasta).getTime() > ahora) {
    const min = Math.ceil((new Date(ctrl.bloqueado_hasta).getTime() - ahora) / 60000);
    return res.status(429).json({ error: `Demasiados intentos. Espera ${min} min e intenta de nuevo.` });
  }

  const u = db.prepare('SELECT * FROM usuarios WHERE usuario = ? AND activo = 1').get(userLower);
  if (!u || hashClave(clave || '', u.sal) !== u.hash) {
    // Cuenta el fallo. Si la ventana de 15 min expiro, reinicia el contador.
    let fallos = 1, primer = new Date(ahora).toISOString();
    if (ctrl && ctrl.primer_fallo && (ahora - new Date(ctrl.primer_fallo).getTime()) < LOGIN_BLOQUEO_MS) {
      fallos = (ctrl.fallos || 0) + 1; primer = ctrl.primer_fallo;
    }
    const bloqueo = fallos >= LOGIN_MAX_FALLOS ? new Date(ahora + LOGIN_BLOQUEO_MS).toISOString() : null;
    db.prepare(`INSERT INTO login_intentos (clave,usuario,fallos,primer_fallo,bloqueado_hasta) VALUES (?,?,?,?,?)
      ON CONFLICT(clave) DO UPDATE SET usuario=excluded.usuario, fallos=excluded.fallos, primer_fallo=excluded.primer_fallo, bloqueado_hasta=excluded.bloqueado_hasta`)
      .run(claveCtrl, userLower, fallos, primer, bloqueo);
    if (bloqueo) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 min e intenta de nuevo.' });
    return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });
  }

  // Login correcto: limpia el contador de ese usuario+IP.
  db.prepare('DELETE FROM login_intentos WHERE clave = ?').run(claveCtrl);
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sesiones (token,usuario,creada) VALUES (?,?,?)')
    .run(token, u.usuario, new Date().toISOString());
  res.setHeader('Set-Cookie', `sesion=${token}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`);
  res.json({ usuario: u.usuario, nombre: u.nombre, rol: u.rol });
});

// Desbloqueo manual por el admin (limpia los intentos de un usuario en toda IP).
app.post('/api/desbloquear-login', soloAdmin, (req, res) => {
  const objetivo = String((req.body && req.body.usuario) || '').toLowerCase();
  if (!objetivo) return res.status(400).json({ error: 'Falta el usuario' });
  const r = db.prepare('DELETE FROM login_intentos WHERE usuario = ?').run(objetivo);
  auditar(req, 'desbloquear login', objetivo, `${r.changes} registro(s)`);
  res.json({ ok: true, desbloqueado: objetivo, registros: r.changes });
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

// Middleware: toda la API (salvo login y webhooks publicos) requiere sesion.
app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  // Los webhooks de marketing se autentican por token en la URL, no por sesion.
  if (req.path.startsWith('/webhooks/leads/')) return next();
  if (req.path.startsWith('/webhooks/chatwoot/')) return next();
  const u = usuarioDeSesion(req);
  if (!u) return res.status(401).json({ error: 'Sin sesion. Inicia sesion.' });
  req.user = u;
  next();
});
function soloAdmin(req, res, next) {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  next();
}
// Limpieza de datos de prueba (solo admin): borra todo el historial de gestiones y
// transiciones, y resetea los campos derivados de gestion en los leads. Los leads
// NO se eliminan: vuelven a "Por contactar". Requiere confirmar:'BORRAR' en el body.
app.post('/api/admin/limpiar-pruebas', soloAdmin, (req, res) => {
  if (!req.body || req.body.confirmar !== 'BORRAR') return res.status(400).json({ error: 'Confirmación requerida' });
  const g = db.prepare('SELECT COUNT(*) c FROM gestiones').get().c;
  let t = 0; try { t = db.prepare('SELECT COUNT(*) c FROM transiciones_etapa').get().c; } catch (e) {}
  db.exec('DELETE FROM gestiones');
  try { db.exec('DELETE FROM transiciones_etapa'); } catch (e) {}
  const upd = db.prepare('UPDATE leads SET montoReal=NULL, fechaCierreEstimada=NULL WHERE COALESCE(archivado,0)=0').run();
  res.json({ ok: true, gestiones: g, transiciones: t, leadsReset: upd.changes });
});
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
  // Mayor correlativo del dia (no COUNT: asi no se reciclan numeros si se borran leads).
  const row = db.prepare('SELECT codigo FROM leads WHERE codigo LIKE ? ORDER BY codigo DESC LIMIT 1').get(pref + '%');
  let n = row ? (parseInt(row.codigo.slice(pref.length), 10) || 0) : 0;
  // Blindaje ante choques/concurrencia: incrementa hasta encontrar uno libre.
  const existe = db.prepare('SELECT 1 FROM leads WHERE codigo = ?');
  let codigo;
  do { n++; codigo = pref + String(n).padStart(6, '0'); } while (existe.get(codigo));
  return codigo;
}

// GPs activas y habilitadas para auto-asignacion, en orden estable.
function gpsParaAuto() {
  return db.prepare("SELECT nombre FROM usuarios WHERE rol='gestora' AND activo=1 AND COALESCE(autoasignar,1)=1 ORDER BY id")
    .all().map(r => r.nombre);
}
// Elige la siguiente GP por round-robin (rotacion equitativa). null si no hay activas.
function elegirGPRoundRobin() {
  const gps = gpsParaAuto();
  if (!gps.length) return null;
  const row = db.prepare("SELECT valor FROM app_config WHERE clave='rr_ultimo'").get();
  const idx = row ? gps.indexOf(row.valor) : -1;
  const siguiente = gps[(idx + 1) % gps.length];
  db.prepare("INSERT INTO app_config (clave,valor) VALUES ('rr_ultimo',?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor")
    .run(siguiente);
  return siguiente;
}

// El correo de una GP ES su propio usuario en la tabla usuarios.
function correoDeAsesor(nombre) {
  if (!nombre) return null;
  const u = db.prepare("SELECT usuario FROM usuarios WHERE nombre = ? AND rol='gestora'").get(nombre);
  return u ? u.usuario : null;
}
// Avisa por correo a la GP que se le asigno un lead (no bloquea la respuesta).
function notificarAsignacion(lead, asesorNombre) {
  if (!mailer.activo() || !lead || !asesorNombre) return;
  const correo = correoDeAsesor(asesorNombre);
  if (correo) mailer.correoLeadAsignado(lead, correo).catch(() => {});
}

// =============================================================
// FASE 2: RECEPCION Y PROCESAMIENTO DE LEADS DE MARKETING
// =============================================================

// Inserta el ingreso bruto en la bandeja (nada se pierde) y devuelve su id.
function guardarIngresoBruto(norm, estado, mensajeError, codigoLead) {
  const r = db.prepare(`INSERT INTO marketing_ingresos
    (fechaRecepcion,origen,estado,nombreRecibido,telefonoRecibido,telefonoNormalizado,emailRecibido,
     fuente,campana,formulario,campaignId,adsetId,adId,leadIdExterno,
     utmSource,utmMedium,utmCampaign,utmContent,montoRecibido,codigoLead,mensajeError,rawJson)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      new Date().toISOString(), norm.origen, estado,
      norm.nombre, norm.telefonoRecibido, norm.telefonoNormalizado, norm.email,
      norm.fuente, norm.campana, norm.formulario,
      norm.campaignId, norm.adsetId, norm.adId, norm.leadIdExterno,
      norm.utmSource, norm.utmMedium, norm.utmCampaign, norm.utmContent,
      norm.monto || null, codigoLead || null, mensajeError || null, norm.rawJson
    );
  return r.lastInsertRowid;
}

// Procesa un lead normalizado: aplica dedupe y crea o asocia segun corresponda.
// Devuelve { estado, codigoLead, mensajeError }.
function procesarLeadMarketing(norm, opts = {}) {
  // Incompleto: sin celular valido -> no se crea lead operativo, queda en revision.
  if (!norm.telefonoNormalizado || norm.telefonoNormalizado.length < 9) {
    return { estado: 'incompleto', mensajeError: 'Celular ausente o invalido' };
  }

  const nombreNorm = L.normalizarNombre(norm.nombre);

  // 1) Llave dura: telefono normalizado. Si coincide, es duplicado (el telefono manda).
  const existente = db.prepare('SELECT * FROM leads WHERE telefono = ?').get(norm.telefonoNormalizado);
  if (existente) {
    const cons = leadConsolidado(existente);
    // Validador: si el nombre completo NO coincide, se avisa (pero sigue siendo duplicado).
    const mismoNombre = nombreNorm && L.normalizarNombre(existente.nombre) === nombreNorm;
    const avisoNombre = (nombreNorm && !mismoNombre)
      ? `\u26a0 Mismo tel., nombre distinto (recibido: ${norm.nombre || '?'} / existente: ${existente.nombre || '?'}) \u2014 revisar`
      : null;
    const suf = avisoNombre ? ' | ' + avisoNombre : '';
    if (cons.etapa === 'Cerrado perdido') return { estado: 'duplicado_perdido', codigoLead: existente.codigo, mensajeError: 'Lead existente cerrado perdido — revision manual' + suf };
    if (cons.etapa === 'Cerrado ganado') return { estado: 'duplicado_ganado', codigoLead: existente.codigo, mensajeError: 'Lead existente ganado — revision manual' + suf };
    return { estado: 'duplicado_activo', codigoLead: existente.codigo, mensajeError: avisoNombre };
  }

  // 1b) No esta en leads activos: revisar la Base de Releads (historicos).
  //     Mismo trato que un duplicado: va a Leads Brutos para que la jefa decida.
  //     Distingue si ademas coincide el nombre (duplicado seguro) o no.
  const hist = db.prepare('SELECT * FROM marketing_historial WHERE telefono = ?').get(norm.telefonoNormalizado);
  if (hist) {
    const f = hist.fechaRegistro ? ` el ${hist.fechaRegistro}` : '';
    const og = hist.origen ? ` por ${hist.origen}` : '';
    const mismoNombreHist = nombreNorm && L.normalizarNombre(hist.nombre) === nombreNorm;
    const etiqueta = mismoNombreHist ? 'Duplicado seguro (tel. + nombre)' : 'Mismo tel., nombre distinto';
    const detalle = mismoNombreHist
      ? ` como "${hist.nombre}"`
      : ` (releads: "${hist.nombre || '?'}" / nuevo: "${norm.nombre || '?'}")`;
    return { estado: 'duplicado_historial', codigoLead: null, mensajeError: `\u26a0 ${etiqueta}: ya en releads${f}${og}${detalle} \u2014 la jefa decide` };
  }

  // 2) Sin match de telefono: validar por nombre completo normalizado (avisa, no bloquea).
  let avisoMismoNombre = null;
  if (nombreNorm) {
    const todos = db.prepare('SELECT codigo, nombre FROM leads').all();
    const gemelo = todos.find(l => L.normalizarNombre(l.nombre) === nombreNorm);
    if (gemelo) avisoMismoNombre = `\u26a0 Mismo nombre que ${gemelo.codigo} (tel. distinto) \u2014 revisar`;
  }

  // Sin nombre: no se crea automaticamente. Va a Ingresos como ALERTA para
  // que la jefa complete el nombre y cree, o descarte.
  if (!norm.nombre || !String(norm.nombre).trim()) {
    return { estado: 'sin_nombre', codigoLead: null, mensajeError: `\u26a0 Lead sin nombre (tel. ${norm.telefonoNormalizado}) \u2014 completar y crear, o descartar` };
  }

  // 2b) Sin nombre: NO se crea. Va a Ingresos como alerta para que la jefa
  //     complete el nombre y cree, o descarte. (El telefono si es valido.)
  if (!norm.nombre || !String(norm.nombre).trim()) {
    return { estado: 'sin_nombre', codigoLead: null, mensajeError: `\u26a0 Lead sin nombre (tel. ${norm.telefonoNormalizado}) \u2014 completar y crear, o descartar` };
  }

  // Sin nombre: NO se crea automaticamente. Va a Ingresos como alerta para que la
  // jefa complete el nombre y cree, o lo descarte.
  if (!norm.nombre || !String(norm.nombre).trim()) {
    return { estado: 'sin_nombre', codigoLead: null, mensajeError: `\u26a0 Lead sin nombre (tel. ${norm.telefonoNormalizado}) \u2014 completar y crear, o descartar` };
  }

  // 3) Lead nuevo: se crea operativo, en etapa inicial 3x5.
  //    Auto-asignacion round-robin: si hay GP activa, entra ya asignado (sin esperar
  //    a la jefa). Si no hay ninguna activa, queda sin asesor para asignacion manual.
  const codigo = generarCodigo();
  const ahora = new Date().toISOString();
  const monto = (norm.montoNumerico != null && isFinite(norm.montoNumerico)) ? norm.montoNumerico : null;
  const rango = monto != null ? L.montoARango(monto) : null;
  const gp = opts.sinAutoasignar ? null : elegirGPRoundRobin();
  db.prepare(`INSERT INTO leads (codigo,nombre,telefono,email,fuente,campana,asesor,montoReal,montoPotencial,montoRango,fechaCarga,fechaAsignacion)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(codigo, norm.nombre || 'Sin nombre', norm.telefonoNormalizado, norm.email || null,
         norm.fuente || null, norm.campana || null, gp || null, monto, monto, rango, ahora, gp ? ahora : null);
  if (gp) notificarAsignacion(db.prepare('SELECT * FROM leads WHERE codigo = ?').get(codigo), gp);
  return { estado: 'creado', codigoLead: codigo, mensajeError: avisoMismoNombre, asignadoA: gp || null };
}

// Webhook universal de recepcion de leads. Valida token por env MARKETING_WEBHOOK_TOKEN.
// :origen = landing | meta | tiktok | test
app.post('/api/webhooks/leads/:origen/:token', (req, res) => {
  const tokenOk = process.env.MARKETING_WEBHOOK_TOKEN && req.params.token === process.env.MARKETING_WEBHOOK_TOKEN;
  if (!tokenOk) return res.status(403).json({ error: 'Token invalido' });

  let norm;
  try {
    norm = L.normalizarLeadMarketing(req.params.origen, req.body || {});
  } catch (e) {
    // Aunque falle la normalizacion, guardamos el bruto para reprocesar.
    const bruto = { origen: String(req.params.origen||'').toLowerCase(), rawJson: JSON.stringify(req.body||{}) };
    guardarIngresoBruto({ ...bruto }, 'error_validacion', 'Error al normalizar: ' + e.message, null);
    return res.status(200).json({ ok: true, estado: 'error_validacion' });
  }

  let resultado;
  try {
    resultado = procesarLeadMarketing(norm);
  } catch (e) {
    guardarIngresoBruto(norm, 'error_validacion', 'Error al procesar: ' + e.message, null);
    return res.status(200).json({ ok: true, estado: 'error_validacion' });
  }

  const idIngreso = guardarIngresoBruto(norm, resultado.estado, resultado.mensajeError, resultado.codigoLead);
  // Respuesta 200 siempre que el token sea valido (el lead quedo guardado pase lo que pase).
  res.json({ ok: true, estado: resultado.estado, ingresoId: idIngreso, codigoLead: resultado.codigoLead || null });
});

// ---------- Administracion de ingresos de marketing (admin/jefa) ----------
function soloAdminOJefa(req, res, next) {
  const rol = req.user && req.user.rol;
  if (rol === 'admin' || rol === 'jefa') return next();
  return res.status(403).json({ error: 'No autorizado' });
}

// Lista ingresos con filtro opcional por estado.
app.get('/api/marketing/ingresos', soloAdminOJefa, (req, res) => {
  const { estado } = req.query;
  let filas;
  if (estado) filas = db.prepare('SELECT * FROM marketing_ingresos WHERE estado = ? ORDER BY id DESC LIMIT 500').all(estado);
  else filas = db.prepare('SELECT * FROM marketing_ingresos ORDER BY id DESC LIMIT 500').all();
  // Deriva el monto traducido (texto recibido -> numero + rango) para la vista.
  filas = filas.map(f => {
    const num = L.montoEtiquetaANumero(f.montoRecibido);
    return { ...f, montoNumerico: num, montoRangoCalc: num != null ? L.montoARango(num) : null };
  });
  // Resumen por estado para los contadores de la vista
  const resumen = {};
  db.prepare('SELECT estado, COUNT(*) AS c FROM marketing_ingresos GROUP BY estado').all()
    .forEach(r => { resumen[r.estado] = r.c; });
  res.json({ ingresos: filas, resumen });
});

// Detalle de un ingreso (incluye raw_json).
app.get('/api/marketing/ingresos/:id', soloAdminOJefa, (req, res) => {
  const ing = db.prepare('SELECT * FROM marketing_ingresos WHERE id = ?').get(req.params.id);
  if (!ing) return res.status(404).json({ error: 'No encontrado' });
  res.json(ing);
});

// Reprocesar: reintenta el dedupe/creacion a partir del raw_json guardado.
app.post('/api/marketing/ingresos/:id/reprocesar', soloAdminOJefa, (req, res) => {
  const ing = db.prepare('SELECT * FROM marketing_ingresos WHERE id = ?').get(req.params.id);
  if (!ing) return res.status(404).json({ error: 'No encontrado' });
  let norm;
  try { norm = L.normalizarLeadMarketing(ing.origen, JSON.parse(ing.rawJson || '{}')); }
  catch (e) { return res.status(422).json({ error: 'Raw JSON invalido: ' + e.message }); }
  const resultado = procesarLeadMarketing(norm);
  db.prepare('UPDATE marketing_ingresos SET estado=?, codigoLead=?, mensajeError=?, telefonoNormalizado=? WHERE id=?')
    .run(resultado.estado, resultado.codigoLead || null, resultado.mensajeError || null, norm.telefonoNormalizado, req.params.id);
  auditar(req, 'reprocesar ingreso marketing', ing.id, resultado.estado);
  res.json({ ok: true, estado: resultado.estado, codigoLead: resultado.codigoLead || null });
});

// Descartar un ingreso (no crea lead).
app.post('/api/marketing/ingresos/:id/descartar', soloAdminOJefa, (req, res) => {
  const ing = db.prepare('SELECT * FROM marketing_ingresos WHERE id = ?').get(req.params.id);
  if (!ing) return res.status(404).json({ error: 'No encontrado' });
  db.prepare('UPDATE marketing_ingresos SET estado=?, mensajeError=? WHERE id=?')
    .run('descartado', req.body && req.body.motivo ? String(req.body.motivo) : 'Descartado manualmente', req.params.id);
  auditar(req, 'descartar ingreso marketing', ing.id, '-');
  res.json({ ok: true });
});

// Crear lead manual desde un ingreso bruto (forzar creacion).
app.post('/api/marketing/ingresos/:id/crear-lead', soloAdminOJefa, (req, res) => {
  const ing = db.prepare('SELECT * FROM marketing_ingresos WHERE id = ?').get(req.params.id);
  if (!ing) return res.status(404).json({ error: 'No encontrado' });
  // Nombre: el recibido, o uno que envie la jefa para completar (caso sin_nombre).
  const nombreFinal = (req.body && req.body.nombre && String(req.body.nombre).trim())
    ? String(req.body.nombre).trim() : (ing.nombreRecibido || 'Sin nombre');
  const codigo = generarCodigo();
  const ahora = new Date().toISOString();
  const monto = L.montoEtiquetaANumero(ing.montoRecibido);
  const rango = monto != null ? L.montoARango(monto) : null;
  const tel = ing.telefonoNormalizado || L.normalizarCelular(ing.telefonoRecibido) || null;
  db.prepare(`INSERT INTO leads (codigo,nombre,telefono,email,fuente,campana,asesor,montoReal,montoPotencial,montoRango,fechaCarga,fechaAsignacion)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(codigo, nombreFinal, tel, ing.emailRecibido || null,
         ing.fuente || null, ing.campana || null, null, monto, monto, rango, ahora, null);
  db.prepare('UPDATE marketing_ingresos SET estado=?, codigoLead=?, mensajeError=? WHERE id=?')
    .run('creado', codigo, 'Creado manualmente', req.params.id);
  // Si correspondia a un relead, marcarlo como usado para que no se reasigne.
  if (tel) {
    db.prepare("UPDATE marketing_historial SET estado='asignado', codigoLead=?, asignadoA=?, fechaAsignado=? WHERE telefono=? AND estado='pendiente'")
      .run(codigo, (req.user && req.user.nombre) ? req.user.nombre + ' (manual)' : 'manual', ahora, tel);
  }
  auditar(req, 'crear lead desde ingreso marketing', codigo, '-');
  res.json({ ok: true, codigoLead: codigo });
});

// Asociar un ingreso a un lead existente.
app.post('/api/marketing/ingresos/:id/asociar', soloAdminOJefa, (req, res) => {
  const ing = db.prepare('SELECT * FROM marketing_ingresos WHERE id = ?').get(req.params.id);
  if (!ing) return res.status(404).json({ error: 'No encontrado' });
  const codigo = req.body && req.body.codigoLead;
  if (!codigo) return res.status(400).json({ error: 'Falta codigoLead' });
  const lead = db.prepare('SELECT codigo FROM leads WHERE codigo = ?').get(codigo);
  if (!lead) return res.status(404).json({ error: 'Lead no existe' });
  db.prepare('UPDATE marketing_ingresos SET estado=?, codigoLead=?, mensajeError=? WHERE id=?')
    .run('duplicado_activo', codigo, 'Asociado manualmente', req.params.id);
  auditar(req, 'asociar ingreso marketing', ing.id, codigo);
  res.json({ ok: true, codigoLead: codigo });
});

// ---------- Catalogos ----------
app.get('/api/catalogos', (req, res) => {
  res.json({
    asesores: L.ASESORES, canales: L.CANALES, fuentes: L.FUENTES,
    resultados: L.RESULTADOS, proximasAcciones: L.PROXIMAS_ACCIONES,
    nivelInteres: L.NIVEL_INTERES, ticketRango: L.TICKET_RANGO,
    tiempo: L.TIEMPO, experiencia: L.EXPERIENCIA, avance: L.AVANCE,
    experienciaInv: L.EXPERIENCIA_INV,
    cFondos: L.C_FONDOS, cPrioriza: L.C_PRIORIZA, cPlazo: L.C_PLAZO,
    cCompetencia: L.C_COMPETENCIA, cProximoPaso: L.C_PROXIMO_PASO,
    tipoReunion: L.TIPO_REUNION, estadoReunion: L.ESTADO_REUNION,
    objeciones: L.OBJECIONES, motivosPerdida: L.MOTIVOS_PERDIDA,
    accionesPorResultado: require('./logic').ACCIONES_POR_RESULTADO || {},
    kanbanColumnas: L.KANBAN_COLUMNAS, kanbanResultadoDestino: L.KANBAN_RESULTADO_DESTINO
  });
});

// ---------- Leads ----------
app.post('/api/leads', soloAdmin, (req, res) => {
  const { nombre, telefono, email, fuente, campana, asesor, montoReal, montoPotencial } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Falta nombre del lead' });
  if (asesor && !L.ASESORES.includes(asesor)) {
    return res.status(400).json({ error: 'Asesor no valido. Opciones: ' + L.ASESORES.join(', ') });
  }
  const codigo = generarCodigo();
  const ahora = new Date().toISOString();
  const montoIn = montoReal != null ? montoReal : (montoPotencial != null ? montoPotencial : null);
  const monto = (montoIn != null && String(montoIn).trim() !== '') ? Number(String(montoIn).replace(/[^\d.]/g, '')) : null;
  const rango = (monto != null && isFinite(monto)) ? L.montoARango(monto) : null;
  db.prepare(`INSERT INTO leads (codigo,nombre,telefono,email,fuente,campana,asesor,montoReal,montoPotencial,montoRango,fechaCarga,fechaAsignacion)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(codigo, nombre, L.normalizarCelular(telefono) || telefono || null, email || null,
         fuente || null, campana || null, asesor || null, monto, monto, rango, ahora, asesor ? ahora : null);
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

  // Notificacion por correo a la GP. Su correo es su propio usuario en la base.
  codigos.forEach(c => {
    const lead = db.prepare('SELECT * FROM leads WHERE codigo = ?').get(c);
    notificarAsignacion(lead, asesor);
  });

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
  const etapaAntes = estadoActual.etapa;  // para el sello de transicion (se compara con la etapa despues)

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

  const ahoraISO = new Date().toISOString();
  db.prepare(`INSERT INTO gestiones
    (codigo,fecha,asesor,canal,resultado,grupoLimpio,proximaAccion,comentario,fechaProxAccion,
     ticket,tiempo,nivelInteres,experiencia,objecion,fechaReunion,tipoReunion,estadoReunion,closer,motivoPerdida,
     experienciaInv,cFondos,cMonto,cCriterio,cCompetencia,cProximoPaso,
     montoGestion,noDefineMonto,cPrioriza,cPlazo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      g.codigo, ahoraISO, g.asesor, g.canal, g.resultado,
      L.grupoLimpio(g.resultado), g.proximaAccion || null, g.comentario || null, fechaProx,
      g.ticket || null, g.tiempo || null, g.nivelInteres || null, g.experiencia || null,
      g.objecion || null, g.fechaReunion || null, g.tipoReunion || null,
      g.estadoReunion || null, g.closer || null, g.motivoPerdida || null,
      g.experienciaInv || null, g.cFondos || null, g.cMonto || null,
      g.cCriterio || null, g.cCompetencia || null, g.cProximoPaso || null,
      (g.montoGestion != null ? Math.round(g.montoGestion) : null),
      (g.noDefineMonto ? 1 : 0), g.cPrioriza || null, g.cPlazo || null
    );

  // Si la gestion trae un monto numerico, ese pasa a ser el monto vigente del lead
  // (se muestra en tarjeta/tabla). Si marca "No define monto", no se toca el monto actual.
  if (g.montoGestion != null && !g.noDefineMonto) {
    const m = Math.round(g.montoGestion);
    const rango = L.montoARango(m);
    db.prepare('UPDATE leads SET montoReal = ?, montoRango = ? WHERE codigo = ?')
      .run(m, rango, g.codigo);
  }

  // Fecha estimada de cierre: se guarda en el lead (proyeccion). null la limpia.
  if (g.fechaCierreEstimada !== undefined) {
    db.prepare('UPDATE leads SET fechaCierreEstimada = ? WHERE codigo = ?')
      .run(g.fechaCierreEstimada || null, g.codigo);
  }

  // SELLO automatico: si esta gestion movio al lead de etapa, registra la transicion.
  const estadoFinal = leadConsolidado(lead);
  if (estadoFinal.etapa !== etapaAntes) {
    db.prepare('INSERT INTO transiciones_etapa (codigo,etapa_origen,etapa_destino,fecha,asesor) VALUES (?,?,?,?,?)')
      .run(g.codigo, etapaAntes || null, estadoFinal.etapa, ahoraISO, g.asesor);
  }

  res.json(estadoFinal);
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
  // Actividad de WhatsApp (informativa, 1 por dia; NO afecta etapa ni score)
  const waDias = db.prepare('SELECT * FROM chat_actividad WHERE codigo = ? ORDER BY dia ASC').all(lead.codigo);
  waDias.forEach(w => {
    const total = (w.entrantes || 0) + (w.salientes || 0);
    eventos.push({
      tipo: 'whatsapp', fecha: w.ultimo || (w.dia + 'T12:00:00'),
      titulo: 'Conversación de WhatsApp',
      sub: total + ' mensaje' + (total === 1 ? '' : 's') + ' · ' + (w.entrantes || 0) + ' recibidos · ' + (w.salientes || 0) + ' enviados',
      actor: lead.asesor || ''
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

  // --- Calificacion actual con puntos (modelo v1.46/47) ---
  const ptsInteres = { 'Muy interesado': 25, 'Interesado': 18, 'Solo consulta': 10, 'Bajo interes': 5 };
  const ptsTiempo = { '0 a 7 dias': 20, '8 a 15 dias': 15, '16 a 30 dias': 10, '> 30 dias': 5 };
  const ptsAvance = { 'Decide solo': 15, 'Decide acompanado': 11, 'Debe consultar': 7, 'No avanza': 3 };
  const ptsExpInv = { 'Ya invirtio en Tasatop': 10, 'Productos similares': 8, 'Productos tradicionales': 5, 'Primera inversion': 3 };
  const ptsTicketIni = { 'S/ 200,000 a mas': 30, 'S/ 100,000 - 199,999': 25, 'S/ 50,000 - 99,999': 20, 'S/ 10,000 - 49,999': 10 };
  const ptsFondos = { 'Listo hoy': 25, 'En 7 dias': 18, 'Mas de 7 dias': 7, 'Sin fecha': 0 };
  const ptsCMonto = { 'S/ 200,000 a mas': 20, 'S/ 100,000 - 199,999': 15, 'S/ 50,000 - 99,999': 8, 'S/ 10,000 - 49,999': 3 };
  const ptsCompet = { 'No compara': 20, 'Tradicionales': 13, 'Similares': 8, 'Tiene propuesta': 3 };
  const ptsCPaso = { 'Invierte hoy': 35, 'Decide esta semana': 25, 'Enviar info': 8, 'Sin paso': 0 };
  const av = cons.avance || cons.experiencia;
  const montoTxt = cons.montoReal != null ? ('S/ ' + Number(cons.montoReal).toLocaleString('en-US')) : '—';
  const rangoVig = cons.rangoVigente;
  // Bloque inicial (siempre)
  const calificacion = [
    { ico: '$', etiqueta: 'Monto', valor: montoTxt, pts: ptsTicketIni[rangoVig] || 0, crudo: true },
    { ico: '♥', etiqueta: 'Interés', valor: cons.nivelInteres, pts: ptsInteres[cons.nivelInteres] || 0 },
    { ico: '◷', etiqueta: 'Cuándo', valor: cons.tiempo, pts: ptsTiempo[cons.tiempo] || 0 },
    { ico: '👤', etiqueta: 'Decide', valor: av, pts: ptsAvance[av] || 0 },
    { ico: '★', etiqueta: 'Experiencia', valor: cons.experienciaInv, pts: ptsExpInv[cons.experienciaInv] || 0 }
  ];
  // Bloque de cierre (solo si el lead lo tiene)
  const calificacionCierre = cons.tieneScoreCierre ? [
    { ico: '💵', etiqueta: 'Fondos', valor: cons.cFondos, pts: ptsFondos[cons.cFondos] || 0 },
    { ico: '$', etiqueta: 'Monto', valor: montoTxt, pts: ptsCMonto[rangoVig] || 0, crudo: true },
    { ico: '◎', etiqueta: 'Prioriza', valor: cons.cPrioriza, pts: 0, info: true },
    { ico: '⚖', etiqueta: 'Compara', valor: cons.cCompetencia, pts: ptsCompet[cons.cCompetencia] || 0 },
    { ico: '→', etiqueta: 'Próx. paso', valor: cons.cProximoPaso, pts: ptsCPaso[cons.cProximoPaso] || 0 }
  ] : null;

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
      monto: cons.montoReal != null ? cons.montoReal : cons.montoPotencial, ticket: cons.rangoVigente
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
    scores: { inicial: cons.scoreInicial, cierre: cons.scoreCierre, visible: cons.score },
    calificacion, calificacionCierre,
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

// Backup: descarga una copia CONSISTENTE de la base (solo admin).
app.get('/api/backup', soloAdmin, (req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: 'Base no encontrada' });
  const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const tmp = path.join(require('os').tmpdir(), `crm-backup-${fecha}.db`);
  try {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);  // snapshot consistente
    auditar(req, 'descargar backup', '-', 'snapshot consistente');
    res.download(tmp, `crm-backup-${fecha}.db`, () => { try { fs.unlinkSync(tmp); } catch (e) {} });
  } catch (e) {
    auditar(req, 'descargar backup', '-', 'directo (fallback)');
    res.download(DB_PATH, `crm-backup-${fecha}.db`);
  }
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
// "Mi día": pulso del GP para la cabecera de Mis Leads (urgencias + avance de hoy vs meta diaria).
app.get('/api/midia', (req, res) => {
  const asesor = req.user.nombre;
  const leads = db.prepare('SELECT * FROM leads WHERE COALESCE(archivado,0)=0 AND asesor=?').all(asesor).map(leadConsolidado);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const man = new Date(hoy); man.setDate(man.getDate() + 1);
  const ahora = new Date();
  const esCerrado = e => e === 'Cerrado ganado' || e === 'Cerrado perdido';
  const ord = { 'Calificado - pendiente agendar': 2, 'Agendado - pendiente reunion': 3, 'Reunion efectiva - seguimiento': 4, 'Cierre pendiente': 5, 'Cerrado ganado': 6 };
  const activos = leads.filter(l => !esCerrado(l.etapa));
  const paraHoy = activos.filter(l => l.fechaProxAccion && new Date(l.fechaProxAccion) >= hoy && new Date(l.fechaProxAccion) < man).length;
  const vencidos = activos.filter(l => l.fechaProxAccion && new Date(l.fechaProxAccion) < hoy).length;
  const nuevosSinContactar = leads.filter(l => l.etapa === 'Contactabilidad 3x5').length;
  const calificadosMas = activos.filter(l => (ord[l.etapa] || 0) >= 2).length;

  const isoHoy = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
  const metaHoy = {}; db.prepare("SELECT metrica,valor FROM metas WHERE asesor=? AND ambito='diario' AND periodo=?").all(asesor, isoHoy).forEach(r => metaHoy[r.metrica] = r.valor);
  const agg = agregarRealBuckets([asesor], [{ ini: hoy, fin: ahora }]);
  const realHoy = { calificados: agg.calificados.total, agendados: agg.agendados.total, reuniones: agg.reuniones.total, cierres: agg.cierres.total };

  // asignados hoy
  const asignadosHoy = leads.filter(l => l.fechaAsignacion && new Date(l.fechaAsignacion) >= hoy && new Date(l.fechaAsignacion) < man).length;

  // speed-to-call: promedio de (primer gestion - fechaAsignacion) en minutos
  let speedMin = null;
  const codigos = leads.map(l => l.codigo);
  if (codigos.length) {
    const phc = codigos.map(() => '?').join(',');
    const prim = db.prepare(`SELECT codigo, MIN(fecha) f FROM gestiones WHERE codigo IN (${phc}) GROUP BY codigo`).all(...codigos);
    const fAsig = {}; leads.forEach(l => { if (l.fechaAsignacion) fAsig[l.codigo] = new Date(l.fechaAsignacion); });
    let suma = 0, n = 0;
    prim.forEach(g => { const fa = fAsig[g.codigo]; if (fa && g.f) { const d = (new Date(g.f) - fa) / 60000; if (d >= 0) { suma += d; n++; } } });
    speedMin = n ? Math.round(suma / n) : null;
  }

  res.json({ asesor, urgencias: { paraHoy, vencidos, nuevosSinContactar, calificadosMas }, asignadosHoy, ganadosHoy: realHoy.cierres, speedMin, metaHoy, realHoy });
});
// Fecha (YYYY-MM-DD) en hora Perú (UTC-5) para una Date dada. Evita desfase con el server UTC.
function fechaPeruISO(d) {
  const p = new Date(d.getTime() - 5 * 3600 * 1000);
  return p.getUTCFullYear() + '-' + String(p.getUTCMonth() + 1).padStart(2, '0') + '-' + String(p.getUTCDate()).padStart(2, '0');
}
// Reparto por GP (solo jefa/admin): distribución de carga para gestionar y reasignar el día.
app.get('/api/reparto', (req, res) => {
  if (!veTodo(req.user)) return res.status(403).json({ error: 'No autorizado' });
  const leads = db.prepare('SELECT * FROM leads WHERE COALESCE(archivado,0)=0').all().map(l => leadConsolidado(l));
  const ahora = new Date();
  const hoyP = fechaPeruISO(ahora);
  const esCerrado = e => e === 'Cerrado ganado' || e === 'Cerrado perdido';
  const antesDeCalificar = e => e === 'Contactabilidad 3x5' || e === 'Contactado - por calificar';
  const num = v => Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')) || 0;
  const init = () => ({ asignadosHoy: 0, cartera: 0, sinContactar: 0, vencidos: 0, monto: 0 });
  const porGP = {}; L.ASESORES.forEach(a => porGP[a] = init());
  const sinAsig = init();
  leads.forEach(l => {
    const dest = (l.asesor && porGP[l.asesor]) ? porGP[l.asesor] : sinAsig;
    const activo = !esCerrado(l.etapa);
    if (activo) dest.cartera++;
    if (l.etapa === 'Contactabilidad 3x5') dest.sinContactar++;
    if (activo && l.fechaProxAccion && new Date(l.fechaProxAccion) < ahora) dest.vencidos++;
    if (antesDeCalificar(l.etapa)) dest.monto += num(l.montoPotencial);
    if (l.asesor && porGP[l.asesor]) {
      const asignadoHoy = l.fechaAsignacion && fechaPeruISO(new Date(l.fechaAsignacion)) === hoyP;
      if (asignadoHoy && (l.intentos || 0) === 0 && l.etapa === 'Contactabilidad 3x5') dest.asignadosHoy++;
    }
  });
  const filas = L.ASESORES.map(a => Object.assign({ asesor: a }, porGP[a]));
  const equipo = init();
  filas.forEach(f => { equipo.asignadosHoy += f.asignadosHoy; equipo.cartera += f.cartera; equipo.sinContactar += f.sinContactar; equipo.vencidos += f.vencidos; equipo.monto += f.monto; });
  res.json({ filas, equipo, sinAsignar: sinAsig });
});
// ===== Mensajería (Chatwoot) — bandeja de WhatsApp embebida (Nivel 2) =====
const cw = require('./chatwoot');

// Índice de leads por teléfono (últimos 9 dígitos) para casar conversación <-> lead.
function indiceLeadsPorTelefono() {
  const leads = db.prepare('SELECT codigo,nombre,telefono,asesor FROM leads WHERE COALESCE(archivado,0)=0').all();
  const idx = {};
  leads.forEach(l => { const k = L.normalizarCelular(l.telefono); if (k) idx[k] = l; });
  return idx;
}

// Lista de conversaciones, filtrada por rol: la GP solo ve las de SUS leads; admin/jefa ven todo.
app.get('/api/chat/conversaciones', async (req, res) => {
  if (!cw.cwConfigurado()) return res.json({ configurado: false, conversaciones: [] });
  try {
    const convs = await cw.listarConversaciones();
    const idx = indiceLeadsPorTelefono();
    const esGP = !veTodo(req.user);
    const out = [];
    convs.forEach(c => {
      const phone = cw.telefonoDeConversacion(c);
      const k = L.normalizarCelular(phone);
      const lead = k ? idx[k] : null;
      if (esGP && (!lead || lead.asesor !== req.user.nombre)) return; // GP: solo sus leads
      const sender = (c.meta && c.meta.sender) ? c.meta.sender : {};
      const ult = c.last_non_activity_message || c.messages && c.messages[c.messages.length - 1];
      out.push({
        id: c.id,
        nombre: lead ? lead.nombre : (sender.name || phone || 'Desconocido'),
        telefono: phone,
        codigoLead: lead ? lead.codigo : null,
        asesor: lead ? lead.asesor : null,
        ultimo: ult ? (ult.content || '') : '',
        noLeidos: c.unread_count || 0,
        ts: c.last_activity_at || c.timestamp || null,
      });
    });
    out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    res.json({ configurado: true, conversaciones: out });
  } catch (e) {
    res.status(502).json({ configurado: true, error: e.message, conversaciones: [] });
  }
});

// Valida que una conversación pertenezca a un lead del usuario (para GP). Admin/jefa: libre.
async function puedeVerConversacion(req, convId) {
  if (veTodo(req.user)) return true;
  try {
    const data = await cw.obtenerConversacion(convId);
    const c = data && data.payload ? data.payload : data;
    const phone = cw.telefonoDeConversacion(c);
    const k = L.normalizarCelular(phone);
    if (!k) return false;
    const idx = indiceLeadsPorTelefono();
    const lead = idx[k];
    return !!(lead && lead.asesor === req.user.nombre);
  } catch (e) { return false; }
}

app.get('/api/chat/mensajes', async (req, res) => {
  if (!cw.cwConfigurado()) return res.json({ configurado: false, mensajes: [] });
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Falta id' });
  if (!(await puedeVerConversacion(req, id))) return res.status(403).json({ error: 'No autorizado' });
  try {
    const msgs = await cw.mensajesDe(id);
    const out = msgs
      .filter(m => m.message_type === 0 || m.message_type === 1) // 0 entrante, 1 saliente
      .map(m => ({ id: m.id, entrante: m.message_type === 0, texto: m.content || '', ts: m.created_at }));
    res.json({ configurado: true, mensajes: out });
  } catch (e) { res.status(502).json({ error: e.message, mensajes: [] }); }
});

app.post('/api/chat/enviar', async (req, res) => {
  if (!cw.cwConfigurado()) return res.status(400).json({ error: 'Chatwoot no configurado' });
  const { id, texto } = req.body || {};
  if (!id || !texto || !String(texto).trim()) return res.status(400).json({ error: 'Falta id o texto' });
  if (!(await puedeVerConversacion(req, id))) return res.status(403).json({ error: 'No autorizado' });
  try { await cw.enviarMensaje(id, String(texto).trim()); res.json({ ok: true }); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

// ---- Tiempo real: SSE (servidor -> navegador) ----
// Cada cliente conectado guarda su user para poder filtrar por rol al difundir.
const sseClientes = [];
function sseEnviar(asesorDuenio, payload) {
  const data = 'data: ' + JSON.stringify(payload) + '\n\n';
  for (const cli of sseClientes) {
    const u = cli.user;
    const puede = veTodo(u) || (asesorDuenio && u.nombre === asesorDuenio);
    if (!puede) continue;
    try { cli.res.write(data); } catch (e) {}
  }
}
app.get('/api/chat/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': conectado\n\n');
  const cli = { res, user: req.user };
  sseClientes.push(cli);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
  req.on('close', () => {
    clearInterval(ping);
    const i = sseClientes.indexOf(cli);
    if (i >= 0) sseClientes.splice(i, 1);
  });
});

// Webhook de Chatwoot: se autentica por token en la URL (CHATWOOT_WEBHOOK_TOKEN).
// Configurar en Chatwoot: Settings -> Integrations -> Webhooks, suscrito a message_created.
app.post('/api/webhooks/chatwoot/:token', (req, res) => {
  const esperado = process.env.CHATWOOT_WEBHOOK_TOKEN;
  if (!esperado || req.params.token !== esperado) return res.status(403).json({ error: 'Token invalido' });
  res.json({ ok: true }); // responder rapido siempre
  try {
    const ev = req.body || {};
    if (ev.event !== 'message_created') return;
    const conv = ev.conversation || {};
    const convId = conv.id || (ev.conversation_id) || null;
    if (!convId) return;
    // Telefono del contacto: probar varias formas segun el payload de Chatwoot.
    const sender = ev.sender || (conv.meta && conv.meta.sender) || {};
    const phone = sender.phone_number || sender.identifier ||
      (conv.meta && conv.meta.sender && conv.meta.sender.phone_number) || '';
    const k = L.normalizarCelular(phone);
    const idx = indiceLeadsPorTelefono();
    const lead = k ? idx[k] : null;
    const tipo = ev.message_type; // 'incoming' | 'outgoing'
    const entrante = tipo === 'incoming' || tipo === 0;
    // Registro informativo en trazabilidad (1 fila por lead+dia). NO afecta etapa ni score.
    if (lead) {
      try {
        const dia = fechaPeruISO(new Date());
        const ahoraISO = new Date().toISOString();
        db.prepare(
          'INSERT INTO chat_actividad (codigo,dia,entrantes,salientes,ultimo) VALUES (?,?,?,?,?) ' +
          'ON CONFLICT(codigo,dia) DO UPDATE SET entrantes=entrantes+?, salientes=salientes+?, ultimo=?'
        ).run(lead.codigo, dia, entrante ? 1 : 0, entrante ? 0 : 1, ahoraISO,
              entrante ? 1 : 0, entrante ? 0 : 1, ahoraISO);
      } catch (e) {}
    }
    sseEnviar(lead ? lead.asesor : null, {
      tipo: 'mensaje',
      conversationId: convId,
      mensaje: { entrante, texto: ev.content || '', ts: ev.created_at || Math.floor(Date.now() / 1000) },
    });
  } catch (e) { /* nunca romper el webhook */ }
});

// Crear lead desde una conversación huérfana (número que no es lead). Solo admin/jefa.
// Reutiliza procesarLeadMarketing -> aplica TODA la dedup de Leads Ingresos
// (telefono exacto, releads/historial, ganado/perdido, mismo nombre). Crea SIN asignar.
app.post('/api/chat/crear-lead', async (req, res) => {
  if (!veTodo(req.user)) return res.status(403).json({ error: 'Solo admin o jefa pueden crear leads' });
  if (!cw.cwConfigurado()) return res.status(400).json({ error: 'Chatwoot no configurado' });
  const { conversationId, nombre } = req.body || {};
  if (!conversationId) return res.status(400).json({ error: 'Falta conversationId' });
  try {
    const data = await cw.obtenerConversacion(conversationId);
    const c = data && data.payload ? data.payload : data;
    const phone = cw.telefonoDeConversacion(c);
    const telNorm = L.normalizarCelular(phone);
    if (!telNorm || telNorm.length < 9) return res.status(400).json({ error: 'La conversación no tiene un teléfono válido' });
    const sender = (c.meta && c.meta.sender) ? c.meta.sender : {};
    const nombreFinal = (nombre && String(nombre).trim()) || sender.name || '';
    const norm = {
      telefonoNormalizado: telNorm,
      nombre: nombreFinal,
      email: null,
      fuente: 'whatsapp',
      campana: null,
      montoNumerico: null,
      rawJson: JSON.stringify({ origen: 'chat-whatsapp', conversationId, phone }),
    };
    const r = procesarLeadMarketing(norm, { sinAutoasignar: true });
    if (r.estado === 'creado') auditar(req, 'crear-lead-chat', r.codigoLead, 'desde WhatsApp ' + phone);
    res.json(r);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Ficha comercial del lead para el panel derecho de Mensajería. Solo métricas REALES.
app.get('/api/chat/ficha', (req, res) => {
  const codigo = req.query.codigo;
  if (!codigo) return res.status(400).json({ error: 'Falta codigo' });
  const lead = db.prepare('SELECT * FROM leads WHERE codigo = ?').get(codigo);
  if (!lead) return res.status(404).json({ error: 'Lead no existe' });
  if (!veTodo(req.user) && lead.asesor !== req.user.nombre) return res.status(403).json({ error: 'No autorizado' });
  const cons = leadConsolidado(lead);
  const nGest = db.prepare('SELECT COUNT(*) n FROM gestiones WHERE codigo = ?').get(codigo).n;
  const nLlam = db.prepare('SELECT COUNT(*) n FROM llamadas WHERE codigo = ?').get(codigo).n;
  const nReu = db.prepare("SELECT COUNT(*) n FROM gestiones WHERE codigo = ? AND fechaReunion IS NOT NULL AND fechaReunion <> ''").get(codigo).n;
  const wa = db.prepare('SELECT COALESCE(SUM(entrantes),0) e, COALESCE(SUM(salientes),0) s FROM chat_actividad WHERE codigo = ?').get(codigo);
  // Días en la etapa actual (desde la última transición hacia ella)
  const ORDEN = { 'Contactabilidad 3x5': 0, 'Contactado - por calificar': 1, 'Calificado - pendiente agendar': 2, 'Agendado - pendiente reunion': 3, 'Reunion efectiva - seguimiento': 4, 'Cierre pendiente': 5, 'Cerrado ganado': 6, 'Cerrado perdido': 6 };
  let diasEnEtapa = cons.diasDesdeAsignacion != null ? cons.diasDesdeAsignacion : null;
  try {
    const tr = db.prepare('SELECT etapa_destino, fecha FROM transiciones_etapa WHERE codigo = ? ORDER BY fecha DESC').all(codigo);
    const ult = tr.find(t => t.etapa_destino === cons.etapa) || tr[0];
    if (ult && ult.fecha) diasEnEtapa = Math.max(0, Math.floor((Date.now() - new Date(ult.fecha).getTime()) / 86400000));
  } catch (e) {}
  const orden = ORDEN[cons.etapa] != null ? ORDEN[cons.etapa] : 0;
  const avance = cons.etapa === 'Cerrado ganado' ? 100 : Math.round((orden / 6) * 100);
  res.json({
    codigo, nombre: lead.nombre, telefono: lead.telefono, email: lead.email || null, asesor: lead.asesor || null,
    etapa: cons.etapa, score: cons.score != null ? cons.score : null, probabilidad: cons.probabilidad != null ? cons.probabilidad : null,
    monto: cons.pipelineEstimado != null ? cons.pipelineEstimado : null, ticket: cons.ticket || null, origen: lead.fuente || null,
    avance, diasEnEtapa, interacciones: nGest, llamadas: nLlam, reuniones: nReu,
    waEnviados: wa.s, waRecibidos: wa.e,
    proximaAccion: cons.proximaAccion || null, fechaProxAccion: cons.fechaProxAccion || null, ultimaGestion: cons.ultimaGestion || null,
    prioridad: cons.prioridad || null,
  });
});

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

// ---------- Avance vs meta (conecta metas con la realidad) ----------
const ORDEN_ETAPA = {
  'Contactabilidad 3x5': 0, 'Contactado - por calificar': 1,
  'Calificado - pendiente agendar': 2, 'Agendado - pendiente reunion': 3,
  'Reunion efectiva - seguimiento': 4, 'Cierre pendiente': 5, 'Cerrado ganado': 6
};
// Semanas calendario del mes (lun-dom), recortadas a los bordes del mes.
// Fusiona tramos con 0 dias habiles (ej. un domingo suelto al inicio) para no generar semanas fantasma.
function semanasDelMes(y, m0) {
  const ini = new Date(y, m0, 1); const fin = new Date(y, m0 + 1, 0, 23, 59, 59);
  const crudas = []; let cur = new Date(y, m0, 1);
  while (cur <= fin) {
    const lunes = new Date(cur); lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
    const finSem = new Date(lunes); finSem.setDate(finSem.getDate() + 6); finSem.setHours(23, 59, 59, 999);
    const wIni = cur < ini ? new Date(ini) : new Date(cur); wIni.setHours(0, 0, 0, 0);
    const wFin = finSem > fin ? new Date(fin) : new Date(finSem);
    crudas.push({ ini: wIni, fin: wFin });
    cur = new Date(finSem); cur.setDate(cur.getDate() + 1); cur.setHours(0, 0, 0, 0);
  }
  const out = [];
  for (let i = 0; i < crudas.length; i++) {
    const wd = L.contarDiasHabiles(crudas[i].ini, crudas[i].fin);
    if (wd === 0) {
      if (i + 1 < crudas.length) { crudas[i + 1].ini = crudas[i].ini; continue; } // fusiona con la siguiente
      if (out.length) { out[out.length - 1].fin = crudas[i].fin; continue; }       // o con la anterior
    }
    out.push(crudas[i]);
  }
  out.forEach((s, i) => s.idx = i);
  return out;
}
// Agrega lo real por buckets (cada bucket {ini,fin}). Devuelve {metrica:{sem:[...], total}}.
function agregarRealBuckets(asesores, buckets) {
  const METR = ['asignados', 'calificados', 'agendados', 'reuniones', 'negociacion', 'cierres', 'monto'];
  const res = {}; METR.forEach(k => res[k] = { sem: buckets.map(() => 0), total: 0 });
  const idxDe = f => { for (let i = 0; i < buckets.length; i++) { if (f >= buckets[i].ini && f <= buckets[i].fin) return i; } return -1; };
  const sumar = (k, f, v) => { const i = idxDe(f); if (i < 0) return; res[k].sem[i] += v; res[k].total += v; };
  const ph = asesores.map(() => '?').join(',');
  db.prepare(`SELECT fechaAsignacion FROM leads WHERE asesor IN (${ph}) AND COALESCE(archivado,0)=0 AND fechaAsignacion IS NOT NULL`).all(...asesores)
    .forEach(l => sumar('asignados', new Date(l.fechaAsignacion), 1));
  const trans = db.prepare(`SELECT t.codigo, t.etapa_destino, t.fecha, l.montoReal
    FROM transiciones_etapa t JOIN leads l ON l.codigo = t.codigo
    WHERE l.asesor IN (${ph}) AND COALESCE(l.archivado,0)=0`).all(...asesores);
  const porLead = {}; trans.forEach(t => { (porLead[t.codigo] = porLead[t.codigo] || { ts: [], montoReal: t.montoReal }).ts.push(t); });
  const TH = { calificados: 2, agendados: 3, reuniones: 4, negociacion: 5 };
  const primera = (ts, thr) => { let min = null; ts.forEach(t => { const o = ORDEN_ETAPA[t.etapa_destino]; if (o != null && o >= thr) { const f = new Date(t.fecha); if (!min || f < min) min = f; } }); return min; };
  Object.values(porLead).forEach(L0 => {
    ['calificados', 'agendados', 'reuniones', 'negociacion'].forEach(k => { const f = primera(L0.ts, TH[k]); if (f) sumar(k, f, 1); });
    let fGan = null; L0.ts.forEach(t => { if (t.etapa_destino === 'Cerrado ganado') { const f = new Date(t.fecha); if (!fGan || f < fGan) fGan = f; } });
    if (fGan) { sumar('cierres', fGan, 1); sumar('monto', fGan, (L0.montoReal || 0)); }
  });
  return res;
}
const NOMBRES_MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
app.get('/api/dashboard/avance', (req, res) => {
  const mes = String(req.query.mes || '').trim() || (new Date()).toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: 'mes invalido (YYYY-MM)' });
  const [y, m] = mes.split('-').map(Number); const m0 = m - 1;
  const vista = (req.query.vista === 'meses') ? 'meses' : 'semanas';
  const scopeReq = String(req.query.scope || 'EQUIPO');
  let asesores, scope;
  if (!veTodo(req.user)) { asesores = [req.user.nombre]; scope = req.user.nombre; }
  else if (scopeReq !== 'EQUIPO' && L.ASESORES.includes(scopeReq)) { asesores = [scopeReq]; scope = scopeReq; }
  else { asesores = L.ASESORES; scope = 'EQUIPO'; }
  const METR = ['asignados', 'calificados', 'agendados', 'reuniones', 'cierres', 'monto'];
  const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
  const dhMes = L.diasHabilesMes(y, m0);
  const dhTrans = L.diasHabilesTranscurridos(y, m0, hoy0);
  const metaMensualDe = (per) => { const o = {}; asesores.forEach(a => db.prepare("SELECT metrica,valor FROM metas WHERE asesor=? AND ambito='mensual' AND periodo=?").all(a, per).forEach(r => { o[r.metrica] = (o[r.metrica] || 0) + r.valor; })); return o; };

  let buckets, labels, meta;
  meta = {}; METR.forEach(k => meta[k] = { sem: [], total: 0 });

  if (vista === 'semanas') {
    const semanas = semanasDelMes(y, m0);
    buckets = semanas;
    labels = semanas.map((s, i) => ({ label: 'Sem ' + (i + 1) }));
    METR.forEach(k => meta[k].sem = semanas.map(() => 0));
    const semIdxDe = f => { for (const s of semanas) { if (f >= s.ini && f <= s.fin) return s.idx; } return -1; };
    asesores.forEach(a => {
      db.prepare("SELECT metrica,valor FROM metas WHERE asesor=? AND ambito='mensual' AND periodo=?").all(a, mes)
        .forEach(r => { if (meta[r.metrica]) meta[r.metrica].total += r.valor; });
      db.prepare("SELECT periodo,metrica,valor FROM metas WHERE asesor=? AND ambito='diario' AND periodo LIKE ?").all(a, mes + '-%')
        .forEach(r => { if (!meta[r.metrica]) return; const i = semIdxDe(new Date(r.periodo + 'T12:00:00')); if (i >= 0) meta[r.metrica].sem[i] += r.valor; });
    });
  } else {
    const meses = []; for (let k = 5; k >= 0; k--) { const d = new Date(y, m0 - k, 1); meses.push({ y: d.getFullYear(), m0: d.getMonth() }); }
    buckets = meses.map(mm => ({ ini: new Date(mm.y, mm.m0, 1), fin: new Date(mm.y, mm.m0 + 1, 0, 23, 59, 59) }));
    labels = meses.map(mm => ({ label: NOMBRES_MES[mm.m0] + ' ' + String(mm.y).slice(2) }));
    METR.forEach(k => meta[k].sem = meses.map(() => 0));
    meses.forEach((mm, i) => {
      const per = mm.y + '-' + String(mm.m0 + 1).padStart(2, '0');
      const mm2 = metaMensualDe(per);
      METR.forEach(k => { if (mm2[k] != null) { meta[k].sem[i] = mm2[k]; meta[k].total += mm2[k]; } });
    });
  }

  const real = agregarRealBuckets(asesores, buckets);

  // Base de proyeccion: SIEMPRE el mes seleccionado
  const selReal = {}; const selAgg = agregarRealBuckets(asesores, [{ ini: new Date(y, m0, 1), fin: new Date(y, m0 + 1, 0, 23, 59, 59) }]);
  METR.forEach(k => selReal[k] = selAgg[k].total);
  const selMeta = metaMensualDe(mes);

  // Pipeline de negociacion del mes seleccionado: leads en 'Cierre pendiente' (ultima transicion)
  // con fechaCierreEstimada dentro del mes. Separa por-vencer (fecha futura) vs vencida (fecha pasada).
  const iniMesSel = new Date(y, m0, 1); const finMesSel = new Date(y, m0 + 1, 0, 23, 59, 59);
  const phP = asesores.map(() => '?').join(',');
  const leadsNeg = db.prepare(`SELECT l.codigo, l.montoReal, l.montoPotencial, l.fechaCierreEstimada,
      (SELECT t2.etapa_destino FROM transiciones_etapa t2 WHERE t2.codigo=l.codigo ORDER BY t2.fecha DESC LIMIT 1) AS ult
    FROM leads l WHERE l.asesor IN (${phP}) AND COALESCE(l.archivado,0)=0`).all(...asesores)
    .filter(r => r.ult === 'Cierre pendiente');
  let pVencer = 0, pVencida = 0, nVencer = 0, nVencida = 0;
  leadsNeg.forEach(r => {
    if (!r.fechaCierreEstimada) return;
    const fc = new Date(r.fechaCierreEstimada);
    if (fc < iniMesSel || fc > finMesSel) return;
    const monto = (r.montoReal > 0 ? r.montoReal : (r.montoPotencial || 0));
    if (fc >= hoy0) { pVencer += monto; nVencer++; } else { pVencida += monto; nVencida++; }
  });
  const ganadoMes = selReal.monto || 0;
  const pipeline = {
    ganadoMes, porVencer: pVencer, vencida: pVencida, nVencer, nVencida,
    proyeccionMes: ganadoMes + pVencer + pVencida, metaMonto: selMeta.monto || 0
  };

  res.json({ vista, mes, scope, semanas: labels, dhMes, dhTrans, metricas: METR, meta, real, selReal, selMeta, pipeline });
});




const PORT = process.env.PORT || 3000;
// ---------- Sincronizacion de leads desde Google Sheets (Meta / TikTok) ----------
const { crearSheetsSync } = require('./sheets');
const sheetsSync = crearSheetsSync({
  db,
  normalizarLeadMarketing: L.normalizarLeadMarketing,
  procesarLeadMarketing,
  guardarIngresoBruto,
  normalizarCelular: L.normalizarCelular,
  montoARango: L.montoARango,
});
sheetsSync.iniciarScheduler();

// Forzar una lectura manual (sin esperar los 5 min). Admin/jefa.
app.post('/api/marketing/sheets/sync', soloAdminOJefa, async (req, res) => {
  try {
    const resultado = await sheetsSync.sincronizarTodo();
    res.json({ ok: true, resultado });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Estado de la sincronizacion por origen.
app.get('/api/marketing/sheets/estado', soloAdminOJefa, (req, res) => {
  res.json({ estado: sheetsSync.estado() });
});

// ---------- Auto-asignacion: interruptor por GP (round-robin) ----------
app.get('/api/gestoras', soloAdminOJefa, (req, res) => {
  const gestoras = db.prepare("SELECT usuario, nombre, activo, COALESCE(autoasignar,1) AS autoasignar FROM usuarios WHERE rol='gestora' ORDER BY id").all();
  const rr = db.prepare("SELECT valor FROM app_config WHERE clave='rr_ultimo'").get();
  res.json({ gestoras, ultimoAsignado: rr ? rr.valor : null });
});
app.post('/api/gestoras/:usuario/autoasignar', soloAdminOJefa, (req, res) => {
  const val = (req.body && (req.body.valor === 1 || req.body.valor === true)) ? 1 : 0;
  const u = db.prepare("SELECT usuario FROM usuarios WHERE usuario=? AND rol='gestora'").get(String(req.params.usuario).toLowerCase());
  if (!u) return res.status(404).json({ error: 'GP no encontrada' });
  db.prepare('UPDATE usuarios SET autoasignar=? WHERE usuario=?').run(val, u.usuario);
  auditar(req, 'toggle autoasignar', u.usuario, 'valor=' + val);
  res.json({ ok: true, usuario: u.usuario, autoasignar: val });
});

// ---------- Metas comerciales ----------
const METRICAS_META = ['asignados', 'calificados', 'agendados', 'reuniones', 'cierres', 'monto'];

// Lee las metas de un asesor (o EQUIPO) para un mes: la mensual + las diarias de ese mes.
app.get('/api/metas', soloAdminOJefa, (req, res) => {
  const asesor = String(req.query.asesor || '').trim();
  const mes = String(req.query.mes || '').trim();
  if (!asesor || !/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: 'Falta asesor o mes (YYYY-MM)' });
  const mensualRows = db.prepare("SELECT metrica, valor FROM metas WHERE asesor=? AND ambito='mensual' AND periodo=?").all(asesor, mes);
  const diarioRows = db.prepare("SELECT periodo, metrica, valor FROM metas WHERE asesor=? AND ambito='diario' AND periodo LIKE ?").all(asesor, mes + '-%');
  const mensual = {}; mensualRows.forEach(r => { mensual[r.metrica] = r.valor; });
  const diario = {}; diarioRows.forEach(r => { (diario[r.periodo] = diario[r.periodo] || {})[r.metrica] = r.valor; });
  const [y, m] = mes.split('-').map(Number);
  res.json({ asesor, mes, mensual, diario, diasHabilesMes: L.diasHabilesMes(y, m - 1) });
});

// Guarda metas (solo admin). filas: [{ambito:'mensual'|'diario', periodo, metrica, valor}].
app.post('/api/metas', soloAdmin, (req, res) => {
  const { asesor, filas } = req.body || {};
  if (!asesor || !Array.isArray(filas)) return res.status(400).json({ error: 'Falta asesor o filas' });
  const up = db.prepare(`INSERT INTO metas (asesor,ambito,periodo,metrica,valor) VALUES (?,?,?,?,?)
    ON CONFLICT(asesor,ambito,periodo,metrica) DO UPDATE SET valor=excluded.valor`);
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const f of (filas || [])) {
      if (!f || !['mensual', 'diario'].includes(f.ambito)) continue;
      if (!METRICAS_META.includes(f.metrica)) continue;
      if (!f.periodo) continue;
      const val = Number(f.valor);
      if (!isFinite(val) || val < 0) continue;
      up.run(asesor, f.ambito, String(f.periodo), f.metrica, val);
      n++;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ error: String(e.message || e) }); }
  auditar(req, 'guardar metas', asesor, n + ' filas');
  res.json({ ok: true, guardadas: n });
});

// Resumen de metas mensuales de todos los asesores (+ EQUIPO) para un mes.
app.get('/api/metas/resumen', soloAdminOJefa, (req, res) => {
  const mes = String(req.query.mes || '').trim();
  if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: 'mes invalido (YYYY-MM)' });
  const rows = db.prepare("SELECT asesor, metrica, valor FROM metas WHERE ambito='mensual' AND periodo=?").all(mes);
  const asesores = {};
  rows.forEach(r => { (asesores[r.asesor] = asesores[r.asesor] || {})[r.metrica] = r.valor; });
  res.json({ mes, asesores });
});

// ---------- Base de Releads (historicos para segunda barrida) ----------
// Lista con filtros (origen, rango de fechas, busqueda) y paginacion.
app.get('/api/releads', soloAdminOJefa, (req, res) => {
  const { origen, desde, hasta, q, estado, limit, offset } = req.query;
  const where = ['estado = ?'];
  const params = [estado || 'pendiente'];
  if (origen) { where.push('origen = ?'); params.push(origen); }
  if (desde) { where.push('fechaISO >= ?'); params.push(desde); }
  if (hasta) { where.push('fechaISO <= ?'); params.push(hasta); }
  if (q) { where.push('(nombre LIKE ? OR telefono LIKE ?)'); params.push('%' + q + '%', '%' + q + '%'); }
  const W = 'WHERE ' + where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM marketing_historial ${W}`).get(...params).n;
  const lim = Math.min(Number(limit) || 50, 200);
  const off = Number(offset) || 0;
  const releads = db.prepare(`SELECT telefono,nombre,fechaRegistro,fechaISO,origen,campana,email,montoReal,montoRango,estado,codigoLead,asignadoA,fechaAsignado
    FROM marketing_historial ${W}
    ORDER BY (montoReal IS NULL), montoReal DESC, fechaISO DESC
    LIMIT ? OFFSET ?`).all(...params, lim, off);
  const resumen = {};
  db.prepare('SELECT estado, COUNT(*) AS c FROM marketing_historial GROUP BY estado').all()
    .forEach(r => { resumen[r.estado || 'pendiente'] = r.c; });
  res.json({ total, releads, resumen, limit: lim, offset: off });
});

// Asigna releads seleccionados a una GP: crea los leads y entran al Kanban.
app.post('/api/releads/asignar', puedeAsignar, (req, res) => {
  const { telefonos, asesor } = req.body;
  if (!Array.isArray(telefonos) || !telefonos.length) return res.status(400).json({ error: 'Faltan telefonos' });
  if (!L.ASESORES.includes(asesor)) return res.status(400).json({ error: 'Asesor no valido. Opciones: ' + L.ASESORES.join(', ') });
  const ahora = new Date().toISOString();
  const getRe = db.prepare("SELECT * FROM marketing_historial WHERE telefono = ? AND estado = 'pendiente'");
  const existeLead = db.prepare('SELECT codigo FROM leads WHERE telefono = ?');
  const insLead = db.prepare(`INSERT INTO leads (codigo,nombre,telefono,email,fuente,campana,asesor,montoReal,montoPotencial,montoRango,fechaCarga,fechaAsignacion)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const updRe = db.prepare("UPDATE marketing_historial SET estado='asignado', codigoLead=?, asignadoA=?, fechaAsignado=? WHERE telefono=?");
  let creados = 0, yaExistian = 0, noEncontrados = 0;
  const nuevosCods = [];
  db.exec('BEGIN');
  try {
    for (const tel of telefonos) {
      const re = getRe.get(tel);
      if (!re) { noEncontrados++; continue; }
      const ya = existeLead.get(tel);
      let codigo;
      if (ya) { codigo = ya.codigo; yaExistian++; }
      else {
        codigo = generarCodigo();
        insLead.run(codigo, re.nombre || 'Sin nombre', re.telefono, re.email || null, re.origen || null, re.campana || null,
          asesor, re.montoReal, re.montoReal, re.montoRango, ahora, ahora);
        creados++; nuevosCods.push(codigo);
      }
      updRe.run(codigo, asesor, ahora, tel);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: String(e.message || e) });
  }
  // Aviso por correo a la GP por cada lead nuevo creado desde releads.
  nuevosCods.forEach(c => notificarAsignacion(db.prepare('SELECT * FROM leads WHERE codigo = ?').get(c), asesor));
  auditar(req, 'asignar-relead', `${creados + yaExistian} releads`, 'a ' + asesor);
  res.json({ ok: true, creados, yaExistian, noEncontrados, asesor });
});

// Descarta releads (no se trabajaran).
app.post('/api/releads/descartar', soloAdminOJefa, (req, res) => {
  const { telefonos } = req.body;
  if (!Array.isArray(telefonos) || !telefonos.length) return res.status(400).json({ error: 'Faltan telefonos' });
  const st = db.prepare("UPDATE marketing_historial SET estado='descartado' WHERE telefono=? AND estado='pendiente'");
  let n = 0; telefonos.forEach(t => { if (st.run(t).changes) n++; });
  res.json({ ok: true, descartados: n });
});

// Reinicia el control de sincronizacion (re-baseline). Solo admin.
app.post('/api/marketing/sheets/reset', soloAdmin, (req, res) => {
  res.json(sheetsSync.reset());
});

// Purga los leads creados por error desde las hojas Meta/TikTok (y limpia su
// bandeja). NO toca leads de landing/test ni leads manuales. Solo admin.
// Sin confirmar=1 devuelve solo la vista previa (cuantos borraria).
app.post('/api/marketing/sheets/purgar', soloAdmin, (req, res) => {
  const SEL = "SELECT codigoLead FROM marketing_ingresos WHERE origen IN ('meta','tiktok') AND estado='creado' AND codigoLead IS NOT NULL";
  const leadsN = db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE codigo IN (${SEL})`).get().n;
  const ingN = db.prepare("SELECT COUNT(*) AS n FROM marketing_ingresos WHERE origen IN ('meta','tiktok')").get().n;
  const confirmar = req.query.confirmar === '1' || (req.body && req.body.confirmar === true);
  if (!confirmar) {
    return res.json({ ok: true, preview: true, leadsABorrar: leadsN, ingresosABorrar: ingN, nota: 'Agrega ?confirmar=1 para ejecutar el borrado.' });
  }
  db.exec('BEGIN');
  try {
    db.exec(`DELETE FROM gestiones WHERE codigo IN (${SEL})`);
    db.exec(`DELETE FROM llamadas WHERE codigo IN (${SEL})`);
    db.exec(`DELETE FROM leads WHERE codigo IN (${SEL})`);
    db.exec("DELETE FROM marketing_ingresos WHERE origen IN ('meta','tiktok')");
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
  sheetsSync.reset();
  auditar(req, 'purgar-sheets', null, `${leadsN} leads + ${ingN} ingresos meta/tiktok`);
  res.json({ ok: true, leadsBorrados: leadsN, ingresosBorrados: ingN, controlReiniciado: true });
});

// ---------- Migracion unica: sello de transiciones historicas ----------
// Reconstruye, a partir de las gestiones ya existentes, cuando cada lead entro
// a cada etapa. Idempotente: solo corre una vez (flag en app_config).
function migrarTransicionesHistoricas() {
  try {
    const hecho = db.prepare("SELECT valor FROM app_config WHERE clave='migracion_transiciones'").get();
    if (hecho && hecho.valor === 'ok') return;
    const leads = db.prepare('SELECT * FROM leads').all();
    const insT = db.prepare('INSERT INTO transiciones_etapa (codigo,etapa_origen,etapa_destino,fecha,asesor) VALUES (?,?,?,?,?)');
    let total = 0;
    db.exec('BEGIN');
    for (const lead of leads) {
      const gs = gestionesDeLead(lead.codigo); // ordenadas por fecha
      if (!gs.length) continue;
      let etapaPrev = L.consolidarLead(lead, []).etapa; // etapa inicial sin gestiones
      for (let i = 0; i < gs.length; i++) {
        const etapaAct = L.consolidarLead(lead, gs.slice(0, i + 1)).etapa;
        if (etapaAct !== etapaPrev) {
          insT.run(lead.codigo, etapaPrev, etapaAct, gs[i].fecha, gs[i].asesor);
          etapaPrev = etapaAct;
          total++;
        }
      }
    }
    db.prepare("INSERT INTO app_config (clave,valor) VALUES ('migracion_transiciones','ok') ON CONFLICT(clave) DO UPDATE SET valor='ok'").run();
    db.exec('COMMIT');
    console.log(`[migracion] transiciones historicas reconstruidas: ${total}`);
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    console.error('[migracion] error en transiciones historicas:', e.message);
  }
}
migrarTransicionesHistoricas();

// ---------- Respaldo automatico diario (snapshot local con rotacion) ----------
// Protege ante corrupcion o datos mal escritos. Conserva los ultimos 7 dias.
// NOTA: vive en el mismo volumen; para proteger ante perdida del volumen,
// descarga el backup manual periodicamente o usa snapshots del volumen en Railway.
function snapshotDiario() {
  try {
    const dir = path.join(DB_DIR, 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const fecha = new Date().toISOString().slice(0, 10);
    const destino = path.join(dir, `crm-${fecha}.db`);
    if (fs.existsSync(destino)) fs.unlinkSync(destino);
    db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
    const files = fs.readdirSync(dir).filter(f => /^crm-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    while (files.length > 7) { try { fs.unlinkSync(path.join(dir, files.shift())); } catch (e) {} }
    console.log('[backup] snapshot diario OK:', destino);
  } catch (e) { console.error('[backup] error en snapshot:', e.message); }
}
setTimeout(snapshotDiario, 30000);                 // 30s despues de arrancar
setInterval(snapshotDiario, 24 * 60 * 60 * 1000);  // cada 24h

const server = app.listen(PORT, () => console.log(`CRM Tasatop Web v1.110 (Mensajeria: bloqueo en construccion para GPs - ven el modulo congelado con overlay, admin/jefa acceso completo) corriendo en puerto ${PORT}`));

// Apagado limpio: cuando Railway reemplaza la version envia SIGTERM. Cerramos
// ordenado y salimos con codigo 0 para que NO se marque como "crashed".
function apagarLimpio(sig) {
  console.log(`Recibido ${sig}: cerrando servidor de forma limpia...`);
  server.close(() => {
    try { db.close(); } catch (e) {}
    process.exit(0);
  });
  // Red de seguridad: si algo no cierra en 8s, salimos igual con codigo 0.
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => apagarLimpio('SIGTERM'));
process.on('SIGINT', () => apagarLimpio('SIGINT'));
