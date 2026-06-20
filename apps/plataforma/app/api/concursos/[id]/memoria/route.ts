import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { aiRunner } from '@/lib/concursos'
import { planificarMemoria, construirPromptMemoria, coberturaMemoria } from '@central/module-concursos'
import type { SeccionMemoriaRellena } from '@central/module-concursos'

export const maxDuration = 60

// GET — devuelve la memoria guardada + su cobertura.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() } catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  const { id } = await params
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT ficha, memoria FROM concursos WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  if (!rows[0]) return NextResponse.json({ error: 'Concurso no encontrado' }, { status: 404 })
  const memoria = rows[0].memoria ?? { secciones: [] }
  const cobertura = coberturaMemoria(memoria.secciones ?? [], rows[0].ficha)
  return NextResponse.json({ memoria, cobertura })
}

// POST — planifica la memoria, redacta cada sección con el LLM y la persiste.
// body opcional { contexto?: string } con datos de la empresa para el LLM.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() } catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  const { id } = await params
  let contexto = ''
  try { contexto = String((await req.json())?.contexto ?? '') } catch {}

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT ficha FROM concursos WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  if (!rows[0]) return NextResponse.json({ error: 'Concurso no encontrado' }, { status: 404 })
  const ficha = rows[0].ficha

  const plan = planificarMemoria(ficha)
  if (plan.length === 0) return NextResponse.json({ error: 'Este concurso no tiene criterios de juicio de valor (memoria no aplica).' }, { status: 400 })

  const secciones: SeccionMemoriaRellena[] = []
  for (const seccion of plan) {
    const { system, user } = construirPromptMemoria(ficha, seccion, contexto)
    let contenido = ''
    try { contenido = await aiRunner(system, user) } catch { contenido = '' }
    secciones.push({ ...seccion, contenido: (contenido || '').trim() })
  }
  const memoria = { secciones }

  await prisma.$queryRaw(Prisma.sql`
    UPDATE concursos SET memoria = ${JSON.stringify(memoria)}::jsonb
    WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  return NextResponse.json({ memoria, cobertura: coberturaMemoria(secciones, ficha) })
}
