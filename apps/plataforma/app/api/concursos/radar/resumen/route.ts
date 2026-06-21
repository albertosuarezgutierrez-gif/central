import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { aiRunner } from '@/lib/concursos'

// D "Resumen IA" del buscador: resume un anuncio en lenguaje claro. El resumen es
// del ANUNCIO (no de la empresa) → se cachea en el corpus compartido por `id`.
export const maxDuration = 30

export async function POST(req: Request) {
  try { await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }
  const id = b?.id ? String(b.id) : null

  if (id) {
    const cached = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT resumen_ia FROM concursos_licitaciones WHERE id = ${id}::uuid`)
    if (cached[0]?.resumen_ia) return NextResponse.json({ resumen: cached[0].resumen_ia, cacheado: true })
  }

  const titulo = String(b?.titulo || '')
  const objeto = String(b?.objeto || '')
  if (!titulo && !objeto) return NextResponse.json({ error: 'Falta el anuncio' }, { status: 400 })
  const cpv = Array.isArray(b?.cpv) ? b.cpv.join(', ') : ''
  const presupuesto = b?.presupuesto != null ? `${b.presupuesto} €` : 'no consta'

  const system = 'Eres un asistente que ayuda a una PYME a entender licitaciones públicas. Resume en 1-2 frases claras y en español, sin jerga, QUÉ se contrata y para quién. Máximo 280 caracteres. No inventes datos que no aparezcan.'
  const user = `Título: ${titulo}\nObjeto: ${objeto}\nCPV: ${cpv}\nPresupuesto: ${presupuesto}`
  let resumen = ''
  try { resumen = (await aiRunner(system, user)).trim().slice(0, 400) }
  catch { return NextResponse.json({ error: 'La IA no pudo resumir ahora mismo.' }, { status: 502 }) }

  if (id && resumen) {
    try { await prisma.$executeRaw(Prisma.sql`UPDATE concursos_licitaciones SET resumen_ia = ${resumen} WHERE id = ${id}::uuid`) } catch {}
  }
  return NextResponse.json({ resumen })
}
