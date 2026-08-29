import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { aiComplete } from '@/lib/ai-client'
import { CATEGORIAS_GASTO, PROPS_GASTO } from '@/lib/sivra/constantes'
import {
  construirSystem, construirUser, interpretarRespuestaIA,
  type ContextoFactura, type ListasBlancas,
} from '@/lib/agente-facturas/sugerencia-ia'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const LISTAS: ListasBlancas = { categorias: CATEGORIAS_GASTO, propiedades: PROPS_GASTO }

/** Cuántas facturas ya revisadas del mismo proveedor se le enseñan a la IA. */
const HISTORICO_MAX = 10
/** Ventana para casar la factura con su cargo bancario. Kutxabank va 1-3 días por detrás. */
const DIAS_ANTES = 5
const DIAS_DESPUES = 15

// POST /api/expenses/pendientes/[id]/sugerir-ia
//
// La IA PROPONE piso y categoría para una factura de la bandeja. NO escribe nada: la propuesta
// rellena los desplegables y Alberto confirma. La escritura sigue siendo el PATCH de al lado.
//
// 🚨 Se separa a propósito del GET de la bandeja: listar 32 facturas no puede costar 32 llamadas
// al modelo. La propuesta determinista (gratis, instantánea) viaja en el listado; esta es bajo
// demanda.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params

  const [f] = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id::text, fecha::text, proveedor, nif_proveedor, numero_factura, concepto,
           categoria, total, fingerprint
    FROM gastos
    WHERE id = ${id}::uuid AND revisado = false AND origen IS NOT NULL
    LIMIT 1
  `)
  if (!f) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const total = Number(f.total ?? 0)

  // Histórico ya revisado del MISMO proveedor: la señal más fuerte que hay.
  const historico = f.fingerprint
    ? await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT fecha::text, propiedad, categoria
        FROM gastos
        WHERE revisado = true AND fingerprint = ${f.fingerprint}
        ORDER BY fecha DESC
        LIMIT ${HISTORICO_MAX}
      `)
    : []

  // Cargo bancario que casa: dice de qué cuenta salió, y la correduría es SIEMPRE BBVA.
  // Se lee de `v_movimientos_activos` (vista canónica que ya excluye duplicados) y con scope de
  // cuenta, como toda consulta multi-tenant del repo.
  //
  // 🚨 Si esta lectura falla, `movimiento` queda en `null` y el prompt lo DECLARA como «no se ha
  // encontrado» — un fallo de consulta no puede convertirse en «esta factura no está pagada».
  let movimiento: ContextoFactura['movimiento'] = null
  let bancoIlegible = false
  try {
    const [m] = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT cb.banco, mb.concepto, mb.destino
      FROM v_movimientos_activos mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${session.id}::uuid
        AND mb.importe < 0
        AND abs(abs(mb.importe) - ${total}) < 0.02
        AND mb.fecha_operacion BETWEEN (${f.fecha}::date - ${DIAS_ANTES}) AND (${f.fecha}::date + ${DIAS_DESPUES})
      ORDER BY mb.fecha_operacion ASC
      LIMIT 1
    `)
    movimiento = m ? { banco: m.banco, concepto: m.concepto, destino: m.destino } : null
  } catch (e) {
    bancoIlegible = true
    console.error('[pendientes/sugerir-ia] no se pudo leer el banco ·', e instanceof Error ? e.message : String(e))
  }

  const contexto: ContextoFactura = {
    proveedor: f.proveedor,
    nif_proveedor: f.nif_proveedor,
    concepto: f.concepto,
    numero_factura: f.numero_factura,
    fecha: f.fecha,
    total,
    historico: historico.map((h) => ({ fecha: h.fecha, propiedad: h.propiedad, categoria: h.categoria })),
    movimiento,
  }

  let raw: string
  try {
    raw = await aiComplete([
      { role: 'system', content: construirSystem(LISTAS) },
      { role: 'user', content: construirUser(contexto) },
    ], { timeoutMs: 30_000 })
  } catch (e) {
    // 502 y no una propuesta vacía: «no se pudo preguntar» no es «la IA no lo sabe».
    console.error('[pendientes/sugerir-ia] la pasarela falló ·', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'No se pudo consultar a la IA ahora mismo.' }, { status: 502 })
  }

  const sugerencia = interpretarRespuestaIA(raw, LISTAS)
  return NextResponse.json({
    sugerencia,
    // Lo que la IA llegó a ver, para que la pantalla no presente como informada una propuesta
    // hecha a ciegas.
    contexto: {
      historico: historico.length,
      banco: movimiento?.banco ?? null,
      bancoIlegible,
    },
  })
}
