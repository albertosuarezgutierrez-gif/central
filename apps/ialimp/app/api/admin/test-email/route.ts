import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/tenant'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'

// Diagnóstico de correo: comprueba en vivo que hola@ialimp.es (MAIL_FROM) envía.
// Dos formas de autorizar:
//  (a) Admin logueado (cookie ialimp_session; el middleware ya protege /api/admin/*).
//  (b) Servidor→servidor con `Authorization: Bearer CRON_SECRET` (como el resto de
//      /api/admin/*) → permite verificarlo con un solo curl, sin navegador.
// GET  → envía a la sesión (o, con Bearer, al ?to=...). POST → { to } (o email de sesión).
// La respuesta dice qué proveedor está activo (resend|smtp|gmail|none) SIN exponer secretos.

export const runtime = 'nodejs' // nodemailer no corre en edge

// ¿Viene con el Bearer CRON_SECRET correcto? (igual criterio que el middleware)
function bearerOk(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`
}

// Proveedor activo según presencia de env vars (mismo orden que getTransporter()).
function proveedorActivo(): 'resend' | 'smtp' | 'gmail' | 'none' {
  if (process.env.RESEND_API_KEY) return 'resend'
  if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) return 'smtp'
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return 'gmail'
  return 'none'
}

async function enviarPrueba(destinatario: string) {
  const proveedor = proveedorActivo()
  const transporter = getTransporter()
  if (!transporter) {
    return NextResponse.json(
      { ok: false, proveedor, from: MAIL_FROM, to: destinatario,
        error: 'Sin proveedor de email configurado (faltan RESEND_API_KEY / SMTP_* / GMAIL_*).' },
      { status: 200 },
    )
  }
  try {
    const fecha = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
    const info = await transporter.sendMail({
      from:    `"IALIMP" <${MAIL_FROM}>`,
      to:      destinatario,
      subject: '✅ Prueba de envío — IALIMP',
      text:    `Correo de prueba enviado desde ${MAIL_FROM} (proveedor: ${proveedor}) el ${fecha}.\n`
             + `Si lo recibes, el correo saliente de IALIMP funciona.`,
      html: `
        <div style="font-family:'Nunito',-apple-system,sans-serif;max-width:480px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:12px;color:#1e1b4b;">
          <div style="background:#4f46e5;color:#fff;padding:18px 22px;border-radius:10px;margin-bottom:18px;">
            <h1 style="margin:0;font-size:19px;font-weight:800;">✅ Prueba de envío</h1>
          </div>
          <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 12px;">
            Este es un correo de prueba de <b>IALIMP</b>. Si lo estás leyendo, el envío saliente funciona.
          </p>
          <p style="font-size:13px;color:#64748b;margin:0;">
            Remitente: <b>${MAIL_FROM}</b><br>
            Proveedor: <b>${proveedor}</b><br>
            Fecha: ${fecha}
          </p>
        </div>`,
    })
    return NextResponse.json(
      { ok: true, proveedor, from: MAIL_FROM, to: destinatario, messageId: info.messageId },
      { status: 200 },
    )
  } catch (err: any) {
    console.error('[test-email] error:', err?.message)
    return NextResponse.json(
      { ok: false, proveedor, from: MAIL_FROM, to: destinatario, error: err?.message || 'Fallo al enviar' },
      { status: 200 },
    )
  }
}

export async function GET(req: Request) {
  try {
    // (b) Bearer CRON_SECRET: destinatario obligatorio en ?to=...
    if (bearerOk(req)) {
      const to = (new URL(req.url).searchParams.get('to') || '').trim()
      if (!to) {
        return NextResponse.json({ ok: false, error: 'Indica el destinatario en ?to=...' }, { status: 400 })
      }
      return enviarPrueba(to)
    }
    // (a) Admin logueado: a su propio email
    const s = await requireSession()
    const destinatario = (s.email || '').trim()
    if (!destinatario) {
      return NextResponse.json(
        { ok: false, error: 'Tu sesión no tiene email; usa POST con { to }.' },
        { status: 400 },
      )
    }
    return enviarPrueba(destinatario)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    // (b) Bearer CRON_SECRET: destinatario obligatorio en { to }
    if (bearerOk(req)) {
      const to = (body?.to || '').trim()
      if (!to) {
        return NextResponse.json({ ok: false, error: 'Indica un destinatario en { to }.' }, { status: 400 })
      }
      return enviarPrueba(to)
    }
    // (a) Admin logueado: { to } o, por defecto, el email de la sesión
    const s = await requireSession()
    const destinatario = (body?.to || s.email || '').trim()
    if (!destinatario) {
      return NextResponse.json(
        { ok: false, error: 'Indica un destinatario en { to } (tu sesión no tiene email).' },
        { status: 400 },
      )
    }
    return enviarPrueba(destinatario)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }
}
