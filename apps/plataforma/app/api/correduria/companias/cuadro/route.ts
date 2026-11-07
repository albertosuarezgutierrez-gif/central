import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { prisma } from '@/lib/db'
import { cuadroAsegura } from '@/lib/companias-asegura'
import { agregarLibro, interpretarCuadro, type FilaLibro } from '@/lib/cuadro-companias'

export const dynamic = 'force-dynamic'

/** Libro de comisiones (`comisiones_devengo`) de la cuenta en el año. `null` = no se pudo leer (≠ sin filas). */
async function libroDelAnio(cuentaId: string, anio: number) {
  try {
    const filas = await prisma.$queryRaw<Array<Omit<FilaLibro, 'periodo_inicio'> & { periodo_inicio: Date }>>`
      SELECT compania_codigo, periodo_inicio,
             esperado_bruto::float AS esperado_bruto, liq_bruto::float AS liq_bruto,
             liq_remesa::float AS liq_remesa, banco_total::float AS banco_total, leido_ok
      FROM comisiones_devengo
      WHERE cuenta_id = ${cuentaId}::uuid
        AND EXTRACT(year FROM periodo_inicio) = ${anio}`
    return Object.fromEntries(agregarLibro(filas.map((f) => ({ ...f, periodo_inicio: f.periodo_inicio.toISOString().slice(0, 10) }))))
  } catch (e) {
    console.error('[correduria] companias/cuadro → libro de comisiones ilegible', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * GET /api/correduria/companias/cuadro?anio=YYYY — el cuadro de mando por compañía (asegura) más el libro de
 * comisiones del año y del anterior (esta app). Cada mitad viaja con su propio estado: si el libro falla, el
 * cuadro se pinta igual y «liquidada/cobrada» dicen «no se ha podido leer», no 0.
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const actual = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).slice(0, 4))
  const n = Number(req.nextUrl.searchParams.get('anio'))
  const anio = Number.isInteger(n) && n >= 2000 && n <= actual ? n : actual
  const [puerto, libro, libroAnterior] = await Promise.all([
    cuadroAsegura(anio),
    libroDelAnio(guarda.session.id, anio),
    libroDelAnio(guarda.session.id, anio - 1),
  ])
  return NextResponse.json({ anio, cuadro: interpretarCuadro(puerto.status, puerto.json), libro, libroAnterior })
}
