import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { estadoCuadre, totalEsCerrado, cuantosPendientes, type EstadoCuadre } from '@/lib/correduria/cuadre'

export const dynamic = 'force-dynamic'

// GET ?año=YYYY — el libro de comisiones del año: los tres ejes por periodo,
// la cobertura por compañía y el total anual que va a la asesoría.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const año = parseInt(new URL(req.url).searchParams.get('año') || '') || new Date().getFullYear()

  const filas = await prisma.$queryRaw<
    Array<{
      compania_codigo: string
      compania: string
      periodo_inicio: Date
      periodo_fin: Date
      esperado_bruto: number | null
      esperado_recibos: number | null
      liq_bruto: number | null
      liq_retencion: number | null
      liq_remesa: number | null
      liq_origen: string | null
      banco_total: number | null
      leido_ok: boolean
    }>
  >`
    SELECT compania_codigo, compania, periodo_inicio, periodo_fin,
           esperado_bruto::float AS esperado_bruto, esperado_recibos,
           liq_bruto::float AS liq_bruto, liq_retencion::float AS liq_retencion,
           liq_remesa::float AS liq_remesa, liq_origen,
           banco_total::float AS banco_total, leido_ok
    FROM comisiones_devengo
    WHERE cuenta_id = ${session.id}::uuid
      AND EXTRACT(year FROM periodo_inicio) = ${año}
    ORDER BY compania, periodo_inicio`

  const cobertura = await prisma.$queryRaw<
    Array<{
      compania_codigo: string
      compania: string
      tiene_recibos_cima: boolean
      tiene_liq_cima: boolean
      tiene_correo_importe: boolean
      nota_gestion: string | null
    }>
  >`
    SELECT compania_codigo, compania, tiene_recibos_cima, tiene_liq_cima,
           tiene_correo_importe, nota_gestion
    FROM comisiones_cobertura
    WHERE cuenta_id = ${session.id}::uuid
    ORDER BY compania`

  const conCobertura = new Set(
    cobertura
      .filter(c => c.tiene_recibos_cima || c.tiene_liq_cima || c.tiene_correo_importe)
      .map(c => c.compania_codigo),
  )

  const periodos = filas.map(f => {
    const estado: EstadoCuadre = estadoCuadre({
      leidoOk: f.leido_ok,
      tieneCobertura: conCobertura.has(f.compania_codigo),
      esperadoBruto: f.esperado_bruto,
      liqBruto: f.liq_bruto,
      liqRetencion: f.liq_retencion,
      liqRemesa: f.liq_remesa,
      bancoTotal: f.banco_total,
    })
    return {
      companiaCodigo: f.compania_codigo,
      compania: f.compania,
      inicio: f.periodo_inicio.toISOString().slice(0, 10),
      fin: f.periodo_fin.toISOString().slice(0, 10),
      esperado: f.esperado_bruto,
      recibos: f.esperado_recibos,
      liqBruto: f.liq_bruto,
      liqRetencion: f.liq_retencion,
      liqRemesa: f.liq_remesa,
      liqOrigen: f.liq_origen,
      banco: f.banco_total,
      estado,
    }
  })

  // 🚨 El total anual NO se presenta como cerrado si falta algún periodo: es la
  // cifra que Alberto manda a la asesoría, y con huecos es provisional.
  const estados = periodos.map(p => p.estado)
  const suma = (k: 'liqBruto' | 'liqRetencion') => periodos.reduce((s, p) => s + (p[k] ?? 0), 0)

  return NextResponse.json({
    año,
    periodos,
    cobertura,
    total: {
      bruto: Math.round(suma('liqBruto') * 100) / 100,
      retencion: Math.round(suma('liqRetencion') * 100) / 100,
      cerrado: totalEsCerrado(estados),
      pendientes: cuantosPendientes(estados),
    },
  })
}
