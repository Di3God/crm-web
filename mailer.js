// =============================================================
// CRM TASATOP - MODULO DE CORREO (mailer.js)
// Envia notificaciones por Gmail SMTP usando una App Password.
// Las credenciales NO van aqui: se leen de variables de entorno
//   GMAIL_USER  -> el correo que envia (ej. notificaciones.tasatop@gmail.com)
//   GMAIL_PASS  -> la clave de aplicacion de 16 caracteres (sin espacios)
//   CORREO_PRUEBA -> (opcional) si esta definido, TODOS los correos van aqui
//                    en vez de a las GP. Ideal para probar.
// Si no hay credenciales, el modulo no rompe: solo registra en consola.
// =============================================================

const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER || '';
const GMAIL_PASS = process.env.GMAIL_PASS || '';
const CORREO_PRUEBA = process.env.CORREO_PRUEBA || '';

let transporter = null;
if (GMAIL_USER && GMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // STARTTLS en 587
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });
}

const activo = () => !!transporter;

// Envia un correo. Si CORREO_PRUEBA esta definido, redirige todo ahi.
async function enviar(para, asunto, html) {
  if (!transporter) {
    console.log('[mailer] Sin credenciales (GMAIL_USER/GMAIL_PASS). Correo NO enviado:', asunto);
    return { ok: false, motivo: 'sin-credenciales' };
  }
  const destino = CORREO_PRUEBA || para;
  if (!destino) {
    console.log('[mailer] Sin destinatario para:', asunto);
    return { ok: false, motivo: 'sin-destino' };
  }
  try {
    await transporter.sendMail({
      from: `"CRM Tasatop" <${GMAIL_USER}>`,
      to: destino,
      subject: (CORREO_PRUEBA ? '[PRUEBA] ' : '') + asunto,
      html
    });
    console.log('[mailer] Enviado a', destino, '-', asunto);
    return { ok: true };
  } catch (e) {
    console.error('[mailer] Error al enviar:', e.message);
    return { ok: false, motivo: e.message };
  }
}

// Plantilla base con estilo Tasatop
function plantilla(titulo, cuerpo) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #DDE4EC;border-radius:10px;overflow:hidden">
    <div style="background:#0D2B4E;color:#fff;padding:16px 20px;font-size:18px;font-weight:bold">
      CRM <span style="color:#4A86E8">Tasatop</span>
    </div>
    <div style="padding:20px;color:#1F2D3D;font-size:14px;line-height:1.5">
      <h2 style="font-size:16px;color:#0D2B4E;margin:0 0 12px">${titulo}</h2>
      ${cuerpo}
    </div>
    <div style="background:#F2F5F9;padding:12px 20px;font-size:11px;color:#6B7A8D">
      Mensaje automatico del CRM Tasatop. No respondas a este correo.
    </div>
  </div>`;
}

// ---------- Automatizacion 1: lead asignado ----------
async function correoLeadAsignado(lead, correoGP) {
  const fmt = n => n ? 'S/ ' + Number(n).toLocaleString('es-PE') : 'No especificado';
  const cuerpo = `
    <p>Se te asigno un nuevo lead. Estos son los datos:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#6B7A8D;width:130px">Nombre</td><td style="padding:6px 0;font-weight:bold">${lead.nombre}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7A8D">Telefono</td><td style="padding:6px 0">${lead.telefono || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7A8D">Codigo</td><td style="padding:6px 0">${lead.codigo}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7A8D">Fuente</td><td style="padding:6px 0">${lead.fuente || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7A8D">Monto potencial</td><td style="padding:6px 0">${fmt(lead.montoReal)}</td></tr>
    </table>
    <p style="margin-top:16px;padding:12px;background:#FFF2CC;border-radius:7px">
      <b>Primer paso:</b> realiza el primer intento de contacto hoy mismo. Recuerda la cadencia 3x5.
    </p>`;
  return enviar(correoGP, `Nuevo lead asignado: ${lead.nombre}`, plantilla('Nuevo lead asignado', cuerpo));
}

module.exports = { activo, enviar, correoLeadAsignado };
