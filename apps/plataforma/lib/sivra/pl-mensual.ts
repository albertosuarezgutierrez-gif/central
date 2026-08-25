import { prisma } from '@/lib/db'
import { repartirPagoSiqueBrilla } from './reparto-siquebrilla'

// Pisos de explotación turística Kutxa (comparten lavandería)
const KUTXA_PISOS = ['prop_house_sevillana', 'prop_busto_reform', 'prop_luxury_busto']
// Decisión de Alberto (28/07/2026): la lavandería es Giraldillo HOY pero puede cambiar de
// proveedor — el reparto no se casa con un nombre: cualquier contraparte "LAVANDERIA…" del
// negocio de pisos cuenta (cubre también la errata "GIRANDILLO" del feed). El filtro
// destino='turistico_pisos' evita pescar una tintorería personal.
const LAVANDERIA_CONTRAPARTE_LIKE = '%LAVANDERIA%'
const LIMPIEZA_CONTRAPARTE_PREFIJO = 'SI QUE BRILLA%'
// Tarifa por sesión de limpieza que factura Sique Brilla (desglose real de sus facturas
// mensuales: "Luxury (5x28€) + Bustos Reforma (3x20€) + Duplex (4x25€) + Casa Socorro…").
const LIMPIEZA_TARIFAS: Record<string, number> = {
  prop_busto_reform: 20,
  prop_duplex_center: 25,
  prop_luxury_busto: 28,
  prop_house_sevillana: 90,
}

export interface PLGastosPiso {
  lavanderia: number
  limpieza: number    // Sique Brilla, repartida por salidas × tarifa por piso
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
  return { lavanderia: 0, limpieza: 0, alquiler: 0, suministros: 0, comunidad: 0, otros: 0, total: 0 }
}

function catToField(categoria: string): keyof Omit<PLGastosPiso, 'total'> {
  switch (categoria.toUpperCase()) {
    case 'ALQUILER':    return 'alquiler'
    case 'SUMINISTROS': return 'suministros'
    case 'COMUNIDAD':   return 'comunidad'
    case 'LIMPIEZA':    return 'limpieza'
    case 'LAVANDERIA':  return 'lavanderia'
    default:            return 'otros'
  }
}

export async function getPLMensual(mes: string): Promise<PLMensual> {
  const [year, month] = mes.split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end   = new Date(year, month, 1)
  // Mes FACTURADO por Sique Brilla: factura a mes vencido y se paga a primeros del siguiente,
  // así que el pago que cae en el mes de caja corresponde a los servicios del mes anterior.
  const prevStart = new Date(year, month - 2, 1)

  const [props, incomes, gastosDirect, repartoRows, movPropAsignados, lavanderiaMov, limpiezaMov, salidas, salidasPrev, reservasPrev] = await Promise.all([
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

    // Gastos de tarjeta asignados a piso concreto (propiedad_id explícito).
    // SOLO cuentas tipo 'tarjeta': los recibos de la corriente (luz/agua/IBI de Kutxa,
    // que también llevan propiedad_id para lo fiscal) ya entran por factura en `gastos`
    // y sumarlos aquí los contaba DOBLE en el P&L del piso (hallazgo 17/08/2026).
    prisma.$queryRaw<Array<{ propiedad_id: string; importe: number }>>`
      SELECT m.propiedad_id, COALESCE(SUM(ABS(m.importe)), 0)::float AS importe
      FROM v_movimientos_activos m
      JOIN cuentas_bancarias cb ON cb.id = m.cuenta_bancaria_id AND cb.tipo = 'tarjeta'
      WHERE m.fecha_operacion >= ${start} AND m.fecha_operacion < ${end}
        AND m.destino = 'turistico_pisos'
        AND m.propiedad_id IS NOT NULL
        AND m.destino_confirmado = true
        AND m.importe < 0
      GROUP BY m.propiedad_id
    `,

    // El Giraldillo en banco, aún no en movimiento_reparto
    prisma.$queryRaw<Array<{ id: string; importe: number; en_reparto: boolean }>>`
      SELECT m.id,
        ABS(m.importe)::float AS importe,
        EXISTS (SELECT 1 FROM movimiento_reparto r WHERE r.movimiento_id = m.id) AS en_reparto
      FROM v_movimientos_activos m
      WHERE m.fecha_operacion >= ${start} AND m.fecha_operacion < ${end}
        AND m.contraparte ILIKE ${LAVANDERIA_CONTRAPARTE_LIKE}
        AND m.destino = 'turistico_pisos'
        AND m.importe < 0
    `,

    // Sique Brilla (limpieza mensual) en banco, aún no en movimiento_reparto
    prisma.$queryRaw<Array<{ id: string; importe: number; en_reparto: boolean }>>`
      SELECT m.id,
        ABS(m.importe)::float AS importe,
        EXISTS (SELECT 1 FROM movimiento_reparto r WHERE r.movimiento_id = m.id) AS en_reparto
      FROM v_movimientos_activos m
      WHERE m.fecha_operacion >= ${start} AND m.fecha_operacion < ${end}
        AND m.contraparte ILIKE ${LIMPIEZA_CONTRAPARTE_PREFIJO}
        AND m.importe < 0
    `,

    // Salidas del mes por piso (cada checkout = una limpieza de Sique Brilla)
    prisma.$queryRaw<Array<{ pid: string; salidas: number }>>`
      SELECT "propertyId" AS pid, COUNT(*)::int AS salidas
      FROM incomes
      WHERE "checkOut" >= ${start} AND "checkOut" < ${end}
      GROUP BY "propertyId"
    `,

    // Salidas del mes ANTERIOR (el mes que factura Sique Brilla en el pago de este mes)
    prisma.$queryRaw<Array<{ pid: string; salidas: number }>>`
      SELECT "propertyId" AS pid, COUNT(*)::int AS salidas
      FROM incomes
      WHERE "checkOut" >= ${prevStart} AND "checkOut" < ${start}
      GROUP BY "propertyId"
    `,

    // Reservas del mes ANTERIOR (pesos de la lavandería incluida en la factura de Sique Brilla)
    prisma.$queryRaw<Array<{ pid: string; reservas: number }>>`
      SELECT "propertyId" AS pid, COUNT(*)::int AS reservas
      FROM incomes
      WHERE "checkIn" >= ${prevStart} AND "checkIn" < ${start}
      GROUP BY "propertyId"
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

  // Gastos de tarjeta con piso asignado explícitamente → otros
  for (const row of movPropAsignados) {
    if (!mGastos.has(row.propiedad_id)) mGastos.set(row.propiedad_id, emptyGastos())
    mGastos.get(row.propiedad_id)!.otros += Number(row.importe)
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

  // Añadir Sique Brilla. Su factura mensual trae DOS servicios (25/08/2026, factura 2025/333):
  // limpieza (salidas × tarifa contratada) Y lavandería por peso. Y factura a mes vencido, así
  // que el pago del mes de caja corresponde a las salidas del mes ANTERIOR — repartir el total
  // como limpieza del mes de caja le cargaba a un piso la lavandería de todos y las limpiezas
  // de un mes que no era el suyo. Caja del mes sigue mandando: si un mes se pagan dos facturas
  // (o ninguna), el P&L lo refleja.
  const limpiezaLibre = limpiezaMov
    .filter(r => !r.en_reparto)
    .reduce((s, r) => s + Number(r.importe), 0)
  if (limpiezaLibre > 0) {
    const salidasServicio = new Map(salidasPrev.map(s => [s.pid, Number(s.salidas)]))
    const reparto = repartirPagoSiqueBrilla(limpiezaLibre, salidasServicio, LIMPIEZA_TARIFAS)
    if (reparto) {
      for (const [pid, imp] of reparto.limpieza) {
        if (!mGastos.has(pid)) mGastos.set(pid, emptyGastos())
        mGastos.get(pid)!.limpieza += imp
      }
      if (reparto.lavanderia > 0) {
        // El resto es lavandería: misma regla acordada que El Giraldillo (capacidad × reservas,
        // pisos Kutxa), pero con las reservas del mes FACTURADO, que es el que generó esa ropa.
        const mReservasPrev = new Map(reservasPrev.map(r => [r.pid, Number(r.reservas)]))
        let pesoPrevTotal = 0
        const pesosPrev = new Map<string, number>()
        for (const p of props.filter(p => KUTXA_PISOS.includes(p.id))) {
          const w = (p.maxGuests ?? 0) * (mReservasPrev.get(p.id) ?? 0)
          if (w > 0) { pesosPrev.set(p.id, w); pesoPrevTotal += w }
        }
        if (pesoPrevTotal > 0) {
          for (const [pid, peso] of pesosPrev) {
            if (!mGastos.has(pid)) mGastos.set(pid, emptyGastos())
            mGastos.get(pid)!.lavanderia += Math.round((peso / pesoPrevTotal) * reparto.lavanderia * 100) / 100
          }
        } else {
          // Sin reservas del mes facturado no hay pesos: a partes iguales entre los
          // pisos Kutxa antes que evaporar el gasto del P&L.
          const kutxa = props.filter(p => KUTXA_PISOS.includes(p.id))
          for (const p of kutxa) {
            if (!mGastos.has(p.id)) mGastos.set(p.id, emptyGastos())
            mGastos.get(p.id)!.lavanderia += Math.round((reparto.lavanderia / kutxa.length) * 100) / 100
          }
        }
      }
    } else {
      // Fallback sin datos del mes facturado: reparto anterior (salidas del mes de caja).
      let pesoLimpTotal = 0
      const pesosLimp = new Map<string, number>()
      for (const s of salidas) {
        const w = Number(s.salidas) * (LIMPIEZA_TARIFAS[s.pid] ?? 0)
        if (w > 0) { pesosLimp.set(s.pid, w); pesoLimpTotal += w }
      }
      if (pesoLimpTotal > 0) {
        for (const [pid, peso] of pesosLimp) {
          if (!mGastos.has(pid)) mGastos.set(pid, emptyGastos())
          mGastos.get(pid)!.limpieza += Math.round((peso / pesoLimpTotal) * limpiezaLibre * 100) / 100
        }
      }
    }
  }

  // Ensamblar resultado final
  const pisos: PLPiso[] = props.map(p => {
    const inc = mIncome.get(p.id) ?? { ingresos: 0, reservas: 0 }
    const g   = mGastos.get(p.id) ?? emptyGastos()
    g.total   = Math.round((g.lavanderia + g.limpieza + g.alquiler + g.suministros + g.comunidad + g.otros) * 100) / 100
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
