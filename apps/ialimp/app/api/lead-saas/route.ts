// Formulario de contacto de la landing ialimp.es (empresas interesadas en el SaaS).
// Crea un prospecto (origen='landing') y avisa a Alberto. Público + CORS (la landing
// es un proyecto Vercel separado en otro dominio).
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'
import { rateLimit, getIp } from '@/lib/propietario-auth'

const ALLOW_ORIGINS = ['https://ialimp.es', 'https://www.ialimp.es']

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get('origin'))
  try {
    const ip = getIp(req)
    if (!rateLimit(`lead-saas:${ip}`, 8, 60 * 60 * 1000).allowed) {
      return NextResponse.json({ error: 'Demasiados intentos' }, { status: 429, headers })
    }
    const b = await req.json().catch(() => ({}))
    if (b?.hp) return NextResponse.json({ ok: true }, { headers }) // honeypot anti-bot

    const empresa = String(b?.empresa || '').trim()
    const nombre = String(b?.nombre || '').trim()
    const email = String(b?.email || '').trim().toLowerCase()
    const telefono = b?.telefono ? String(b.telefono).trim() : null
    const pisos = b?.pisos ? String(b.pisos).trim() : null
    const mensaje = b?.mensaje ? String(b.mensaje).trim() : null

    if (!empresa || !/.+@.+\..+/.test(email)) {
      return NextResponse.json({ error: 'Empresa y email válidos requeridos' }, { status: 400, headers })
    }

    const notas = [nombre && `Contacto: ${nombre}`, pisos && `Pisos/empleados: ${pisos}`, mensaje && `Mensaje: ${mensaje}`]
      .filter(Boolean).join(' · ') || null

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO mailing_prospectos (empresa_nombre, email, telefono, notas, origen)
      VALUES (${empresa}, ${email}, ${telefono}, ${notas}, 'landing')
      ON CONFLICT (lower(email)) DO UPDATE
        SET telefono = COALESCE(EXCLUDED.telefono, mailing_prospectos.telefono),
            notas = COALESCE(EXCLUDED.notas, mailing_prospectos.notas)
    `)

    // Aviso a Alberto (no crítico).
    try {
      const t = getTransporter()
      const to = process.env.MAILING_AVISO_TO || 'alberto.suarez.gutierrez@gmail.com'
      if (t) {
        await t.sendMail({
          from: `"IALIMP Web" <${MAIL_FROM}>`,
          to,
          subject: `📩 Nuevo contacto desde ialimp.es: ${empresa}`,
          html: `<div style="font-family:Arial,sans-serif;color:#1e1b4b">
            <h2 style="color:#4f46e5">Nuevo lead desde la web</h2>
            <p><strong>Empresa:</strong> ${empresa}</p>
            <p><strong>Contacto:</strong> ${nombre || '—'}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Teléfono:</strong> ${telefono || '—'}</p>
            <p><strong>Pisos/empleados:</strong> ${pisos || '—'}</p>
            <p><strong>Mensaje:</strong> ${mensaje || '—'}</p></div>`,
          text: `Nuevo lead: ${empresa} · ${nombre} · ${email} · ${telefono || '—'} · ${pisos || '—'} · ${mensaje || ''}`,
        })
      }
    } catch { /* no crítico */ }

    return NextResponse.json({ ok: true }, { headers })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500, headers })
  }
}
