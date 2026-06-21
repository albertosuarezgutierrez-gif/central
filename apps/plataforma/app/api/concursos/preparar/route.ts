import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// H "Preparar candidatura 1 clic": crea un concurso (workspace) desde un resultado
// del buscador, sin pliego → ficha mínima a partir del anuncio. El usuario sube
// luego el pliego para el análisis profundo (Go/No-Go, criterios, memoria, oferta);
// el sobre administrativo (DEUC + declaración) ya funciona con perfil + biblioteca.
export async function POST(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }
  const l = b?.licitacion
  if (!l || !(l.titulo || l.objeto)) return NextResponse.json({ error: 'Falta la licitación' }, { status: 400 })

  const ficha = {
    objeto: l.objeto || l.titulo,
    expediente: l.expediente ?? null,
    organo: l.organo ?? null,
    lugar: l.provincia ?? null,
    presupuesto_base: l.presupuesto ?? null,
    fin_presentacion: l.fin_presentacion ?? null,
    cpv: l.cpv ?? [],
    url: l.url ?? null,
    desde_buscador: true,
  }
  const goNoGo = {
    veredicto: 'ambar',
    motivos: ['Creado desde el buscador. Sube el pliego para el análisis completo (Go/No-Go, criterios de valoración y memoria técnica).'],
  }

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO concursos (empresa_id, titulo, expediente, ficha, checklist, go_no_go, garantias, texto_origen)
    VALUES (
      ${empresa_id}::uuid,
      ${l.titulo || l.objeto},
      ${l.expediente ?? null},
      ${JSON.stringify(ficha)}::jsonb,
      ${JSON.stringify([])}::jsonb,
      ${JSON.stringify(goNoGo)}::jsonb,
      ${JSON.stringify({})}::jsonb,
      ${''}
    )
    RETURNING id, titulo, expediente, estado, ficha, checklist, go_no_go, garantias, created_at
  `)
  return NextResponse.json({ concurso: rows[0] })
}
