// Función serverless del formulario de contacto de la landing ialimp.es.
// Vercel trata `api/*.js` como Serverless Function (Node) aunque el resto del
// proyecto sea estático → el formulario hace POST a /api/contacto (mismo origen,
// sin CORS). Envía un aviso por email.
//
// Proveedores de envío (en este orden, igual que la app en lib/mailer.ts):
//   1) Resend  → si hay RESEND_API_KEY (HTTPS, requiere dominio ialimp.es verificado).
//   2) IONOS / SMTP → si hay SMTP_USER + SMTP_PASSWORD (buzón hola@ialimp.es;
//      host/puerto por defecto smtp.ionos.es:465 SSL, override con SMTP_HOST/SMTP_PORT).
//
// Configura las variables en el proyecto Vercel `ialimp-landing`
// (Settings → Environment Variables → Production).

const AVISO_TO = 'alberto.suarez.gutierrez@gmail.com';
const MAIL_FROM = 'IALIMP <hola@ialimp.es>';

// Endpoint público de la app que registra el lead en el CRM de captación
// (mailing_prospectos). Configurable por si cambia el dominio.
const LEAD_SAAS_URL = process.env.LEAD_SAAS_URL || 'https://app.ialimp.es/api/lead-saas';

// Escapa el contenido del usuario antes de incrustarlo en el HTML del email.
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Envía vía Resend (HTTP). Devuelve true si OK.
async function enviarResend({ subject, html, text, replyTo }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: MAIL_FROM, to: [AVISO_TO], reply_to: replyTo, subject, html, text,
    }),
  });
  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    console.error('contacto: Resend rechazó el envío', r.status, detalle);
    return false;
  }
  return true;
}

// Envía vía SMTP (IONOS por defecto) usando nodemailer. Devuelve true si OK.
async function enviarSmtp({ subject, html, text, replyTo }) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ionos.es',
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  try {
    await transporter.sendMail({ from: MAIL_FROM, to: AVISO_TO, replyTo, subject, html, text });
    return true;
  } catch (e) {
    console.error('contacto: SMTP (IONOS) rechazó el envío', e && e.message);
    return false;
  }
}

// Registra el lead en el CRM de captación de IALIMP (mailing_prospectos) reutilizando
// el endpoint público /api/lead-saas de la app. Best-effort: NUNCA rompe el formulario
// (su propio try/catch); el aviso por email sigue siendo la vía garantizada.
async function registrarEnCrm({ nombre, email, telefono, mensaje }) {
  try {
    await fetch(LEAD_SAAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // La landing no pide "empresa"; usamos el nombre como empresa_nombre (campo
      // obligatorio en mailing_prospectos). Alberto puede afinarlo en el panel.
      body: JSON.stringify({ empresa: nombre, nombre, email, telefono, mensaje }),
    });
  } catch (e) {
    console.error('contacto: no se pudo registrar el lead en el CRM', e && e.message);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  // El body puede venir ya parseado (Vercel) o como string crudo.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const nombre = (body.nombre || '').toString().trim();
  const email = (body.email || '').toString().trim();
  const telefono = (body.telefono || '').toString().trim();
  const mensaje = (body.mensaje || '').toString().trim();
  const consentimiento = body.consentimiento === true || body.consentimiento === 'true';
  const honeypot = (body.website || '').toString().trim();

  // Honeypot: si un bot rellena el campo oculto, fingimos éxito y no enviamos.
  if (honeypot) return res.status(200).json({ ok: true });

  // Validación de servidor (no fiarse solo del HTML).
  if (!nombre || !email || !telefono || !consentimiento) {
    return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'Email no válido.' });
  }

  // Registra el lead en el CRM de captación (no crítico, no bloquea el aviso por email).
  await registrarEnCrm({ nombre, email, telefono, mensaje });

  const fecha = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
  const html = `
    <h2 style="font-family:sans-serif;color:#1e1b4b">Nueva solicitud de demo — ialimp.es</h2>
    <table style="font-family:sans-serif;font-size:15px;color:#1e1b4b;border-collapse:collapse">
      <tr><td style="padding:4px 12px 4px 0"><strong>Nombre</strong></td><td>${esc(nombre)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><strong>Email</strong></td><td>${esc(email)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><strong>Teléfono</strong></td><td>${esc(telefono)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;vertical-align:top"><strong>Mensaje</strong></td><td>${esc(mensaje) || '<em>(sin mensaje)</em>'}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><strong>Fecha</strong></td><td>${esc(fecha)}</td></tr>
    </table>
    <p style="font-family:sans-serif;font-size:12px;color:#64748b">El interesado aceptó la política de privacidad al enviar el formulario.</p>
  `;
  const text =
    `Nueva solicitud de demo — ialimp.es\n\n` +
    `Nombre: ${nombre}\nEmail: ${email}\nTeléfono: ${telefono}\n` +
    `Mensaje: ${mensaje || '(sin mensaje)'}\nFecha: ${fecha}\n`;

  const payload = { subject: `Nueva solicitud de demo — ${nombre}`, html, text, replyTo: email };

  try {
    let enviado = false;
    if (process.env.RESEND_API_KEY) {
      enviado = await enviarResend(payload);
    } else if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
      enviado = await enviarSmtp(payload);
    } else {
      console.error('contacto: no hay proveedor de correo (falta RESEND_API_KEY o SMTP_USER/SMTP_PASSWORD)');
    }
    if (!enviado) return res.status(502).json({ ok: false, error: 'No se pudo enviar.' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('contacto: excepción al enviar el correo', e && e.message);
    return res.status(502).json({ ok: false, error: 'No se pudo enviar.' });
  }
};
