// ────────────────────────────────────────────────────────────────────────────
// POST /api/inversion/underwrite — analiza si comprar un inmueble concreto renta.
//
// Vive FUERA de `/api/sivra/*` a propósito: esto no es de la vertical de Sevilla
// (el primer caso analizado es Conil de la Frontera). El cálculo entero está en
// `lib/inversion/underwriting.ts`, que es puro y testeado; aquí solo hay sesión,
// validación y persistencia.
// ────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { analizarInversion, type EntradaUnderwriting } from '@/lib/inversion/underwriting'

export const dynamic = 'force-dynamic'

const unidadSchema = z.object({ nombre: z.string(), plazas: z.number().int().positive() })

const mesSchema = z.object({
  mes: z.number().int().min(1).max(12),
  adrGuest: z.number().positive().nullable(),
  comparables: z.number().int().min(0),
  ocupacionProxy: z.number().min(0).max(1).nullable(),
})

const entradaSchema = z.object({
  ficha: z.object({
    referencia: z.string().min(1),
    municipio: z.string().min(1),
    precio: z.number().positive().nullable(),
    m2: z.number().positive().nullable(),
    plazasTotales: z.number().int().positive().nullable(),
    unidades: z.array(unidadSchema),
    reforma: z.number().min(0).nullable(),
    gastosCompraPct: z.number().min(0).max(1),
  }),
  legal: z.object({
    licenciaVUT: z.enum(['confirmada', 'no_tiene', 'sin_verificar']),
    registroUnico: z.enum(['confirmada', 'no_tiene', 'sin_verificar']),
    edificioCompleto: z.boolean().nullable(),
    notas: z.array(z.string()),
  }),
  mercado: z.array(z.object({ aforo: z.number().int().positive(), curva: z.array(mesSchema) })),
  costes: z.object({
    comisionCanal: z.number().min(0).max(1),
    gestionPct: z.number().min(0).max(1),
    limpiezaPorEstancia: z.number().min(0),
    nochesPorEstancia: z.number().positive(),
    ibiAnual: z.number().min(0),
    seguroAnual: z.number().min(0),
    suministrosAnual: z.number().min(0),
    comunidadAnual: z.number().min(0),
    mantenimientoPct: z.number().min(0).max(1),
  }),
  financiacion: z
    .object({
      porcentaje: z.number().min(0).max(1),
      tipoInteres: z.number().min(0).max(1),
      anios: z.number().int().positive(),
    })
    .nullable(),
  supuestos: z.object({
    ocupacionPorDefecto: z.number().min(0).max(1).nullable(),
    rampaAnio1: z.number().min(0).max(1),
    aniosHorizonte: z.number().int().positive().max(50),
    alternativaLiquida: z.number().min(0).max(1),
    largaDuracionMensual: z.number().min(0).nullable(),
    revalorizacionAnual: z.number().min(-1).max(1),
    comisionRecuperableAnual: z.number().min(0).nullable(),
  }),
  nota: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parseado = entradaSchema.safeParse(cuerpo)
  if (!parseado.success) {
    return NextResponse.json({ error: 'Entrada inválida', detalle: parseado.error.issues }, { status: 400 })
  }

  const { nota, ...entrada } = parseado.data
  const resultado = analizarInversion(entrada as EntradaUnderwriting)

  // 🚨 Un fallo al GUARDAR no puede disfrazarse de análisis correcto, ni al revés.
  // Se devuelve siempre el análisis (que es puro y ya está hecho) y aparte se dice
  // si quedó registrado y por qué no, en vez de tragarse el error o fingir un 500.
  let guardado = false
  let motivoNoGuardado: string | null = null
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO inversion_analisis
        (referencia, municipio, motor_version, supuestos, resultado, decision, yield_neto, nota)
      VALUES (
        ${entrada.ficha.referencia},
        ${entrada.ficha.municipio},
        ${resultado.motorVersion},
        ${JSON.stringify(entrada)}::jsonb,
        ${JSON.stringify(resultado)}::jsonb,
        ${resultado.veredicto.decision},
        ${mejorYieldNeto(resultado.escenarios)},
        ${nota ?? null}
      )
    `)
    guardado = true
  } catch (e) {
    motivoNoGuardado = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({ resultado, guardado, motivoNoGuardado })
}

/** `null` cuando no hay escenarios: el veredicto no es calculable, no es un yield de 0. */
function mejorYieldNeto(escenarios: { yieldNeto: number }[] | null): number | null {
  if (!escenarios?.length) return null
  return Math.max(...escenarios.map(e => e.yieldNeto))
}

/** Últimos análisis, para ver qué se estimó y poder contrastarlo con el tiempo. */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const referencia = searchParams.get('referencia')
  const limite = Math.min(parseInt(searchParams.get('limite') || '20'), 100)

  try {
    const filas = await prisma.$queryRaw(Prisma.sql`
      SELECT id, created_at, referencia, municipio, motor_version, decision, yield_neto, nota
      FROM inversion_analisis
      ${referencia ? Prisma.sql`WHERE referencia = ${referencia}` : Prisma.empty}
      ORDER BY created_at DESC
      LIMIT ${limite}
    `)
    return NextResponse.json({ analisis: filas })
  } catch (e) {
    // Mismo criterio: no se devuelve `[]` (que se leería como «no hay análisis»).
    return NextResponse.json(
      { error: 'No se pudo leer el histórico', detalle: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    )
  }
}
