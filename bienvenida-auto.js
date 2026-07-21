// ===== BIENVENIDA AUTOMÁTICA (v1.405) =====
// Envía un WhatsApp de bienvenida a cada lead NUEVO gestionable (B2C y B2B),
// vía Chatwoot, en el momento de su creación. Con:
//  · Anti-duplicado: cada teléfono recibe UNA sola bienvenida (tabla wa_bienvenida).
//    Los duplicados activos/perdidos/releads NO se saludan de nuevo.
//  · Plantillas configurables por mundo (app_config: bienvenida_b2c / bienvenida_b2b).
//  · Horario: fuera de 8:00–20:00 Perú se ENCOLA hasta la mañana siguiente.
//  · Toggle maestro (app_config bienvenida_activa) + modo prueba (no envía, solo registra).
//  · Nunca rompe el flujo de creación del lead (todo en try/catch, async).

'use strict';

module.exports = function ({ db, cw, normalizarCelular }) {
  const LIMA = -5 * 3600000;
  const horaPeru = () => new Date(Date.now() + LIMA).getUTCHours();

  db.exec(`CREATE TABLE IF NOT EXISTS wa_bienvenida (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telefono TEXT,
    mundo TEXT,
    codigo TEXT,
    estado TEXT,           -- 'enviado' | 'encolado' | 'prueba' | 'error' | 'sin_conversacion'
    detalle TEXT,
    creado TEXT,
    enviadoEn TEXT
  );`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_wabienv_tel ON wa_bienvenida(telefono);");

  const PLANTILLA_DEF = {
    b2c: '¡Hola {nombre}! 👋 Gracias por tu interés en invertir con *Tasatop*. Somos la plataforma peruana de inversiones con respaldo inmobiliario. Un asesor de patrimonio te contactará en breve para resolver tus dudas. ¿Te gustaría que te expliquemos cómo funciona?',
    b2b: '¡Hola {nombre}! 👋 Gracias por tu interés en el financiamiento empresarial de *Tasatop*. Uno de nuestros funcionarios de crédito revisará tu solicitud y te contactará a la brevedad. ¿En qué horario te resulta más cómodo conversar?'
  };

  function getConfig() {
    const leer = (clave, def) => {
      try { const r = db.prepare('SELECT valor FROM app_config WHERE clave=?').get(clave); if (r && r.valor != null) return r.valor; } catch (e) { }
      return def;
    };
    return {
      activa: leer('bienvenida_activa', '0') === '1',
      prueba: leer('bienvenida_prueba', '0') === '1',
      b2c: leer('bienvenida_b2c', PLANTILLA_DEF.b2c),
      b2b: leer('bienvenida_b2b', PLANTILLA_DEF.b2b),
      horaIni: parseInt(leer('bienvenida_hora_ini', '8'), 10),
      horaFin: parseInt(leer('bienvenida_hora_fin', '20'), 10)
    };
  }

  function render(tpl, lead) {
    const nombre = (lead.nombre || '').trim().split(/\s+/)[0] || 'buen día';
    return String(tpl || '')
      .replace(/\{nombre\}/g, nombre)
      .replace(/\{fuente\}/g, lead.fuente || 'tu consulta')
      .replace(/\{empresa\}/g, lead.razonSocial || lead.empresa || '');
  }

  const tel9 = t => String(t || '').replace(/[^0-9]/g, '').slice(-9);

  // Envía la bienvenida buscando/creando la conversación del contacto en Chatwoot.
  async function enviarPorChatwoot(telefono, texto) {
    // Buscar una conversación existente de ese teléfono (últimos 9 dígitos).
    const objetivo = tel9(telefono);
    try {
      const convs = await cw.listarConversaciones();
      const match = (convs || []).find(c => tel9(cw.telefonoDeConversacion(c)) === objetivo);
      if (match && match.id) {
        await cw.enviarMensaje(match.id, texto);
        return { ok: true, via: 'conversacion', id: match.id };
      }
    } catch (e) {
      return { ok: false, error: 'Chatwoot: ' + e.message };
    }
    // Sin conversación previa: Chatwoot/WhatsApp no permite iniciar chat libre
    // sin plantilla aprobada. Se registra para que el equipo dé el primer toque.
    return { ok: false, sinConversacion: true };
  }

  // Punto de entrada: se llama tras crear un lead gestionable.
  // lead: { codigo, nombre, telefono, fuente, razonSocial? }  · mundo: 'b2c' | 'b2b'
  async function saludar(lead, mundo) {
    try {
      const cfg = getConfig();
      if (!cfg.activa) return;
      const tel = normalizarCelular ? (normalizarCelular(lead.telefono) || lead.telefono) : lead.telefono;
      if (!tel) return;
      const clave = tel9(tel);
      if (!clave) return;

      // ANTI-DUPLICADO: si este teléfono ya recibió bienvenida (enviada o en cola), no repetir.
      const previo = db.prepare("SELECT id FROM wa_bienvenida WHERE telefono=? AND estado IN ('enviado','encolado','prueba')").get(clave);
      if (previo) return;

      const texto = render(mundo === 'b2b' ? cfg.b2b : cfg.b2c, lead);
      const ahora = new Date().toISOString();

      // MODO PRUEBA: no envía, solo registra qué habría enviado (no requiere Chatwoot).
      if (cfg.prueba) {
        db.prepare("INSERT INTO wa_bienvenida (telefono,mundo,codigo,estado,detalle,creado) VALUES (?,?,?,?,?,?)")
          .run(clave, mundo, lead.codigo || null, 'prueba', texto.slice(0, 300), ahora);
        console.log('[Bienvenida][PRUEBA]', mundo, lead.codigo, '→', clave, ':', texto.slice(0, 60));
        return;
      }

      // Envío real: requiere Chatwoot configurado (se registra el error para que sea visible).
      if (!cw || !cw.cwConfigurado || !cw.cwConfigurado()) {
        db.prepare("INSERT INTO wa_bienvenida (telefono,mundo,codigo,estado,detalle,creado) VALUES (?,?,?,?,?,?)")
          .run(clave, mundo, lead.codigo || null, 'error', 'Chatwoot no configurado (faltan variables CHATWOOT_* en Railway)', ahora);
        return;
      }

      // HORARIO: fuera de la ventana, encolar para la mañana (worker lo reenvía).
      const h = horaPeru();
      if (h < cfg.horaIni || h >= cfg.horaFin) {
        db.prepare("INSERT INTO wa_bienvenida (telefono,mundo,codigo,estado,detalle,creado) VALUES (?,?,?,?,?,?)")
          .run(clave, mundo, lead.codigo || null, 'encolado', texto.slice(0, 300), ahora);
        console.log('[Bienvenida] fuera de horario → encolada:', clave);
        return;
      }

      const r = await enviarPorChatwoot(tel, texto);
      if (r.ok) {
        db.prepare("INSERT INTO wa_bienvenida (telefono,mundo,codigo,estado,detalle,creado,enviadoEn) VALUES (?,?,?,?,?,?,?)")
          .run(clave, mundo, lead.codigo || null, 'enviado', 'conv ' + (r.id || ''), ahora, ahora);
        console.log('[Bienvenida] ✅ enviada a', clave, '(' + mundo + ')');
      } else if (r.sinConversacion) {
        db.prepare("INSERT INTO wa_bienvenida (telefono,mundo,codigo,estado,detalle,creado) VALUES (?,?,?,?,?,?)")
          .run(clave, mundo, lead.codigo || null, 'sin_conversacion', 'El lead no ha escrito aún; requiere plantilla aprobada o primer toque manual', ahora);
        console.log('[Bienvenida] sin conversación previa (no se puede iniciar libre):', clave);
      } else {
        db.prepare("INSERT INTO wa_bienvenida (telefono,mundo,codigo,estado,detalle,creado) VALUES (?,?,?,?,?,?)")
          .run(clave, mundo, lead.codigo || null, 'error', String(r.error || '').slice(0, 200), ahora);
        console.error('[Bienvenida] error:', r.error);
      }
    } catch (e) {
      console.error('[Bienvenida] excepción (no afecta la creación del lead):', e.message);
    }
  }

  // Worker: reintenta las encoladas cuando entra en horario (cada 5 min).
  function iniciarWorker() {
    setInterval(async () => {
      try {
        const cfg = getConfig();
        if (!cfg.activa || cfg.prueba) return;
        const h = horaPeru();
        if (h < cfg.horaIni || h >= cfg.horaFin) return;
        if (!cw.cwConfigurado()) return;
        const pend = db.prepare("SELECT * FROM wa_bienvenida WHERE estado='encolado' ORDER BY id ASC LIMIT 10").all();
        for (const b of pend) {
          const r = await enviarPorChatwoot(b.telefono, b.detalle);
          if (r.ok) {
            db.prepare("UPDATE wa_bienvenida SET estado='enviado', enviadoEn=?, detalle=? WHERE id=?")
              .run(new Date().toISOString(), 'conv ' + (r.id || ''), b.id);
            console.log('[Bienvenida] ✅ encolada enviada a', b.telefono);
          } else if (r.sinConversacion) {
            db.prepare("UPDATE wa_bienvenida SET estado='sin_conversacion' WHERE id=?").run(b.id);
          }
          await new Promise(res => setTimeout(res, 1500)); // no saturar Chatwoot
        }
      } catch (e) { console.error('[Bienvenida worker]', e.message); }
    }, 5 * 60 * 1000);
  }

  function resumen() {
    const r = {};
    try {
      db.prepare("SELECT estado, COUNT(*) c FROM wa_bienvenida GROUP BY estado").all().forEach(x => { r[x.estado] = x.c; });
    } catch (e) { }
    return r;
  }

  return { saludar, iniciarWorker, getConfig, resumen, PLANTILLA_DEF };
};
