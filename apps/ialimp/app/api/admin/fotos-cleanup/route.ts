import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const BUCKET        = 'cleaning-photos'
const TTL_DIAS      = 5

async function listarArchivos(session_id: string): Promise<string[]> {
  const res = await fetch(
    SUPABASE_URL + '/storage/v1/object/list/' + BUCKET,
    {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: 'sessions/' + session_id + '/', limit: 100 })
    }
  )
  if (!res.ok) return []
  const archivos = await res.json()
  return (archivos || [])
    .map((a: any) => 'sessions/' + session_id + '/' + a.name)
    .filter((p: string) => !p.endsWith('/'))
}

async function borrarArchivos(paths: string[]): Promise<number> {
  if (!paths.length) return 0
  const res = await fetch(
    SUPABASE_URL + '/storage/v1/object/' + BUCKET,
    {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths })
    }
  )
  return res.ok ? paths.length : 0
}

export async function GET() {
  try {
    const limite = new Date()
    limite.setDate(limite.getDate() - TTL_DIAS)
    const limite_iso = limite.toISOString().split('T')[0]

    const sesiones = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id::text, session_date::text, checklist_data
      FROM cleaning_sessions
      WHERE session_date <= ${limite_iso}::date
        AND completed_at IS NOT NULL
        AND checklist_data IS NOT NULL
        AND checklist_data::text LIKE '%foto_url%'
    `)

    let fotos_borradas    = 0
    let sesiones_limpias  = 0

    for (const s of sesiones) {
      const paths   = await listarArchivos(s.id)
      if (!paths.length) continue
      const borradas = await borrarArchivos(paths)
      fotos_borradas += borradas
      if (borradas > 0) {
        const checklist = Array.isArray(s.checklist_data) ? s.checklist_data : []
        const limpio    = checklist.map((item: any) => ({ ...item, foto_url: null }))
        await prisma.$executeRaw(Prisma.sql`
          UPDATE cleaning_sessions SET checklist_data = ${JSON.stringify(limpio)}::jsonb
          WHERE id = ${s.id}::uuid
        `)
        sesiones_limpias++
      }
    }

    return NextResponse.json({
      ok: true, sesiones_limpias, fotos_borradas,
      ttl_dias: TTL_DIAS, limite_iso, candidatas: sesiones.length
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
