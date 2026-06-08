// Redirección de click con tracking. GET /api/m/c/<token>?u=<url destino>
// Registra el click, avanza el prospecto a 'click', AVISA a Alberto (solo el
// primer click) con los datos de contacto para llamar, y redirige al destino.
// Público (exento en middleware). Whitelist anti open-redirect.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getIp } from '@/lib/propietario-auth'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'

const HOSTS_OK = ['ialimp.es', 'app.ialimp.es', 'www.ialimp.es', 'wa.me', 'api.whatsapp.com']

function destinoValido(u: string): boolean {
  try {
    const url = new URL(u)
    if (url.protocol !== 'https:') return false
    return HOSTS_OK.some(h => url.hostname === h || url.hostname.endsWith('.' + h))
  } catch {
    return false
  }
}

// Aviso por email a Alberto cuando un prospecto pincha (best-effort, no crítico).
async function avisarClick(envioId: string, esWhatsapp: boolean) {
  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT e.id, e.avisado_at, p.empresa_nombre, p.email, p.telefono, p.ciudad
      FROM mailing_envios e
      JOIN mailing_prospectos p ON p.id = e.prospecto_id
      WHERE e.id = ${envioId}::uuid
    `)
    const r = rows[0]
    if (!r || r.avisado_at) return // ya avisado: no repetir
    await prisma.$executeRaw(Prisma.sql`
      UPDATE mailing_envios SET avisado_at = now() WHERE id = ${envioId}::uuid
    `)
    const t = getTransporter()
    if (!t) return
    const aviso = process.env.MAILING_AVISO_TO || 'alberto.suarez.gutierrez@gmail.com'
    const tel = r.telefono || '—'
    await t.sendMail({
      from: `"IALIMP Mailing" <${MAIL_FROM}>`,
      to: aviso,
      subject: `🔥 ${r.empresa_nombre} ha pinchado tu correo${esWhatsapp ? ' (WhatsApp)' : ''}`,
      html: `<div style="font-family:Arial,sans-serif;color:#1e1b4b;max-width:480px">
        <h2 style="color:#4f46e5;margin:0 0 12px">🔥 Lead caliente: llámale</h2>
        <p style="margin:0 0 6px"><strong>${r.empresa_nombre}</strong> acaba de pinchar
        ${esWhatsapp ? 'el botón de WhatsApp' : 'el enlace'} de tu correo.</p>
        <table style="font-size:14px;border-collapse:collapse;margin-top:10px">
          <tr><td style="padding:4px 8px;color:#64748b">Teléfono</td><td style="padding:4px 8px"><strong>${tel}</strong></td></tr>
          <tr><td style="padding:4px 8px;color:#64748b">Email</td><td style="padding:4px 8px">${r.email}</td></tr>
          <tr><td style="padding:4px 8px;color:#64748b">Ciudad</td><td style="padding:4px 8px">${r.ciudad || '—'}</td></tr>
          <tr><td style="padding:4px 8px;color:#64748b">Hora</td><td style="padding:4px 8px">${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</td></tr>
        </table>
        <p style="margin-top:14px;font-size:13px;color:#64748b">Está interesado AHORA. Mejor momento para llamar.</p>
      </div>`,
      text: `${r.empresa_nombre} ha pinchado tu correo. Tel: ${tel} · Email: ${r.email} · Ciudad: ${r.ciudad || '—'}`,
    })
  } catch {
    // no crítico
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const u = new URL(req.url).searchParams.get('u') || ''
  const destino = destinoValido(u) ? u : 'https://ialimp.es'
  const esWhatsapp = /wa\.me|api\.whatsapp\.com/.test(destino)

  try {
    const ip = getIp(req)
    const ua = req.headers.get('user-agent') || ''
    const rows = await prisma.$queryRaw<{ id: string; prospecto_id: string }[]>(Prisma.sql`
      UPDATE mailing_envios
      SET clicks = clicks + 1, click_at = COALESCE(click_at, now())
      WHERE token = ${token}
      RETURNING id, prospecto_id
    `)
    if (rows[0]) {
      const e = rows[0]
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO mailing_eventos (envio_id, tipo, url, ip, user_agent)
        VALUES (${e.id}::uuid, ${esWhatsapp ? 'click_whatsapp' : 'click'}, ${destino}, ${ip}, ${ua})
      `)
      await prisma.$executeRaw(Prisma.sql`
        UPDATE mailing_prospectos
        SET estado = 'click'
        WHERE id = ${e.prospecto_id}::uuid
          AND estado IN ('nuevo','enviado','abierto')
      `)
      await avisarClick(e.id, esWhatsapp)
    }
  } catch {
    // no romper la redirección
  }
  return NextResponse.redirect(destino, 302)
}
