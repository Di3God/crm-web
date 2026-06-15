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
const L = require('./logic');
const mailer = require('./mailer');

const db = new DatabaseSync(path.join(__dirname, 'crm.db'));
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
    rol TEXT NOT NULL CHECK (rol IN ('admin','gestora')),
    hash TEXT NOT NULL,
    sal TEXT NOT NULL,
    activo INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS sesiones (
    token TEXT PRIMARY KEY,
    usuario TEXT NOT NULL,
    creada TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_gestiones_codigo ON gestiones(codigo);
`);
// Migracion suave para bases creadas con v1.0
try { db.exec('ALTER TABLE leads ADD COLUMN montoPotencial TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE leads ADD COLUMN montoReal INTEGER'); } catch (e) {}
try { db.exec('ALTER TABLE leads ADD COLUMN montoRango TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE leads ADD COLUMN archivado INTEGER DEFAULT 0'); } catch (e) {}
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
  // 2 admins + 4 gestoras. Clave inicial para todos: Tasatop2026
  crearUsuario('admin1', 'Admin 1', 'admin', 'Tasatop2026');
  crearUsuario('admin2', 'Admin 2', 'admin', 'Tasatop2026');
  crearUsuario('mafer', 'Mafer', 'gestora', 'Tasatop2026');
  crearUsuario('lourdes', 'Lourdes', 'gestora', 'Tasatop2026');
  crearUsuario('breezy', 'Breezy', 'gestora', 'Tasatop2026');
  crearUsuario('dora', 'Dora', 'gestora', 'Tasatop2026');
  console.log('Usuarios creados (clave inicial: Tasatop2026): admin1, admin2, mafer, lourdes, breezy, dora');
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

app.post('/api/cambiar-clave', (req, res) => {
  const u = usuarioDeSesion(req);
  if (!u) return res.status(401).json({ error: 'Sin sesion' });
  const { claveActual, claveNueva } = req.body || {};
  const full = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(u.usuario);
  if (hashClave(claveActual || '', full.sal) !== full.hash) {
    return res.status(422).json({ error: 'La contrasena actual no es correcta' });
  }
  if (!claveNueva || claveNueva.length < 8) {
    return res.status(422).json({ error: 'La nueva contrasena debe tener al menos 8 caracteres' });
  }
  const sal = crypto.randomBytes(8).toString('hex');
  db.prepare('UPDATE usuarios SET hash = ?, sal = ? WHERE usuario = ?')
    .run(hashClave(claveNueva, sal), sal, u.usuario);
  res.json({ ok: true });
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

// ---------- Helpers de leads ----------
function gestionesDeLead(codigo) {
  return db.prepare('SELECT * FROM gestiones WHERE codigo = ? ORDER BY fecha ASC').all(codigo);
}
function leadConsolidado(lead) {
  return L.consolidarLead(lead, gestionesDeLead(lead.codigo));
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
    tiempo: L.TIEMPO, experiencia: L.EXPERIENCIA,
    tipoReunion: L.TIPO_REUNION, estadoReunion: L.ESTADO_REUNION,
    objeciones: L.OBJECIONES, motivosPerdida: L.MOTIVOS_PERDIDA,
    accionesPorResultado: require('./logic').ACCIONES_POR_RESULTADO || {}
  });
});

// ---------- Leads ----------
app.post('/api/leads', soloAdmin, (req, res) => {
  const { nombre, telefono, email, fuente, campana, asesor } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Falta nombre del lead' });
  if (asesor && !L.ASESORES.includes(asesor)) {
    return res.status(400).json({ error: 'Asesor no valido. Opciones: ' + L.ASESORES.join(', ') });
  }
  const codigo = generarCodigo();
  const ahora = new Date().toISOString();
  db.prepare(`INSERT INTO leads (codigo,nombre,telefono,email,fuente,campana,asesor,fechaCarga,fechaAsignacion)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(codigo, nombre, L.normalizarCelular(telefono) || telefono || null, email || null,
         fuente || null, campana || null, asesor || null, ahora, asesor ? ahora : null);
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
app.put('/api/leads/asignar', soloAdmin, (req, res) => {
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
app.get('/api/leads', (req, res) => {
  let leads = db.prepare('SELECT * FROM leads WHERE COALESCE(archivado,0) = 0').all();
  if (req.user.rol === 'gestora') {
    leads = leads.filter(l => l.asesor === req.user.nombre);
  } else {
    if (req.query.filtro === 'sin-asignar') leads = leads.filter(l => !l.asesor);
    else if (req.query.asesor) leads = leads.filter(l => l.asesor === req.query.asesor);
  }
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
  if (req.user.rol === 'gestora' && lead.asesor !== req.user.nombre) {
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

  if (req.user.rol === 'gestora') {
    if (lead.asesor !== req.user.nombre) {
      return res.status(403).json({ error: `Este lead esta asignado a ${lead.asesor || 'nadie'}.` });
    }
    g.asesor = req.user.nombre;
  } else {
    g.asesor = g.asesor || lead.asesor;
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

  res.json(leadConsolidado(lead));
});

// ---------- Trazabilidad ----------
app.get('/api/leads/:codigo/trazabilidad', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE codigo = ?').get(req.params.codigo);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
  if (req.user.rol === 'gestora' && lead.asesor !== req.user.nombre) {
    return res.status(403).json({ error: 'Este lead no esta asignado a ti' });
  }
  res.json(L.trazabilidad(lead, gestionesDeLead(lead.codigo)));
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
  if (req.user.rol === 'gestora') leads = leads.filter(l => l.asesor === req.user.nombre);
  leads = leads.map(leadConsolidado);

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const man = new Date(hoy); man.setDate(man.getDate() + 1);
  let deHoy = db.prepare('SELECT * FROM gestiones WHERE fecha >= ? AND fecha < ?')
    .all(hoy.toISOString(), man.toISOString());
  if (req.user.rol === 'gestora') deHoy = deHoy.filter(g => g.asesor === req.user.nombre);
  const unicos = arr => [...new Set(arr.filter(Boolean))];

  const etapas = [
    'Contactabilidad 3x5', 'Contactado - por calificar', 'Calificado - pendiente agendar',
    'Agendado - pendiente reunion', 'Reunion efectiva - seguimiento',
    'Cierre pendiente', 'Cerrado ganado', 'Cerrado perdido'
  ];
  const embudo = etapas.map(et => {
    const rows = leads.filter(l => l.etapa === et);
    return { etapa: et, cantidad: rows.length, pipeline: rows.reduce((s, l) => s + l.pipelineEstimado, 0) };
  });

  const ahoraTs = new Date();
  const asesoresVisibles = req.user.rol === 'gestora' ? [req.user.nombre] : L.ASESORES;
  const porAsesor = asesoresVisibles.map(a => {
    const rows = deHoy.filter(g => g.asesor === a);
    // #10 Semaforo: rojo si tiene acciones vencidas; amarillo si tiene pendientes
    // futuros; verde si esta al dia (sin pendientes vencidos).
    const susLeads = leads.filter(l => l.asesor === a);
    const vencidos = susLeads.filter(l => l.fechaProxAccion && new Date(l.fechaProxAccion) < ahoraTs).length;
    const pendientes = susLeads.filter(l => l.fechaProxAccion && new Date(l.fechaProxAccion) >= ahoraTs).length;
    const semaforo = vencidos > 0 ? 'rojo' : (pendientes > 0 ? 'amarillo' : 'verde');
    return {
      asesor: a,
      gestionados: unicos(rows.map(g => g.codigo)).length,
      agendados: unicos(rows.filter(g => g.grupoLimpio === 'Agendo_reunion').map(g => g.codigo)).length,
      reunionesEfectivas: unicos(rows.filter(g => g.grupoLimpio === 'Reunion_efectiva').map(g => g.codigo)).length,
      semaforo, vencidos, pendientes
    };
  });

  res.json({
    totalLeads: leads.length,
    gestionadosHoy: unicos(deHoy.map(g => g.codigo)).length,
    contactadosHoy: unicos(deHoy.filter(g =>
      ['Respondio_sin_agendar', 'Agendo_reunion', 'Reunion_efectiva', 'Cierre'].includes(g.grupoLimpio)
    ).map(g => g.codigo)).length,
    agendadosHoy: unicos(deHoy.filter(g => g.grupoLimpio === 'Agendo_reunion').map(g => g.codigo)).length,
    reunionesEfectivasHoy: unicos(deHoy.filter(g => g.grupoLimpio === 'Reunion_efectiva').map(g => g.codigo)).length,
    cierrePendiente: leads.filter(l => l.etapa === 'Cierre pendiente').length,
    ganados: leads.filter(l => l.etapa === 'Cerrado ganado').length,
    pipelineActivo: leads
      .filter(l => l.etapa !== 'Cerrado ganado' && l.etapa !== 'Cerrado perdido')
      .reduce((s, l) => s + l.pipelineEstimado, 0),
    embudo, porAsesor
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CRM Tasatop Web v1.1 corriendo en http://localhost:${PORT}`));
