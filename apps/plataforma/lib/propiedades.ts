// "Mis propiedades" del panel de operador: los apartamentos turísticos propios de
// Alberto (sivra). Lee SOLO la tabla `properties` (las 5 propias con Smoobu) + sus
// `incomes`/`expenses` en la BD compartida — NO la tabla `propiedades` (multi-tenant
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
  proxima: Reserva | null
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
  const [props, incMes, incAnio, gasMes, proximas] = await Promise.all([
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
      SELECT "propertyId" AS pid, COALESCE(SUM(amount),0)::float AS t
      FROM expenses WHERE date >= date_trunc('month', CURRENT_DATE) GROUP BY "propertyId"
    `,
    prisma.$queryRaw<Array<{ pid: string; guestName: string | null; checkIn: Date | null; checkOut: Date | null; portal: string | null }>>`
      SELECT DISTINCT ON ("propertyId") "propertyId" AS pid, "guestName", "checkIn", "checkOut", portal::text AS portal
      FROM incomes
      WHERE "checkOut" >= CURRENT_DATE
      ORDER BY "propertyId", "checkIn" ASC
    `,
  ])

  const mMes = new Map(incMes.map(r => [r.pid, Number(r.t)]))
  const mAnio = new Map(incAnio.map(r => [r.pid, Number(r.t)]))
  const mGas = new Map(gasMes.map(r => [r.pid, Number(r.t)]))
  const mProx = new Map(proximas.map(r => [r.pid, r]))
  const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null)

  return props.map(p => {
    const ingresosMes = mMes.get(p.id) ?? 0
    const gastosMes = mGas.get(p.id) ?? 0
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
      proxima: pr ? { huesped: pr.guestName, entrada: iso(pr.checkIn), salida: iso(pr.checkOut), portal: pr.portal } : null,
    }
  })
}
