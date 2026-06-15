// =============================================================
// CRM TASATOP - MODULO DE CORREO (mailer.js) - via RESEND
// Envia correos por la API HTTPS de Resend (no SMTP), porque Railway
// bloquea/ralentiza los puertos SMTP salientes. HTTPS nunca se bloquea.
//
// Variables de entorno:
//   RESEND_API_KEY -> la API key de Resend (empieza con re_...)
//   MAIL_FROM      -> remitente. Para pruebas: 'CRM Tasatop <onboarding@resend.dev>'
//                     En produccion (dominio verificado): 'CRM Tasatop <crm@tasatop.com>'
//   CORREO_PRUEBA  -> (opcional) si esta definido, TODOS los correos van aqui.
//                     Nota: con onboarding@resend.dev, Resend solo permite enviar
//                     al correo con el que te registraste hasta verificar un dominio.
//
// Si no hay API key, el modulo no rompe: solo registra en consola.
// =============================================================

const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'CRM Tasatop <onboarding@resend.dev>';
const CORREO_PRUEBA = process.env.CORREO_PRUEBA || '';

let resend = null;
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
}

const activo = () => !!resend;

// Envia un correo. Si CORREO_PRUEBA esta definido, redirige todo ahi.
async function enviar(para, asunto, html) {
  if (!resend) {
    console.log('[mailer] Sin RESEND_API_KEY. Correo NO enviado:', asunto);
    return { ok: false, motivo: 'sin-credenciales' };
  }
  const destino = CORREO_PRUEBA || para;
  if (!destino) {
    console.log('[mailer] Sin destinatario para:', asunto);
    return { ok: false, motivo: 'sin-destino' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: MAIL_FROM,
      to: [destino],
      subject: (CORREO_PRUEBA ? '[PRUEBA] ' : '') + asunto,
      html
    });
    if (error) {
      console.error('[mailer] Error de Resend:', JSON.stringify(error));
      return { ok: false, motivo: error.message || 'error-resend' };
    }
    console.log('[mailer] Enviado a', destino, '- id:', data && data.id, '-', asunto);
    return { ok: true, id: data && data.id };
  } catch (e) {
    console.error('[mailer] Excepcion al enviar:', e.message);
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
      <tr><td style="padding:6px 0;color:#6B7A8D">Telefono</td><td style="padding:6px 0">${lead.telefono || '\u2014'}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7A8D">Codigo</td><td style="padding:6px 0">${lead.codigo}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7A8D">Fuente</td><td style="padding:6px 0">${lead.fuente || '\u2014'}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7A8D">Monto potencial</td><td style="padding:6px 0">${fmt(lead.montoReal)}</td></tr>
    </table>
    <p style="margin-top:16px;padding:12px;background:#FFF2CC;border-radius:7px">
      <b>Primer paso:</b> realiza el primer intento de contacto hoy mismo. Recuerda la cadencia 3x5.
    </p>`;
  return enviar(correoGP, `Nuevo lead asignado: ${lead.nombre}`, plantilla('Nuevo lead asignado', cuerpo));
}

module.exports = { activo, enviar, correoLeadAsignado };
