// "Mis propiedades" del panel de operador: los apartamentos turísticos propios de
// Alberto (sivra). Lee SOLO la tabla `properties` (las 5 propias con Smoobu) + sus
// `incomes`/`gastos` en la BD compartida — NO la tabla `propiedades` (multi-tenant
// de limpiadoras). Mismo patrón seguro que lib/adapters/sivra.ts.

import { prisma } from './db'

export interface Reserva { huesped: string | null; entrada: string | null; salida: string | null; portal: string | null }
export interface Propiedad {
  id: string
  nombre: string
  ubicacion: string
  dormitorios: number | null
  camas: number | null
  banos: number | null
  maxHuespedes: number | null
  ingresosMes: number
  gastosMes: number
  resultadoMes: number
  ingresosAnio: number
  noches: number
  ocupacion: number
  adr: number
  topPortal: string | null
  proxima: Reserva | null
}

export interface PropiedadDetalle {
  id: string
  nombre: string
  ubicacion: string
  dormitorios: number | null
  camas: number | null
  banos: number | null
  maxHuespedes: number | null
  ingresosMes: number
  gastosMes: number
  resultadoMes: number
  noches: number
  ocupacion: number
  adr: number
  ingresosAnio: number
  gastosAnio: number
  resultadoAnio: number
  ingresosMesAA: number
  nochesMesAA: number
  portales: Array<{ portal: string; reservas: number; noches: number; ingresos: number; pct: number }>
  mensual: Array<{ mes: string; ingresos: number; noches: number; reservas: number }>
  gastosCat: Array<{ categoria: string; total: number; n: number }>
  gastosCatCompartidos: Array<{ categoria: string; total: number; n: number }>
  proximas: Array<{ huesped: string | null; entrada: string; salida: string; noches: number; importe: number; portal: string | null }>
  ultimas: Array<{ huesped: string | null; entrada: string; salida: string; noches: number; importe: number; bruto: number | null; portal: string | null }>
}

/**
 * Token de acceso mágico del propietario en ialimp (columna `clientes.access_token`),
 * buscado por el email del operador. Con él se entra al portal SIN login
 * (`/propietario/<token>`). Devuelve null si no hay cliente con ese email.
 */
export async function getPropietarioAccessToken(email: string): Promise<string | null> {
  if (!email) return null
  try {
    const rows = await prisma.$queryRaw<Array<{ access_token: string | null }>>`
      SELECT access_token FROM clientes
      WHERE lower(login_email) = lower(${email}) AND access_token IS NOT NULL AND notif_activa = true
      LIMIT 1
    `
    return rows[0]?.access_token ?? null
  } catch {
    return null
  }
}

export async function getPropiedades(): Promise<Propiedad[]> {
  const [props, incMes, incAnio, gasMes, proximas, ocupData] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; name: string; location: string; bedrooms: number | null; beds: number | null; bathrooms: number | null; maxGuests: number | null }>>`
      SELECT id, name, location, bedrooms, beds, bathrooms, "maxGuests" FROM properties ORDER BY name
    `,
    prisma.$queryRaw<Array<{ pid: string; t: number }>>`
      SELECT "propertyId" AS pid, COALESCE(SUM(amount),0)::float AS t
      FROM incomes WHERE date >= date_trunc('month', CURRENT_DATE) GROUP BY "propertyId"
    `,
    prisma.$queryRaw<Array<{ pid: string; t: number }>>`
      SELECT "propertyId" AS pid, COALESCE(SUM(amount),0)::float AS t
      FROM incomes WHERE date >= date_trunc('year', CURRENT_DATE) GROUP BY "propertyId"
    `,
    prisma.$queryRaw<Array<{ pid: string; t: number }>>`
      SELECT propiedad AS pid, COALESCE(SUM(total),0)::float AS t
      FROM gastos WHERE EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE) GROUP BY propiedad
    `,
    prisma.$queryRaw<Array<{ pid: string; guestName: string | null; checkIn: Date | null; checkOut: Date | null; portal: string | null }>>`
      SELECT DISTINCT ON ("propertyId") "propertyId" AS pid, "guestName", "checkIn", "checkOut", portal::text AS portal
      FROM incomes
      WHERE "checkOut" >= CURRENT_DATE
      ORDER BY "propertyId", "checkIn" ASC
    `,
    prisma.$queryRaw<Array<{ pid: string; noches: number; adr: number; top_portal: string | null }>>`
      SELECT "propertyId" AS pid,
        COALESCE(SUM(nights),0)::int AS noches,
        COALESCE(SUM(amount)/NULLIF(SUM(nights),0),0)::float AS adr,
        (MODE() WITHIN GROUP (ORDER BY portal::text)) AS top_portal
      FROM incomes
      WHERE date >= date_trunc('month', CURRENT_DATE)
      GROUP BY "propertyId"
    `,
  ])

  const mMes = new Map(incMes.map(r => [r.pid, Number(r.t)]))
  const mAnio = new Map(incAnio.map(r => [r.pid, Number(r.t)]))
  const mGas = new Map(gasMes.map(r => [r.pid, Number(r.t)]))
  const mProx = new Map(proximas.map(r => [r.pid, r]))
  const mOcup = new Map(ocupData.map(r => [r.pid, r]))
  const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null)

  // días del mes en curso
  const hoy = new Date()
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()

  return props.map(p => {
    const ingresosMes = mMes.get(p.id) ?? 0
    const gastosMes = mGas.get(p.id) ?? 0
    const o = mOcup.get(p.id)
    const noches = o?.noches ?? 0
    const pr = mProx.get(p.id)
    return {
      id: p.id,
      nombre: p.name,
      ubicacion: p.location,
      dormitorios: p.bedrooms,
      camas: p.beds,
      banos: p.bathrooms,
      maxHuespedes: p.maxGuests,
      ingresosMes,
      gastosMes,
      resultadoMes: ingresosMes - gastosMes,
      ingresosAnio: mAnio.get(p.id) ?? 0,
      noches,
      ocupacion: diasMes > 0 ? Math.round((noches / diasMes) * 100) : 0,
      adr: o?.adr ?? 0,
      topPortal: o?.top_portal ?? null,
      proxima: pr ? { huesped: pr.guestName, entrada: iso(pr.checkIn), salida: iso(pr.checkOut), portal: pr.portal } : null,
    }
  })
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '')

export async function getApartamentoDetalle(id: string): Promise<PropiedadDetalle | null> {
  const [
    propRow, kpiMes, kpiAnio, kpiAA,
    portales, mensual, gastosCat, gastosCatComp,
    proximas, ultimas,
  ] = await Promise.all([
    // Propiedad
    prisma.$queryRaw<Array<{ id: string; name: string; location: string; bedrooms: number | null; beds: number | null; bathrooms: number | null; maxGuests: number | null }>>`
      SELECT id, name, location, bedrooms, beds, bathrooms, "maxGuests" FROM properties WHERE id = ${id} LIMIT 1
    `,
    // KPIs mes actual (ingresos + noches)
    prisma.$queryRaw<Array<{ ingresos: number; noches: number }>>`
      SELECT COALESCE(SUM(amount),0)::float AS ingresos, COALESCE(SUM(nights),0)::int AS noches
      FROM incomes WHERE "propertyId" = ${id} AND date >= date_trunc('month', CURRENT_DATE)
    `,
    // KPIs año (ingresos + gastos)
    prisma.$queryRaw<Array<{ ingresos: number; gastos: number }>>`
      SELECT
        COALESCE((SELECT SUM(amount) FROM incomes WHERE "propertyId" = ${id} AND date >= date_trunc('year', CURRENT_DATE)),0)::float AS ingresos,
        COALESCE((SELECT SUM(total) FROM gastos WHERE propiedad = ${id} AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE)),0)::float AS gastos
    `,
    // Mismo mes año anterior
    prisma.$queryRaw<Array<{ ingresos: number; noches: number }>>`
      SELECT COALESCE(SUM(amount),0)::float AS ingresos, COALESCE(SUM(nights),0)::int AS noches
      FROM incomes
      WHERE "propertyId" = ${id}
        AND date >= date_trunc('month', CURRENT_DATE - interval '1 year')
        AND date <  date_trunc('month', CURRENT_DATE - interval '11 months')
    `,
    // Mix de portales (año actual)
    prisma.$queryRaw<Array<{ portal: string; reservas: number; noches: number; ingresos: number }>>`
      SELECT portal::text AS portal, COUNT(*)::int AS reservas, COALESCE(SUM(nights),0)::int AS noches, COALESCE(SUM(amount),0)::float AS ingresos
      FROM incomes
      WHERE "propertyId" = ${id} AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)
      GROUP BY portal ORDER BY ingresos DESC
    `,
    // Histórico mensual (12 meses)
    prisma.$queryRaw<Array<{ mes: string; ingresos: number; noches: number; reservas: number }>>`
      SELECT
        to_char(date_trunc('month', date), 'YYYY-MM') AS mes,
        COALESCE(SUM(amount),0)::float AS ingresos,
        COALESCE(SUM(nights),0)::int AS noches,
        COUNT(DISTINCT "reservationId")::int AS reservas
      FROM incomes
      WHERE "propertyId" = ${id} AND date >= date_trunc('month', CURRENT_DATE) - interval '11 months'
      GROUP BY 1 ORDER BY 1
    `,
    // Gastos por categoría (gastos del año de este piso)
    prisma.$queryRaw<Array<{ categoria: string; total: number; n: number }>>`
      SELECT COALESCE(categoria,'Sin categoría') AS categoria, COALESCE(SUM(total),0)::float AS total, COUNT(*)::int AS n
      FROM gastos
      WHERE propiedad = ${id} AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
      GROUP BY categoria ORDER BY total DESC
    `,
    // Gastos compartidos (prop_multi_apartamentos + prop_personal) — para referencia
    prisma.$queryRaw<Array<{ categoria: string; total: number; n: number }>>`
      SELECT COALESCE(categoria,'Sin categoría') AS categoria, COALESCE(SUM(total),0)::float AS total, COUNT(*)::int AS n
      FROM gastos
      WHERE propiedad IN ('prop_multi_apartamentos','prop_personal')
        AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
      GROUP BY categoria ORDER BY total DESC
    `,
    // Próximas reservas
    prisma.$queryRaw<Array<{ guestName: string | null; checkIn: Date; checkOut: Date; nights: number; amount: number; portal: string | null }>>`
      SELECT "guestName", "checkIn", "checkOut", nights::int, amount::float, portal::text AS portal
      FROM incomes WHERE "propertyId" = ${id} AND "checkOut" >= CURRENT_DATE
      ORDER BY "checkIn" ASC LIMIT 10
    `,
    // Últimas reservas
    prisma.$queryRaw<Array<{ guestName: string | null; checkIn: Date; checkOut: Date; nights: number; amount: number; amount_gross: number | null; portal: string | null }>>`
      SELECT "guestName", "checkIn", "checkOut", nights::int, amount::float, "amount_gross"::float, portal::text AS portal
      FROM incomes WHERE "propertyId" = ${id} AND "checkOut" < CURRENT_DATE
      ORDER BY "checkOut" DESC LIMIT 20
    `,
  ])

  const p = propRow[0]
  if (!p) return null

  const hoy = new Date()
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const ingresosMes = Number(kpiMes[0]?.ingresos ?? 0)
  const noches = Number(kpiMes[0]?.noches ?? 0)
  const gastosYTD = Number(kpiAnio[0]?.gastos ?? 0)
  const ingresos = Number(kpiAnio[0]?.ingresos ?? 0)

  // gastos del mes actual (del año YTD no tenemos mes, calculamos proporción)
  // Para gastos mes usamos gastos de este mes desde la tabla gastos
  const gasMesRow = await prisma.$queryRaw<Array<{ t: number }>>`
    SELECT COALESCE(SUM(total),0)::float AS t FROM gastos
    WHERE propiedad = ${id} AND fecha >= date_trunc('month', CURRENT_DATE)
  `
  const gastosMes = Number(gasMesRow[0]?.t ?? 0)

  const totalIngresoPortales = portales.reduce((s, r) => s + Number(r.ingresos), 0)

  return {
    id: p.id,
    nombre: p.name,
    ubicacion: p.location,
    dormitorios: p.bedrooms,
    camas: p.beds,
    banos: p.bathrooms,
    maxHuespedes: p.maxGuests,
    ingresosMes,
    gastosMes,
    resultadoMes: ingresosMes - gastosMes,
    noches,
    ocupacion: diasMes > 0 ? Math.round((noches / diasMes) * 100) : 0,
    adr: noches > 0 ? Math.round(ingresosMes / noches) : 0,
    ingresosAnio: ingresos,
    gastosAnio: gastosYTD,
    resultadoAnio: ingresos - gastosYTD,
    ingresosMesAA: Number(kpiAA[0]?.ingresos ?? 0),
    nochesMesAA: Number(kpiAA[0]?.noches ?? 0),
    portales: portales.map(r => ({
      portal: String(r.portal),
      reservas: Number(r.reservas),
      noches: Number(r.noches),
      ingresos: Number(r.ingresos),
      pct: totalIngresoPortales > 0 ? Math.round((Number(r.ingresos) / totalIngresoPortales) * 100) : 0,
    })),
    mensual: mensual.map(r => ({
      mes: String(r.mes),
      ingresos: Number(r.ingresos),
      noches: Number(r.noches),
      reservas: Number(r.reservas),
    })),
    gastosCat: gastosCat.map(r => ({ categoria: String(r.categoria), total: Number(r.total), n: Number(r.n) })),
    gastosCatCompartidos: gastosCatComp.map(r => ({ categoria: String(r.categoria), total: Number(r.total), n: Number(r.n) })),
    proximas: proximas.map(r => ({
      huesped: r.guestName,
      entrada: iso(r.checkIn as Date),
      salida: iso(r.checkOut as Date),
      noches: Number(r.nights),
      importe: Number(r.amount),
      portal: r.portal,
    })),
    ultimas: ultimas.map(r => ({
      huesped: r.guestName,
      entrada: iso(r.checkIn as Date),
      salida: iso(r.checkOut as Date),
      noches: Number(r.nights),
      importe: Number(r.amount),
      bruto: r.amount_gross ? Number(r.amount_gross) : null,
      portal: r.portal,
    })),
  }
}
