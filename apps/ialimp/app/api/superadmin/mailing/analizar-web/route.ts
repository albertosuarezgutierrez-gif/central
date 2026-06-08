// Analiza un listado/directorio web con IA y crea prospectos (panel superadmin).
// POST { url } → descarga la página, la IA extrae empresas, rastrea el email de
// las que tengan web, e inserta en mailing_prospectos (origen='web-ia').
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { isSuperadmin } from '@/lib/tenant'
import { analizarListadoWeb, extraerEmailDeWeb } from '@/lib/google-leads'

export async function POST(req: NextRequest) {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const url = String(b?.url || '').trim()
    if (!url) return NextResponse.json({ error: 'Indica una URL' }, { status: 400 })

    const { leads, error } = await analizarListadoWeb(url)
    if (error && !leads.length) return NextResponse.json({ error }, { status: 502 })

    // Rastrear email en la web de las que tienen web pero no email (acotado).
    await Promise.allSettled(leads.filter(l => l.web && !l.email).slice(0, 15).map(async l => {
      l.email = await extraerEmailDeWeb(l.web!)
    }))

    let insertados = 0, conEmail = 0
    for (const l of leads) {
      const email = l.email || null
      if (email) conEmail++
      try {
        if (email) {
          const r = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
            INSERT INTO mailing_prospectos (empresa_nombre, email, telefono, web, origen)
            VALUES (${l.empresa}, ${email}, ${l.telefono}, ${l.web}, 'web-ia')
            ON CONFLICT (lower(email)) DO NOTHING
            RETURNING id
          `)
          if (r.length) insertados++
        } else {
          // Sin email: insertar solo si no existe ya una empresa con ese nombre.
          const r = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
            INSERT INTO mailing_prospectos (empresa_nombre, email, telefono, web, origen)
            SELECT ${l.empresa}, NULL, ${l.telefono}, ${l.web}, 'web-ia'
            WHERE NOT EXISTS (
              SELECT 1 FROM mailing_prospectos WHERE lower(empresa_nombre) = lower(${l.empresa})
            )
            RETURNING id
          `)
          if (r.length) insertados++
        }
      } catch { /* duplicado u otro: ignorar fila */ }
    }

    return NextResponse.json({
      ok: true, encontrados: leads.length, insertados,
      duplicados: leads.length - insertados, con_email: conEmail, aviso: error || undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
