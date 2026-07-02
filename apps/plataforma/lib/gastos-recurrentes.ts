import { prisma } from '@/lib/db'
import { aiComplete } from '@/lib/ai-client'

export type PatronRecurrente = {
  concepto: string
  etiqueta: string
  destino: string
  tipo: 'ingreso' | 'gasto'
  importeMedioMensual: number
  mesesDetectado: number
  proyectable: boolean
}

export function calcularMesesRestantes(year: number, now = new Date()): number {
  const yearActual = now.getFullYear()
  if (yearActual > year) return 0
  if (yearActual < year) return 12
  const mesActual = now.getMonth() + 1
  return Math.max(0, 12 - mesActual)
}

type SqlPatron = {
  concepto_normalizado: string
  destino: string
  signo: string
  meses_detectado: unknown
  importe_medio_mensual: unknown
}

async function detectarPatronesSQL(cuentaId: string): Promise<SqlPatron[]> {
  return prisma.$queryRaw<SqlPatron[]>`
    WITH movs_periodo AS (
      SELECT
        m.concepto_normalizado,
        m.destino,
        SIGN(m.importe)::int AS signo,
        ABS(m.importe) AS importe_abs,
        date_trunc('month', m.fecha) AS mes
      FROM v_movimientos_activos m
      JOIN cuentas_bancarias cb ON cb.id = m.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}
        AND m.destino IN ('seguros', 'turistico_pisos', 'turistico_duplex')
        AND COALESCE(m.amortizable, false) = false
        AND m.fecha >= date_trunc('month', now()) - INTERVAL '3 months'
        AND m.fecha < date_trunc('month', now())
    ),
    grupos AS (
      SELECT
        concepto_normalizado,
        destino,
        signo,
        COUNT(DISTINCT mes)::int AS meses_detectado,
        AVG(importe_abs) AS importe_medio_mensual
      FROM movs_periodo
      GROUP BY concepto_normalizado, destino, signo
      HAVING COUNT(DISTINCT mes) >= 2
    )
    SELECT * FROM grupos ORDER BY importe_medio_mensual DESC
  `
}

async function enriquecerConIA(
  candidatos: SqlPatron[]
): Promise<Map<string, { etiqueta: string; proyectable: boolean }>> {
  const prompt = `Eres un asistente fiscal español. Analiza estos movimientos bancarios recurrentes detectados automáticamente y para cada uno indica si es proyectable como gasto/ingreso futuro fijo.

Responde ÚNICAMENTE con un array JSON con este formato exacto (sin texto extra):
[{"idx":0,"etiqueta":"Nombre legible","proyectable":true},...]

Candidatos:
${candidatos.map((c, i) => `${i}. concepto="${c.concepto_normalizado}" destino="${c.destino}" importe_medio=${Number(c.importe_medio_mensual).toFixed(2)}€ tipo=${Number(c.signo) > 0 ? 'ingreso' : 'gasto'}`).join('\n')}

Reglas:
- proyectable=false solo si parece un pago atrasado en 2 plazos, no un gasto fijo real
- etiqueta: nombre corto y descriptivo ("Alquiler Luxury Busto", "Comisiones Generali", etc.)
- Responde solo el array JSON`

  const resultado = await aiComplete([{ role: 'user', content: prompt }])
  const jsonStr = resultado.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '')
  const parsed: Array<{ idx: number; etiqueta: string; proyectable: boolean }> = JSON.parse(jsonStr)
  const mapa = new Map<string, { etiqueta: string; proyectable: boolean }>()
  for (const item of parsed) {
    const c = candidatos[item.idx]
    if (c) mapa.set(c.concepto_normalizado, { etiqueta: item.etiqueta, proyectable: item.proyectable })
  }
  return mapa
}

export async function detectarPatronesRecurrentes(
  cuentaId: string,
  year: number
): Promise<{
  patrones: PatronRecurrente[]
  ingresosProyectados: number
  gastosProyectados: number
  mesesRestantes: number
}> {
  const mesesRestantes = calcularMesesRestantes(year)

  const candidatos = await detectarPatronesSQL(cuentaId)
  if (candidatos.length === 0) {
    return { patrones: [], ingresosProyectados: 0, gastosProyectados: 0, mesesRestantes }
  }

  let enriquecido = new Map<string, { etiqueta: string; proyectable: boolean }>()
  try {
    enriquecido = await enriquecerConIA(candidatos)
  } catch {
    // AI fallback: usar concepto como etiqueta, proyectable=true para todos
  }

  const patrones: PatronRecurrente[] = candidatos.map(c => {
    const ia = enriquecido.get(c.concepto_normalizado)
    return {
      concepto: c.concepto_normalizado,
      etiqueta: ia?.etiqueta ?? c.concepto_normalizado,
      destino: c.destino,
      tipo: Number(c.signo) > 0 ? 'ingreso' : 'gasto',
      importeMedioMensual: Number(c.importe_medio_mensual),
      mesesDetectado: Number(c.meses_detectado),
      proyectable: ia?.proyectable ?? true,
    }
  })

  const proyectables = patrones.filter(p => p.proyectable)
  const ingresosProyectados = proyectables
    .filter(p => p.tipo === 'ingreso')
    .reduce((s, p) => s + p.importeMedioMensual * mesesRestantes, 0)
  const gastosProyectados = proyectables
    .filter(p => p.tipo === 'gasto')
    .reduce((s, p) => s + p.importeMedioMensual * mesesRestantes, 0)

  return { patrones, ingresosProyectados, gastosProyectados, mesesRestantes }
}
