import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Ficha CUALITATIVA manual (bloque E): edad CEO/consejo, salud, descendencia, preconcurso, notas.
// No depende de ninguna API externa — usable ya.

interface FichaRow {
  empresa_norm: string
  ceo_edad: number | null
  consejo_edad_media: number | null
  salud_nota: string | null
  descendencia: boolean | null
  preconcurso: boolean | null
  notas: string | null
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresaNorm = req.nextUrl.searchParams.get('empresaNorm') ?? ''
  if (!empresaNorm) return NextResponse.json({ error: 'empresaNorm requerido' }, { status: 400 })
  const rows = await prisma.$queryRaw<FichaRow[]>`
    SELECT empresa_norm, ceo_edad, consejo_edad_media, salud_nota, descendencia, preconcurso, notas
    FROM empresas_ficha WHERE empresa_norm = ${empresaNorm} LIMIT 1`
  return NextResponse.json({ ficha: rows[0] ?? null })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const empresaNorm = typeof b.empresaNorm === 'string' ? b.empresaNorm : ''
  if (!empresaNorm.trim()) return NextResponse.json({ error: 'empresaNorm requerido' }, { status: 400 })

  const intOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null)
  const boolOrNull = (v: unknown) => (typeof v === 'boolean' ? v : null)
  const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 2000) : null)

  const ceoEdad = intOrNull(b.ceoEdad)
  const consejoEdad = intOrNull(b.consejoEdadMedia)
  const salud = strOrNull(b.saludNota)
  const descendencia = boolOrNull(b.descendencia)
  const preconcurso = boolOrNull(b.preconcurso)
  const notas = strOrNull(b.notas)

  await prisma.$executeRaw`
    INSERT INTO empresas_ficha (empresa_norm, ceo_edad, consejo_edad_media, salud_nota, descendencia, preconcurso, notas, actualizado_en)
    VALUES (${empresaNorm}, ${ceoEdad}, ${consejoEdad}, ${salud}, ${descendencia}, ${preconcurso}, ${notas}, now())
    ON CONFLICT (empresa_norm) DO UPDATE SET
      ceo_edad = EXCLUDED.ceo_edad, consejo_edad_media = EXCLUDED.consejo_edad_media,
      salud_nota = EXCLUDED.salud_nota, descendencia = EXCLUDED.descendencia,
      preconcurso = EXCLUDED.preconcurso, notas = EXCLUDED.notas, actualizado_en = now()`

  return NextResponse.json({ ok: true })
}
