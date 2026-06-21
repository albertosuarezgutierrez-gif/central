// Rellena emails que faltan: rastrea la web de los prospectos que tienen web pero
// no email y completa el campo (panel superadmin). Gratis, best-effort.
// Procesa un lote y marca email_buscado_at para no repetir → el cliente puede
// llamar en bucle hasta agotar `pendientes` (rastreo automático tras Apify).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { isSuperadmin } from '@/lib/tenant'
import { extraerEmailDeWeb } from '@/lib/google-leads'

export const maxDuration = 60

export async function POST() {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    // Lote pequeño para no exceder el timeout serverless (cada web ~5s, en paralelo).
    // Solo webs aún no intentadas (email_buscado_at IS NULL).
    const lote = await prisma.$queryRaw<{ id: string; web: string }[]>(Prisma.sql`
      SELECT id, web FROM mailing_prospectos
      WHERE baja = false AND email IS NULL AND web IS NOT NULL AND web <> '' AND email_buscado_at IS NULL
      ORDER BY created_at DESC LIMIT 15
    `)

    let encontrados = 0
    await Promise.allSettled(lote.map(async p => {
      const email = await extraerEmailDeWeb(p.web)
      if (!email) return
      try {
        const r = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
          UPDATE mailing_prospectos SET email = ${email}
          WHERE id = ${p.id}::uuid
            AND NOT EXISTS (SELECT 1 FROM mailing_prospectos WHERE lower(email) = ${email})
          RETURNING id
        `)
        if (r.length) encontrados++
      } catch { /* email ya existe en otro prospecto: ignorar */ }
    }))

    // Marcar como intentados (con o sin éxito) para que el bucle avance y no repita.
    if (lote.length) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE mailing_prospectos SET email_buscado_at = now()
        WHERE id = ANY(${lote.map(p => p.id)}::uuid[])
      `)
    }

    // Cuántas webs quedan por rastrear (para que el cliente sepa si seguir el bucle).
    const [{ n: pendientes }] = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT count(*)::int AS n FROM mailing_prospectos
      WHERE baja = false AND email IS NULL AND web IS NOT NULL AND web <> '' AND email_buscado_at IS NULL
    `)

    return NextResponse.json({ ok: true, revisados: lote.length, encontrados, pendientes })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
