// Recolector de leads vía Apify (scraper de Google Maps). Panel superadmin.
// POST { query, ciudad, max } → lanza el run, devuelve { runId }.
// GET ?runId=... → estado; al terminar, rastrea emails que falten e inserta
// en mailing_prospectos (origen='apify'). Requiere env APIFY_TOKEN.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { isSuperadmin } from '@/lib/tenant'
import { apifyStart, apifyResults, extraerEmailDeWeb } from '@/lib/google-leads'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const queryBase = String(b?.query || 'empresa de limpieza').trim()
    const ciudad = String(b?.ciudad || 'Sevilla').trim()
    const max = Math.min(Math.max(Number(b?.max) || 50, 1), 120)
    const query = ciudad ? `${queryBase} ${ciudad}` : queryBase
    const { runId, error } = await apifyStart(query, max)
    if (error) return NextResponse.json({ error }, { status: 502 })
    return NextResponse.json({ ok: true, runId, ciudad })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const runId = req.nextUrl.searchParams.get('runId') || ''
    const ciudad = (req.nextUrl.searchParams.get('ciudad') || 'Sevilla').trim()
    if (!runId) return NextResponse.json({ error: 'Falta runId' }, { status: 400 })

    const { status, leads, error } = await apifyResults(runId)
    if (error) return NextResponse.json({ status: 'ERROR', error }, { status: 502 })
    if (status !== 'SUCCEEDED') return NextResponse.json({ status })

    const lista = leads || []
    // Rellenar email de las que tienen web pero no email (acotado al timeout).
    await Promise.allSettled(lista.filter(l => l.web && !l.email).slice(0, 12).map(async l => {
      l.email = await extraerEmailDeWeb(l.web!)
    }))

    let insertados = 0, conEmail = 0
    for (const l of lista) {
      const email = l.email || null
      if (email) conEmail++
      try {
        const r = email
          ? await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
              INSERT INTO mailing_prospectos (empresa_nombre, email, telefono, ciudad, web, origen)
              VALUES (${l.empresa}, ${email}, ${l.telefono}, ${ciudad || null}, ${l.web}, 'apify')
              ON CONFLICT (lower(email)) DO NOTHING RETURNING id`)
          : await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
              INSERT INTO mailing_prospectos (empresa_nombre, email, telefono, ciudad, web, origen)
              SELECT ${l.empresa}, NULL, ${l.telefono}, ${ciudad || null}, ${l.web}, 'apify'
              WHERE NOT EXISTS (SELECT 1 FROM mailing_prospectos WHERE lower(empresa_nombre) = lower(${l.empresa}))
              RETURNING id`)
        if (r.length) insertados++
      } catch { /* duplicado: ignorar */ }
    }
    return NextResponse.json({ status, encontrados: lista.length, insertados, duplicados: lista.length - insertados, con_email: conEmail })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
