// Webhook de Resend: rebotes y quejas de spam → baja automática del prospecto.
// Protege la reputación de envío y cumple RGPD sin intervención.
// Público (exento en middleware). Verifica la firma Svix si hay RESEND_WEBHOOK_SECRET.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Verificación de firma Svix (la usa Resend). Sin secreto configurado → no bloquea (modo preview).
async function firmaValida(req: Request, raw: string): Promise<boolean> {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return true
  const id = req.headers.get('svix-id')
  const ts = req.headers.get('svix-timestamp')
  const sigHeader = req.headers.get('svix-signature')
  if (!id || !ts || !sigHeader) return false
  try {
    const keyB64 = secret.startsWith('whsec_') ? secret.slice(6) : secret
    const keyBytes = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signed = new TextEncoder().encode(`${id}.${ts}.${raw}`)
    const mac = await crypto.subtle.sign('HMAC', key, signed)
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
    // El header trae una lista "v1,<sig> v1,<sig>" — basta que coincida una.
    return sigHeader.split(' ').some(p => p.split(',')[1] === expected)
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const raw = await req.text()
  if (!await firmaValida(req, raw)) {
    return NextResponse.json({ error: 'firma inválida' }, { status: 401 })
  }
  let body: any
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  const type: string = body?.type || ''
  const esRebote = type === 'email.bounced'
  const esQueja = type === 'email.complained'
  if (!esRebote && !esQueja) return NextResponse.json({ ok: true })

  // Destinatarios afectados (Resend usa data.to como array).
  const to: string[] = Array.isArray(body?.data?.to) ? body.data.to
    : body?.data?.to ? [body.data.to] : []

  for (const email of to) {
    const norm = String(email).trim().toLowerCase()
    if (!norm) continue
    try {
      const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        UPDATE mailing_prospectos
        SET baja = true, baja_at = COALESCE(baja_at, now()),
            baja_motivo = ${esRebote ? 'rebote' : 'queja_spam'}, estado = 'rebotado'
        WHERE lower(email) = ${norm}
        RETURNING id
      `)
      const prospectoId = rows[0]?.id
      if (prospectoId) {
        // Registrar evento contra el último envío del prospecto, si existe.
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO mailing_eventos (envio_id, tipo)
          SELECT id, ${esRebote ? 'rebote' : 'queja'}
          FROM mailing_envios
          WHERE prospecto_id = ${prospectoId}::uuid
          ORDER BY created_at DESC LIMIT 1
        `)
      }
    } catch { /* no romper el webhook */ }
  }
  return NextResponse.json({ ok: true })
}
