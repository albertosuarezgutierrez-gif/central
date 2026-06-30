import { prisma } from '@/lib/db'

// Pisos de explotación turística Kutxa (comparten lavandería)
const KUTXA_PISOS = ['prop_house_sevillana', 'prop_busto_reform', 'prop_luxury_busto']
const LAVANDERIA_CONTRAPARTE = 'LAVANDERIA EL GIRANDILLO'

export interface PLGastosPiso {
  lavanderia: number
  alquiler: number    // alquiler del local al propietario (Bustos Tavera)
  suministros: number // electricidad, internet
  comunidad: number
  otros: number
  total: number
}

export interface PLPiso {
  propertyId: string
  nombre: string
  maxHuespedes: number
  ingresos: number
  reservas: number
  gastos: PLGastosPiso
  resultado: number
  margen: number   // porcentaje sobre ingresos
}

export interface PLMensual {
  mes: string       // 'YYYY-MM'
  pisos: PLPiso[]
}

function emptyGastos(): PLGastosPiso {
  return { lavanderia: 0, alquiler: 0, suministros: 0, comunidad: 0, otros: 0, total: 0 }
}

function catToField(categoria: string): keyof Omit<PLGastosPiso, 'total'> {
  switch (categoria.toUpperCase()) {
    case 'ALQUILER':    return 'alquiler'
    case 'SUMINISTROS': return 'suministros'
    case 'COMUNIDAD':   return 'comunidad'
    default:            return 'otros'
  }
}

export async function getPLMensual(mes: string): Promise<PLMensual> {
  const [year, month] = mes.split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end   = new Date(year, month, 1)

  const [props, incomes, gastosDirect, repartoRows, lavanderiaMov] = await Promise.all([
    // Propiedades (excluye multi/personal)
    prisma.$queryRaw<Array<{ id: string; name: string; maxGuests: number | null }>>`
      SELECT id, name, "maxGuests" FROM properties
      WHERE id NOT IN ('prop_multi_apartamentos', 'prop_personal')
      ORDER BY name
    `,

    // Ingresos por piso (checkIn en el mes)
    prisma.$queryRaw<Array<{ pid: string; ingresos: number; reservas: number }>>`
      SELECT "propertyId" AS pid,
        COALESCE(SUM(amount), 0)::float  AS ingresos,
        COUNT(*)::int                    AS reservas
      FROM incomes
      WHERE "checkIn" >= ${start} AND "checkIn" < ${end}
      GROUP BY "propertyId"
    `,

    // Gastos directos por piso (tabla gastos, excluye personal/multi)
    prisma.$queryRaw<Array<{ propiedad: string; categoria: string; total: number }>>`
      SELECT propiedad,
        COALESCE(NULLIF(categoria,''), 'OTRO') AS categoria,
        COALESCE(SUM(total), 0)::float         AS total
      FROM gastos
      WHERE fecha >= ${start} AND fecha < ${end}
        AND propiedad NOT IN ('prop_multi_apartamentos', 'prop_personal', '')
      GROUP BY propiedad, categoria
    `,

    // Costes compartidos ya repartidos (movimiento_reparto)
    prisma.$queryRaw<Array<{ propiedad: string; importe: number }>>`
      SELECT r.propiedad, COALESCE(SUM(r.importe), 0)::float AS importe
      FROM movimiento_reparto r
      JOIN movimientos_bancarios m ON m.id = r.movimiento_id
      WHERE m.fecha_operacion >= ${start} AND m.fecha_operacion < ${end}
      GROUP BY r.propiedad
    `,

    // El Giraldillo en banco, aún no en movimiento_reparto
    prisma.$queryRaw<Array<{ id: string; importe: number; en_reparto: boolean }>>`
      SELECT m.id,
        ABS(m.importe)::float AS importe,
        EXISTS (SELECT 1 FROM movimiento_reparto r WHERE r.movimiento_id = m.id) AS en_reparto
      FROM v_movimientos_activos m
      WHERE m.fecha_operacion >= ${start} AND m.fecha_operacion < ${end}
        AND m.contraparte = ${LAVANDERIA_CONTRAPARTE}
        AND m.importe < 0
    `,
  ])

  // Lavandería no asignada todavía
  const lavanderiaLibre = lavanderiaMov
    .filter(r => !r.en_reparto)
    .reduce((s, r) => s + Number(r.importe), 0)

  // Ingresos y reservas por piso
  const mIncome = new Map(incomes.map(r => [r.pid, { ingresos: Number(r.ingresos), reservas: Number(r.reservas) }]))

  // Pesos para reparto El Giraldillo: maxHuespedes × reservas (solo Kutxa pisos)
  let pesoTotal = 0
  const pesos = new Map<string, number>()
  for (const p of props.filter(p => KUTXA_PISOS.includes(p.id))) {
    const w = (p.maxGuests ?? 0) * (mIncome.get(p.id)?.reservas ?? 0)
    pesos.set(p.id, w)
    pesoTotal += w
  }

  // Construir mapa de gastos
  const mGastos = new Map<string, PLGastosPiso>()
  for (const row of gastosDirect) {
    if (!mGastos.has(row.propiedad)) mGastos.set(row.propiedad, emptyGastos())
    const g = mGastos.get(row.propiedad)!
    g[catToField(row.categoria)] += Number(row.total)
  }

  // Añadir movimiento_reparto (ya repartido manualmente) → lavanderia
  for (const row of repartoRows) {
    if (!mGastos.has(row.propiedad)) mGastos.set(row.propiedad, emptyGastos())
    mGastos.get(row.propiedad)!.lavanderia += Number(row.importe)
  }

  // Añadir El Giraldillo repartido por fórmula
  if (lavanderiaLibre > 0 && pesoTotal > 0) {
    for (const [pid, peso] of pesos) {
      if (!mGastos.has(pid)) mGastos.set(pid, emptyGastos())
      mGastos.get(pid)!.lavanderia += Math.round((peso / pesoTotal) * lavanderiaLibre * 100) / 100
    }
  }

  // Ensamblar resultado final
  const pisos: PLPiso[] = props.map(p => {
    const inc = mIncome.get(p.id) ?? { ingresos: 0, reservas: 0 }
    const g   = mGastos.get(p.id) ?? emptyGastos()
    g.total   = Math.round((g.lavanderia + g.alquiler + g.suministros + g.comunidad + g.otros) * 100) / 100
    const resultado = Math.round((inc.ingresos - g.total) * 100) / 100
    return {
      propertyId:  p.id,
      nombre:      p.name,
      maxHuespedes: p.maxGuests ?? 0,
      ingresos:    Number(inc.ingresos),
      reservas:    Number(inc.reservas),
      gastos:      g,
      resultado,
      margen:      inc.ingresos > 0 ? Math.round((resultado / inc.ingresos) * 100) : 0,
    }
  })

  return { mes, pisos }
}

/** Mes anterior al actual en formato 'YYYY-MM' */
export function mesPorDefecto(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
