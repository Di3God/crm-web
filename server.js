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
crearUsuario('hguerrero@tasatop.com', 'Henry Guerrero', 'gestora', '0708henrybilletera!');

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
crearUsuario('dleon@tasatop.com', 'Dante Leon', 'jefe_b2b', '12345678');
// Brillith Vásquez ya no trabaja en TasaTop: baja definitiva (no se recrea, se desactiva y se libera su carga).
try {
  db.prepare("UPDATE usuarios SET activo=0, autoasignar=0 WHERE usuario='bvasquez@tasatop.com'").run();
  // Liberar solicitudes B2B a su cargo → 'Sin asignar' para que jefatura las redistribuya.
  db.prepare("UPDATE b2b_solicitudes SET responsableActual=NULL WHERE responsableActual LIKE 'Brill%'").run();
  db.prepare("UPDATE b2b_solicitudes SET funcionario=NULL WHERE funcionario LIKE 'Brill%'").run();
  db.prepare("UPDATE b2b_solicitudes SET asistente=NULL WHERE asistente LIKE 'Brill%'").run();
} catch (e) {}
// Migración idempotente (v1.258): corrige el nombre en bases ya desplegadas (el correo no cambia).
// v1.262: Carmen ya no trabaja -> sus leads B2B quedan "Sin asignar" (desaparece del filtro de personas).
try { db.prepare("UPDATE b2b_solicitudes SET responsableActual=NULL WHERE responsableActual='Carmen Martinez'").run(); } catch (e) {}
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
  CREATE TABLE IF NOT EXISTS b2b_garantia_inmuebles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigoSolicitud TEXT NOT NULL,
    alias TEXT,
    distrito TEXT,
    tipoInmueble TEXT,
    checklist TEXT,
    semaforo TEXT,
    puntaje INTEGER,
    motivos TEXT,
    orden INTEGER DEFAULT 0,
    actualizadoEn TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_b2bgar_sol ON b2b_garantia_inmuebles(codigoSolicitud);
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
try { db.exec("ALTER TABLE b2b_documentos ADD COLUMN enlace TEXT"); } catch (e) { } // v1.217: link de Drive (persiste al deployar)
// v1.218: motor de dos capas — puntaje 0-100 y motivos de KO/escalado por filtro
try { db.exec("ALTER TABLE b2b_filtros ADD COLUMN puntaje INTEGER"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_filtros ADD COLUMN motivos TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_credito_sujetos ADD COLUMN puntaje INTEGER"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_credito_sujetos ADD COLUMN motivos TEXT"); } catch (e) { }
// Campos nuevos B2B: monto en rango (Meta/TikTok), SUNARP y ubicación del inmueble, atribución de anuncio.
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN montoRango TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN registradoSunarp TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN departamentoInmueble TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN conjunto TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN anuncio TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN adId TEXT"); } catch (e) { }
// v1.214: seguimiento de tiempo en etapa (para deadlines por etapa del kanban)
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN fechaEtapa TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN fechaEtapaCol TEXT"); } catch (e) { }
// v1.362: ancla del reloj 3x3 B2B (regla de contactabilidad). Se sella lazy desde dashboard-b2b.js.
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN fecha3x3 TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_ingresos ADD COLUMN montoRango TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_ingresos ADD COLUMN registradoSunarp TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_ingresos ADD COLUMN departamentoInmueble TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_ingresos ADD COLUMN conjunto TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_ingresos ADD COLUMN anuncio TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_ingresos ADD COLUMN adId TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN creditoLinkDrive TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN creditoComentario TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN creditoComentarioMeta TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN garantiaComentario TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE b2b_solicitudes ADD COLUMN garantiaComentarioMeta TEXT"); } catch (e) { }
// v1.223: bitácora de gestiones B2B (trazabilidad con próxima acción obligatoria).
try {
  db.exec(`CREATE TABLE IF NOT EXISTS b2b_gestiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigoSolicitud TEXT NOT NULL,
    fecha TEXT NOT NULL,
    responsable TEXT NOT NULL,
    etapa TEXT,
    canal TEXT,
    resultado TEXT,
    comentario TEXT,
    proximaAccion TEXT NOT NULL,
    fechaProxAccion TEXT NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_b2bgest_cod ON b2b_gestiones(codigoSolicitud)");
} catch (e) { }
// v1.221: recalibración de rangos POTENCIALES a valores fijos por tramo (100k/400k/1M).
// Recalcula montoSolicitado + ticket de las solicitudes que vinieron por rango (montoRango presente)
// y cuyo monto guardado no coincide con el valor fijo del tramo. Idempotente: al converger, no cambia nada.
try {
  const filasRango = db.prepare("SELECT codigo, montoRango, montoSolicitado FROM b2b_solicitudes WHERE montoRango IS NOT NULL AND TRIM(montoRango) <> ''").all();
  const upd = db.prepare("UPDATE b2b_solicitudes SET montoSolicitado=?, ticket=? WHERE codigo=?");
  let n = 0;
  for (const f of filasRango) {
    const fijo = montoRangoFijo(f.montoRango);
    if (fijo != null && Number(f.montoSolicitado) !== fijo) { upd.run(fijo, ticketDeMonto(fijo), f.codigo); n++; }
  }
  if (n) console.log('[migracion v1.221] rangos B2B recalibrados a valor fijo:', n, 'solicitudes');
} catch (e) { }
// Baja de Carmen Martinez (ya no trabaja): se desactiva para sacarla de login, round-robin y listas,
// conservando sus registros históricos. Idempotente.
try { db.prepare("UPDATE usuarios SET activo=0, autoasignar=0 WHERE usuario='cmartinez@tasatop.com'").run(); } catch (e) { }
// v1.264/266: Cristian Povis fue usuario de PRUEBA, no es GP: desactivado por completo (fuera de login, selector de claves y round-robin).
try { db.prepare("UPDATE usuarios SET activo=0, autoasignar=0 WHERE usuario='cpovis@tasatop.com'").run(); } catch (e) { }
// Atribución completa de marketing (conjunto = adset, anuncio = ad)
try { db.exec("ALTER TABLE leads ADD COLUMN conjunto TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE leads ADD COLUMN anuncio TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE leads ADD COLUMN adId TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE llamadas ADD COLUMN codigoB2B TEXT"); } catch (e) { } // v1.397: match B2B del webhook Aircall
try { db.exec("ALTER TABLE leads ADD COLUMN origenCreacion TEXT"); } catch (e) { }
// Campos nuevos del formulario B2C (Meta): DNI + 2 preguntas iniciales.
try { db.exec("ALTER TABLE leads ADD COLUMN dni TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE leads ADD COLUMN interesInvertir TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE leads ADD COLUMN listo7dias TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE leads ADD COLUMN esDuplicadoActivo INTEGER DEFAULT 0"); } catch (e) { }
try { db.exec("ALTER TABLE leads ADD COLUMN cuarentena INTEGER DEFAULT 0"); } catch (e) { }
try { db.exec("ALTER TABLE leads ADD COLUMN cuarentenaFecha TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE marketing_ingresos ADD COLUMN conjunto TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE marketing_ingresos ADD COLUMN anuncio TEXT"); } catch (e) { }
// v1.300: backfill de conjunto/anuncio en ingresos históricos (previos a los ALTERs): se rellenan
// desde el lead vinculado (codigoLead), para que no caigan como "(sin conjunto)" en el panel de costos.
try {
  db.exec(`UPDATE marketing_ingresos SET
    conjunto = COALESCE(NULLIF(conjunto,''), (SELECT l.conjunto FROM leads l WHERE l.codigo = marketing_ingresos.codigoLead)),
    anuncio  = COALESCE(NULLIF(anuncio,''),  (SELECT l.anuncio  FROM leads l WHERE l.codigo = marketing_ingresos.codigoLead))
    WHERE (COALESCE(conjunto,'')='' OR COALESCE(anuncio,'')='') AND codigoLead IS NOT NULL`);
} catch (e) { }
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
        // Solo RELLENA lo que esté vacío; nunca pisa valores ya puestos (incluye ediciones manuales).
        db.prepare(`UPDATE leads SET
            campana  = CASE WHEN (campana  IS NULL OR campana='')  THEN ? ELSE campana  END,
            conjunto = CASE WHEN (conjunto IS NULL OR conjunto='') THEN ? ELSE conjunto END,
            anuncio  = CASE WHEN (anuncio  IS NULL OR anuncio='')  THEN ? ELSE anuncio  END,
            adId     = COALESCE(adId, ?)
          WHERE codigo=?`)
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
    // Alinea la fecha de creación de los leads de campaña con la fecha REAL de llegada del ingreso
    // (corrige los creados manualmente, que tenían la fecha del momento de creación, no la de llegada).
    db.prepare(`UPDATE leads SET fechaCarga = (
        SELECT fechaRecepcion FROM marketing_ingresos WHERE codigoLead = leads.codigo AND fechaRecepcion IS NOT NULL ORDER BY id ASC LIMIT 1
      ) WHERE origenCreacion='make' AND EXISTS (
        SELECT 1 FROM marketing_ingresos WHERE codigoLead = leads.codigo AND fechaRecepcion IS NOT NULL
      )`).run();
  } catch (e) { console.error('Backfill atribución:', e.message); }
})();
// Estado del round-robin (clave/valor).
db.exec("CREATE TABLE IF NOT EXISTS app_config (clave TEXT PRIMARY KEY, valor TEXT);");
// Cola de alertas WhatsApp que fallaron el envío inmediato (microcaídas del bot/Baileys).
// Un worker de fondo las reintenta hasta que el bot vuelva. Cero mensajes perdidos.
db.exec(`CREATE TABLE IF NOT EXISTS wa_cola (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  texto TEXT NOT NULL,
  jid TEXT,
  intentos INTEGER DEFAULT 0,
  creado TEXT NOT NULL,
  ultimoIntento TEXT,
  ultimoError TEXT,
  estado TEXT DEFAULT 'pendiente'
);`);
// Leads históricos de campañas anteriores (CRM viejo). Separados del pipeline operativo;
// solo alimentan el análisis de marketing (embudo + CPL por campaña).
db.exec(`CREATE TABLE IF NOT EXISTS leads_historicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT, telefono TEXT, email TEXT,
  fechaCreacion TEXT,          -- ISO YYYY-MM-DD (día Perú)
  campana TEXT, conjunto TEXT, anuncio TEXT,
  ultimoEstado TEXT,           -- estado original del CRM viejo
  etapa TEXT,                  -- mapeado: Por contactar | Agendado | Reunión | Cerrado
  asesor TEXT, monto REAL,
  canal TEXT,                  -- B2C | B2B
  cargadoEn TEXT
);`);
db.exec("CREATE INDEX IF NOT EXISTS idx_lh_fecha ON leads_historicos(fechaCreacion);");
db.exec("CREATE INDEX IF NOT EXISTS idx_lh_campana ON leads_historicos(campana);");

const app = express();
// Compresión gzip: app.js/styles/html viajan ~80% más livianos (clave en Railway).
const compression = require('compression');
app.use(compression());
app.use(express.json({ limit: '4mb' }));
// Caché corta (5 min) + ETag: revisitas no re-descargan si no cambió; tras deploy se refresca solo.
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m', etag: true }));

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
  if (!u || hashClave(String(clave || '').trim(), u.sal) !== u.hash) {
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
  const claveLimpia = String(claveNueva).trim();
  if (claveLimpia.length < 8) return res.status(422).json({ error: 'La nueva contrasena debe tener al menos 8 caracteres (sin espacios al inicio o final)' });
  const sal = crypto.randomBytes(8).toString('hex');
  db.prepare('UPDATE usuarios SET hash = ?, sal = ? WHERE usuario = ?')
    .run(hashClave(claveLimpia, sal), sal, destino);
  db.prepare('DELETE FROM login_intentos WHERE usuario = ?').run(destino);
  auditar(req, 'cambiar-clave', destino, 'Contrasena actualizada por admin (bloqueo limpiado)');
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
    // v1.397: match TAMBIÉN contra solicitudes B2B (mismo criterio: últimos 9 dígitos).
    // Un número puede coincidir con un lead B2C y/o una empresa B2B; se guardan ambos.
    let solB2B = null;
    if (cel9) {
      try {
        solB2B = db.prepare("SELECT codigo FROM b2b_solicitudes WHERE COALESCE(archivado,0)=0 AND replace(replace(COALESCE(telefono,''),' ',''),'-','') LIKE ?")
          .get('%' + cel9);
      } catch (e) { }
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
      (aircall_id, codigo, telefono, direccion, contestada, duracion, agente, fecha, crudo, codigoB2B)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(aircallId, lead ? lead.codigo : null, numeroLead || null, direccion,
           contestada, duracion, agente, fecha, JSON.stringify(ev).slice(0, 16000),
           solB2B ? solB2B.codigo : null);

    console.log('[aircall] Llamada', direccion, contestada ? 'contestada' : 'no contestada',
      duracion + 's', '->', lead ? lead.codigo : 'sin match B2C', solB2B ? ('· B2B ' + solB2B.codigo) : '', numeroLead);
    res.json({ ok: true, lead: lead ? lead.codigo : null, b2b: solB2B ? solB2B.codigo : null });
  } catch (e) {
    console.error('[aircall] Error procesando webhook:', e.message);
    res.json({ ok: false, error: e.message }); // 200 igual, para que Aircall no reintente en bucle
  }
});

// Webhook B2B: recepción de solicitudes de empresas (landing, meta, tiktok…).
// Token propio B2B_WEBHOOK_TOKEN (cae a MARKETING_WEBHOOK_TOKEN si no está definido, para pruebas).
// :origen = landing | meta | tiktok | test
// v1.264: enlaces cortos para WhatsApp. /o/CODIGO -> ficha B2B · /l/CODIGO -> lead B2C.
app.get('/o/:codigo', (req, res) => res.redirect(302, '/#b2b=' + encodeURIComponent(req.params.codigo)));
app.get('/l/:codigo', (req, res) => res.redirect(302, '/#lead=' + encodeURIComponent(req.params.codigo)));

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
// ¿Ve TODOS los leads (supervisión) o solo los propios? Jefes/admin/jefa ven todo.
function veTodoB2B(user) {
  return ['admin', 'jefa', 'jefe_creditos', 'jefe_b2b'].includes(user.rol);
}
// Filtra una lista de solicitudes al alcance del usuario: los operadores solo ven donde son responsables.
function filtrarPorAlcanceB2B(user, filas) {
  if (veTodoB2B(user)) return filas;
  const yo = user.nombre;
  return filas.filter(s => s.responsableActual === yo || s.funcionario === yo || s.asistente === yo);
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
// v1.262: primero el enriquecimiento SUNAT (para tener ubicación y status) y RECIÉN la alerta WA.
function enriquecerSunatYAvisar(codigo, tieneRuc) {
  const avisar = () => { try { alertasWAB2B.alertaNuevaSolicitud(codigo); } catch (e) { } };
  if (!tieneRuc) return avisar(); // sin RUC legible: avisa de una (caerá en Filtro Sunat)
  Promise.resolve().then(() => enriquecerSunat(codigo)).catch(() => { }).then(avisar, avisar);
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
// Convierte un rango de texto ("De S/ 50 mil a S/ 1 millón") al límite inferior numérico (50000).
// Toma el PRIMER número con multiplicador (mil/millón) = piso del rango en soles.
function rangoANumero(txt) {
  if (!txt) return null;
  const t = String(txt).toLowerCase().replace(/_/g, ' ');
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(mill[oó]n(?:es)?|mil)/);
  if (m) {
    let n = parseFloat(m[1].replace(/,/g, '.'));
    if (!isFinite(n)) return null;
    n *= m[2].startsWith('mill') ? 1000000 : 1000;
    return Math.round(n);
  }
  // Extraer el PRIMER número de la etiqueta (límite inferior), no juntar todos los dígitos.
  // Un número puede venir con separadores de miles: "200,000" o "200.000".
  const primero = t.match(/\d[\d.,]*/);
  if (!primero) return null;
  const solo = Number(primero[0].replace(/[.,]/g, ''));
  return isFinite(solo) && solo >= 1000 ? solo : null;
}

// Monto POTENCIAL fijo por tramo (para el total del tablero y el ticket cuando el lead
// vino por rango de formulario/Meta, sin monto exacto). Regla de negocio de Diego:
//   Etiquetas NUEVAS (ticket subido, jul-2026):
//     "S/200,000 a 1,000,000"  → 300,000 (arranca en el umbral de foco B2B)
//     "S/1,000,000 a más"       → 1,000,000
//   Etiquetas viejas (compatibilidad): 50k–299k → 100,000 · 300k–999k → 400,000 · ≥1M → 1,000,000
// Acepta un rango de texto o un número; devuelve el valor fijo del tramo (o null si no hay dato).
function montoRangoFijo(rangoOtexto) {
  let piso = null;
  if (typeof rangoOtexto === 'number' && isFinite(rangoOtexto)) piso = rangoOtexto;
  else if (rangoOtexto != null) piso = rangoANumero(rangoOtexto);
  if (piso == null) return null;
  if (piso >= 1000000) return 1000000;      // "S/1,000,000 a más"
  if (piso >= 300000) return 400000;        // (compat. etiqueta vieja 300k–999k)
  if (piso >= 200000) return 300000;        // "S/200,000 a 1,000,000" (nuevo) → 300k por regla de negocio
  return 100000;                            // (compat. etiquetas viejas menores)
}

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
  const ruc = val('ruc', 'RUC', 'ruc_empresa', 'rucEmpresa', 'RUC de la empresa');
  // monto: clave directa; si no, barrido excluyendo RUC, teléfono, DNI y números con pinta de esos.
  let montoRaw = val('monto', 'montoSolicitado', 'Monto');
  // Si el formulario trae un RANGO (montoRango), NO se barre: el monto sale del rango fijo.
  // Esto evita que el barrido agarre por error dígitos del email o del nombre.
  const rangoRaw = val('montoRango', 'monto_rango', 'rango', 'Capital Requerido', 'capital_requerido', '¿qué monto necesitas?', 'que_monto_necesitas');
  if (!montoRaw && !rangoRaw) {
    const telRaw = normalizarTelefonoB2B(telefono);
    for (const k of keys) {
      const kl = k.toLowerCase();
      if (kl.includes('ruc') || kl.includes('telefono') || kl.includes('celular') || kl.includes('phone') || kl.includes('dni')) continue;
      // Excluir email/correo y nombre/contacto: sus dígitos NO son el monto.
      if (kl.includes('email') || kl.includes('correo') || kl.includes('mail') || kl.includes('contacto') || kl.includes('nombre') || kl.includes('name')) continue;
      // Evitar IDs de anuncio, el rango (Capital Requerido), atribución y área: no son el monto.
      if (kl.includes('anuncio') || kl.includes('conjunto') || kl.includes('campan') || kl.includes('campaign') || kl.includes('campañ')
        || kl.includes('adset') || kl.includes('formulario') || kl.includes('utm') || kl.includes('capital') || kl.includes('requerido')
        || kl.includes('rango') || kl.includes('source') || kl.includes('platform') || kl.includes('id')
        || kl.includes('area') || kl.includes('área') || kl.includes('sunarp') || kl.includes('inmueble')
        || kl.includes('propiedad') || kl.includes('garant') || kl.includes('adid')) continue;
      const digits = String(b[k]).replace(/[^0-9.]/g, '');
      const entero = digits.replace(/\./g, '');
      const n = Number(digits);
      if (!isFinite(n) || n < 10000) continue;
      if (entero.length === 11 || entero.length === 9 || entero.length > 12) continue; // RUC, teléfono o ID de anuncio
      if (entero === ruc || entero === telRaw) continue;
      montoRaw = String(b[k]); break;
    }
  }
  let monto = montoRaw != null ? (Number(String(montoRaw).replace(/[^0-9.]/g, '')) || null) : null;
  // nombre/contacto: si coincide con el teléfono (error típico de landing), se ignora
  let contacto = val('contacto', 'nombre', 'Nombre', 'nombres', 'Nombres', 'persona_contacto', 'Persona de Contacto');
  if (contacto && normalizarTelefonoB2B(contacto) === telefono) contacto = null;
  // garantía: por nombre de campo (preguntas largas del formulario)
  let tieneInmueble = val('tieneInmueble', 'tiene_inmueble');
  let tipoInmueble = val('tipoInmueble', 'tipo_inmueble');
  let areaInmueble = val('area', 'areaInmueble', 'area_inmueble');
  for (const k of keys) {
    const kl = k.toLowerCase();
    if (!tieneInmueble && (kl.includes('propiedad') || kl.includes('cuenta con'))) tieneInmueble = String(b[k]).trim();
    if (!tipoInmueble && kl.includes('tipo') && kl.includes('inmueble')) tipoInmueble = String(b[k]).trim();
    if (!areaInmueble && (kl.includes('area') || kl.includes('área')) && kl.includes('inmueble')) areaInmueble = String(b[k]).trim();
  }
  // Monto en rango (Meta/TikTok: "Capital Requerido" llega como texto, p.ej. "De S/ 50 mil a S/ 299 mil")
  let montoRango = val('montoRango', 'monto_rango', 'capitalRequerido', 'capital_requerido', 'rangoMonto');
  if (!montoRango) { for (const k of keys) { const kl = k.toLowerCase(); if (kl.includes('capital') || kl.includes('requerido')) { montoRango = String(b[k]).trim(); break; } } }
  // Si no vino monto numérico pero sí un rango, usamos el valor FIJO del tramo (100k/400k/1M).
  if (monto == null && montoRango) { const est = montoRangoFijo(montoRango); if (est) monto = est; }
  // Registrado en SUNARP (landing)
  let registradoSunarp = val('registradoSunarp', 'registrado_sunarp', 'sunarp');
  if (!registradoSunarp) { for (const k of keys) { if (k.toLowerCase().includes('sunarp')) { registradoSunarp = String(b[k]).trim(); break; } } }
  // Departamento/ubicación del inmueble (Meta/TikTok Pregunta 2). OJO: es ubicación geográfica, NO el tipo.
  let departamentoInmueble = val('departamentoInmueble', 'departamento_inmueble', 'ubicacionInmueble', 'ubicacion_inmueble');
  if (!departamentoInmueble) { for (const k of keys) { const kl = k.toLowerCase(); if (kl.includes('departamento') || (kl.includes('encuentra') && kl.includes('inmueble'))) { departamentoInmueble = String(b[k]).trim(); break; } } }
  // Atribución de anuncio (Meta/TikTok)
  let conjunto = val('conjunto', 'conjunto_anuncio', 'conjuntoAnuncio', 'adset', 'adSet', 'adset_name', 'adsetName', 'utm_term', 'utmTerm', 'Conjunto de Anuncio');
  let anuncio = val('anuncio', 'Anuncio', 'ad', 'ad_name', 'adName', 'utm_content', 'utmContent');
  const adId = val('adId', 'ad_id', 'idAnuncio', 'id_anuncio', 'ID Anuncio');
  if (!conjunto) { for (const k of keys) { if (k.toLowerCase().includes('conjunto')) { conjunto = String(b[k]).trim(); break; } } }
  if (!anuncio) { for (const k of keys) { const kl = k.toLowerCase(); if (kl.includes('anuncio') && !kl.includes('conjunto') && !kl.includes('id')) { anuncio = String(b[k]).trim(); break; } } }
  const campana = val('campana', 'campaign', 'campaign_name', 'campaignName', 'Campaña', 'campaña', 'utm_campaign', 'utmCampaign');
  return {
    origen: String(origen || 'landing').toLowerCase(),
    ruc,
    razonSocial: val('razonSocial', 'razon_social', 'empresa', 'Empresa', 'razonsocial'),
    contacto, telefono, email, monto, montoRango,
    tieneInmueble, tipoInmueble, areaInmueble, registradoSunarp, departamentoInmueble,
    formulario: val('form_name', 'formulario', 'form_id', 'Formulario'),
    campana, conjunto, anuncio, adId,
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
    (fechaRecepcion,origen,estado,ruc,razonSocial,contacto,telefono,email,monto,montoRango,
     tieneInmueble,tipoInmueble,areaInmueble,registradoSunarp,departamentoInmueble,
     formulario,utmSource,utmMedium,utmCampaign,conjunto,anuncio,adId,
     codigoSolicitud,asignadoA,mensajeError,rawJson)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(new Date().toISOString(), norm.origen, estado, norm.ruc, norm.razonSocial, norm.contacto,
      norm.telefono, norm.email, norm.monto, norm.montoRango, norm.tieneInmueble, norm.tipoInmueble, norm.areaInmueble,
      norm.registradoSunarp, norm.departamentoInmueble,
      norm.formulario, norm.utmSource, norm.utmMedium, norm.utmCampaign, norm.conjunto, norm.anuncio, norm.adId,
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
  if (existente && !opts.forzar) {
    const terminal = B2B_ESTADOS_TERMINALES.includes(existente.estado) || existente.archivado;
    if (terminal) {
      return { estado: 'duplicado_historial', codigoSolicitud: existente.codigo, mensajeError: `⚠ Ya existe en historial (${existente.codigo}, ${existente.estado}) — la revisión es manual` };
    }
    return { estado: 'duplicado_activo', codigoSolicitud: existente.codigo, mensajeError: `⚠ Solicitud activa duplicada (${existente.codigo}) — gestión manual` };
  }
  // Nueva: se crea automática en estado Nuevo, con round-robin entre operadores B2B.
  const codigo = generarCodigoB2B();
  const ahora = (opts.fechaIngreso || new Date().toISOString()); // reproceso conserva la fecha original de llegada
  const ticket = norm.monto != null ? ticketDeMonto(norm.monto) : null;
  // FOCO DEL MES (v1.359): tickets >= 300k. Los nuevos del tramo 50k–299k (etiqueta 100k) quedan
  // SIN ASIGNAR y SIN alerta de WhatsApp; se abordarán después. Poner 0 para desactivar la regla.
  const B2B_MIN_MONTO_AUTOASIGNAR = 300000;
  const montoEfectivo = norm.monto != null ? Number(norm.monto) : montoRangoFijo(norm.montoRango);
  const bajoFoco = B2B_MIN_MONTO_AUTOASIGNAR > 0 && montoEfectivo != null && montoEfectivo < B2B_MIN_MONTO_AUTOASIGNAR;
  const op = (opts.sinAutoasignar || bajoFoco) ? null : elegirOperadorB2BRoundRobin();
  db.prepare(`INSERT INTO b2b_solicitudes
    (codigo, ruc, razonSocial, contacto, telefono, email, fuente, montoSolicitado, montoRango, ticket,
     tieneInmueble, tipoInmueble, areaInmueble, registradoSunarp, departamentoInmueble,
     campana, conjunto, anuncio, adId, estado, asistente, responsableActual, fechaIngreso)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(codigo, norm.ruc, norm.razonSocial, norm.contacto, norm.telefono, norm.email, norm.origen,
      norm.monto, norm.montoRango, ticket, norm.tieneInmueble, norm.tipoInmueble, norm.areaInmueble,
      norm.registradoSunarp, norm.departamentoInmueble,
      norm.campana, norm.conjunto, norm.anuncio, norm.adId,
      'Nuevo', op, op, ahora);
  if (bajoFoco) {
    // Ticket bajo el foco del mes: SUNAT sí (deja el expediente listo), alerta de WhatsApp NO.
    enriquecerSunatAsync(codigo);
    try {
      db.prepare('INSERT INTO auditoria (fecha, usuario, nombre, accion, objetivo, detalle) VALUES (?,?,?,?,?,?)')
        .run(new Date().toISOString(), '(auto)', '(auto)', 'b2b_sin_asignar_foco', codigo, 'Monto ' + montoEfectivo + ' < 300k: sin asignar y sin alerta WA (foco del mes)');
    } catch (e) { }
  } else {
    enriquecerSunatYAvisar(codigo, !!norm.ruc); // SUNAT primero, luego el aviso WA con ubicación y status
  }
  try { watchdogLeads.registrarLead('b2b'); } catch (e) { } // resetea el reloj B2B del watchdog
  // v1.408: si el lead quedó asignado a un funcionario, verificar a los 30 min que lo atienda.
  if (op) { try { enColaVerificacionB2B(codigo, op, norm.razonSocial || norm.contacto); } catch (e) { } }
  // Bienvenida automática B2B (todo lead creado recibe el saludo, sin importar foco/asignación).
  bienvenida.saludar({ codigo, nombre: norm.contacto, telefono: norm.telefono, fuente: norm.origen, razonSocial: norm.razonSocial }, 'b2b');
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

// Envío HTTP crudo al bot. Devuelve true SOLO si el POST llegó y el bot respondió 2xx.
// (El bot no confirma el envío real de WhatsApp, pero un 2xx descarta las microcaídas de
//  red/conexión que son la causa de las alertas perdidas.) Timeout corto para no colgar.
async function _postAlertaBot(texto, jid) {
  const url = process.env.WA_BOT_URL, token = process.env.WA_BOT_TOKEN;
  if (!url || !token || !texto) return { ok: false, error: 'faltan envs o texto' };
  const destino = jid || process.env.WA_GRUPO_PRUEBAS_JID || undefined;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/alerta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, texto, ...(destino ? { jid: destino } : {}) }),
      signal: ctrl.signal
    });
    clearTimeout(t);
    if (!r.ok) return { ok: false, error: 'HTTP ' + r.status };
    return { ok: true };
  } catch (e) { clearTimeout(t); return { ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message }; }
}

// Encola una alerta pendiente para que el worker la reintente hasta que el bot vuelva.
function _encolarAlertaWA(texto, jid, error) {
  try {
    db.prepare("INSERT INTO wa_cola (texto, jid, intentos, creado, ultimoIntento, ultimoError, estado) VALUES (?,?,?,?,?,?, 'pendiente')")
      .run(texto, jid || null, 1, new Date().toISOString(), new Date().toISOString(), error || null);
    console.error('[WA] alerta ENCOLADA (bot no disponible):', error || '');
  } catch (e) { console.error('[WA] no se pudo encolar:', e.message); }
}

// Alerta one-way a WhatsApp vía microservicio (Di3God/whatsapp-bot). Robusta:
// intenta 2 veces de inmediato (por si cae en una microcaída de Baileys de ~10s);
// si aún falla, la encola para reenvío en segundo plano. Nunca rompe el flujo del CRM.
async function enviarAlertaWA(texto, jid) {
  const url = process.env.WA_BOT_URL, token = process.env.WA_BOT_TOKEN;
  if (!url || !token || !texto) return false;
  // 2 intentos inmediatos con 3s de espera entre ellos.
  for (let i = 0; i < 2; i++) {
    const r = await _postAlertaBot(texto, jid);
    if (r.ok) return true;
    if (i === 0) await new Promise(res => setTimeout(res, 3000));
    else _encolarAlertaWA(texto, jid, r.error);
  }
  return false;
}

// ===== Planes de accion por WhatsApp (cortes 9am/1pm/6pm, estado vivo) =====
const alertasWA = require('./alertas-wa.js')({ db, consolidarLead: leadConsolidado, enviarAlertaWA, peruFecha, construirRankingDia });
const iaReportes = require('./ia-reportes.js');
// Alertas B2B a su PROPIO grupo (WA_GRUPO_B2B_JID). Mismo bot, otro destino.
const alertasWAB2B = require('./alertas-wa-b2b.js')({ db, enviarAlertaWA, peruFecha, etapaKanbanB2B, slaEtapaB2B, observacionesB2B, montoRangoFijo, L });
// v1.362: Centro de Operaciones B2B (motor 3x3 + dashboard de jefatura). Solo lee la BD.
const dashB2B = require('./dashboard-b2b.js')({ db, etapaKanbanB2B, priorityScoreB2B, slaEtapaB2B, observacionesB2B, montoRangoFijo, sellarFechaEtapa });
// alertasWAB2B.iniciarCortes(); // DESACTIVADO temporalmente: por ahora al grupo B2B solo llegan alertas de leads nuevos. Los 3 cortes se pueden enviar manualmente con /api/b2b/alertas-wa/enviar o reactivar aquí.
// Watchdog de leads: avisa al grupo de marketing (WA_GRUPO_MKT_JID) cuando dejan de llegar leads.
const watchdogLeads = require('./watchdog-leads.js')({ db, enviarAlertaWA, peruFecha });
const cw = require('./chatwoot');
const bienvenida = require('./bienvenida-auto.js')({ db, cw, normalizarCelular: L.normalizarCelular });
// v1.401: Pulso del día (reemplaza los cortes anteriores de alertas-wa: un bloque por grupo, 3 cortes).
const pulsoDia = require('./pulso-dia.js')({ db, enviarAlertaWA, peruFecha, construirRankingDia, consolidarLead: leadConsolidado, L, etapaKanbanB2B, slaEtapaB2B });
// Insights de Meta Ads (costos/CPL). Requiere META_ACCESS_TOKEN + META_AD_ACCOUNT_ID en el entorno.
const metaInsights = require('./meta-insights.js')({ db });
watchdogLeads.iniciar();
// alertasWA.iniciarCortes(); // v1.401: APAGADO — reemplazado por el Pulso del día (un bloque por grupo). El envío manual sigue disponible.
pulsoDia.iniciarCortes();
// v1.419: resumen de gestión por asesor al grupo B2B a las 9am/1pm/6pm (una vez cada uno).
try { alertasWAB2B.iniciarResumenGestion(); } catch (e) { console.error('[WA-B2B] no se pudo iniciar resumen gestión:', e.message); }
try { alertasWAB2B.iniciarWatchdogSinAtender(); } catch (e) { console.error('[WA-B2B] no se pudo iniciar watchdog sin atender:', e.message); }
bienvenida.iniciarWorker(); // reintenta bienvenidas encoladas (fuera de horario) cada 5 min
// ===== PULSO DEL DÍA (v1.401): preview, envío manual y metas configurables =====
// Vista previa del mensaje de un corte, sin enviar (admin/jefa).
app.get('/api/pulso/preview', (req, res) => {
  if (!veTodo(req.user)) return res.status(403).json({ error: 'Solo supervisión' });
  const corte = ['9am', '1pm', '6pm'].includes(req.query.corte) ? req.query.corte : '9am';
  res.json({ corte, b2c: pulsoDia.msgB2C(corte), b2b: pulsoDia.msgB2B(corte) });
});
// Envío manual de un corte AHORA a los grupos.
app.post('/api/pulso/enviar', async (req, res) => {
  if (!veTodo(req.user)) return res.status(403).json({ error: 'Solo supervisión' });
  const corte = ['9am', '1pm', '6pm'].includes(req.body && req.body.corte) ? req.body.corte : '9am';
  const r = await pulsoDia.enviarPulso(corte);
  auditar(req, 'pulso_manual', corte, JSON.stringify(r));
  res.json({ ok: true, corte, enviado: r });
});
// Metas del día: por GP (B2C) y global B2B.
app.get('/api/pulso/metas', (req, res) => {
  if (!veTodo(req.user)) return res.status(403).json({ error: 'Solo supervisión' });
  const gestoras = db.prepare("SELECT nombre FROM usuarios WHERE activo=1 AND rol='gestora'").all().map(g => g.nombre);
  const M = pulsoDia.getMetasB2C();
  res.json({
    default: pulsoDia.META_GP_DEF,
    gps: gestoras.map(n => ({ nombre: n, meta: Object.assign({}, pulsoDia.META_GP_DEF, M[n] || {}) })),
    b2b: pulsoDia.getMetaB2B()
  });
});
app.put('/api/pulso/metas', (req, res) => {
  if (!veTodo(req.user)) return res.status(403).json({ error: 'Solo supervisión' });
  const b = req.body || {};
  if (b.gps && typeof b.gps === 'object') {
    const limpio = {};
    Object.keys(b.gps).forEach(n => {
      const m = b.gps[n]; if (!m || typeof m !== 'object') return;
      const fila = {};
      ['intentos', 'calificados', 'agendados', 'reuniones', 'cierres'].forEach(k => { const v = Number(m[k]); if (isFinite(v) && v >= 0) fila[k] = v; });
      if (Object.keys(fila).length) limpio[n] = fila;
    });
    db.prepare("INSERT INTO app_config (clave,valor) VALUES ('pulso_metas_b2c',?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor").run(JSON.stringify(limpio));
  }
  if (b.b2b && isFinite(Number(b.b2b.gestiones))) {
    db.prepare("INSERT INTO app_config (clave,valor) VALUES ('pulso_meta_b2b',?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor").run(JSON.stringify({ gestiones: Number(b.b2b.gestiones) }));
  }
  auditar(req, 'pulso_metas', null, 'actualizadas');
  res.json({ ok: true });
});

// ===== BIENVENIDA AUTOMÁTICA: configuración (solo supervisión) =====
app.get('/api/bienvenida/config', (req, res) => {
  if (!veTodo(req.user)) return res.status(403).json({ error: 'Solo supervisión' });
  res.json({ config: bienvenida.getConfig(), resumen: bienvenida.resumen(), default: bienvenida.PLANTILLA_DEF, chatwoot: cw.cwConfigurado() });
});
app.put('/api/bienvenida/config', (req, res) => {
  if (!veTodo(req.user)) return res.status(403).json({ error: 'Solo supervisión' });
  const b = req.body || {};
  const set = (clave, valor) => db.prepare("INSERT INTO app_config (clave,valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor").run(clave, String(valor));
  if (b.activa != null) set('bienvenida_activa', b.activa ? '1' : '0');
  if (b.prueba != null) set('bienvenida_prueba', b.prueba ? '1' : '0');
  if (typeof b.b2c === 'string') set('bienvenida_b2c', b.b2c.slice(0, 1500));
  if (typeof b.b2b === 'string') set('bienvenida_b2b', b.b2b.slice(0, 1500));
  if (b.horaIni != null && isFinite(Number(b.horaIni))) set('bienvenida_hora_ini', Math.max(0, Math.min(23, Number(b.horaIni))));
  if (b.horaFin != null && isFinite(Number(b.horaFin))) set('bienvenida_hora_fin', Math.max(1, Math.min(24, Number(b.horaFin))));
  auditar(req, 'bienvenida_config', null, JSON.stringify({ activa: b.activa, prueba: b.prueba }));
  res.json({ ok: true, config: bienvenida.getConfig() });
});

// Simula un lead entrante para verificar el circuito completo (respeta el modo actual).
app.post('/api/bienvenida/probar', async (req, res) => {
  if (!veTodo(req.user)) return res.status(403).json({ error: 'Solo supervisión' });
  const tel = (req.body && req.body.telefono) ? String(req.body.telefono) : ('9000' + String(Date.now()).slice(-5));
  await bienvenida.saludar({ codigo: 'TEST-' + Date.now(), nombre: 'Lead De Prueba', telefono: tel, fuente: 'prueba manual' }, 'b2c');
  const ultimo = db.prepare('SELECT telefono, estado, detalle FROM wa_bienvenida ORDER BY id DESC LIMIT 1').get();
  res.json({ ok: true, resultado: ultimo || null, resumen: bienvenida.resumen() });
});

// Vista previa de un corte sin enviar (admin/jefa): /api/wa/plan?corte=9am|1pm|6pm
app.get('/api/wa/plan', soloAdminOJefa, async (req, res) => {
  const corte = ['9am', '1pm', '6pm'].includes(req.query.corte) ? req.query.corte : '9am';
  if (req.query.enviar === '1') {
    const n = await alertasWA.enviarCorteAhora(corte);
    auditar(req, 'wa_corte_manual', corte, n + ' mensajes');
    return res.json({ corte, enviados: n, ok: true });
  }
  res.json({ corte, planes: alertasWA.generarPlanes(corte) });
});

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
  db.prepare(`INSERT INTO leads (codigo,nombre,telefono,email,fuente,campana,conjunto,anuncio,adId,asesor,montoReal,montoPotencial,montoRango,fechaCarga,fechaAsignacion,origenCreacion,dni,interesInvertir,listo7dias)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'make',?,?,?)`)
    .run(codigo, norm.nombre || 'Sin nombre', norm.telefonoNormalizado, norm.email || null,
         norm.fuente || null, norm.campana || null, norm.conjunto || null, norm.anuncio || null, norm.adId || null,
         gp || null, monto, monto, rango, ahora, gp ? ahora : null,
         norm.dni || null, norm.interesInvertir || null, norm.listo7dias || null);
  registrarAnuncioCatalogo(norm.campana, norm.conjunto, norm.anuncio, norm.adId);
  // Bienvenida automática (solo leads gestionables; nunca bloquea el flujo).
  bienvenida.saludar({ codigo, nombre: norm.nombre, telefono: norm.telefonoNormalizado, fuente: norm.fuente }, 'b2c');
  if (gp) {
    notificarAsignacion(db.prepare('SELECT * FROM leads WHERE codigo = ?').get(codigo), gp);
    const gpCorto = String(gp).trim().split(/\s+/)[0] || gp;
    const baseC = process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : '');
    const linkC = baseC ? baseC + '/l/' + encodeURIComponent(codigo) : '';
    const txt = `🆕 *Nuevo lead* — ${norm.nombre}\n👤 ${gpCorto} · 💰 ${monto != null ? 'S/ ' + Number(monto).toLocaleString('es-PE') : 'sin monto'}\n\n¡Contáctalo ahora!${linkC ? ' ' + linkC : ''}`;
    enviarAlertaWA(txt); // fire-and-forget: no bloquea la respuesta del webhook
    enColaVerificacion(codigo, gp, norm.nombre); // chequeo "¿atendido?" a los 10 min (solo leads en tiempo real)
  }
  try { watchdogLeads.registrarLead('b2c'); } catch (e) { } // resetea el reloj B2C del watchdog
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
// Fecha local de Perú (UTC-5) de un ISO, para que los filtros por día coincidan con lo que se muestra.
function peruFecha(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  return new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10);
}
// Rango UTC [ini, fin) que cubre las fechas LOCALES de Perú desde..hasta (inclusive). Perú = UTC-5.
function rangoUTCdePeru(desde, hasta) {
  let ini = null, fin = null;
  if (desde) ini = desde + 'T05:00:00.000Z';
  if (hasta) { const d = new Date(hasta + 'T05:00:00.000Z'); d.setUTCDate(d.getUTCDate() + 1); fin = d.toISOString(); }
  return { ini, fin };
}

app.get('/api/marketing/ingresos', soloAdminOJefa, (req, res) => {
  const { estado, desde, hasta } = req.query;
  const cond = [], args = [];
  if (estado) { cond.push('estado = ?'); args.push(estado); }
  if (desde || hasta) {
    const { ini, fin } = rangoUTCdePeru(desde, hasta);
    if (ini) { cond.push('fechaRecepcion >= ?'); args.push(ini); }
    if (fin) { cond.push('fechaRecepcion < ?'); args.push(fin); }
  }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  let filas = db.prepare('SELECT * FROM marketing_ingresos ' + where + ' ORDER BY id DESC LIMIT 1000').all(...args);
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

// Eliminar DEFINITIVO desde Ingresos: borra el ingreso + su lead (si lo creó) + sus gestiones.
// Pensado para limpiar leads de prueba. Queda registrado en auditoría como "eliminar definitivo".
app.delete('/api/marketing/ingresos/:id', soloAdmin, (req, res) => {
  const ing = db.prepare('SELECT * FROM marketing_ingresos WHERE id = ?').get(req.params.id);
  if (!ing) return res.status(404).json({ error: 'No encontrado' });
  let detalleLead = 'sin lead';
  if (ing.codigoLead) {
    const lead = db.prepare('SELECT * FROM leads WHERE codigo = ?').get(ing.codigoLead);
    if (lead) {
      const ng = db.prepare('SELECT COUNT(*) AS c FROM gestiones WHERE codigo = ?').get(ing.codigoLead).c;
      db.prepare('DELETE FROM gestiones WHERE codigo = ?').run(ing.codigoLead);
      db.prepare('DELETE FROM leads WHERE codigo = ?').run(ing.codigoLead);
      detalleLead = `${ing.codigoLead} (${lead.nombre || 's/n'}, ${ng} gestiones)`;
    }
  }
  db.prepare('DELETE FROM marketing_ingresos WHERE id = ?').run(req.params.id);
  auditar(req, 'eliminar definitivo', ing.codigoLead || ('ingreso ' + ing.id), detalleLead);
  res.json({ ok: true });
});

// Crear lead manual desde un ingreso bruto (forzar creacion).
// body.soloConteo=true -> duplicado ACTIVO: cuenta como lead (costo) pero no se gestiona ni entra al embudo.
app.post('/api/marketing/ingresos/:id/crear-lead', soloAdminOJefa, (req, res) => {
  const ing = db.prepare('SELECT * FROM marketing_ingresos WHERE id = ?').get(req.params.id);
  if (!ing) return res.status(404).json({ error: 'No encontrado' });
  const soloConteo = !!(req.body && req.body.soloConteo);
  // Nombre: el recibido, o uno que envie la jefa para completar (caso sin_nombre).
  const nombreFinal = (req.body && req.body.nombre && String(req.body.nombre).trim())
    ? String(req.body.nombre).trim() : (ing.nombreRecibido || 'Sin nombre');
  const codigo = generarCodigo();
  const ahora = new Date().toISOString();
  // Fecha de creación = la REAL de llegada del ingreso (no el momento de crearlo a mano).
  const fechaReal = ing.fechaRecepcion || ahora;
  const monto = L.montoEtiquetaANumero(ing.montoRecibido);
  const rango = monto != null ? L.montoARango(monto) : null;
  const tel = ing.telefonoNormalizado || L.normalizarCelular(ing.telefonoRecibido) || null;
  db.prepare(`INSERT INTO leads (codigo,nombre,telefono,email,fuente,campana,conjunto,anuncio,adId,asesor,montoReal,montoPotencial,montoRango,fechaCarga,fechaAsignacion,origenCreacion,esDuplicadoActivo,archivado)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'make',?,?)`)
    .run(codigo, nombreFinal, tel, ing.emailRecibido || null,
         ing.fuente || null, ing.campana || null, ing.conjunto || null, ing.anuncio || null, ing.adId || null,
         null, monto, monto, rango, fechaReal, null,
         soloConteo ? 1 : 0, soloConteo ? 1 : 0);
  registrarAnuncioCatalogo(ing.campana, ing.conjunto, ing.anuncio, ing.adId);
  db.prepare('UPDATE marketing_ingresos SET estado=?, codigoLead=?, mensajeError=? WHERE id=?')
    .run(soloConteo ? 'duplicado_contado' : 'creado', codigo, soloConteo ? 'Contado como lead duplicado (no se gestiona)' : 'Creado manualmente', req.params.id);
  // Si correspondia a un relead, marcarlo como usado para que no se reasigne.
  if (tel && !soloConteo) {
    db.prepare("UPDATE marketing_historial SET estado='asignado', codigoLead=?, asignadoA=?, fechaAsignado=? WHERE telefono=? AND estado='pendiente'")
      .run(codigo, (req.user && req.user.nombre) ? req.user.nombre + ' (manual)' : 'manual', ahora, tel);
  }
  auditar(req, soloConteo ? 'contar lead duplicado activo' : 'crear lead desde ingreso marketing', codigo, '-');
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
  // Asesores dinámicos: gestoras activas de la BD (así una gestora nueva aparece sin tocar código).
  // Se unen con la lista base para conservar orden/históricos; sin duplicar.
  let asesoresDin = L.ASESORES;
  try {
    const gpBD = db.prepare("SELECT nombre FROM usuarios WHERE rol='gestora' AND activo=1 ORDER BY id").all().map(r => r.nombre);
    const set = new Set(L.ASESORES);
    gpBD.forEach(n => set.add(n));
    // Mantener las de la lista base primero (orden histórico) y añadir las nuevas al final.
    asesoresDin = [...L.ASESORES.filter(a => gpBD.includes(a) || true), ...gpBD.filter(n => !L.ASESORES.includes(n))];
  } catch (e) { asesoresDin = L.ASESORES; }
  res.json({
    asesores: asesoresDin, canales: L.CANALES, fuentes: L.FUENTES,
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
  const { nombre, telefono, email, fuente, campana, conjunto, anuncio, adId, asesor, montoReal, montoPotencial, fechaCreacion, origenCreacion } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Falta nombre del lead' });
  if (asesor && !L.ASESORES.includes(asesor)) {
    return res.status(400).json({ error: 'Asesor no valido. Opciones: ' + L.ASESORES.join(', ') });
  }
  const codigo = generarCodigo();
  const ahora = new Date().toISOString();
  // Fecha de creación: si la eligen, se guarda al mediodía de Perú (17:00 UTC) para que caiga en ese día.
  let fechaCarga = ahora;
  if (fechaCreacion && /^\d{4}-\d{2}-\d{2}/.test(String(fechaCreacion))) {
    fechaCarga = String(fechaCreacion).slice(0, 10) + 'T17:00:00.000Z';
  }
  const origen = ['make', 'relead', 'manual'].includes(origenCreacion) ? origenCreacion : 'manual';
  const montoIn = montoReal != null ? montoReal : (montoPotencial != null ? montoPotencial : null);
  const monto = (montoIn != null && String(montoIn).trim() !== '') ? Number(String(montoIn).replace(/[^\d.]/g, '')) : null;
  const rango = (monto != null && isFinite(monto)) ? L.montoARango(monto) : null;
  db.prepare(`INSERT INTO leads (codigo,nombre,telefono,email,fuente,campana,conjunto,anuncio,adId,asesor,montoReal,montoPotencial,montoRango,fechaCarga,fechaAsignacion,origenCreacion)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(codigo, nombre, L.normalizarCelular(telefono) || telefono || null, email || null,
         fuente || null, campana || null, conjunto || null, anuncio || null, adId || null,
         asesor || null, monto, monto, rango, fechaCarga, asesor ? fechaCarga : null, origen);
  if (campana || anuncio) { try { registrarAnuncioCatalogo(campana, conjunto, anuncio, adId); } catch (e) { } }
  // Bienvenida automática también para leads creados manualmente.
  bienvenida.saludar({ codigo, nombre, telefono: L.normalizarCelular(telefono) || telefono, fuente }, 'b2c');
  auditar(req, 'crear lead manual', codigo, `${nombre} · ${fechaCarga.slice(0, 10)} · ${origen}`);
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

// ===== EMBUDO DE CONVERSIÓN B2C (por fecha de ASIGNACIÓN) =====
// Para cada lead asignado en el rango, calcula la etapa MÁXIMA que alcanzó (histórico),
// cuenta cuántos superaron cada nivel (acumulado) y el % de conversión etapa→etapa.
// Señala el CUELLO: la transición con mayor caída (donde se pierden más leads).
// GET /api/b2c/embudo?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&asesor=Nombre
app.get('/api/b2c/embudo', async (req, res) => {
  try {
    const hoyP = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde) ? req.query.desde : null;
    const hasta = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta) ? req.query.hasta : null;

    // Solo leads asignados (con GP) en el rango de fecha de asignación.
    let leads = db.prepare("SELECT * FROM leads WHERE asesor IS NOT NULL AND asesor <> ''").all();
    if (!veTodo(req.user)) leads = leads.filter(l => l.asesor === req.user.nombre);
    else if (req.query.asesor) leads = leads.filter(l => l.asesor === req.query.asesor);
    leads = filtrarPorAsignacion(leads, desde, hasta);

    // Gestiones agrupadas (para la etapa alcanzada de cada lead).
    const gPorCod = {};
    db.prepare('SELECT * FROM gestiones ORDER BY fecha').all().forEach(x => { (gPorCod[x.codigo] = gPorCod[x.codigo] || []).push(x); });

    // --- Helpers 3x5 con días hábiles (domingos NO cuentan) ---
    const LIMA = -5 * 3600000;
    const diaL = iso => new Date(new Date(iso).getTime() + LIMA).toISOString().slice(0, 10);
    const horaL = iso => new Date(new Date(iso).getTime() + LIMA).getUTCHours();
    const dowL = iso => new Date(diaL(iso) + 'T12:00:00Z').getUTCDay(); // 0=domingo
    const franja = iso => { const h = horaL(iso); return h < 12 ? 0 : h < 16 ? 1 : 2; }; // 0:mañana 1:tarde 2:noche
    // Intentos mínimos del día de llegada según la franja (mañana=3, tarde=2, noche=1).
    const cuotaDia1 = fr => (fr === 0 ? 3 : fr === 1 ? 2 : 1);
    // Ancla del 3x5: si llega domingo, arranca el lunes en franja mañana (0).
    function anclaje3x5(fechaAsig) {
      let d = diaL(fechaAsig), fr = franja(fechaAsig);
      if (dowL(fechaAsig) === 0) { // domingo → lunes primera franja
        const dl = new Date(d + 'T12:00:00Z'); dl.setUTCDate(dl.getUTCDate() + 1);
        d = dl.toISOString().slice(0, 10); fr = 0;
      }
      return { dia: d, franja: fr };
    }
    // Intentos ESPERADOS hasta hoy: cuota del día 1 (según franja) + 3 por cada día hábil
    // (lunes-sábado) transcurrido después, sin contar domingos, hasta 5 días hábiles (3x5).
    function intentosEsperados(fechaAsig) {
      const anc = anclaje3x5(fechaAsig);
      const hoy = diaL(new Date().toISOString());
      let esperados = cuotaDia1(anc.franja), diasHabiles = 1;
      let cursor = new Date(anc.dia + 'T12:00:00Z');
      while (diasHabiles < 5) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        const ds = cursor.toISOString().slice(0, 10);
        if (ds > hoy) break;            // aún no llega ese día
        if (cursor.getUTCDay() === 0) continue; // domingo no cuenta (extiende)
        esperados += 3; diasHabiles++;
      }
      return { esperados, diaAncla: anc.dia };
    }
    // Días hábiles transcurridos desde el ancla (para el criterio "5+ días").
    function diasHabilesDesde(fechaAsig) {
      const anc = anclaje3x5(fechaAsig);
      const hoy = diaL(new Date().toISOString());
      let n = 0, cursor = new Date(anc.dia + 'T12:00:00Z');
      const fin = new Date(hoy + 'T12:00:00Z');
      while (cursor <= fin) { if (cursor.getUTCDay() !== 0) n++; cursor.setUTCDate(cursor.getUTCDate() + 1); }
      return n;
    }
    // Días CORRIDOS entre una fecha ISO y hoy (calendario).
    function diasCorridosDesde(iso) {
      if (!iso) return 0;
      return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
    }
    // Días HÁBILES (sin domingos) entre una fecha ISO y hoy.
    function diasHabilesEntre(iso) {
      if (!iso) return 0;
      let n = 0, cursor = new Date(diaL(iso) + 'T12:00:00Z');
      const fin = new Date(diaL(new Date().toISOString()) + 'T12:00:00Z');
      while (cursor < fin) { cursor.setUTCDate(cursor.getUTCDate() + 1); if (cursor.getUTCDay() !== 0) n++; }
      return n;
    }
    // Fecha en que el lead ENTRÓ a su etapa actual: la última gestión cuyo resultado
    // mapea a la etapa vigente y que representa la transición hacia ella. Si no hay
    // gestiones en esa etapa, cae a la fecha de asignación.
    function fechaEntradaEtapa(gs, etapaActual) {
      let entrada = null;
      // Recorremos en orden; la etapa "actual" empieza en la última vez que se ENTRÓ a ella.
      let etapaPrev = null;
      gs.forEach(g => {
        const e = L.etapaDeGestion ? L.etapaDeGestion(g.resultado) : null;
        if (e === etapaActual && etapaPrev !== etapaActual) entrada = g.fecha; // transición hacia la etapa
        etapaPrev = e;
      });
      // Si nunca hubo transición explícita (p.ej. sigue en 3x5), usa la última gestión o nada.
      return entrada;
    }

    // Formato de duración: horas si <1 día; días + horas si ≥1 día.
    function fmtDur(ms) {
      if (ms == null || ms < 0) return '—';
      const h = Math.floor(ms / 3600000);
      if (h < 24) return h + ' h';
      const d = Math.floor(h / 24), hr = h % 24;
      return d + ' d' + (hr ? ' ' + hr + ' h' : '');
    }
    // Métricas específicas de Agendado para un lead: tiempo hasta agendar, tiempo en la
    // etapa Agendado, e intentos antes/después de agendar.
    function metricasAgendado(l, gs) {
      let idxAgenda = -1;
      for (let k = 0; k < gs.length; k++) {
        if (L.etapaDeGestion(gs[k].resultado) === 'Agendado - pendiente reunion') { idxAgenda = k; break; }
      }
      if (idxAgenda < 0) return { tiempoHastaAgendar: '—', tiempoEnEtapa: '—', intentosHastaAgendar: gs.length, intentosPostAgendar: 0 };
      const fAgenda = gs[idxAgenda].fecha;
      const base = l.fechaAsignacion || (gs[0] && gs[0].fecha);
      const tiempoHasta = base ? (new Date(fAgenda) - new Date(base)) : null;
      const tiempoEnEtapa = Date.now() - new Date(fAgenda).getTime();
      return {
        tiempoHastaAgendar: fmtDur(tiempoHasta),
        tiempoEnEtapa: fmtDur(tiempoEnEtapa),
        intentosHastaAgendar: idxAgenda + 1,
        intentosPostAgendar: gs.length - (idxAgenda + 1)
      };
    }

    // Etapas del embudo, en orden. "Cerrado ganado" es el fondo (cierre).
    const NIVELES = [
      { id: 'asignados', titulo: 'Asignados', ord: 0 },
      { id: 'contactado', titulo: 'Contactado', ord: 1 },
      { id: 'calificado', titulo: 'Calificado', ord: 2 },
      { id: 'agendado', titulo: 'Agendado', ord: 3 },
      { id: 'reunion', titulo: 'Reunión efectiva', ord: 4 },
      { id: 'negociacion', titulo: 'Negociación', ord: 5 },
      { id: 'cierre', titulo: 'Cierre ganado', ord: 6 }
    ];
    const conteo = {}; NIVELES.forEach(n => conteo[n.id] = 0);
    const fugaPorNivel = {}; NIVELES.forEach(n => fugaPorNivel[n.id] = 0);  // perdidos que MÁXIMO llegaron a ese nivel
    const vivosPorNivel = {}; NIVELES.forEach(n => vivosPorNivel[n.id] = []);   // detalle de los que siguen vivos AQUÍ
    const desestPorNivel = {}; NIVELES.forEach(n => desestPorNivel[n.id] = []); // detalle de los desestimados AQUÍ
    let perdidos = 0, montoTotal = 0;
    const montoPorNivel = {}; NIVELES.forEach(n => montoPorNivel[n.id] = 0);
    const enRiesgo = []; // 5+ días hábiles, sin desestimar, con menos intentos de los esperados
    // Contadores para las scorecards (misma base y fecha que el embudo: asignación).
    const SIN = L.RESULTADOS_SIN_CONTACTO || [];
    let scContactados = 0, scGanados = 0, scMontoGanado = 0, scHicieron3x5 = 0;
    const tiemposPrimerContacto = [], intentosPrimerContacto = [];
    // Mapa anuncio → creativeUrl (para el preview de origen). Una sola consulta.
    const creativoPorAnuncio = {};
    try {
      db.prepare("SELECT anuncio, creativeUrl FROM marketing_gasto WHERE creativeUrl IS NOT NULL AND anuncio IS NOT NULL").all()
        .forEach(r => { if (!creativoPorAnuncio[r.anuncio]) creativoPorAnuncio[r.anuncio] = r.creativeUrl; });
    } catch (e) {}
    // Listas de contactabilidad (transversal, NO altera las etapas del embudo).
    const contactables = [], noContactables = [];
    // Análisis de MOTIVOS de desestimación (para el modal de diagnóstico).
    const motivosDesest = {}; // clave motivo||tipo → { motivo, tipo, n, monto, porEtapa, porAnuncio }
    let gCalidad = 0, gComercial = 0, gOtro = 0; // clasificación afinada por motivo+etapa
    // Rendimiento por ANUNCIO: cuánto trae cada uno y en qué termina (para el radar).
    const rendAnuncio = {}; // anuncio → { total, vivos, ganados, dCal, dCom, dOtro, monto, camp, conj }
    const rendDe = anun => {
      if (!rendAnuncio[anun]) rendAnuncio[anun] = { anuncio: anun, total: 0, vivos: 0, ganados: 0, dCal: 0, dCom: 0, dOtro: 0, monto: 0, camp: {}, conj: {} };
      return rendAnuncio[anun];
    };
    // Mapa etapa vigente → id de nivel del embudo (para ubicar "vivos aquí").
    const ETAPA_A_NIVEL = {
      'Contactabilidad 3x5': 'asignados', 'Contactado - por calificar': 'contactado',
      'Calificado - pendiente agendar': 'calificado', 'Agendado - pendiente reunion': 'agendado',
      'Reunion efectiva - seguimiento': 'reunion', 'Cierre pendiente': 'negociacion', 'Cerrado ganado': 'cierre'
    };

    const anomalias = []; // avanzaron a Agendado+ sin las 5 preguntas completas
    leads.forEach(l => {
      const gs = gPorCod[l.codigo] || [];
      const cons = leadConsolidado(l, gs);
      const ordMax = L.etapaMaximaAlcanzada(gs, cons.etapa);
      const monto = Number(l.montoReal || l.montoPotencial || 0) || 0;
      montoTotal += monto;
      NIVELES.forEach(n => { if (ordMax >= n.ord) { conteo[n.id]++; montoPorNivel[n.id] += monto; } });
      const ultGest = gs.length ? gs[gs.length - 1] : null;
      const esPerdido = cons.etapa === 'Cerrado perdido';
      const esGanado = cons.etapa === 'Cerrado ganado';
      // Scorecards (misma base del embudo): contactado efectivo, ganados, 3x5, tiempos.
      const respondioAlgunaVez = gs.some(g => !SIN.includes(g.resultado));
      if (respondioAlgunaVez) scContactados++;
      // Contactabilidad transversal: ¿respondió al menos una vez? (independiente de etapa).
      const registro = {
        codigo: l.codigo, nombre: l.nombre || l.codigo, telefono: l.telefono || '',
        asesor: l.asesor || '—', etapa: cons.etapa, intentos: gs.length, monto,
        anuncio: l.anuncio || '(sin anuncio)', adId: l.adId || '',
        creativeUrl: l.anuncio && creativoPorAnuncio[l.anuncio] ? creativoPorAnuncio[l.anuncio] : null,
        vivo: !esPerdido && !esGanado
      };
      if (respondioAlgunaVez) contactables.push(registro); else noContactables.push(registro);
      // Rendimiento por anuncio: total del cohorte y destino vivo/ganado.
      const RAt = rendDe(l.anuncio || '(sin anuncio)');
      RAt.total++; RAt.monto += monto;
      const cN = l.campana || '(sin campaña)', jN = l.conjunto || '(sin conjunto)';
      RAt.camp[cN] = (RAt.camp[cN] || 0) + 1;
      RAt.conj[jN] = (RAt.conj[jN] || 0) + 1;
      if (esGanado) RAt.ganados++;
      else if (!esPerdido) RAt.vivos++;
      if (esGanado) { scGanados++; scMontoGanado += monto; }
      if (gs.length >= 15) scHicieron3x5++;
      if (l.fechaAsignacion && gs.length) {
        let n = 0, logradoIdx = -1;
        for (let k = 0; k < gs.length; k++) { n++; if (!SIN.includes(gs[k].resultado)) { logradoIdx = k; break; } }
        if (logradoIdx >= 0) {
          const mins = Math.round((new Date(gs[logradoIdx].fecha) - new Date(l.fechaAsignacion)) / 60000);
          if (mins >= 0) tiemposPrimerContacto.push(mins);
          intentosPrimerContacto.push(n);
        }
      }
      if (esPerdido) {
        perdidos++;
        const nivelFuga = NIVELES.find(n => n.ord === ordMax);
        if (nivelFuga) {
          fugaPorNivel[nivelFuga.id]++;
          const mAgD = nivelFuga.id === 'agendado' ? metricasAgendado(l, gs) : null;
          desestPorNivel[nivelFuga.id].push({
            codigo: l.codigo, nombre: l.nombre || l.codigo, asesor: l.asesor || '—',
            motivo: ultGest ? ultGest.resultado : '—', intentos: gs.length,
            diasTotales: diasCorridosDesde(l.fechaAsignacion),
            fechaCierre: ultGest ? ultGest.fecha : null, monto,
            ...(mAgD || {})
          });
          // Clasificación AFINADA (v1.389): motivo + etapa donde se cayó.
          // "No interesado"/"Desistió" ANTES de calificar (ord < 2) = calidad de lead
          // (nunca supimos si tenía perfil). DESPUÉS de calificar = comercial (el vendedor
          // tuvo la oportunidad). Motivos técnicos (número, no califica) siempre son calidad.
          const mot = ultGest ? ultGest.resultado : '(sin gestión)';
          const CALIDAD_FIJO = ['Respondio - no califica', 'Numero invalido', 'Numero equivocado', 'Pidio no contactar'];
          const AMBIGUO = ['Respondio - no interesado', 'Desistio']; // depende de la etapa
          let tipoLead;
          if (CALIDAD_FIJO.includes(mot)) tipoLead = 'calidad';
          else if (AMBIGUO.includes(mot)) tipoLead = ordMax >= 2 ? 'comercial' : 'calidad'; // corte en Calificado (ord 2)
          else tipoLead = 'otro';
          // Clave por MOTIVO + TIPO: así un mismo motivo se separa en filas de calidad y
          // comercial (Diego necesita verlos separados, no como "mixto").
          const claveMT = mot + '||' + tipoLead;
          if (!motivosDesest[claveMT]) motivosDesest[claveMT] = { motivo: mot, tipo: tipoLead, n: 0, monto: 0, porEtapa: {}, porAnuncio: {} };
          const M = motivosDesest[claveMT];
          M.n++; M.monto += monto;
          M.porEtapa[nivelFuga.titulo] = (M.porEtapa[nivelFuga.titulo] || 0) + 1;
          const anun = l.anuncio || '(sin anuncio)';
          M.porAnuncio[anun] = (M.porAnuncio[anun] || 0) + 1;
          // Rendimiento por anuncio: este lead terminó desestimado (con su tipo).
          const RA = rendDe(anun);
          if (tipoLead === 'calidad') RA.dCal++; else if (tipoLead === 'comercial') RA.dCom++; else RA.dOtro++;
          // Acumular el tipo a nivel global (para el veredicto).
          if (tipoLead === 'calidad') gCalidad++;
          else if (tipoLead === 'comercial') gComercial++;
          else gOtro++;
        }
      } else if (!esGanado) {
        // Sigue VIVO: lo ubicamos en el nivel de su etapa vigente.
        const nivelId = ETAPA_A_NIVEL[cons.etapa];
        if (nivelId && vivosPorNivel[nivelId]) {
          const fEnt = fechaEntradaEtapa(gs, cons.etapa) || l.fechaAsignacion;
          const mAgV = nivelId === 'agendado' ? metricasAgendado(l, gs) : null;
          vivosPorNivel[nivelId].push({
            codigo: l.codigo, nombre: l.nombre || l.codigo, asesor: l.asesor || '—',
            intentos: gs.length,
            diasEnEtapaHab: diasHabilesEntre(fEnt), diasEnEtapaCorr: diasCorridosDesde(fEnt),
            diasTotales: diasCorridosDesde(l.fechaAsignacion),
            ultResultado: ultGest ? ultGest.resultado : 'sin gestión',
            ultFecha: ultGest ? ultGest.fecha : null, monto,
            ...(mAgV || {})
          });
        }
      }
      // ANOMALÍA: su etapa vigente es Agendado o más, pero NUNCA completó las 5 preguntas.
      const ordVigente = ORD_ETAPA_ATRIB[cons.etapa] != null ? ORD_ETAPA_ATRIB[cons.etapa] : 0;
      if (ordVigente >= 3 && !L.tieneCalificacionCompleta(gs)) {
        anomalias.push({ codigo: l.codigo, nombre: l.nombre || l.codigo, etapa: cons.etapa, asesor: l.asesor || '—', monto });
      }
      // EN RIESGO: sigue vivo (no perdido ni ganado), 5+ días hábiles, e intentos < esperados.
      if (!esPerdido && !esGanado && l.fechaAsignacion) {
        const dh = diasHabilesDesde(l.fechaAsignacion);
        if (dh >= 5) {
          const { esperados } = intentosEsperados(l.fechaAsignacion);
          const realizados = gs.length; // un intento = cualquier gestión registrada
          if (realizados < esperados) {
            enRiesgo.push({ codigo: l.codigo, nombre: l.nombre || l.codigo, asesor: l.asesor || '—',
              etapa: cons.etapa, diasHabiles: dh, intentos: realizados, esperados, faltan: esperados - realizados, monto });
          }
        }
      }
    });
    const fmtS = m => 'S/ ' + (Number(m) || 0).toLocaleString('es-PE');

    // Armar el embudo con % de conversión etapa→etapa y % del total.
    const base = conteo.asignados || 0;
    const filas = NIVELES.map((n, i) => {
      const prev = i > 0 ? conteo[NIVELES[i - 1].id] : conteo[n.id];
      const convDesdeAnterior = i === 0 ? 100 : (prev > 0 ? Math.round((conteo[n.id] / prev) * 100) : 0);
      const pctDelTotal = base > 0 ? Math.round((conteo[n.id] / base) * 100) : 0;
      const caida = i === 0 ? 0 : (prev - conteo[n.id]);
      const fuga = fugaPorNivel[n.id] || 0;              // se perdieron habiendo llegado como máx a esta etapa
      const listaVivos = vivosPorNivel[n.id] || [];
      const listaDesest = desestPorNivel[n.id] || [];
      const vivos = listaVivos.length;
      const montoVivos = listaVivos.reduce((a, x) => a + x.monto, 0);
      const montoDesest = listaDesest.reduce((a, x) => a + x.monto, 0);
      return { id: n.id, titulo: n.titulo, n: conteo[n.id], convDesdeAnterior, pctDelTotal, fuga, vivos,
        montoVivosFmt: fmtS(montoVivos), montoDesestFmt: fmtS(montoDesest),
        vivosLista: listaVivos.sort((a, b) => b.diasEnEtapaHab - a.diasEnEtapaHab),
        desestLista: listaDesest.sort((a, b) => (new Date(b.fechaCierre || 0)) - (new Date(a.fechaCierre || 0))),
        caida, montoFmt: fmtS(montoPorNivel[n.id]), monto: montoPorNivel[n.id] };
    });

    // CUELLO: la transición (i-1 → i) con mayor caída absoluta de leads (excluye el paso 0).
    let cuello = null, maxCaida = -1;
    for (let i = 1; i < filas.length; i++) {
      if (filas[i].caida > maxCaida) { maxCaida = filas[i].caida; cuello = { de: filas[i - 1].titulo, a: filas[i].titulo, perdidos: filas[i].caida, convPct: filas[i].convDesdeAnterior, idx: i }; }
    }
    // También el cuello por PEOR tasa de conversión (a veces la caída chica en % es el problema).
    let cuelloPct = null, peorPct = 101;
    for (let i = 1; i < filas.length; i++) {
      if (filas[i].n > 0 || filas[i - 1].n > 0) {
        if (filas[i].convDesdeAnterior < peorPct) { peorPct = filas[i].convDesdeAnterior; cuelloPct = { de: filas[i - 1].titulo, a: filas[i].titulo, convPct: filas[i].convDesdeAnterior, idx: i }; }
      }
    }

    // Scorecards derivadas del mismo cohorte del embudo (base = asignados, fecha = asignación).
    const mediana = arr => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
    const promedio = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;
    const scorecards = {
      totalLeads: base,
      contactados: scContactados,
      contactabilidad: base > 0 ? Math.round((scContactados / base) * 100) : 0,
      ganados: scGanados,
      montoGanadoFmt: fmtS(scMontoGanado),
      tasaCierre: base > 0 ? Math.round((scGanados / base) * 100 * 10) / 10 : 0,
      hicieron3x5: scHicieron3x5,
      perdidos,
      medianaMinPrimerContacto: mediana(tiemposPrimerContacto),
      promIntentosPrimerContacto: promedio(intentosPrimerContacto)
    };

    // Bloque de CONTACTABILIDAD (transversal). No es una etapa del embudo: es un atributo.
    const sumMonto = arr => arr.reduce((a, x) => a + x.monto, 0);
    const contVivos = contactables.filter(x => x.vivo);
    const contDesest = contactables.filter(x => !x.vivo);
    const agrupaPorAnuncio = arr => {
      const m = {};
      arr.forEach(x => {
        const k = x.anuncio || '(sin anuncio)';
        if (!m[k]) m[k] = { anuncio: k, creativeUrl: x.creativeUrl, n: 0, monto: 0 };
        m[k].n++; m[k].monto += x.monto;
      });
      return Object.values(m).sort((a, b) => b.n - a.n).map(a => ({ ...a, montoFmt: fmtS(a.monto) }));
    };
    const contactabilidad = {
      total: contactables.length,
      pct: base > 0 ? Math.round((contactables.length / base) * 100) : 0,
      montoFmt: fmtS(sumMonto(contactables)),
      vivos: contVivos.length, vivosMontoFmt: fmtS(sumMonto(contVivos)),
      desestimados: contDesest.length, desestMontoFmt: fmtS(sumMonto(contDesest)),
      noContactables: noContactables.length, noContMontoFmt: fmtS(sumMonto(noContactables)),
      noContVivos: noContactables.filter(x => x.vivo).length,
      listaContactables: contactables.slice(0, 100),
      listaNoContactables: noContactables.slice(0, 100),
      anunciosContactables: agrupaPorAnuncio(contactables),
      anunciosNoContactables: agrupaPorAnuncio(noContactables)
    };

    // Análisis de motivos con clasificación AFINADA (motivo + etapa donde se cayó).
    // Cada entrada ya viene separada por tipo (calidad/comercial/otro).
    const totalDesest = Object.values(motivosDesest).reduce((a, m) => a + m.n, 0);
    const ordenTipo = { calidad: 0, comercial: 1, otro: 2 };
    const motivosLista = Object.values(motivosDesest)
      .sort((a, b) => (ordenTipo[a.tipo] - ordenTipo[b.tipo]) || (b.n - a.n))
      .map(m => ({
        motivo: m.motivo, tipo: m.tipo, n: m.n, montoFmt: fmtS(m.monto),
        pct: totalDesest ? Math.round((m.n / totalDesest) * 100) : 0,
        etapas: Object.entries(m.porEtapa).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ etapa: k, n: v })),
        anuncios: Object.entries(m.porAnuncio).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ anuncio: k, n: v, creativeUrl: creativoPorAnuncio[k] || null }))
      }));
    const analisisMotivos = {
      total: totalDesest, lista: motivosLista,
      calidad: gCalidad, comercial: gComercial, otro: gOtro,
      pctCalidad: totalDesest ? Math.round((gCalidad / totalDesest) * 100) : 0,
      pctComercial: totalDesest ? Math.round((gComercial / totalDesest) * 100) : 0,
      pctOtro: totalDesest ? Math.round((gOtro / totalDesest) * 100) : 0,
      veredicto: gCalidad > gComercial ? 'calidad' : gComercial > gCalidad ? 'comercial' : 'mixto'
    };

    // RENDIMIENTO POR ANUNCIO (para el radar de cuadrantes): volumen vs desperdicio,
    // con el tipo de desperdicio dominante (calidad→Marketing, comercial→gestión).
    // Gasto de Meta por anuncio en el periodo (para el modo CPL del radar).
    // FUENTE PRINCIPAL: el API de Meta (misma fuente que Tendencias/Costo x Lead), en DÓLARES.
    // Fallback: la tabla marketing_gasto (Excel, obsoleta) solo si el API no está configurado.
    const normAn = s => String(s || '').trim().toLowerCase();
    const gastoPorAnuncio = {}; // clave normalizada → USD
    let fuenteGasto = 'ninguna';
    if (metaInsights.configurado()) {
      try {
        const hoyPm = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
        const ad = await metaInsights.insightsAd(desde || '2026-06-23', hasta || hoyPm, req.query.metaForce === '1');
        (ad.filas || []).forEach(g => {
          const k = normAn(g.anuncio);
          if (k) gastoPorAnuncio[k] = (gastoPorAnuncio[k] || 0) + (Number(g.spend) || 0);
        });
        fuenteGasto = 'meta_api_usd';
      } catch (e) { console.error('[embudo gasto Meta]', e.message); }
    }
    if (fuenteGasto === 'ninguna') {
      try {
        let gRows = db.prepare("SELECT anuncio, fecha, costo FROM marketing_gasto WHERE anuncio IS NOT NULL AND costo IS NOT NULL").all();
        if (desde) gRows = gRows.filter(g => g.fecha >= desde);
        if (hasta) gRows = gRows.filter(g => g.fecha <= hasta);
        gRows.forEach(g => { const k = normAn(g.anuncio); gastoPorAnuncio[k] = (gastoPorAnuncio[k] || 0) + (Number(g.costo) || 0); });
        if (gRows.length) fuenteGasto = 'excel_gasto';
      } catch (e) {}
    }
    const rendimientoAnuncios = Object.values(rendAnuncio)
      .filter(a => a.total > 0)
      .map(a => {
        const desest = a.dCal + a.dCom + a.dOtro;
        const pctDesp = a.total ? Math.round((desest / a.total) * 100) : 0;
        const gasto = Math.round((gastoPorAnuncio[normAn(a.anuncio)] || 0) * 100) / 100;
        return {
          anuncio: a.anuncio, creativeUrl: creativoPorAnuncio[a.anuncio] || null,
          total: a.total, vivos: a.vivos, ganados: a.ganados,
          dCal: a.dCal, dCom: a.dCom, dOtro: a.dOtro, desest,
          pctDesp,
          pctVivos: a.total ? Math.round((a.vivos / a.total) * 100) : 0,
          pctCal: desest ? Math.round((a.dCal / desest) * 100) : 0,
          pctCom: desest ? Math.round((a.dCom / desest) * 100) : 0,
          gasto, cpl: a.total && gasto ? Math.round((gasto / a.total) * 100) / 100 : null,
          campanas: Object.entries(a.camp).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ nombre: k, n: v })),
          conjuntos: Object.entries(a.conj).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ nombre: k, n: v })),
          montoFmt: fmtS(a.monto)
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 25);
    // Tasa promedio de desperdicio del cohorte (corte Y del radar: peor/mejor que tu promedio).
    const pctDespPromedio = base > 0 ? Math.round((perdidos / base) * 100) : 0;

    res.json({
      desde, hasta, fechaBase: 'asignacion',
      totalLeads: base, perdidos, montoTotal: fmtS(montoTotal),
      conversionGlobal: base > 0 ? Math.round((conteo.cierre / base) * 100 * 10) / 10 : 0,
      scorecards, contactabilidad, analisisMotivos,
      rendimientoAnuncios, pctDespPromedio, fuenteGasto,
      filas, cuello, cuelloPct,
      anomalias: { total: anomalias.length, montoFmt: fmtS(anomalias.reduce((a, x) => a + x.monto, 0)), lista: anomalias.slice(0, 30) },
      enRiesgo: { total: enRiesgo.length, montoFmt: fmtS(enRiesgo.reduce((a, x) => a + x.monto, 0)),
        lista: enRiesgo.sort((a, b) => b.faltan - a.faltan).slice(0, 50) }
    });
  } catch (e) {
    console.error('[b2c/embudo]', e.stack || e.message);
    res.status(500).json({ error: e.message });
  }
});

// Descarga CSV de leads contactables o no-contactables (para remarketing en Meta).
// GET /api/b2c/embudo/csv?tipo=contactables|nocontactables&desde&hasta&asesor
app.get('/api/b2c/embudo/csv', (req, res) => {
  try {
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde) ? req.query.desde : null;
    const hasta = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta) ? req.query.hasta : null;
    const tipo = req.query.tipo === 'nocontactables' ? 'nocontactables' : 'contactables';
    const SIN = L.RESULTADOS_SIN_CONTACTO || [];
    let leads = db.prepare("SELECT * FROM leads WHERE asesor IS NOT NULL AND asesor <> ''").all();
    if (!veTodo(req.user)) leads = leads.filter(l => l.asesor === req.user.nombre);
    else if (req.query.asesor) leads = leads.filter(l => l.asesor === req.query.asesor);
    leads = filtrarPorAsignacion(leads, desde, hasta);
    const gPorCod = {};
    db.prepare('SELECT * FROM gestiones ORDER BY fecha').all().forEach(x => { (gPorCod[x.codigo] = gPorCod[x.codigo] || []).push(x); });
    const filas = [];
    leads.forEach(l => {
      const gs = gPorCod[l.codigo] || [];
      const respondio = gs.some(g => !SIN.includes(g.resultado));
      if ((tipo === 'contactables') === respondio) {
        const cons = leadConsolidado(l, gs);
        filas.push({ nombre: l.nombre || '', telefono: l.telefono || '', email: l.email || '',
          etapa: cons.etapa, intentos: gs.length, anuncio: l.anuncio || '', asesor: l.asesor || '' });
      }
    });
    // CSV con BOM para que Excel abra bien los acentos.
    const esc = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const head = ['Nombre', 'Telefono', 'Email', 'Etapa', 'Intentos', 'Anuncio', 'GP'];
    const csv = '\uFEFF' + [head.join(','), ...filas.map(f => [f.nombre, f.telefono, f.email, f.etapa, f.intentos, f.anuncio, f.asesor].map(esc).join(','))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + tipo + '_' + (desde || 'todo') + '_' + (hasta || 'hoy') + '.csv"');
    res.send(csv);
  } catch (e) {
    console.error('[embudo/csv]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===== COLA PRIORIZADA B2C (Centro de operaciones) =====
// Devuelve los leads VIVOS del asesor (o todos, si supervisa) ordenados por priority score.
// GET /api/b2c/cola?asesor=&limit=
app.get('/api/b2c/cola', (req, res) => {
  try {
    const SIN = L.RESULTADOS_SIN_CONTACTO || [];
    const pesos = getPScorePesosB2C();
    let leads = db.prepare("SELECT * FROM leads WHERE COALESCE(archivado,0)=0 AND asesor IS NOT NULL AND asesor <> ''").all();
    // Alcance: una GP ve solo lo suyo; supervisores ven todo (o filtran por asesor).
    if (!veTodo(req.user)) leads = leads.filter(l => l.asesor === req.user.nombre);
    else if (req.query.asesor) leads = leads.filter(l => l.asesor === req.query.asesor);
    const gPorCod = {};
    db.prepare('SELECT * FROM gestiones ORDER BY fecha').all().forEach(x => { (gPorCod[x.codigo] = gPorCod[x.codigo] || []).push(x); });
    // Helpers de fecha (mismos que el embudo).
    const LIMA = -5 * 3600000;
    const diaL = iso => new Date(new Date(iso).getTime() + LIMA).toISOString().slice(0, 10);
    const horaL = iso => new Date(new Date(iso).getTime() + LIMA).getUTCHours();
    const dowL = iso => new Date(diaL(iso) + 'T12:00:00Z').getUTCDay();
    const franja = iso => { const h = horaL(iso); return h < 12 ? 0 : h < 16 ? 1 : 2; };
    const cuotaDia1 = fr => (fr === 0 ? 3 : fr === 1 ? 2 : 1);
    function anclaje3x5(f) { let d = diaL(f), fr = franja(f); if (dowL(f) === 0) { const dl = new Date(d + 'T12:00:00Z'); dl.setUTCDate(dl.getUTCDate() + 1); d = dl.toISOString().slice(0, 10); fr = 0; } return { dia: d, franja: fr }; }
    function intentosEsperados(f) { if (!f) return 0; const a = anclaje3x5(f); const hoy = diaL(new Date().toISOString()); let e = cuotaDia1(a.franja), dh = 1, c = new Date(a.dia + 'T12:00:00Z'); while (dh < 5) { c.setUTCDate(c.getUTCDate() + 1); const ds = c.toISOString().slice(0, 10); if (ds > hoy) break; if (c.getUTCDay() === 0) continue; e += 3; dh++; } return e; }
    function fechaEntradaEtapa(gs, etapaActual) { let entrada = null, prev = null; (gs || []).forEach(g => { const e = L.etapaDeGestion ? L.etapaDeGestion(g.resultado) : null; if (e === etapaActual && prev !== etapaActual) entrada = g.fecha; prev = e; }); return entrada; }
    // Monto máximo (para normalizar el score).
    const montoMax = Math.max(1, ...leads.map(l => Number(l.montoReal || l.montoPotencial || 0) || 0));
    const cola = [];
    leads.forEach(l => {
      const gs = gPorCod[l.codigo] || [];
      const cons = leadConsolidado(l, gs);
      if (cons.etapa === 'Cerrado ganado' || cons.etapa === 'Cerrado perdido') return; // solo vivos
      const monto = Number(l.montoReal || l.montoPotencial || 0) || 0;
      const fEnt = fechaEntradaEtapa(gs, cons.etapa) || l.fechaAsignacion;
      const ps = L.priorityScoreB2C({
        etapa: cons.etapa, probabilidad: cons.probabilidad, monto,
        fechaProxAccion: cons.fechaProxAccion, fechaReunion: l.fechaReunion || null,
        fechaEntradaEtapa: fEnt, intentos: gs.length,
        intentosEsperados: intentosEsperados(l.fechaAsignacion),
        respondioAlgunaVez: gs.some(g => !SIN.includes(g.resultado))
      }, montoMax, pesos);
      cola.push({
        codigo: l.codigo, nombre: l.nombre || l.codigo, asesor: l.asesor || '—',
        etapa: cons.etapa, monto, montoFmt: 'S/ ' + monto.toLocaleString('es-PE'),
        score: ps.score, nivel: ps.nivel, diasEnEtapa: ps.diasEnEtapa,
        proximaAccion: cons.proximaAccion || null, fechaProxAccion: cons.fechaProxAccion || null,
        intentos: gs.length, probabilidad: cons.probabilidad, detalle: ps.detalle
      });
    });
    cola.sort((a, b) => b.score - a.score || b.monto - a.monto);
    const limit = Math.min(200, Number(req.query.limit) || 100);
    // Resumen por nivel.
    const resumen = { 'Muy alta': 0, 'Alta': 0, 'Media': 0, 'Baja': 0, 'Muy baja': 0 };
    cola.forEach(c => { resumen[c.nivel] = (resumen[c.nivel] || 0) + 1; });
    res.json({ total: cola.length, resumen, pesos, cola: cola.slice(0, limit) });
  } catch (e) {
    console.error('[b2c/cola]', e.stack || e.message);
    res.status(500).json({ error: e.message });
  }
});

// Pesos del priority score B2C (ver / guardar). Solo supervisores pueden cambiarlos.
app.get('/api/b2c/pscore/pesos', (req, res) => res.json({ pesos: getPScorePesosB2C(), default: L.PScoreDefaultB2C }));
app.put('/api/b2c/pscore/pesos', (req, res) => {
  if (!veTodo(req.user)) return res.status(403).json({ error: 'Solo supervisión puede ajustar los pesos.' });
  const p = req.body && req.body.pesos;
  if (!p || typeof p !== 'object') return res.status(400).json({ error: 'Pesos inválidos' });
  const limpio = {};
  Object.keys(L.PScoreDefaultB2C).forEach(k => { const v = Number(p[k]); if (isFinite(v) && v >= 0) limpio[k] = v; });
  db.prepare("INSERT INTO app_config (clave, valor) VALUES ('b2c_pscore_pesos', ?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor")
    .run(JSON.stringify(limpio));
  auditar(req, 'b2c_pscore_pesos', null, JSON.stringify(limpio));
  res.json({ ok: true, pesos: Object.assign({}, L.PScoreDefaultB2C, limpio) });
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

// Reuniones agendadas (programadas, aún no realizadas), ordenadas por fecha/hora.
// estadoReunion 'Agendada' = agendó/confirmó/reprogramó (pendiente); 'Efectiva' = ya se realizó (se excluye).
app.get('/api/reuniones', (req, res) => {
  let leads = db.prepare('SELECT * FROM leads WHERE COALESCE(archivado,0)=0 AND COALESCE(cuarentena,0)=0').all();
  if (!veTodo(req.user)) leads = leads.filter(l => l.asesor === req.user.nombre);
  const AGEND_ACTS = { 'Agendo reunion': 'Agendada', 'Confirmo reunion': 'Confirmada', 'Reprogramo reunion': 'Reprogramada' };
  const out = [];
  leads.forEach(l => {
    const gs = gestionesDeLead(l.codigo);
    const c = L.consolidarLead(l, gs);
    if (!c.fechaReunion || c.estadoReunion !== 'Agendada') return;
    if (c.etapa === 'Cerrado ganado' || c.etapa === 'Cerrado perdido') return;
    // Recorre las gestiones de agendamiento: fecha original (la primera) y reprogramación (la última 'Reprogramo')
    let estadoLabel = 'Agendada', fechaOriginal = null, fechaReprog = null;
    for (const g of gs) {
      if (g.fechaReunion && AGEND_ACTS[g.resultado]) {
        if (!fechaOriginal) fechaOriginal = g.fechaReunion;
        if (g.resultado === 'Reprogramo reunion') fechaReprog = g.fechaReunion;
      }
    }
    for (let i = gs.length - 1; i >= 0; i--) { if (AGEND_ACTS[gs[i].resultado]) { estadoLabel = AGEND_ACTS[gs[i].resultado]; break; } }
    const fechaOrden = c.fechaReunion; // la efectiva (más reciente) — para ordenar cronológicamente
    out.push({
      codigo: l.codigo, nombre: l.nombre, telefono: l.telefono, asesor: l.asesor, estadoLabel,
      fechaReunion: fechaOriginal || fechaOrden,
      fechaReprogramada: estadoLabel === 'Reprogramada' ? (fechaReprog || fechaOrden) : null,
      fechaOrden
    });
  });
  out.sort((a, b) => new Date(a.fechaOrden) - new Date(b.fechaOrden));
  res.json({ reuniones: out });
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

  // Aviso WhatsApp instantaneo cuando se agenda/confirma/reprograma una reunion.
  const TITULO_AGENDA = { 'Agendo reunion': '📅 *Reunión agendada*', 'Confirmo reunion': '✅ *Reunión confirmada*', 'Reprogramo reunion': '🔄 *Reunión reprogramada*' };
  if (TITULO_AGENDA[g.resultado]) {
    const fmtReunionWA = iso => {
      if (!iso) return 'sin fecha';
      const dd = new Date(new Date(iso).getTime() - 5 * 3600000);
      const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'], meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      const fecha = dias[dd.getUTCDay()] + ' ' + dd.getUTCDate() + ' ' + meses[dd.getUTCMonth()];
      let h = dd.getUTCHours(); const m = dd.getUTCMinutes();
      if (h === 0 && m === 0) return fecha; // sin hora definida
      const ap = h < 12 ? 'am' : 'pm'; let h12 = h % 12; if (h12 === 0) h12 = 12;
      return fecha + ', ' + h12 + ':' + String(m).padStart(2, '0') + ' ' + ap;
    };
    const gpCorto = String(g.asesor).trim().split(/\s+/)[0] || g.asesor;
    enviarAlertaWA(`${TITULO_AGENDA[g.resultado]} — ${lead.nombre}\n👤 ${gpCorto} · 🗓 ${fmtReunionWA(g.fechaReunion)}`);
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
  // Medicion de supervision: registrar la revision (solo roles que supervisan, no gestoras).
  if (['admin', 'jefa'].includes(req.user.rol)) auditar(req, 'ver_trazabilidad', lead.codigo, null);

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
  const historialEtapas = []; // cambios de etapa con fecha (para el grid de contactabilidad)
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
    if (subio) historialEtapas.push({ fecha: g.fecha, etapa: parcial.etapa });
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

  // ===== Grid de contactabilidad 3 franjas x 10 dias (desde la asignacion, hora Lima UTC-5) =====
  const LIMA_OFF = -5 * 3600000;
  const diaLima = (iso) => Math.floor((new Date(iso).getTime() + LIMA_OFF) / 86400000);
  const horaLima = (iso) => new Date(new Date(iso).getTime() + LIMA_OFF).getUTCHours();
  const franjaDe = (iso) => { const h = horaLima(iso); return h < 12 ? 0 : (h < 16 ? 1 : 2); }; // M / T / N
  const desdeIso = lead.fechaAsignacion || lead.fechaCarga || new Date().toISOString();
  const d0 = diaLima(desdeIso), hoyD = diaLima(new Date().toISOString()), franjaAhora = franjaDe(new Date().toISOString());
  const NOCON = new Set(['No_respondio']);
  const grid = [];
  for (let d = 0; d < 10; d++) {
    const fMs = (d0 + d) * 86400000 - LIMA_OFF;
    const fecha = new Date(fMs);
    grid.push({ etiqueta: 'D' + (d + 1), fecha: fecha.toISOString().slice(0, 10),
      dm: String(fecha.getUTCDate()).padStart(2, '0') + '/' + String(fecha.getUTCMonth() + 1).padStart(2, '0'),
      franjas: [null, null, null].map((_, fr) => {
        const futuro = (d0 + d) > hoyD || ((d0 + d) === hoyD && fr > franjaAhora);
        return { estado: futuro ? 'futuro' : 'vacio' };
      }), etapa: null });
  }
  gestiones.forEach(g => {
    const d = diaLima(g.fecha) - d0;
    if (d < 0 || d > 9) return;
    const fr = franjaDe(g.fecha);
    const celda = grid[d].franjas[fr];
    const esContacto = !NOCON.has(L.grupoLimpio(g.resultado));
    if (esContacto) celda.estado = 'contacto';
    else if (celda.estado !== 'contacto') celda.estado = 'intento';
  });
  // Etapa vigente al cierre de cada dia (parte de Contactabilidad 3x5 y avanza con el historial)
  let etapaDia = 'Contactabilidad 3x5'; let hIdx = 0;
  for (let d = 0; d < 10; d++) {
    const finDia = (d0 + d + 1) * 86400000 - LIMA_OFF;
    while (hIdx < historialEtapas.length && new Date(historialEtapas[hIdx].fecha).getTime() < finDia) { etapaDia = historialEtapas[hIdx].etapa; hIdx++; }
    grid[d].etapa = (d0 + d) <= hoyD ? etapaDia : null; // dias futuros sin etapa
  }
  const contactabilidad = { desde: desdeIso, dias: grid, etapaActual: cons.etapa };

  res.json({
    contactabilidad,
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

// ===== Depuración de Contactabilidad (protocolo 3x5) =====
// Franjas Perú: 0=00:00-12:00, 1=12:00-16:00, 2=16:00-24:00. Dentro de una franja solo cuenta 1 intento.
function franjaDe3x5(iso) { const h = new Date(new Date(iso).getTime() - 5 * 3600000).getUTCHours(); return h < 12 ? 0 : h < 16 ? 1 : 2; }
function diasHabilesPeru(desdeStr, hastaStr, contarSabado) { // entre dos fechas Perú 'YYYY-MM-DD', inclusivo; domingo nunca cuenta; sábado solo si contarSabado
  let n = 0, d = new Date(desdeStr + 'T12:00:00Z'); const fin = new Date(hastaStr + 'T12:00:00Z');
  while (d <= fin) { const dow = d.getUTCDay(); if (dow !== 0 && (contarSabado || dow !== 6)) n++; d.setUTCDate(d.getUTCDate() + 1); }
  return n;
}

app.get('/api/depuracion', soloAdminOJefa, (req, res) => {
  const hoyP = peruFecha(new Date().toISOString());
  // Sábado OPCIONAL: el contrato de ventas es L-V, así que por defecto NO cuenta (no presionar).
  // Se puede activar como trabajo voluntario; la elección queda persistida (global).
  let contarSabado;
  if (req.query.sabados === '0' || req.query.sabados === '1') { contarSabado = req.query.sabados === '1'; kvSet('depu_contar_sabado', contarSabado ? '1' : '0'); }
  else { contarSabado = kvGet('depu_contar_sabado') === '1'; }
  const gAll = db.prepare('SELECT codigo, fecha, resultado FROM gestiones ORDER BY fecha').all();
  const gPorCod = {}; gAll.forEach(x => (gPorCod[x.codigo] = gPorCod[x.codigo] || []).push(x));
  const ocultas = new Set(db.prepare("SELECT nombre FROM usuarios WHERE rol='gestora' AND COALESCE(rankingVisible,1)=0").all().map(r => r.nombre));
  const leads = db.prepare('SELECT * FROM leads WHERE COALESCE(archivado,0)=0 AND COALESCE(cuarentena,0)=0').all().map(l => leadConsolidado(l, gPorCod[l.codigo] || []));

  const filas = []; let cumplieron = 0, noCumplieron = 0; const porGP = {};
  leads.forEach(l => {
    if (l.etapa !== 'Contactabilidad 3x5') return;          // solo los que siguen en contactabilidad
    if (!l.asesor || ocultas.has(l.asesor)) return;          // GP visibles
    if (!l.fechaAsignacion) return;
    const asignP = peruFecha(l.fechaAsignacion);
    const diasHab = diasHabilesPeru(asignP, hoyP, contarSabado);
    if (diasHab < 5) return;                                 // ya pasaron 5 días hábiles
    // Máximo posible: franjas del día 1 (según hora de asignación) + 3 por cada uno de los otros 4 días.
    const maxPosibles = Math.min(15, (3 - franjaDe3x5(l.fechaAsignacion)) + 12);
    // Intentos válidos: combinaciones distintas (día hábil 0-4, franja) en los primeros 5 días hábiles.
    const set = new Set();
    const grid = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    (gPorCod[l.codigo] || []).forEach(g => {
      const gP = peruFecha(g.fecha);
      if (gP < asignP) return;
      const dowG = new Date(gP + 'T12:00:00Z').getUTCDay();
      if (dowG === 0 || (!contarSabado && dowG === 6)) return; // gestión en día no hábil -> no cuenta
      const bd = diasHabilesPeru(asignP, gP, contarSabado) - 1; // índice 0-based de día hábil
      if (bd < 0 || bd > 4) return;
      const fr = franjaDe3x5(g.fecha);
      set.add(bd + '-' + fr); grid[bd][fr] = 1;
    });
    const intentos = Math.min(set.size, maxPosibles);
    const cumplio = intentos >= maxPosibles;
    if (cumplio) cumplieron++; else noCumplieron++;
    const gp = l.asesor;
    (porGP[gp] = porGP[gp] || { asesor: gp, total: 0, cumplieron: 0, noCumplieron: 0 });
    porGP[gp].total++; cumplio ? porGP[gp].cumplieron++ : porGP[gp].noCumplieron++;
    filas.push({
      codigo: l.codigo, nombre: l.nombre, asesor: gp, telefono: l.telefono,
      diasHabiles: diasHab, intentos, maxPosibles, cumplio,
      ultimoResultado: l.ultimoResultado, ultimaGestion: l.ultimaGestion, grid
    });
  });
  // Más críticos primero: menos intentos respecto del total posible.
  filas.sort((a, b) => (a.intentos / a.maxPosibles) - (b.intentos / b.maxPosibles) || a.intentos - b.intentos);

  const cuar = db.prepare("SELECT codigo, nombre, asesor, telefono, cuarentenaFecha FROM leads WHERE COALESCE(cuarentena,0)=1 ORDER BY cuarentenaFecha DESC").all();
  res.json({
    total: filas.length, cumplieron, noCumplieron, contarSabado,
    porGP: Object.values(porGP).sort((a, b) => b.total - a.total),
    filas, enCuarentena: cuar
  });
});

// Enviar a cuarentena: sale del pipeline activo (archivado=1) pero queda marcado como reactivable.
app.post('/api/leads/:codigo/cuarentena', soloAdminOJefa, (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE codigo = ?').get(req.params.codigo);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
  db.prepare('UPDATE leads SET cuarentena = 1, archivado = 1, cuarentenaFecha = ? WHERE codigo = ?').run(new Date().toISOString(), req.params.codigo);
  auditar(req, 'cuarentena', req.params.codigo, lead.nombre);
  res.json({ ok: true });
});

// Reactivar desde cuarentena: vuelve al pipeline activo para segundo abordaje.
app.post('/api/leads/:codigo/reactivar', soloAdminOJefa, (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE codigo = ?').get(req.params.codigo);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
  db.prepare('UPDATE leads SET cuarentena = 0, archivado = 0, cuarentenaFecha = NULL WHERE codigo = ?').run(req.params.codigo);
  auditar(req, 'reactivar-cuarentena', req.params.codigo, lead.nombre);
  res.json({ ok: true });
});

// Descartar desde depuración: archiva (sin marca de cuarentena).
app.post('/api/leads/:codigo/descartar', soloAdminOJefa, (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE codigo = ?').get(req.params.codigo);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
  db.prepare('UPDATE leads SET archivado = 1, cuarentena = 0 WHERE codigo = ?').run(req.params.codigo);
  auditar(req, 'descartar', req.params.codigo, lead.nombre);
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
// DIAGNÓSTICO TEMPORAL: gestiones B2B de hoy crudas (para verificar conteo por asesor)
app.get('/api/b2b/diag-gestiones', soloB2B, (req, res) => {
  if (!['admin', 'jefe_b2b', 'jefa'].includes(req.user.rol)) return res.status(403).json({ error: 'No autorizado' });
  try {
    const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const ini = new Date(new Date(hoy + 'T00:00:00Z').getTime() + 5 * 3600000).toISOString();
    const fin = new Date(new Date(hoy + 'T00:00:00Z').getTime() + 5 * 3600000 + 86400000).toISOString();
    const gest = db.prepare('SELECT codigoSolicitud, responsable, etapa, resultado, fecha FROM b2b_gestiones WHERE fecha>=? AND fecha<? ORDER BY fecha').all(ini, fin);
    const porResp = {};
    gest.forEach(g => { const r = g.responsable || '(vacío)'; porResp[r] = porResp[r] || { gestiones: 0, empresas: new Set() }; porResp[r].gestiones++; porResp[r].empresas.add(g.codigoSolicitud); });
    const resumen = Object.entries(porResp).map(([resp, o]) => ({ responsable: resp, gestiones: o.gestiones, empresas: o.empresas.size }));
    res.json({ hoy, totalGestiones: gest.length, porResponsable: resumen, detalle: gest });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/b2b/auditoria', soloB2B, (req, res) => {
  if (!['admin', 'jefe_b2b'].includes(req.user.rol)) return res.status(403).json({ error: 'No autorizado' });
  let filas = db.prepare("SELECT * FROM auditoria WHERE accion LIKE 'b2b\\_%' ESCAPE '\\' OR objetivo LIKE 'B2B-%' ORDER BY fecha DESC LIMIT 1000").all();
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

// Lista los snapshots diarios disponibles en el volumen (para recuperar datos borrados).
app.get('/api/admin/backups', soloAdmin, (req, res) => {
  try {
    const dir = path.join(DB_DIR, 'backups');
    if (!fs.existsSync(dir)) return res.json({ backups: [] });
    const backups = fs.readdirSync(dir)
      .filter(f => /^crm-\d{4}-\d{2}-\d{2}\.db$/.test(f))
      .map(f => { const st = fs.statSync(path.join(dir, f)); return { archivo: f, fecha: f.slice(4, 14), tamano: Math.round(st.size / 1024) + ' KB', modificado: st.mtime.toISOString() }; })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    res.json({ backups });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Previsualiza qué leads (con sus gestiones) hay en un backup para una lista de códigos.
app.post('/api/admin/recuperar-leads/preview', soloAdmin, (req, res) => { recuperarLeads(req, res, true); });
// Recupera leads borrados desde un snapshot: copia lead + gestiones + transiciones + ingreso.
app.post('/api/admin/recuperar-leads', soloAdmin, (req, res) => { recuperarLeads(req, res, false); });

function recuperarLeads(req, res, soloPreview) {
  const b = req.body || {};
  const archivo = String(b.archivo || '').trim();
  const codigos = Array.isArray(b.codigos) ? b.codigos.map(c => String(c).trim()).filter(Boolean) : [];
  if (!/^crm-\d{4}-\d{2}-\d{2}\.db$/.test(archivo)) return res.status(400).json({ error: 'Backup inválido' });
  if (!codigos.length) return res.status(400).json({ error: 'No se indicaron códigos' });
  const ruta = path.join(DB_DIR, 'backups', archivo);
  if (!fs.existsSync(ruta)) return res.status(404).json({ error: 'Backup no encontrado' });
  let bdb;
  try {
    bdb = new DatabaseSync(ruta);
    const resultado = [];
    const stripId = o => { const c = { ...o }; delete c.id; return c; };
    const insertarFila = (tabla, fila) => {
      const cols = Object.keys(fila);
      const ph = cols.map(() => '?').join(',');
      db.prepare(`INSERT INTO ${tabla} (${cols.map(c => '"' + c + '"').join(',')}) VALUES (${ph})`).run(...cols.map(c => fila[c]));
    };
    for (const cod of codigos) {
      const item = { codigo: cod, lead: null, gestiones: 0, transiciones: 0, ingresos: 0, yaExiste: false, error: null };
      const leadBk = bdb.prepare('SELECT * FROM leads WHERE codigo = ?').get(cod);
      if (!leadBk) { item.error = 'No está en este backup'; resultado.push(item); continue; }
      item.lead = leadBk.nombre || '(s/n)';
      const gs = bdb.prepare('SELECT * FROM gestiones WHERE codigo = ?').all(cod);
      item.gestiones = gs.length;
      let trans = []; try { trans = bdb.prepare('SELECT * FROM transiciones_etapa WHERE codigo = ?').all(cod); } catch (e) { }
      item.transiciones = trans.length;
      let ings = []; try { ings = bdb.prepare('SELECT * FROM marketing_ingresos WHERE codigoLead = ?').all(cod); } catch (e) { }
      item.ingresos = ings.length;
      const existe = db.prepare('SELECT codigo FROM leads WHERE codigo = ?').get(cod);
      item.yaExiste = !!existe;
      if (!soloPreview && !existe) {
        try {
          db.exec('BEGIN');
          // Limpia posibles huérfanos (p. ej. transiciones que no se borraron) para no duplicar.
          db.prepare('DELETE FROM gestiones WHERE codigo = ?').run(cod);
          try { db.prepare('DELETE FROM transiciones_etapa WHERE codigo = ?').run(cod); } catch (e) { }
          try { db.prepare('DELETE FROM marketing_ingresos WHERE codigoLead = ?').run(cod); } catch (e) { }
          insertarFila('leads', stripId(leadBk));
          gs.forEach(g => insertarFila('gestiones', stripId(g)));
          trans.forEach(t => insertarFila('transiciones_etapa', stripId(t)));
          ings.forEach(i => insertarFila('marketing_ingresos', stripId(i)));
          // Marca el origen para que cuente en Marketing (los leads viejos vienen sin esa columna).
          const tieneIngreso = !!db.prepare('SELECT 1 FROM marketing_ingresos WHERE codigoLead=? LIMIT 1').get(cod);
          let enHistorial = false; try { enHistorial = !!db.prepare('SELECT 1 FROM marketing_historial WHERE codigoLead=? LIMIT 1').get(cod); } catch (e) { }
          const origen = tieneIngreso ? 'make' : (enHistorial ? 'relead' : 'manual');
          db.prepare("UPDATE leads SET origenCreacion=? WHERE codigo=? AND (origenCreacion IS NULL OR origenCreacion='')").run(origen, cod);
          // Alinea la fecha de creación con la llegada real del ingreso (si lo tiene).
          if (tieneIngreso) {
            const ingFecha = db.prepare('SELECT fechaRecepcion FROM marketing_ingresos WHERE codigoLead=? AND fechaRecepcion IS NOT NULL ORDER BY id ASC LIMIT 1').get(cod);
            if (ingFecha && ingFecha.fechaRecepcion) db.prepare('UPDATE leads SET fechaCarga=? WHERE codigo=?').run(ingFecha.fechaRecepcion, cod);
          }
          item.origen = origen;
          db.exec('COMMIT');
          auditar(req, 'recuperar lead de backup', cod, `${item.lead} (${gs.length} gestiones, origen ${origen}) desde ${archivo}`);
        } catch (e) { try { db.exec('ROLLBACK'); } catch (e2) { } item.error = 'No se pudo insertar: ' + e.message; }
      }
      resultado.push(item);
    }
    res.json({ archivo, preview: soloPreview, resultado });
  } catch (e) {
    res.status(500).json({ error: 'Recuperación: ' + e.message });
  } finally { try { if (bdb) bdb.close(); } catch (e) { } }
}


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
  const SIN = L.RESULTADOS_SIN_CONTACTO || [];
  const gAll = db.prepare('SELECT * FROM gestiones ORDER BY fecha').all();
  const gPorCod = {};
  gAll.forEach(x => { (gPorCod[x.codigo] = gPorCod[x.codigo] || []).push(x); });
  const leads = db.prepare('SELECT * FROM leads WHERE COALESCE(archivado,0)=0').all().map(l => leadConsolidado(l, gPorCod[l.codigo] || []));
  const ahora = new Date(), ms = ahora.getTime();
  const hoyP = fechaPeruISO(ahora);
  const mananaP = fechaPeruISO(new Date(ms + 24 * 3600000));
  const num = v => Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')) || 0;
  const montoLead = l => Number(l.pipelineEstimado) || num(l.montoPotencial);
  const ORD = { 'Contactabilidad 3x5': 0, 'Contactado - por calificar': 1, 'Calificado - pendiente agendar': 2, 'Agendado - pendiente reunion': 3, 'Reunion efectiva - seguimiento': 4, 'Cierre pendiente': 5, 'Cerrado ganado': 6, 'Cerrado perdido': -1 };
  const ord = e => (ORD[e] != null ? ORD[e] : 0);
  const esCerrado = e => e === 'Cerrado ganado' || e === 'Cerrado perdido';
  const horas = d => d ? (ms - new Date(d).getTime()) / 3600000 : Infinity;
  const dias = d => d ? (ms - new Date(d).getTime()) / 86400000 : Infinity;

  const init = () => ({ asignadosHoy: 0, cartera: 0, sinTocar24h: 0, vencidos: 0, calientes: 0, calientesMonto: 0, agendHM: 0, montoRiesgo: 0, monto: 0 });
  const porGP = {}; L.ASESORES.forEach(a => porGP[a] = init());
  const sinAsig = init();

  let frescosTotal = 0, frescos2h = 0, frescos24h = 0, calGlobN = 0, calGlobMonto = 0;
  let reunionesHoy = 0, cerradosHoyN = 0, cerradosHoyMonto = 0, vencGlob = 0, sinAsignarN = 0, reunionPasadaN = 0, accionesHoyN = 0;
  const velocidades = []; // minutos asignación -> primer contacto (últimos 7 días)

  leads.forEach(l => {
    const dest = (l.asesor && porGP[l.asesor]) ? porGP[l.asesor] : sinAsig;
    const act = !esCerrado(l.etapa);
    const gs = gPorCod[l.codigo] || [];
    const sinTocar = gs.length === 0;
    const oe = ord(l.etapa);
    const vencido = act && l.fechaProxAccion && new Date(l.fechaProxAccion) < ahora;
    const caliente = act && oe >= 2;
    const calienteFrio = caliente && dias(l.ultimaGestion) >= 3;
    const reunFecha = l.fechaReunion || l.fechaProxAccion;
    const reunP = reunFecha ? fechaPeruISO(new Date(reunFecha)) : null;
    const agendado = l.etapa === 'Agendado - pendiente reunion';

    if (act) { dest.cartera++; dest.monto += montoLead(l); }
    if (act && sinTocar && horas(l.fechaAsignacion) > 24) dest.sinTocar24h++;
    if (vencido) dest.vencidos++;
    if (calienteFrio) { dest.calientes++; dest.calientesMonto += montoLead(l); }
    if (vencido || calienteFrio) dest.montoRiesgo += montoLead(l);
    if (l.asesor && porGP[l.asesor]) {
      const asignadoHoy = l.fechaAsignacion && fechaPeruISO(new Date(l.fechaAsignacion)) === hoyP;
      if (asignadoHoy && (l.intentos || 0) === 0 && l.etapa === 'Contactabilidad 3x5') dest.asignadosHoy++;
    }

    // Globales (tiles + alertas)
    if (act && sinTocar) { frescosTotal++; if (horas(l.fechaAsignacion) > 2) frescos2h++; if (horas(l.fechaAsignacion) > 24) frescos24h++; }
    if (calienteFrio) { calGlobN++; calGlobMonto += montoLead(l); }
    if (agendado && reunP === hoyP) reunionesHoy++;
    if (act && l.fechaProxAccion && fechaPeruISO(new Date(l.fechaProxAccion)) === hoyP) accionesHoyN++;
    if (l.etapa === 'Cerrado ganado' && fechaPeruISO(new Date(l.ultimaGestion || l.fechaCarga)) === hoyP) { cerradosHoyN++; cerradosHoyMonto += montoLead(l); }
    if (vencido) vencGlob++;
    if (!l.asesor && act) sinAsignarN++;
    if (agendado && reunP && reunP < hoyP) reunionPasadaN++;

    // Velocidad: primer contacto (gestión con resultado de contacto real)
    const pc = gs.find(x => !SIN.includes(x.resultado));
    if (pc && l.fechaAsignacion) {
      const dmin = (new Date(pc.fecha).getTime() - new Date(l.fechaAsignacion).getTime()) / 60000;
      if (dmin >= 0 && (ms - new Date(pc.fecha).getTime()) <= 7 * 86400000) velocidades.push(dmin);
    }
  });

  const mediana = arr => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2); return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2); };

  // Presencia por nombre (Modo Supervisor) para el semáforo de actividad
  const presNombre = {};
  Object.values(PRESENCIA).forEach(p => { if (p && p.nombre) presNombre[p.nombre] = p; });
  const estadoGP = nombre => {
    const p = presNombre[nombre];
    if (!p || !p.lastSeen) return 'desconectada';
    const seg = (ms - p.lastSeen) / 1000;
    return seg < 90 ? 'en_linea' : seg < 300 ? 'ausente' : 'desconectada';
  };
  const saludGP = f => {
    if (!f.cartera) return 'gris';
    const prob = f.sinTocar24h + f.vencidos + f.calientes;
    const ratio = prob / f.cartera;
    if (ratio >= 0.4 || prob >= 8) return 'rojo';
    if (ratio >= 0.15 || prob >= 3) return 'ambar';
    return 'verde';
  };

  // "Agendados hoy" = agendamientos HECHOS hoy (acto de agendar/confirmar/reprogramar),
  // misma métrica que el ranking. NO reuniones programadas para hoy desde días pasados.
  const AGEND_RES = ['Agendo reunion']; // "Agendados" = solo el acto de agendar (no confirmar/reprogramar)
  const agendHoyPorGP = {};
  gAll.forEach(g => {
    if (AGEND_RES.includes(g.resultado) && fechaPeruISO(new Date(g.fecha)) === hoyP) {
      agendHoyPorGP[g.asesor] = (agendHoyPorGP[g.asesor] || 0) + 1;
    }
  });

  // Ocultar de la tabla a las GP no visibles (cuentas de prueba, rankingVisible=0).
  const ocultas = new Set(db.prepare("SELECT nombre FROM usuarios WHERE rol='gestora' AND COALESCE(rankingVisible,1)=0").all().map(r => r.nombre));
  const ASESORES_VIS = L.ASESORES.filter(a => !ocultas.has(a));

  const filas = ASESORES_VIS.map(a => {
    const f = Object.assign({ asesor: a, estado: estadoGP(a) }, porGP[a]);
    f.agendHM = agendHoyPorGP[a] || 0;
    f.salud = saludGP(f);
    return f;
  });
  const equipo = init();
  filas.forEach(f => ['asignadosHoy', 'cartera', 'sinTocar24h', 'vencidos', 'calientes', 'calientesMonto', 'agendHM', 'montoRiesgo', 'monto'].forEach(k => equipo[k] += f[k]));

  const alertas = [];
  if (frescos2h) alertas.push({ tipo: 'frescos', icono: '🆕', texto: 'leads frescos sin tocar +2h', n: frescos2h, filtro: 'sincontactar' });
  if (reunionPasadaN) alertas.push({ tipo: 'reunion_pasada', icono: '📅', texto: 'reuniones que ya pasaron sin resultado', n: reunionPasadaN, filtro: '' });
  if (calGlobN) alertas.push({ tipo: 'calientes', icono: '🔥', texto: 'leads calientes sin seguimiento +3d', n: calGlobN, filtro: '' });
  if (sinAsignarN) alertas.push({ tipo: 'sin_asignar', icono: '📥', texto: 'leads sin asignar', n: sinAsignarN, filtro: 'sin-asignar' });
  if (vencGlob) alertas.push({ tipo: 'vencidos', icono: '⏳', texto: 'acciones vencidas', n: vencGlob, filtro: 'vencidos' });

  const tiles = {
    velocidadMin: mediana(velocidades),
    frescos: { total: frescosTotal, mas2h: frescos2h, mas24h: frescos24h },
    calientes: { count: calGlobN, monto: Math.round(calGlobMonto) },
    reunionesHoy,
    accionesHoy: accionesHoyN,
    cerradosHoy: { count: cerradosHoyN, monto: Math.round(cerradosHoyMonto) },
    vencidos: vencGlob,
    sinAsignar: sinAsignarN
  };

  res.json({ filas, equipo, sinAsignar: sinAsig, tiles, alertas });
});
// ===== Mensajería (Chatwoot) — bandeja de WhatsApp embebida (Nivel 2) =====

// Índice de leads por teléfono (últimos 9 dígitos) para casar conversación <-> lead.
function indiceLeadsPorTelefono() {
  const leads = db.prepare('SELECT codigo,nombre,telefono,asesor FROM leads WHERE COALESCE(archivado,0)=0').all();
  const idx = {};
  leads.forEach(l => { const k = L.normalizarCelular(l.telefono); if (k) idx[k] = l; });
  return idx;
}

// Lista de conversaciones, filtrada por rol: la GP solo ve las de SUS leads; admin/jefa ven todo.
app.get('/api/chat/diagnostico', async (req, res) => {
  if (!veTodo(req.user)) return res.status(403).json({ error: 'Solo supervisión' });
  try { res.json(await cw.diagnostico()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Caché de resiliencia: última lista de conversaciones que Chatwoot devolvió bien.
// Si Chatwoot tiene un hipo (5xx intermitente), se sirve esta copia con aviso de antigüedad.
let CW_CACHE_CONVS = { convs: null, ts: 0 };

app.get('/api/chat/conversaciones', async (req, res) => {
  if (!cw.cwConfigurado()) return res.json({ configurado: false, conversaciones: [] });
  let convs = null, desactualizado = false, antiguedadSeg = 0;
  try {
    convs = await cw.listarConversaciones();
    CW_CACHE_CONVS = { convs, ts: Date.now() };
  } catch (e) {
    // Chatwoot falló incluso con reintentos: usar la última copia buena (hasta 15 min).
    if (CW_CACHE_CONVS.convs && (Date.now() - CW_CACHE_CONVS.ts) < 15 * 60 * 1000) {
      convs = CW_CACHE_CONVS.convs;
      desactualizado = true;
      antiguedadSeg = Math.round((Date.now() - CW_CACHE_CONVS.ts) / 1000);
    } else {
      return res.status(502).json({ configurado: true, error: e.message, conversaciones: [] });
    }
  }
  try {
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
    res.json({ configurado: true, conversaciones: out, desactualizado, antiguedadSeg });
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
// ===== DASHBOARD COMITÉ B2C: métricas de gestión de un periodo =====
// GET /api/b2c/comite?desde=YYYY-MM-DD&hasta=YYYY-MM-DD  (admin/jefa)
function calcularComiteB2C(desdeIn, hastaIn, asesorIn) {
  const hoyP = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(desdeIn) ? desdeIn : '2026-06-23';
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(hastaIn) ? hastaIn : hoyP;
  const asesorF = asesorIn && String(asesorIn).trim() ? String(asesorIn).trim() : null;
  const SIN = L.RESULTADOS_SIN_CONTACTO || [];
  const enRango = pf => pf && pf >= desde && pf <= hasta;

  // Leads del periodo (por fecha de carga), no archivados; opcionalmente filtrados por GP.
  const leads = db.prepare("SELECT * FROM leads WHERE COALESCE(archivado,0)=0").all()
    .filter(l => enRango(peruFecha(l.fechaCarga)))
    .filter(l => !asesorF || l.asesor === asesorF);
  const cods = leads.map(l => l.codigo);
  const gPorCod = {};
  db.prepare('SELECT * FROM gestiones ORDER BY fecha ASC, id ASC').all().forEach(g => { (gPorCod[g.codigo] = gPorCod[g.codigo] || []).push(g); });

  // ---- 1. PIPELINE actual (foto por etapa) + conversión ----
  const etapas = ['Contactabilidad 3x5', 'Contactado - por calificar', 'Calificado - pendiente agendar', 'Agendado - pendiente reunion', 'Reunion efectiva - seguimiento', 'Cierre pendiente', 'Cerrado ganado'];
  const pipeline = {}; etapas.forEach(e => pipeline[e] = 0);
  let ganados = 0, perdidos = 0, montoGanado = 0;
  // Alcance acumulado (llegó a la etapa o más allá) para conversión de embudo
  const alcanzo = {}; etapas.forEach(e => alcanzo[e] = 0);
  let contactados = 0;
  leads.forEach(l => {
    const gs = gPorCod[l.codigo] || [];
    const cons = leadConsolidado(l, gs);
    const et = cons.etapa;
    if (et === 'Cerrado perdido') { perdidos++; return; }
    if (pipeline[et] != null) pipeline[et]++;
    if (et === 'Cerrado ganado') { ganados++; montoGanado += Number(l.montoReal || 0) || 0; }
    const ord = ORD_ETAPA_ATRIB[et] != null ? ORD_ETAPA_ATRIB[et] : 0;
    // alcance por etapa
    etapas.forEach(e => { if (ord >= ORD_ETAPA_ATRIB[e]) alcanzo[e]++; });
    if (gs.some(g => !SIN.includes(g.resultado))) contactados++;
  });
  const totalLeads = leads.length;
  const embudo = etapas.map(e => ({ etapa: e, enEtapa: pipeline[e], alcanzaron: alcanzo[e], pctDelTotal: totalLeads ? Math.round((alcanzo[e] / totalLeads) * 100) : 0 }));

  // ---- 2. CONTACTABILIDAD ----
  const contactabilidad = totalLeads ? Math.round((contactados / totalLeads) * 100) : 0;

  // ---- 3. 3x5: cuántos completaron los 15 intentos / cuántos siguen activos ----
  let hicieron3x5 = 0, con1masIntento = 0;
  leads.forEach(l => {
    const gs = gPorCod[l.codigo] || [];
    if (gs.length >= 1) con1masIntento++;
    if (gs.length >= 15) hicieron3x5++;
  });

  // ---- 4. TIEMPO al primer contacto (minutos desde carga hasta 1ª gestión) ----
  const t1er = [];
  leads.forEach(l => {
    const gs = gPorCod[l.codigo] || [];
    if (!gs.length) return;
    const base = new Date(l.fechaAsignacion || l.fechaCarga).getTime();
    const t1 = new Date(gs[0].fecha).getTime();
    if (isFinite(base) && isFinite(t1) && t1 >= base) t1er.push((t1 - base) / 60000);
  });
  t1er.sort((a, b) => a - b);
  const medianaMin = t1er.length ? Math.round(t1er[Math.floor(t1er.length / 2)]) : null;
  const promMin = t1er.length ? Math.round(t1er.reduce((a, b) => a + b, 0) / t1er.length) : null;

  // ---- 5. N° promedio de intentos hasta el PRIMER CONTACTO efectivo ----
  const intentosHastaContacto = [];
  leads.forEach(l => {
    const gs = gPorCod[l.codigo] || [];
    let n = 0, logrado = false;
    for (const g of gs) { n++; if (!SIN.includes(g.resultado)) { logrado = true; break; } }
    if (logrado) intentosHastaContacto.push(n);
  });
  const promIntentos = intentosHastaContacto.length ? Math.round((intentosHastaContacto.reduce((a, b) => a + b, 0) / intentosHastaContacto.length) * 10) / 10 : null;

  // ---- 6. TIEMPO promedio en cada etapa (desde transiciones_etapa) ----
  const trans = db.prepare('SELECT * FROM transiciones_etapa WHERE codigo IN (' + cods.map(() => '?').join(',') + ') ORDER BY codigo, fecha').all(...(cods.length ? cods : ['']));
  const tiempoEtapa = {}; // etapa -> [horas...]
  const porCod = {};
  trans.forEach(t => { (porCod[t.codigo] = porCod[t.codigo] || []).push(t); });
  Object.values(porCod).forEach(arr => {
    for (let i = 0; i < arr.length - 1; i++) {
      const et = arr[i].etapa_destino;
      const dt = (new Date(arr[i + 1].fecha).getTime() - new Date(arr[i].fecha).getTime()) / 3600000;
      if (dt >= 0 && dt < 24 * 60) { (tiempoEtapa[et] = tiempoEtapa[et] || []).push(dt); }
    }
  });
  const tiempoPorEtapa = Object.entries(tiempoEtapa).map(([et, hs]) => ({ etapa: et, horasProm: Math.round((hs.reduce((a, b) => a + b, 0) / hs.length) * 10) / 10, n: hs.length }));

  // ---- 7. DESESTIMADOS + motivo ----
  const desestimados = {};
  leads.forEach(l => {
    const gs = gPorCod[l.codigo] || [];
    const cons = leadConsolidado(l, gs);
    if (cons.etapa === 'Cerrado perdido') {
      const ult = gs[gs.length - 1] || {};
      const mot = ult.motivoPerdida || 'Sin motivo registrado';
      desestimados[mot] = (desestimados[mot] || 0) + 1;
    }
  });
  const desestimadosArr = Object.entries(desestimados).map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n);

  // ---- 8. RANKING por gestor ----
  const porGP = {};
  leads.forEach(l => {
    const gp = l.asesor || 'Sin asignar';
    const g = (porGP[gp] = porGP[gp] || { gestor: gp, asignados: 0, contactados: 0, calificados: 0, agendados: 0, ganados: 0, intentos1er: [], t1er: [] });
    g.asignados++;
    const gs = gPorCod[l.codigo] || [];
    const cons = leadConsolidado(l, gs);
    const ord = ORD_ETAPA_ATRIB[cons.etapa] != null ? ORD_ETAPA_ATRIB[cons.etapa] : 0;
    if (gs.some(x => !SIN.includes(x.resultado))) g.contactados++;
    if (ord >= 2) g.calificados++;
    if (ord >= 3) g.agendados++;
    if (cons.etapa === 'Cerrado ganado') g.ganados++;
    // tiempo y N° al primer contacto por GP
    if (gs.length) {
      const base = new Date(l.fechaAsignacion || l.fechaCarga).getTime();
      const t1 = new Date(gs[0].fecha).getTime();
      if (isFinite(base) && isFinite(t1) && t1 >= base) g.t1er.push((t1 - base) / 60000);
      let n = 0, logrado = false;
      for (const x of gs) { n++; if (!SIN.includes(x.resultado)) { logrado = true; break; } }
      if (logrado) g.intentos1er.push(n);
    }
  });
  const ranking = Object.values(porGP).map(g => {
    const med = arr => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return Math.round(s[Math.floor(s.length / 2)]); };
    return {
      gestor: g.gestor, asignados: g.asignados, contactados: g.contactados, calificados: g.calificados, agendados: g.agendados, ganados: g.ganados,
      pctContacto: g.asignados ? Math.round((g.contactados / g.asignados) * 100) : 0,
      t1erMed: med(g.t1er), intentos1erProm: g.intentos1er.length ? Math.round((g.intentos1er.reduce((a, b) => a + b, 0) / g.intentos1er.length) * 10) / 10 : null
    };
  }).sort((a, b) => b.agendados - a.agendados || b.contactados - a.contactados);

  return {
    desde, hasta,
    resumen: { totalLeads, contactados, contactabilidad, ganados, perdidos, montoGanado, hicieron3x5, con1masIntento,
      tasaCierre: totalLeads ? Math.round((ganados / totalLeads) * 1000) / 10 : 0 },
    velocidad: { medianaMinPrimerContacto: medianaMin, promMinPrimerContacto: promMin, promIntentosPrimerContacto: promIntentos },
    embudo, tiempoPorEtapa, desestimados: desestimadosArr, ranking
  };
}

app.get('/api/b2c/comite', soloAdminOJefa, (req, res) => {
  try { res.json(calcularComiteB2C(req.query.desde, req.query.hasta)); }
  catch (e) { console.error('[comite]', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/atribucion', soloAdminOJefa, (req, res) => {
  try {
    const nivel = ['campana', 'conjunto', 'anuncio'].includes(req.query.nivel) ? req.query.nivel : 'anuncio';
    const desde = req.query.desde || null, hasta = req.query.hasta || null;
    const origen = req.query.origen || 'make'; // por defecto solo leads de campaña (Make), sin releads
    let leadsRaw = db.prepare('SELECT * FROM leads').all();
    if (origen !== 'todos') leadsRaw = leadsRaw.filter(l => (l.origenCreacion || 'manual') === origen);
    if (desde) leadsRaw = leadsRaw.filter(l => { const pf = peruFecha(l.fechaCarga); return pf && pf >= desde; });
    if (hasta) leadsRaw = leadsRaw.filter(l => { const pf = peruFecha(l.fechaCarga); return pf && pf <= hasta; });
    // La etapa NO es columna: se calcula con leadConsolidado(lead, gestiones).
    // Traemos todas las gestiones una vez y las agrupamos por lead.
    const SIN = L.RESULTADOS_SIN_CONTACTO || [];
    const gPorCod = {};
    db.prepare('SELECT * FROM gestiones ORDER BY fecha').all().forEach(g => { (gPorCod[g.codigo] = gPorCod[g.codigo] || []).push(g); });
    const leads = leadsRaw.map(l => {
      const gs = gPorCod[l.codigo] || [];
      const cons = leadConsolidado(l, gs);
      const contactado = gs.some(g => !SIN.includes(g.resultado));
      // Métricas de GESTIÓN: cuántos intentos recibió y cuánto tardó el primer contacto (min desde asignación).
      const nGest = gs.length;
      let min1er = null;
      if (nGest) {
        const base = new Date(l.fechaAsignacion || l.fechaCarga).getTime();
        const t1 = new Date(gs[0].fecha).getTime(); // gs viene ordenado por fecha
        if (isFinite(base) && isFinite(t1) && t1 >= base) min1er = Math.round((t1 - base) / 60000);
      }
      return { campana: l.campana, conjunto: l.conjunto, anuncio: l.anuncio, adId: l.adId, etapa: cons.etapa, contactado, esDuplicadoActivo: l.esDuplicadoActivo, nGest, min1er };
    });
    // Agrupa por el nivel elegido.
    const grupos = {};
    leads.forEach(l => {
      const clave = ((l[nivel] || '').trim()) || '(sin dato)';
      if (!grupos[clave]) grupos[clave] = { fuente: clave, campana: l.campana, conjunto: l.conjunto, anuncio: l.anuncio, adId: l.adId, leads: 0, contactado: 0, calificado: 0, agendado: 0, reunion: 0, cierre: 0, atendidos: 0, sinGestion: 0, intentosTotal: 0, _t1: [] };
      const g = grupos[clave];
      g.leads++;
      if (l.esDuplicadoActivo) return; // duplicado activo: cuenta como lead pero no entra al embudo
      // Gestión comercial: ¿lo trabajaron, cuánto y qué tan rápido?
      if (l.nGest > 0) { g.atendidos++; g.intentosTotal += l.nGest; if (l.min1er != null) g._t1.push(l.min1er); }
      else g.sinGestion++;
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
      // Métricas del match campaña ↔ gestión:
      const trabajables = g.atendidos + g.sinGestion; // sin duplicados
      g.pctAtendido = trabajables ? Math.round((g.atendidos / trabajables) * 100) : 0;      // GESTIÓN: cobertura
      g.intPorLead = g.atendidos ? Math.round((g.intentosTotal / g.atendidos) * 10) / 10 : 0; // GESTIÓN: esfuerzo
      g._t1.sort((a, b) => a - b);
      g.t1erMin = g._t1.length ? g._t1[Math.floor(g._t1.length / 2)] : null;                 // GESTIÓN: rapidez (mediana)
      g.pctConexion = g.atendidos ? Math.round((g.contactado / g.atendidos) * 100) : 0;      // CAMPAÑA: calidad del lead dado que se trabajó
      delete g._t1;
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
    const nivelesOk = ['campana', 'conjunto', 'anuncio', 'dia'];
    const nivel = nivelesOk.includes(req.query.nivel) ? req.query.nivel : 'anuncio';
    const esDia = nivel === 'dia';
    const campoNivel = (nivel === 'campana') ? 'campana' : (nivel === 'conjunto') ? 'conjunto' : 'anuncio';
    const sinDato = '(sin ' + (campoNivel === 'campana' ? 'campaña' : campoNivel) + ')';
    const desde = req.query.desde || null, hasta = req.query.hasta || null;
    const norm = s => String(s || '').trim().toLowerCase();
    const claveDe = (valNorm, fecha) => esDia ? (valNorm + '|' + fecha) : valNorm;

    // 1) Gasto agregado por el nivel elegido
    let gastoRows = db.prepare('SELECT * FROM marketing_gasto').all();
    if (desde) gastoRows = gastoRows.filter(g => g.fecha >= desde);
    if (hasta) gastoRows = gastoRows.filter(g => g.fecha <= hasta);
    const filas = {};
    const ultStatus = {}; // solo a nivel anuncio: valNorm -> {fecha, status}
    gastoRows.forEach(g => {
      const val = norm(g[campoNivel]);
      const k = claveDe(val, g.fecha);
      if (!filas[k]) filas[k] = {
        clave: k, fecha: esDia ? g.fecha : null,
        etiqueta: g[campoNivel] || sinDato, anuncio: g.anuncio, campana: g.campana, conjunto: g.conjunto,
        adId: g.adId, creativeUrl: campoNivel === 'anuncio' ? g.creativeUrl : null, igLink: campoNivel === 'anuncio' ? g.igLink : null,
        tipo: g.objetivoCampana, status: campoNivel === 'anuncio' ? g.status : null,
        costo: 0, impresiones: 0, clicks: 0, resultadosMeta: 0,
        leadsCRM: 0, tocados: 0, contactado: 0, calificado: 0, agendado: 0, reunion: 0, negociacion: 0, cierre: 0
      };
      const f = filas[k];
      f.costo += g.costo || 0; f.impresiones += g.impresiones || 0; f.clicks += g.clicks || 0; f.resultadosMeta += g.resultados || 0;
      if (campoNivel === 'anuncio') {
        if (!f.creativeUrl && g.creativeUrl) f.creativeUrl = g.creativeUrl;
        if (!f.igLink && g.igLink) f.igLink = g.igLink;
        if (!ultStatus[val] || g.fecha > ultStatus[val].fecha) ultStatus[val] = { fecha: g.fecha, status: g.status };
      }
    });
    if (!esDia && campoNivel === 'anuncio') Object.values(filas).forEach(f => { const u = ultStatus[norm(f.etiqueta)]; if (u) f.status = u.status; });

    // 2) Leads del CRM (solo make), agrupados por anuncio (+día si aplica), con su embudo
    const SIN = L.RESULTADOS_SIN_CONTACTO || [];
    const gPorCod = {};
    db.prepare('SELECT * FROM gestiones ORDER BY fecha').all().forEach(x => { (gPorCod[x.codigo] = gPorCod[x.codigo] || []).push(x); });
    let leads = db.prepare("SELECT * FROM leads WHERE origenCreacion='make'").all();
    leads.forEach(l => {
      const dia = peruFecha(l.fechaCarga);  // fecha LOCAL de Perú (coincide con lo que se muestra y con el Excel)
      if (desde && (!dia || dia < desde)) return;
      if (hasta && (!dia || dia > hasta)) return;
      const val = norm(l[campoNivel]) || sinDato;  // agrupado por el nivel elegido; sin atribución cuenta aparte
      const k = claveDe(val, dia);
      if (!filas[k]) filas[k] = {
        clave: k, fecha: esDia ? dia : null,
        etiqueta: l[campoNivel] || sinDato, anuncio: l.anuncio, campana: l.campana, conjunto: l.conjunto,
        adId: l.adId, creativeUrl: null, igLink: null, tipo: null, status: null,
        costo: 0, impresiones: 0, clicks: 0, resultadosMeta: 0,
        leadsCRM: 0, tocados: 0, contactado: 0, calificado: 0, agendado: 0, reunion: 0, negociacion: 0, cierre: 0
      };
      const f = filas[k];
      f.leadsCRM++;
      if (l.esDuplicadoActivo) return; // duplicado activo: cuenta como lead (costo) pero NO entra al embudo
      const gs = gPorCod[l.codigo] || [];
      const cons = leadConsolidado(l, gs);
      const ord = ORD_ETAPA_ATRIB[cons.etapa] != null ? ORD_ETAPA_ATRIB[cons.etapa] : 0;
      if (gs.length > 0) f.tocados++;
      if (gs.some(x => !SIN.includes(x.resultado))) f.contactado++;
      if (ord >= 2) f.calificado++;
      if (ord >= 3) f.agendado++;
      if (ord >= 4) f.reunion++;
      if (ord >= 5) f.negociacion++;
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

// Series diarias para el modal de Tendencias: gasto, leads (Ad y CRM), embudo y CPL por día.
// Filtra por fechas (Perú) + campaña + conjunto. Devuelve además las listas para los selectores.
app.get('/api/marketing/tendencias', soloAdminOJefa, async (req, res) => {
  try {
    const desde = req.query.desde || null, hasta = req.query.hasta || null;
    const norm = s => String(s || '').trim().toLowerCase();
    const fCamp = norm(req.query.campana), fConj = norm(req.query.conjunto);
    const matchCC = o => (!fCamp || norm(o.campana) === fCamp) && (!fConj || norm(o.conjunto) === fConj);
    const porDia = {};
    const D = f => (porDia[f] = porDia[f] || { fecha: f, gasto: 0, leadsAd: 0, leadsCRM: 0, tocados: 0, contactado: 0, calificado: 0, agendado: 0, reunion: 0, negociacion: 0, cierre: 0 });

    // Gasto por ANUNCIO desde el API de Meta (misma fuente que Costo x Lead). El Excel de gasto quedó obsoleto.
    const porAnuncio = {};
    const Afila = (an, muestra) => (porAnuncio[an] = porAnuncio[an] || { anuncio: muestra.anuncio || '(sin anuncio)', campana: muestra.campana, conjunto: muestra.conjunto, creativeUrl: null, costo: 0, leadsAd: 0, leadsCRM: 0, agendado: 0, reunion: 0, cierre: 0, garantia: 0, finanzas: 0, bc: 0 });
    if (metaInsights.configurado()) {
      try {
        const hoyPm = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
        const gDesde = desde || new Date(Date.now() - 5 * 3600000 - 365 * 86400000).toISOString().slice(0, 10);
        const gHasta = hasta || hoyPm;
        const ad = await metaInsights.insightsAd(gDesde, gHasta, req.query.force === '1');
        (ad.filas || []).filter(matchCC).forEach(g => {
          const A = Afila(norm(g.anuncio) || '(sin anuncio)', g);
          A.costo += g.spend || 0; A.leadsAd += g.metaLeads || 0;
        });
      } catch (e) { console.error('[tendencias gasto Meta]', e.message); /* sin gasto: el cuadrante igual muestra conteos */ }
    }

    // Leads por día + embudo total + por anuncio
    const SIN = L.RESULTADOS_SIN_CONTACTO || [];
    const gPorCod = {};
    db.prepare('SELECT * FROM gestiones ORDER BY fecha').all().forEach(x => { (gPorCod[x.codigo] = gPorCod[x.codigo] || []).push(x); });
    const emb = { leadsCRM: 0, tocados: 0, contactado: 0, calificado: 0, agendado: 0, reunion: 0, negociacion: 0, cierre: 0 };
    db.prepare("SELECT * FROM leads WHERE origenCreacion='make'").all().forEach(l => {
      const dia = peruFecha(l.fechaCarga);
      if (desde && (!dia || dia < desde)) return;
      if (hasta && (!dia || dia > hasta)) return;
      if (!matchCC(l)) return;
      const d = D(dia);
      const A = Afila(norm(l.anuncio) || '(sin anuncio)', l);
      d.leadsCRM++; emb.leadsCRM++; A.leadsCRM++;
      if (l.esDuplicadoActivo) return;
      const gs = gPorCod[l.codigo] || [];
      const cons = leadConsolidado(l, gs);
      const ord = ORD_ETAPA_ATRIB[cons.etapa] != null ? ORD_ETAPA_ATRIB[cons.etapa] : 0;
      if (gs.length > 0) { d.tocados++; emb.tocados++; }
      if (gs.some(x => !SIN.includes(x.resultado))) { d.contactado++; emb.contactado++; }
      if (ord >= 2) { d.calificado++; emb.calificado++; }
      if (ord >= 3) { d.agendado++; emb.agendado++; A.agendado++; }
      if (ord >= 4) { d.reunion++; emb.reunion++; A.reunion++; }
      if (ord >= 5) { d.negociacion++; emb.negociacion++; }
      if (cons.etapa === 'Cerrado ganado') { d.cierre++; emb.cierre++; A.cierre++; }
    });

    // B2B VIVO por anuncio: solicitudes con su etapa kanban (anuncio/conjunto desde el ingreso).
    {
      const SECB = ['Solicitud', 'Filtro credito', 'Filtro garantia', 'Reunion comercial', 'Filtro finanzas', 'Business case'];
      const ingPorCod = {};
      db.prepare("SELECT codigoSolicitud, COALESCE(NULLIF(utmCampaign,''),'') campana, COALESCE(NULLIF(conjunto,''),'') conjunto, COALESCE(NULLIF(anuncio,''),'') anuncio FROM b2b_ingresos WHERE codigoSolicitud IS NOT NULL").all()
        .forEach(i => { if (!ingPorCod[i.codigoSolicitud]) ingPorCod[i.codigoSolicitud] = i; });
      db.prepare('SELECT * FROM b2b_solicitudes').all().forEach(sol => {
        const dia = peruFecha(sol.fechaIngreso);
        if (desde && (!dia || dia < desde)) return;
        if (hasta && (!dia || dia > hasta)) return;
        const ing = ingPorCod[sol.codigo] || {};
        const info = { campana: sol.campana || ing.campana || '', conjunto: ing.conjunto || '', anuncio: ing.anuncio || '' };
        if (!matchCC(info)) return;
        const A = Afila(norm(info.anuncio) || '(sin anuncio)', info);
        A.leadsCRM++;
        const ix = SECB.indexOf(etapaKanbanB2B(sol));
        if (ix >= 2) A.garantia++;
        if (ix >= 3) A.reunion++;
        if (ix >= 4) A.finanzas++;
        if (ix >= 5) { A.bc++; A.cierre++; }
      });
    }

    // HISTÓRICOS: se suman al conteo por anuncio (y al embudo) para analizar campañas de meses anteriores.
    if (req.query.historico === '1') {
      let hs = db.prepare("SELECT fechaCreacion f, COALESCE(campana,'') campana, COALESCE(conjunto,'') conjunto, COALESCE(anuncio,'') anuncio, etapa FROM leads_historicos").all();
      if (desde) hs = hs.filter(h => h.f >= desde);
      if (hasta) hs = hs.filter(h => h.f <= hasta);
      const SECH = ['Solicitud', 'Filtro credito', 'Filtro garantia', 'Reunion comercial', 'Filtro finanzas', 'Business case'];
      hs.filter(matchCC).forEach(h => {
        const A = Afila(norm(h.anuncio) || '(sin anuncio)', h);
        const d = D(h.f);
        A.leadsCRM++; d.leadsCRM++; emb.leadsCRM++;
        const ixB = SECH.indexOf(h.etapa);
        if (ixB >= 0) { // etapa B2B (histórico B2B)
          if (ixB >= 2) A.garantia++;
          if (ixB >= 3) { A.reunion++; d.reunion++; emb.reunion++; }
          if (ixB >= 4) A.finanzas++;
          if (ixB >= 5) { A.bc++; A.cierre++; d.cierre++; emb.cierre++; }
        } else { // etapa B2C
          if (h.etapa === 'Agendado' || h.etapa === 'Reunión' || h.etapa === 'Cerrado') { A.agendado++; d.agendado++; emb.agendado++; }
          if (h.etapa === 'Reunión' || h.etapa === 'Cerrado') { A.reunion++; d.reunion++; emb.reunion++; }
          if (h.etapa === 'Cerrado') { A.cierre++; d.cierre++; emb.cierre++; }
        }
      });
    }

    const r2 = n => Math.round(n * 100) / 100;
    const dias = Object.values(porDia).sort((a, b) => a.fecha.localeCompare(b.fecha)).map(d => {
      d.gasto = r2(d.gasto);
      d.cpl = d.leadsCRM ? r2(d.gasto / d.leadsCRM) : null;
      d.captura = d.leadsAd ? Math.round((d.leadsCRM / d.leadsAd) * 100) : null;
      return d;
    });

    // Listas para los selectores
    const campSet = {}, conjMap = {};
    const recoger = r => { if (r.campana) campSet[r.campana] = 1; if (r.conjunto) conjMap[r.conjunto] = r.campana || ''; };
    db.prepare('SELECT DISTINCT campana, conjunto FROM marketing_gasto').all().forEach(recoger);
    db.prepare("SELECT DISTINCT campana, conjunto FROM leads WHERE origenCreacion='make'").all().forEach(recoger);
    const campanas = Object.keys(campSet).sort();
    const conjuntos = Object.keys(conjMap).map(c => ({ conjunto: c, campana: conjMap[c] })).sort((a, b) => a.conjunto.localeCompare(b.conjunto));

    const catImg = {};
    try { db.prepare("SELECT anuncio, imagenUrl FROM anuncios_meta WHERE imagenUrl IS NOT NULL AND imagenUrl<>''").all().forEach(r => { catImg[norm(r.anuncio)] = r.imagenUrl; }); } catch (e) { }
    const anuncios = Object.values(porAnuncio).map(a => {
      a.costo = r2(a.costo);
      if (!a.creativeUrl) a.creativeUrl = catImg[norm(a.anuncio)] || null;
      return a;
    });
    res.json({ dias, embudo: emb, anuncios, campanas, conjuntos });
  } catch (e) {
    console.error('Error en /api/marketing/tendencias:', e.message);
    res.status(500).json({ error: 'Tendencias: ' + e.message });
  }
});

// Detalle lead por lead con su atribución y fechas (para rastrear/cuadrar y descargar).
app.get('/api/marketing/leads', soloAdminOJefa, (req, res) => {
  try {
    const desde = req.query.desde || null, hasta = req.query.hasta || null;
    const SIN = L.RESULTADOS_SIN_CONTACTO || [];
    const gPorCod = {};
    db.prepare('SELECT * FROM gestiones ORDER BY fecha').all().forEach(g => { (gPorCod[g.codigo] = gPorCod[g.codigo] || []).push(g); });
    let leadsRaw = db.prepare('SELECT * FROM leads ORDER BY fechaCarga DESC').all();
    // Filtro por fecha de CREACIÓN (fechaCarga), en hora local de Perú, igual que Ingresos.
    if (desde) leadsRaw = leadsRaw.filter(l => { const pf = peruFecha(l.fechaCarga); return pf && pf >= desde; });
    if (hasta) leadsRaw = leadsRaw.filter(l => { const pf = peruFecha(l.fechaCarga); return pf && pf <= hasta; });
    const filas = leadsRaw.map(l => {
      const cons = leadConsolidado(l, gPorCod[l.codigo] || []);
      return {
        codigo: l.codigo, nombre: l.nombre, telefono: l.telefono,
        campana: l.campana || '', conjunto: l.conjunto || '', anuncio: l.anuncio || '',
        fuente: l.fuente || '', fechaCarga: l.fechaCarga, fechaAsignacion: l.fechaAsignacion,
        asesor: l.asesor || '', etapa: cons.etapa, archivado: l.archivado ? 1 : 0,
        origenCreacion: l.origenCreacion || 'manual',
        esDuplicadoActivo: l.esDuplicadoActivo ? 1 : 0
      };
    });
    res.json({ total: filas.length, filas });
  } catch (e) {
    console.error('Error en /api/marketing/leads:', e.message);
    res.status(500).json({ error: 'Marketing leads: ' + e.message });
  }
});

// Ranking de contactabilidad del día (visible para todas). Cuenta gestiones de hoy por GP.
function construirRankingDia() {
  const peruDia = iso => new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 10);
  const hoy = peruDia(new Date().toISOString());
  const META = 8; // meta GLOBAL del equipo: agendamientos del día (ya no es individual)
  const SIN = L.RESULTADOS_SIN_CONTACTO || [];
  const CALIF = ['Respondio - calificado', 'Agendo reunion', 'Confirmo reunion', 'Reprogramo reunion', 'Reunion efectiva', 'En negociacion', 'Venta ganada'];
  // Agendado de HOY: SOLO el acto de "Agendó reunión" (nuevo agendamiento).
  // Confirmó -> pasa a reunión efectiva (seguimiento). Reprogramó -> no es un nuevo agendamiento.
  const AGEND = ['Agendo reunion'];
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
    if (!r.ultimaGestion || g.fecha > r.ultimaGestion) r.ultimaGestion = g.fecha;  // hora de la última gestión de hoy
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
  // Historial de los últimos 6 días (incluye hoy): por cada GP, si gestionó ese día.
  const INI = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const diasHist = [];
  for (let i = 5; i >= 0; i--) {
    const f = diaMenos(hoy, i);
    const dd = new Date(f + 'T12:00:00Z');
    diasHist.push({ fecha: f, label: INI[dd.getUTCDay()] + ' ' + f.slice(8, 10) });
  }
  Object.values(m).forEach(r => {
    const dias = intentoDia[r.asesor] || {};
    r.dias = diasHist.map(d => !!dias[d.fecha]);
  });
  // Etiquetas de los días de la racha, empezando por HOY hacia adelante (compat.)
  const diasRacha = [];
  for (let i = 0; i < 7; i++) { const dd = new Date(ahoraPeru); dd.setUTCDate(dd.getUTCDate() + i); diasRacha.push(INI[dd.getUTCDay()]); }
  const agendadosEquipo = Object.values(m).reduce((s, r) => s + (r.agendados || 0), 0);
  return { fecha: hoy, actualizado: new Date().toISOString(), meta: META, metaGlobal: META, agendadosEquipo, segundosReinicio, diasRacha, diasHist, pesos: { intento: 1, conexion: 2.5, calificado: 5, agendado: 15, call: 1 }, ranking };
}
app.get('/api/ranking/contactabilidad', (req, res) => { res.json(construirRankingDia()); });

// ===== Modo Supervisor: presencia en tiempo real (heartbeat en memoria) =====
const PRESENCIA = {}; // usuario -> { nombre, rol, lastSeen(ms), leadCodigo, leadNombre, etapa } (vivo, para el dot del panel)
db.exec(`CREATE TABLE IF NOT EXISTS presencia (
  usuario TEXT PRIMARY KEY, dia TEXT, primeraConexion TEXT, ultimaConexion TEXT,
  leadCodigo TEXT, leadNombre TEXT, etapa TEXT
)`);
try { db.exec('ALTER TABLE presencia ADD COLUMN segundosAcum INTEGER DEFAULT 0'); } catch (e) { /* ya existe */ }
try { db.exec('ALTER TABLE presencia ADD COLUMN modo TEXT'); } catch (e) { /* ya existe */ }
db.exec(`CREATE TABLE IF NOT EXISTS presencia_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT, dia TEXT, inicio TEXT, fin TEXT
)`);
const UMBRAL_TRAMO = 120; // seg: huecos de hasta 2 min se cuentan como el mismo tramo

app.post('/api/presencia/latido', (req, res) => {
  const u = req.user; if (!u) return res.status(401).json({ error: 'no_auth' });
  const b = req.body || {};
  const ahoraIso = new Date().toISOString(); const nowMs = Date.now();
  PRESENCIA[u.usuario] = { nombre: u.nombre, rol: u.rol, lastSeen: nowMs, leadCodigo: b.leadCodigo || null, leadNombre: b.leadNombre || null, etapa: b.etapa || null, modo: b.modo || null };
  try {
    const hoy = peruFecha(ahoraIso);
    const row = db.prepare('SELECT dia, ultimaConexion FROM presencia WHERE usuario = ?').get(u.usuario);
    if (!row || row.dia !== hoy) {
      // Nuevo día (o primera vez): reinicia acumulado y abre un tramo nuevo.
      db.prepare(`INSERT INTO presencia (usuario,dia,primeraConexion,ultimaConexion,segundosAcum,leadCodigo,leadNombre,etapa,modo)
        VALUES (?,?,?,?,0,?,?,?,?)
        ON CONFLICT(usuario) DO UPDATE SET dia=excluded.dia, primeraConexion=excluded.primeraConexion,
          ultimaConexion=excluded.ultimaConexion, segundosAcum=0, leadCodigo=excluded.leadCodigo, leadNombre=excluded.leadNombre, etapa=excluded.etapa, modo=excluded.modo`)
        .run(u.usuario, hoy, ahoraIso, ahoraIso, b.leadCodigo || null, b.leadNombre || null, b.etapa || null, b.modo || null);
      db.prepare('INSERT INTO presencia_log (usuario,dia,inicio,fin) VALUES (?,?,?,?)').run(u.usuario, hoy, ahoraIso, ahoraIso);
    } else {
      const delta = Math.round((nowMs - Date.parse(row.ultimaConexion)) / 1000);
      if (delta > 0 && delta <= UMBRAL_TRAMO) {
        // Mismo tramo: suma el delta al acumulado y extiende el tramo abierto.
        db.prepare('UPDATE presencia SET ultimaConexion=?, segundosAcum=COALESCE(segundosAcum,0)+?, leadCodigo=?, leadNombre=?, etapa=?, modo=? WHERE usuario=?')
          .run(ahoraIso, delta, b.leadCodigo || null, b.leadNombre || null, b.etapa || null, b.modo || null, u.usuario);
        const ult = db.prepare('SELECT id FROM presencia_log WHERE usuario=? AND dia=? ORDER BY inicio DESC LIMIT 1').get(u.usuario, hoy);
        if (ult) db.prepare('UPDATE presencia_log SET fin=? WHERE id=?').run(ahoraIso, ult.id);
        else db.prepare('INSERT INTO presencia_log (usuario,dia,inicio,fin) VALUES (?,?,?,?)').run(u.usuario, hoy, ahoraIso, ahoraIso);
      } else {
        // Hueco largo (estuvo desconectada): nuevo tramo, no se cuenta el hueco.
        db.prepare('UPDATE presencia SET ultimaConexion=?, leadCodigo=?, leadNombre=?, etapa=?, modo=? WHERE usuario=?')
          .run(ahoraIso, b.leadCodigo || null, b.leadNombre || null, b.etapa || null, b.modo || null, u.usuario);
        db.prepare('INSERT INTO presencia_log (usuario,dia,inicio,fin) VALUES (?,?,?,?)').run(u.usuario, hoy, ahoraIso, ahoraIso);
      }
    }
  } catch (e) { /* no romper el latido por la persistencia */ }
  res.json({ ok: true });
});

app.get('/api/supervisor/presencia', soloAdminOJefa, (req, res) => {
  const ahora = Date.now();
  const soloGestoras = req.user.rol === 'jefa';
  const where = soloGestoras
    ? "rol='gestora' AND COALESCE(rankingVisible,1)=1"
    : "((rol='gestora' AND COALESCE(rankingVisible,1)=1) OR rol='jefa')";
  const equipo = db.prepare("SELECT usuario,nombre,rol FROM usuarios WHERE activo=1 AND " + where + " ORDER BY CASE rol WHEN 'gestora' THEN 0 ELSE 1 END, id").all();
  const ultGest = {};
  db.prepare('SELECT asesor, MAX(fecha) AS ult FROM gestiones GROUP BY asesor').all().forEach(r => { ultGest[r.asesor] = r.ult; });
  const hoy = peruFecha(new Date(ahora).toISOString());
  const filas = equipo.map(g => {
    const row = db.prepare('SELECT * FROM presencia WHERE usuario = ?').get(g.usuario);
    const mismaDia = row && row.dia === hoy;
    const lastSeenMs = row && row.ultimaConexion ? Date.parse(row.ultimaConexion) : (PRESENCIA[g.usuario] ? PRESENCIA[g.usuario].lastSeen : null);
    let estado = 'desconectada', segundos = null;
    if (lastSeenMs) { segundos = Math.round((ahora - lastSeenMs) / 1000); estado = segundos < 90 ? 'en_linea' : segundos < 300 ? 'ausente' : 'desconectada'; }
    const primeraConexion = mismaDia ? row.primeraConexion : null;
    // Tiempo en CRM = suma de tramos del día (no el corrido desde la 1ra conexión). Si está en línea, suma el tramo vivo.
    const tiempoDentroSeg = mismaDia ? (row.segundosAcum || 0) + (estado === 'en_linea' ? (segundos || 0) : 0) : null;
    const ultimaGestion = ultGest[g.nombre] || null;
    const ultimaInteraccion = [row && row.ultimaConexion, ultimaGestion].filter(Boolean).sort().slice(-1)[0] || null;
    const vigente = estado !== 'desconectada' && row;
    // Metricas de supervision del dia (solo roles que supervisan): leads revisados + reasignaciones.
    let supervision = null;
    if (g.rol === 'jefa' || g.rol === 'admin') {
      const inicioDiaPeru = hoy + 'T05:00:00.000Z'; // 00:00 Lima = 05:00 UTC
      const rev = db.prepare("SELECT COUNT(DISTINCT objetivo) n FROM auditoria WHERE nombre=? AND accion='ver_trazabilidad' AND fecha>=?").get(g.nombre, inicioDiaPeru);
      const rea = db.prepare("SELECT COUNT(*) n FROM auditoria WHERE nombre=? AND accion='asignar' AND fecha>=?").get(g.nombre, inicioDiaPeru);
      supervision = { revisados: rev.n, reasignaciones: rea.n };
    }
    return {
      usuario: g.usuario, nombre: g.nombre, rol: g.rol, estado, segundos,
      primeraConexion, tiempoDentroSeg, ultimaGestion, ultimaInteraccion, supervision,
      leadCodigo: vigente ? row.leadCodigo : null, leadNombre: vigente ? row.leadNombre : null, etapa: vigente ? row.etapa : null,
      modo: vigente ? row.modo : null
    };
  });
  res.json({ actualizado: new Date().toISOString(), equipo: filas });
});

// Gráfico: minutos conectados por hora del día (acumulado en un rango de fechas), una serie por persona.
app.get('/api/supervisor/conexiones', soloAdminOJefa, (req, res) => {
  const soloGestoras = req.user.rol === 'jefa';
  const where = soloGestoras
    ? "rol='gestora' AND COALESCE(rankingVisible,1)=1"
    : "((rol='gestora' AND COALESCE(rankingVisible,1)=1) OR rol='jefa')";
  const equipo = db.prepare("SELECT usuario,nombre,rol FROM usuarios WHERE activo=1 AND " + where + " ORDER BY CASE rol WHEN 'gestora' THEN 0 ELSE 1 END, id").all();
  const hoy = peruFecha(new Date().toISOString());
  const desde = String(req.query.desde || hoy).slice(0, 10);
  const hasta = String(req.query.hasta || desde).slice(0, 10);
  const H0 = 6, H1 = 22; // franja mostrada (6am–10pm)
  const horas = []; for (let h = H0; h <= H1; h++) horas.push(h);
  const porU = {}; equipo.forEach(g => porU[g.usuario] = horas.map(() => 0));
  const logs = db.prepare('SELECT usuario,inicio,fin FROM presencia_log WHERE dia >= ? AND dia <= ?').all(desde, hasta);
  logs.forEach(t => {
    if (!porU[t.usuario]) return;
    let cur = Date.parse(t.inicio); const fin = Date.parse(t.fin);
    if (!(fin > cur)) return;
    for (let guard = 0; guard < 60 && cur < fin; guard++) {
      const dPeru = new Date(cur - 5 * 3600000);
      const h = dPeru.getUTCHours();
      const bordePeru = new Date(dPeru); bordePeru.setUTCMinutes(60, 0, 0);
      const bordeMs = bordePeru.getTime() + 5 * 3600000;
      const trozoFin = Math.min(fin, bordeMs);
      const min = (trozoFin - cur) / 60000;
      const idx = h - H0; if (idx >= 0 && idx < horas.length) porU[t.usuario][idx] += min;
      cur = trozoFin;
    }
  });
  // Número de días del rango (para el modo "promedio diario")
  const dias = Math.max(1, Math.round((Date.parse(hasta + 'T12:00:00Z') - Date.parse(desde + 'T12:00:00Z')) / 86400000) + 1);
  const series = equipo.map(g => ({ usuario: g.usuario, nombre: g.nombre, rol: g.rol, datos: porU[g.usuario].map(v => Math.round(v)) }));
  res.json({ desde, hasta, dias, horas, series });
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
  // "Desestimados" = fuera del tablero: archivados o marcados No elegible. Se listan juntos.
  if (estado === 'Desestimados') {
    let filas = db.prepare("SELECT * FROM b2b_solicitudes WHERE COALESCE(archivado,0)=1 OR estado='No elegible' ORDER BY fechaIngreso DESC, id DESC").all();
    filas = filtrarPorAlcanceB2B(req.user, filas);
    if (q) filas = filas.filter(s => [s.razonSocial, s.ruc, s.contacto, s.codigo].some(v => String(v || '').toLowerCase().includes(q)));
    return res.json({ solicitudes: filas, total: filas.length, desestimados: true });
  }
  let filas = db.prepare('SELECT * FROM b2b_solicitudes WHERE COALESCE(archivado,0)=? ORDER BY fechaIngreso DESC, id DESC').all(verArchivados ? 1 : 0);
  filas = filtrarPorAlcanceB2B(req.user, filas);
  if (estado) filas = filas.filter(s => s.estado === estado);
  if (q) filas = filas.filter(s => [s.razonSocial, s.ruc, s.contacto, s.codigo].some(v => String(v || '').toLowerCase().includes(q)));
  res.json({ solicitudes: filas, total: filas.length });
});

app.get('/api/b2b/solicitudes/:codigo', soloB2B, (req, res) => {
  const s = db.prepare('SELECT * FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  res.json(s);
});

// Reasignar manualmente una solicitud B2B a otro operador. Solo admin y jefes B2B (Diego y Dante).
// El destino debe ser un usuario activo dentro del área que gestiona quien reasigna.
app.put('/api/b2b/solicitudes/:codigo/reasignar', soloB2B, (req, res) => {
  if (!puedeGestionarEquipoB2B(req.user)) return res.status(403).json({ error: 'No autorizado para reasignar' });
  const s = db.prepare('SELECT codigo, responsableActual FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const roles = rolesGestionablesB2B(req.user);
  if (!roles.length) return res.status(403).json({ error: 'Sin operadores que gestionar' });
  const ph = roles.map(() => '?').join(',');
  const destino = db.prepare("SELECT usuario, nombre FROM usuarios WHERE usuario=? AND activo=1 AND rol IN (" + ph + ")").get(req.body && req.body.usuario, ...roles);
  if (!destino) return res.status(400).json({ error: 'Operador no válido para reasignar' });
  db.prepare("UPDATE b2b_solicitudes SET responsableActual=?, funcionario=? WHERE codigo=?").run(destino.nombre, destino.nombre, s.codigo);
  auditar(req, 'b2b_reasignar', s.codigo, `${s.responsableActual || 'sin asignar'} -> ${destino.nombre}`);
  res.json({ ok: true, responsable: destino.nombre });
});

// Reasignar VARIOS leads a la vez a un funcionario (selección múltiple en la bandeja).
app.put('/api/b2b/solicitudes/reasignar-lote', soloB2B, (req, res) => {
  if (!puedeGestionarEquipoB2B(req.user)) return res.status(403).json({ error: 'No autorizado para reasignar' });
  const codigos = Array.isArray(req.body && req.body.codigos) ? req.body.codigos : [];
  if (!codigos.length) return res.status(400).json({ error: 'No hay leads seleccionados' });
  const roles = rolesGestionablesB2B(req.user);
  if (!roles.length) return res.status(403).json({ error: 'Sin operadores que gestionar' });
  const ph = roles.map(() => '?').join(',');
  const destino = db.prepare("SELECT usuario, nombre FROM usuarios WHERE usuario=? AND activo=1 AND rol IN (" + ph + ")").get(req.body && req.body.usuario, ...roles);
  if (!destino) return res.status(400).json({ error: 'Operador no válido para reasignar' });
  const upd = db.prepare("UPDATE b2b_solicitudes SET responsableActual=?, funcionario=? WHERE codigo=?");
  let n = 0;
  for (const cod of codigos) {
    const s = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(cod);
    if (s) { upd.run(destino.nombre, destino.nombre, cod); n++; }
  }
  auditar(req, 'b2b_reasignar_lote', codigos.join(','), `${n} leads -> ${destino.nombre}`);
  res.json({ ok: true, reasignados: n, responsable: destino.nombre });
});

// Detectar duplicados por RUC (mismo RUC en 2+ solicitudes activas). Para la bandeja de ingresos.
app.get('/api/b2b/duplicados', soloB2B, (req, res) => {
  const filas = db.prepare(`SELECT ruc, COUNT(*) n, GROUP_CONCAT(codigo) codigos FROM b2b_solicitudes
    WHERE archivado IS NOT 1 AND estado <> 'No elegible' AND ruc IS NOT NULL AND TRIM(ruc) <> ''
    GROUP BY ruc HAVING n > 1`).all();
  const grupos = filas.map(f => {
    const cods = String(f.codigos).split(',');
    const dets = db.prepare("SELECT codigo, razonSocial, responsableActual, estado, fechaIngreso FROM b2b_solicitudes WHERE codigo IN (" + cods.map(() => '?').join(',') + ") ORDER BY fechaIngreso ASC").all(...cods);
    return { ruc: f.ruc, n: f.n, solicitudes: dets };
  });
  res.json({ grupos });
});

// Descartar un duplicado (sale del tablero, conserva el original). Solo jefe/admin.
app.put('/api/b2b/solicitudes/:codigo/descartar-duplicado', soloB2B, (req, res) => {
  if (!puedeGestionarEquipoB2B(req.user)) return res.status(403).json({ error: 'No autorizado' });
  const s = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  db.prepare("UPDATE b2b_solicitudes SET estado='No elegible', archivado=1, motivoDescarte='Duplicado' WHERE codigo=?").run(s.codigo);
  auditar(req, 'b2b_descartar_duplicado', s.codigo, 'marcado duplicado');
  res.json({ ok: true });
});

// Fusionar duplicados: conserva el destino y descarta los demás, moviendo sus gestiones al destino.
app.put('/api/b2b/solicitudes/fusionar-duplicados', soloB2B, (req, res) => {
  if (!puedeGestionarEquipoB2B(req.user)) return res.status(403).json({ error: 'No autorizado' });
  const destino = req.body && req.body.destino;
  const origenes = Array.isArray(req.body && req.body.origenes) ? req.body.origenes : [];
  if (!destino || !origenes.length) return res.status(400).json({ error: 'Faltan destino u orígenes' });
  const d = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(destino);
  if (!d) return res.status(404).json({ error: 'Destino no encontrado' });
  const mover = db.prepare("UPDATE b2b_gestiones SET codigoSolicitud=? WHERE codigoSolicitud=?");
  const descartar = db.prepare("UPDATE b2b_solicitudes SET estado='No elegible', archivado=1, motivoDescarte='Fusionado' WHERE codigo=?");
  let n = 0;
  for (const o of origenes) {
    if (o === destino) continue;
    const src = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(o);
    if (!src) continue;
    mover.run(destino, o); descartar.run(o); n++;
  }
  auditar(req, 'b2b_fusionar_duplicados', destino, `absorbió ${n} · orígenes ${origenes.join(',')}`);
  res.json({ ok: true, fusionados: n });
});

// Limpiar TODAS las gestiones de un lead (sin borrar el lead). Solo jefe/admin. Vuelve a su etapa base.
app.delete('/api/b2b/solicitudes/:codigo/gestiones', soloB2B, (req, res) => {
  if (!puedeGestionarEquipoB2B(req.user)) return res.status(403).json({ error: 'Solo jefe/admin puede limpiar el historial' });
  const s = db.prepare('SELECT codigo, sunatEstado FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const del = db.prepare('DELETE FROM b2b_gestiones WHERE codigoSolicitud=?').run(s.codigo);
  // Vuelve a la etapa base: SUNAT ok -> Filtro credito; si no -> Solicitud (SUNAT).
  const estadoBase = s.sunatEstado === 'ok' ? 'Nuevo' : 'Nuevo';
  db.prepare("UPDATE b2b_solicitudes SET estado=?, fechaEtapa=?, fechaEtapaCol=NULL WHERE codigo=?").run(estadoBase, new Date().toISOString(), s.codigo);
  auditar(req, 'b2b_limpiar_gestiones', s.codigo, del.changes + ' gestiones eliminadas · vuelve a etapa base');
  res.json({ ok: true, eliminadas: del.changes });
});

// Editar el monto exacto solicitado (el que confirma el empresario). Recalcula el ticket.
app.put('/api/b2b/solicitudes/:codigo/monto', soloB2B, (req, res) => {
  const s = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const monto = Number(req.body && req.body.monto);
  if (!isFinite(monto) || monto <= 0) return res.status(400).json({ error: 'Monto inválido' });
  const ticket = ticketDeMonto(monto);
  // Al fijar el monto exacto, dejamos de tratarlo como rango.
  db.prepare("UPDATE b2b_solicitudes SET montoSolicitado=?, montoRango=NULL, ticket=? WHERE codigo=?").run(monto, ticket, s.codigo);
  auditar(req, 'b2b_editar_monto', s.codigo, 'S/ ' + monto + ' · ' + ticket);
  res.json({ ok: true, montoSolicitado: monto, ticket });
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
  const filas = db.prepare("SELECT usuario, nombre, rol, activo, COALESCE(autoasignar,1) AS autoasignar FROM usuarios WHERE activo=1 AND rol IN (" + ph + ") ORDER BY CASE rol WHEN 'jefe_creditos' THEN 1 WHEN 'asistente_creditos' THEN 2 WHEN 'jefe_b2b' THEN 3 ELSE 4 END, id").all(...roles);
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
// Secuencia de etapas y su columna de resultado. El avance automático (Verde/Amarillo) usa esto.
const SEC_ETAPAS_B2B = ['Filtro credito', 'Filtro garantia', 'Reunion comercial', 'Filtro finanzas', 'Business case'];
const AVANZA_SEM = sem => sem === 'Verde' || sem === 'Amarillo'; // Rojo NO avanza
// Mínimo de sujetos de crédito según tipo de RUC (20 → empresa + rep. legal = 2; 10 → 1).
function minSujetosCredito(ruc) { return String(ruc || '').trim().startsWith('20') ? 2 : 1; }
// ===== PRIORITY SCORE B2B (motor de priorización) =====
// Pesos configurables (suman 100). Orden del negocio: Monto > Temperatura > SLA > Días sin gestión.
const PScoreDefault = { monto: 35, temperatura: 28, sla: 22, sinGestion: 15 };
function getPScorePesos() {
  try { const r = db.prepare("SELECT valor FROM app_config WHERE clave='b2b_pscore_pesos'").get(); if (r && r.valor) return Object.assign({}, PScoreDefault, JSON.parse(r.valor)); } catch (e) {}
  return PScoreDefault;
}
// Pesos configurables del priority score B2C (mismo patrón que el B2B).
function getPScorePesosB2C() {
  try { const r = db.prepare("SELECT valor FROM app_config WHERE clave='b2c_pscore_pesos'").get(); if (r && r.valor) return Object.assign({}, L.PScoreDefaultB2C, JSON.parse(r.valor)); } catch (e) {}
  return L.PScoreDefaultB2C;
}
// Semáforo consolidado de la solicitud (el peor de los evaluados; refleja probabilidad/temperatura).
function semGlobalB2B(sol) {
  const vals = [sol.resultadoCredito, sol.resultadoGarantia, sol.resultadoFinanzas].filter(Boolean);
  if (!vals.length) return null;
  if (vals.includes('Rojo')) return 'Rojo';
  if (vals.includes('Amarillo')) return 'Amarillo';
  return 'Verde';
}
// Última gestión (para días sin contacto).
function ultimaGestionB2B(codigo) {
  const g = db.prepare('SELECT fecha FROM b2b_gestiones WHERE codigoSolicitud=? ORDER BY fecha DESC LIMIT 1').get(codigo);
  return g ? g.fecha : null;
}
// Calcula el Priority Score (0-100), nivel (critica/alta/media/baja) y oxígeno (0-100) de una solicitud.
function priorityScoreB2B(sol, montoMax) {
  const W = getPScorePesos();
  const col = etapaKanbanB2B(sol);
  const sla = slaEtapaB2B(col, sol.fechaEtapa);
  // --- Sub-scores 0..1 ---
  // Monto: normalizado contra el mayor monto del pipeline (log para no aplastar a los medianos)
  const monto = Number(sol.montoSolicitado || 0) || 0;
  const sMonto = montoMax > 0 ? Math.sqrt(monto) / Math.sqrt(montoMax) : 0; // raíz: mantiene la jerarquía (1M > 100k) sin que los grandes aplasten
  // Temperatura: Verde=1, Amarillo=0.6, Rojo=0.15, sin dato=0.4
  const sem = semGlobalB2B(sol);
  const sTemp = sem === 'Verde' ? 1 : sem === 'Amarillo' ? 0.6 : sem === 'Rojo' ? 0.15 : 0.4;
  // SLA: vencido=1 (máxima urgencia), porvencer escala en el último 25%, ok escala con % consumido
  let sSla = 0;
  if (sla && sla.horas) {
    if (sla.vencido) sSla = 1;
    else sSla = Math.min(1, (sla.usadas || 0) / sla.horas);
  }
  // Días sin gestión: 0 días=0, 7+ días=1
  const ug = ultimaGestionB2B(sol.codigo);
  const base = ug || sol.fechaEtapa || sol.fechaIngreso;
  const diasSin = base ? Math.floor((Date.now() - new Date(base).getTime()) / 86400000) : 7;
  const sSin = Math.min(1, diasSin / 7);
  // --- Score ponderado 0..100 ---
  const score = Math.round(W.monto * sMonto + W.temperatura * sTemp + W.sla * sSla + W.sinGestion * sSin);
  // --- Nivel ---
  let nivel = 'baja';
  const esperando = ['Nuevo'].includes(sol.estado) && !ug; // esperando SUNAT/primer toque
  if (sla && sla.vencido) nivel = 'critica';
  else if (score >= 70) nivel = 'critica';
  else if (score >= 50) nivel = 'alta';
  else if (score >= 30) nivel = 'media';
  else nivel = esperando ? 'baja' : 'media';
  // --- Oxígeno (100 = fresco, 0 = deteriorado): combina SLA restante y días sin gestión ---
  let oxSla = 100; if (sla && sla.horas) oxSla = Math.max(0, Math.round((1 - Math.min(1, (sla.usadas || 0) / sla.horas)) * 100));
  const oxSin = Math.max(0, Math.round((1 - sSin) * 100));
  const oxigeno = Math.round(oxSla * 0.6 + oxSin * 0.4);
  // --- Días para resurfacing ---
  return { score, nivel, oxigeno, diasSinGestion: diasSin, sla, semGlobal: sem, montoNum: monto,
    detalle: { sMonto: +sMonto.toFixed(2), sTemp, sSla: +sSla.toFixed(2), sSin: +sSin.toFixed(2) } };
}

// Avanza la solicitud a la siguiente etapa si el semáforo lo permite y aún no pasó de ahí.
function autoAvanzarB2B(codigo, etapaActualKanban, sem, responsable) {
  if (!AVANZA_SEM(sem)) return false;
  const idx = SEC_ETAPAS_B2B.indexOf(etapaActualKanban);
  if (idx < 0 || idx >= SEC_ETAPAS_B2B.length - 1) return false; // ya en la última o desconocida
  const siguiente = SEC_ETAPAS_B2B[idx + 1];
  const estadoDestino = siguiente === 'Business case' ? 'Expediente' : siguiente;
  const s = db.prepare('SELECT estado FROM b2b_solicitudes WHERE codigo=?').get(codigo);
  // Solo avanza si está en (o antes de) la etapa actual, para no retroceder ni saltar.
  const estadosPrevios = { 'Filtro credito': ['Nuevo', 'Filtro credito', 'Apto credito', 'Amarillo/nurture'], 'Filtro garantia': ['Filtro garantia'], 'Reunion comercial': ['Reunion comercial'], 'Filtro finanzas': ['Filtro finanzas'] };
  const ok = estadosPrevios[etapaActualKanban] && estadosPrevios[etapaActualKanban].includes(s && s.estado);
  if (!ok) return false;
  db.prepare('UPDATE b2b_solicitudes SET estado=?, fechaEtapa=? WHERE codigo=?').run(estadoDestino, new Date().toISOString(), codigo);
  // Deja rastro del avance en la auditoría para que los reportes lo cuenten (sin importar por qué flujo se disparó).
  try {
    db.prepare('INSERT INTO auditoria (fecha,usuario,nombre,accion,objetivo,detalle) VALUES (?,?,?,?,?,?)')
      .run(new Date().toISOString(), '(auto)', responsable || '(auto)', 'b2b_avanzar_etapa', codigo, etapaActualKanban + ' → ' + siguiente);
  } catch (e) {}
  return true;
}

// ===== Criterios con MÉTRICAS por filtro (el semáforo se CALCULA, no se marca a mano) =====
// Cada criterio evalúa a Verde/Amarillo/Rojo. El semáforo del filtro = el PEOR de los criterios evaluados.
// Umbrales por defecto (calibrables). 'select' mapea opción→color; 'num' aplica reglas en orden (primera que cumple, si no 'resto').
const CRITERIOS_B2B = {
  credito: [
    { clave: 'sbs', etiqueta: 'Clasificación SBS', tipo: 'select', opciones: [
      { v: 'normal', label: 'Normal', color: 'Verde' },
      { v: 'sd', label: 'S/D (Sin deuda)', color: 'Verde' },
      { v: 'cpp', label: 'CPP', color: 'Amarillo' },
      { v: 'deficiente', label: 'Deficiente', color: 'Rojo' },
      { v: 'dudoso', label: 'Dudoso', color: 'Rojo' },
      { v: 'perdida', label: 'Pérdida', color: 'Rojo' }
    ] },
    { clave: 'score', etiqueta: 'Score central de riesgo', tipo: 'num', sufijo: 'pts',
      reglas: [{ op: '>=', val: 700, color: 'Verde' }, { op: '>=', val: 500, color: 'Amarillo' }], resto: 'Rojo' },
    { clave: 'mora', etiqueta: 'Días de mora actual', tipo: 'num', sufijo: 'días',
      reglas: [{ op: '<=', val: 0, color: 'Verde' }, { op: '<=', val: 15, color: 'Amarillo' }], resto: 'Rojo' },
    { clave: 'cobranza', etiqueta: 'Deuda en cobranza / castigada', tipo: 'select', opciones: [
      { v: 'no', label: 'No', color: 'Verde' },
      { v: 'si', label: 'Sí', color: 'Rojo' }
    ] },
    { clave: 'entidades', etiqueta: 'N.º de entidades con deuda', tipo: 'num', sufijo: 'ent.',
      reglas: [{ op: '<=', val: 3, color: 'Verde' }, { op: '<=', val: 6, color: 'Amarillo' }], resto: 'Rojo' }
  ],
  garantia: [
    { clave: 'ltv', etiqueta: 'LTV (préstamo / valor)', tipo: 'num', sufijo: '%',
      reglas: [{ op: '<=', val: 60, color: 'Verde' }, { op: '<=', val: 70, color: 'Amarillo' }], resto: 'Rojo' },
    { clave: 'zona', etiqueta: 'Zona de cobertura', tipo: 'select', opciones: [
      { v: 'a', label: 'Zona A', color: 'Verde' },
      { v: 'b', label: 'Zona B', color: 'Amarillo' },
      { v: 'c', label: 'Zona C / fuera', color: 'Rojo' }
    ] },
    { clave: 'sunarp', etiqueta: 'Inscrito en SUNARP', tipo: 'select', opciones: [
      { v: 'si', label: 'Sí', color: 'Verde' },
      { v: 'no', label: 'No', color: 'Rojo' }
    ] },
    { clave: 'tipo', etiqueta: 'Tipo de inmueble', tipo: 'select', opciones: [
      { v: 'comercial', label: 'Comercial', color: 'Verde' },
      { v: 'vivienda', label: 'Vivienda', color: 'Verde' },
      { v: 'terreno', label: 'Terreno', color: 'Amarillo' },
      { v: 'otro', label: 'Otro', color: 'Rojo' }
    ] },
    { clave: 'gravamen', etiqueta: 'Gravámenes / cargas previas', tipo: 'select', opciones: [
      { v: 'ninguno', label: 'Ninguno', color: 'Verde' },
      { v: 'menores', label: 'Menores', color: 'Amarillo' },
      { v: 'hipoteca', label: 'Hipoteca vigente', color: 'Rojo' }
    ] }
  ],
  finanzas: [
    { clave: 'dscr', etiqueta: 'DSCR / cobertura de deuda', tipo: 'num', sufijo: 'x',
      reglas: [{ op: '>=', val: 1.3, color: 'Verde' }, { op: '>=', val: 1.1, color: 'Amarillo' }], resto: 'Rojo' },
    { clave: 'antiguedad', etiqueta: 'Antigüedad del negocio', tipo: 'num', sufijo: 'meses',
      reglas: [{ op: '>=', val: 24, color: 'Verde' }, { op: '>=', val: 12, color: 'Amarillo' }], resto: 'Rojo' },
    { clave: 'ventasTicket', etiqueta: 'Ventas anuales / ticket', tipo: 'num', sufijo: 'x',
      reglas: [{ op: '>=', val: 4, color: 'Verde' }, { op: '>=', val: 2, color: 'Amarillo' }], resto: 'Rojo' },
    { clave: 'sector', etiqueta: 'Sector (política sectorial)', tipo: 'select', opciones: [
      { v: 'preferente', label: 'Preferente', color: 'Verde' },
      { v: 'neutro', label: 'Neutro', color: 'Amarillo' },
      { v: 'restringido', label: 'Restringido', color: 'Rojo' }
    ] },
    { clave: 'destino', etiqueta: 'Coherencia del destino de fondos', tipo: 'select', opciones: [
      { v: 'coherente', label: 'Coherente', color: 'Verde' },
      { v: 'parcial', label: 'Parcial', color: 'Amarillo' },
      { v: 'incoherente', label: 'Incoherente', color: 'Rojo' }
    ] }
  ]
};

function colorCriterio(crit, valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (crit.tipo === 'select') {
    const op = (crit.opciones || []).find(o => o.v === valor);
    return op ? op.color : null;
  }
  if (crit.tipo === 'num') {
    const n = Number(valor);
    if (!isFinite(n)) return null;
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
function peorColor(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return ORDEN_SEM[a] >= ORDEN_SEM[b] ? a : b;
}
// Evalúa un checklist de valores contra el catálogo → { semaforo (peor), detalle, faltan, total }.
function evaluarChecklistB2B(tipo, valores) {
  const items = CRITERIOS_B2B[tipo] || [];
  let sem = null, faltan = 0;
  const detalle = items.map(c => {
    const col = colorCriterio(c, valores ? valores[c.clave] : undefined);
    if (col == null) faltan++; else sem = peorColor(sem, col);
    return { clave: c.clave, color: col };
  });
  return { semaforo: sem, detalle, faltan, total: items.length };
}

// Consolidado de crédito — regla oficial (spec §2): PEOR CASO entre todos los sujetos
// (empresa + representantes + vinculadas). Un sujeto Rojo (KO seco, Dudoso/Pérdida, listas,
// concursal, límites de ticket excedidos) contagia y hace Rojo todo el filtro.
function consolidadoCredito(codigo) {
  const sujetos = db.prepare('SELECT semaforo FROM b2b_credito_sujetos WHERE codigoSolicitud=?').all(codigo);
  if (!sujetos.length) return null;
  let peor = null;
  for (const s of sujetos) { if (s.semaforo && (peor == null || ORDEN_SEM[s.semaforo] > ORDEN_SEM[peor])) peor = s.semaforo; }
  return peor;
}

// ======================================================================
// MOTOR DE DOS CAPAS (recalibración spec oficial de filtros B2B)
//  Capa 1 gates: si un gate falla → KO (Rojo) con motivo; algunos → 'escalado' (excepción pendiente).
//  Capa 2 puntaje: solo corre si pasan los gates. 0–100 ponderado por completitud/calidad.
//  Semáforo: Verde ≥80 · Amarillo 50–79 · Rojo <50 o cualquier KO. 'escalado' impide cerrar Verde.
//  Todo dependiente del ticket (Bajo/Medio/Alto).
// ======================================================================
const RANGOS_VENTAS_TICKET = { Bajo: [500000, 3000000], Medio: [3000000, 10000000], Alto: [10000000, Infinity] };
const ANTIG_MIN_TICKET = { Bajo: 12, Medio: 12, Alto: 12 }; // minimo 1 anio para avanzar (todos los tickets)
// Cuota estimada "gruesa" para el DSCR: cuota fija (francés), tasa piso referencial 25% anual, 12 meses.
const CUOTA_REF = { tasaAnual: 0.25, meses: 12 };
const TASAS_REF_B2B = [0.25, 0.275, 0.30, 0.32]; // tasas seleccionables para estimar la cuota
function cuotaEstimadaB2B(monto, tasa) {
  const m = Number(monto); if (!isFinite(m) || m <= 0) return null;
  const t = TASAS_REF_B2B.includes(Number(tasa)) ? Number(tasa) : CUOTA_REF.tasaAnual;
  const i = t / 12, n = CUOTA_REF.meses;
  return m * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
}

const FILTROS_B2B = {
  sunat: {
    titulo: 'Filtro SUNAT',
    gates: [
      { clave: 'personaJuridica', etiqueta: 'Persona jurídica', tip: 'Debe ser persona jurídica (RUC que inicia en 20). RUC 10 (persona natural) se observa; otro caso es KO.', tipo: 'select', auto: true, opciones: [
        { v: 'si', label: 'Sí (RUC 20)', resultado: 'ok' },
        { v: 'observar', label: 'RUC 10 — observar', resultado: 'observado', motivo: 'RUC 10 (persona natural): revisar' },
        { v: 'no', label: 'No', resultado: 'ko', motivo: 'No es persona jurídica' }
      ] },
      { clave: 'estado', etiqueta: 'Estado SUNAT', tip: 'Estado del contribuyente en SUNAT: debe estar Activo. Baja provisional/de oficio se observa; no activo es KO.', tipo: 'select', auto: true, opciones: [
        { v: 'activo', label: 'Activo', resultado: 'ok' },
        { v: 'bajaprov', label: 'Baja provisional / de oficio', resultado: 'observado', motivo: 'Estado SUNAT en baja provisional/de oficio: observar' },
        { v: 'no', label: 'No activo', resultado: 'ko', motivo: 'Estado SUNAT no activo' }
      ] },
      { clave: 'condicion', etiqueta: 'Condición SUNAT', tip: 'Condición del domicilio fiscal en SUNAT: debe ser Habido. No habido es KO.', tipo: 'select', auto: true, opciones: [
        { v: 'habido', label: 'Habido', resultado: 'ok' },
        { v: 'no', label: 'No habido', resultado: 'ko', motivo: 'Condición SUNAT ≠ Habido' }
      ] },
      { clave: 'antiguedad', etiqueta: 'Antigüedad', tip: 'Antigüedad del RUC en meses. Mínimo 12 meses para avanzar (todos los tickets).', tipo: 'numMinTicket', formato: 'aniosMeses', sufijo: 'meses', minTicket: ANTIG_MIN_TICKET, motivo: 'Antigüedad menor al mínimo del ticket' }
    ],
    // SUNAT no lleva puntaje proporcional: si los gates pasan es Verde 100; un 'observado' lo baja a Amarillo.
    score: []
  },

  // ===== CRÉDITO (se evalúa POR SUJETO: empresa / RL / vinculada; consolidación = peor caso) =====
  credito: {
    titulo: 'Filtro Crédito (por sujeto)',
    gates: [
      // ---- KILLERS (matan el sujeto) ----
      { clave: 'clasActual', etiqueta: 'Clasificación actual', tip: 'Clasificación SBS vigente del sujeto. Dudoso o Pérdida = KO seco (mata al sujeto y contagia el filtro). S/D = sin deuda (mismo tratamiento que Normal).', tipo: 'select', opciones: [
        { v: 'normal', label: 'Normal', resultado: 'ok' },
        { v: 'sd', label: 'S/D (Sin deuda)', resultado: 'ok' },
        { v: 'cpp', label: 'CPP', resultado: 'ok' },
        { v: 'deficiente', label: 'Deficiente', resultado: 'ok' },
        { v: 'dudoso', label: 'Dudoso', resultado: 'ko', motivo: 'Clasificación actual Dudoso' },
        { v: 'perdida', label: 'Pérdida', resultado: 'ko', motivo: 'Clasificación actual Pérdida' }
      ] },
      { clave: 'listaNegra', etiqueta: 'Lista negra', tip: 'Lista negra interna de Tasatop. Estar en la lista = KO seco.', tipo: 'select', opciones: [
        { v: 'no', label: 'No', resultado: 'ok' }, { v: 'si', label: 'Sí', resultado: 'ko', motivo: 'Lista negra interna Tasatop' }
      ] },
      { clave: 'dudosoPerdidaHist', etiqueta: 'Dudoso/Pérdida hist.', tip: 'Cantidad de clasificaciones Dudoso o Pérdida en el histórico. No se permite ninguna en ningún ticket (KO).', tipo: 'numMaxTicket', unidad: 'cantidad', maxTicket: { Bajo: 0, Medio: 0, Alto: 0 }, motivo: 'Dudoso/Pérdida histórico no permitido (KO)' },
      { clave: 'castigados', etiqueta: 'Castigados', tip: 'Créditos castigados en el sistema financiero. No se permiten en ningún ticket (KO).', tipo: 'numMaxTicket', unidad: 'cantidad', maxTicket: { Bajo: 0, Medio: 0, Alto: 0 }, motivo: 'Créditos castigados no permitidos (KO)' },
      // ---- OBSERVABLES por límite de ticket (exceder = Amarillo, no mata) ----
      { clave: 'cppEvalPct', etiqueta: 'CPP evaluación', tip: '% de deuda en CPP en la evaluación vigente. Límite por ticket: Bajo 75% · Medio 50% · Alto 25%. Exceder = observado (Amarillo, no mata).', tipo: 'numObsTicket', unidad: 'porcentaje', maxTicket: { Bajo: 75, Medio: 50, Alto: 25 }, motivo: 'CPP en evaluación excede el límite del ticket' },
      { clave: 'cppHist', etiqueta: 'CPP histórico', tip: 'Cantidad de CPP en el histórico. Límite: 2 (todos los tickets). Exceder = observado.', tipo: 'numObsTicket', unidad: 'cantidad', maxTicket: { Bajo: 2, Medio: 2, Alto: 2 }, motivo: 'CPP histórico excede el límite del ticket' },
      { clave: 'deficienteHist', etiqueta: 'Deficiente hist.', tip: 'Cantidad de Deficiente en el histórico. Límite: Bajo 1 · Medio 0 · Alto 0. Exceder = observado.', tipo: 'numObsTicket', unidad: 'cantidad', maxTicket: { Bajo: 1, Medio: 0, Alto: 0 }, motivo: 'Deficiente histórico excede el límite del ticket' },
      { clave: 'refis', etiqueta: 'Refinanciamientos', tip: 'Refinanciamientos en los últimos 12 meses. No se permiten; tener alguno = observado.', tipo: 'numObsTicket', unidad: 'cantidad', maxTicket: { Bajo: 0, Medio: 0, Alto: 0 }, motivo: 'Refinanciamientos observados (excede límite)' },
      { clave: 'protestadosCant', etiqueta: 'Protestados', tip: 'Documentos protestados sin aclarar. Subsanable: tener alguno = observado.', tipo: 'numObsTicket', unidad: 'cantidad', maxTicket: { Bajo: 0, Medio: 0, Alto: 0 }, motivo: 'Documentos protestados (subsanable, observado)' },
      { clave: 'morososMonto', etiqueta: 'Morosos', tip: 'Monto total de documentos morosos. Límite: Bajo S/1,000 · Medio S/3,000 · Alto S/5,000. Exceder = observado.', tipo: 'numObsTicket', unidad: 'monto', maxTicket: { Bajo: 1000, Medio: 3000, Alto: 5000 }, motivo: 'Monto de morosos excede el límite del ticket' },
      { clave: 'coactivaVigente', etiqueta: 'Coactiva vigente', tip: 'Cobranza coactiva (SUNAT/municipal) vigente. Sí = observado: requiere subsanación o aprobación de comité.', tipo: 'select', opciones: [
        { v: 'no', label: 'No', resultado: 'ok' },
        { v: 'si', label: 'Sí', resultado: 'observado', motivo: 'Coactiva vigente: requiere subsanación/aprobación de comité' }
      ] }
    ],
    // SUNAT-style: sin puntaje proporcional. Pasar gates = 100; observado baja a Amarillo; KO = Rojo.
    score: []
  },

  // ===== FINANZAS Y NEGOCIOS (completitud documental + viabilidad + solidez) =====
  finanzas: {
    titulo: 'Filtro Finanzas y Negocios',
    // Documentos obligatorios por ticket: faltante = escalado (bloquea avance a Business Case).
    gates: [
      { clave: 'djAnual', etiqueta: 'DJ Anual', tip: 'Declaración Jurada Anual SUNAT. Obligatoria en todos los tickets; faltante bloquea el avance a Business Case.', tipo: 'docTicket', requeridoTicket: { Bajo: true, Medio: true, Alto: true }, opciones: [{ v: 'si', label: 'Recibido' }, { v: 'no', label: 'Falta' }], motivo: 'Falta DJ Anual SUNAT' },
      { clave: 'eeff', etiqueta: 'EEFF situacionales', tip: 'Estados financieros situacionales con antigüedad máxima de 3 meses. Obligatorios en ticket Medio y Alto.', tipo: 'docTicket', requeridoTicket: { Bajo: false, Medio: true, Alto: true }, opciones: [{ v: 'si', label: 'Recibido' }, { v: 'no', label: 'Falta' }], motivo: 'Faltan Estados Financieros (Medio/Alto)' },
      { clave: 'flujoProyectado', etiqueta: 'Flujo proyectado', tip: 'Flujo de caja proyectado del negocio. Obligatorio en ticket Medio y Alto.', tipo: 'docTicket', requeridoTicket: { Bajo: false, Medio: true, Alto: true }, opciones: [{ v: 'si', label: 'Recibido' }, { v: 'no', label: 'Falta' }], motivo: 'Falta flujo de caja proyectado (Medio/Alto)' },
      { clave: 'reporteTributario', etiqueta: 'Reporte tributario', tip: 'Reporte tributario de SUNAT. Obligatorio en todos los tickets.', tipo: 'docTicket', requeridoTicket: { Bajo: true, Medio: true, Alto: true }, opciones: [{ v: 'si', label: 'Recibido' }, { v: 'no', label: 'Falta' }], motivo: 'Falta reporte tributario' },
      { clave: 'fichaRuc', etiqueta: 'Ficha RUC', tip: 'Ficha RUC actualizada. Obligatoria en todos los tickets.', tipo: 'docTicket', requeridoTicket: { Bajo: true, Medio: true, Alto: true }, opciones: [{ v: 'si', label: 'Recibido' }, { v: 'no', label: 'Falta' }], motivo: 'Falta Ficha RUC' }
    ],
    // Insumos numéricos (2 años consecutivos, cierre de año) para calcular los ratios.
    insumos: [
      { clave: 'ventasAct', etiqueta: 'Ventas actual', tip: 'Ventas anuales del último cierre de año (S/).', sufijo: 'S/' },
      { clave: 'ventasAnt', etiqueta: 'Ventas anterior', tip: 'Ventas anuales del cierre previo (S/); insumo del crecimiento.', sufijo: 'S/' },
      { clave: 'utilidadAct', etiqueta: 'Utilidad actual', tip: 'Utilidad neta o EBITDA del último cierre de año (S/).', sufijo: 'S/' },
      { clave: 'utilidadAnt', etiqueta: 'Utilidad anterior', tip: 'Utilidad neta o EBITDA del cierre previo (S/).', sufijo: 'S/' },
      { clave: 'deudaFin', etiqueta: 'Deuda financiera', tip: 'Deuda financiera total vigente en el sistema (S/); insumo del endeudamiento.', sufijo: 'S/' },
      { clave: 'patrimonio', etiqueta: 'Patrimonio', tip: 'Patrimonio neto según EEFF (S/); insumo del endeudamiento.', sufijo: 'S/' },
      { clave: 'flujoMensual', etiqueta: 'Flujo mensual', tip: 'Flujo de caja disponible mensual para atender la cuota (S/); insumo del DSCR.', sufijo: 'S/' }
    ],
    // 5 ratios que PUNTÚAN (ninguno mata). No cumplir el umbral = observación (no suma su peso).
    // dir: 'min' cumple si valor>=umbral; 'max' cumple si valor<=umbral. Umbral por ticket.
    ratios: [
      { clave: 'dscr', etiqueta: 'DSCR', tip: 'Cobertura de cuota: flujo mensual ÷ cuota estimada (francés, 25% anual ref., 12m). Mínimo: Bajo 1.2x · Medio 1.3x · Alto 1.4x. Peso 35.', peso: 35, dir: 'min', umbral: { Bajo: 1.2, Medio: 1.3, Alto: 1.4 }, fmt: 'x',
        calc: (v) => (v.flujoMensual && v.cuotaMensual) ? v.flujoMensual / v.cuotaMensual : null },
      { clave: 'endeudamiento', etiqueta: 'Endeudamiento', tip: 'Deuda financiera ÷ patrimonio. Máximo: Bajo 2.5x · Medio 2.0x · Alto 1.8x. Peso 20.', peso: 20, dir: 'max', umbral: { Bajo: 2.5, Medio: 2.0, Alto: 1.8 }, fmt: 'x',
        calc: (v) => (v.deudaFin != null && v.patrimonio) ? v.deudaFin / v.patrimonio : null },
      { clave: 'cargaFin', etiqueta: 'Carga financiera', tip: 'Cuota anual estimada ÷ ventas anuales. Máximo: Bajo 30% · Medio 25% · Alto 20%. Peso 20.', peso: 20, dir: 'max', umbral: { Bajo: 0.30, Medio: 0.25, Alto: 0.20 }, fmt: '%',
        calc: (v) => (v.cuotaMensual && v.ventasAct) ? (v.cuotaMensual * 12) / v.ventasAct : null },
      { clave: 'margen', etiqueta: 'Margen neto', tip: 'Utilidad ÷ ventas. Mínimo: Bajo 5% · Medio 8% · Alto 10%. Peso 15.', peso: 15, dir: 'min', umbral: { Bajo: 0.05, Medio: 0.08, Alto: 0.10 }, fmt: '%',
        calc: (v) => (v.utilidadAct != null && v.ventasAct) ? v.utilidadAct / v.ventasAct : null },
      { clave: 'crecimiento', etiqueta: 'Crecimiento ventas', tip: 'Variación de ventas: (actual ÷ anterior) − 1. Mínimo: Bajo −10% · Medio 0% · Alto +5%. Peso 10.', peso: 10, dir: 'min', umbral: { Bajo: -0.10, Medio: 0.00, Alto: 0.05 }, fmt: '%',
        calc: (v) => (v.ventasAct != null && v.ventasAnt) ? (v.ventasAct / v.ventasAnt - 1) : null }
    ],
    // Análisis comercial/financiero (obligatorio para cerrar). El Business Case lo hereda.
    analisis: [
      { clave: 'destinoFondos', etiqueta: 'Destino fondos', tip: 'Uso previsto del financiamiento (capital de trabajo, activo fijo, compra de deuda, expansión). Obligatorio para cerrar el filtro.', tipo: 'selectReq', motivo: 'Falta el destino de los fondos', opciones: [
        { v: 'capital', label: 'Capital de trabajo' },
        { v: 'activo', label: 'Activo fijo productivo' },
        { v: 'deuda', label: 'Compra de deuda' },
        { v: 'expansion', label: 'Expansión selectiva' }
      ] },
      { clave: 'fuenteRepago', etiqueta: 'Fuente repago', tip: 'De dónde saldrá el pago de las cuotas (flujo operativo, CxC, contratos, mixto). Obligatorio.', tipo: 'selectReq', motivo: 'Falta la fuente de repago', opciones: [
        { v: 'operativo', label: 'Flujo operativo del negocio' },
        { v: 'cxc', label: 'Flujo + cuentas por cobrar' },
        { v: 'contratos', label: 'Ingresos por contratos/proyectos vigentes' },
        { v: 'mixto', label: 'Mixto (varias fuentes)' }
      ] },
      { clave: 'mitigantes', etiqueta: 'Mitigantes', tip: 'Mitigantes de riesgo del caso: aval, garantía adicional, LTV conservador, plazo reducido, DSCR alto. Obligatorio.', tipo: 'multiReq', motivo: 'Falta indicar mitigantes', opciones: [
        { v: 'aval', label: 'Aval personal' },
        { v: 'garantiaAdic', label: 'Garantía adicional' },
        { v: 'ltvConserv', label: 'LTV conservador' },
        { v: 'plazoRed', label: 'Plazo reducido' },
        { v: 'dscrAlto', label: 'Mayor cobertura de flujo (DSCR alto)' },
        { v: 'ninguno', label: 'Sin mitigantes especiales' }
      ] },
      { clave: 'motivoEvaluacion', etiqueta: 'Motivo evaluación', tip: 'Justificación breve de por qué el caso merece pasar a evaluación. Obligatorio; el Business Case lo hereda.', tipo: 'textoLibreReq', motivo: 'Falta el motivo de evaluación' }
    ],
    score: []
  },

  // ===== GARANTÍA (POR INMUEBLE; consolidación = MEJOR caso: basta 1 inmueble que pase) =====
  // Objetivo: (1) determinar si el inmueble está APTO/saneado en SUNARP (evidencia = documentos con link),
  // y (2) fijar un VALOR REFERENCIAL (m² × precio de zona) del que sale el LTV = monto ÷ valor.
  // Todos los links + las 3 casillas (Apto, Valor ref, LTV ok) son obligatorios para avanzar.
  garantia: {
    titulo: 'Filtro Garantía (por inmueble)',
    gates: [
      // Casilla 1: ¿Inmueble apto/saneado en SUNARP? (de la copia literal). No = mata el inmueble.
      { clave: 'apto', etiqueta: 'Apto SUNARP', tip: '¿El inmueble está apto/saneado según la copia literal de SUNARP? No = KO (esta garantía no va); Observado = subsanable.', tipo: 'select', oblig: true, opciones: [
        { v: 'si', label: 'Sí', resultado: 'ok' },
        { v: 'observado', label: 'Observado (subsanable)', resultado: 'observado', motivo: 'Inmueble observado: requiere subsanación/excepción' },
        { v: 'no', label: 'No', resultado: 'ko', motivo: 'Inmueble no apto/saneado: esta garantía no va' }
      ] },
      // Casilla 2: Valor referencial (número) + moneda. Obligatorio.
      { clave: 'valorRef', etiqueta: 'Valor referencial', tip: 'Valor referencial del inmueble (m² × precio de zona). De aquí sale el LTV = monto ÷ valor.', tipo: 'numReq', motivo: 'Falta el valor referencial del inmueble' },
      // Casilla 3: un ÚNICO link de Drive con todos los documentos (copia literal, HR/PU, DNI, recibo, fotos).
      { clave: 'linkDrive', etiqueta: 'Link Drive', tip: 'Un único link de Drive con todos los documentos: copia literal, HR/PU, DNI, recibo de servicios y fotos.', tipo: 'linkReq', motivo: 'Falta el link de Drive con los documentos del inmueble' }
    ],
    // LTV = monto solicitud ÷ valor referencial (misma moneda; TC 3.45 si difieren). Semáforo especial.
    ltv: { tc: 3.45, umbralObservado: 0.35 },
    score: []
  }
};

function evalGateB2B(g, valores, ticket) {
  const val = valores[g.clave];
  const vacio = (val === undefined || val === null || val === '');
  // Texto requerido condicionalmente (partida registral, N.º DNI, link Maps).
  if (g.tipo === 'textoReq') {
    if (g.requiereSi && valores[g.requiereSi.clave] === g.requiereSi.val) {
      return vacio ? { resultado: 'escalado', motivo: g.motivo } : { resultado: 'ok' };
    }
    return { resultado: 'ok' }; // no aplica si la condición no se cumple
  }
  // Número obligatorio (valor referencial): vacío o no positivo bloquea.
  if (g.tipo === 'numReq') {
    if (vacio) return { resultado: 'escalado', motivo: g.motivo, pendiente: true };
    const n = Number(val);
    return (!isFinite(n) || n <= 0) ? { resultado: 'escalado', motivo: g.motivo } : { resultado: 'ok' };
  }
  // Link de Drive obligatorio: vacío o sin http bloquea.
  if (g.tipo === 'linkReq') {
    if (vacio) return { resultado: 'escalado', motivo: g.motivo, pendiente: true };
    return /^https?:\/\//i.test(String(val)) ? { resultado: 'ok' } : { resultado: 'escalado', motivo: g.motivo };
  }
  if (g.tipo === 'numMinTicket') {
    if (vacio) return { resultado: 'ok', pendiente: true };
    const min = g.minTicket[ticket] != null ? g.minTicket[ticket] : g.minTicket.Bajo;
    return Number(val) < min ? { resultado: 'ko', motivo: g.motivo } : { resultado: 'ok' };
  }
  if (g.tipo === 'numMaxTicket') {
    if (vacio) return { resultado: 'ok', pendiente: true };
    const max = g.maxTicket[ticket] != null ? g.maxTicket[ticket] : g.maxTicket.Bajo;
    return Number(val) > max ? { resultado: 'ko', motivo: g.motivo } : { resultado: 'ok' };
  }
  // Número con límite por ticket que, al excederse, OBSERVA (Amarillo) en vez de matar.
  if (g.tipo === 'numObsTicket') {
    if (vacio) return { resultado: 'ok', pendiente: true };
    const max = g.maxTicket[ticket] != null ? g.maxTicket[ticket] : g.maxTicket.Bajo;
    return Number(val) > max ? { resultado: 'observado', motivo: g.motivo } : { resultado: 'ok' };
  }
  if (g.tipo === 'docTicket') {
    const req = g.requeridoTicket && g.requeridoTicket[ticket];
    if (!req) return { resultado: 'ok' };
    return (vacio || val !== 'si') ? { resultado: 'escalado', motivo: g.motivo } : { resultado: 'ok' };
  }
  if (vacio) {
    // Obligatorio sin responder bloquea el avance; opcional no.
    if (g.oblig) return { resultado: 'escalado', motivo: g.motivo || ('Falta ' + (g.etiqueta || g.clave)), pendiente: true };
    return { resultado: 'ok', pendiente: true };
  }
  const op = (g.opciones || []).find(o => o.v === val);
  return op ? { resultado: op.resultado || 'ok', motivo: op.motivo } : { resultado: 'ok' };
}
function evalScoreItemB2B(it, valores, ticket) {
  const val = valores[it.clave];
  const vacio = (val === undefined || val === null || val === '');
  if (it.tipo === 'select') {
    if (vacio) return null;
    const op = (it.opciones || []).find(o => o.v === val);
    return op ? op.frac * it.peso : 0;
  }
  if (it.tipo === 'limpiezaNum') {
    if (vacio) return null;
    const n = Number(val); if (!isFinite(n)) return null;
    return (n === 0 ? 1 : 0.4) * it.peso;
  }
  if (it.tipo === 'ventasTicket') {
    if (vacio) return null;
    const n = Number(val); if (!isFinite(n)) return null;
    const r = RANGOS_VENTAS_TICKET[ticket] || RANGOS_VENTAS_TICKET.Bajo;
    const frac = n < r[0] ? 0.3 : (n > r[1] ? 0.7 : 1);
    return frac * it.peso;
  }
  if (it.tipo === 'colchonTicket') {
    if (vacio) return null;
    const min = ANTIG_MIN_TICKET[ticket] != null ? ANTIG_MIN_TICKET[ticket] : ANTIG_MIN_TICKET.Bajo;
    const colchon = Number(val) - min; if (!isFinite(colchon)) return null;
    return Math.max(0, Math.min(1, colchon / 24)) * it.peso;
  }
  return null;
}
// Calcula el LTV = monto solicitud ÷ valor referencial. Convierte con TC si difieren monedas.
// Devuelve { ltv (0-1), obs (bool <umbral), moneda, valorSoles } o null si falta dato.
function calcularLTV(cat, valores, montoSolicitud) {
  const cfg = cat.ltv || { tc: 3.45, umbralObservado: 0.35 };
  const valorRef = Number(valores.valorRef);
  if (!isFinite(valorRef) || valorRef <= 0 || !montoSolicitud) return null;
  const monedaValor = valores.valorRefMoneda || 'soles'; // moneda en que se valorizó el inmueble
  // El monto de la solicitud está en soles. Llevamos el valor a soles para dividir.
  const valorSoles = monedaValor === 'dolares' ? valorRef * cfg.tc : valorRef;
  const ltv = montoSolicitud / valorSoles;
  return { ltv, obs: ltv > cfg.umbralObservado, moneda: monedaValor, valorSoles, umbral: cfg.umbralObservado }; // LTV alto = mayor exposicion -> observado
}


// el que no cumple (o falta insumo) NO suma y se marca como observación. Ninguno mata.
// Para DSCR calcula además la cuota máxima soportable (cruce de capacidad de pago).
// La cuota mensual se ESTIMA del monto sincerado (cuota fija 25% a 12m), no se digita.
function evaluarRatiosB2B(cat, valores, ticket, monto) {
  const v = {};
  (cat.insumos || []).forEach(i => { const n = Number(valores[i.clave]); v[i.clave] = isFinite(n) ? n : null; });
  const tasa = TASAS_REF_B2B.includes(Number(valores.tasaRef)) ? Number(valores.tasaRef) : CUOTA_REF.tasaAnual;
  const cuotaEst = cuotaEstimadaB2B(monto, tasa);
  v.cuotaMensual = cuotaEst; // inyectada: alimenta DSCR y carga financiera (con la tasa seleccionada)
  let ganado = 0, pesoTotal = 0;
  const detalle = [], observaciones = [];
  let capacidad = null;
  for (const r of (cat.ratios || [])) {
    pesoTotal += r.peso;
    const val = r.calc(v);
    const umbral = r.umbral[ticket] != null ? r.umbral[ticket] : r.umbral.Bajo;
    let cumple = null;
    if (val != null && isFinite(val)) {
      cumple = r.dir === 'min' ? (val >= umbral) : (val <= umbral);
      if (cumple) ganado += r.peso;
      else observaciones.push(r.etiqueta + ' fuera de umbral');
    } else {
      observaciones.push(r.etiqueta + ': falta dato');
    }
    detalle.push({ clave: r.clave, etiqueta: r.etiqueta, valor: val, umbral, dir: r.dir, fmt: r.fmt, cumple });
    // Cruce de capacidad: cuota máxima que soporta el flujo al DSCR mínimo del ticket.
    if (r.clave === 'dscr' && v.flujoMensual) capacidad = v.flujoMensual / umbral;
  }
  const puntaje = pesoTotal ? Math.round(ganado / pesoTotal * 100) : 0;
  return { puntaje, detalle, observaciones, capacidad, cuotaEst, tasa };
}

// Aplica una penalización directa al puntaje según su tipo. Devuelve puntos a RESTAR (>=0).
function penalB2B(p, valores) {
  const val = valores[p.clave];
  if (val === undefined || val === null || val === '') return 0;
  if (p.tipo === 'penalPorUnidad') { const n = Number(val); return isFinite(n) && n > 0 ? n * p.pena : 0; }
  if (p.tipo === 'penalPorPct') { const n = Number(val); return isFinite(n) && n > 0 ? n * p.pena : 0; }
  if (p.tipo === 'penalEscala') { const n = Number(val); if (!isFinite(n) || n <= 0) return 0; const t = p.tramos.find(t => n <= t.hasta); return t ? t.pena : 0; }
  if (p.tipo === 'penalMonto') { const n = Number(val); if (!isFinite(n) || n <= 0) return 0; const t = p.tramos.find(t => n <= t.hasta); return t ? t.pena : 0; }
  if (p.tipo === 'penalSelect') { return p.mapa[val] || 0; }
  return 0;
}

// Evalúa un filtro de dos capas. Devuelve { semaforo, puntaje, kos[], escalados[], observados[], ko, faltan }.
function evaluarFiltroDosCapas(cat, valores, ticket, monto) {
  valores = valores || {}; ticket = ticket || 'Bajo';
  const kos = [], escalados = [], observados = [];
  for (const g of (cat.gates || [])) {
    const r = evalGateB2B(g, valores, ticket);
    if (r.resultado === 'ko') kos.push(r.motivo || g.etiqueta);
    else if (r.resultado === 'escalado') escalados.push(r.motivo || g.etiqueta);
    else if (r.resultado === 'observado') observados.push(r.motivo || g.etiqueta);
  }
  if (kos.length) return { semaforo: 'Rojo', puntaje: 0, kos, escalados, observados, ko: true, faltan: 0 };
  let total = 0, pesoTotal = 0, faltan = 0;
  for (const it of (cat.score || [])) {
    pesoTotal += it.peso;
    const p = evalScoreItemB2B(it, valores, ticket);
    if (p == null) faltan++; else total += p;
  }
  // Sin capa de puntaje (filtro solo por gates): pasar los gates = 100. Con score: proporcional.
  let puntaje = pesoTotal ? Math.round(total / pesoTotal * 100) : 100;
  // Bloque de ratios financieros (finanzas): el puntaje sale de los ratios; no-cumplir = observación.
  let ratios = null;
  if (cat.ratios && cat.ratios.length) {
    ratios = evaluarRatiosB2B(cat, valores, ticket, monto);
    puntaje = ratios.puntaje;
    ratios.observaciones.forEach(o => observados.push(o));
  }
  // Bloque de análisis (finanzas): campos obligatorios; faltante = escalado (bloquea avance).
  for (const a of (cat.analisis || [])) {
    const v = valores[a.clave];
    const vacio = (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length));
    if (vacio) escalados.push(a.motivo || ('Falta ' + a.etiqueta));
  }
  // Penalizaciones directas (crédito v1.222): se restan del puntaje base.
  let penalTotal = 0;
  for (const p of (cat.penal || [])) penalTotal += penalB2B(p, valores);
  if (penalTotal) puntaje = Math.max(0, Math.round(puntaje - penalTotal));
  // Filtros de solo-gates (sin score ni ratios): cada observación descuenta 12 pts del 100,
  // con piso en 50 mientras no haya KO, para que el % refleje qué tan observado está.
  const soloGates = !(cat.score && cat.score.length) && !(cat.ratios && cat.ratios.length);
  if (soloGates && observados.length) {
    puntaje = Math.max(50, 100 - observados.length * 12);
  }
  let semaforo = puntaje >= 80 ? 'Verde' : (puntaje >= 50 ? 'Amarillo' : 'Rojo');
  if (escalados.length && semaforo === 'Verde') semaforo = 'Amarillo'; // excepción pendiente no cierra verde
  if (observados.length && semaforo !== 'Rojo') semaforo = 'Amarillo'; // observación no cierra verde
  else if (observados.length && semaforo === 'Rojo' && !kos.length) semaforo = 'Amarillo'; // observado (sin KO) = excepción, topa en Amarillo
  return { semaforo, puntaje, kos, escalados, observados, ko: false, faltan, ratios };
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
  // Auto-avance: crédito en Verde o Amarillo promueve a Garantía, SIEMPRE que se cumpla el mínimo de sujetos
  // según el RUC (20 → 2 sujetos: empresa + rep. legal; 10 → 1). Rojo o mínimo incompleto NO avanza.
  if (AVANZA_SEM(cons)) {
    const sol = db.prepare("SELECT ruc FROM b2b_solicitudes WHERE codigo=?").get(codigo);
    const nSuj = db.prepare('SELECT COUNT(*) n FROM b2b_credito_sujetos WHERE codigoSolicitud=?').get(codigo).n;
    if (nSuj >= minSujetosCredito(sol && sol.ruc)) autoAvanzarB2B(codigo, 'Filtro credito', cons, responsable);
  }
  return cons;
}

// Consolidado de garantía — regla oficial: MEJOR CASO. Basta con UN inmueble que pase todos
// los gates para respaldar la operación; el puntaje se ancla en el mejor inmueble.
function consolidadoGarantia(codigo) {
  const inms = db.prepare('SELECT semaforo FROM b2b_garantia_inmuebles WHERE codigoSolicitud=?').all(codigo);
  if (!inms.length) return null;
  let mejor = null;
  for (const i of inms) { if (i.semaforo && (mejor == null || ORDEN_SEM[i.semaforo] < ORDEN_SEM[mejor])) mejor = i.semaforo; }
  return mejor;
}
function refrescarConsolidadoGarantia(codigo, responsable) {
  const cons = consolidadoGarantia(codigo);
  const ahora = new Date().toISOString();
  db.prepare(`INSERT INTO b2b_filtros (codigoSolicitud, tipoFiltro, semaforo, responsable, actualizadoEn)
    VALUES (?, 'garantia', ?, ?, ?)
    ON CONFLICT(codigoSolicitud, tipoFiltro) DO UPDATE SET semaforo=excluded.semaforo, responsable=excluded.responsable, actualizadoEn=excluded.actualizadoEn`)
    .run(codigo, cons, responsable || null, ahora);
  if (cons) db.prepare('UPDATE b2b_solicitudes SET resultadoGarantia=? WHERE codigo=?').run(cons, codigo);
  if (AVANZA_SEM(cons)) autoAvanzarB2B(codigo, 'Filtro garantia', cons, responsable);
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
  const sol = db.prepare('SELECT ticket FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  const ticket = (sol && sol.ticket) || 'Bajo';
  const b = req.body || {};
  const ahora = new Date().toISOString();
  const valores = (b.checklist && typeof b.checklist === 'object') ? b.checklist : (su.checklist ? JSON.parse(su.checklist) : {});
  const ev = evaluarFiltroDosCapas(FILTROS_B2B.credito, valores, ticket); // dos capas, dependiente del ticket
  const motivos = JSON.stringify({ kos: ev.kos, escalados: ev.escalados });
  db.prepare('UPDATE b2b_credito_sujetos SET nombre=?, documento=?, checklist=?, semaforo=?, puntaje=?, motivos=?, observaciones=?, actualizadoEn=? WHERE id=?')
    .run(b.nombre != null ? b.nombre : su.nombre, b.documento != null ? b.documento : su.documento,
      JSON.stringify(valores), ev.semaforo, ev.puntaje, motivos,
      b.observaciones != null ? b.observaciones : su.observaciones, ahora, su.id);
  const cons = refrescarConsolidadoCredito(req.params.codigo, req.user.nombre);
  auditar(req, 'b2b_credito_guardar_sujeto', req.params.codigo, su.tipoSujeto + (ev.semaforo ? ' · ' + ev.semaforo : ''));
  res.json({ ok: true, consolidado: cons, semaforo: ev.semaforo, puntaje: ev.puntaje, motivos: { kos: ev.kos, escalados: ev.escalados } });
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

// ===== BITÁCORA DE GESTIONES B2B (trazabilidad, estilo B2C) =====
app.get('/api/b2b/solicitudes/:codigo/gestiones', soloB2B, (req, res) => {
  const filas = db.prepare('SELECT * FROM b2b_gestiones WHERE codigoSolicitud=? ORDER BY fecha DESC, id DESC').all(req.params.codigo);
  res.json({ gestiones: filas });
});
app.post('/api/b2b/solicitudes/:codigo/gestiones', soloB2B, (req, res) => {
  const s = db.prepare('SELECT * FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const b = req.body || {};
  const proximaAccion = (b.proximaAccion || '').trim();
  const fechaProxAccion = (b.fechaProxAccion || '').trim();
  // Trazabilidad: SIEMPRE exige próxima acción con fecha (como en B2C).
  if (!(b.resultado || '').trim()) return res.status(400).json({ error: 'Registra el resultado de la gestión' });
  if (!proximaAccion) return res.status(400).json({ error: 'Define la próxima acción' });
  if (!fechaProxAccion) return res.status(400).json({ error: 'Define la fecha de la próxima acción' });
  const ahora = new Date().toISOString();
  const etapaActual = etapaKanbanB2B(s); // etapa donde ocurre la gestión (automática)
  db.prepare(`INSERT INTO b2b_gestiones (codigoSolicitud, fecha, responsable, etapa, canal, resultado, comentario, proximaAccion, fechaProxAccion)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(s.codigo, ahora, req.user.nombre, etapaActual, b.canal || null, b.resultado || null,
      (b.comentario || '').trim() || null, proximaAccion, fechaProxAccion);
  auditar(req, 'b2b_gestion', s.codigo, (b.resultado || 'gestión') + ' · próx: ' + proximaAccion);
  const filas = db.prepare('SELECT * FROM b2b_gestiones WHERE codigoSolicitud=? ORDER BY fecha DESC, id DESC').all(s.codigo);
  res.json({ ok: true, gestiones: filas });
});

// Guarda el link de Google Drive con los archivos de la etapa de crédito.
app.put('/api/b2b/solicitudes/:codigo/credito/link', soloB2B, (req, res) => {
  const s = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const link = (req.body && req.body.link != null) ? String(req.body.link).trim() : '';
  if (link && !/^https?:\/\//i.test(link)) return res.status(400).json({ error: 'El link debe empezar con http:// o https://' });
  db.prepare('UPDATE b2b_solicitudes SET creditoLinkDrive=? WHERE codigo=?').run(link || null, req.params.codigo);
  auditar(req, 'b2b_credito_link', req.params.codigo, link ? 'link actualizado' : 'link borrado');
  res.json({ ok: true, link: link || null });
});

// ===== GARANTÍA: colección de inmuebles (dos capas, consolidación mejor-caso) =====
app.post('/api/b2b/solicitudes/:codigo/garantia/inmueble', soloB2B, (req, res) => {
  const s = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const b = req.body || {};
  const ahora = new Date().toISOString();
  const n = db.prepare('SELECT COUNT(*) c FROM b2b_garantia_inmuebles WHERE codigoSolicitud=?').get(req.params.codigo).c;
  const r = db.prepare('INSERT INTO b2b_garantia_inmuebles (codigoSolicitud, alias, distrito, tipoInmueble, checklist, orden, actualizadoEn) VALUES (?,?,?,?,?,?,?)')
    .run(req.params.codigo, b.alias || ('Inmueble ' + (n + 1)), b.distrito || null, b.tipoInmueble || null, '{}', n, ahora);
  auditar(req, 'b2b_garantia_agregar_inmueble', req.params.codigo, b.alias || '');
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.put('/api/b2b/solicitudes/:codigo/garantia/inmueble/:id', soloB2B, (req, res) => {
  const inm = db.prepare('SELECT * FROM b2b_garantia_inmuebles WHERE id=? AND codigoSolicitud=?').get(req.params.id, req.params.codigo);
  if (!inm) return res.status(404).json({ error: 'Inmueble no encontrado' });
  const sol = db.prepare('SELECT ticket, montoSolicitado FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  const ticket = (sol && sol.ticket) || 'Bajo';
  const b = req.body || {};
  const ahora = new Date().toISOString();
  const valores = (b.checklist && typeof b.checklist === 'object') ? b.checklist : (inm.checklist ? JSON.parse(inm.checklist) : {});
  const ev = evaluarFiltroDosCapas(FILTROS_B2B.garantia, valores, ticket);
  // LTV = monto ÷ valor referencial. LTV < umbral (35%) => observación (no mata).
  const ltvInfo = calcularLTV(FILTROS_B2B.garantia, valores, sol && sol.montoSolicitado);
  if (ltvInfo && ltvInfo.obs && ev.semaforo === 'Verde') ev.semaforo = 'Amarillo';
  const motivos = JSON.stringify({ kos: ev.kos, escalados: ev.escalados });
  db.prepare('UPDATE b2b_garantia_inmuebles SET alias=?, distrito=?, tipoInmueble=?, checklist=?, semaforo=?, puntaje=?, motivos=?, actualizadoEn=? WHERE id=?')
    .run(b.alias != null ? b.alias : inm.alias, b.distrito != null ? b.distrito : inm.distrito,
      valores.tipoPermitido || inm.tipoInmueble, JSON.stringify(valores), ev.semaforo, ev.puntaje, motivos, ahora, inm.id);
  const cons = refrescarConsolidadoGarantia(req.params.codigo, req.user.nombre);
  auditar(req, 'b2b_garantia_guardar_inmueble', req.params.codigo, (b.alias || inm.alias || '') + (ev.semaforo ? ' · ' + ev.semaforo : ''));
  res.json({ ok: true, consolidado: cons, semaforo: ev.semaforo, puntaje: ev.puntaje, motivos: { kos: ev.kos, escalados: ev.escalados }, ltv: ltvInfo });
});
app.delete('/api/b2b/solicitudes/:codigo/garantia/inmueble/:id', soloB2B, (req, res) => {
  const inm = db.prepare('SELECT * FROM b2b_garantia_inmuebles WHERE id=? AND codigoSolicitud=?').get(req.params.id, req.params.codigo);
  if (!inm) return res.status(404).json({ error: 'Inmueble no encontrado' });
  db.prepare('DELETE FROM b2b_garantia_inmuebles WHERE id=?').run(inm.id);
  const cons = refrescarConsolidadoGarantia(req.params.codigo, req.user.nombre);
  auditar(req, 'b2b_garantia_eliminar_inmueble', req.params.codigo, inm.alias || '');
  res.json({ ok: true, consolidado: cons });
});
// Devuelve todo lo necesario para la ficha de una solicitud.
app.get('/api/b2b/solicitudes/:codigo/ficha', soloB2B, (req, res) => {
  const s = db.prepare('SELECT * FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const garantia = db.prepare('SELECT * FROM b2b_garantia WHERE codigoSolicitud=?').get(s.codigo) || null;
  const documentos = db.prepare('SELECT id, etapa, tipoDoc, nombreArchivo, mime, tamano, subidoPor, subidoEn, sujetoId, enlace FROM b2b_documentos WHERE codigoSolicitud=? ORDER BY id DESC').all(s.codigo);
  const filtrosRows = db.prepare('SELECT tipoFiltro, checklist, semaforo, puntaje, motivos, observaciones, responsable, actualizadoEn FROM b2b_filtros WHERE codigoSolicitud=?').all(s.codigo);
  const filtros = {};
  filtrosRows.forEach(f => { filtros[f.tipoFiltro] = { checklist: f.checklist ? JSON.parse(f.checklist) : null, semaforo: f.semaforo, puntaje: f.puntaje, motivos: f.motivos ? JSON.parse(f.motivos) : null, observaciones: f.observaciones, responsable: f.responsable, actualizadoEn: f.actualizadoEn }; });
  // Sujetos de crédito (empresa / representantes / vinculadas). Auto-crea la empresa si no existe.
  let sujetos = db.prepare('SELECT * FROM b2b_credito_sujetos WHERE codigoSolicitud=? ORDER BY CASE tipoSujeto WHEN \'empresa\' THEN 0 WHEN \'representante\' THEN 1 ELSE 2 END, orden, id').all(s.codigo);
  if (!sujetos.some(x => x.tipoSujeto === 'empresa')) {
    db.prepare('INSERT INTO b2b_credito_sujetos (codigoSolicitud, tipoSujeto, nombre, documento, orden, actualizadoEn) VALUES (?,?,?,?,?,?)')
      .run(s.codigo, 'empresa', s.razonSocial || null, s.ruc || null, 0, new Date().toISOString());
    sujetos = db.prepare('SELECT * FROM b2b_credito_sujetos WHERE codigoSolicitud=? ORDER BY CASE tipoSujeto WHEN \'empresa\' THEN 0 WHEN \'representante\' THEN 1 ELSE 2 END, orden, id').all(s.codigo);
  }
  sujetos = sujetos.map(su => ({ ...su, checklist: su.checklist ? JSON.parse(su.checklist) : {} }));
  const inmuebles = db.prepare('SELECT * FROM b2b_garantia_inmuebles WHERE codigoSolicitud=? ORDER BY orden, id').all(s.codigo)
    .map(i => ({ ...i, checklist: i.checklist ? JSON.parse(i.checklist) : {}, motivos: i.motivos ? JSON.parse(i.motivos) : null }));
  const semFicha = { credito: filtros.credito && filtros.credito.semaforo, garantia: filtros.garantia && filtros.garantia.semaforo, finanzas: filtros.finanzas && filtros.finanzas.semaforo };
  const colFicha = etapaKanbanB2B(s);
  const fechaEtapaF = sellarFechaEtapa(s, colFicha);
  res.json({ solicitud: s, garantia, documentos, filtros, creditoSujetos: sujetos, garantiaInmuebles: inmuebles, etapaKanban: colFicha, puntaje: puntajeB2B(s, semFicha), sla: slaEtapaB2B(colFicha, fechaEtapaF),
    accionesEtapa: ACCIONES_ETAPA_B2B[colFicha] || [], accionesPorEtapa: ACCIONES_ETAPA_B2B, resultadosGestion: RESULTADOS_GESTION_B2B, canalesGestion: CANALES_GESTION_B2B });
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
// Catálogo de criterios con métricas (para que el frontend renderice los inputs y calcule el color).
app.get('/api/b2b/criterios', soloB2B, (req, res) => {
  res.json({ criterios: CRITERIOS_B2B });
});

// Catálogo de filtros de dos capas (gates + puntaje) — recalibración spec oficial.
app.get('/api/b2b/filtros-catalogo', soloB2B, (req, res) => {
  res.json({ filtros: FILTROS_B2B });
});

app.put('/api/b2b/solicitudes/:codigo/filtro/:tipo', soloB2B, (req, res) => {
  const s = db.prepare('SELECT codigo, ticket, montoSolicitado FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const tipo = req.params.tipo;
  if (!['sunat', 'credito', 'garantia', 'finanzas'].includes(tipo)) return res.status(400).json({ error: 'Filtro inválido' });
  const b = req.body || {};
  const valores = (b.checklist && typeof b.checklist === 'object') ? b.checklist : {};
  const checklist = JSON.stringify(valores);
  let semaforo, puntaje = null, motivos = null, ratios = null;
  if (FILTROS_B2B[tipo]) {                       // motor de dos capas (recalibrado)
    const ev = evaluarFiltroDosCapas(FILTROS_B2B[tipo], valores, s.ticket || 'Bajo', s.montoSolicitado);
    semaforo = ev.semaforo; puntaje = ev.puntaje; ratios = ev.ratios;
    motivos = JSON.stringify({ kos: ev.kos, escalados: ev.escalados });
  } else {                                        // motor viejo (garantia/finanzas hasta su tanda)
    semaforo = evaluarChecklistB2B(tipo, valores).semaforo;
  }
  const ahora = new Date().toISOString();
  db.prepare(`INSERT INTO b2b_filtros (codigoSolicitud, tipoFiltro, checklist, semaforo, puntaje, motivos, observaciones, responsable, actualizadoEn)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(codigoSolicitud, tipoFiltro) DO UPDATE SET checklist=excluded.checklist, semaforo=excluded.semaforo, puntaje=excluded.puntaje, motivos=excluded.motivos, observaciones=excluded.observaciones, responsable=excluded.responsable, actualizadoEn=excluded.actualizadoEn`)
    .run(s.codigo, tipo, checklist, semaforo, puntaje, motivos, b.observaciones || null, req.user.nombre, ahora);
  // Refleja el semáforo en la solicitud (columna resultado*).
  const colRes = { credito: 'resultadoCredito', garantia: 'resultadoGarantia', finanzas: 'resultadoFinanzas' }[tipo];
  if (colRes && semaforo) db.prepare('UPDATE b2b_solicitudes SET ' + colRes + '=? WHERE codigo=?').run(semaforo, s.codigo);
  // Avance automático SOLO en "Guardar" completo (no en "Guardar avance"): Verde/Amarillo avanza, Rojo no.
  // finanzas es checklist directo → avanza aquí. (credito/garantia avanzan por sus consolidados de sujetos/inmuebles.)
  let avanzo = false;
  const esBorrador = !!(b.borrador || b.avance);
  if (!esBorrador && tipo === 'finanzas' && AVANZA_SEM(semaforo)) {
    avanzo = autoAvanzarB2B(s.codigo, 'Filtro finanzas', semaforo, req.user.nombre);
  }
  auditar(req, 'b2b_guardar_filtro', s.codigo, tipo + (semaforo ? ' · ' + semaforo : '') + (avanzo ? ' → avanzó' : ''));
  res.json({ ok: true, semaforo, puntaje, motivos: motivos ? JSON.parse(motivos) : null, ratios, avanzo });
});

// Guarda un comentario simple de crédito o garantía, con autor y fecha.
app.post('/api/b2b/solicitudes/:codigo/comentario', soloB2B, (req, res) => {
  const s = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const b = req.body || {};
  const tipo = b.tipo === 'garantia' ? 'garantia' : 'credito';
  const texto = String(b.texto || '').trim().slice(0, 4000);
  const meta = JSON.stringify({ por: req.user.nombre, en: new Date().toISOString() });
  const colT = tipo === 'garantia' ? 'garantiaComentario' : 'creditoComentario';
  const colM = tipo === 'garantia' ? 'garantiaComentarioMeta' : 'creditoComentarioMeta';
  db.prepare('UPDATE b2b_solicitudes SET ' + colT + '=?, ' + colM + '=? WHERE codigo=?').run(texto || null, texto ? meta : null, s.codigo);
  auditar(req, 'b2b_comentario_' + tipo, s.codigo, texto ? texto.slice(0, 60) : '(vacío)');
  res.json({ ok: true, meta: texto ? JSON.parse(meta) : null });
});

// Guarda un documento como LINK de Drive (persiste al redeploy; no usa el filesystem efímero).
app.post('/api/b2b/solicitudes/:codigo/documentos/enlace', soloB2B, (req, res) => {
  const s = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const b = req.body || {};
  const url = (b.url || '').toString().trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'El link debe empezar con http:// o https://' });
  const ahora = new Date().toISOString();
  const r = db.prepare(`INSERT INTO b2b_documentos (codigoSolicitud, etapa, tipoDoc, nombreArchivo, rutaArchivo, mime, tamano, subidoPor, subidoEn, sujetoId, enlace)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(s.codigo, b.etapa || 'garantia', b.tipoDoc || 'Documento', b.nombre || 'Link Drive', null, 'link', null, req.user.nombre, ahora,
      b.sujetoId != null ? Number(b.sujetoId) : null, url);
  auditar(req, 'b2b_doc_enlace', s.codigo, (b.tipoDoc || 'Documento'));
  res.json({ ok: true, id: r.lastInsertRowid });
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
  garantia: { Verde: 'Reunion comercial', Amarillo: 'Amarillo/nurture', Rojo: 'No elegible' },
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

// ===== Tablero (kanban) B2B =====
// Columnas secuenciales (izq→der). "Desestimado" es un filtro aparte, no una columna.
const COLUMNAS_KANBAN_B2B = ['Solicitud', 'Filtro credito', 'Filtro garantia', 'Reunion comercial', 'Filtro finanzas', 'Business case'];

// Deriva la columna del tablero desde señales que ya existen (sin columna nueva ni migración).
// 'Solicitud' fusiona el intake y el triaje SUNAT: aquí caen las que tienen observación
// (RUC/SUNAT/teléfono). Si SUNAT sale OK, pasa directo a 'Filtro credito'.
function etapaKanbanB2B(s) {
  if (s.archivado) return 'Desestimado';
  if (s.estado === 'No elegible') return 'Desestimado';
  if (['Expediente', 'Traspasado B2B', 'Reunion agendada'].includes(s.estado)) return 'Business case';
  if (s.estado === 'Filtro finanzas') return 'Filtro finanzas';
  if (s.estado === 'Reunion comercial') return 'Reunion comercial';
  if (s.estado === 'Filtro garantia') return 'Filtro garantia';
  if (s.estado === 'Filtro credito' || s.estado === 'Apto credito') return 'Filtro credito'; // forzado o apto
  if (s.estado === 'Amarillo/nurture') return 'Filtro credito'; // en revisión, sigue en crédito
  // 'Nuevo' u otros: triaje por SUNAT. OK → crédito; cualquier otra cosa (error/pendiente) se queda en Solicitud.
  // Sin inmueble declarado: no avanza; queda en Solicitud con observacion (garantia inviable).
  if (String(s.tieneInmueble || '').toLowerCase() === 'no') return 'Solicitud';
  if (s.sunatEstado === 'ok') return 'Filtro credito';
  return 'Solicitud'; // recién llegado o con observación (RUC/SUNAT/teléfono): se etiqueta, no se auto-descarta
}

// Etiquetas de observación de una card en la columna 'Solicitud' (para triaje visual).
// 'falta_numero' es marca para descarte MANUAL (no saca la card del tablero sola).
function observacionesB2B(s) {
  const obs = [];
  const ruc = s.ruc ? String(s.ruc).trim() : '';
  if (!ruc) obs.push({ tipo: 'falta_ruc', label: 'Validar RUC' });
  else if (!/^(10|15|17|20)\d{9}$/.test(ruc)) obs.push({ tipo: 'ruc_malo', label: 'Validar RUC' });
  else if (s.sunatEstado === 'error') obs.push({ tipo: 'ruc_error', label: 'Validar RUC' });
  if (!s.telefono || !String(s.telefono).trim()) obs.push({ tipo: 'falta_numero', label: 'Falta número' });
  if (String(s.tieneInmueble || '').toLowerCase() === 'no') obs.push({ tipo: 'sin_inmueble', label: 'Sin inmueble (observado)' });
  return obs;
}

// Semáforos {credito,garantia,finanzas} por código, en un solo query.
function semaforosB2BPorCodigo(codigos) {
  const map = {};
  if (!codigos.length) return map;
  const ph = codigos.map(() => '?').join(',');
  db.prepare("SELECT codigoSolicitud, tipoFiltro, semaforo FROM b2b_filtros WHERE codigoSolicitud IN (" + ph + ")").all(...codigos)
    .forEach(f => { (map[f.codigoSolicitud] = map[f.codigoSolicitud] || {})[f.tipoFiltro] = f.semaforo; });
  return map;
}

// ===== Puntaje = probabilidad de cierre (se refina por el filtro más profundo completado) =====
function bandaPuntaje(prob) {
  if (prob >= 60) return { banda: 'Caliente', emoji: '🔥', prioridad: 'P1' };
  if (prob >= 35) return { banda: 'Tibio', emoji: '🟠', prioridad: 'P2' };
  if (prob >= 10) return { banda: 'Frío', emoji: '🔵', prioridad: 'P3' };
  return { banda: 'Nuevo', emoji: '⚪', prioridad: 'P4' };
}
// sem = { credito, garantia, finanzas } (semáforos consolidados). Rojo en cualquiera → descarte.
function puntajeB2B(s, sem) {
  sem = sem || {};
  if (s.archivado || s.estado === 'No elegible' || sem.credito === 'Rojo' || sem.garantia === 'Rojo' || sem.finanzas === 'Rojo')
    return { prob: 0, banda: 'Descartado', emoji: '⚫', prioridad: '—' };
  let prob;
  if (['Expediente', 'Traspasado B2B', 'Reunion agendada'].includes(s.estado)) prob = 90;
  else if (sem.finanzas) prob = sem.finanzas === 'Verde' ? 82 : 62;
  else if (sem.garantia) prob = sem.garantia === 'Verde' ? 65 : 45;
  else if (sem.credito) prob = sem.credito === 'Verde' ? 40 : 25;
  else if (s.sunatEstado === 'ok') prob = 12;
  else prob = 5;
  return Object.assign({ prob }, bandaPuntaje(prob));
}

// Próximas acciones sugeridas por etapa (para el modal de gestión, paso 2).
const ACCIONES_ETAPA_B2B = {
  'Solicitud': ['Validar RUC en SUNAT', 'Contactar al cliente', 'Reintentar contacto', 'Confirmar monto y destino', 'Solicitar datos faltantes'],
  'Filtro credito': ['Consultar centrales de riesgo', 'Pedir sustento de deudas', 'Solicitar aclaración de manchas', 'Evaluar representantes y vinculadas', 'Escalar a jefatura'],
  'Filtro garantia': ['Solicitar copia literal / partida', 'Pedir datos y fotos del inmueble', 'Estimar valor referencial', 'Verificar cargas y gravámenes', 'Coordinar tasación'],
  'Reunion comercial': ['Agendar reunión comercial', 'Confirmar asistencia', 'Reagendar reunión', 'Registrar reunión efectiva', 'Cliente no asistió — reintentar'],
  'Filtro finanzas': ['Solicitar EEFF / DJ anual (push)', 'Solicitar flujo proyectado', 'Recordar entrega de información', 'Analizar ratios y sustento', 'Levantar observaciones financieras'],
  'Business case': ['Consolidar expediente', 'Redactar informe ejecutivo', 'Enviar a Créditos', 'Coordinar levantamiento de observaciones', 'Agendar presentación / comité']
};
// Resultados posibles de una gestión (paso 1 del modal).
const RESULTADOS_GESTION_B2B = ['Contactado', 'No contestó', 'Volver a llamar', 'Pidió información', 'Envió documentos', 'No interesado'];
const CANALES_GESTION_B2B = ['Llamada', 'WhatsApp', 'Correo'];

// ===== Deadline por etapa + próxima acción =====
// SLA máximo en HORAS CORRIDAS que un lead debe permanecer en cada etapa (desde que entró a ella).
const ETAPA_SLA_DEFAULT = {
  'Solicitud': { horas: 24, accion: 'Validar SUNAT / contactar' },
  'Filtro credito': { horas: 6, accion: 'Evaluar crédito en centrales' },
  'Filtro garantia': { horas: 72, accion: 'Reunir docs + valor referencial' },
  'Reunion comercial': { horas: 48, accion: 'Agendar / realizar reunión comercial' },
  'Filtro finanzas': { horas: 72, accion: 'Push de información financiera' },
  'Business case': { horas: 24, accion: 'Armar y enviar a Créditos' }
};
// SLA efectivo por etapa: default + override guardado en app_config (clave sla_etapas).
function getEtapaSLA() {
  const out = JSON.parse(JSON.stringify(ETAPA_SLA_DEFAULT));
  try {
    const r = db.prepare("SELECT valor FROM app_config WHERE clave='sla_etapas'").get();
    if (r && r.valor) {
      const ov = JSON.parse(r.valor);
      for (const k in out) if (ov[k] && Number(ov[k].horas) > 0) out[k].horas = Number(ov[k].horas);
    }
  } catch (e) { }
  return out;
}
function slaEtapaB2B(col, fechaEtapa) {
  const cfg = getEtapaSLA()[col];
  if (!cfg) return { accion: null, horas: null, usadas: null, estado: 'ok', vencido: false, horasRestantes: null };
  if (!fechaEtapa) return { accion: cfg.accion, horas: cfg.horas, usadas: 0, estado: 'ok', vencido: false, horasRestantes: cfg.horas };
  const usadas = Math.max(0, Math.floor((Date.now() - new Date(fechaEtapa).getTime()) / 3600000));
  let estado = 'ok';
  if (usadas >= cfg.horas) estado = 'vencido';
  else if (usadas >= cfg.horas * 0.75) estado = 'porvencer'; // último 25% del plazo
  return {
    accion: cfg.accion, horas: cfg.horas, usadas,
    estado, vencido: estado === 'vencido',
    horasRestantes: cfg.horas - usadas
  };
}
// Sella el momento de entrada a la etapa cuando la columna derivada cambia. Devuelve la fecha vigente.
function sellarFechaEtapa(f, col) {
  if (col === 'Desestimado') return f.fechaEtapa || null;
  if (f.fechaEtapaCol === col) return f.fechaEtapa || null;
  const nueva = f.fechaEtapaCol ? new Date().toISOString() : (f.fechaIngreso || new Date().toISOString());
  db.prepare('UPDATE b2b_solicitudes SET fechaEtapa=?, fechaEtapaCol=? WHERE codigo=?').run(nueva, col, f.codigo);
  f.fechaEtapa = nueva; f.fechaEtapaCol = col;
  return nueva;
}

// GAMIFICACIÓN B2B: progreso de gestiones del día vs meta (barra de productividad).
// GET /api/b2b/gamificacion  (meta configurable en app_config 'b2b_meta_gestiones_dia', default 10)
app.get('/api/b2b/gamificacion', soloB2B, (req, res) => {
  try {
    const esJefe = ['admin', 'jefe_b2b', 'jefe_creditos', 'jefa'].includes(req.user.rol);
    const nombre = esJefe ? (req.query.asesor || null) : req.user.nombre;
    let meta = 10;
    try { const r = db.prepare("SELECT valor FROM app_config WHERE clave='b2b_meta_gestiones_dia'").get(); if (r && +r.valor > 0) meta = +r.valor; } catch (e) {}
    const hoyP = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const ini = new Date(new Date(hoyP + 'T00:00:00Z').getTime() + 5 * 3600000).toISOString();
    const fin = new Date(new Date(hoyP + 'T00:00:00Z').getTime() + 5 * 3600000 + 86400000).toISOString();
    // Gestiones y leads distintos trabajados hoy
    const gest = nombre
      ? db.prepare("SELECT COUNT(*) n, COUNT(DISTINCT codigoSolicitud) leads FROM b2b_gestiones WHERE fecha>=? AND fecha<? AND responsable=?").get(ini, fin, nombre)
      : db.prepare("SELECT COUNT(*) n, COUNT(DISTINCT codigoSolicitud) leads FROM b2b_gestiones WHERE fecha>=? AND fecha<?").get(ini, fin);
    const hechas = gest.leads || 0; // contamos leads trabajados (no gestiones repetidas)
    const pct = meta > 0 ? Math.min(100, Math.round((hechas / meta) * 100)) : 0;
    const faltan = Math.max(0, meta - hechas);
    res.json({ asesor: nombre, meta, hechas, gestiones: gest.n || 0, pct, faltan, cumplida: hechas >= meta });
  } catch (e) { console.error('[b2b/gami]', e.message); res.status(500).json({ error: e.message }); }
});

// CENTRO DE COMANDO B2B: resumen de la jornada del asesor (tareas críticas, carga, progreso).
// GET /api/b2b/comando?asesor=
// CENTRO DE OPERACIONES B2B (v1.362): payload completo del dashboard de jefatura.
// KPIs con vs-ayer, regla 3x3 de contactabilidad, alertas inteligentes por reglas,
// salud del pipeline 0-100, productividad con Índice de Gestión, cuellos de botella,
// embudo acumulado y agenda. Cálculo en dashboard-b2b.js.
// GET /api/b2b/dashboard              -> payload completo
// GET /api/b2b/dashboard?asesor=XXX   -> filtrado a la cartera de un ejecutivo
// GET /api/b2b/dashboard?lead=CODIGO  -> solo el estado 3x3 de un lead (debug/compuerta)
app.get('/api/b2b/dashboard', soloB2B, (req, res) => {
  if (!req.user || !['admin', 'jefe_b2b', 'jefe_creditos', 'jefa'].includes(req.user.rol)) {
    return res.status(403).json({ error: 'Solo jefatura' });
  }
  try {
    if (req.query.lead) {
      const e = dashB2B.estado3x3PorCodigo(String(req.query.lead).trim());
      if (!e) return res.status(404).json({ error: 'lead no encontrado' });
      return res.json({ codigo: req.query.lead, estado3x3: e });
    }
    res.json(dashB2B.construirDashboard({ asesor: req.query.asesor, desde: req.query.desde, hasta: req.query.hasta, fecha: req.query.fecha }));
  } catch (e) {
    console.error('[b2b/dashboard]', e.stack || e.message);
    res.status(500).json({ error: e.message });
  }
});

// LEADS TRABAJADOS del periodo (v1.366): para el modal al hacer clic en "Gestión del día".
// GET /api/b2b/dashboard/trabajados?desde&hasta&asesor
app.get('/api/b2b/dashboard/trabajados', soloB2B, (req, res) => {
  if (!req.user || !['admin', 'jefe_b2b', 'jefe_creditos', 'jefa'].includes(req.user.rol)) {
    return res.status(403).json({ error: 'Solo jefatura' });
  }
  try { res.json(dashB2B.leadsTrabajados({ desde: req.query.desde, hasta: req.query.hasta, asesor: req.query.asesor })); }
  catch (e) { console.error('[b2b/trabajados]', e.message); res.status(500).json({ error: e.message }); }
});

// Funcionarios B2B (para el modal de asignar metas).
app.get('/api/b2b/funcionarios', soloB2B, (req, res) => {
  try { res.json({ funcionarios: dashB2B.funcionariosB2B() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// META MENSUAL B2B (v1.364): la fija jefatura desde el Centro de Operaciones.
// POST /api/b2b/dashboard/meta { monto }  -> guarda en app_config 'b2b_meta_mes'
app.post('/api/b2b/dashboard/meta', soloB2B, (req, res) => {
  // Solo Diego Cubas (o admin) fija las metas. { monto, funcionario? }
  // Sin 'funcionario' → meta GLOBAL del equipo. Con 'funcionario' → meta INDIVIDUAL.
  const esDiego = req.user && (req.user.rol === 'admin' || /dcubas@tasatop\.com/i.test(req.user.usuario || '') || /diego cubas/i.test(req.user.nombre || ''));
  if (!esDiego) return res.status(403).json({ error: 'Solo Diego Cubas puede asignar metas' });
  const monto = Number(req.body && req.body.monto);
  if (!isFinite(monto) || monto < 0) return res.status(400).json({ error: 'Monto inválido' });
  const funcionario = req.body && req.body.funcionario ? String(req.body.funcionario).trim() : '';
  if (funcionario) {
    let ind = {};
    try { const r = db.prepare("SELECT valor FROM app_config WHERE clave='b2b_meta_mes_ind'").get(); if (r && r.valor) ind = JSON.parse(r.valor) || {}; } catch (e) {}
    ind[funcionario] = monto;
    db.prepare("INSERT INTO app_config (clave,valor) VALUES ('b2b_meta_mes_ind',?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor").run(JSON.stringify(ind));
    auditar(req, 'b2b_meta_mes_ind', funcionario, 'S/ ' + monto.toLocaleString('es-PE'));
    return res.json({ ok: true, funcionario, monto });
  }
  db.prepare("INSERT INTO app_config (clave,valor) VALUES ('b2b_meta_mes',?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor").run(String(monto));
  auditar(req, 'b2b_meta_mes', 'config', 'S/ ' + monto.toLocaleString('es-PE'));
  res.json({ ok: true, monto });
});

// PANEL IA del Centro de Operaciones (v1.363): análisis con Claude Haiku sobre el
// payload YA CALCULADO (nunca inventa cifras). Caché de 10 min para no gastar por refresco.
// GET /api/b2b/dashboard/ia            -> { disponible, texto, generado, cache }
// GET /api/b2b/dashboard/ia?fresco=1   -> fuerza regenerar
let _iaOpsCache = { texto: null, ts: 0 };
app.get('/api/b2b/dashboard/ia', soloB2B, async (req, res) => {
  if (!req.user || !['admin', 'jefe_b2b', 'jefe_creditos', 'jefa'].includes(req.user.rol)) {
    return res.status(403).json({ error: 'Solo jefatura' });
  }
  try {
    if (!iaReportes.configurado()) return res.json({ disponible: false, error: 'Falta ANTHROPIC_API_KEY en Railway' });
    const fresco = req.query.fresco === '1';
    if (!fresco && _iaOpsCache.texto && (Date.now() - _iaOpsCache.ts) < 10 * 60000) {
      return res.json({ disponible: true, texto: _iaOpsCache.texto, generado: new Date(_iaOpsCache.ts).toISOString(), cache: true });
    }
    const D = dashB2B.construirDashboard({});
    const texto = await iaReportes.analizarOperacionB2B(D);
    if (!texto) return res.json({ disponible: false, error: 'La IA no respondió (timeout o error de API); intenta de nuevo' });
    _iaOpsCache = { texto, ts: Date.now() };
    res.json({ disponible: true, texto, generado: new Date().toISOString(), cache: false });
  } catch (e) {
    console.error('[b2b/dashboard/ia]', e.stack || e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/b2b/comando', soloB2B, (req, res) => {
  try {
    const esJefe = ['admin', 'jefe_b2b', 'jefe_creditos', 'jefa'].includes(req.user.rol);
    let filas = db.prepare("SELECT * FROM b2b_solicitudes WHERE COALESCE(archivado,0)=0 AND estado <> 'No elegible'").all();
    filas = filtrarPorAlcanceB2B(req.user, filas);
    const asesor = (req.query.asesor || '').trim();
    const nombreAsesor = !esJefe ? req.user.nombre : (asesor || null);
    if (!esJefe) filas = filas.filter(f => f.responsableActual === req.user.nombre);
    else if (asesor) filas = filas.filter(f => f.responsableActual === asesor);

    const montoMax = Math.max(1, ...filas.map(f => Number(f.montoSolicitado || 0) || montoRangoFijo(f.montoRango) || 0));
    const ultProx = {};
    if (filas.length) {
      const ph = filas.map(() => '?').join(',');
      db.prepare("SELECT codigoSolicitud, proximaAccion, fechaProxAccion FROM b2b_gestiones WHERE codigoSolicitud IN (" + ph + ") ORDER BY fecha ASC").all(...filas.map(f => f.codigo))
        .forEach(g => { ultProx[g.codigoSolicitud] = { prox: g.proximaAccion, fechaProx: g.fechaProxAccion }; });
    }
    const scored = filas.map(f => {
      const col = etapaKanbanB2B(f);
      const fechaEtapa = sellarFechaEtapa(f, col);
      const montoEfectivo = f.montoSolicitado != null ? Number(f.montoSolicitado) : montoRangoFijo(f.montoRango);
      const ps = priorityScoreB2B({ ...f, montoSolicitado: montoEfectivo, fechaEtapa }, montoMax);
      const up = ultProx[f.codigo];
      const accion = (up && up.prox) ? up.prox : (ps.sla && ps.sla.accion ? ps.sla.accion : 'Contactar y gestionar');
      const fechaAccion = (up && up.fechaProx) ? up.fechaProx : null;
      const proxVencida = fechaAccion ? (new Date(fechaAccion).getTime() < Date.now()) : false;
      return { codigo: f.codigo, empresa: f.razonSocial || f.nombreComercial || f.contacto || f.codigo, telefono: f.telefono || '',
        etapa: col, monto: montoEfectivo, score: ps.score, nivel: ps.nivel, oxigeno: ps.oxigeno,
        diasSinGestion: ps.diasSinGestion, slaVencido: !!(ps.sla && ps.sla.vencido), accion, fechaAccion, proxVencida };
    });

    // Tareas críticas HOY: SLA vencido, próxima acción vencida, o nivel crítica. Top por score.
    const criticas = scored.filter(l => l.slaVencido || l.proxVencida || l.nivel === 'critica')
      .sort((a, b) => (b.score - a.score) || (b.monto - a.monto)).slice(0, 6);

    // Progreso del día: gestiones hechas hoy por el asesor
    const hoyP = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const iniD = new Date(new Date(hoyP + 'T00:00:00Z').getTime() + 5 * 3600000).toISOString();
    const finD = new Date(new Date(hoyP + 'T00:00:00Z').getTime() + 5 * 3600000 + 86400000).toISOString();
    const gestHoy = nombreAsesor
      ? db.prepare("SELECT COUNT(DISTINCT codigoSolicitud) n FROM b2b_gestiones WHERE fecha>=? AND fecha<? AND responsable=?").get(iniD, finD, nombreAsesor).n
      : db.prepare("SELECT COUNT(DISTINCT codigoSolicitud) n FROM b2b_gestiones WHERE fecha>=? AND fecha<?").get(iniD, finD).n;

    const resumen = {
      totalCartera: scored.length,
      criticas: scored.filter(l => l.nivel === 'critica').length,
      slaVencidos: scored.filter(l => l.slaVencido).length,
      accionesVencidas: scored.filter(l => l.proxVencida).length,
      pipeline: scored.reduce((a, l) => a + (l.monto || 0), 0),
      gestionadosHoy: gestHoy
    };
    res.json({ asesor: nombreAsesor, resumen, criticas });
  } catch (e) { console.error('[b2b/comando]', e.stack || e.message); res.status(500).json({ error: e.message }); }
});

// COLA INTELIGENTE B2B: leads ordenados por Priority Score con la "siguiente mejor acción".
// GET /api/b2b/cola?asesor=  (funcionario ve los suyos; admin/jefe puede pasar ?asesor= o ve todos)
app.get('/api/b2b/cola', soloB2B, (req, res) => {
  try {
    const esJefe = ['admin', 'jefe_b2b', 'jefe_creditos', 'jefa'].includes(req.user.rol);
    let filas = db.prepare("SELECT * FROM b2b_solicitudes WHERE COALESCE(archivado,0)=0 AND estado <> 'No elegible'").all();
    filas = filtrarPorAlcanceB2B(req.user, filas);
    // Filtro por asesor: funcionario siempre a lo suyo; jefe puede elegir uno.
    const asesor = (req.query.asesor || '').trim();
    if (!esJefe) filas = filas.filter(f => f.responsableActual === req.user.nombre);
    else if (asesor) filas = filas.filter(f => f.responsableActual === asesor);

    const montoMax = Math.max(1, ...filas.map(f => Number(f.montoSolicitado || 0) || montoRangoFijo(f.montoRango) || 0));
    // Última "próxima acción" por solicitud (para la siguiente mejor acción)
    const ultProx = {};
    if (filas.length) {
      const ph = filas.map(() => '?').join(',');
      db.prepare("SELECT codigoSolicitud, proximaAccion, fechaProxAccion FROM b2b_gestiones WHERE codigoSolicitud IN (" + ph + ") ORDER BY fecha ASC").all(...filas.map(f => f.codigo))
        .forEach(g => { ultProx[g.codigoSolicitud] = { prox: g.proximaAccion, fechaProx: g.fechaProxAccion }; });
    }
    const cola = filas.map(f => {
      const col = etapaKanbanB2B(f);
      const fechaEtapa = sellarFechaEtapa(f, col);
      const montoEfectivo = f.montoSolicitado != null ? Number(f.montoSolicitado) : montoRangoFijo(f.montoRango);
      const ps = priorityScoreB2B({ ...f, montoSolicitado: montoEfectivo, fechaEtapa }, montoMax);
      const up = ultProx[f.codigo];
      // Siguiente mejor acción: la próxima acción registrada, o la acción sugerida por el SLA de la etapa.
      const accion = (up && up.prox) ? up.prox : (ps.sla && ps.sla.accion ? ps.sla.accion : 'Contactar y gestionar');
      const fechaAccion = (up && up.fechaProx) ? up.fechaProx : null;
      return {
        codigo: f.codigo, empresa: f.razonSocial || f.nombreComercial || f.contacto || f.codigo,
        contacto: f.contacto || '', telefono: f.telefono || '', etapa: col, monto: montoEfectivo,
        responsable: f.responsableActual || 'Sin asignar',
        score: ps.score, nivel: ps.nivel, oxigeno: ps.oxigeno, diasSinGestion: ps.diasSinGestion,
        slaVencido: !!(ps.sla && ps.sla.vencido), accion, fechaAccion
      };
    }).sort((a, b) => (b.score - a.score) || (b.monto - a.monto));
    res.json({ total: cola.length, asesor: (!esJefe ? req.user.nombre : (asesor || null)), cola });
  } catch (e) { console.error('[b2b/cola]', e.stack || e.message); res.status(500).json({ error: e.message }); }
});

// Datos del tablero. ?desestimados=1 devuelve la bandeja de desestimados (filtro, no columna).
app.get('/api/b2b/kanban', soloB2B, (req, res) => {
  const soloDesest = req.query.desestimados === '1';
  let filas = db.prepare("SELECT codigo, ruc, razonSocial, nombreComercial, contacto, telefono, montoSolicitado, montoRango, ticket, sector, estado, sunatEstado, sunatDepartamento, sunatDistrito, responsableActual, funcionario, asistente, fechaIngreso, fechaEtapa, fechaEtapaCol, temperatura, tieneInmueble, motivoDescarte, archivado FROM b2b_solicitudes ORDER BY fechaIngreso DESC, id DESC").all();
  filas = filtrarPorAlcanceB2B(req.user, filas);
  const sem = semaforosB2BPorCodigo(filas.map(f => f.codigo));
  // Última "próxima acción" registrada en cada etapa (para mostrar en la tarjeta).
  const ultGestEtapa = {};
  if (filas.length) {
    const ph = filas.map(() => '?').join(',');
    db.prepare("SELECT codigoSolicitud, etapa, proximaAccion, fechaProxAccion FROM b2b_gestiones WHERE codigoSolicitud IN (" + ph + ") ORDER BY fecha ASC").all(...filas.map(f => f.codigo))
      .forEach(g => { ultGestEtapa[g.codigoSolicitud + '|' + (g.etapa || '')] = { prox: g.proximaAccion, fechaProx: g.fechaProxAccion || null }; ultGestEtapa['#' + g.codigoSolicitud] = true; });
  }
  // Monto máximo del pipeline (para normalizar el sub-score de monto).
  const montoMax = Math.max(1, ...filas.map(f => Number(f.montoSolicitado || 0) || montoRangoFijo(f.montoRango) || 0));
  const cards = filas.map(f => {
    const col = etapaKanbanB2B(f);
    const fechaEtapa = sellarFechaEtapa(f, col);
    const semc = sem[f.codigo] || {};
    const montoEfectivo = f.montoSolicitado != null ? Number(f.montoSolicitado) : montoRangoFijo(f.montoRango);
    const ug = ultGestEtapa[f.codigo + '|' + col] || null;
    const tieneGestion = !!ultGestEtapa['#' + f.codigo];
    // Priority Score usando el monto efectivo (rango si no hay explícito).
    const ps = priorityScoreB2B({ ...f, montoSolicitado: montoEfectivo, fechaEtapa }, montoMax);
    return { ...f, etapaKanban: col, semaforos: semc, puntaje: puntajeB2B(f, semc), sla: slaEtapaB2B(col, fechaEtapa), observaciones: observacionesB2B(f), montoEfectivo,
      ultimaGestionEtapa: ug ? ug.prox : null, ultimaGestionFechaProx: ug ? ug.fechaProx : null, tieneGestion,
      priorityScore: ps.score, nivelPrioridad: ps.nivel, oxigeno: ps.oxigeno, diasSinGestion: ps.diasSinGestion };
  });
  // Ordenar por Priority Score DESC (mayor prioridad arriba) dentro de todo el set; el front agrupa por columna.
  cards.sort((a, b) => ((b.priorityScore || 0) - (a.priorityScore || 0)) || ((b.montoEfectivo || 0) - (a.montoEfectivo || 0)));
  const activos = cards.filter(c => c.etapaKanban !== 'Desestimado');
  const desest = cards.filter(c => c.etapaKanban === 'Desestimado');
  const conteos = {};
  const montos = {};
  COLUMNAS_KANBAN_B2B.forEach(c => { conteos[c] = 0; montos[c] = 0; });
  activos.forEach(c => {
    conteos[c.etapaKanban] = (conteos[c.etapaKanban] || 0) + 1;
    montos[c.etapaKanban] = (montos[c.etapaKanban] || 0) + (Number(c.montoEfectivo) || 0);
  });
  res.json({
    columnas: COLUMNAS_KANBAN_B2B,
    cards: soloDesest ? desest : activos,
    conteos, montos, desestimados: desest.length, total: activos.length,
    puedeGestionar: puedeGestionarEquipoB2B(req.user)
  });
});

// Para ENTRAR a cada columna: de dónde viene, qué candado (gate) exige y qué estado deja.
const AVANCE_KANBAN_B2B = {
  'Filtro credito': { desde: 'Solicitud', estado: 'Nuevo', gate: (s) => s.sunatEstado === 'ok', err: 'Primero valida el RUC en SUNAT (debe quedar en OK).' },
  'Filtro garantia': { desde: 'Filtro credito', estado: 'Filtro garantia', gate: (s, sem) => sem.credito === 'Verde', err: 'El filtro de crédito debe estar en verde para avanzar.' },
  'Reunion comercial': { desde: 'Filtro garantia', estado: 'Reunion comercial', gate: (s, sem) => sem.garantia === 'Verde', err: 'El filtro de garantía debe estar en verde para avanzar.' },
  'Filtro finanzas': { desde: 'Reunion comercial', estado: 'Filtro finanzas', gate: () => true, err: '' },
  'Business case': { desde: 'Filtro finanzas', estado: 'Expediente', gate: (s, sem) => sem.finanzas === 'Verde', err: 'El filtro de finanzas debe estar en verde para avanzar.' }
};

// Mover una tarjeta a la siguiente columna (drag). Sin saltos, sin retrocesos, con candado de semáforo.
// Reunión comercial (v1.252): se guarda como fila 'reunion' en b2b_filtros (checklist JSON).
// El COMENTARIO es obligatorio para poder avanzar a Filtro finanzas (se valida en /mover).
app.put('/api/b2b/solicitudes/:codigo/reunion', soloB2B, (req, res) => {
  const s = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const b = req.body || {};
  const datos = {
    fecha: (b.fecha || '').slice(0, 10) || null,
    hora: (b.hora || '').slice(0, 5) || null,
    modalidad: b.modalidad || null,
    lugar: (b.lugar || '').slice(0, 200) || null,
    comentario: (b.comentario || '').slice(0, 2000) || null,
    proximosPasos: (b.proximosPasos || '').slice(0, 1000) || null,
    realizada: !!b.realizada
  };
  const ahora = new Date().toISOString();
  db.prepare(`INSERT INTO b2b_filtros (codigoSolicitud, tipoFiltro, checklist, semaforo, puntaje, motivos, observaciones, responsable, actualizadoEn)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(codigoSolicitud, tipoFiltro) DO UPDATE SET checklist=excluded.checklist, responsable=excluded.responsable, actualizadoEn=excluded.actualizadoEn`)
    .run(s.codigo, 'reunion', JSON.stringify(datos), null, null, null, null, req.user.nombre, ahora);
  // Avance automático a Finanzas: si la reunión se dio Y hay comentario, avanza sin botón aparte.
  let avanzo = false;
  if (datos.realizada && datos.comentario && datos.comentario.trim()) {
    avanzo = autoAvanzarB2B(s.codigo, 'Reunion comercial', 'Verde', req.user.nombre);
  }
  auditar(req, 'b2b_reunion_guardar', s.codigo, (datos.fecha ? datos.fecha + (datos.hora ? ' ' + datos.hora : '') + ' · ' + (datos.modalidad || '') : 'sin fecha') + (datos.comentario ? ' · comentario' : '') + (avanzo ? ' → avanzó a Finanzas' : ''));
  res.json({ ok: true, reunion: datos, avanzo });
});

// ===== SEGUIMIENTO DIARIO B2B: qué se gestionó hoy, avances de etapa =====
// GET /api/b2b/dia?fecha=YYYY-MM-DD  (admin/jefes B2B)
app.get('/api/b2b/dia', soloB2B, (req, res) => {
  if (!req.user || !['admin', 'jefe_b2b', 'jefe_creditos', 'jefa'].includes(req.user.rol)) return res.status(403).json({ error: 'Solo jefatura' });
  try {
  const hoyP = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha) ? req.query.fecha : hoyP;
  const asesorFiltro = (req.query.asesor || '').trim();
  const ini = new Date(new Date(fecha + 'T00:00:00Z').getTime() + 5 * 3600000).toISOString();
  const fin = new Date(new Date(fecha + 'T00:00:00Z').getTime() + 5 * 3600000 + 86400000).toISOString();
  const asesores = db.prepare("SELECT nombre FROM usuarios WHERE activo=1 AND rol IN ('funcionario_b2b','asistente_creditos','jefe_creditos','jefe_b2b') ORDER BY nombre").all().map(u => u.nombre);

  const sols = {};
  db.prepare('SELECT * FROM b2b_solicitudes').all().forEach(x => { sols[x.codigo] = x; });

  // Fuentes del día
  const gest = db.prepare('SELECT * FROM b2b_gestiones WHERE fecha>=? AND fecha<? ORDER BY fecha ASC').all(ini, fin);
  const desRaw = db.prepare("SELECT * FROM auditoria WHERE fecha>=? AND fecha<? AND accion IN ('b2b_descartar','b2b_descartar_duplicado')").all(ini, fin);
  const avRaw = db.prepare("SELECT * FROM auditoria WHERE fecha>=? AND fecha<? AND (accion IN ('b2b_kanban_mover','b2b_kanban_forzar','b2b_avanzar_etapa') OR (accion IN ('b2b_guardar_filtro','b2b_reunion_guardar') AND detalle LIKE '%avanz%'))").all(ini, fin);
  // Trabajo del día que NO es gestión formal ni descarte, pero SÍ es trabajo sobre el lead (filtros, sujetos, garantía, link).
  const trabajoRaw = db.prepare("SELECT * FROM auditoria WHERE fecha>=? AND fecha<? AND accion IN ('b2b_credito_guardar_sujeto','b2b_garantia_guardar_inmueble','b2b_guardar_filtro','b2b_guardar_garantia','b2b_credito_link','b2b_credito_agregar_sujeto','b2b_garantia_agregar_inmueble') ORDER BY fecha ASC").all(ini, fin);
  const nuevos = db.prepare('SELECT * FROM b2b_solicitudes WHERE fechaIngreso>=? AND fechaIngreso<?').all(ini, fin);

  // ===== ACTIVIDAD UNIFICADA POR LEAD (nuevos + gestionados + desestimados) =====
  const A = {}; // codigo -> registro
  const reg = (cod) => {
    if (!A[cod]) {
      const x = sols[cod] || {};
      A[cod] = { codigo: cod, empresa: x.razonSocial || x.contacto || cod, telefono: x.telefono || '',
        etapa: etapaKanbanB2B(x), responsable: x.responsableActual || 'Sin asignar',
        esNuevo: false, horaLlegada: null, minPrimerToque: null,
        acciones: [], avances: [], desestimado: false, motivoDescarte: null };
    }
    return A[cod];
  };
  nuevos.forEach(x => { const r = reg(x.codigo); r.esNuevo = true; r.horaLlegada = x.fechaIngreso; });
  gest.forEach(g => {
    const r = reg(g.codigoSolicitud);
    if (g.responsable) r.responsable = g.responsable; // quien lo trabajó hoy manda
    r.acciones.push({ hora: g.fecha, resultado: g.resultado || '', proxima: g.proximaAccion || '', fechaProx: g.fechaProxAccion || '', responsable: g.responsable || '' });
  });
  avRaw.forEach(a => { if (A[a.objetivo] || sols[a.objetivo]) { const r = reg(a.objetivo); r.avances.push(a.detalle || ''); if (a.nombre) r.responsable = r.responsable === 'Sin asignar' ? a.nombre : r.responsable; } });
  // Marca leads trabajados vía filtros/sujetos (aunque no haya gestión formal registrada).
  const etiquetaTrabajo = { b2b_credito_guardar_sujeto: 'Trabajó sujeto de crédito', b2b_garantia_guardar_inmueble: 'Trabajó garantía', b2b_guardar_filtro: 'Guardó filtro', b2b_guardar_garantia: 'Guardó garantía', b2b_credito_link: 'Actualizó link de crédito', b2b_credito_agregar_sujeto: 'Agregó sujeto de crédito', b2b_garantia_agregar_inmueble: 'Agregó inmueble' };
  trabajoRaw.forEach(a => {
    if (!sols[a.objetivo]) return;
    const r = reg(a.objetivo);
    if (a.nombre) r.responsable = (r.responsable === 'Sin asignar') ? a.nombre : r.responsable;
    r.trabajoExtra = (r.trabajoExtra || 0) + 1;
    r.acciones.push({ hora: a.fecha, resultado: etiquetaTrabajo[a.accion] || 'Trabajó el lead', proxima: '', fechaProx: '', responsable: a.nombre || '', esTrabajo: true });
  });
  desRaw.forEach(a => { const r = reg(a.objetivo); r.desestimado = true; r.motivoDescarte = a.detalle || (sols[a.objetivo] || {}).motivoDescarte || 'Sin motivo'; if (a.nombre) r.responsable = a.nombre; r.acciones.push({ hora: a.fecha, resultado: '🗑 Desestimado', proxima: '', fechaProx: '', responsable: a.nombre || '', esDescarte: true, motivo: r.motivoDescarte }); });
  // Primer toque para nuevos
  Object.values(A).forEach(r => {
    if (r.esNuevo && r.horaLlegada) {
      const g1 = db.prepare('SELECT fecha FROM b2b_gestiones WHERE codigoSolicitud=? ORDER BY fecha ASC LIMIT 1').get(r.codigo);
      const t1 = g1 ? g1.fecha : (r.desestimado ? (r.acciones.find(a => a.esDescarte) || {}).hora : null);
      if (t1) r.minPrimerToque = Math.max(0, Math.round((new Date(t1) - new Date(r.horaLlegada)) / 60000));
    }
    // Estado del día (prioridad: desestimado > avanzó > gestionado > sin tocar)
    r.estadoDia = r.desestimado ? 'desestimado' : (r.avances.length ? 'avanzo' : (r.acciones.length ? 'gestionado' : 'sin_tocar'));
    const ult = r.acciones[r.acciones.length - 1] || {};
    r.ultimaAccion = ult.resultado || '';
    r.proximoPaso = ult.proxima ? (ult.proxima + (ult.fechaProx ? ' · ' + String(ult.fechaProx).slice(0, 10) : '')) : '';
    r.nGestiones = r.acciones.length;
  });
  let actividad = Object.values(A);
  if (asesorFiltro) actividad = actividad.filter(r => r.responsable === asesorFiltro);
  // Orden: sin tocar primero, luego desestimados/avances/gestionados por hora reciente
  const ordEst = { sin_tocar: 0, avanzo: 1, gestionado: 2, desestimado: 3 };
  actividad.sort((a, b) => (ordEst[a.estadoDia] - ordEst[b.estadoDia]) || (b.nGestiones - a.nGestiones));

  // ===== EMBUDO DEL DÍA con detalle por etapa =====
  const embMap = {}; COLUMNAS_KANBAN_B2B.forEach(c => embMap[c] = []);
  const embDes = [];
  actividad.filter(r => r.estadoDia !== 'sin_tocar').forEach(r => {
    const item = { empresa: r.empresa, responsable: r.responsable, hora: (r.acciones[r.acciones.length - 1] || {}).hora || null, resultado: r.ultimaAccion, proximoPaso: r.proximoPaso, motivo: r.motivoDescarte };
    if (r.desestimado) embDes.push(item);
    else if (embMap[r.etapa]) embMap[r.etapa].push(item);
  });
  const embudoDia = COLUMNAS_KANBAN_B2B.map(c => ({ etapa: c, n: embMap[c].length, items: embMap[c] }));
  embudoDia.push({ etapa: 'Desestimados', n: embDes.length, items: embDes, esDesestimado: true });

  // ===== AVANCES DEL DÍA por transición (origen → destino), para el reporte ejecutivo =====
  // Se leen directo de la auditoría: cuenta cada avance en la etapa DESDE donde salió, no donde está ahora el lead.
  const LBL_ET = { 'Filtro credito': 'Crédito', 'Filtro garantia': 'Garantía', 'Reunion comercial': 'Reunión', 'Filtro finanzas': 'Finanzas', 'Business case': 'Business Case', 'Solicitud': 'Solicitud/SUNAT' };
  const avPorTransicion = {};
  const avancesDetalle = [];
  avRaw.forEach(a => {
    if (asesorFiltro && a.nombre !== asesorFiltro) return;
    const det = String(a.detalle || '');
    const m = det.match(/(.+?)\s*(?:→|->)\s*(.+)/);
    let origen = '', destino = '';
    if (m) { origen = m[1].trim(); destino = m[2].trim(); }
    const key = (LBL_ET[origen] || origen || '?') + ' → ' + (LBL_ET[destino] || destino || '?');
    avPorTransicion[key] = (avPorTransicion[key] || 0) + 1;
    const sol = sols[a.objetivo] || {};
    avancesDetalle.push({ codigo: a.objetivo, empresa: sol.razonSocial || sol.contacto || a.objetivo, transicion: key, responsable: a.nombre || '', hora: a.fecha });
  });
  const avancesPorTransicion = Object.entries(avPorTransicion).map(([transicion, n]) => ({ transicion, n })).sort((a, b) => b.n - a.n);

  // ===== COMPARATIVO POR ASESOR (coaching) =====
  const porAsesor = asesores.map(a => {
    const acts = Object.values(A).filter(r => r.responsable === a);
    const asignadosHoy = acts.filter(r => r.esNuevo).length;
    const sinTocar = acts.filter(r => r.esNuevo && r.estadoDia === 'sin_tocar').length;
    const tocados = acts.filter(r => r.estadoDia !== 'sin_tocar').length;
    const desest = acts.filter(r => r.desestimado).length;
    const gestos = acts.reduce((n, r) => n + r.nGestiones, 0);
    return { asesor: a, asignadosHoy, sinTocar, tocados, gestiones: gestos, desestimados: desest,
      pctAbordaje: asignadosHoy ? Math.round(((asignadosHoy - sinTocar) / asignadosHoy) * 100) : null };
  }).filter(x => x.asignadosHoy || x.tocados);

  // ===== KPIs (desestimados CUENTAN como trabajados) =====
  const nuevosAct = actividad.filter(r => r.esNuevo);
  const resumen = {
    llegaronHoy: nuevosAct.length,
    abordados: nuevosAct.filter(r => r.estadoDia !== 'sin_tocar').length,
    trabajados: actividad.filter(r => r.estadoDia !== 'sin_tocar').length,
    gestiones: actividad.reduce((n, r) => n + r.nGestiones, 0),
    avanzaron: actividad.filter(r => r.avances.length).length,
    avancesTotales: avancesDetalle.length,
    desestimados: actividad.filter(r => r.desestimado).length
  };

  res.json({ fecha, asesores, asesorFiltro, resumen, actividad, embudoDia, porAsesor, avancesPorTransicion, avancesDetalle });
  } catch (e) { console.error('[b2b/dia]', e.stack || e.message); res.status(500).json({ error: e.message }); }
});

// Embudo B2B: cuántas solicitudes hay/pasaron por cada etapa + fila de desestimados. (foto acumulada)
function calcularEmbudoB2B(asesor) {
  const wA = asesor ? " AND responsableActual=?" : "";
  const argsA = asesor ? [asesor] : [];
  const activas = db.prepare("SELECT codigo, estado, montoSolicitado, montoRango FROM b2b_solicitudes WHERE COALESCE(archivado,0)=0 AND estado <> 'No elegible'" + wA).all(...argsA);
  const desest = db.prepare("SELECT COUNT(*) n FROM b2b_solicitudes WHERE (COALESCE(archivado,0)=1 OR estado='No elegible')" + wA).get(...argsA).n;
  const etapas = COLUMNAS_KANBAN_B2B;
  const ordEt = {}; etapas.forEach((e, i) => ordEt[e] = i);
  const enEtapa = {}; etapas.forEach(e => enEtapa[e] = 0);
  const alcanzaron = {}; etapas.forEach(e => alcanzaron[e] = 0);
  activas.forEach(s => {
    const col = etapaKanbanB2B(s);
    if (enEtapa[col] != null) enEtapa[col]++;
    const idx = ordEt[col] != null ? ordEt[col] : 0;
    etapas.forEach((e, i) => { if (idx >= i) alcanzaron[e]++; });
  });
  const total = activas.length + desest;
  const filas = etapas.map(e => ({ etapa: e, enEtapa: enEtapa[e], alcanzaron: alcanzaron[e], pct: total ? Math.round((alcanzaron[e] / total) * 100) : 0 }));
  filas.push({ etapa: 'Desestimados', enEtapa: desest, alcanzaron: desest, pct: total ? Math.round((desest / total) * 100) : 0, esDesestimado: true });
  return { total, filas };
}

// Análisis de desestimados: por motivo y por etapa donde se cayeron.
function analizarDesestimadosB2B(asesor) {
  const wA = asesor ? " AND responsableActual=?" : "";
  const argsA = asesor ? [asesor] : [];
  const filas = db.prepare("SELECT codigo, estado, motivoDescarte, resultadoCredito, resultadoGarantia, resultadoFinanzas, sunatEstado, campana FROM b2b_solicitudes WHERE (COALESCE(archivado,0)=1 OR estado='No elegible')" + wA).all(...argsA);
  const porMotivo = {}, porEtapa = {}, porCampana = {};
  filas.forEach(f => {
    const mot = f.motivoDescarte || 'Sin motivo registrado';
    porMotivo[mot] = (porMotivo[mot] || 0) + 1;
    // Etapa donde se cayó: la más avanzada con semáforo Rojo, o SUNAT si falló ahí
    let etapa = 'Solicitud/SUNAT';
    if (f.resultadoFinanzas === 'Rojo') etapa = 'Finanzas';
    else if (f.resultadoGarantia === 'Rojo') etapa = 'Garantía';
    else if (f.resultadoCredito === 'Rojo') etapa = 'Crédito';
    else if (f.sunatEstado && f.sunatEstado !== 'ok') etapa = 'SUNAT (RUC)';
    porEtapa[etapa] = (porEtapa[etapa] || 0) + 1;
    const cam = f.campana || '(sin campaña)';
    porCampana[cam] = (porCampana[cam] || 0) + 1;
  });
  const arr = o => Object.entries(o).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
  return { total: filas.length, porMotivo: arr(porMotivo), porEtapa: arr(porEtapa), porCampana: arr(porCampana).slice(0, 8) };
}

// RESET del tablero a etapa inicial (nada gestionado aún):
//  - RUC validado por SUNAT (sunatEstado='ok')  → 'Filtro credito' (columna crédito).
//  - RUC no validado/error/pendiente             → 'Nuevo' (primera columna, Solicitud).
// No toca las 'No elegible' ni archivadas. Solo admin.
app.post('/api/b2b/demo/reset-inicial', soloB2B, (req, res) => {
  if (!req.user || req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  const activas = "COALESCE(archivado,0)=0 AND estado <> 'No elegible'";
  // Validadas por SUNAT → Filtro credito
  const rOk = db.prepare("UPDATE b2b_solicitudes SET estado='Filtro credito', fechaEtapa=? WHERE " + activas + " AND sunatEstado='ok'").run(new Date().toISOString());
  // No validadas (error/pendiente/null) → Nuevo (primera columna)
  const rPend = db.prepare("UPDATE b2b_solicitudes SET estado='Nuevo', fechaEtapa=? WHERE " + activas + " AND (sunatEstado IS NULL OR sunatEstado <> 'ok')").run(new Date().toISOString());
  auditar(req, 'b2b_reset_inicial', null, `credito=${rOk.changes} solicitud=${rPend.changes}`);
  res.json({ ok: true, aFiltroCredito: rOk.changes, aSolicitud: rPend.changes });
});

app.put('/api/b2b/solicitudes/:codigo/mover', soloB2B, (req, res) => {
  const s = db.prepare('SELECT * FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const hacia = (req.body && req.body.hacia) || '';
  const regla = AVANCE_KANBAN_B2B[hacia];
  if (!regla) return res.status(400).json({ error: 'Columna destino inválida' });
  const actual = etapaKanbanB2B(s);
  if (actual === hacia) return res.json({ ok: true, etapaKanban: actual });
  if (regla.desde !== actual) return res.status(400).json({ error: 'Solo se avanza una etapa a la vez, de izquierda a derecha (sin saltos ni retrocesos).' });
  const sem = semaforosB2BPorCodigo([s.codigo])[s.codigo] || {};
  // Override de DEMO (admin): con forzar:true se salta el candado de semáforo. Queda auditado.
  const forzar = !!(req.body && req.body.forzar) && req.user && req.user.rol === 'admin';
  if (!forzar && !regla.gate(s, sem)) return res.status(409).json({ error: regla.err });
  if (forzar) auditar(req, 'b2b_kanban_forzar', s.codigo, actual + ' → ' + hacia + ' (override demo)');
  // v1.252: para avanzar a Filtro finanzas el comentario de la reunión comercial es OBLIGATORIO.
  if (hacia === 'Filtro finanzas' && !forzar) {
    const fr = db.prepare("SELECT checklist FROM b2b_filtros WHERE codigoSolicitud=? AND tipoFiltro='reunion'").get(s.codigo);
    let r = {}; try { r = fr && fr.checklist ? JSON.parse(fr.checklist) : {}; } catch (e) {}
    if (!r.realizada) return res.status(409).json({ error: 'Para pasar a Finanzas primero activa "La reunión se dio" y guarda la reunión comercial.' });
    if (!r.comentario || !String(r.comentario).trim()) return res.status(409).json({ error: 'Para pasar a Finanzas primero registra y GUARDA el comentario de la reunión comercial (acuerdos y validación de observaciones).' });
  }
  db.prepare('UPDATE b2b_solicitudes SET estado=? WHERE codigo=?').run(regla.estado, s.codigo);
  auditar(req, 'b2b_kanban_mover', s.codigo, actual + ' → ' + hacia);
  res.json({ ok: true, etapaKanban: hacia });
});

// Descartar (sale del tablero, va a Desestimados). Motivo por defecto: "No contactable".
// Trazabilidad de UNA solicitud (v1.249): solo cambios GUARDADOS (auditoría b2b_* del código).
// Visible para cualquier usuario B2B que pueda abrir la ficha (no solo admin).
// Alertas WA B2B: previsualizar el texto de un corte y enviarlo AHORA (admin / jefe_b2b).
// ===== Costos Meta / CPL: cruza el gasto de Meta (por campaña) con los leads del CRM =====
// ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD [&force=1 para refrescar caché] [&tipo=b2b|b2c|todos]
app.get('/api/meta/cpl', async (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || !['admin', 'jefa', 'jefe_b2b', 'jefe_creditos'].includes(u.rol)) return res.status(403).json({ error: 'Solo admin o jefatura' });
  if (!metaInsights.configurado()) return res.status(422).json({ error: 'Faltan META_ACCESS_TOKEN o META_AD_ACCOUNT_ID en Railway' });
  const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde) ? req.query.desde : hoy;
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta) ? req.query.hasta : hoy;
  const tipo = ['b2b', 'b2c'].includes(req.query.tipo) ? req.query.tipo : 'todos';
  let meta;
  try { meta = await metaInsights.insights(desde, hasta, req.query.force === '1'); }
  catch (e) { return res.status(502).json({ error: e.message }); }

  // Leads del CRM por campaña en el rango. B2C = tabla leads (campaña); B2B = b2b_solicitudes (campana).
  const dIni = new Date(desde + 'T00:00:00.000Z').getTime() + 5 * 3600000; // medianoche Perú = 05:00 UTC
  const dFin = new Date(hasta + 'T23:59:59.999Z').getTime() + 5 * 3600000;
  const iniIso = new Date(dIni).toISOString(), finIso = new Date(dFin).toISOString();
  const leadsB2C = db.prepare("SELECT COALESCE(campana,'(sin campaña)') AS c, COUNT(*) AS n FROM leads WHERE COALESCE(archivado,0)=0 AND fechaCarga >= ? AND fechaCarga <= ? GROUP BY c").all(iniIso, finIso);
  const leadsB2B = db.prepare("SELECT COALESCE(campana,'(sin campaña)') AS c, COUNT(*) AS n FROM b2b_solicitudes WHERE COALESCE(archivado,0)=0 AND fechaIngreso >= ? AND fechaIngreso <= ? GROUP BY c").all(iniIso, finIso);

  // Índice de leads por nombre de campaña normalizado.
  const norm = x => String(x || '').trim().toLowerCase();
  const mapLeads = {};
  leadsB2C.forEach(r => { const k = norm(r.c); (mapLeads[k] = mapLeads[k] || { b2c: 0, b2b: 0, nombre: r.c }).b2c += r.n; });
  leadsB2B.forEach(r => { const k = norm(r.c); (mapLeads[k] = mapLeads[k] || { b2c: 0, b2b: 0, nombre: r.c }).b2b += r.n; });
  // Leads históricos (campañas anteriores) — se suman cuando ?historico=1.
  let histPorCampana = [];
  if (req.query.historico === '1') {
    histPorCampana = db.prepare("SELECT COALESCE(campana,'(sin campaña)') AS c, canal, COUNT(*) AS n FROM leads_historicos WHERE fechaCreacion >= ? AND fechaCreacion <= ? GROUP BY c, canal").all(desde, hasta);
    histPorCampana.forEach(r => {
      const k = norm(r.c);
      const o = (mapLeads[k] = mapLeads[k] || { b2c: 0, b2b: 0, nombre: r.c });
      if (/b2b/i.test(r.canal || '')) o.b2b += r.n; else o.b2c += r.n;
    });
  }

  const esB2B = nom => /b2b/i.test(nom);
  const esB2C = nom => /b2c/i.test(nom);
  const filas = [];
  meta.filas.forEach(mf => {
    const k = norm(mf.campana);
    const l = mapLeads[k] || { b2c: 0, b2b: 0 };
    const canal = esB2B(mf.campana) ? 'B2B' : esB2C(mf.campana) ? 'B2C' : '—';
    const leads = (l.b2c || 0) + (l.b2b || 0);
    if (tipo === 'b2b' && canal !== 'B2B') return;
    if (tipo === 'b2c' && canal !== 'B2C') return;
    filas.push({
      campana: mf.campana, canal, gasto: Math.round(mf.spend * 100) / 100,
      impresiones: mf.impresiones, clicks: mf.clicks,
      leads, leadsB2C: l.b2c || 0, leadsB2B: l.b2b || 0,
      cpl: leads > 0 ? Math.round((mf.spend / leads) * 100) / 100 : null
    });
    delete mapLeads[k];
  });
  // Campañas con leads en el CRM pero sin gasto reportado por Meta (para no ocultarlas).
  Object.values(mapLeads).forEach(l => {
    const nom = l.nombre || '(sin campaña)';
    const canal = esB2B(nom) ? 'B2B' : esB2C(nom) ? 'B2C' : '—';
    const leads = (l.b2c || 0) + (l.b2b || 0);
    if (tipo === 'b2b' && canal !== 'B2B') return;
    if (tipo === 'b2c' && canal !== 'B2C') return;
    filas.push({ campana: nom, canal, gasto: 0, impresiones: 0, clicks: 0, leads, leadsB2C: l.b2c || 0, leadsB2B: l.b2b || 0, cpl: null, sinGasto: true });
  });

  filas.sort((a, b) => b.gasto - a.gasto);
  const tot = filas.reduce((a, f) => ({ gasto: a.gasto + f.gasto, leads: a.leads + f.leads }), { gasto: 0, leads: 0 });
  res.json({
    desde, hasta, tipo, actualizado: new Date(meta.ts).toISOString(), cacheHit: !!meta.cacheHit,
    total: { gasto: Math.round(tot.gasto * 100) / 100, leads: tot.leads, cpl: tot.leads > 0 ? Math.round((tot.gasto / tot.leads) * 100) / 100 : null },
    filas
  });
});

// DIAGNÓSTICO: devuelve el crudo de Meta (actions completos por anuncio) para auditar qué llega realmente.
app.get('/api/meta/debug', async (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || u.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  if (!metaInsights.configurado()) return res.status(422).json({ error: 'Faltan META_ACCESS_TOKEN o META_AD_ACCOUNT_ID' });
  const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde) ? req.query.desde : hoy;
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta) ? req.query.hasta : hoy;
  try {
    const filas = await metaInsights.fetchInsightsAd(desde, hasta);
    // Devolver también qué action_types aparecen en total (para ver los duplicados)
    const tiposVistos = {};
    filas.forEach(f => { (f._actionsRaw || []).forEach(a => { tiposVistos[a.action_type] = (tiposVistos[a.action_type] || 0) + Number(a.value || 0); }); });
    res.json({ desde, hasta, totalAnuncios: filas.length, resumenActionTypes: tiposVistos, filas });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// ===== Cruce detallado Meta vs CRM por nivel (formulario/campaña/conjunto/anuncio) =====
// Muestra leads que reporta Meta vs leads que registró el CRM, para contrastar diferencias, + gasto y CPL.
// ?desde=&hasta=&nivel=campana|conjunto|anuncio [&force=1] [&tipo=b2b|b2c|todos]
app.get('/api/meta/cruce', async (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || !['admin', 'jefa', 'jefe_b2b', 'jefe_creditos'].includes(u.rol)) return res.status(403).json({ error: 'Solo admin o jefatura' });
  if (!metaInsights.configurado()) return res.status(422).json({ error: 'Faltan META_ACCESS_TOKEN o META_AD_ACCOUNT_ID en Railway' });
  const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde) ? req.query.desde : hoy;
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta) ? req.query.hasta : hoy;
  const nivel = ['campana', 'conjunto', 'anuncio'].includes(req.query.nivel) ? req.query.nivel : 'campana';
  const tipo = ['b2b', 'b2c'].includes(req.query.tipo) ? req.query.tipo : 'todos';

  let meta;
  try { meta = await metaInsights.insightsAd(desde, hasta, req.query.force === '1'); }
  catch (e) { return res.status(502).json({ error: e.message }); }

  const norm = x => String(x || '').trim().toLowerCase();
  // Clave de agrupación según nivel elegido.
  const claveDe = (camp, conj, anun) => nivel === 'anuncio' ? (norm(camp) + '||' + norm(conj) + '||' + norm(anun))
    : nivel === 'conjunto' ? (norm(camp) + '||' + norm(conj)) : norm(camp);
  const etiqueta = (camp, conj, anun) => nivel === 'anuncio' ? anun : nivel === 'conjunto' ? conj : camp;

  // 1) Agregar gasto + leads de META por la clave del nivel.
  const acc = {};
  meta.filas.forEach(f => {
    const k = claveDe(f.campana, f.conjunto, f.anuncio);
    const a = (acc[k] = acc[k] || { clave: k, campana: f.campana, conjunto: f.conjunto, anuncio: f.anuncio, gasto: 0, impresiones: 0, metaForm: 0, metaPixel: 0, crmB2C: 0, crmB2B: 0 });
    a.gasto += f.spend; a.impresiones += f.impresiones;
    a.metaForm += (f.metaForm != null ? f.metaForm : f.metaLeads || 0); // compat con caché vieja
    a.metaPixel += (f.metaPixel || 0);
  });

  // 2) Contar INGRESOS BRUTOS del CRM (lo que llegó por los webhooks de landing/formulario), en horario Perú.
  // Criterio acordado: cuentan creados + TODOS los duplicados (vinieron por campaña, cuestan); se excluyen descartes y errores.
  const iniIso = new Date(new Date(desde + 'T00:00:00.000Z').getTime() + 5 * 3600000).toISOString(); // medianoche Perú = 05:00 UTC
  const finIso = new Date(new Date(hasta + 'T23:59:59.999Z').getTime() + 5 * 3600000).toISOString();
  const EXCLUIR = "('descartado','error','error_validacion','no_normaliza','sin_datos','sin_nombre','incompleto')";
  const colConj = nivel === 'campana' ? "''" : 'COALESCE(conjunto,\'\')';
  const colAnun = nivel === 'anuncio' ? 'COALESCE(anuncio,\'\')' : "''";
  const qB2C = "SELECT COALESCE(campana,'') camp, " + colConj + " conj, " + colAnun + " anun, COUNT(*) n FROM marketing_ingresos WHERE estado NOT IN " + EXCLUIR + " AND fechaRecepcion>=? AND fechaRecepcion<=? GROUP BY camp,conj,anun";
  // B2B: el formulario de Meta no manda utm_campaign (solo la landing lo hace), así que el ingreso puede tener
  // utmCampaign vacío. Fallback: la campana de la solicitud vinculada (codigoSolicitud), que sí se guarda siempre.
  const colConjB2B = nivel === 'campana' ? "''" : "COALESCE(NULLIF(i.conjunto,''),(SELECT s.conjunto FROM b2b_solicitudes s WHERE s.codigo=i.codigoSolicitud),'')";
  const colAnunB2B = nivel === 'anuncio' ? "COALESCE(NULLIF(i.anuncio,''),(SELECT s.anuncio FROM b2b_solicitudes s WHERE s.codigo=i.codigoSolicitud),'')" : "''";
  const qB2B = "SELECT COALESCE(NULLIF(i.utmCampaign,''),(SELECT s.campana FROM b2b_solicitudes s WHERE s.codigo=i.codigoSolicitud),'') camp, " + colConjB2B + " conj, " + colAnunB2B + " anun, COUNT(*) n FROM b2b_ingresos i WHERE i.estado NOT IN " + EXCLUIR + " AND i.fechaRecepcion>=? AND i.fechaRecepcion<=? GROUP BY camp,conj,anun";
  db.prepare(qB2C).all(iniIso, finIso).forEach(r => { const k = claveDe(r.camp, r.conj, r.anun); const a = (acc[k] = acc[k] || { clave: k, campana: r.camp, conjunto: r.conj, anuncio: r.anun, gasto: 0, impresiones: 0, metaForm: 0, metaPixel: 0, crmB2C: 0, crmB2B: 0 }); a.crmB2C += r.n; });
  db.prepare(qB2B).all(iniIso, finIso).forEach(r => { const k = claveDe(r.camp, r.conj, r.anun); const a = (acc[k] = acc[k] || { clave: k, campana: r.camp, conjunto: r.conj, anuncio: r.anun, gasto: 0, impresiones: 0, metaForm: 0, metaPixel: 0, crmB2C: 0, crmB2B: 0 }); a.crmB2B += r.n; });

  const esB2B = n => /b2b/i.test(n), esB2C = n => /b2c/i.test(n);
  const filas = Object.values(acc).map(a => {
    const crmTotal = a.crmB2C + a.crmB2B;
    const canal = esB2B(a.campana) ? 'B2B' : esB2C(a.campana) ? 'B2C' : '—';
    const metaLeads = Math.max(a.metaForm || 0, a.metaPixel || 0); // form y píxel se solapan: el mayor es el conteo real de la vía
    return {
      etiqueta: etiqueta(a.campana, a.conjunto, a.anuncio), campana: a.campana, conjunto: a.conjunto, anuncio: a.anuncio, canal,
      gasto: Math.round(a.gasto * 100) / 100, impresiones: a.impresiones,
      metaLeads, metaForm: a.metaForm || 0, metaPixel: a.metaPixel || 0,
      crmLeads: crmTotal, crmB2C: a.crmB2C, crmB2B: a.crmB2B,
      diferencia: crmTotal - metaLeads, // + = CRM registró más; - = posible fuga del webhook
      cpl: crmTotal > 0 ? Math.round((a.gasto / crmTotal) * 100) / 100 : null,
      cplMeta: metaLeads > 0 ? Math.round((a.gasto / metaLeads) * 100) / 100 : null
    };
  }).filter(f => tipo === 'todos' || (tipo === 'b2b' && f.canal === 'B2B') || (tipo === 'b2c' && f.canal === 'B2C'));

  filas.sort((a, b) => b.gasto - a.gasto);
  const T = filas.reduce((s, f) => ({ gasto: s.gasto + f.gasto, meta: s.meta + f.metaLeads, crm: s.crm + f.crmLeads }), { gasto: 0, meta: 0, crm: 0 });
  res.json({
    desde, hasta, nivel, tipo, actualizado: new Date(meta.ts).toISOString(), cacheHit: !!meta.cacheHit,
    total: { gasto: Math.round(T.gasto * 100) / 100, metaLeads: T.meta, crmLeads: T.crm, diferencia: T.crm - T.meta, cpl: T.crm > 0 ? Math.round((T.gasto / T.crm) * 100) / 100 : null },
    filas
  });
});

// ===== PANEL UNIFICADO: gasto vivo de Meta + leads brutos + embudo de gestión, por campaña/conjunto/anuncio =====
// Estructura compatible con la tabla jerárquica de Inversión, pero con gasto en TIEMPO REAL (USD) e imagen del anuncio.
async function calcularInversionMeta(desde, hasta, force, incluirHistorico) {
  const meta = await metaInsights.insightsAd(desde, hasta, force);
  const imgs = await metaInsights.adImages(force);
  const norm = x => String(x || '').trim().toLowerCase();
  const filas = {};
  const fila = (camp, conj, anun) => {
    const k = norm(camp) + '||' + norm(conj) + '||' + norm(anun);
    if (!filas[k]) filas[k] = { etiqueta: anun || '(sin anuncio)', campana: camp || '(sin campaña)', conjunto: conj || '(sin conjunto)', anuncio: anun || '(sin anuncio)',
      costo: 0, impresiones: 0, resultadosMeta: 0, metaForm: 0, metaPixel: 0, creativeUrl: null,
      leadsCRM: 0, tocados: 0, contactado: 0, calificado: 0, agendado: 0, reunion: 0, negociacion: 0, cierre: 0 };
    return filas[k];
  };
  // 1) Gasto vivo + leads Meta + imagen
  meta.filas.forEach(mf => {
    const f = fila(mf.campana, mf.conjunto, mf.anuncio);
    f.costo += mf.spend; f.impresiones += mf.impresiones;
    f.metaForm += (mf.metaForm || 0); f.metaPixel += (mf.metaPixel || 0);
    const info = imgs[norm(mf.anuncio)] || null;
    if (!f.creativeUrl && info) f.creativeUrl = info.img;
    if (info && (f.adStatus !== 'ACTIVE')) f.adStatus = info.status;
  });
  Object.values(filas).forEach(f => { f.resultadosMeta = Math.max(f.metaForm, f.metaPixel); });
  // 2) Leads BRUTOS del CRM (webhooks), horario Perú, criterio acordado
  const iniIso = new Date(new Date(desde + 'T00:00:00.000Z').getTime() + 5 * 3600000).toISOString();
  const finIso = new Date(new Date(hasta + 'T23:59:59.999Z').getTime() + 5 * 3600000).toISOString();
  const EXC = "('descartado','error','error_validacion','no_normaliza','sin_datos','sin_nombre','incompleto')";
  db.prepare("SELECT COALESCE(campana,'') c, COALESCE(conjunto,'') j, COALESCE(anuncio,'') a, COUNT(*) n FROM marketing_ingresos WHERE estado NOT IN " + EXC + " AND fechaRecepcion>=? AND fechaRecepcion<=? GROUP BY c,j,a").all(iniIso, finIso)
    .forEach(r => { fila(r.c, r.j, r.a).leadsCRM += r.n; });
  db.prepare("SELECT COALESCE(NULLIF(i.utmCampaign,''),(SELECT s.campana FROM b2b_solicitudes s WHERE s.codigo=i.codigoSolicitud),'') c, COALESCE(NULLIF(i.conjunto,''),(SELECT s.conjunto FROM b2b_solicitudes s WHERE s.codigo=i.codigoSolicitud),'') j, COALESCE(NULLIF(i.anuncio,''),(SELECT s.anuncio FROM b2b_solicitudes s WHERE s.codigo=i.codigoSolicitud),'') a, COUNT(*) n FROM b2b_ingresos i WHERE i.estado NOT IN " + EXC + " AND i.fechaRecepcion>=? AND i.fechaRecepcion<=? GROUP BY c,j,a").all(iniIso, finIso)
    .forEach(r => { fila(r.c, r.j, r.a).leadsCRM += r.n; });
  // 3) Embudo de gestión B2C (pipeline comercial) sobre leads gestionables
  const SIN = L.RESULTADOS_SIN_CONTACTO || [];
  const gPorCod = {};
  db.prepare('SELECT * FROM gestiones ORDER BY fecha').all().forEach(x => { (gPorCod[x.codigo] = gPorCod[x.codigo] || []).push(x); });
  db.prepare("SELECT * FROM leads WHERE origenCreacion='make'").all().forEach(l => {
    const dia = peruFecha(l.fechaCarga);
    if (!dia || dia < desde || dia > hasta) return;
    const f = fila(l.campana, l.conjunto, l.anuncio);
    if (l.esDuplicadoActivo) return;
    const gs = gPorCod[l.codigo] || [];
    const cons = leadConsolidado(l, gs);
    if (gs.length) f.tocados++;
    if (gs.some(g => !SIN.includes(g.resultado))) f.contactado++;
    const ord = ORD_ETAPA_ATRIB[cons.etapa] != null ? ORD_ETAPA_ATRIB[cons.etapa] : 0;
    if (ord >= 2) f.calificado++;
    if (ord >= 3) f.agendado++;
    if (ord >= 4) f.reunion++;
    if (cons.etapa === 'Negociación' || ord >= 5) f.negociacion++;
    if (cons.etapa === 'Cerrado ganado') f.cierre++;
  });
  // RELEADS: leads de la base propia reasignados para trabajar. NO son de campaña vigente (su campana
  // heredada es histórica): van en fila propia, con su embudo de gestión, sin gasto ni CPL.
  const fRel = fila('♻️ Releads (base propia)', '', '');
  fRel.esRelead = true;
  db.prepare("SELECT * FROM leads WHERE origenCreacion='relead' AND COALESCE(esDuplicadoActivo,0)=0").all().forEach(l => {
    const dia = peruFecha(l.fechaCarga);
    if (!dia || dia < desde || dia > hasta) return;
    fRel.leadsCRM++;
    const gs = gPorCod[l.codigo] || [];
    const cons = leadConsolidado(l, gs);
    if (gs.length) fRel.tocados++;
    if (gs.some(g => !SIN.includes(g.resultado))) fRel.contactado++;
    const ord = ORD_ETAPA_ATRIB[cons.etapa] != null ? ORD_ETAPA_ATRIB[cons.etapa] : 0;
    if (ord >= 2) fRel.calificado++;
    if (ord >= 3) fRel.agendado++;
    if (ord >= 4) fRel.reunion++;
    if (ord >= 5 || cons.etapa === 'Negociación') fRel.negociacion++;
    if (cons.etapa === 'Cerrado ganado') fRel.cierre++;
  });
  if (!fRel.leadsCRM) delete filas[Object.keys(filas).find(k => filas[k] === fRel)];

  // 5) LEADS HISTÓRICOS (campañas anteriores) — se suman por campaña/conjunto/anuncio con su embudo.
  // Mapeo de etapa histórica → columnas del embudo (acumulado): Agendado→agendado, Reunión→reunion, Cerrado→cierre.
  if (incluirHistorico) {
    db.prepare("SELECT COALESCE(campana,'') c, COALESCE(conjunto,'') j, COALESCE(anuncio,'') a, etapa, COUNT(*) n FROM leads_historicos WHERE fechaCreacion>=? AND fechaCreacion<=? GROUP BY c,j,a,etapa").all(desde, hasta)
      .forEach(r => {
        const f = fila(r.c, r.j, r.a);
        f.leadsCRM += r.n;
        f.esHistorico = true;
        // Acumulado: quien llegó a una etapa pasó por las anteriores.
        const et = r.etapa || 'Por contactar';
        if (et === 'Agendado' || et === 'Reunión' || et === 'Cerrado') { f.tocados += r.n; f.contactado += r.n; f.calificado += r.n; f.agendado += r.n; }
        if (et === 'Reunión' || et === 'Cerrado') f.reunion += r.n;
        if (et === 'Cerrado') f.cierre += r.n;
      });
  }

  const arr = Object.values(filas);
  // Leads sin atribución = tráfico orgánico/directo (llegaron a la landing sin UTM): se etiquetan
  // y se EXCLUYEN del CPL pagado, porque no tienen gasto de pauta atribuible.
  let organicos = 0, releads = 0, sinDesglose = 0;
  arr.forEach(f => {
    if (f.esRelead) { releads += f.leadsCRM || 0; return; }
    if (!f.campana || f.campana === '(sin campaña)') { f.campana = '🌱 Orgánico / Directo'; f.esOrganico = true; organicos += f.leadsCRM || 0; return; }
    // Residual histórico: tiene campaña pero conjunto vacío y sin gasto propio (pre-migración o duplicado sin lead).
    if ((!f.conjunto || f.conjunto === '(sin conjunto)') && (f.costo || 0) === 0 && (f.metaForm || 0) === 0 && (f.metaPixel || 0) === 0) {
      f.esSinDesglose = true; sinDesglose += f.leadsCRM || 0;
    }
  });
  const T = arr.reduce((a, f) => { for (const k of ['costo','resultadosMeta','leadsCRM','tocados','contactado','calificado','agendado','reunion','negociacion','cierre']) a[k]+=f[k]||0; return a; }, { costo:0,resultadosMeta:0,leadsCRM:0,tocados:0,contactado:0,calificado:0,agendado:0,reunion:0,negociacion:0,cierre:0 });
  T.organicos = organicos; T.releads = releads; T.sinDesglose = sinDesglose;
  const leadsPagados = T.leadsCRM - organicos - releads - sinDesglose;
  T.cplReal = leadsPagados > 0 ? Math.round((T.costo / leadsPagados) * 100) / 100 : null; // CPL solo de pauta
  T.costoCierre = T.cierre ? Math.round((T.costo / T.cierre) * 100) / 100 : null;
  T.captura = T.resultadosMeta ? Math.round((T.leadsCRM / T.resultadosMeta) * 100) : null;
  return { desde, hasta, actualizado: new Date(meta.ts).toISOString(), cacheHit: !!meta.cacheHit, moneda: 'USD', totales: T, filas: arr.sort((a,b)=>b.costo-a.costo) };
}

app.get('/api/marketing/inversion-meta', async (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || !['admin', 'jefa', 'jefe_b2b', 'jefe_creditos'].includes(u.rol)) return res.status(403).json({ error: 'Solo admin o jefatura' });
  if (!metaInsights.configurado()) return res.status(422).json({ error: 'Faltan META_ACCESS_TOKEN o META_AD_ACCOUNT_ID' });
  const hoyP = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde) ? req.query.desde : hoyP;
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta) ? req.query.hasta : hoyP;
  try { res.json(await calcularInversionMeta(desde, hasta, req.query.force === '1', req.query.historico === '1')); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

// Serie diaria de leads por canal (para Tendencias): ingresos BRUTOS por webhook, horario Perú.
// ===== TENDENCIAS v2: series por período (mes/semana/día) con leads, embudo, gasto y CPL =====
// GET /api/marketing/tend-series?desde&hasta&agrupar=mes|semana|dia&canal=b2c|b2b&historico=1&split=1
// Devuelve series.total y, si split=1, series.formulario y series.landing (2 gráficos separados).
app.get('/api/marketing/tend-series', async (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || !['admin', 'jefa', 'jefe_b2b', 'jefe_creditos'].includes(u.rol)) return res.status(403).json({ error: 'Solo admin o jefatura' });
  try {
    const hoyP = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde) ? req.query.desde : new Date(Date.now() - 5 * 3600000 - 180 * 86400000).toISOString().slice(0, 10);
    const hasta = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta) ? req.query.hasta : hoyP;
    const agrupar = ['mes', 'semana', 'dia'].includes(req.query.agrupar) ? req.query.agrupar : 'mes';
    const canal = req.query.canal === 'b2b' ? 'b2b' : 'b2c';
    const split = req.query.split === '1';
    const incHist = req.query.historico === '1';

    const EXC = "('descartado','error','error_validacion','no_normaliza','sin_datos','sin_nombre','incompleto')";
    const iniIso = new Date(new Date(desde + 'T00:00:00.000Z').getTime() + 5 * 3600000).toISOString();
    const finIso = new Date(new Date(hasta + 'T23:59:59.999Z').getTime() + 5 * 3600000).toISOString();
    const diaPeru = iso => new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 10);
    const periodoDe = f => {
      if (agrupar === 'mes') return f.slice(0, 7);
      if (agrupar === 'semana') { const d = new Date(f + 'T12:00:00Z'); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); }
      return f;
    };
    const esWA = n => { const x = String(n || '').toLowerCase(); return x.includes('interaccion') || x.includes('mensajes-whatsapp') || x.includes('wtsp'); };
    const verTiktok = req.query.tiktok === '1';
    const esTk = n => String(n || '').toLowerCase().includes('tiktok');
    const matchTipo = (camp, tipo) => {
      if (esWA(camp)) return false;
      if (!verTiktok && esTk(camp)) return false; // TikTok oculto por defecto: su gasto real aún no se jala
      if (!tipo) return true;
      return String(camp || '').toLowerCase().includes(tipo);
    };
    const esCanal = camp => canal === 'b2b' ? /b2b/i.test(camp || '') : /b2c/i.test(camp || '');

    // Gasto diario por campaña (Meta) — una sola llamada, se reparte por tipo.
    let gastoFilas = [];
    try { if (metaInsights.configurado()) { const gd = await metaInsights.insightsDaily(desde, hasta, false); gastoFilas = gd.filas || []; } } catch (e) {}

    // Serie base por tipo ('' = todas menos whatsapp)
    function serieDe(tipo) {
      const per = {};
      const P = f => { const k = periodoDe(f); return per[k] = per[k] || { p: k, leads: 0, organicos: 0, gasto: 0, agendados: 0, reuniones: 0, cierres: 0, credito: 0, garantia: 0, finanzas: 0, bc: 0 }; };
      // 1) Leads del período (ingresos vivos)
      if (canal === 'b2c') {
        db.prepare("SELECT fechaRecepcion f, COALESCE(campana,'') c FROM marketing_ingresos WHERE estado NOT IN " + EXC + " AND fechaRecepcion>=? AND fechaRecepcion<=?").all(iniIso, finIso)
          .forEach(r => { const dp = diaPeru(r.f); if (!r.c) { if (!tipo) P(dp).organicos++; return; } if (!esCanal(r.c) || !matchTipo(r.c, tipo)) return; P(dp).leads++; });
      } else {
        db.prepare("SELECT i.fechaRecepcion f, COALESCE(NULLIF(i.utmCampaign,''),(SELECT s.campana FROM b2b_solicitudes s WHERE s.codigo=i.codigoSolicitud),'') c FROM b2b_ingresos i WHERE i.estado NOT IN " + EXC + " AND i.fechaRecepcion>=? AND i.fechaRecepcion<=?").all(iniIso, finIso)
          .forEach(r => { const dp = diaPeru(r.f); if (!r.c) { if (!tipo) P(dp).organicos++; return; } if (!matchTipo(r.c, tipo)) return; P(dp).leads++; });
      }
      // 2) Embudo vivo (etapas alcanzadas por los leads del período, contadas en su período de llegada)
      if (canal === 'b2c') {
        const gPorCod = {};
        db.prepare('SELECT * FROM gestiones ORDER BY fecha').all().forEach(x => { (gPorCod[x.codigo] = gPorCod[x.codigo] || []).push(x); });
        db.prepare("SELECT * FROM leads WHERE origenCreacion IN ('make','relead') AND COALESCE(esDuplicadoActivo,0)=0 AND fechaCarga>=? AND fechaCarga<=?").all(iniIso, finIso).forEach(l => {
          if (!matchTipo(l.campana, tipo) || (tipo && !l.campana)) return;
          if (l.campana && !esCanal(l.campana)) return;
          const dp = diaPeru(l.fechaCarga); const o = P(dp);
          const cons = leadConsolidado(l, gPorCod[l.codigo] || []);
          const ord = ORD_ETAPA_ATRIB[cons.etapa] != null ? ORD_ETAPA_ATRIB[cons.etapa] : 0;
          if (ord >= 3) o.agendados++;
          if (ord >= 4) o.reuniones++;
          if (cons.etapa === 'Cerrado ganado') o.cierres++;
        });
      } else {
        const SECB = ['Solicitud', 'Filtro credito', 'Filtro garantia', 'Reunion comercial', 'Filtro finanzas', 'Business case'];
        db.prepare('SELECT * FROM b2b_solicitudes WHERE fechaIngreso>=? AND fechaIngreso<=?').all(iniIso, finIso).forEach(sol => {
          if (tipo && !matchTipo(sol.campana, tipo)) return;
          const col = etapaKanbanB2B(sol); const ix = SECB.indexOf(col);
          const dp = diaPeru(sol.fechaIngreso); const o = P(dp);
          if (ix >= 1) o.credito++;
          if (ix >= 2) o.garantia++;
          if (ix >= 3) o.reuniones++;
          if (ix >= 4) o.finanzas++;
          if (ix >= 5) { o.bc++; o.cierres++; }
        });
      }
      // 3) Históricos (llegaron en su momento y quedaron en su etapa)
      if (incHist) {
        const SECH = ['Solicitud', 'Filtro credito', 'Filtro garantia', 'Reunion comercial', 'Filtro finanzas', 'Business case'];
        db.prepare("SELECT fechaCreacion f, COALESCE(campana,'') c, etapa FROM leads_historicos WHERE fechaCreacion>=? AND fechaCreacion<=? AND canal=?").all(desde, hasta, canal.toUpperCase()).forEach(h => {
          if (!h.c) { if (!tipo) P(h.f).organicos++; return; }
          if (!matchTipo(h.c, tipo)) return;
          const o = P(h.f); o.leads++;
          if (canal === 'b2b') {
            const ix = SECH.indexOf(h.etapa);
            if (ix >= 1) o.credito++;
            if (ix >= 2) o.garantia++;
            if (ix >= 3) o.reuniones++;
            if (ix >= 4) o.finanzas++;
            if (ix >= 5) { o.bc++; o.cierres++; }
          } else {
            if (h.etapa === 'Agendado' || h.etapa === 'Reunión' || h.etapa === 'Cerrado') o.agendados++;
            if (h.etapa === 'Reunión' || h.etapa === 'Cerrado') o.reuniones++;
            if (h.etapa === 'Cerrado') o.cierres++;
          }
        });
      }
      // 4) Gasto por período (campañas del canal + tipo; excluye whatsapp)
      gastoFilas.forEach(g => {
        if (!esCanal(g.campana) || !matchTipo(g.campana, tipo)) return;
        if (g.fecha < desde || g.fecha > hasta) return;
        P(g.fecha).gasto += g.spend || 0;
      });
      // 5) Cerrar: ordenar, calcular CPL y costos por etapa
      const arr = Object.values(per).sort((a, b) => a.p.localeCompare(b.p));
      const r2 = n => Math.round(n * 100) / 100;
      let gT = 0, lT = 0;
      arr.forEach(o => {
        o.gasto = r2(o.gasto); gT += o.gasto; lT += o.leads;
        o.cpl = o.leads ? r2(o.gasto / o.leads) : null;
        o.costoAgendado = o.agendados ? r2(o.gasto / o.agendados) : null;
        o.costoReunion = o.reuniones ? r2(o.gasto / o.reuniones) : null;
        o.costoCierre = o.cierres ? r2(o.gasto / o.cierres) : null;
        o.costoCredito = o.credito ? r2(o.gasto / o.credito) : null;
        o.costoGarantia = o.garantia ? r2(o.gasto / o.garantia) : null;
        o.costoFinanzas = o.finanzas ? r2(o.gasto / o.finanzas) : null;
        o.costoBC = o.bc ? r2(o.gasto / o.bc) : null;
      });
      return { periodos: arr, gastoTotal: r2(gT), leadsTotal: lT, cplPromedio: lT ? r2(gT / lT) : null };
    }

    const out = { desde, hasta, agrupar, canal, series: { total: serieDe('') } };
    if (split) { out.series.formulario = serieDe('formulario'); out.series.landing = serieDe('landing'); }
    res.json(out);
  } catch (e) { console.error('[tend-series]', e.stack || e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/marketing/serie', (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || !['admin', 'jefa', 'jefe_b2b', 'jefe_creditos'].includes(u.rol)) return res.status(403).json({ error: 'Solo admin o jefatura' });
  const hoyP = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde) ? req.query.desde : new Date(Date.now() - 5 * 3600000 - 29 * 86400000).toISOString().slice(0, 10);
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta) ? req.query.hasta : hoyP;
  const EXC = "('descartado','error','error_validacion','no_normaliza','sin_datos','sin_nombre','incompleto')";
  const iniIso = new Date(new Date(desde + 'T00:00:00.000Z').getTime() + 5 * 3600000).toISOString();
  const finIso = new Date(new Date(hasta + 'T23:59:59.999Z').getTime() + 5 * 3600000).toISOString();
  // Día Perú = fecha del timestamp menos 5h
  const diaExpr = c => "date(datetime(" + c + ", '-5 hours'))";
  const m = {};
  const nuevoDia = d => ({ fecha: d, b2c: 0, b2b: 0, b2cOrg: 0, b2bOrg: 0 });
  // Pagados = con campaña; Orgánicos = sin campaña (llegaron a la landing sin UTM).
  db.prepare("SELECT " + diaExpr('fechaRecepcion') + " d, (COALESCE(campana,'')='') org, COUNT(*) n FROM marketing_ingresos WHERE estado NOT IN " + EXC + " AND fechaRecepcion>=? AND fechaRecepcion<=? GROUP BY d, org").all(iniIso, finIso).forEach(r => { const x = (m[r.d] = m[r.d] || nuevoDia(r.d)); if (r.org) x.b2cOrg += r.n; else x.b2c += r.n; });
  db.prepare("SELECT " + diaExpr('i.fechaRecepcion') + " d, (COALESCE(NULLIF(i.utmCampaign,''),(SELECT s.campana FROM b2b_solicitudes s WHERE s.codigo=i.codigoSolicitud),'')='') org, COUNT(*) n FROM b2b_ingresos i WHERE i.estado NOT IN " + EXC + " AND i.fechaRecepcion>=? AND i.fechaRecepcion<=? GROUP BY d, org").all(iniIso, finIso).forEach(r => { const x = (m[r.d] = m[r.d] || nuevoDia(r.d)); if (r.org) x.b2bOrg += r.n; else x.b2b += r.n; });
  const dias = [];
  for (let t = new Date(desde + 'T12:00:00Z').getTime(); t <= new Date(hasta + 'T12:00:00Z').getTime(); t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    dias.push(m[d] || nuevoDia(d));
  }
  // Gasto diario de Meta por canal (regex b2b/b2c en el nombre de campaña) → CPL por día.
  (async () => {
    try {
      if (metaInsights.configurado()) {
        const daily = await metaInsights.insightsDaily(desde, hasta, req.query.force === '1');
        const gd = {};
        daily.filas.forEach(f => {
          const g = (gd[f.fecha] = gd[f.fecha] || { b2c: 0, b2b: 0 });
          if (/b2b/i.test(f.campana)) g.b2b += f.spend; else if (/b2c/i.test(f.campana)) g.b2c += f.spend;
        });
        dias.forEach(d => {
          const g = gd[d.fecha] || { b2c: 0, b2b: 0 };
          d.gastoB2C = Math.round(g.b2c * 100) / 100; d.gastoB2B = Math.round(g.b2b * 100) / 100;
          d.cplB2C = d.b2c ? Math.round((g.b2c / d.b2c) * 100) / 100 : null;
          d.cplB2B = d.b2b ? Math.round((g.b2b / d.b2b) * 100) / 100 : null;
          const lt = d.b2c + d.b2b, gt = g.b2c + g.b2b;
          d.cplTotal = lt ? Math.round((gt / lt) * 100) / 100 : null;
        });
      }
    } catch (e) { /* sin gasto: la serie de leads igual sale */ }
    res.json({ desde, hasta, dias });
  })();
});

// Embudo con CPL por etapa (B2C pipeline comercial + B2B pipeline kanban), filtrable por canal y fechas.
// ===== LEADS HISTÓRICOS: importación y consulta =====
// Mapea el "último estado" del CRM viejo a la etapa del embudo histórico.
function mapearEtapaHistorica(estado) {
  const e = String(estado || '').trim().toLowerCase();
  if (!e) return 'Por contactar';
  if (e.includes('concret') || e.includes('cerrad') || e.includes('ganad')) return 'Cerrado';
  if (e.includes('reuni')) return 'Reunión';
  if (e.includes('agend')) return 'Agendado';
  if (e.includes('calific')) return 'Agendado'; // calificado va antes de agendar; lo colocamos en la base media
  return 'Por contactar';
}
// Mapea el "último estado" del CRM viejo B2B a las 6 etapas del kanban actual.
function mapearEtapaHistoricaB2B(estado) {
  const e = String(estado || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (e.includes('business')) return 'Business case';
  if (e.includes('finanz')) return 'Filtro finanzas';
  if (e.includes('reunion')) return 'Reunion comercial';
  if (e.includes('garant')) return 'Filtro garantia';
  if (e.includes('credito')) return 'Filtro credito';
  return 'Solicitud';
}
// Detecta filas de prueba/ruido para excluirlas.
function esRuidoHistorico(f) {
  const tel = String(f.telefono || '').replace(/\D/g, '');
  const email = String(f.email || '').toLowerCase();
  const nombre = String(f.nombre || '').trim().toLowerCase();
  if (!tel || tel.length < 8) return true;
  if (/^(9)\1{7,}$/.test(tel) || tel === '999999999' || tel === '987987987') return true;
  if (email.includes('@tasatop.com')) return true;
  if (/test|prueba|ejemplo/.test(email) || /test|prueba|^dddf$|^rrrr$|^were$|^diegod$/.test(nombre)) return true;
  if (email.includes('diegocubas102')) return true;
  return false;
}

// POST /api/marketing/historico/importar  { filas:[{nombre,telefono,email,dia,mes,campana,conjunto,anuncio,ultimoEstado,asesor,monto,canal}], filtrarRuido, reemplazar }
app.post('/api/marketing/historico/importar', soloAdminOJefa, (req, res) => {
  try {
    const filas = Array.isArray(req.body.filas) ? req.body.filas : [];
    if (!filas.length) return res.status(400).json({ error: 'No se recibieron filas' });
    const filtrarRuido = req.body.filtrarRuido !== false;
    if (req.body.reemplazar) db.prepare('DELETE FROM leads_historicos').run();
    const norm9 = t => { let d = String(t || '').replace(/\D/g, ''); if (d.length === 11 && d.startsWith('51')) d = d.slice(2); if (d.length > 9) d = d.slice(-9); return d; };
    // Fecha: acepta "31/5/2026" o ISO. Devuelve YYYY-MM-DD.
    const parseFecha = (dia) => {
      if (dia == null || dia === '') return null;
      const sIn = String(dia).trim();
      // ISO o timestamp ISO (2026-02-25 o 2026-02-25 02:50:30 o 2026-02-25T...)
      if (/^\d{4}-\d{2}-\d{2}/.test(sIn)) return sIn.slice(0, 10);
      // dd/mm/yyyy o d/m/yyyy
      let m = sIn.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
      // dd-mm-yyyy
      m = sIn.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
      if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
      // Número serial de Excel (días desde 1899-12-30)
      if (/^\d+(\.\d+)?$/.test(sIn)) {
        const serial = parseFloat(sIn);
        if (serial > 30000 && serial < 60000) {
          const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
          if (!isNaN(d)) return d.toISOString().slice(0, 10);
        }
      }
      // Último recurso: que Date lo intente parsear (cubre formatos de toString de JS)
      const d = new Date(sIn);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
      return null;
    };
    const ins = db.prepare(`INSERT INTO leads_historicos (nombre,telefono,email,fechaCreacion,campana,conjunto,anuncio,ultimoEstado,etapa,asesor,monto,canal,cargadoEn)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    let insertados = 0, ruido = 0, dup = 0, sinFecha = 0;
    const vistos = new Set();
    const ahora = new Date().toISOString();
    db.exec('BEGIN');
    for (const f of filas) {
      if (filtrarRuido && esRuidoHistorico(f)) { ruido++; continue; }
      const fecha = parseFecha(f.dia || f.fechaCreacion);
      if (!fecha) { sinFecha++; continue; }
      const tel = norm9(f.telefono);
      // Dedup por teléfono + fecha + campaña (evita el mismo lead repetido del CRM viejo)
      const clave = tel + '|' + fecha + '|' + (f.campana || '');
      if (vistos.has(clave)) { dup++; continue; }
      vistos.add(clave);
      // Canal: columna si viene; si no, se detecta por el nombre de la campaña (b2b_... → B2B).
      const canal = /b2b/i.test(String(f.canal || '')) ? 'B2B'
        : (String(f.canal || '').trim() ? 'B2C' : (/b2b/i.test(String(f.campana || '')) ? 'B2B' : 'B2C'));
      const etapaMap = canal === 'B2B' ? mapearEtapaHistoricaB2B(f.ultimoEstado) : mapearEtapaHistorica(f.ultimoEstado);
      ins.run(String(f.nombre || '').trim() || null, tel || null, String(f.email || '').trim() || null, fecha,
        String(f.campana || '').trim() || null, String(f.conjunto || '').trim() || null, String(f.anuncio || '').trim() || null,
        String(f.ultimoEstado || '').trim() || null, etapaMap,
        String(f.asesor || '').trim() || null, (f.monto != null && f.monto !== '') ? Number(String(f.monto).replace(/[^\d.]/g, '')) || null : null,
        canal, ahora);
      insertados++;
    }
    db.exec('COMMIT');
    const total = db.prepare('SELECT COUNT(*) n FROM leads_historicos').get().n;
    res.json({ ok: true, insertados, ruidoDescartado: ruido, duplicados: dup, sinFecha, totalEnBase: total });
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} console.error('[hist import]', e.message); res.status(500).json({ error: e.message }); }
});

// GET /api/marketing/historico/resumen  → conteo por etapa, canal, rango de fechas
app.get('/api/marketing/historico/resumen', soloAdminOJefa, (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) n FROM leads_historicos').get().n;
    const porEtapa = db.prepare('SELECT etapa, COUNT(*) n FROM leads_historicos GROUP BY etapa').all();
    const porCanal = db.prepare('SELECT canal, COUNT(*) n FROM leads_historicos GROUP BY canal').all();
    const rango = db.prepare('SELECT MIN(fechaCreacion) desde, MAX(fechaCreacion) hasta FROM leads_historicos').get();
    res.json({ total, porEtapa, porCanal, rango });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/marketing/historico  → limpia toda la base histórica (admin)
app.delete('/api/marketing/historico', soloAdmin, (req, res) => {
  try { db.prepare('DELETE FROM leads_historicos').run(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/marketing/embudo-cpl', async (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || !['admin', 'jefa', 'jefe_b2b', 'jefe_creditos'].includes(u.rol)) return res.status(403).json({ error: 'Solo admin o jefatura' });
  const hoyP = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde) ? req.query.desde : new Date(Date.now() - 5 * 3600000 - 29 * 86400000).toISOString().slice(0, 10);
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta) ? req.query.hasta : hoyP;
  // Gasto del rango por canal (nivel campaña, en vivo)
  let gastoB2C = 0, gastoB2B = 0;
  try {
    if (metaInsights.configurado()) {
      const m = await metaInsights.insights(desde, hasta, req.query.force === '1');
      m.filas.forEach(f => { if (/b2b/i.test(f.campana)) gastoB2B += f.spend; else if (/b2c/i.test(f.campana)) gastoB2C += f.spend; });
    }
  } catch (e) { }
  gastoB2C = Math.round(gastoB2C * 100) / 100; gastoB2B = Math.round(gastoB2B * 100) / 100;
  const fila = (etapa, n, base, gasto) => ({ etapa, n, pct: base ? Math.round((n / base) * 100) : 0, cpl: n ? Math.round((gasto / n) * 100) / 100 : null });
  // B2C: leads make del rango (día Perú), sin duplicados; etapa consolidada.
  const SIN = L.RESULTADOS_SIN_CONTACTO || [];
  const gPorCod = {};
  db.prepare('SELECT * FROM gestiones ORDER BY fecha').all().forEach(x => { (gPorCod[x.codigo] = gPorCod[x.codigo] || []).push(x); });
  let tot = 0, cont = 0, cal = 0, ag = 0, reu = 0, neg = 0, cie = 0;
  let orgFuera = 0;
  db.prepare("SELECT * FROM leads WHERE origenCreacion='make' AND COALESCE(esDuplicadoActivo,0)=0").all().forEach(l => {
    const dia = peruFecha(l.fechaCarga);
    if (!dia || dia < desde || dia > hasta) return;
    if (!String(l.campana || '').trim()) { orgFuera++; return; } // orgánico: fuera del embudo de pauta
    tot++;
    const gs = gPorCod[l.codigo] || [];
    const cons = leadConsolidado(l, gs);
    if (gs.some(g => !SIN.includes(g.resultado))) cont++;
    const ord = ORD_ETAPA_ATRIB[cons.etapa] != null ? ORD_ETAPA_ATRIB[cons.etapa] : 0;
    if (ord >= 2) cal++;
    if (ord >= 3) ag++;
    if (ord >= 4) reu++;
    if (ord >= 5 || cons.etapa === 'Negociación') neg++;
    if (cons.etapa === 'Cerrado ganado') cie++;
  });
  const b2c = [fila('Leads', tot, tot, gastoB2C), fila('Contactados', cont, tot, gastoB2C), fila('Calificados', cal, tot, gastoB2C),
    fila('Agendados', ag, tot, gastoB2C), fila('Reunión', reu, tot, gastoB2C), fila('Negociación', neg, tot, gastoB2C), fila('Cierre', cie, tot, gastoB2C)];
  // B2B: solicitudes del rango; etapa alcanzada = índice de la etapa kanban actual.
  const ORDEN_B2B = ['Solicitud', 'Filtro credito', 'Filtro garantia', 'Reunion comercial', 'Filtro finanzas', 'Business case'];
  const cnt = new Array(ORDEN_B2B.length).fill(0);
  db.prepare('SELECT * FROM b2b_solicitudes WHERE COALESCE(archivado,0)=0').all().forEach(sol => {
    const dia = peruFecha(sol.fechaIngreso);
    if (!dia || dia < desde || dia > hasta) return;
    const et = (typeof etapaKanbanB2B === 'function') ? etapaKanbanB2B(sol) : 'Solicitud';
    const ix = Math.max(0, ORDEN_B2B.indexOf(et === 'Desestimado' ? 'Solicitud' : et));
    for (let i = 0; i <= ix; i++) cnt[i]++;
  });
  const b2b = ORDEN_B2B.map((e, i) => fila(e, cnt[i], cnt[0], gastoB2B));

  // ===== HISTÓRICOS: si se piden, se suman al embudo (leads que llegaron en su momento y quedaron en su etapa) =====
  let historico = null;
  if (req.query.historico === '1') {
    const hist = db.prepare('SELECT canal, etapa, campana FROM leads_historicos WHERE fechaCreacion>=? AND fechaCreacion<=?').all(desde, hasta);
    // Orden de etapas del embudo histórico: acumulado (quien llegó a Cerrado pasó por todas)
    const ORD_HIST = ['Por contactar', 'Agendado', 'Reunión', 'Cerrado'];
    const idxHist = et => { const i = ORD_HIST.indexOf(et); return i < 0 ? 0 : i; };
    const acum = (canal) => {
      const filas = hist.filter(h => h.canal === canal);
      const c = [0, 0, 0, 0];
      filas.forEach(h => { const ix = idxHist(h.etapa); for (let i = 0; i <= ix; i++) c[i]++; });
      return { total: filas.length, porEtapa: c };
    };
    const hB2C = acum('B2C'), hB2B = acum('B2B');
    // Sumar al embudo vivo: B2C tiene 7 etapas, histórico 4 → mapeo: PorContactar→Leads, Agendado→Agendados(idx3), Reunión→Reunión(idx4), Cerrado→Cierre(idx6)
    // Para simplicidad y claridad, devolvemos el histórico por separado Y sumado en los puntos comparables.
    const sumar = (arr, idxDestino, valor) => { if (arr[idxDestino]) { arr[idxDestino].n += valor; } };
    // B2C: Leads(0)+=total, Agendados(3)+=etapa Agendado acum, Reunión(4)+=Reunión acum, Cierre(6)+=Cerrado
    sumar(b2c, 0, hB2C.porEtapa[0]); sumar(b2c, 3, hB2C.porEtapa[1]); sumar(b2c, 4, hB2C.porEtapa[2]); sumar(b2c, 6, hB2C.porEtapa[3]);
    // recalcular pct y cpl de b2c tras sumar
    const baseB2C = b2c[0].n;
    b2c.forEach(f => { f.pct = baseB2C ? Math.round((f.n / baseB2C) * 100) : 0; f.cpl = f.n ? Math.round((gastoB2C / f.n) * 100) / 100 : null; });
    // B2B: Solicitud(0)+=total, ReunionComercial(3)+=Reunión, BusinessCase(5)+=Cerrado
    sumar(b2b, 0, hB2B.porEtapa[0]); sumar(b2b, 3, hB2B.porEtapa[2]); sumar(b2b, 5, hB2B.porEtapa[3]);
    const baseB2B = b2b[0].n;
    b2b.forEach(f => { f.pct = baseB2B ? Math.round((f.n / baseB2B) * 100) : 0; f.cpl = f.n ? Math.round((gastoB2B / f.n) * 100) / 100 : null; });
    historico = { b2c: hB2C, b2b: hB2B, incluido: true };
  }
  res.json({ desde, hasta, gastoB2C, gastoB2B, organicosFuera: orgFuera, b2c, b2b, historico });
});

// Corrige el histórico de leads con conjunto/anuncio INVERTIDOS (bug de mapeo en el escenario Make
// del formulario B2C). Intercambia ambas columnas de forma PERMANENTE en leads y marketing_ingresos.
// body: { campanaLike (def '%formulario%'), desde?, hasta? (YYYY-MM-DD, día Perú) }
app.post('/api/marketing/corregir-conjunto-anuncio', (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || u.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  // Modo selección: swap SOLO de los códigos elegidos (checkboxes en Detalle de leads).
  const codigos = (req.body && Array.isArray(req.body.codigos)) ? req.body.codigos.filter(c => /^[A-Z0-9-]+$/i.test(c)).slice(0, 500) : null;
  if (codigos && codigos.length) {
    const ph = codigos.map(() => '?').join(',');
    const r1 = db.prepare("UPDATE leads SET conjunto = anuncio, anuncio = conjunto WHERE codigo IN (" + ph + ")").run(...codigos);
    const r2 = db.prepare("UPDATE marketing_ingresos SET conjunto = anuncio, anuncio = conjunto WHERE codigoLead IN (" + ph + ")").run(...codigos);
    auditar(req, 'corregir_conjunto_anuncio', null, `seleccion=${codigos.length} leads=${r1.changes} ingresos=${r2.changes}`);
    return res.json({ ok: true, leadsCorregidos: r1.changes, ingresosCorregidos: r2.changes, modo: 'seleccion' });
  }
  const like = (req.body && req.body.campanaLike) || '%formulario%';
  const desde = (req.body && /^\d{4}-\d{2}-\d{2}$/.test(req.body.desde)) ? req.body.desde : null;
  const hasta = (req.body && /^\d{4}-\d{2}-\d{2}$/.test(req.body.hasta)) ? req.body.hasta : null;
  const rango = (col) => (desde ? " AND " + col + " >= '" + new Date(new Date(desde + 'T00:00:00Z').getTime() + 5 * 3600000).toISOString() + "'" : '') +
    (hasta ? " AND " + col + " <= '" + new Date(new Date(hasta + 'T23:59:59Z').getTime() + 5 * 3600000).toISOString() + "'" : '');
  // SQLite evalúa el lado derecho con los valores ORIGINALES de la fila: el swap simultáneo es seguro.
  const r1 = db.prepare("UPDATE leads SET conjunto = anuncio, anuncio = conjunto WHERE origenCreacion='make' AND campana LIKE ? AND COALESCE(conjunto,'') <> '' AND COALESCE(anuncio,'') <> ''" + rango('fechaCarga')).run(like);
  const r2 = db.prepare("UPDATE marketing_ingresos SET conjunto = anuncio, anuncio = conjunto WHERE campana LIKE ? AND COALESCE(conjunto,'') <> '' AND COALESCE(anuncio,'') <> ''" + rango('fechaRecepcion')).run(like);
  auditar(req, 'corregir_conjunto_anuncio', null, `like=${like} leads=${r1.changes} ingresos=${r2.changes}${desde ? ' desde ' + desde : ''}${hasta ? ' hasta ' + hasta : ''}`);
  res.json({ ok: true, leadsCorregidos: r1.changes, ingresosCorregidos: r2.changes, campanaLike: like });
});

// PILOTO IA: genera un reporte interpretado por Claude y opcionalmente lo envía al grupo de PRUEBA.
// GET  /api/ia/reporte/preview?tipo=gestion|planes|marketing&corte=1pm   → solo texto (no envía)
// POST /api/ia/reporte/enviar   body {tipo, corte}                        → envía al WA_GRUPO_IA_TEST_JID
async function generarReporteIA(tipo, corte, asesor) {
  const fechaTxt = new Date(Date.now() - 5 * 3600000).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
  if (tipo === 'gestion') {
    const rd = construirRankingDia();
    return await iaReportes.interpretarGestion(rd.ranking || [], corte || '1pm', fechaTxt, { meta: rd.meta, agendadosEquipo: rd.agendadosEquipo });
  }
  if (tipo === 'planes') {
    const rd = construirRankingDia();
    const planes = (rd.ranking || []).map(r => ({ gestora: r.asesor, activos: (r.intentos || 0), sinTocar: 0 }));
    return await iaReportes.interpretarPlanes(planes, corte || '1pm', fechaTxt);
  }
  if (tipo === 'comite') {
    // corte puede traer 'desde:hasta'; por defecto usa el rango del piloto (23 jun → hoy)
    let desde = '2026-06-23', hasta = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    if (corte && /^\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/.test(corte)) { const p = corte.split(':'); desde = p[0]; hasta = p[1]; }
    let datos;
    try { datos = calcularComiteB2C(desde, hasta, asesor); }
    catch (e) { console.error('[ia comite]', e.message); return null; }
    return await iaReportes.interpretarComite(datos, asesor);
  }
  if (tipo === 'performance') {
    // Análisis del rendimiento de marketing. Acepta rango 'YYYY-MM-DD:YYYY-MM-DD' o un día suelto; por defecto AYER.
    const ayer = new Date(Date.now() - 5 * 3600000 - 86400000).toISOString().slice(0, 10);
    let desde = ayer, hasta = ayer;
    if (corte && /^\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/.test(corte)) { const p = corte.split(':'); desde = p[0]; hasta = p[1]; }
    else if (corte && /^\d{4}-\d{2}-\d{2}$/.test(corte)) { desde = hasta = corte; }
    let panel;
    try { panel = await calcularInversionMeta(desde, hasta, false); }
    catch (e) { console.error('[ia performance] panel:', e.message); return null; }
    return await iaReportes.interpretarPerformance(panel, fechaTxt);
  }
  if (tipo === 'marketing') {
    const EXC = "('descartado','error','error_validacion','no_normaliza','sin_datos','sin_nombre','incompleto')";
    // Cuenta B2C y B2B entre dos ISO (UTC). hastaIso exclusivo.
    const cuenta = (desdeIso, hastaIso) => {
      const c = db.prepare("SELECT COUNT(*) n FROM marketing_ingresos WHERE estado NOT IN " + EXC + " AND fechaRecepcion>=? AND fechaRecepcion<?").get(desdeIso, hastaIso).n;
      const b = db.prepare("SELECT COUNT(*) n FROM b2b_ingresos WHERE estado NOT IN " + EXC + " AND fechaRecepcion>=? AND fechaRecepcion<?").get(desdeIso, hastaIso).n;
      return { b2c: c, b2b: b };
    };
    // Un "corte" define la hora tope (en horas Perú) y la franja previa (desde el corte anterior).
    // 9am: 0→9 | 1pm: 9→13 | 6pm: 13→18 | medianoche: 18→24
    const CORTES = { '9am': [0, 9], '09:00': [0, 9], '1pm': [9, 13], '13:00': [9, 13], '6pm': [13, 18], '18:00': [13, 18], 'medianoche': [18, 24], '23:59': [18, 24], '00:00': [18, 24] };
    const [hIni, hFin] = CORTES[corte] || [0, Math.min(24, Math.ceil((Date.now() - new Date(new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10) + 'T00:00:00Z').getTime() - 5 * 3600000) / 3600000))];
    // Medianoche Perú de un día (offset en días desde hoy) en ISO UTC + hora h.
    const hoyDia0 = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const isoDe = (offDias, h) => new Date(new Date(hoyDia0 + 'T00:00:00Z').getTime() + 5 * 3600000 - offDias * 86400000 + h * 3600000).toISOString();
    // Para cada día (0=hoy,1=ayer,2=antier): acumulado 0→hFin y franja hIni→hFin.
    const dia = off => ({ acum: cuenta(isoDe(off, 0), isoDe(off, hFin)), franja: cuenta(isoDe(off, hIni), isoDe(off, hFin)) });
    const datos = { corte, franjaHoras: [hIni, hFin], hoy: dia(0), ayer: dia(1), antier: dia(2), fechaTxt };
    return await iaReportes.interpretarMarketing(datos);
  }
  return null;
}

app.get('/api/ia/reporte/preview', async (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || u.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  if (!iaReportes.configurado()) return res.status(422).json({ error: 'Falta ANTHROPIC_API_KEY en Railway' });
  const tipo = ['gestion', 'planes', 'marketing', 'performance', 'comite'].includes(req.query.tipo) ? req.query.tipo : 'gestion';
  try {
    const texto = await generarReporteIA(tipo, req.query.corte, req.query.asesor);
    res.json({ tipo, corte: req.query.corte || null, texto: texto || '(la IA no devolvió texto; en producción se usaría la plantilla clásica)', usoIA: !!texto });
  } catch (e) { console.error('[ia preview] error:', e.stack || e.message); res.json({ tipo, error: e.message, texto: '(error al generar; fallback a plantilla)', usoIA: false }); }
});

app.post('/api/ia/reporte/enviar', async (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || u.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  if (!iaReportes.configurado()) return res.status(422).json({ error: 'Falta ANTHROPIC_API_KEY en Railway' });
  const jid = process.env.WA_GRUPO_IA_TEST_JID;
  if (!jid) return res.status(422).json({ error: 'Falta WA_GRUPO_IA_TEST_JID en Railway' });
  const tipo = (req.body && ['gestion', 'planes', 'marketing', 'performance'].includes(req.body.tipo)) ? req.body.tipo : 'gestion';
  const corte = req.body && req.body.corte;
  try {
    const texto = await generarReporteIA(tipo, corte);
    if (!texto) return res.json({ ok: false, motivo: 'IA no devolvió texto (sin datos o API caída)' });
    await enviarAlertaWA('🤖 *[PRUEBA IA]*\n' + texto, jid);
    auditar(req, 'ia_reporte_prueba', null, `tipo=${tipo} corte=${corte || ''}`);
    res.json({ ok: true, tipo, enviadoA: jid, texto });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SLA por etapa B2B: leer (todos) y guardar overrides en horas. Admin/jefes.
app.get('/api/b2b/sla-etapas', soloB2B, (req, res) => {
  res.json({ etapas: getEtapaSLA(), defaults: ETAPA_SLA_DEFAULT });
});
app.put('/api/b2b/sla-etapas', soloB2B, (req, res) => {
  if (!['admin', 'jefe_creditos', 'jefe_b2b'].includes(req.user.rol)) return res.status(403).json({ error: 'Solo jefatura o admin' });
  const b = (req.body && req.body.etapas) || {};
  const ov = {};
  for (const k in ETAPA_SLA_DEFAULT) {
    const h = b[k] && Number(b[k].horas);
    if (isFinite(h) && h > 0) ov[k] = { horas: Math.round(h * 100) / 100 };
  }
  db.prepare("INSERT INTO app_config (clave,valor) VALUES ('sla_etapas',?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor").run(JSON.stringify(ov));
  auditar(req, 'b2b_sla_etapas', null, Object.keys(ov).map(k => k + '=' + ov[k].horas + 'h').join(' · '));
  res.json({ ok: true, etapas: getEtapaSLA() });
});

// Reprocesa ingresos B2B que quedaron en error (p.ej. el bug 'ruc is not defined' previo a v1.269).
// Toma el rawJson original, lo re-normaliza y lo pasa por el flujo YA corregido. Idempotente por dedup.
app.post('/api/b2b/reprocesar-errores', soloB2B, (req, res) => {
  if (!['admin', 'jefe_creditos', 'jefe_b2b'].includes(req.user.rol)) return res.status(403).json({ error: 'Solo jefatura o admin' });
  const desde = (req.body && req.body.desde) || null; // ISO 'YYYY-MM-DD' o completo; opcional
  let filas = desde
    ? db.prepare("SELECT * FROM b2b_ingresos WHERE estado='error_validacion' AND fechaRecepcion >= ? ORDER BY id ASC").all(desde)
    : db.prepare("SELECT * FROM b2b_ingresos WHERE estado='error_validacion' ORDER BY id ASC").all();
  const r = { total: filas.length, creados: 0, duplicados: 0, sinDatos: 0, fallidos: 0, detalle: [] };
  for (const ing of filas) {
    let norm;
    try {
      const raw = ing.rawJson ? JSON.parse(ing.rawJson) : {};
      norm = normalizarB2B((ing.origen || 'meta'), raw);
    } catch (e) { r.fallidos++; r.detalle.push({ id: ing.id, estado: 'no_normaliza', msg: e.message }); continue; }
    try {
      const out = procesarSolicitudB2B(norm, { fechaIngreso: ing.fechaRecepcion || undefined });
      // Actualiza el ingreso viejo con el nuevo desenlace (deja de estar en error).
      db.prepare("UPDATE b2b_ingresos SET estado=?, codigoSolicitud=?, mensajeError=? WHERE id=?")
        .run(out.estado, out.codigoSolicitud || null, out.mensajeError || 'Reprocesado', ing.id);
      if (out.estado === 'creado') r.creados++;
      else if (out.estado === 'duplicado_activo' || out.estado === 'duplicado_historial') r.duplicados++;
      else if (out.estado === 'sin_datos') r.sinDatos++;
      r.detalle.push({ id: ing.id, ruc: ing.ruc, estado: out.estado, codigo: out.codigoSolicitud || null });
    } catch (e) { r.fallidos++; r.detalle.push({ id: ing.id, estado: 'error', msg: e.message }); }
  }
  auditar(req, 'b2b_reprocesar_errores', null, `${r.creados} creados / ${r.duplicados} dup / ${r.fallidos} fallidos${desde ? ' desde ' + desde : ''}`);
  res.json(r);
});

// Reportes de leads por franja (marketing): preview y envio manual sin boton en el CRM (solo admin).
app.get('/api/marketing/reporte/preview', (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || u.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  const corte = ['09:00', '13:00', '18:00', '23:59'].includes(req.query.corte) ? req.query.corte : '13:00';
  res.json({ corte, jidConfigurado: !!process.env.WA_GRUPO_MKT_JID, texto: watchdogLeads.generarReporte(corte) });
});
// Preview de los cortes B2C (3x5 por GP + gestión). No envía nada. Solo admin.
// ?corte=9am|1pm|6pm  ·  &gestion=1 para ver el reporte de gestión consolidado.
app.get('/api/b2c/reporte/preview', (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || u.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  const corte = ['9am', '1pm', '6pm'].includes(req.query.corte) ? req.query.corte : '9am';
  if (req.query.gestion === '1') {
    return res.json({ corte, tipo: 'gestion', texto: alertasWA.reporteGestion(corte === '6pm' ? '6pm' : '1pm') || '(sin datos)' });
  }
  const planes = alertasWA.generarPlanes(corte); // [{gestora, texto}]
  res.json({ corte, tipo: 'planes', planes });
});
// Envío manual de un corte B2C AHORA (planes + gestión si aplica). Solo admin.
app.post('/api/b2c/reporte/enviar', async (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || u.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  const corte = ['9am', '1pm', '6pm'].includes(req.body && req.body.corte) ? req.body.corte : '9am';
  const n = await alertasWA.enviarCorteAhora(corte);
  res.json({ ok: true, corte, gestoras: n });
});

app.post('/api/marketing/reporte/enviar', async (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || u.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  if (!process.env.WA_GRUPO_MKT_JID) return res.status(422).json({ error: 'Falta WA_GRUPO_MKT_JID' });
  const corte = ['09:00', '13:00', '18:00', '23:59'].includes(req.body && req.body.corte) ? req.body.corte : '13:00';
  const ok = await watchdogLeads.enviarCorte(corte);
  res.json({ ok, corte });
});

// Estado del bot WhatsApp + cola de alertas. Para el indicador en el header y diagnóstico.
// GET /api/wa/estado -> { bot: 'activo'|'caido'|'sin_config', pendientes, fallidas, ultimaFallida }
app.get('/api/wa/estado', async (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u) return res.status(401).json({ error: 'Sin sesión' });
  let bot = 'sin_config';
  if (process.env.WA_BOT_URL && process.env.WA_BOT_TOKEN) {
    // Ping ligero: intentamos el root del bot con timeout corto.
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(process.env.WA_BOT_URL.replace(/\/$/, '') + '/', { signal: ctrl.signal });
      clearTimeout(t);
      bot = r.ok ? 'activo' : 'caido';
    } catch (e) { clearTimeout(t); bot = 'caido'; }
  }
  let pendientes = 0, fallidas = 0, ultimaFallida = null;
  try {
    pendientes = db.prepare("SELECT COUNT(*) n FROM wa_cola WHERE estado='pendiente'").get().n;
    fallidas = db.prepare("SELECT COUNT(*) n FROM wa_cola WHERE estado='fallida'").get().n;
    const uf = db.prepare("SELECT creado, ultimoError FROM wa_cola WHERE estado IN ('pendiente','fallida') ORDER BY id DESC LIMIT 1").get();
    if (uf) ultimaFallida = { fecha: uf.creado, error: uf.ultimoError };
  } catch (e) {}
  res.json({ bot, pendientes, fallidas, ultimaFallida });
});

// Reintenta AHORA todas las pendientes de la cola (botón manual). Solo admin/jefes.
app.post('/api/wa/cola/reintentar', async (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u || !['admin', 'jefe_b2b', 'jefe_creditos', 'jefa'].includes(u.rol)) return res.status(403).json({ error: 'Sin permiso' });
  try { db.prepare("UPDATE wa_cola SET estado='pendiente' WHERE estado='fallida'").run(); } catch (e) {}
  await procesarColaWA();
  const pendientes = db.prepare("SELECT COUNT(*) n FROM wa_cola WHERE estado='pendiente'").get().n;
  res.json({ ok: true, pendientes });
});

app.get('/api/b2b/alertas-wa/preview', soloB2B, (req, res) => {
  if (!['admin', 'jefe_b2b'].includes(req.user.rol)) return res.status(403).json({ error: 'Solo admin o jefe B2B' });
  const corte = ['6pm', '1pm', '9am'].includes(req.query.corte) ? req.query.corte : '9am';
  res.json({ corte, jidConfigurado: !!process.env.WA_GRUPO_B2B_JID, texto: alertasWAB2B.generarCorte(corte) || '(sin contenido: no hay solicitudes activas)' });
});
app.post('/api/b2b/alertas-wa/enviar', soloB2B, async (req, res) => {
  if (!['admin', 'jefe_b2b'].includes(req.user.rol)) return res.status(403).json({ error: 'Solo admin o jefe B2B' });
  if (!process.env.WA_GRUPO_B2B_JID) return res.status(422).json({ error: 'Configura WA_GRUPO_B2B_JID en Railway primero' });
  const corte = (req.body && ['6pm', '1pm', '9am'].includes(req.body.corte)) ? req.body.corte : '9am';
  const ok = await alertasWAB2B.enviarCorteAhora(corte);
  auditar(req, 'b2b_wa_corte_manual', null, corte);
  res.json({ ok, corte });
});

// Resumen de gestión diaria por asesor (para el jefe comercial). opts.asesores = filtrar personas.
app.get('/api/b2b/resumen-gestion/preview', soloB2B, (req, res) => {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  const asesores = req.query.asesores ? String(req.query.asesores).split(',').map(s => s.trim()).filter(Boolean) : null;
  const texto = alertasWAB2B.resumenGestionPorAsesor({ asesores });
  res.json({ jidConfigurado: !!process.env.WA_GRUPO_B2B_JID, texto: texto || '(sin actividad registrada hoy para los asesores indicados)' });
});
app.post('/api/b2b/resumen-gestion/enviar', soloB2B, async (req, res) => {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  if (!process.env.WA_GRUPO_B2B_JID) return res.status(422).json({ error: 'Configura WA_GRUPO_B2B_JID en Railway primero' });
  const asesores = (req.body && req.body.asesores) ? req.body.asesores : null;
  const texto = await alertasWAB2B.enviarResumenGestion({ asesores });
  auditar(req, 'b2b_wa_resumen_gestion', null, asesores ? asesores.join(',') : 'todos');
  res.json({ ok: !!texto, texto });
});

// Guarda qué asesores incluir en el resumen AUTOMÁTICO (9am/1pm/6pm). null/[] = todos.
app.post('/api/b2b/resumen-gestion/config', soloB2B, (req, res) => {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  const asesores = (req.body && Array.isArray(req.body.asesores)) ? req.body.asesores : null;
  db.prepare("INSERT OR REPLACE INTO app_config (clave,valor) VALUES ('b2b_resumen_asesores',?)").run(asesores && asesores.length ? JSON.stringify(asesores) : '');
  auditar(req, 'b2b_resumen_config', null, asesores ? asesores.join(',') : 'todos');
  res.json({ ok: true, asesores });
});
// Lee la config actual del resumen automático (qué asesores + si está activo).
app.get('/api/b2b/resumen-gestion/config', soloB2B, (req, res) => {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  let asesores = null;
  try { const c = db.prepare("SELECT valor FROM app_config WHERE clave='b2b_resumen_asesores'").get(); if (c && c.valor) asesores = JSON.parse(c.valor); } catch (e) {}
  res.json({ asesores: Array.isArray(asesores) ? asesores : null });
});

// Envía un MENSAJE LIBRE al grupo B2B (para motivar, avisos puntuales, etc.).
// POST /api/b2b/wa/mensaje  { texto }
app.post('/api/b2b/wa/mensaje', soloB2B, async (req, res) => {
  if (!['admin', 'jefe_b2b'].includes(req.user.rol)) return res.status(403).json({ error: 'Solo admin o jefe B2B' });
  if (!process.env.WA_GRUPO_B2B_JID) return res.status(422).json({ error: 'Configura WA_GRUPO_B2B_JID en Railway primero' });
  const texto = String((req.body && req.body.texto) || '').trim();
  if (!texto) return res.status(400).json({ error: 'Falta el texto del mensaje' });
  if (texto.length > 2000) return res.status(400).json({ error: 'Mensaje demasiado largo (máx 2000 caracteres)' });
  try {
    const ok = await enviarAlertaWA(texto, process.env.WA_GRUPO_B2B_JID);
    auditar(req, 'b2b_wa_mensaje_libre', null, texto.slice(0, 80));
    res.json({ ok: !!ok });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Mensaje LIBRE al grupo B2C (grupo por defecto del bot, donde llegan los cortes B2C).
// POST /api/b2c/wa/mensaje  { texto }
app.post('/api/b2c/wa/mensaje', soloAdminOJefa, async (req, res) => {
  const texto = String((req.body && req.body.texto) || '').trim();
  if (!texto) return res.status(400).json({ error: 'Falta el texto del mensaje' });
  if (texto.length > 2000) return res.status(400).json({ error: 'Mensaje demasiado largo (máx 2000 caracteres)' });
  try {
    // Sin JID → cae al grupo por defecto del bot (el de B2C/leads), igual que los cortes B2C.
    const ok = await enviarAlertaWA(texto, process.env.WA_GRUPO_LEADS_JID || undefined);
    auditar(req, 'b2c_wa_mensaje_libre', null, texto.slice(0, 80));
    res.json({ ok: !!ok });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/b2b/solicitudes/:codigo/trazabilidad', soloB2B, (req, res) => {
  const s = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const filas = db.prepare("SELECT fecha, nombre, usuario, accion, detalle FROM auditoria WHERE objetivo=? AND accion LIKE 'b2b\\_%' ESCAPE '\\' ORDER BY fecha DESC LIMIT 200").all(s.codigo);
  // v1.397: llamadas Aircall matcheadas a esta solicitud (mismo loop que B2C).
  let llamadas = [];
  try {
    llamadas = db.prepare('SELECT fecha, direccion, contestada, duracion, agente FROM llamadas WHERE codigoB2B = ? ORDER BY fecha ASC').all(s.codigo);
  } catch (e) { }
  res.json({ eventos: filas, llamadas });
});

app.put('/api/b2b/solicitudes/:codigo/descartar', soloB2B, (req, res) => {
  const s = db.prepare('SELECT * FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const motivo = (req.body && req.body.motivo && String(req.body.motivo).trim()) || 'No contactable';
  // COMPUERTA (v1.365): para desestimar, el funcionario DEBE haber registrado su gestión
  // en el modal (al menos un intento o contacto). Sin gestión registrada = bloqueo absoluto
  // (nadie puede, ni jefatura): primero se registra el trabajo, luego se acciona la bandera roja.
  const e33 = dashB2B.estado3x3PorCodigo(s.codigo);
  if (e33 && e33.exigible && !dashB2B.tieneGestionRegistrada(s.codigo)) {
    return res.status(422).json({
      error: 'Para desestimar, primero registra tu gestión (un intento o contacto) en el modal de gestión.',
      bloqueoGestion: true });
  }
  // COMPUERTA (nueva): si la solicitud YA llegó a etapa de crédito o más avanzada, desestimar
  // exige tener completos los datos de evaluación: empresa + representante legal (si RUC 20) +
  // link de Drive con documentos. Cada consulta cuesta, así que un desestimado en créditos debe
  // quedar documentado para que los motivos alimenten el análisis de marketing.
  const colActual = etapaKanbanB2B(s);
  const ETAPAS_CREDITO_MAS = ['Filtro credito', 'Filtro garantia', 'Reunion comercial', 'Filtro finanzas', 'Business case'];
  if (ETAPAS_CREDITO_MAS.includes(colActual)) {
    const sujetos = db.prepare('SELECT tipoSujeto, nombre, documento FROM b2b_credito_sujetos WHERE codigoSolicitud=?').all(s.codigo);
    const faltas = [];
    // Empresa: debe existir el sujeto empresa con nombre y documento (o al menos razonSocial + RUC en la solicitud).
    const tieneEmpresa = sujetos.some(x => x.tipoSujeto === 'empresa' && (x.nombre || '').trim()) || ((s.razonSocial || '').trim() && (s.ruc || '').trim());
    if (!tieneEmpresa) faltas.push('datos de la empresa');
    // Representante legal: obligatorio si el RUC es de persona jurídica (empieza en 20).
    if (String(s.ruc || '').trim().startsWith('20')) {
      const tieneRL = sujetos.some(x => x.tipoSujeto === 'representante' && (x.nombre || '').trim());
      if (!tieneRL) faltas.push('representante legal');
    }
    // Vinculada: solo si aplica. Se considera que "aplica" cuando ya se agregó al menos una vinculada
    // pero quedó incompleta (sin nombre). Si no hay ninguna, no se exige (puede no tener).
    const vinculadasIncompletas = sujetos.filter(x => x.tipoSujeto === 'vinculada' && !(x.nombre || '').trim());
    if (vinculadasIncompletas.length) faltas.push('completar la(s) empresa(s) vinculada(s)');
    // Link de Drive con los documentos.
    if (!(s.creditoLinkDrive || '').trim()) faltas.push('link de Drive con los documentos');

    if (faltas.length) {
      return res.status(422).json({
        error: 'Para desestimar un lead en crédito, primero completa: ' + faltas.join(', ') + '. Cada consulta tiene costo — el expediente debe quedar documentado.',
        bloqueoDatos: true, faltas });
    }
  }
  db.prepare("UPDATE b2b_solicitudes SET estado='No elegible', motivoDescarte=? WHERE codigo=?").run(motivo, s.codigo);
  auditar(req, 'b2b_descartar', s.codigo, motivo);
  res.json({ ok: true });
});

// Reactivar un desestimado (vuelve al tablero como Nuevo → se re-triajea por SUNAT).
app.put('/api/b2b/solicitudes/:codigo/reactivar', soloB2B, (req, res) => {
  const s = db.prepare('SELECT codigo FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  db.prepare("UPDATE b2b_solicitudes SET estado='Nuevo', motivoDescarte=NULL, archivado=0 WHERE codigo=?").run(s.codigo);
  auditar(req, 'b2b_reactivar', s.codigo, 'reingreso al tablero');
  res.json({ ok: true });
});

// Reconsulta SUNAT a pedido (botón "Validar SUNAT" en la ficha). Espera el resultado y lo devuelve.
app.post('/api/b2b/solicitudes/:codigo/sunat', soloB2B, async (req, res) => {
  const sol = db.prepare('SELECT codigo, ruc FROM b2b_solicitudes WHERE codigo=?').get(req.params.codigo);
  if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const rucManual = req.body && req.body.ruc ? String(req.body.ruc).trim() : null;
  // Si viene un RUC nuevo, guárdalo ANTES para que la consulta valide ese RUC.
  if (rucManual && rucManual !== sol.ruc) db.prepare('UPDATE b2b_solicitudes SET ruc=? WHERE codigo=?').run(rucManual, sol.codigo);
  const r = await enriquecerSunat(sol.codigo, rucManual ? { ruc: rucManual } : {});
  auditar(req, 'b2b_validar_sunat', sol.codigo, r.ok ? 'ok' : (r.motivo || 'error'));
  const fresh = db.prepare('SELECT ruc, sunatRaw, sunatEstado, sunatVerificadoEn, razonSocial, sunatDepartamento, sunatDistrito FROM b2b_solicitudes WHERE codigo=?').get(sol.codigo);
  res.json({ ok: r.ok, motivo: r.motivo || null, mensaje: r.mensaje || null, solicitud: fresh });
});

// Bandeja de ingresos B2B (lo que llegó por webhook: creados y duplicados para revisión).
app.get('/api/b2b/ingresos', soloB2B, (req, res) => {
  const estado = (req.query.estado || '').trim();
  let filas = db.prepare('SELECT * FROM b2b_ingresos ORDER BY id DESC LIMIT 500').all();
  // El resumen siempre refleja el TOTAL (no el filtro), para que los chips muestren los conteos reales.
  const resumen = {};
  let total = 0;
  db.prepare('SELECT estado, COUNT(*) c FROM b2b_ingresos GROUP BY estado').all().forEach(r => { resumen[r.estado] = r.c; total += r.c; });
  if (estado) filas = filas.filter(i => i.estado === estado);
  res.json({ ingresos: filas, total, resumen });
});

// Detalle de un ingreso B2B (incluye rawJson para inspección).
app.get('/api/b2b/ingresos/:id', soloB2B, (req, res) => {
  const i = db.prepare('SELECT * FROM b2b_ingresos WHERE id = ?').get(req.params.id);
  if (!i) return res.status(404).json({ error: 'No encontrado' });
  res.json(i);
});

// Descartar un ingreso B2B (no crea solicitud).
app.post('/api/b2b/ingresos/:id/descartar', soloB2B, (req, res) => {
  const i = db.prepare('SELECT * FROM b2b_ingresos WHERE id = ?').get(req.params.id);
  if (!i) return res.status(404).json({ error: 'No encontrado' });
  db.prepare("UPDATE b2b_ingresos SET estado='descartado', mensajeError=? WHERE id=?")
    .run((req.body && req.body.motivo) || 'Descartado manualmente', req.params.id);
  auditar(req, 'b2b_ingreso_descartar', String(req.params.id), i.razonSocial || i.ruc || '');
  res.json({ ok: true });
});

// Reprocesar un ingreso B2B: reintenta crear la solicitud desde el rawJson.
app.post('/api/b2b/ingresos/:id/reprocesar', soloB2B, (req, res) => {
  const i = db.prepare('SELECT * FROM b2b_ingresos WHERE id = ?').get(req.params.id);
  if (!i) return res.status(404).json({ error: 'No encontrado' });
  let payload = {};
  try { payload = JSON.parse(i.rawJson || '{}'); } catch (e) { return res.status(400).json({ error: 'JSON inválido en el ingreso' }); }
  try {
    const norm = normalizarB2B(i.origen || 'meta', payload);
    const r = procesarSolicitudB2B(norm);
    db.prepare("UPDATE b2b_ingresos SET estado=?, codigoSolicitud=?, mensajeError=? WHERE id=?")
      .run(r.estado, r.codigoSolicitud || i.codigoSolicitud || null, r.mensajeError || null, req.params.id);
    auditar(req, 'b2b_ingreso_reprocesar', String(req.params.id), r.codigoSolicitud || '');
    res.json({ ok: true, resultado: r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Crear solicitud (forzada) desde un ingreso B2B, aunque sea duplicado.
app.post('/api/b2b/ingresos/:id/crear', soloB2B, (req, res) => {
  const i = db.prepare('SELECT * FROM b2b_ingresos WHERE id = ?').get(req.params.id);
  if (!i) return res.status(404).json({ error: 'No encontrado' });
  let payload = {};
  try { payload = JSON.parse(i.rawJson || '{}'); } catch (e) { return res.status(400).json({ error: 'JSON inválido' }); }
  try {
    const norm = normalizarB2B(i.origen || 'meta', payload);
    const r = procesarSolicitudB2B(norm, { forzar: true });
    db.prepare("UPDATE b2b_ingresos SET estado='creado', codigoSolicitud=?, mensajeError=NULL WHERE id=?")
      .run(r.codigoSolicitud || null, req.params.id);
    auditar(req, 'b2b_ingreso_crear_forzado', String(req.params.id), r.codigoSolicitud || '');
    res.json({ ok: true, codigoSolicitud: r.codigoSolicitud });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Eliminar un ingreso B2B (solo admin).
app.delete('/api/b2b/ingresos/:id', soloAdmin, (req, res) => {
  const i = db.prepare('SELECT * FROM b2b_ingresos WHERE id = ?').get(req.params.id);
  if (!i) return res.status(404).json({ error: 'No encontrado' });
  db.prepare('DELETE FROM b2b_ingresos WHERE id = ?').run(req.params.id);
  auditar(req, 'b2b_ingreso_eliminar', String(req.params.id), i.razonSocial || i.ruc || '');
  res.json({ ok: true });
});

// Scorecards del tablero B2B: totales por columna, potencial estimado, vencidos, con observación, calientes.
app.get('/api/b2b/resumen', soloB2B, (req, res) => {
  let filas = db.prepare("SELECT codigo, ruc, razonSocial, nombreComercial, contacto, telefono, montoSolicitado, montoRango, ticket, estado, sunatEstado, responsableActual, funcionario, asistente, fechaEtapa, fechaEtapaCol, archivado FROM b2b_solicitudes").all();
  filas = filtrarPorAlcanceB2B(req.user, filas);
  const sem = semaforosB2BPorCodigo(filas.map(f => f.codigo));
  let activos = 0, potencial = 0, vencidos = 0, conObs = 0, calientes = 0, expediente = 0;
  const porColumna = {};
  COLUMNAS_KANBAN_B2B.forEach(c => { porColumna[c] = { n: 0, potencial: 0 }; });
  for (const f of filas) {
    const col = etapaKanbanB2B(f);
    if (col === 'Desestimado') continue;
    activos++;
    const monto = f.montoSolicitado != null ? Number(f.montoSolicitado) : (montoRangoFijo(f.montoRango) || 0);
    potencial += monto || 0;
    porColumna[col].n++; porColumna[col].potencial += monto || 0;
    const sla = slaEtapaB2B(col, f.fechaEtapa);
    if (sla.vencido) vencidos++;
    if (col === 'Solicitud' && observacionesB2B(f).length) conObs++;
    const pj = puntajeB2B(f, sem[f.codigo] || {});
    if (pj.prob >= 60) calientes++;
    if (col === 'Business case') expediente++;
  }
  res.json({ activos, potencial, vencidos, conObs, calientes, expediente, porColumna });
});

app.post('/api/b2b/solicitudes', soloB2B, (req, res) => {
  // v1.263: el alta manual queda solo para admin y jefes (los funcionarios/créditos reciben leads del embudo).
  if (!['admin', 'jefe_creditos', 'jefe_b2b'].includes(req.user.rol)) return res.status(403).json({ error: 'Solo jefatura o admin pueden crear solicitudes manuales' });
  const b = req.body || {};
  // Alta mínima: basta con RUC, razón social o contacto (el resto se completa después).
  if (!b.razonSocial && !b.ruc && !b.contacto) return res.status(400).json({ error: 'Ingresa al menos RUC o nombre de contacto' });
  const codigo = generarCodigoB2B();
  const ahora = new Date().toISOString();
  // Monto: numérico directo; si no vino pero hay rango, usar el valor fijo del tramo (100k/400k/1M).
  let monto = b.montoSolicitado != null && b.montoSolicitado !== '' ? Number(b.montoSolicitado) : null;
  if ((monto == null || !isFinite(monto)) && b.montoRango) monto = montoRangoFijo(b.montoRango);
  const ticket = monto != null && isFinite(monto) ? ticketDeMonto(monto) : null;
  db.prepare(`INSERT INTO b2b_solicitudes
    (codigo, ruc, razonSocial, nombreComercial, contacto, telefono, email, fuente, campana,
     montoSolicitado, montoRango, ticket, sector, actividad, antiguedadMeses, ventasEstimadas, destinoFondos, fuenteRepago,
     estado, asistente, responsableActual, fechaIngreso)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(codigo, b.ruc || null, b.razonSocial || null, b.nombreComercial || null, b.contacto || null,
      b.telefono || null, b.email || null, b.fuente || 'Manual', b.campana || null,
      monto, b.montoRango || null, ticket, b.sector || null, b.actividad || null,
      b.antiguedadMeses != null && b.antiguedadMeses !== '' ? Number(b.antiguedadMeses) : null,
      b.ventasEstimadas != null && b.ventasEstimadas !== '' ? Number(b.ventasEstimadas) : null,
      b.destinoFondos || null, b.fuenteRepago || null,
      'Nuevo', req.user.nombre, req.user.nombre, ahora);
  auditar(req, 'b2b_alta_solicitud', codigo, (b.razonSocial || b.contacto || b.ruc || '') + (ticket ? ' · ticket ' + ticket : ''));
  enriquecerSunatYAvisar(codigo, !!b.ruc); // SUNAT primero, luego el aviso WA (también en alta manual)
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
  let creados = 0, yaExistian = 0, noEncontrados = 0, montoTotal = 0;
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
      montoTotal += Number(re.montoReal) || 0;
      updRe.run(codigo, asesor, ahora, tel);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: String(e.message || e) });
  }
  // Aviso por correo a la GP por cada lead nuevo creado desde releads.
  nuevosCods.forEach(c => notificarAsignacion(db.prepare('SELECT * FROM leads WHERE codigo = ?').get(c), asesor));
  // Aviso WhatsApp AGREGADO (un solo mensaje por lote, para no spamear el grupo con asignaciones masivas).
  const totalAsig = creados + yaExistian;
  if (totalAsig > 0) {
    const gpCorto = String(asesor).trim().split(/\s+/)[0] || asesor;
    const txt = `♻️ *Releads asignados* — ${gpCorto}\nSe te asignaron *${totalAsig} lead${totalAsig === 1 ? '' : 's'}* de campañas anteriores`
      + (montoTotal > 0 ? ` (S/ ${Math.round(montoTotal).toLocaleString('es-PE')} en potencial)` : '')
      + `.\n👉 Revísalos en tu cartera y contáctalos.`;
    enviarAlertaWA(txt);
  }
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

// ===== Reporte diario por correo (Ranking del día), a las 23:59 hora Perú, antes del reinicio =====
const REPORTE_EMAIL = process.env.REPORTE_EMAIL || process.env.CORREO_PRUEBA || '';
const peruAhora = () => new Date(new Date().getTime() - 5 * 3600000);

// Marca persistente de "ya enviado hoy": evita que un reinicio (deploy) reenvíe los cortes.
db.exec('CREATE TABLE IF NOT EXISTS meta_kv (clave TEXT PRIMARY KEY, valor TEXT)');
const kvGet = c => { try { const r = db.prepare('SELECT valor FROM meta_kv WHERE clave=?').get(c); return r ? r.valor : null; } catch (e) { return null; } };
const kvSet = (c, v) => { try { db.prepare('INSERT INTO meta_kv (clave,valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor').run(c, v); } catch (e) { } };

function htmlRankingDia(r) {
  const rk = r.ranking || [], medalla = ['🥇', '🥈', '🥉'], g0 = rk[0];
  const filas = rk.map((g, i) => {
    const pos = i < 3 ? medalla[i] : (i + 1);
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${pos} ${g.asesor}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;font-weight:700">${g.puntaje}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${g.intentos}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${g.conectados}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${g.calificados}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;color:#1D9E75;font-weight:700">${g.agendados}</td>
    </tr>`;
  }).join('');
  const meta = r.metaGlobal || 8, equipo = r.agendadosEquipo || 0;
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
    <h2 style="margin:0 0 4px">🏆 Ranking del día</h2>
    <div style="color:#888;font-size:13px;margin-bottom:10px">${r.fecha}</div>
    ${g0 ? `<div style="background:#FFF7E6;border:1px solid #F0D9A0;border-radius:10px;padding:12px 14px;margin:10px 0">
      <div style="font-size:13px;color:#8a6d3b">Líder del día</div>
      <div style="font-size:21px;font-weight:700">${g0.asesor}</div>
      <div style="font-size:13px;color:#555">${g0.puntaje} puntos · ${g0.agendados} agendamientos · ${g0.conectados} conectados</div>
    </div>` : '<p>No hubo actividad registrada hoy.</p>'}
    <div style="margin:8px 0;font-size:14px">🎯 Meta del equipo: <b>${equipo}/${meta}</b> agendamientos ${equipo >= meta ? '✅' : ''}</div>
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:8px">
      <thead><tr style="background:#F7F8FA;color:#666">
        <th style="padding:6px 8px;text-align:left">Gestora</th><th style="padding:6px 8px">Puntos</th><th style="padding:6px 8px">Intentos</th><th style="padding:6px 8px">Conect.</th><th style="padding:6px 8px">Calif.</th><th style="padding:6px 8px">Agend.</th>
      </tr></thead><tbody>${filas}</tbody>
    </table>
    <p style="color:#aaa;font-size:11px;margin-top:14px">MiTasaTop · enviado automáticamente al cierre del día (23:59 Perú)</p>
  </div>`;
}

async function enviarReporteDiario() {
  if (!mailer.activo()) { console.log('[reporte] mailer inactivo'); return; }
  if (!REPORTE_EMAIL) { console.log('[reporte] falta REPORTE_EMAIL'); return; }
  try {
    const r = construirRankingDia();
    const destinos = REPORTE_EMAIL.split(',').map(s => s.trim()).filter(Boolean);
    for (const d of destinos) await mailer.enviar(d, `🏆 Ranking del día — ${r.fecha}`, htmlRankingDia(r));
    console.log('[reporte] Ranking del día enviado a', destinos.join(', '));
  } catch (e) { console.error('[reporte] error:', e.message); }
}

setInterval(() => {
  const a = peruAhora(), dia = a.toISOString().slice(0, 10);
  if (a.getUTCHours() === 23 && a.getUTCMinutes() >= 59 && kvGet('reporte_dia') !== dia) {
    kvSet('reporte_dia', dia);
    enviarReporteDiario();
  }
}, 60 * 1000);

// ===== Alertas WhatsApp programadas (matutino 9am + pulsos 1pm/6pm) =====
const primerNombreWA = n => String(n || '').trim().split(/\s+/)[0] || n;

// Texto del saludo matutino: leads sin tocar (ayer + hoy<9am + rezagados +2d), por GP.
function textoMatutinoWA() {
  const gAll = db.prepare('SELECT codigo FROM gestiones').all();
  const conGestion = new Set(gAll.map(g => g.codigo));
  const leads = db.prepare("SELECT codigo,nombre,asesor,fechaCarga FROM leads WHERE COALESCE(archivado,0)=0 AND COALESCE(origenCreacion,'') <> 'manual'").all();
  const hoy = peruFecha(new Date().toISOString());
  const ayer = peruFecha(new Date(Date.now() - 24 * 3600000).toISOString());
  const horaPeru = iso => new Date(new Date(iso).getTime() - 5 * 3600000).getUTCHours();
  const buckets = { ayer: {}, hoy: {}, rezagados: {} };
  let total = 0;
  leads.forEach(l => {
    if (conGestion.has(l.codigo)) return;          // ya fue tocado
    if (!l.asesor) return;                          // sin asignar se ve en el panel, no aquí
    const dia = peruFecha(l.fechaCarga);
    let b = null;
    if (dia === hoy) { if (horaPeru(l.fechaCarga) < 9) b = 'hoy'; else return; } // solo los que llegaron antes de las 9
    else if (dia === ayer) b = 'ayer';
    else if (dia < ayer) b = 'rezagados';
    if (!b) return;
    const gp = primerNombreWA(l.asesor);
    (buckets[b][gp] = buckets[b][gp] || []).push(l.nombre);
    total++;
  });
  if (!total) return null;
  const bloque = (titulo, mapa) => {
    const gps = Object.keys(mapa); if (!gps.length) return '';
    const n = gps.reduce((s, g) => s + mapa[g].length, 0);
    let t = '\n' + titulo + ' (' + n + '):\n';
    t += gps.map(g => {
      const nombres = mapa[g];
      const muestra = nombres.slice(0, 3).join(', ') + (nombres.length > 3 ? ' +' + (nombres.length - 3) + ' más' : '');
      return '• ' + g + ': ' + muestra;
    }).join('\n');
    return t;
  };
  const fechaTxt = hoy.split('-').reverse().slice(0, 2).join('/');
  let msg = '☀️ *Buenos días, equipo* — ' + fechaTxt + '\nEstos leads están esperando:\n';
  msg += bloque('🕒 *Rezagados (+2 días)*', buckets.rezagados);
  msg += bloque('📌 *De ayer sin tocar*', buckets.ayer);
  msg += bloque('🌅 *De hoy, antes de las 9*', buckets.hoy);
  msg += '\n\n💪 ¡Vamos a por ellos!';
  return msg;
}

// Texto del pulso del equipo (1pm / 6pm): saludo + totales en filas + línea por GP.
function textoPulsoWA(horaLabel, emoji, titulo) {
  const rk = construirRankingDia();
  const agendPorGP = {}, califPorGP = {};
  (rk.ranking || []).forEach(r => { agendPorGP[r.asesor] = r.agendados || 0; califPorGP[r.asesor] = r.calificados || 0; });
  const gAll = db.prepare('SELECT codigo FROM gestiones').all();
  const conGestion = new Set(gAll.map(g => g.codigo));
  const leadsGanados = db.prepare('SELECT * FROM leads WHERE COALESCE(archivado,0)=0').all().map(l => leadConsolidado(l));
  const hoy = peruFecha(new Date().toISOString());
  const num = v => Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')) || 0;
  const montoLead = l => Number(l.pipelineEstimado) || num(l.montoPotencial);

  const porGP = {}; L.ASESORES.forEach(a => porGP[a] = { leadsHoy: 0, atendidos: 0, calif: califPorGP[a] || 0, agend: agendPorGP[a] || 0, cierres: 0 });
  let cierresMonto = 0, cierresN = 0;
  leadsGanados.forEach(l => {
    const dest = (l.asesor && porGP[l.asesor]) ? porGP[l.asesor] : null;
    if (l.fechaAsignacion && peruFecha(l.fechaAsignacion) === hoy && dest) {
      dest.leadsHoy++;
      if ((l.totalGestiones || 0) > 0) dest.atendidos++;
    }
    if (l.etapa === 'Cerrado ganado' && peruFecha(l.ultimaGestion || l.fechaCarga) === hoy) {
      cierresN++; cierresMonto += montoLead(l);
      if (dest) dest.cierres++;
    }
  });
  const tot = { leadsHoy: 0, atendidos: 0, calif: 0, agend: 0 };
  L.ASESORES.forEach(a => { tot.leadsHoy += porGP[a].leadsHoy; tot.atendidos += porGP[a].atendidos; tot.calif += porGP[a].calif; tot.agend += porGP[a].agend; });

  // Saludo según la hora de Perú al enviar
  const h = peruAhora().getUTCHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  // Etiqueta de hora: si no se pasa (preview), usa la hora actual de Perú
  const label = horaLabel || peruAhora().toISOString().slice(11, 16);

  let msg = saludo + ', equipo 👋\n';
  msg += (emoji || '📊') + ' *' + (titulo || 'Cómo Vamos') + '* — ' + label + '\n\n';
  msg += '🆕 Leads hoy: ' + tot.leadsHoy + '\n';
  msg += '✅ Atendidos: ' + tot.atendidos + '\n';
  msg += '⭐ Calificados: ' + tot.calif + '\n';
  msg += '📅 Agendados: ' + tot.agend + '\n';
  msg += '🏆 Cierres: ' + cierresN + (cierresN ? ' (S/ ' + Math.round(cierresMonto).toLocaleString('es-PE') + ')' : '') + '\n\n';
  msg += '👥 *Por GP:*\n';
  msg += L.ASESORES.map(a => {
    const g = porGP[a], nom = primerNombreWA(a);
    if (g.leadsHoy === 0 && g.atendidos === 0 && !g.calif && !g.agend && !g.cierres) return null;
    const partes = [g.leadsHoy + ' leads', g.atendidos + ' atend'];
    if (g.calif) partes.push(g.calif + ' calif');
    if (g.agend) partes.push(g.agend + ' agend');
    if (g.cierres) partes.push('🏆' + g.cierres);
    return nom + ' — ' + partes.join(' · ');
  }).filter(Boolean).join('\n');
  return msg;
}

function enviarMatutinoWA() { const t = textoMatutinoWA(); if (t) enviarAlertaWA(t); }
function enviarPulsoWA(horaLabel, emoji, titulo) { enviarAlertaWA(textoPulsoWA(horaLabel, emoji, titulo)); }

// Cierre del día (6pm): 2 reportes -> (1) gestión del día (leads trabajados hoy, nuevos + anteriores)
// y (2) seguimiento (pipeline post-agendamiento). Más completo que el pulso de la 1pm.
function textoCierreDiaWA() {
  const hoy = peruFecha(new Date().toISOString());
  const rk = construirRankingDia();
  const rkPorGP = {}; (rk.ranking || []).forEach(r => rkPorGP[r.asesor] = r);
  const ocultas = new Set(db.prepare("SELECT nombre FROM usuarios WHERE rol='gestora' AND COALESCE(rankingVisible,1)=0").all().map(u => u.nombre));
  const VIS = (L.ASESORES || []).filter(a => !ocultas.has(a));

  // ----- Reporte 1: Gestión del día (todos los leads trabajados hoy, no solo los nuevos) -----
  const leadAsign = {};
  db.prepare('SELECT codigo, fechaAsignacion, fechaCarga FROM leads').all().forEach(l => leadAsign[l.codigo] = l.fechaAsignacion || l.fechaCarga);
  const gestSet = {}; // asesor -> Set(codigos gestionados hoy)
  db.prepare('SELECT codigo, asesor, fecha FROM gestiones').all().forEach(g => {
    if (peruFecha(g.fecha) !== hoy) return;
    if (!g.asesor || ocultas.has(g.asesor)) return;
    (gestSet[g.asesor] = gestSet[g.asesor] || new Set()).add(g.codigo);
  });
  const gestPorGP = {}; VIS.forEach(a => gestPorGP[a] = { total: 0, hoy: 0, ant: 0 });
  Object.entries(gestSet).forEach(([a, set]) => {
    if (!gestPorGP[a]) gestPorGP[a] = { total: 0, hoy: 0, ant: 0 };
    set.forEach(cod => {
      gestPorGP[a].total++;
      const fa = leadAsign[cod];
      if (fa && peruFecha(fa) === hoy) gestPorGP[a].hoy++; else gestPorGP[a].ant++;
    });
  });
  const t1 = { total: 0, hoy: 0, ant: 0, llam: 0, conx: 0, calif: 0, agend: 0 };
  VIS.forEach(a => {
    const g = gestPorGP[a] || {}, r = rkPorGP[a] || {};
    t1.total += g.total || 0; t1.hoy += g.hoy || 0; t1.ant += g.ant || 0;
    t1.llam += r.llamadas || 0; t1.conx += r.conectados || 0; t1.calif += r.calificados || 0; t1.agend += r.agendados || 0;
  });

  // ----- Reporte 2: Seguimiento (pipeline post-agendamiento) -----
  const gFull = db.prepare('SELECT * FROM gestiones ORDER BY fecha').all();
  const gByCod = {}; gFull.forEach(x => (gByCod[x.codigo] = gByCod[x.codigo] || []).push(x));
  const activos = db.prepare('SELECT * FROM leads WHERE COALESCE(archivado,0)=0 AND COALESCE(cuarentena,0)=0').all().map(l => leadConsolidado(l, gByCod[l.codigo] || []));
  const num = v => Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')) || 0;
  const montoLead = l => Number(l.pipelineEstimado) || num(l.montoPotencial);
  const segPorGP = {}; VIS.forEach(a => segPorGP[a] = { ag: 0, reu: 0, neg: 0 });
  const t2 = { ag: 0, reu: 0, neg: 0 }; let cierresN = 0, cierresMonto = 0;
  activos.forEach(l => {
    if (l.asesor && ocultas.has(l.asesor)) return;
    const dest = (l.asesor && segPorGP[l.asesor]) ? segPorGP[l.asesor] : null;
    if (l.etapa === 'Agendado - pendiente reunion') { t2.ag++; if (dest) dest.ag++; }
    else if (l.etapa === 'Reunion efectiva - seguimiento') { t2.reu++; if (dest) dest.reu++; }
    else if (l.etapa === 'Cierre pendiente') { t2.neg++; if (dest) dest.neg++; }
    if (l.etapa === 'Cerrado ganado' && peruFecha(l.ultimaGestion || l.fechaCarga) === hoy) { cierresN++; cierresMonto += montoLead(l); }
  });

  // ----- Armado -----
  let msg = 'Buenas tardes, equipo 👋\n🌙 *Cierre del día* — 6:00 pm\n\n';
  msg += '📊 *Gestión del día*\n';
  msg += '👥 Leads gestionados: ' + t1.total + ' (' + t1.hoy + ' hoy · ' + t1.ant + ' anteriores)\n';
  msg += '📞 Llamadas: ' + t1.llam + '\n🔗 Conexiones: ' + t1.conx + '\n⭐ Calificados: ' + t1.calif + '\n📅 Agendados: ' + t1.agend + '\n';
  const l1 = VIS.map(a => {
    const g = gestPorGP[a] || {}, r = rkPorGP[a] || {};
    if (!(g.total) && !(r.llamadas) && !(r.agendados)) return null;
    return primerNombreWA(a) + ' — ' + (g.total || 0) + ' leads · ' + (r.llamadas || 0) + ' llam · ' + (r.conectados || 0) + ' conex · ' + (r.calificados || 0) + ' calif · ' + (r.agendados || 0) + ' agend';
  }).filter(Boolean);
  if (l1.length) msg += '\n👤 *Por GP:*\n' + l1.join('\n') + '\n';

  msg += '\n🔭 *Seguimiento (pipeline)*\n';
  msg += '📅 Agendados x reunir: ' + t2.ag + '\n🤝 En reunión: ' + t2.reu + '\n💼 En negociación: ' + t2.neg + '\n';
  msg += '🏆 Cierres hoy: ' + cierresN + (cierresN ? ' (S/ ' + Math.round(cierresMonto).toLocaleString('es-PE') + ')' : '') + '\n';
  const l2 = VIS.map(a => {
    const s = segPorGP[a] || {};
    if (!s.ag && !s.reu && !s.neg) return null;
    return primerNombreWA(a) + ' — 📅' + (s.ag || 0) + ' 🤝' + (s.reu || 0) + ' 💼' + (s.neg || 0);
  }).filter(Boolean);
  if (l2.length) msg += '\n👤 *Por GP:*\n' + l2.join('\n') + '\n';

  msg += '\n💪 ¡Buen cierre, mañana lo rematamos!';
  return msg;
}

// ===== Chequeo "¿atendido?" a los 10 min (solo leads en tiempo real, L-V 9am-6pm) =====
const WA_PENDIENTES = []; // { codigo, asesor, nombre, ts }
function enColaVerificacion(codigo, asesor, nombre) {
  if (codigo && asesor) WA_PENDIENTES.push({ codigo, asesor, nombre: nombre || 'el lead', ts: Date.now() });
}
// v1.408: cola de verificación B2B — si a los 30 min no hay gestión, alerta al grupo B2B.
const WA_PENDIENTES_B2B = [];
function enColaVerificacionB2B(codigo, responsable, nombre) {
  if (codigo && responsable) WA_PENDIENTES_B2B.push({ codigo, responsable, nombre: nombre || 'la empresa', ts: Date.now() });
}
function esHorarioLaboralWA() {
  const a = peruAhora(), d = a.getUTCDay(), h = a.getUTCHours();
  return d >= 1 && d <= 6 && h >= 9 && h < 18; // Lunes a Sábado, 9am-6pm Perú
}
setInterval(() => {
  const ahora = Date.now();
  for (let i = WA_PENDIENTES.length - 1; i >= 0; i--) {
    const p = WA_PENDIENTES[i];
    if (ahora - p.ts < 10 * 60 * 1000) continue;   // aún no cumple 10 min
    WA_PENDIENTES.splice(i, 1);                      // procesar una sola vez
    try {
      const tocado = db.prepare('SELECT 1 FROM gestiones WHERE codigo = ? LIMIT 1').get(p.codigo);
      if (tocado) continue;                          // ya fue atendido -> silencio
      if (!esHorarioLaboralWA()) continue;           // fuera de horario -> nada (lo recoge el saludo 9am)
      const lead = db.prepare('SELECT archivado FROM leads WHERE codigo = ?').get(p.codigo);
      if (!lead || lead.archivado) continue;         // lead ya no aplica
      const gpCorto = String(p.asesor).trim().split(/\s+/)[0] || p.asesor;
      enviarAlertaWA(`⚠️ *Sin atender (10 min)* — ${p.nombre}\n👤 ${gpCorto}, ¡no lo dejes enfriar! ⏱`);
    } catch (e) { /* silencioso */ }
  }
}, 60 * 1000);

// v1.408: verificación B2B — a los 30 min sin gestión, alerta al grupo B2B (mismo formato B2C).
setInterval(() => {
  const ahora = Date.now();
  for (let i = WA_PENDIENTES_B2B.length - 1; i >= 0; i--) {
    const p = WA_PENDIENTES_B2B[i];
    if (ahora - p.ts < 30 * 60 * 1000) continue;   // aún no cumple 30 min
    WA_PENDIENTES_B2B.splice(i, 1);                  // procesar una sola vez
    try {
      const tocado = db.prepare('SELECT 1 FROM b2b_gestiones WHERE codigoSolicitud = ? LIMIT 1').get(p.codigo);
      if (tocado) continue;                          // ya fue gestionado -> silencio
      if (!esHorarioLaboralWA()) continue;           // fuera de horario -> nada
      const sol = db.prepare('SELECT archivado, estado FROM b2b_solicitudes WHERE codigo = ?').get(p.codigo);
      if (!sol || sol.archivado || sol.estado === 'No elegible') continue; // ya no aplica
      const fCorto = String(p.responsable).trim().split(/\s+/)[0] || p.responsable;
      enviarAlertaWA(`⚠️ *Sin atender (30 min)* — ${p.nombre}\n👤 ${fCorto}, ¡no lo dejes enfriar! ⏱`, process.env.WA_GRUPO_B2B_JID || undefined);
    } catch (e) { /* silencioso */ }
  }
}, 60 * 1000);

setInterval(() => {
  const a = peruAhora(), dia = a.toISOString().slice(0, 10), h = a.getUTCHours();
  if (h === 9 && kvGet('wa_matutino') !== dia) { kvSet('wa_matutino', dia); enviarMatutinoWA(); }
  if (h === 13 && kvGet('wa_pulso13') !== dia) { kvSet('wa_pulso13', dia); enviarPulsoWA('1:00 pm', '📊', 'Cómo Vamos'); }
  if (h === 18 && kvGet('wa_pulso18') !== dia) { kvSet('wa_pulso18', dia); enviarAlertaWA(textoCierreDiaWA()); }
}, 60 * 1000);

// Endpoint para probar el envío manualmente (admin)
app.post('/api/admin/reporte-prueba', soloAdmin, async (req, res) => {
  await enviarReporteDiario();
  res.json({ ok: true, enviadoA: REPORTE_EMAIL || '(no configurado)', mailerActivo: mailer.activo() });
});

// Pruebas de alertas WhatsApp (admin): manda mensajes de muestra al grupo de pruebas.
app.post('/api/admin/wa-prueba', soloAdmin, async (req, res) => {
  const tipo = String((req.body || {}).tipo || 'conexion');
  const libre = (req.body || {}).texto;
  const hoy = new Date(new Date().getTime() - 5 * 3600000).toISOString().slice(0, 10).split('-').reverse().slice(0, 2).join('/');
  const muestras = {
    conexion: `✅ *Prueba de conexión* — CRM → bot OK\n🕒 ${new Date(new Date().getTime() - 5 * 3600000).toLocaleString('es-PE')}`,
    nuevo_lead: `🆕 *Nuevo lead* — Juan Pérez\n👤 Mafer · 💰 S/ 50,000`,
    venta: `🎉 *¡Cierre ganado!*\n👤 Mafer Lujan cerró a Juan Pérez\n💰 Monto: S/ 50,000\n👏 ¡Felicitaciones, equipo!`,
    tarea: `⏰ *Tarea vencida* — Mafer Lujan\n📌 Ana López · "Llamar para agendar"\n🗓 Venció hace 1 día\n👉 Reprográmala o gestiónala hoy.`,
    libre: libre || '🔔 Mensaje de prueba desde el CRM.'
  };
  let texto;
  if (tipo === 'matutino') texto = textoMatutinoWA() || '☀️ (Prueba) Por ahora no hay leads sin atender.';
  else if (tipo === 'pulso') texto = textoPulsoWA(null, '📊', 'Cómo Vamos');
  else if (tipo === 'cierre') texto = textoCierreDiaWA();
  else texto = muestras[tipo] || muestras.conexion;
  const url = process.env.WA_BOT_URL, token = process.env.WA_BOT_TOKEN;
  if (!url || !token) return res.json({ ok: false, error: 'Faltan WA_BOT_URL / WA_BOT_TOKEN en Railway.' });
  // Las pruebas SIEMPRE van al grupo de pruebas; si no hay uno configurado, se niegan
  // (así los botones de simulación nunca pueden postear al grupo oficial de ventas).
  const jidPrueba = process.env.WA_GRUPO_PRUEBAS_JID;
  if (!jidPrueba) return res.json({ ok: false, error: 'Configura WA_GRUPO_PRUEBAS_JID para probar sin tocar el grupo oficial.' });
  await enviarAlertaWA(texto, jidPrueba);
  res.json({ ok: true, enviadoA: 'grupo de pruebas', tipo });
});

// ===== Worker de la cola de alertas WhatsApp =====
// Cada 60s intenta reenviar las alertas pendientes (que fallaron por microcaídas del bot).
// Backoff: no reintenta una alerta más de 1 vez por ciclo; la marca 'fallida' tras 15 intentos
// (≈15 min) para no acumular basura, pero deja registro para inspección.
const WA_COLA_MAX_INTENTOS = 15;
async function procesarColaWA() {
  let pendientes;
  try { pendientes = db.prepare("SELECT * FROM wa_cola WHERE estado='pendiente' ORDER BY id ASC LIMIT 20").all(); }
  catch (e) { return; }
  if (!pendientes.length) return;
  for (const p of pendientes) {
    const r = await _postAlertaBot(p.texto, p.jid || undefined);
    if (r.ok) {
      db.prepare("UPDATE wa_cola SET estado='enviada', ultimoIntento=?, intentos=intentos+1 WHERE id=?")
        .run(new Date().toISOString(), p.id);
      console.log('[WA] alerta de la cola reenviada OK (id ' + p.id + ', tras ' + (p.intentos + 1) + ' intentos)');
    } else {
      const nuevoEstado = (p.intentos + 1) >= WA_COLA_MAX_INTENTOS ? 'fallida' : 'pendiente';
      db.prepare("UPDATE wa_cola SET intentos=intentos+1, ultimoIntento=?, ultimoError=?, estado=? WHERE id=?")
        .run(new Date().toISOString(), r.error || null, nuevoEstado, p.id);
      if (nuevoEstado === 'fallida') console.error('[WA] alerta id ' + p.id + ' marcada FALLIDA tras ' + WA_COLA_MAX_INTENTOS + ' intentos');
    }
  }
}
setInterval(procesarColaWA, 60 * 1000); // cada 60s
// Limpieza: borra las enviadas de más de 7 días una vez al día.
setInterval(() => {
  try { db.prepare("DELETE FROM wa_cola WHERE estado='enviada' AND creado < ?").run(new Date(Date.now() - 7 * 86400000).toISOString()); } catch (e) {}
}, 24 * 60 * 60 * 1000);

const server = app.listen(PORT, () => console.log(`CRM Tasatop Web v1.426 (FIX detalle de avances por asesor: la consulta de avances NO traia el campo detalle (solo nombre/objetivo), por eso el desglose por transicion nunca matcheaba y no salia. Ahora trae detalle y el desglose aparece bajo Avances de etapa para cada funcionario: Solicitud->Credito, Credito->Garantia, etc, cada uno con cantidad + monto. Captura cualquier avance ascendente (aunque sea salto de 2 etapas) y el total cuadra con la suma. Server: restart. Front: Ctrl+F5) corriendo en puerto ${PORT}`));

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
