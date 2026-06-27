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
const multer = require('multer');
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

// Carpeta de subidas en el MISMO volumen persistente que la base (no se pierde en redeploys).
const UPLOADS_DIR = path.join(DB_DIR, 'uploads', 'b2b');
try { if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) { console.error('No se pudo crear carpeta de subidas:', e.message); }
// Multer: guarda en uploads/b2b/<codigoSolicitud>/<archivo>. Límite 20MB. Solo PDF e imágenes.
const b2bUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOADS_DIR, String(req.params.codigo || 'sin-codigo').replace(/[^A-Za-z0-9_-]/g, ''));
      try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); cb(null, dir); } catch (e) { cb(e); }
    },
    filename: (req, file, cb) => {
      const base = (file.originalname || 'archivo').replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
      cb(null, Date.now() + '_' + base);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Solo se permiten PDF e imágenes (JPG, PNG, WEBP)'), ok);
  }
});
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
    rol TEXT NOT NULL CHECK (rol IN ('admin','jefa','gestora','asistente_creditos','funcionario_b2b','jefe_creditos','jefe_b2b')),
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
crearUsuario('cpovis@tasatop.com', 'Cristian Povis', 'gestora', '12345678');

// Columna para el interruptor de auto-asignacion (1 = recibe leads automaticos).
try { db.exec('ALTER TABLE usuarios ADD COLUMN autoasignar INTEGER DEFAULT 1'); } catch (e) { /* ya existe */ }
try { db.exec('ALTER TABLE usuarios ADD COLUMN rankingVisible INTEGER DEFAULT 1'); } catch (e) { /* ya existe */ }
// Migración: ampliar el CHECK de roles para incluir el equipo B2B (SQLite no permite ALTER de CHECK in-place).
try {
  const tdef = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='usuarios'").get();
  if (tdef && tdef.sql && !tdef.sql.includes('jefe_creditos')) {
    db.exec('BEGIN');
    db.exec(`CREATE TABLE usuarios_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      rol TEXT NOT NULL CHECK (rol IN ('admin','jefa','gestora','asistente_creditos','funcionario_b2b','jefe_creditos','jefe_b2b')),
      hash TEXT NOT NULL,
      sal TEXT NOT NULL,
      activo INTEGER DEFAULT 1,
      autoasignar INTEGER DEFAULT 1,
      rankingVisible INTEGER DEFAULT 1
    )`);
    db.exec('INSERT INTO usuarios_new (id,usuario,nombre,rol,hash,sal,activo,autoasignar,rankingVisible) SELECT id,usuario,nombre,rol,hash,sal,COALESCE(activo,1),COALESCE(autoasignar,1),COALESCE(rankingVisible,1) FROM usuarios');
    db.exec('DROP TABLE usuarios');
    db.exec('ALTER TABLE usuarios_new RENAME TO usuarios');
    db.exec('COMMIT');
    console.log('[migracion] usuarios: roles B2B (asistente_creditos, funcionario_b2b, jefe_creditos, jefe_b2b) habilitados');
  }
} catch (e) { try { db.exec('ROLLBACK'); } catch (_) { } console.error('[migracion usuarios] error:', e.message); }

// Equipo B2B (clave inicial 12345678). DESPUÉS de la migración: el CHECK ya permite los roles.
// Jefes supervisan; equipos operan. Idempotente (INSERT OR IGNORE).
crearUsuario('ehiga@tasatop.com', 'Eduardo Higa', 'jefe_creditos', '12345678');
crearUsuario('lsanchez@tasatop.com', 'Luis Sanchez', 'asistente_creditos', '12345678');
crearUsuario('cmartinez@tasatop.com', 'Carmen Martinez', 'asistente_creditos', '12345678');
crearUsuario('dleon@tasatop.com', 'Dante Leon', 'jefe_b2b', '12345678');
crearUsuario('bvasquez@tasatop.com', 'Brillite Vasquez', 'funcionario_b2b', '12345678');
crearUsuario('sponte@tasatop.com', 'Shirley Ponte', 'funcionario_b2b', '12345678');
crearUsuario('bsegil@tasatop.com', 'Bony Segil', 'funcionario_b2b', '12345678');

// ===== MÓDULO B2B (crowdlending empresarial) — Fase 1: solicitudes =====
db.exec(`
  CREATE TABLE IF NOT EXISTS b2b_solicitudes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    ruc TEXT,
    razonSocial TEXT,
    nombreComercial TEXT,
    contacto TEXT,
    telefono TEXT,
    email TEXT,
    fuente TEXT,
    campana TEXT,
    montoSolicitado REAL,
    ticket TEXT,
    sector TEXT,
    actividad TEXT,
    antiguedadMeses INTEGER,
    ventasEstimadas REAL,
    destinoFondos TEXT,
    fuenteRepago TEXT,
    estado TEXT DEFAULT 'Nuevo',
    asistente TEXT,
    funcionario TEXT,
    responsableActual TEXT,
    fechaIngreso TEXT,
    fechaPrimerToque TEXT,
    fechaFinCredito TEXT,
    fechaLlamadaGarantia TEXT,
    fechaTraspaso TEXT,
    scoreTemp INTEGER,
    temperatura TEXT,
    resultadoCredito TEXT,
    resultadoGarantia TEXT,
    resultadoFinanzas TEXT,
    alertaPrincipal TEXT,
    motivoDescarte TEXT,
    proximaAccion TEXT,
    fechaLimite TEXT,
    objeciones TEXT,
    observaciones TEXT,
    tieneInmueble TEXT,
    tipoInmueble TEXT,
    areaInmueble TEXT,
    archivado INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_b2b_estado ON b2b_solicitudes(estado);
  CREATE INDEX IF NOT EXISTS idx_b2b_ruc ON b2b_solicitudes(ruc);
  CREATE TABLE IF NOT EXISTS b2b_ingresos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fechaRecepcion TEXT,
    origen TEXT,
    estado TEXT,
    ruc TEXT,
    razonSocial TEXT,
    contacto TEXT,
    telefono TEXT,
    email TEXT,
    monto REAL,
    tieneInmueble TEXT,
    tipoInmueble TEXT,
    areaInmueble TEXT,
    formulario TEXT,
    utmSource TEXT,
    utmMedium TEXT,
    utmCampaign TEXT,
    codigoSolicitud TEXT,
    asignadoA TEXT,
    mensajeError TEXT,
    rawJson TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_b2bing_estado ON b2b_ingresos(estado);
  CREATE TABLE IF NOT EXISTS b2b_garantia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigoSolicitud TEXT NOT NULL,
    tipoInmueble TEXT,
    departamento TEXT,
    provincia TEXT,
    distrito TEXT,
    direccion TEXT,
    linkMaps TEXT,
    titularidad TEXT,
    propietario TEXT,
    copropietarios TEXT,
    relacionPropietario TEXT,
    inscritoSunarp TEXT,
    partidaRegistral TEXT,
    cargas TEXT,
    ocupacion TEXT,
    materialNoble TEXT,
    servicios TEXT,
    primeraHipoteca TEXT,
    valorEstimado REAL,
    observaciones TEXT,
    actualizadoEn TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_b2bgar_sol ON b2b_garantia(codigoSolicitud);
  CREATE TABLE IF NOT EXISTS b2b_documentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigoSolicitud TEXT NOT NULL,
    etapa TEXT,
    tipoDoc TEXT,
    nombreArchivo TEXT,
    rutaArchivo TEXT,
    mime TEXT,
    tamano INTEGER,
    subidoPor TEXT,
    subidoEn TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_b2bdoc_sol ON b2b_documentos(codigoSolicitud);
  CREATE TABLE IF NOT EXISTS b2b_filtros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigoSolicitud TEXT NOT NULL,
    tipoFiltro TEXT NOT NULL,
    checklist TEXT,
    semaforo TEXT,
    observaciones TEXT,
    responsable TEXT,
    actualizadoEn TEXT,
    UNIQUE(codigoSolicitud, tipoFiltro)
  );
  CREATE INDEX IF NOT EXISTS idx_b2bfil_sol ON b2b_filtros(codigoSolicitud);
  CREATE TABLE IF NOT EXISTS b2b_credito_sujetos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigoSolicitud TEXT NOT NULL,
    tipoSujeto TEXT NOT NULL,
    nombre TEXT,
    documento TEXT,
    checklist TEXT,
    semaforo TEXT,
    observaciones TEXT,
    orden INTEGER DEFAULT 0,
    actualizadoEn TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_b2bcred_sol ON b2b_credito_sujetos(codigoSolicitud);
`);
// Columnas de garantía añadidas a solicitudes ya existentes (despliegues previos de v1.149).
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN tieneInmueble TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN tipoInmueble TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN areaInmueble TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN sunatRaw TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN sunatEstado TEXT"); } catch (e) { } // 'ok' | 'pendiente' | 'error'
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN sunatVerificadoEn TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN sunatDepartamento TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN sunatDistrito TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_documentos ADD COLUMN sujetoId INTEGER"); } catch (e) { }
// Atribución completa de marketing (conjunto = adset, anuncio = ad)
try { db.exec("ALTER TABLE leads ADD COLUMN conjunto TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE leads ADD COLUMN anuncio TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE leads ADD COLUMN adId TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE leads ADD COLUMN origenCreacion TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE marketing_ingresos ADD COLUMN conjunto TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE marketing_ingresos ADD COLUMN anuncio TEXT"); } catch (e) { }
// Catálogo de anuncios: junta cada anuncio único y permite guardar su imagen (creativo).
db.exec(`CREATE TABLE IF NOT EXISTS anuncios_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campana TEXT,
  conjunto TEXT,
  anuncio TEXT,
  adId TEXT,
  imagenUrl TEXT,
  primeraVez TEXT,
  actualizadoEn TEXT,
  UNIQUE(campana, conjunto, anuncio)
);`);
// Gasto/rendimiento diario por anuncio (de Meta/Make). Clave única (fecha, anuncio) para upsert.
db.exec(`CREATE TABLE IF NOT EXISTS marketing_gasto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT,
  campana TEXT,
  conjunto TEXT,
  anuncio TEXT,
  adId TEXT,
  creativeUrl TEXT,
  igLink TEXT,
  objective TEXT,
  status TEXT,
  costo REAL,
  impresiones INTEGER,
  clicks INTEGER,
  fbLeads INTEGER,
  mensajes INTEGER,
  landingB2C INTEGER,
  landingB2B INTEGER,
  resultados INTEGER,
  nomenclatura TEXT,
  mes TEXT,
  tipoCampana TEXT,
  objetivoCampana TEXT,
  actualizadoEn TEXT,
  UNIQUE(fecha, anuncio)
);`);
// Recuperación/recálculo de atribución: relee el rawJson de cada lead y reescribe campaña/conjunto/anuncio
// con el mapeo correcto por UTM (utm_campaign/utm_term/utm_content). Reprocesa TODOS (mapeo corregido).
(function backfillAtribucion() {
  try {
    const todos = db.prepare('SELECT codigo FROM leads').all();
    let updated = 0;
    for (const l of todos) {
      const ing = db.prepare("SELECT origen, rawJson, conjunto, anuncio, adId FROM marketing_ingresos WHERE codigoLead=? ORDER BY id DESC LIMIT 1").get(l.codigo);
      if (!ing || !ing.rawJson) continue;
      let conj = null, anun = null, camp = null, adId = ing.adId;
      try {
        const norm = L.normalizarLeadMarketing(ing.origen, JSON.parse(ing.rawJson));
        conj = norm.conjunto; anun = norm.anuncio; camp = norm.campana; adId = adId || norm.adId;
      } catch (e) { continue; }
      if (conj || anun || camp) {
        // Reescribe la atribución (mapeo corregido); conserva campaña si la nueva viene vacía.
        db.prepare("UPDATE leads SET campana=COALESCE(?,campana), conjunto=?, anuncio=?, adId=COALESCE(?,adId) WHERE codigo=?")
          .run(camp || null, conj || null, anun || null, adId || null, l.codigo);
        updated++;
      }
    }
    // Poblar el catálogo con todos los anuncios ya conocidos por los leads.
    db.prepare("SELECT DISTINCT campana, conjunto, anuncio, adId FROM leads WHERE campana IS NOT NULL OR conjunto IS NOT NULL OR anuncio IS NOT NULL").all()
      .forEach(r => registrarAnuncioCatalogo(r.campana, r.conjunto, r.anuncio, r.adId));
    if (updated) console.log('Atribución recalculada (mapeo UTM) en', updated, 'leads');
    // Marca el origen de creación de cada lead (make = vino por webhook; relead = desde la base de releads).
    let marcados = 0;
    db.prepare("UPDATE leads SET origenCreacion='make' WHERE (origenCreacion IS NULL OR origenCreacion='') AND codigo IN (SELECT codigoLead FROM marketing_ingresos WHERE codigoLead IS NOT NULL)").run();
    db.prepare("UPDATE leads SET origenCreacion='relead' WHERE (origenCreacion IS NULL OR origenCreacion='') AND codigo IN (SELECT codigoLead FROM marketing_historial WHERE codigoLead IS NOT NULL)").run();
    // Lo que quede sin marcar y no tenga atribución se considera manual/otro.
    const r = db.prepare("UPDATE leads SET origenCreacion='manual' WHERE origenCreacion IS NULL OR origenCreacion=''").run();
    marcados = (r && r.changes) || 0;
    if (marcados) console.log('Origen de creación marcado en', marcados, 'leads restantes (manual)');
  } catch (e) { console.error('Backfill atribución:', e.message); }
})();
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
// IDs de llamadas marcadas como buzón por el evento call.voicemail_left (por si call.ended llega después).
const BUZON_IDS = new Map();
//   POST /api/webhooks/aircall/:token   (token = variable de entorno AIRCALL_WEBHOOK_TOKEN)
// Match del lead por numero de telefono (ultimos 9 digitos).
app.post('/api/webhooks/aircall/:token', (req, res) => {
  const esperado = process.env.AIRCALL_WEBHOOK_TOKEN || '';
  if (!esperado || req.params.token !== esperado) {
    return res.status(403).json({ error: 'Token invalido' });
  }
  try {
    const ev = req.body || {};
    // Formato real de Aircall: { resource, event, timestamp, token, data: {...} }
    const tipo = ev.event || '';
    const c = ev.data || {};
    // Evento dedicado de buzón: si Aircall lo dispara, marcamos esa llamada como NO contestada (buzón) con certeza.
    if (tipo === 'call.voicemail_left') {
      const vid = String(c.id || '');
      if (vid) {
        try { db.prepare('UPDATE llamadas SET contestada=0 WHERE aircall_id=?').run(vid); } catch (e) { }
        BUZON_IDS.set(vid, Date.now()); // por si call.ended llega después
        console.log('[aircall] *** call.voicemail_left recibido ***  id=' + vid, '-> marcada como buzón');
      }
      return res.json({ ok: true, evento: 'voicemail_left', id: vid });
    }
    // Registramos solo call.ended: trae todos los datos (duracion, answered_at, etc.).
    // call.created/hungup se ignoran para no guardar registros incompletos.
    if (tipo !== 'call.ended') {
      return res.json({ ok: true, ignorado: tipo });
    }
    const direccion = c.direction === 'inbound' ? 'entrante' : 'saliente';
    // El numero de la otra parte (el lead) viene SIEMPRE en raw_digits.
    const numeroLead = c.raw_digits || '';
    const cel9 = L.normalizarCelular(numeroLead);
    // Buscar lead cuyo telefono termine en esos 9 digitos
    let lead = null;
    if (cel9) {
      lead = db.prepare("SELECT * FROM leads WHERE COALESCE(archivado,0)=0 AND replace(replace(telefono,' ',''),'-','') LIKE ?")
        .get('%' + cel9);
    }
    // Contestada SOLO si la otra parte respondió (answered_at)... y NO fue buzón de voz.
    // OJO: c.duration incluye la timbrada; y Aircall marca answered_at al caer al buzón aunque nadie humano contestó.
    const aa = Number(c.answered_at || 0);
    const sa = Number(c.started_at || 0);
    const ea = Number(c.ended_at || 0);
    const ring = (aa > 0 && sa > 0 && aa > sa) ? (aa - sa) : 0; // segundos timbrando antes de "contestar"
    const talk = (aa > 0 && ea > aa) ? (ea - aa) : 0;           // segundos de "conversación"
    // Buzón explícito (si Aircall lo manda) o heurística: timbró ≥12s y "habló" ≤25s (patrón típico de buzón:
    // timbra varios segundos y luego solo se oye el saludo). Las llamadas reales timbran poco o hablan mucho.
    const buzonTxt = String(c.ended_reason || c.missed_call_reason || c.hangup_cause || c.status || '').toLowerCase();
    const buzonExplicito = !!c.voicemail || /voicemail|buzon|buzón|answering|machine/.test(buzonTxt);
    const buzonHeuristico = aa > 0 && ring >= 12 && talk <= 25;
    // Certeza por evento dedicado (si Aircall lo disparó para esta llamada).
    const idEnded = String(c.id || '');
    const marcadoBuzon = BUZON_IDS.has(idEnded);
    if (marcadoBuzon) BUZON_IDS.delete(idEnded);
    // Limpieza de marcas viejas (>10 min) para no acumular memoria.
    const ahoraMs = Date.now();
    for (const [k, t] of BUZON_IDS) { if (ahoraMs - t > 600000) BUZON_IDS.delete(k); }
    const fueBuzon = buzonExplicito || marcadoBuzon || buzonHeuristico;
    const contestada = (aa > 0 && !fueBuzon) ? 1 : 0;
    let duracion;
    if (contestada) {
      duracion = talk || Number(c.duration || 0);                       // tiempo de conversación real
    } else if (fueBuzon && ring > 0) {
      duracion = ring;                                                   // timbró hasta caer al buzón
    } else {
      duracion = (sa > 0 && ea > sa) ? (ea - sa) : Number(c.duration || 0); // timbrada/espera
    }
    const agente = (c.user && (c.user.name || c.user.email)) || null;
    const fecha = new Date((c.ended_at ? c.ended_at * 1000 : Date.now())).toISOString();
    const aircallId = String(c.id || ('ac-' + Date.now()));

    db.prepare(`INSERT OR IGNORE INTO llamadas
      (aircall_id, codigo, telefono, direccion, contestada, duracion, agente, fecha, crudo)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(aircallId, lead ? lead.codigo : null, numeroLead || null, direccion,
           contestada, duracion, agente, fecha, JSON.stringify(ev).slice(0, 16000));

    console.log('[aircall] Llamada', direccion, contestada ? 'contestada' : 'no contestada',
      duracion + 's', '->', lead ? lead.codigo : 'sin match', numeroLead);
    res.json({ ok: true, lead: lead ? lead.codigo : null });
  } catch (e) {
    console.error('[aircall] Error procesando webhook:', e.message);
    res.json({ ok: false, error: e.message }); // 200 igual, para que Aircall no reintente en bucle
  }
});

// Webhook B2B: recepción de solicitudes de empresas (landing, meta, tiktok…).
// Token propio B2B_WEBHOOK_TOKEN (cae a MARKETING_WEBHOOK_TOKEN si no está definido, para pruebas).
// :origen = landing | meta | tiktok | test
app.post('/api/webhooks/b2b/:origen/:token', (req, res) => {
  const esperado = process.env.B2B_WEBHOOK_TOKEN || process.env.MARKETING_WEBHOOK_TOKEN;
  if (!esperado || req.params.token !== esperado) return res.status(403).json({ error: 'Token invalido' });
  let norm;
  try {
    norm = normalizarB2B(req.params.origen, req.body || {});
  } catch (e) {
    guardarIngresoB2B({ origen: String(req.params.origen || '').toLowerCase(), rawJson: JSON.stringify(req.body || {}).slice(0, 16000) }, 'error_validacion', 'Error al normalizar: ' + e.message, null, null);
    return res.status(200).json({ ok: true, estado: 'error_validacion' });
  }
  let resultado;
  try {
    resultado = procesarSolicitudB2B(norm);
  } catch (e) {
    guardarIngresoB2B(norm, 'error_validacion', 'Error al procesar: ' + e.message, null, null);
    return res.status(200).json({ ok: true, estado: 'error_validacion' });
  }
  const idIngreso = guardarIngresoB2B(norm, resultado.estado, resultado.mensajeError, resultado.codigoSolicitud, resultado.asignadoA);
  res.json({ ok: true, estado: resultado.estado, ingresoId: idIngreso, codigoSolicitud: resultado.codigoSolicitud || null, asignadoA: resultado.asignadoA || null });
});

// Middleware: toda la API (salvo login y webhooks publicos) requiere sesion.
app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  // Los webhooks de marketing se autentican por token en la URL, no por sesion.
  if (req.path.startsWith('/webhooks/leads/')) return next();
  if (req.path.startsWith('/webhooks/b2b/')) return next();
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

// ===== Helpers B2B =====
function generarCodigoB2B() {
  const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const pref = `B2B-${hoy}-`;
  const row = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo LIKE ? ORDER BY codigo DESC LIMIT 1').get(pref + '%');
  let n = row ? (parseInt(row.codigo.slice(pref.length), 10) || 0) : 0;
  const existe = db.prepare('SELECT 1 FROM b2b_solicitudes WHERE codigo = ?');
  let codigo;
  do { n++; codigo = pref + String(n).padStart(6, '0'); } while (existe.get(codigo));
  return codigo;
}
// Ticket por monto: Bajo 50k–300k, Medio 300k–1M, Alto >1M
function ticketDeMonto(monto) {
  const m = Number(monto) || 0;
  if (m >= 1000000) return 'Alto';
  if (m >= 300000) return 'Medio';
  return 'Bajo';
}
// Acceso al módulo B2B: admin/jefa supervisan; asistente_creditos y funcionario_b2b operan.
function puedeB2B(user) {
  return ['admin', 'jefa', 'asistente_creditos', 'funcionario_b2b', 'jefe_creditos', 'jefe_b2b'].includes(user.rol);
}
// ¿Puede administrar el equipo B2B (toggle de round-robin)? Admin y jefes B2B.
function puedeGestionarEquipoB2B(user) {
  return ['admin', 'jefe_creditos', 'jefe_b2b'].includes(user.rol);
}
function soloB2B(req, res, next) {
  if (!puedeB2B(req.user)) return res.status(403).json({ error: 'Sin acceso al módulo B2B' });
  next();
}

// Extrae departamento y distrito del domicilio fiscal de SUNAT.
// Formato: "<dirección> <DEPARTAMENTO> - <PROVINCIA> - <DISTRITO>". El departamento va pegado a la dirección.
const DEPARTAMENTOS_PE = ['MADRE DE DIOS', 'SAN MARTIN', 'LA LIBERTAD', 'AMAZONAS', 'ANCASH', 'APURIMAC', 'AREQUIPA', 'AYACUCHO', 'CAJAMARCA', 'CALLAO', 'CUSCO', 'HUANCAVELICA', 'HUANUCO', 'ICA', 'JUNIN', 'LAMBAYEQUE', 'LIMA', 'LORETO', 'MOQUEGUA', 'PASCO', 'PIURA', 'PUNO', 'TACNA', 'TUMBES', 'UCAYALI'];
function parseUbicacionSunat(domicilio) {
  if (!domicilio) return {};
  const parts = String(domicilio).split(/\s+-\s+/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 3) return {};
  const distrito = parts[parts.length - 1];
  const addrSeg = parts[parts.length - 3].toUpperCase();
  const ordenados = DEPARTAMENTOS_PE.slice().sort((a, b) => b.length - a.length); // match más largo primero
  let departamento = null;
  for (const d of ordenados) { if (addrSeg === d || addrSeg.endsWith(' ' + d)) { departamento = d; break; } }
  if (!departamento) { const t = addrSeg.split(/\s+/); departamento = t[t.length - 1]; } // fallback: última palabra
  return { departamento, distrito };
}

// Enriquecimiento SUNAT: consulta el microservicio (POST /consultar-ruc {ruc}) y guarda `data` en sunatRaw.
// Asíncrona y tolerante: si falla, deja la solicitud en 'pendiente' para reintentar. Nunca lanza.
async function enriquecerSunat(codigo, opts = {}) {
  const base = process.env.SUNAT_API_URL;
  const sol = db.prepare('SELECT codigo, ruc, razonSocial FROM b2b_solicitudes WHERE codigo=?').get(codigo);
  if (!sol) return { ok: false, motivo: 'solicitud_inexistente' };
  const ruc = (opts.ruc || sol.ruc || '').toString().trim();
  if (!ruc || ruc.length !== 11) {
    db.prepare("UPDATE b2b_solicitudes SET sunatEstado='pendiente' WHERE codigo=?").run(codigo);
    return { ok: false, motivo: 'sin_ruc_valido' };
  }
  if (!base) {
    db.prepare("UPDATE b2b_solicitudes SET sunatEstado='pendiente' WHERE codigo=?").run(codigo);
    return { ok: false, motivo: 'sin_api_configurada' };
  }
  const ahora = new Date().toISOString();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000); // SUNAT scrapea: damos margen
    const resp = await fetch(base.replace(/\/+$/, '') + '/consultar-ruc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruc }),
      signal: ctrl.signal
    });
    clearTimeout(t);
    const json = await resp.json().catch(() => null);
    if (!json || json.success !== true || !json.data) {
      db.prepare("UPDATE b2b_solicitudes SET sunatEstado='error', sunatVerificadoEn=? WHERE codigo=?")
        .run(ahora, codigo);
      return { ok: false, motivo: 'consulta_fallida', mensaje: (json && json.message) || 'Sin datos' };
    }
    const data = json.data;
    // SUNAT es la fuente de verdad: SOBREESCRIBE razón social, nombre comercial, sector, actividad y antigüedad.
    const sol2 = db.prepare('SELECT sunatDepartamento FROM b2b_solicitudes WHERE codigo=?').get(codigo);
    const sets = ['sunatRaw=?', "sunatEstado='ok'", 'sunatVerificadoEn=?'];
    const vals = [JSON.stringify(data).slice(0, 16000), ahora];
    if (data.razonSocial) { sets.push('razonSocial=?'); vals.push(data.razonSocial); }
    if (data.nombreComercial != null) { sets.push('nombreComercial=?'); vals.push(data.nombreComercial || null); }
    // Actividad principal: primer elemento de actividadesEconomicas (ej. "Principal - 4690 - VENTA AL POR MAYOR...").
    const actPrincipal = Array.isArray(data.actividadesEconomicas) && data.actividadesEconomicas.length ? String(data.actividadesEconomicas[0]).trim() : null;
    if (actPrincipal) {
      sets.push('actividad=?'); vals.push(actPrincipal);
      // Rubro/sector: la glosa de la actividad (lo que va después del CIIU). "Principal - 4690 - VENTA..." -> "VENTA...".
      const partes = actPrincipal.split(' - ');
      const glosa = partes.length >= 3 ? partes.slice(2).join(' - ').trim() : (partes.length === 2 ? partes[1].trim() : actPrincipal);
      sets.push('sector=?'); vals.push(glosa);
    }
    // Antigüedad en meses desde fechaInicioActividades (formato dd/mm/aaaa). Siempre se recalcula.
    if (data.fechaInicioActividades) {
      const m = String(data.fechaInicioActividades).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) {
        const ini = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        if (!isNaN(ini)) {
          const hoyD = new Date();
          let meses = (hoyD.getFullYear() - ini.getFullYear()) * 12 + (hoyD.getMonth() - ini.getMonth());
          if (hoyD.getDate() < ini.getDate()) meses -= 1;
          if (meses >= 0) { sets.push('antiguedadMeses=?'); vals.push(meses); }
        }
      }
    }
    // Ubicación: departamento y distrito del domicilio fiscal (se rellena si está vacío).
    if ((!sol2.sunatDepartamento || !sol2.sunatDepartamento.trim()) && data.domicilioFiscal) {
      const ub = parseUbicacionSunat(data.domicilioFiscal);
      if (ub.departamento) { sets.push('sunatDepartamento=?'); vals.push(ub.departamento); }
      if (ub.distrito) { sets.push('sunatDistrito=?'); vals.push(ub.distrito); }
    }
    vals.push(codigo);
    db.prepare('UPDATE b2b_solicitudes SET ' + sets.join(', ') + ' WHERE codigo=?').run(...vals);
    return { ok: true, data };
  } catch (e) {
    db.prepare("UPDATE b2b_solicitudes SET sunatEstado='error', sunatVerificadoEn=? WHERE codigo=?").run(ahora, codigo);
    return { ok: false, motivo: 'excepcion', mensaje: e.message };
  }
}
// Dispara el enriquecimiento sin bloquear (fire-and-forget).
function enriquecerSunatAsync(codigo) {
  Promise.resolve().then(() => enriquecerSunat(codigo)).catch(() => { });
}

// Operadores B2B en la rotación: roles B2B con autoasignar=1 (Diego controla quién entra).
function operadoresB2BParaAuto() {
  return db.prepare("SELECT nombre FROM usuarios WHERE rol IN ('asistente_creditos','funcionario_b2b') AND activo=1 AND COALESCE(autoasignar,1)=1 ORDER BY id")
    .all().map(r => r.nombre);
}
function elegirOperadorB2BRoundRobin() {
  const ops = operadoresB2BParaAuto();
  if (!ops.length) return null;
  const row = db.prepare("SELECT valor FROM app_config WHERE clave='rr_b2b_ultimo'").get();
  const idx = row ? ops.indexOf(row.valor) : -1;
  const siguiente = ops[(idx + 1) % ops.length];
  db.prepare("INSERT INTO app_config (clave,valor) VALUES ('rr_b2b_ultimo',?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor")
    .run(siguiente);
  return siguiente;
}

// Normaliza el celular peruano a 9 dígitos (quita +51, espacios, guiones).
function normalizarTelefonoB2B(t) {
  if (!t) return null;
  let s = String(t).replace(/[^0-9]/g, '');
  if (s.startsWith('51') && s.length > 9) s = s.slice(s.length - 9);
  return s.length >= 9 ? s.slice(-9) : s;
}
// Normaliza el payload del webhook B2B. Acepta claves limpias (ruc, telefono, email, monto…)
// y cae a heurística para landings tipo Elementor (email por regex, garantía por nombre de campo).
function normalizarB2B(origen, body) {
  const b = body || {};
  const keys = Object.keys(b);
  const val = (...nombres) => {
    for (const n of nombres) { if (b[n] != null && String(b[n]).trim() !== '') return String(b[n]).trim(); }
    return null;
  };
  // email: clave directa o el primer valor que parezca correo
  let email = val('email', 'correo', 'Correo', 'Email');
  if (!email) {
    const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    for (const k of keys) { if (re.test(String(b[k] || '').trim())) { email = String(b[k]).trim(); break; } }
  }
  const telefono = normalizarTelefonoB2B(val('telefono', 'Telefono', 'celular', 'Celular', 'phone'));
  const ruc = val('ruc', 'RUC');
  // monto: clave directa; si no, barrido excluyendo RUC, teléfono, DNI y números con pinta de esos.
  let montoRaw = val('monto', 'montoSolicitado', 'Monto');
  if (!montoRaw) {
    const telRaw = normalizarTelefonoB2B(telefono);
    for (const k of keys) {
      const kl = k.toLowerCase();
      if (kl.includes('ruc') || kl.includes('telefono') || kl.includes('celular') || kl.includes('phone') || kl.includes('dni')) continue;
      const digits = String(b[k]).replace(/[^0-9.]/g, '');
      const entero = digits.replace(/\./g, '');
      const n = Number(digits);
      if (!isFinite(n) || n < 10000) continue;
      if (entero.length === 11 || entero.length === 9) continue; // pinta de RUC o teléfono
      if (entero === ruc || entero === telRaw) continue;
      montoRaw = String(b[k]); break;
    }
  }
  const monto = montoRaw != null ? (Number(String(montoRaw).replace(/[^0-9.]/g, '')) || null) : null;
  // nombre/contacto: si coincide con el teléfono (error típico de landing), se ignora
  let contacto = val('contacto', 'nombre', 'Nombre', 'nombres');
  if (contacto && normalizarTelefonoB2B(contacto) === telefono) contacto = null;
  // garantía: por nombre de campo (preguntas largas del formulario)
  let tieneInmueble = val('tieneInmueble', 'tiene_inmueble');
  let tipoInmueble = val('tipoInmueble', 'tipo_inmueble');
  let areaInmueble = val('area', 'areaInmueble', 'area_inmueble');
  for (const k of keys) {
    const kl = k.toLowerCase();
    if (!tieneInmueble && (kl.includes('propiedad') || kl.includes('cuenta con'))) tieneInmueble = String(b[k]).trim();
    if (!tipoInmueble && kl.includes('tipo') && kl.includes('inmueble')) tipoInmueble = String(b[k]).trim();
  }
  return {
    origen: String(origen || 'landing').toLowerCase(),
    ruc,
    razonSocial: val('razonSocial', 'razon_social', 'empresa', 'Empresa', 'razonsocial'),
    contacto, telefono, email, monto,
    tieneInmueble, tipoInmueble, areaInmueble,
    formulario: val('form_name', 'formulario', 'form_id'),
    utmSource: val('utm_source', 'utmSource'),
    utmMedium: val('utm_medium', 'utmMedium'),
    utmCampaign: val('utm_campaign', 'utmCampaign'),
    fuente: String(origen || 'landing').toLowerCase(),
    rawJson: JSON.stringify(b).slice(0, 16000)
  };
}

// Guarda el ingreso bruto B2B en la bandeja (nada se pierde).
function guardarIngresoB2B(norm, estado, mensajeError, codigoSolicitud, asignadoA) {
  const r = db.prepare(`INSERT INTO b2b_ingresos
    (fechaRecepcion,origen,estado,ruc,razonSocial,contacto,telefono,email,monto,
     tieneInmueble,tipoInmueble,areaInmueble,formulario,utmSource,utmMedium,utmCampaign,
     codigoSolicitud,asignadoA,mensajeError,rawJson)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(new Date().toISOString(), norm.origen, estado, norm.ruc, norm.razonSocial, norm.contacto,
      norm.telefono, norm.email, norm.monto, norm.tieneInmueble, norm.tipoInmueble, norm.areaInmueble,
      norm.formulario, norm.utmSource, norm.utmMedium, norm.utmCampaign,
      codigoSolicitud || null, asignadoA || null, mensajeError || null, norm.rawJson);
  return r.lastInsertRowid;
}

// Procesa una solicitud B2B normalizada: dedup por RUC/teléfono, crea o marca para revisión manual.
// Estados terminales/archivados se tratan como "historial" (revisión manual).
const B2B_ESTADOS_TERMINALES = ['No elegible'];
function procesarSolicitudB2B(norm, opts = {}) {
  if (!norm.ruc && !norm.telefono) {
    return { estado: 'sin_datos', mensajeError: 'Sin RUC ni teléfono válidos — revisar manualmente' };
  }
  // Dedup: RUC manda; si no hay RUC, por teléfono.
  let existente = null;
  if (norm.ruc) existente = db.prepare('SELECT * FROM b2b_solicitudes WHERE ruc = ? ORDER BY id DESC LIMIT 1').get(norm.ruc);
  if (!existente && norm.telefono) existente = db.prepare('SELECT * FROM b2b_solicitudes WHERE telefono = ? ORDER BY id DESC LIMIT 1').get(norm.telefono);
  if (existente) {
    const terminal = B2B_ESTADOS_TERMINALES.includes(existente.estado) || existente.archivado;
    if (terminal) {
      return { estado: 'duplicado_historial', codigoSolicitud: existente.codigo, mensajeError: `⚠ Ya existe en historial (${existente.codigo}, ${existente.estado}) — la revisión es manual` };
    }
    return { estado: 'duplicado_activo', codigoSolicitud: existente.codigo, mensajeError: `⚠ Solicitud activa duplicada (${existente.codigo}) — gestión manual` };
  }
  // Nueva: se crea automática en estado Nuevo, con round-robin entre operadores B2B.
  const codigo = generarCodigoB2B();
  const ahora = new Date().toISOString();
  const ticket = norm.monto != null ? ticketDeMonto(norm.monto) : null;
  const op = opts.sinAutoasignar ? null : elegirOperadorB2BRoundRobin();
  db.prepare(`INSERT INTO b2b_solicitudes
    (codigo, ruc, razonSocial, contacto, telefono, email, fuente, montoSolicitado, ticket,
     tieneInmueble, tipoInmueble, areaInmueble, estado, asistente, responsableActual, fechaIngreso)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(codigo, norm.ruc, norm.razonSocial, norm.contacto, norm.telefono, norm.email, norm.origen,
      norm.monto, ticket, norm.tieneInmueble, norm.tipoInmueble, norm.areaInmueble,
      'Nuevo', op, op, ahora);
  enriquecerSunatAsync(codigo); // enriquecimiento SUNAT en segundo plano (no bloquea el webhook)
  return { estado: 'creado', codigoSolicitud: codigo, asignadoA: op || null };
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
     fuente,campana,conjunto,anuncio,formulario,campaignId,adsetId,adId,leadIdExterno,
     utmSource,utmMedium,utmCampaign,utmContent,montoRecibido,codigoLead,mensajeError,rawJson)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      new Date().toISOString(), norm.origen, estado,
      norm.nombre, norm.telefonoRecibido, norm.telefonoNormalizado, norm.email,
      norm.fuente, norm.campana, norm.conjunto || null, norm.anuncio || null, norm.formulario,
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
  db.prepare(`INSERT INTO leads (codigo,nombre,telefono,email,fuente,campana,conjunto,anuncio,adId,asesor,montoReal,montoPotencial,montoRango,fechaCarga,fechaAsignacion,origenCreacion)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'make')`)
    .run(codigo, norm.nombre || 'Sin nombre', norm.telefonoNormalizado, norm.email || null,
         norm.fuente || null, norm.campana || null, norm.conjunto || null, norm.anuncio || null, norm.adId || null,
         gp || null, monto, monto, rango, ahora, gp ? ahora : null);
  registrarAnuncioCatalogo(norm.campana, norm.conjunto, norm.anuncio, norm.adId);
  if (gp) notificarAsignacion(db.prepare('SELECT * FROM leads WHERE codigo = ?').get(codigo), gp);
  return { estado: 'creado', codigoLead: codigo, mensajeError: avisoMismoNombre, asignadoA: gp || null };
}

// Upsert de un anuncio en el catálogo (para luego adjuntarle su imagen). Ignora si no hay datos.
function registrarAnuncioCatalogo(campana, conjunto, anuncio, adId) {
  if (!campana && !conjunto && !anuncio) return;
  const ahora = new Date().toISOString();
  try {
    db.prepare(`INSERT INTO anuncios_meta (campana, conjunto, anuncio, adId, primeraVez, actualizadoEn)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(campana, conjunto, anuncio) DO UPDATE SET adId=COALESCE(excluded.adId, anuncios_meta.adId), actualizadoEn=excluded.actualizadoEn`)
      .run(campana || null, conjunto || null, anuncio || null, adId || null, ahora, ahora);
  } catch (e) { }
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
  // 0 = ilimitado (por defecto). Configurable con GESTIONES_LIMITE_HORA en Railway.
  const LIMITE_HORA = parseInt(process.env.GESTIONES_LIMITE_HORA || '0', 10);
  if (LIMITE_HORA > 0) {
    const haceUnaHora = new Date(Date.now() - 3600 * 1000).toISOString();
    const enUltimaHora = db.prepare(
      'SELECT COUNT(*) AS c FROM gestiones WHERE asesor = ? AND fecha >= ?'
    ).get(g.asesor, haceUnaHora).c;
    if (enUltimaHora >= LIMITE_HORA) {
      return res.status(422).json({ error: `Demasiadas gestiones en poco tiempo (${LIMITE_HORA}/hora). Revisa y reintenta en unos minutos.` });
    }
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
    // ¿Gestión "Llamada" respaldada por una llamada real de Aircall (±5 min)?
    const gt = new Date(g.fecha).getTime();
    const verificada = g.canal === 'Llamada' && llamadas.some(ll => Math.abs(new Date(ll.fecha).getTime() - gt) <= 5 * 60 * 1000);
    eventos.push({
      tipo: 'gestion', fecha: g.fecha,
      titulo: tituloResultado(g.resultado), sub: g.comentario || subtituloResultado(g.resultado, g),
      actor: g.asesor || lead.asesor || '', canal: g.canal, verificada,
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
    const mmss = ll.duracion ? (Math.floor(ll.duracion / 60) + ':' + String(ll.duracion % 60).padStart(2, '0')) : '';
    const detalle = ll.contestada
      ? ('Contestada' + (mmss ? ' · ' + mmss : ''))
      : ('No contestada' + (mmss ? ' · timbró ' + mmss : ''));
    eventos.push({
      tipo: 'llamada', fecha: ll.fecha,
      titulo: 'Llamada ' + ll.direccion, sub: detalle,
      via: 'Aircall',
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
    asesor: lead.asesor, fechaAsignacion: lead.fechaAsignacion,
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

// Editar manualmente la fecha de asignación de un lead (admin/jefa). Recibe ISO UTC.
app.put('/api/leads/:codigo/fecha-asignacion', (req, res) => {
  if (!veTodo(req.user)) return res.status(403).json({ error: 'No autorizado' });
  const codigo = req.params.codigo;
  const fa = (req.body && req.body.fechaAsignacion) || '';
  const d = new Date(fa);
  if (!fa || isNaN(d.getTime())) return res.status(400).json({ error: 'Fecha inválida' });
  const lead = db.prepare('SELECT codigo FROM leads WHERE codigo = ?').get(codigo);
  if (!lead) return res.status(404).json({ error: 'Lead no existe' });
  db.prepare('UPDATE leads SET fechaAsignacion = ? WHERE codigo = ?').run(d.toISOString(), codigo);
  try { auditar(req, 'editar_fecha_asignacion', codigo, d.toISOString()); } catch (e) {}
  res.json({ ok: true, fechaAsignacion: d.toISOString() });
});

// Edita la atribución (y nombre) de un lead y lo propaga: leads + marketing_ingresos + catálogo.
app.put('/api/leads/:codigo/atribucion', soloAdminOJefa, (req, res) => {
  const codigo = req.params.codigo;
  const lead = db.prepare('SELECT codigo, adId FROM leads WHERE codigo = ?').get(codigo);
  if (!lead) return res.status(404).json({ error: 'Lead no existe' });
  const b = req.body || {};
  const limpio = v => (v == null ? null : String(v).trim() || null);
  const nombre = limpio(b.nombre), campana = limpio(b.campana), conjunto = limpio(b.conjunto), anuncio = limpio(b.anuncio);
  // 1) El lead (fuente de verdad para todo lo demás)
  const sets = ['campana=?', 'conjunto=?', 'anuncio=?']; const vals = [campana, conjunto, anuncio];
  if (nombre) { sets.unshift('nombre=?'); vals.unshift(nombre); }
  vals.push(codigo);
  db.prepare('UPDATE leads SET ' + sets.join(', ') + ' WHERE codigo=?').run(...vals);
  // 2) El registro de ingreso (consistencia)
  try { db.prepare('UPDATE marketing_ingresos SET campana=?, conjunto=?, anuncio=? WHERE codigoLead=?').run(campana, conjunto, anuncio, codigo); } catch (e) { }
  // 3) El catálogo de anuncios
  try { registrarAnuncioCatalogo(campana, conjunto, anuncio, lead.adId); } catch (e) { }
  try { auditar(req, 'editar_atribucion_lead', codigo, [campana, conjunto, anuncio].filter(Boolean).join(' / ')); } catch (e) { }
  res.json({ ok: true, campana, conjunto, anuncio, nombre });
});

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

// Auditoría B2B independiente: solo eventos del módulo B2B (accion empieza con 'b2b_' o código B2B-).
// Visible para admin y jefe B2B (Dante).
app.get('/api/b2b/auditoria', soloB2B, (req, res) => {
  if (!['admin', 'jefe_b2b'].includes(req.user.rol)) return res.status(403).json({ error: 'No autorizado' });
  let filas = db.prepare("SELECT * FROM auditoria WHERE accion LIKE 'b2b\\_%' ESCAPE '\\' OR codigo LIKE 'B2B-%' ORDER BY fecha DESC LIMIT 1000").all();
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
// Cumplimiento de la cadencia 3x5 con bandas horarias por hora de asignación.
// Bandas (hora Perú de asignación) -> intentos MÍNIMOS esperados el día 1:
//   00:00–11:59 -> 3 (mañana)   12:00–15:59 -> 2 (tarde)   16:00–23:59 -> 1 (noche)
//   Días 2 a 5 -> 3 cada uno. Son mínimos; el GP puede hacer más.
// Filtros (query): gp, estado ('enritmo'|'atrasado'), desde, hasta (fecha de asignación yyyy-mm-dd).
app.get('/api/dashboard/cadencia', (req, res) => {
  const SIN = L.RESULTADOS_SIN_CONTACTO || [];
  const peruDate = iso => new Date(new Date(iso).getTime() - 5 * 3600000);
  const diaDe = iso => peruDate(iso).toISOString().slice(0, 10);
  const hmDe = iso => { const d = peruDate(iso); return d.getUTCHours() + d.getUTCMinutes() / 60; }; // hora decimal Perú
  // Bandas: <11:00 -> 3 intentos (band 0) · 11:00–15:29:59 -> 2 (band 1) · 15:30–23:59 -> 1 (band 2)
  const bandDe = hm => (hm < 12 ? 0 : (hm < 16 ? 1 : 2));
  const diffDias = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000);
  const hoy = new Date(new Date().getTime() - 5 * 3600000).toISOString().slice(0, 10);

  // Clasificar el resultado de una gestión
  const NEG = ['Respondio - no interesado', 'Respondio - no califica', 'Numero equivocado', 'Numero invalido', 'Desistio'];
  const CALIF = ['Respondio - calificado', 'Agendo reunion', 'Confirmo reunion', 'Reprogramo reunion', 'Reunion efectiva', 'En negociacion', 'Venta ganada'];
  function estadoResultado(r) {
    if (SIN.includes(r)) return 'sinresp';
    if (CALIF.includes(r)) return 'cal';
    if (r === 'Respondio - sin calificar') return 'sincal';
    if (NEG.includes(r)) return 'descarte';
    return 'sincal';
  }
  const peso = { cal: 4, sincal: 3, descarte: 2, sinresp: 1 };

  // Filtros
  const fGP = (req.query.gp || '').trim();
  const fEstado = (req.query.estado || '').trim();
  let desde = (req.query.desde || '').trim();
  let hasta = (req.query.hasta || '').trim();
  if (!hasta) hasta = hoy;
  if (!desde) { const d = new Date(hasta + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 6); desde = d.toISOString().slice(0, 10); }

  const filas = db.prepare('SELECT * FROM leads WHERE COALESCE(archivado,0)=0 AND fechaAsignacion IS NOT NULL').all();
  const gpsSet = new Set();
  const fResultado = (req.query.resultado || '').trim();

  // Pre-filtrar por fecha y GP, y juntar para el ancla de columnas
  const sel = [];
  filas.forEach(lead => {
    if (lead.asesor) gpsSet.add(lead.asesor);
    const diaAsig = diaDe(lead.fechaAsignacion);
    if (diaAsig < desde || diaAsig > hasta) return;
    if (fGP && lead.asesor !== fGP) return;
    sel.push({ lead, diaAsig });
  });
  // Ancla de las 5 columnas = fecha de asignación más antigua del conjunto (o 'desde')
  let ancla = desde;
  sel.forEach(s => { if (s.diaAsig < ancla) ancla = s.diaAsig; });
  const colDates = [];
  for (let i = 0; i < 5; i++) { const d = new Date(ancla + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i); colDates.push(d.toISOString().slice(0, 10)); }

  const leadsCad = [];
  sel.forEach(({ lead, diaAsig }) => {
    const bandAsig = bandDe(hmDe(lead.fechaAsignacion));
    const gs = db.prepare('SELECT fecha,resultado FROM gestiones WHERE codigo=? ORDER BY fecha ASC').all(lead.codigo);

    // Métricas por la ventana propia del lead (offset desde su asignación)
    const realizadosPorDia = [0, 0, 0, 0, 0];
    let realizados = 0, califEnLlamada = null, nAttempt = 0, outcome = 'vacio';
    gs.forEach(g => {
      const off = diffDias(diaDe(g.fecha), diaAsig);
      const est = estadoResultado(g.resultado);
      if (off >= 0 && off <= 4) {
        realizadosPorDia[off]++; realizados++; nAttempt++;
        if (califEnLlamada === null && est === 'cal') califEnLlamada = nAttempt;
        if ((peso[est] || 0) > (peso[outcome] || 0)) outcome = est;
      }
    });

    // Celdas en FECHAS ABSOLUTAS (5 columnas). 'na' antes de asignar; 'vacio' esperado; o el estado del intento.
    const celdas = [];
    const celdasHoras = []; // horas (am/pm Perú) de las gestiones que cayeron en cada celda, para tooltip
    for (let ci = 0; ci < 5; ci++) {
      const cd = colDates[ci];
      celdas.push([0, 1, 2].map(s => {
        if (cd < diaAsig) return 'na';
        if (cd === diaAsig && s < bandAsig) return 'na';
        return 'vacio';
      }));
      celdasHoras.push([[], [], []]);
    }
    const horaAmPm = iso => {
      const dd = new Date(new Date(iso).getTime() - 5 * 3600000);
      let hh = dd.getUTCHours(); const mm = dd.getUTCMinutes();
      const ap = hh < 12 ? 'am' : 'pm'; let h12 = hh % 12; if (h12 === 0) h12 = 12;
      return h12 + ':' + String(mm).padStart(2, '0') + ' ' + ap;
    };
    gs.forEach(g => {
      const ci = diffDias(diaDe(g.fecha), ancla);
      if (ci < 0 || ci > 4) return;
      const s = bandDe(hmDe(g.fecha));
      const est = estadoResultado(g.resultado);
      const cur = celdas[ci][s];
      if (cur === 'na') return;
      celdasHoras[ci][s].push(horaAmPm(g.fecha));
      if (cur === 'vacio' || (peso[est] || 0) >= (peso[cur] || 0)) celdas[ci][s] = est;
    });
    // Marcador de pauta (punto verde) bajo el slot de llegada
    const pautaCol = diffDias(diaAsig, ancla);
    const pautaSlot = bandAsig;

    // Cumplimiento / ponderado (ventana propia)
    const espDia = [3 - bandAsig, 3, 3, 3, 3];
    let diaCorte = hoy;
    if (califEnLlamada !== null) { for (const g of gs) { if (estadoResultado(g.resultado) === 'cal') { diaCorte = diaDe(g.fecha); break; } } }
    const elapsed = Math.min(5, Math.max(1, diffDias(diaCorte < hoy ? diaCorte : hoy, diaAsig) + 1));
    let espTot = 0, realCap = 0, cumpleTodos = true;
    for (let d = 0; d < elapsed; d++) {
      espTot += espDia[d];
      realCap += Math.min(realizadosPorDia[d], espDia[d]);
      if (realizadosPorDia[d] < espDia[d]) cumpleTodos = false;
    }
    const enRitmo = (califEnLlamada !== null) || cumpleTodos;

    // Estado actual + próxima acción (del último resultado)
    const cons = leadConsolidado(lead);

    leadsCad.push({
      codigo: lead.codigo, nombre: lead.nombre, gp: lead.asesor || 'Sin asignar',
      asignadoISO: lead.fechaAsignacion, diaAsig, bandAsig,
      celdas, celdasHoras, pautaCol, pautaSlot, outcome,
      realizados, esperados: espTot, realCap, enRitmo, califEnLlamada,
      etapa: cons.etapa, etapaVisible: trEtapaServer(cons.etapa),
      proximaAccion: cons.proximaAccion ? trAccionServer(cons.proximaAccion, cons.etapa) : null,
      fechaProxAccion: cons.fechaProxAccion || null,
    });
  });

  let lista = leadsCad;
  if (fEstado === 'enritmo') lista = lista.filter(l => l.enRitmo);
  else if (fEstado === 'atrasado') lista = lista.filter(l => !l.enRitmo);
  if (fResultado) lista = lista.filter(l => l.outcome === fResultado);

  // Por GP (sobre el conjunto filtrado por fecha/gp, antes del filtro de estado/resultado)
  const porGPmap = {};
  leadsCad.forEach(l => {
    const k = l.gp;
    if (!porGPmap[k]) porGPmap[k] = { nombre: k, leads: 0, enRitmo: 0, realizados: 0, dias: 0, atrasados: 0 };
    const g = porGPmap[k];
    g.leads++; if (l.enRitmo) g.enRitmo++; else g.atrasados++;
    g.realizados += l.realizados; g.dias += Math.max(1, Math.round(l.esperados / 3));
  });
  const porGP = Object.values(porGPmap).map(g => ({
    nombre: g.nombre, pct: g.leads ? Math.round((g.enRitmo / g.leads) * 100) : 0,
    intentosDia: g.dias ? +(g.realizados / g.dias).toFixed(1) : 0, leads: g.leads, atrasados: g.atrasados,
  })).sort((a, b) => b.pct - a.pct);

  const total = leadsCad.length;
  const enRitmoT = leadsCad.filter(l => l.enRitmo).length;
  const espGlobal = leadsCad.reduce((s, l) => s + l.esperados, 0);
  const realCapGlobal = leadsCad.reduce((s, l) => s + l.realCap, 0);
  const califs = leadsCad.filter(l => l.califEnLlamada !== null);
  const conexProm = califs.length ? +(califs.reduce((s, l) => s + l.califEnLlamada, 0) / califs.length).toFixed(1) : null;

  // ───── Highlights agregados de contactabilidad ─────
  // Funnel: llegaron -> tocados -> conectados -> calificados
  const tocados = leadsCad.filter(l => l.realizados > 0).length;
  const conectados = leadsCad.filter(l => ['cal', 'sincal'].includes(l.outcome)).length;
  const calificados = leadsCad.filter(l => l.outcome === 'cal').length;
  // Reacción: tocados el mismo día de llegada / dentro de la franja de pauta; horas hasta el 1er intento
  let tocadosMismoDia = 0, tocadosEnPauta = 0, sumaHorasPrimer = 0, conPrimer = 0;
  // Abandono: tuvieron intentos pero hace >=2 días sin tocar y no calificaron
  let abandonados = 0;
  // Descartes: intentos antes de descartar
  let sumaIntentosDescarte = 0, nDescarte = 0;
  // Conteo de intentos y conexiones para tasas
  let totIntentos = 0, totConexiones = 0, totRespuestas = 0;
  leadsCad.forEach(l => {
    const gs = db.prepare('SELECT fecha,resultado FROM gestiones WHERE codigo=? ORDER BY fecha ASC').all(l.codigo);
    const enVentana = gs.filter(g => { const o = diffDias(diaDe(g.fecha), l.diaAsig); return o >= 0 && o <= 4; });
    if (enVentana.length) {
      const primero = enVentana[0];
      // mismo día
      if (diaDe(primero.fecha) === l.diaAsig) tocadosMismoDia++;
      // dentro de la franja de pauta (mismo día y misma banda de llegada)
      if (diaDe(primero.fecha) === l.diaAsig && bandDe(hmDe(primero.fecha)) === l.bandAsig) tocadosEnPauta++;
      // horas hasta el primer intento
      const hrs = (new Date(primero.fecha) - new Date(l.asignadoISO)) / 3600000;
      if (hrs >= 0 && hrs < 240) { sumaHorasPrimer += hrs; conPrimer++; }
    }
    enVentana.forEach(g => {
      const e = estadoResultado(g.resultado);
      totIntentos++;
      if (e !== 'sinresp') totRespuestas++;             // hubo respuesta
      if (e === 'cal' || e === 'sincal') totConexiones++; // conexión efectiva
    });
    // abandono: tuvo intentos, no calificó, y el último intento fue hace >= 2 días
    if (l.realizados > 0 && l.outcome !== 'cal') {
      let ultDia = null;
      enVentana.forEach(g => { ultDia = diaDe(g.fecha); });
      if (ultDia && diffDias(hoy, ultDia) >= 2) abandonados++;
    }
    // intentos antes de descartar
    if (l.outcome === 'descarte') {
      let n = 0;
      for (const g of enVentana) { n++; if (estadoResultado(g.resultado) === 'descarte') break; }
      sumaIntentosDescarte += n; nDescarte++;
    }
  });

  const highlights = {
    funnel: { llegaron: total, tocados, conectados, calificados },
    reaccion: {
      tocadosMismoDiaPct: total ? Math.round((tocadosMismoDia / total) * 100) : 0,
      tocadosEnPautaPct: total ? Math.round((tocadosEnPauta / total) * 100) : 0,
      minutosPrimerIntento: conPrimer ? Math.round((sumaHorasPrimer / conPrimer) * 60) : null,
    },
    efectividad: {
      tasaConexion: totIntentos ? Math.round((totConexiones / totIntentos) * 100) : 0,
      tasaRespuesta: totIntentos ? Math.round((totRespuestas / totIntentos) * 100) : 0,
      tasaCalificacion: conectados ? Math.round((calificados / conectados) * 100) : 0,
      conexionProm: conexProm,
    },
    salud: {
      abandonados,
      abandonadosPct: total ? Math.round((abandonados / total) * 100) : 0,
      intentosAntesDescarte: nDescarte ? +(sumaIntentosDescarte / nDescarte).toFixed(1) : null,
    },
    distribucion: {
      cal: calificados,
      sincal: leadsCad.filter(l => l.outcome === 'sincal').length,
      sinresp: leadsCad.filter(l => l.outcome === 'sinresp').length,
      descarte: leadsCad.filter(l => l.outcome === 'descarte').length,
      vacio: leadsCad.filter(l => l.outcome === 'vacio').length,
    },
  };

  // Distribución de resultados por GP (una barra por gestora)
  const distGPmap = {};
  leadsCad.forEach(l => {
    const k = l.gp;
    if (!distGPmap[k]) distGPmap[k] = { nombre: k, cal: 0, sincal: 0, sinresp: 0, descarte: 0, vacio: 0, total: 0 };
    distGPmap[k][l.outcome] = (distGPmap[k][l.outcome] || 0) + 1;
    distGPmap[k].total++;
  });
  const distribucionGP = Object.values(distGPmap).sort((a, b) => b.total - a.total);

  res.json({
    filtros: { gp: fGP, estado: fEstado, resultado: fResultado, desde, hasta },
    gpsDisponibles: Array.from(gpsSet).sort(),
    colDates,
    resumen: {
      cumplimientoPct: total ? Math.round((enRitmoT / total) * 100) : 0,
      toquesPonderadoPct: espGlobal ? Math.round((realCapGlobal / espGlobal) * 100) : 0,
      sinCumplir: total - enRitmoT,
      conexionProm: conexProm,
      calificados: califs.length,
    },
    highlights,
    distribucionGP,
    leads: lista.sort((a, b) => a.enRitmo - b.enRitmo || a.diaAsig.localeCompare(b.diaAsig) || a.nombre.localeCompare(b.nombre)).slice(0, 200),
  });
});

// Leads de MARKETING por franja horaria de recepción (incluye duplicados activos e historial).
// Cuenta marketing_ingresos (todo lo que entra por el webhook), no la tabla leads.
app.get('/api/dashboard/llegadas-horario', (req, res) => {
  const peruHora = iso => new Date(new Date(iso).getTime() - 5 * 3600000).getUTCHours();
  const peruDia = iso => new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 10);
  const desde = (req.query.desde || '').trim();
  const hasta = (req.query.hasta || '').trim();
  // Estados que cuentan como "lead que llegó" (incluye duplicados); se excluyen los errores de validación.
  const VALIDOS = ['creado', 'duplicado_activo', 'duplicado_perdido', 'duplicado_ganado', 'duplicado_historial', 'sin_nombre'];
  const filas = db.prepare('SELECT fechaRecepcion, estado FROM marketing_ingresos WHERE fechaRecepcion IS NOT NULL').all();
  const bandas = [0, 0, 0, 0, 0, 0, 0, 0];
  let total = 0, nuevos = 0, duplicados = 0, sinNombre = 0;
  filas.forEach(f => {
    if (!VALIDOS.includes(f.estado)) return;
    const dia = peruDia(f.fechaRecepcion);
    if (desde && dia < desde) return;
    if (hasta && dia > hasta) return;
    bandas[Math.floor(peruHora(f.fechaRecepcion) / 3)]++;
    total++;
    if (f.estado === 'creado') nuevos++;
    else if (f.estado === 'sin_nombre') sinNombre++;
    else duplicados++;
  });
  res.json({ desde, hasta, total, nuevos, duplicados, sinNombre, bandas });
});

// ============== ATRIBUCIÓN: embudo por fuente (campaña / conjunto / anuncio) ==============
const ORD_ETAPA_ATRIB = {
  'Contactabilidad 3x5': 0, 'Contactado - por calificar': 1, 'Calificado - pendiente agendar': 2,
  'Agendado - pendiente reunion': 3, 'Reunion efectiva - seguimiento': 4, 'Cierre pendiente': 5,
  'Cerrado ganado': 6, 'Cerrado perdido': -1
};
app.get('/api/atribucion', soloAdminOJefa, (req, res) => {
  try {
    const nivel = ['campana', 'conjunto', 'anuncio'].includes(req.query.nivel) ? req.query.nivel : 'anuncio';
    const desde = req.query.desde || null, hasta = req.query.hasta || null;
    const origen = req.query.origen || 'make'; // por defecto solo leads de campaña (Make), sin releads
    let leadsRaw = db.prepare('SELECT * FROM leads').all();
    if (origen !== 'todos') leadsRaw = leadsRaw.filter(l => (l.origenCreacion || 'manual') === origen);
    if (desde) leadsRaw = leadsRaw.filter(l => l.fechaCarga && l.fechaCarga.slice(0, 10) >= desde);
    if (hasta) leadsRaw = leadsRaw.filter(l => l.fechaCarga && l.fechaCarga.slice(0, 10) <= hasta);
    // La etapa NO es columna: se calcula con leadConsolidado(lead, gestiones).
    // Traemos todas las gestiones una vez y las agrupamos por lead.
    const SIN = L.RESULTADOS_SIN_CONTACTO || [];
    const gPorCod = {};
    db.prepare('SELECT * FROM gestiones ORDER BY fecha').all().forEach(g => { (gPorCod[g.codigo] = gPorCod[g.codigo] || []).push(g); });
    const leads = leadsRaw.map(l => {
      const gs = gPorCod[l.codigo] || [];
      const cons = leadConsolidado(l, gs);
      const contactado = gs.some(g => !SIN.includes(g.resultado));
      return { campana: l.campana, conjunto: l.conjunto, anuncio: l.anuncio, adId: l.adId, etapa: cons.etapa, contactado };
    });
    // Agrupa por el nivel elegido.
    const grupos = {};
    leads.forEach(l => {
      const clave = ((l[nivel] || '').trim()) || '(sin dato)';
      if (!grupos[clave]) grupos[clave] = { fuente: clave, campana: l.campana, conjunto: l.conjunto, anuncio: l.anuncio, adId: l.adId, leads: 0, contactado: 0, calificado: 0, agendado: 0, reunion: 0, cierre: 0 };
      const g = grupos[clave];
      g.leads++;
      if (l.contactado) g.contactado++;
      const ord = ORD_ETAPA_ATRIB[l.etapa] != null ? ORD_ETAPA_ATRIB[l.etapa] : 0;
      if (ord >= 2) g.calificado++;
      if (ord >= 3) g.agendado++;
      if (ord >= 4) g.reunion++;
      if (l.etapa === 'Cerrado ganado') g.cierre++;
    });
    // Adjunta imagen del catálogo (por nombre de anuncio) y calcula conversión.
    const cat = db.prepare('SELECT anuncio, imagenUrl FROM anuncios_meta').all();
    const filas = Object.values(grupos).map(g => {
      g.conversion = g.leads ? Math.round((g.cierre / g.leads) * 1000) / 10 : 0;
      if (nivel === 'anuncio') { const hit = cat.find(c => c.anuncio === g.fuente); g.imagenUrl = hit ? hit.imagenUrl : null; }
      return g;
    }).sort((a, b) => b.leads - a.leads);
    res.json({ nivel, desde, hasta, totalLeads: leads.length, filas });
  } catch (e) {
    console.error('Error en /api/atribucion:', e.message);
    res.status(500).json({ error: 'Atribución: ' + e.message });
  }
});
// Catálogo de anuncios (para asignar imágenes).
app.get('/api/anuncios', soloAdminOJefa, (req, res) => {
  res.json(db.prepare('SELECT * FROM anuncios_meta ORDER BY campana, conjunto, anuncio').all());
});
// Guarda/actualiza la imagen (URL del creativo) de un anuncio por nombre.
app.put('/api/anuncios/imagen', soloAdminOJefa, (req, res) => {
  const b = req.body || {};
  if (!b.anuncio) return res.status(400).json({ error: 'Falta el anuncio' });
  const ahora = new Date().toISOString();
  const fila = db.prepare('SELECT id FROM anuncios_meta WHERE anuncio=?').get(b.anuncio);
  if (fila) db.prepare('UPDATE anuncios_meta SET imagenUrl=?, actualizadoEn=? WHERE id=?').run(b.imagenUrl || null, ahora, fila.id);
  else db.prepare('INSERT INTO anuncios_meta (campana, conjunto, anuncio, imagenUrl, primeraVez, actualizadoEn) VALUES (?,?,?,?,?,?)').run(b.campana || null, b.conjunto || null, b.anuncio, b.imagenUrl || null, ahora, ahora);
  res.json({ ok: true });
});

// Carga de gasto/rendimiento diario por anuncio (manual desde Excel o desde Make).
// Acepta { filas: [ { fecha, campana, conjunto, anuncio, adId, ... } ] }. Upsert por (fecha, anuncio).
app.post('/api/marketing/gasto/cargar', soloAdminOJefa, (req, res) => {
  try {
    const filas = (req.body && req.body.filas) || [];
    if (!Array.isArray(filas) || !filas.length) return res.status(400).json({ error: 'No llegaron filas' });
    const ahora = new Date().toISOString();
    const num = v => { const n = Number(v); return isNaN(n) ? null : n; };
    const ent = v => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
    const txt = v => (v == null ? null : String(v).trim() || null);
    const fechaISO = v => {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      const s = String(v).trim();
      const d = new Date(s);
      return isNaN(d.getTime()) ? s.slice(0, 10) : d.toISOString().slice(0, 10);
    };
    const up = db.prepare(`INSERT INTO marketing_gasto
      (fecha,campana,conjunto,anuncio,adId,creativeUrl,igLink,objective,status,costo,impresiones,clicks,fbLeads,mensajes,landingB2C,landingB2B,resultados,nomenclatura,mes,tipoCampana,objetivoCampana,actualizadoEn)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(fecha, anuncio) DO UPDATE SET
        campana=excluded.campana, conjunto=excluded.conjunto, adId=excluded.adId,
        creativeUrl=excluded.creativeUrl, igLink=excluded.igLink, objective=excluded.objective, status=excluded.status,
        costo=excluded.costo, impresiones=excluded.impresiones, clicks=excluded.clicks, fbLeads=excluded.fbLeads,
        mensajes=excluded.mensajes, landingB2C=excluded.landingB2C, landingB2B=excluded.landingB2B, resultados=excluded.resultados,
        nomenclatura=excluded.nomenclatura, mes=excluded.mes, tipoCampana=excluded.tipoCampana, objetivoCampana=excluded.objetivoCampana,
        actualizadoEn=excluded.actualizadoEn`);
    let ok = 0, omitidas = 0;
    db.exec('BEGIN');
    try {
      for (const f of filas) {
        const fecha = fechaISO(f.fecha), anuncio = txt(f.anuncio);
        if (!fecha || !anuncio) { omitidas++; continue; }
        up.run(fecha, txt(f.campana), txt(f.conjunto), anuncio, txt(f.adId), txt(f.creativeUrl), txt(f.igLink),
          txt(f.objective), txt(f.status), num(f.costo), ent(f.impresiones), ent(f.clicks), ent(f.fbLeads), ent(f.mensajes),
          ent(f.landingB2C), ent(f.landingB2B), ent(f.resultados), txt(f.nomenclatura), txt(f.mes), txt(f.tipoCampana), txt(f.objetivoCampana), ahora);
        // Registra el anuncio en el catálogo y guarda su creativo como imagen si no tiene.
        try { registrarAnuncioCatalogo(txt(f.campana), txt(f.conjunto), anuncio, txt(f.adId)); } catch (e) { }
        ok++;
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    // Adjunta el creativo al catálogo (imagen) para los anuncios que aún no tienen.
    try {
      db.prepare(`UPDATE anuncios_meta SET imagenUrl = (
        SELECT g.creativeUrl FROM marketing_gasto g WHERE g.anuncio = anuncios_meta.anuncio AND g.creativeUrl IS NOT NULL ORDER BY g.fecha DESC LIMIT 1
      ) WHERE (imagenUrl IS NULL OR imagenUrl='')`).run();
    } catch (e) { }
    try { auditar(req, 'cargar_gasto_marketing', String(ok) + ' filas', null); } catch (e) { }
    res.json({ ok: true, cargadas: ok, omitidas });
  } catch (e) {
    console.error('Error en /api/marketing/gasto/cargar:', e.message);
    res.status(500).json({ error: 'Carga de gasto: ' + e.message });
  }
});

// Cruce inversión × embudo: gasto por anuncio (o por anuncio+día) contra los leads reales del CRM.
// Usa fechaCarga (creación) del lead, NO la de asignación. Solo leads de campaña (origenCreacion='make').
app.get('/api/marketing/inversion', soloAdminOJefa, (req, res) => {
  try {
    const nivel = req.query.nivel === 'dia' ? 'dia' : 'anuncio';
    const desde = req.query.desde || null, hasta = req.query.hasta || null;
    const norm = s => String(s || '').trim().toLowerCase();
    const claveDe = (anuncioNorm, fecha) => nivel === 'dia' ? (anuncioNorm + '|' + fecha) : anuncioNorm;

    // 1) Gasto agregado
    let gastoRows = db.prepare('SELECT * FROM marketing_gasto').all();
    if (desde) gastoRows = gastoRows.filter(g => g.fecha >= desde);
    if (hasta) gastoRows = gastoRows.filter(g => g.fecha <= hasta);
    const filas = {};
    const ultStatus = {}; // anuncioNorm -> {fecha, status} para tomar el status más reciente
    gastoRows.forEach(g => {
      const an = norm(g.anuncio);
      const k = claveDe(an, g.fecha);
      if (!filas[k]) filas[k] = {
        clave: k, fecha: nivel === 'dia' ? g.fecha : null, anuncio: g.anuncio, campana: g.campana, conjunto: g.conjunto,
        adId: g.adId, creativeUrl: g.creativeUrl, igLink: g.igLink, tipo: g.objetivoCampana, status: g.status,
        costo: 0, impresiones: 0, clicks: 0, resultadosMeta: 0,
        leadsCRM: 0, contactado: 0, calificado: 0, agendado: 0, reunion: 0, cierre: 0
      };
      const f = filas[k];
      f.costo += g.costo || 0; f.impresiones += g.impresiones || 0; f.clicks += g.clicks || 0; f.resultadosMeta += g.resultados || 0;
      if (!f.creativeUrl && g.creativeUrl) f.creativeUrl = g.creativeUrl;
      if (!f.igLink && g.igLink) f.igLink = g.igLink;
      // status más reciente
      if (!ultStatus[an] || g.fecha > ultStatus[an].fecha) ultStatus[an] = { fecha: g.fecha, status: g.status };
    });
    if (nivel === 'anuncio') Object.values(filas).forEach(f => { const u = ultStatus[norm(f.anuncio)]; if (u) f.status = u.status; });

    // 2) Leads del CRM (solo make), agrupados por anuncio (+día si aplica), con su embudo
    const SIN = L.RESULTADOS_SIN_CONTACTO || [];
    const gPorCod = {};
    db.prepare('SELECT * FROM gestiones ORDER BY fecha').all().forEach(x => { (gPorCod[x.codigo] = gPorCod[x.codigo] || []).push(x); });
    let leads = db.prepare("SELECT * FROM leads WHERE origenCreacion='make'").all();
    leads.forEach(l => {
      const dia = (l.fechaCarga || '').slice(0, 10);
      if (desde && dia < desde) return;
      if (hasta && dia > hasta) return;
      const an = norm(l.anuncio);
      if (!an) return;
      const k = claveDe(an, dia);
      if (!filas[k]) filas[k] = {
        clave: k, fecha: nivel === 'dia' ? dia : null, anuncio: l.anuncio, campana: l.campana, conjunto: l.conjunto,
        adId: l.adId, creativeUrl: null, igLink: null, tipo: null, status: null,
        costo: 0, impresiones: 0, clicks: 0, resultadosMeta: 0,
        leadsCRM: 0, contactado: 0, calificado: 0, agendado: 0, reunion: 0, cierre: 0
      };
      const f = filas[k];
      const gs = gPorCod[l.codigo] || [];
      const cons = leadConsolidado(l, gs);
      const ord = ORD_ETAPA_ATRIB[cons.etapa] != null ? ORD_ETAPA_ATRIB[cons.etapa] : 0;
      f.leadsCRM++;
      if (gs.some(x => !SIN.includes(x.resultado))) f.contactado++;
      if (ord >= 2) f.calificado++;
      if (ord >= 3) f.agendado++;
      if (ord >= 4) f.reunion++;
      if (cons.etapa === 'Cerrado ganado') f.cierre++;
    });

    // 3) Métricas de costo
    const r2 = n => Math.round(n * 100) / 100;
    const arr = Object.values(filas).map(f => {
      f.costo = r2(f.costo);
      f.cplMeta = f.resultadosMeta ? r2(f.costo / f.resultadosMeta) : null;
      f.cplReal = f.leadsCRM ? r2(f.costo / f.leadsCRM) : null;
      f.costoAgendado = f.agendado ? r2(f.costo / f.agendado) : null;
      f.costoCierre = f.cierre ? r2(f.costo / f.cierre) : null;
      f.captura = f.resultadosMeta ? Math.round((f.leadsCRM / f.resultadosMeta) * 100) : null;
      return f;
    }).sort((a, b) => (b.costo - a.costo) || (b.leadsCRM - a.leadsCRM));

    // 4) Totales
    const T = arr.reduce((t, f) => {
      t.costo += f.costo; t.impresiones += f.impresiones; t.clicks += f.clicks; t.resultadosMeta += f.resultadosMeta;
      t.leadsCRM += f.leadsCRM; t.agendado += f.agendado; t.cierre += f.cierre; return t;
    }, { costo: 0, impresiones: 0, clicks: 0, resultadosMeta: 0, leadsCRM: 0, agendado: 0, cierre: 0 });
    T.costo = r2(T.costo);
    T.cplReal = T.leadsCRM ? r2(T.costo / T.leadsCRM) : null;
    T.cplMeta = T.resultadosMeta ? r2(T.costo / T.resultadosMeta) : null;
    T.costoCierre = T.cierre ? r2(T.costo / T.cierre) : null;
    T.captura = T.resultadosMeta ? Math.round((T.leadsCRM / T.resultadosMeta) * 100) : null;

    res.json({ nivel, desde, hasta, totales: T, filas: arr });
  } catch (e) {
    console.error('Error en /api/marketing/inversion:', e.message);
    res.status(500).json({ error: 'Inversión: ' + e.message });
  }
});

// Detalle lead por lead con su atribución y fechas (para rastrear/cuadrar y descargar).
app.get('/api/marketing/leads', soloAdminOJefa, (req, res) => {
  try {
    const SIN = L.RESULTADOS_SIN_CONTACTO || [];
    const gPorCod = {};
    db.prepare('SELECT * FROM gestiones ORDER BY fecha').all().forEach(g => { (gPorCod[g.codigo] = gPorCod[g.codigo] || []).push(g); });
    const filas = db.prepare('SELECT * FROM leads ORDER BY fechaCarga DESC').all().map(l => {
      const cons = leadConsolidado(l, gPorCod[l.codigo] || []);
      return {
        codigo: l.codigo, nombre: l.nombre, telefono: l.telefono,
        campana: l.campana || '', conjunto: l.conjunto || '', anuncio: l.anuncio || '',
        fuente: l.fuente || '', fechaCarga: l.fechaCarga, fechaAsignacion: l.fechaAsignacion,
        asesor: l.asesor || '', etapa: cons.etapa, archivado: l.archivado ? 1 : 0,
        origenCreacion: l.origenCreacion || 'manual'
      };
    });
    res.json({ total: filas.length, filas });
  } catch (e) {
    console.error('Error en /api/marketing/leads:', e.message);
    res.status(500).json({ error: 'Marketing leads: ' + e.message });
  }
});

// Ranking de contactabilidad del día (visible para todas). Cuenta gestiones de hoy por GP.
app.get('/api/ranking/contactabilidad', (req, res) => {
  const peruDia = iso => new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 10);
  const hoy = peruDia(new Date().toISOString());
  const META = 8; // meta GLOBAL del equipo: agendamientos del día (ya no es individual)
  const SIN = L.RESULTADOS_SIN_CONTACTO || [];
  const CALIF = ['Respondio - calificado', 'Agendo reunion', 'Confirmo reunion', 'Reprogramo reunion', 'Reunion efectiva', 'En negociacion', 'Venta ganada'];
  // Agendado de HOY: solo el acto de agendar/confirmar/reprogramar. NO reunión/negociación/cierre,
  // porque esas vienen de agendamientos pasados y no evidencian gestión de hoy.
  const AGEND = ['Agendo reunion', 'Confirmo reunion', 'Reprogramo reunion'];
  const m = {};
  // GPs ocultas del ranking (interruptor por usuario, sin tocar el código)
  const ocultas = new Set(
    db.prepare("SELECT nombre FROM usuarios WHERE rol='gestora' AND COALESCE(rankingVisible,1)=0").all().map(u => u.nombre)
  );
  (L.ASESORES || []).filter(a => !ocultas.has(a)).forEach(a => { m[a] = { asesor: a, intentos: 0, llamadas: 0, conectados: 0, calificados: 0, agendados: 0, verificadas: 0, puntosIntento: 0 }; });
  const gs = db.prepare('SELECT asesor, canal, resultado, fecha, codigo FROM gestiones').all();
  // Hora decimal Perú y franja del 3x5 (mañana <11:00, tarde 11:00–15:30, noche ≥15:30)
  const peruHM = iso => { const d = new Date(new Date(iso).getTime() - 5 * 3600000); return d.getUTCHours() + d.getUTCMinutes() / 60; };
  const franjaDe = hm => (hm < 12 ? 0 : (hm < 16 ? 1 : 2));
  // Calificados por GP y por día (para la racha histórica)
  const califDia = {};
  const gestLlamadaHoy = []; // gestiones tipo Llamada de hoy, para cruzar con Aircall
  const intentoGrupos = {}; // asesor -> { 'codigo|franja': nro de intentos } (para rendimiento decreciente)
  const intentoDia = {}; // asesor -> { dia: true } para la racha (se enciende con el 1er intento del dia)
  gs.forEach(g => {
    const dia = peruDia(g.fecha);
    if (CALIF.includes(g.resultado)) {
      (califDia[g.asesor] = califDia[g.asesor] || {});
      califDia[g.asesor][dia] = (califDia[g.asesor][dia] || 0) + 1;
    }
    if (dia !== hoy) return;
    if (ocultas.has(g.asesor)) return; // GP oculta del ranking
    if (!m[g.asesor]) m[g.asesor] = { asesor: g.asesor, intentos: 0, llamadas: 0, conectados: 0, calificados: 0, agendados: 0, verificadas: 0, puntosIntento: 0 };
    const r = m[g.asesor];
    r.intentos++;
    // Agrupar intento por lead + franja (corazón del 3x5: 1er intento de la franja vale 1, repetir +0.5)
    const fr = franjaDe(peruHM(g.fecha));
    const key = (g.codigo || '?') + '|' + fr;
    (intentoGrupos[g.asesor] = intentoGrupos[g.asesor] || {});
    intentoGrupos[g.asesor][key] = (intentoGrupos[g.asesor][key] || 0) + 1;
    if (g.canal === 'Llamada') { r.llamadas++; gestLlamadaHoy.push({ asesor: g.asesor, codigo: g.codigo, t: new Date(g.fecha).getTime() }); }
    if (!SIN.includes(g.resultado)) r.conectados++;
    if (CALIF.includes(g.resultado)) r.calificados++;
    if (AGEND.includes(g.resultado)) r.agendados++;
    (intentoDia[g.asesor] = intentoDia[g.asesor] || {})[dia] = true; // la racha se enciende con cualquier toque del día
  });
  // Puntos por intento con rendimiento decreciente: 1er intento de cada (lead, franja) = 1; cada repetición = +0.25
  Object.keys(intentoGrupos).forEach(a => {
    let p = 0;
    Object.values(intentoGrupos[a]).forEach(n => { p += 1 + 0.25 * (n - 1); });
    if (m[a]) m[a].puntosIntento = Math.round(p * 10) / 10;
  });
  // VERIFICACIÓN AIRCALL: una gestión "Llamada" se verifica si hay una llamada real de Aircall
  // al mismo lead dentro de ±5 min del registro. Match 1:1 (una llamada respalda una sola gestión).
  const VENTANA = 5 * 60 * 1000;
  const llamHoy = db.prepare('SELECT id, codigo, fecha FROM llamadas WHERE codigo IS NOT NULL').all()
    .filter(ll => peruDia(ll.fecha) === hoy)
    .map(ll => ({ id: ll.id, codigo: ll.codigo, t: new Date(ll.fecha).getTime(), usada: false }));
  gestLlamadaHoy.sort((a, b) => a.t - b.t).forEach(ge => {
    const cand = llamHoy.find(ll => !ll.usada && ll.codigo === ge.codigo && Math.abs(ll.t - ge.t) <= VENTANA);
    if (cand) { cand.usada = true; if (m[ge.asesor]) m[ge.asesor].verificadas++; }
  });
  // Racha: días seguidos con al menos un intento (se enciende con el 1er toque del día)
  const diaMenos = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  function rachaDe(asesor) {
    const dias = intentoDia[asesor] || {};
    let streak = 0;
    let cursor = dias[hoy] ? hoy : diaMenos(hoy, 1);
    for (let i = 0; i < 120; i++) { // tope de seguridad
      if (dias[cursor]) { streak++; cursor = diaMenos(cursor, 1); }
      else break;
    }
    return streak;
  }
  // Puntaje: intento (1, +0.25 por repetir franja) + conectado×2.5 + calificado×5 + agendado×15 + Call×1
  Object.values(m).forEach(r => {
    r.puntaje = Math.round((r.puntosIntento + r.conectados * 2.5 + r.calificados * 5 + r.agendados * 15 + (r.verificadas || 0) * 1) * 10) / 10;
    r.racha = rachaDe(r.asesor);
  });
  const ranking = Object.values(m).sort((a, b) =>
    b.puntaje - a.puntaje || b.agendados - a.agendados || b.calificados - a.calificados || b.conectados - a.conectados || a.asesor.localeCompare(b.asesor));
  // Segundos hasta el reinicio (medianoche Perú)
  const ahoraPeru = new Date(new Date().getTime() - 5 * 3600000);
  const finDia = new Date(ahoraPeru); finDia.setUTCHours(24, 0, 0, 0);
  const segundosReinicio = Math.max(0, Math.round((finDia - ahoraPeru) / 1000));
  // Etiquetas de los días de la racha, empezando por HOY hacia adelante (J, V, S, D...)
  const INI = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const diasRacha = [];
  for (let i = 0; i < 7; i++) { const dd = new Date(ahoraPeru); dd.setUTCDate(dd.getUTCDate() + i); diasRacha.push(INI[dd.getUTCDay()]); }
  const agendadosEquipo = Object.values(m).reduce((s, r) => s + (r.agendados || 0), 0);
  res.json({ fecha: hoy, actualizado: new Date().toISOString(), meta: META, metaGlobal: META, agendadosEquipo, segundosReinicio, diasRacha, pesos: { intento: 1, conexion: 2.5, calificado: 5, agendado: 15, call: 1 }, ranking });
});

// Diagnóstico Aircall (admin): muestra los campos crudos de las últimas llamadas para
// confirmar qué campo marca el buzón de voz y afinar la detección si hiciera falta.
app.get('/api/aircall/diagnostico', soloAdmin, (req, res) => {
  const filas = db.prepare('SELECT aircall_id, codigo, direccion, contestada, duracion, fecha, crudo FROM llamadas ORDER BY fecha DESC LIMIT 12').all();
  res.json(filas.map(f => {
    let ev = {}; try { ev = JSON.parse(f.crudo || '{}'); } catch (e) { }
    const c = ev.data || ev || {};
    return {
      aircall_id: f.aircall_id, codigo: f.codigo, direccion: f.direccion,
      contestada: f.contestada, duracion: f.duracion, fecha: f.fecha,
      // Todos los campos crudos que mandó Aircall (para encontrar el diferenciador del buzón):
      camposCrudos: c
    };
  }));
});

// ===== ENDPOINTS B2B — Fase 1 (alta, listado, detalle) =====
app.get('/api/b2b/solicitudes', soloB2B, (req, res) => {
  const estado = (req.query.estado || '').trim();
  const q = (req.query.q || '').trim().toLowerCase();
  const verArchivados = req.query.archivados === '1';
  let filas = db.prepare('SELECT * FROM b2b_solicitudes WHERE COALESCE(archivado,0)=? ORDER BY fechaIngreso DESC, id DESC').all(verArchivados ? 1 : 0);
  if (estado) filas = filas.filter(s => s.estado === estado);
  if (q) filas = filas.filter(s => [s.razonSocial, s.ruc, s.contacto, s.codigo].some(v => String(v || '').toLowerCase().includes(q)));
  res.json({ solicitudes: filas, total: filas.length });
});

app.get('/api/b2b/solicitudes/:codigo', soloB2B, (req, res) => {
  const s = db.prepare('SELECT * FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  res.json(s);
});

// Equipo B2B: listar miembros con su estado de round-robin (autoasignar).
// Qué roles puede VER/gestionar cada usuario en el panel de equipo.
function rolesGestionablesB2B(user) {
  if (user.rol === 'admin') return ['jefe_creditos', 'asistente_creditos', 'jefe_b2b', 'funcionario_b2b'];
  if (user.rol === 'jefe_creditos') return ['jefe_creditos', 'asistente_creditos']; // Eduardo: su área de créditos
  if (user.rol === 'jefe_b2b') return ['jefe_b2b', 'funcionario_b2b'];               // Dante: sus funcionarios
  return [];
}
app.get('/api/b2b/equipo', soloB2B, (req, res) => {
  const roles = rolesGestionablesB2B(req.user);
  if (!roles.length) return res.json({ equipo: [], puedeGestionar: false });
  const ph = roles.map(() => '?').join(',');
  const filas = db.prepare("SELECT usuario, nombre, rol, activo, COALESCE(autoasignar,1) AS autoasignar FROM usuarios WHERE rol IN (" + ph + ") ORDER BY CASE rol WHEN 'jefe_creditos' THEN 1 WHEN 'asistente_creditos' THEN 2 WHEN 'jefe_b2b' THEN 3 ELSE 4 END, id").all(...roles);
  res.json({ equipo: filas, puedeGestionar: puedeGestionarEquipoB2B(req.user) });
});
// Activar/desactivar a un operador del round-robin B2B (admin y jefes, cada jefe solo a su área).
app.post('/api/b2b/equipo/:usuario/autoasignar', soloB2B, (req, res) => {
  if (!puedeGestionarEquipoB2B(req.user)) return res.status(403).json({ error: 'No autorizado' });
  const u = db.prepare("SELECT usuario, nombre, rol, COALESCE(autoasignar,1) AS autoasignar FROM usuarios WHERE usuario=?").get(req.params.usuario);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!['asistente_creditos', 'funcionario_b2b'].includes(u.rol)) return res.status(400).json({ error: 'Solo operadores entran al round-robin (los jefes no)' });
  if (!rolesGestionablesB2B(req.user).includes(u.rol)) return res.status(403).json({ error: 'Solo puedes gestionar a tu propia área' });
  const nuevo = u.autoasignar ? 0 : 1;
  db.prepare('UPDATE usuarios SET autoasignar=? WHERE usuario=?').run(nuevo, u.usuario);
  auditar(req, 'b2b_toggle_rotacion', null, u.nombre + ' -> ' + (nuevo ? 'en rotación' : 'fuera de rotación'));
  res.json({ ok: true, autoasignar: nuevo });
});

// Archivar / desarchivar una solicitud B2B (no la borra; la saca de la lista activa).
app.put('/api/b2b/solicitudes/:codigo/archivar', soloB2B, (req, res) => {
  const s = db.prepare('SELECT codigo, archivado FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const nuevo = s.archivado ? 0 : 1;
  db.prepare('UPDATE b2b_solicitudes SET archivado=? WHERE codigo=?').run(nuevo, s.codigo);
  auditar(req, 'b2b_archivar_solicitud', s.codigo, nuevo ? 'archivada' : 'desarchivada');
  res.json({ ok: true, archivado: nuevo });
});
// Eliminar una solicitud B2B (admin y jefes B2B). Borra definitivamente.
app.delete('/api/b2b/solicitudes/:codigo', soloB2B, (req, res) => {
  if (!['admin', 'jefe_creditos', 'jefe_b2b'].includes(req.user.rol)) return res.status(403).json({ error: 'Solo admin o jefes B2B pueden eliminar' });
  const s = db.prepare('SELECT codigo, razonSocial, ruc FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  db.prepare('DELETE FROM b2b_solicitudes WHERE codigo=?').run(s.codigo);
  auditar(req, 'b2b_eliminar_solicitud', s.codigo, (s.razonSocial || s.ruc || ''));
  res.json({ ok: true });
});

// ===== FILTRO DE CRÉDITO: sujetos (empresa / representantes / vinculadas) y consolidado =====
// Consolidado = el PEOR semáforo de todos los sujetos (Rojo > Amarillo > Verde).
const ORDEN_SEM = { Verde: 0, Amarillo: 1, Rojo: 2 };
function consolidadoCredito(codigo) {
  const sujetos = db.prepare('SELECT semaforo FROM b2b_credito_sujetos WHERE codigoSolicitud=?').all(codigo);
  if (!sujetos.length) return null;
  let peor = null, peorVal = -1;
  for (const s of sujetos) {
    if (!s.semaforo) continue;
    const v = ORDEN_SEM[s.semaforo];
    if (v != null && v > peorVal) { peorVal = v; peor = s.semaforo; }
  }
  return peor;
}
// Recalcula y guarda el consolidado en b2b_filtros (credito) + resultadoCredito de la solicitud.
function refrescarConsolidadoCredito(codigo, responsable) {
  const cons = consolidadoCredito(codigo);
  const ahora = new Date().toISOString();
  db.prepare(`INSERT INTO b2b_filtros (codigoSolicitud, tipoFiltro, semaforo, responsable, actualizadoEn)
    VALUES (?, 'credito', ?, ?, ?)
    ON CONFLICT(codigoSolicitud, tipoFiltro) DO UPDATE SET semaforo=excluded.semaforo, responsable=excluded.responsable, actualizadoEn=excluded.actualizadoEn`)
    .run(codigo, cons, responsable || null, ahora);
  if (cons) db.prepare('UPDATE b2b_solicitudes SET resultadoCredito=? WHERE codigo=?').run(cons, codigo);
  return cons;
}

// Agrega un sujeto (representante o vinculada).
app.post('/api/b2b/solicitudes/:codigo/credito/sujeto', soloB2B, (req, res) => {
  const s = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const tipo = (req.body && req.body.tipoSujeto) || '';
  if (!['representante', 'vinculada'].includes(tipo)) return res.status(400).json({ error: 'Tipo de sujeto inválido' });
  const ahora = new Date().toISOString();
  const r = db.prepare('INSERT INTO b2b_credito_sujetos (codigoSolicitud, tipoSujeto, nombre, documento, orden, actualizadoEn) VALUES (?,?,?,?,?,?)')
    .run(s.codigo, tipo, (req.body && req.body.nombre) || null, (req.body && req.body.documento) || null, Date.now() % 100000, ahora);
  auditar(req, 'b2b_credito_agregar_sujeto', s.codigo, tipo);
  res.json({ ok: true, id: r.lastInsertRowid });
});

// Actualiza un sujeto (nombre, documento, checklist, semáforo, observaciones).
app.put('/api/b2b/solicitudes/:codigo/credito/sujeto/:id', soloB2B, (req, res) => {
  const su = db.prepare('SELECT * FROM b2b_credito_sujetos WHERE id=? AND codigoSolicitud=?').get(req.params.id, req.params.codigo);
  if (!su) return res.status(404).json({ error: 'Sujeto no encontrado' });
  const b = req.body || {};
  const ahora = new Date().toISOString();
  db.prepare('UPDATE b2b_credito_sujetos SET nombre=?, documento=?, checklist=?, semaforo=?, observaciones=?, actualizadoEn=? WHERE id=?')
    .run(b.nombre != null ? b.nombre : su.nombre, b.documento != null ? b.documento : su.documento,
      b.checklist ? JSON.stringify(b.checklist) : su.checklist, b.semaforo != null ? b.semaforo : su.semaforo,
      b.observaciones != null ? b.observaciones : su.observaciones, ahora, su.id);
  const cons = refrescarConsolidadoCredito(req.params.codigo, req.user.nombre);
  auditar(req, 'b2b_credito_guardar_sujeto', req.params.codigo, su.tipoSujeto + (b.semaforo ? ' · ' + b.semaforo : ''));
  res.json({ ok: true, consolidado: cons });
});

// Elimina un sujeto (no la empresa).
app.delete('/api/b2b/solicitudes/:codigo/credito/sujeto/:id', soloB2B, (req, res) => {
  const su = db.prepare('SELECT * FROM b2b_credito_sujetos WHERE id=? AND codigoSolicitud=?').get(req.params.id, req.params.codigo);
  if (!su) return res.status(404).json({ error: 'Sujeto no encontrado' });
  if (su.tipoSujeto === 'empresa') return res.status(400).json({ error: 'No se puede eliminar la empresa' });
  // Borra también sus documentos.
  const docs = db.prepare('SELECT * FROM b2b_documentos WHERE sujetoId=?').all(su.id);
  docs.forEach(d => { try { if (d.rutaArchivo && fs.existsSync(d.rutaArchivo)) fs.unlinkSync(d.rutaArchivo); } catch (e) { } });
  db.prepare('DELETE FROM b2b_documentos WHERE sujetoId=?').run(su.id);
  db.prepare('DELETE FROM b2b_credito_sujetos WHERE id=?').run(su.id);
  const cons = refrescarConsolidadoCredito(req.params.codigo, req.user.nombre);
  auditar(req, 'b2b_credito_eliminar_sujeto', req.params.codigo, su.tipoSujeto);
  res.json({ ok: true, consolidado: cons });
});

// ===== FICHA B2B: datos completos, garantía, filtros, documentos, avanzar etapa =====
// Devuelve todo lo necesario para la ficha de una solicitud.
app.get('/api/b2b/solicitudes/:codigo/ficha', soloB2B, (req, res) => {
  const s = db.prepare('SELECT * FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const garantia = db.prepare('SELECT * FROM b2b_garantia WHERE codigoSolicitud=?').get(s.codigo) || null;
  const documentos = db.prepare('SELECT id, etapa, tipoDoc, nombreArchivo, mime, tamano, subidoPor, subidoEn, sujetoId FROM b2b_documentos WHERE codigoSolicitud=? ORDER BY id DESC').all(s.codigo);
  const filtrosRows = db.prepare('SELECT tipoFiltro, checklist, semaforo, observaciones, responsable, actualizadoEn FROM b2b_filtros WHERE codigoSolicitud=?').all(s.codigo);
  const filtros = {};
  filtrosRows.forEach(f => { filtros[f.tipoFiltro] = { checklist: f.checklist ? JSON.parse(f.checklist) : null, semaforo: f.semaforo, observaciones: f.observaciones, responsable: f.responsable, actualizadoEn: f.actualizadoEn }; });
  // Sujetos de crédito (empresa / representantes / vinculadas). Auto-crea la empresa si no existe.
  let sujetos = db.prepare('SELECT * FROM b2b_credito_sujetos WHERE codigoSolicitud=? ORDER BY CASE tipoSujeto WHEN \'empresa\' THEN 0 WHEN \'representante\' THEN 1 ELSE 2 END, orden, id').all(s.codigo);
  if (!sujetos.some(x => x.tipoSujeto === 'empresa')) {
    db.prepare('INSERT INTO b2b_credito_sujetos (codigoSolicitud, tipoSujeto, nombre, documento, orden, actualizadoEn) VALUES (?,?,?,?,?,?)')
      .run(s.codigo, 'empresa', s.razonSocial || null, s.ruc || null, 0, new Date().toISOString());
    sujetos = db.prepare('SELECT * FROM b2b_credito_sujetos WHERE codigoSolicitud=? ORDER BY CASE tipoSujeto WHEN \'empresa\' THEN 0 WHEN \'representante\' THEN 1 ELSE 2 END, orden, id').all(s.codigo);
  }
  sujetos = sujetos.map(su => ({ ...su, checklist: su.checklist ? JSON.parse(su.checklist) : {} }));
  res.json({ solicitud: s, garantia, documentos, filtros, creditoSujetos: sujetos });
});

// Guarda los datos del inmueble (garantía).
app.put('/api/b2b/solicitudes/:codigo/garantia', soloB2B, (req, res) => {
  const s = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const b = req.body || {};
  const campos = ['tipoInmueble', 'departamento', 'provincia', 'distrito', 'direccion', 'linkMaps', 'titularidad', 'propietario', 'copropietarios', 'relacionPropietario', 'inscritoSunarp', 'partidaRegistral', 'cargas', 'ocupacion', 'materialNoble', 'servicios', 'primeraHipoteca', 'valorEstimado', 'observaciones'];
  const existe = db.prepare('SELECT id FROM b2b_garantia WHERE codigoSolicitud=?').get(s.codigo);
  const ahora = new Date().toISOString();
  if (existe) {
    const sets = campos.map(c => c + '=?');
    const vals = campos.map(c => b[c] != null ? b[c] : null);
    vals.push(ahora, s.codigo);
    db.prepare('UPDATE b2b_garantia SET ' + sets.join(', ') + ', actualizadoEn=? WHERE codigoSolicitud=?').run(...vals);
  } else {
    const cols = ['codigoSolicitud', ...campos, 'actualizadoEn'];
    const ph = cols.map(() => '?').join(',');
    const vals = [s.codigo, ...campos.map(c => b[c] != null ? b[c] : null), ahora];
    db.prepare('INSERT INTO b2b_garantia (' + cols.join(',') + ') VALUES (' + ph + ')').run(...vals);
  }
  auditar(req, 'b2b_guardar_garantia', s.codigo, null);
  res.json({ ok: true });
});

// Guarda checklist + semáforo de un filtro (credito | garantia | finanzas).
app.put('/api/b2b/solicitudes/:codigo/filtro/:tipo', soloB2B, (req, res) => {
  const s = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const tipo = req.params.tipo;
  if (!['credito', 'garantia', 'finanzas'].includes(tipo)) return res.status(400).json({ error: 'Filtro inválido' });
  const b = req.body || {};
  const checklist = b.checklist ? JSON.stringify(b.checklist) : null;
  const semaforo = b.semaforo || null;
  const ahora = new Date().toISOString();
  db.prepare(`INSERT INTO b2b_filtros (codigoSolicitud, tipoFiltro, checklist, semaforo, observaciones, responsable, actualizadoEn)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(codigoSolicitud, tipoFiltro) DO UPDATE SET checklist=excluded.checklist, semaforo=excluded.semaforo, observaciones=excluded.observaciones, responsable=excluded.responsable, actualizadoEn=excluded.actualizadoEn`)
    .run(s.codigo, tipo, checklist, semaforo, b.observaciones || null, req.user.nombre, ahora);
  // Refleja el semáforo en la solicitud (columna resultado*).
  const colRes = { credito: 'resultadoCredito', garantia: 'resultadoGarantia', finanzas: 'resultadoFinanzas' }[tipo];
  if (colRes && semaforo) db.prepare('UPDATE b2b_solicitudes SET ' + colRes + '=? WHERE codigo=?').run(semaforo, s.codigo);
  auditar(req, 'b2b_guardar_filtro', s.codigo, tipo + (semaforo ? ' · ' + semaforo : ''));
  res.json({ ok: true });
});

// Sube un documento (multipart) a una etapa de la solicitud.
app.post('/api/b2b/solicitudes/:codigo/documentos', soloB2B, b2bUpload.single('archivo'), (req, res) => {
  const s = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  const ahora = new Date().toISOString();
  const r = db.prepare(`INSERT INTO b2b_documentos (codigoSolicitud, etapa, tipoDoc, nombreArchivo, rutaArchivo, mime, tamano, subidoPor, subidoEn, sujetoId)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(s.codigo, (req.body && req.body.etapa) || 'garantia', (req.body && req.body.tipoDoc) || 'Documento',
      req.file.originalname, req.file.path, req.file.mimetype, req.file.size, req.user.nombre, ahora,
      (req.body && req.body.sujetoId) ? Number(req.body.sujetoId) : null);
  auditar(req, 'b2b_subir_documento', s.codigo, ((req.body && req.body.tipoDoc) || '') + ' · ' + req.file.originalname);
  res.json({ ok: true, id: r.lastInsertRowid });
});

// Descarga/visualiza un documento.
app.get('/api/b2b/documentos/:id/descargar', soloB2B, (req, res) => {
  const d = db.prepare('SELECT * FROM b2b_documentos WHERE id=?').get(req.params.id);
  if (!d || !d.rutaArchivo || !fs.existsSync(d.rutaArchivo)) return res.status(404).json({ error: 'Archivo no encontrado' });
  res.download(d.rutaArchivo, d.nombreArchivo || 'archivo');
});

// Elimina un documento (archivo del disco + registro).
app.delete('/api/b2b/documentos/:id', soloB2B, (req, res) => {
  const d = db.prepare('SELECT * FROM b2b_documentos WHERE id=?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Documento no encontrado' });
  try { if (d.rutaArchivo && fs.existsSync(d.rutaArchivo)) fs.unlinkSync(d.rutaArchivo); } catch (e) { }
  db.prepare('DELETE FROM b2b_documentos WHERE id=?').run(d.id);
  auditar(req, 'b2b_eliminar_documento', d.codigoSolicitud, d.nombreArchivo || '');
  res.json({ ok: true });
});

// Avanza la etapa según el semáforo del filtro (verde→siguiente, amarillo→nurture, rojo→no elegible).
const SIGUIENTE_ETAPA_B2B = {
  credito: { Verde: 'Filtro garantia', Amarillo: 'Amarillo/nurture', Rojo: 'No elegible' },
  garantia: { Verde: 'Filtro finanzas', Amarillo: 'Amarillo/nurture', Rojo: 'No elegible' },
  finanzas: { Verde: 'Expediente', Amarillo: 'Amarillo/nurture', Rojo: 'No elegible' }
};
app.put('/api/b2b/solicitudes/:codigo/avanzar', soloB2B, (req, res) => {
  const s = db.prepare('SELECT codigo, estado FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const tipo = (req.body && req.body.tipoFiltro) || '';
  const mapa = SIGUIENTE_ETAPA_B2B[tipo];
  if (!mapa) return res.status(400).json({ error: 'Filtro inválido' });
  // Para crédito, el semáforo es el CONSOLIDADO (el peor de los sujetos), no uno enviado por el cliente.
  let semaforo = (req.body && req.body.semaforo) || '';
  if (tipo === 'credito') { semaforo = refrescarConsolidadoCredito(s.codigo, req.user.nombre) || ''; }
  if (!semaforo) return res.status(400).json({ error: tipo === 'credito' ? 'Marca el semáforo de cada sujeto primero' : 'Falta el semáforo del filtro' });
  const nuevoEstado = mapa[semaforo];
  if (!nuevoEstado) return res.status(400).json({ error: 'Semáforo inválido' });
  db.prepare('UPDATE b2b_solicitudes SET estado=? WHERE codigo=?').run(nuevoEstado, s.codigo);
  auditar(req, 'b2b_avanzar_etapa', s.codigo, s.estado + ' → ' + nuevoEstado + ' (' + tipo + ' ' + semaforo + ')');
  res.json({ ok: true, estado: nuevoEstado });
});

// Reconsulta SUNAT a pedido (botón "Validar SUNAT" en la ficha). Espera el resultado y lo devuelve.
app.post('/api/b2b/solicitudes/:codigo/sunat', soloB2B, async (req, res) => {
  const sol = db.prepare('SELECT codigo, ruc FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const rucManual = req.body && req.body.ruc ? String(req.body.ruc).trim() : null;
  const r = await enriquecerSunat(sol.codigo, rucManual ? { ruc: rucManual } : {});
  if (rucManual && rucManual !== sol.ruc) db.prepare('UPDATE b2b_solicitudes SET ruc=? WHERE codigo=?').run(rucManual, sol.codigo);
  auditar(req, 'b2b_validar_sunat', sol.codigo, r.ok ? 'ok' : (r.motivo || 'error'));
  const fresh = db.prepare('SELECT sunatRaw, sunatEstado, sunatVerificadoEn, razonSocial FROM b2b_solicitudes WHERE codigo=?').get(sol.codigo);
  res.json({ ok: r.ok, motivo: r.motivo || null, mensaje: r.mensaje || null, solicitud: fresh });
});

// Bandeja de ingresos B2B (lo que llegó por webhook: creados y duplicados para revisión).
app.get('/api/b2b/ingresos', soloB2B, (req, res) => {
  const estado = (req.query.estado || '').trim();
  let filas = db.prepare('SELECT * FROM b2b_ingresos ORDER BY id DESC LIMIT 500').all();
  if (estado) filas = filas.filter(i => i.estado === estado);
  const resumen = {};
  db.prepare('SELECT estado, COUNT(*) c FROM b2b_ingresos GROUP BY estado').all().forEach(r => { resumen[r.estado] = r.c; });
  res.json({ ingresos: filas, total: filas.length, resumen });
});

app.post('/api/b2b/solicitudes', soloB2B, (req, res) => {
  const b = req.body || {};
  if (!b.razonSocial && !b.ruc) return res.status(400).json({ error: 'Falta RUC o razón social' });
  const codigo = generarCodigoB2B();
  const ahora = new Date().toISOString();
  const monto = b.montoSolicitado != null ? Number(b.montoSolicitado) : null;
  const ticket = monto != null ? ticketDeMonto(monto) : null;
  db.prepare(`INSERT INTO b2b_solicitudes
    (codigo, ruc, razonSocial, nombreComercial, contacto, telefono, email, fuente, campana,
     montoSolicitado, ticket, sector, actividad, antiguedadMeses, ventasEstimadas, destinoFondos, fuenteRepago,
     estado, asistente, responsableActual, fechaIngreso)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(codigo, b.ruc || null, b.razonSocial || null, b.nombreComercial || null, b.contacto || null,
      b.telefono || null, b.email || null, b.fuente || 'Manual', b.campana || null,
      monto, ticket, b.sector || null, b.actividad || null,
      b.antiguedadMeses != null ? Number(b.antiguedadMeses) : null,
      b.ventasEstimadas != null ? Number(b.ventasEstimadas) : null,
      b.destinoFondos || null, b.fuenteRepago || null,
      'Nuevo', req.user.nombre, req.user.nombre, ahora);
  auditar(req, 'b2b_alta_solicitud', codigo, (b.razonSocial || b.ruc || '') + (ticket ? ' · ticket ' + ticket : ''));
  if (b.ruc) enriquecerSunatAsync(codigo); // enriquecimiento SUNAT en segundo plano
  res.json({ ok: true, codigo, ticket });
});

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
  const gestoras = db.prepare("SELECT usuario, nombre, activo, COALESCE(autoasignar,1) AS autoasignar, COALESCE(rankingVisible,1) AS rankingVisible FROM usuarios WHERE rol='gestora' ORDER BY id").all();
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
app.post('/api/gestoras/:usuario/ranking', soloAdminOJefa, (req, res) => {
  const val = (req.body && (req.body.valor === 1 || req.body.valor === true)) ? 1 : 0;
  const u = db.prepare("SELECT usuario FROM usuarios WHERE usuario=? AND rol='gestora'").get(String(req.params.usuario).toLowerCase());
  if (!u) return res.status(404).json({ error: 'GP no encontrada' });
  db.prepare('UPDATE usuarios SET rankingVisible=? WHERE usuario=?').run(val, u.usuario);
  auditar(req, 'toggle ranking GP', u.usuario, 'visible=' + val);
  res.json({ ok: true, usuario: u.usuario, rankingVisible: val });
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
  const insLead = db.prepare(`INSERT INTO leads (codigo,nombre,telefono,email,fuente,campana,asesor,montoReal,montoPotencial,montoRango,fechaCarga,fechaAsignacion,origenCreacion)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'relead')`);
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

const server = app.listen(PORT, () => console.log(`CRM Tasatop Web v1.172 (Marketing Inversion Fase 1: tabla marketing_gasto, carga manual de Excel (SheetJS en navegador -> JSON, upsert por fecha+anuncio), cruce gasto x embudo CRM por fechaCarga (solo make), CPL real vs Meta, costo por agendado/cierre, pestana Inversion con selector anuncio/dia y tarjetas) corriendo en puerto ${PORT}`));

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
