// Recolector de leads desde Google Places (panel superadmin).
// POST { query, ciudad?, max?, buscarEmail? } → busca empresas, opcionalmente
// extrae su email de la web, e inserta en mailing_prospectos (origen='google'),
// idempotente por google_place_id.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { isSuperadmin } from '@/lib/tenant'
import { buscarEmpresasGoogle, extraerEmailDeWeb } from '@/lib/google-leads'

export async function POST(req: NextRequest) {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const queryBase = String(b?.query || 'empresas de limpieza').trim()
    const ciudad = String(b?.ciudad || 'Sevilla').trim()
    const max = Math.min(Math.max(Number(b?.max) || 20, 1), 40)
    const buscarEmail = b?.buscarEmail !== false

    const query = ciudad ? `${queryBase} en ${ciudad}` : queryBase
    const { leads, error } = await buscarEmpresasGoogle({ query, max })
    if (error && !leads.length) return NextResponse.json({ error }, { status: 502 })

    // Extracción de email en paralelo (acotada al timeout serverless).
    if (buscarEmail) {
      await Promise.allSettled(leads.map(async l => {
        if (l.web) l.email = await extraerEmailDeWeb(l.web)
      }))
    }

    let insertados = 0, conEmail = 0
    for (const l of leads) {
      const email = l.email || null
      if (email) conEmail++
      try {
        const r = await prisma.$queryRaw<{ insertado: boolean }[]>(Prisma.sql`
          INSERT INTO mailing_prospectos (empresa_nombre, email, telefono, ciudad, web, google_place_id, origen)
          VALUES (${l.nombre}, ${email}, ${l.telefono}, ${ciudad || null}, ${l.web}, ${l.place_id}, 'google')
          ON CONFLICT (google_place_id) WHERE google_place_id IS NOT NULL DO UPDATE SET
            telefono = COALESCE(EXCLUDED.telefono, mailing_prospectos.telefono),
            web = COALESCE(EXCLUDED.web, mailing_prospectos.web),
            email = COALESCE(mailing_prospectos.email, EXCLUDED.email)
          RETURNING (xmax = 0) AS insertado
        `)
        if (r[0]?.insertado) insertados++
      } catch {
        // El email ya existe en otro prospecto (índice único lower(email)).
        // Reinsertamos el lead de Google sin email para no perder el teléfono/web.
        try {
          const r2 = await prisma.$queryRaw<{ insertado: boolean }[]>(Prisma.sql`
            INSERT INTO mailing_prospectos (empresa_nombre, email, telefono, ciudad, web, google_place_id, origen)
            VALUES (${l.nombre}, NULL, ${l.telefono}, ${ciudad || null}, ${l.web}, ${l.place_id}, 'google')
            ON CONFLICT (google_place_id) WHERE google_place_id IS NOT NULL DO UPDATE SET
              telefono = COALESCE(EXCLUDED.telefono, mailing_prospectos.telefono),
              web = COALESCE(EXCLUDED.web, mailing_prospectos.web)
            RETURNING (xmax = 0) AS insertado
          `)
          if (r2[0]?.insertado) insertados++
        } catch { /* duplicado real: ignorar */ }
      }
    }

    return NextResponse.json({
      ok: true, encontrados: leads.length, insertados,
      duplicados: leads.length - insertados, con_email: conEmail,
      aviso: error || undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
