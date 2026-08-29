import { Prisma } from '@prisma/client'
import { prisma } from './db'
import { eur } from './dinero'
import { sqlGastoDePisos } from './sivra/gasto-de-pisos'

export type ResumenFinanciero = {
  ingresosYtd: number
  gastosYtd: number
  resultadoYtd: number
  disponible: boolean
  nota?: string
  // Importes solo con checkout ya ocurrido (reservas cerradas a día de hoy)
  ingresosHoy?: number
  resultadoHoy?: number
}

const NULO: ResumenFinanciero = { ingresosYtd: 0, gastosYtd: 0, resultadoYtd: 0, disponible: false }

export async function getResumenIalimp(empresaId: string, anio: number): Promise<ResumenFinanciero> {
  try {
    const rows = await prisma.$queryRaw<Array<{
      ingresos_base: unknown; gastos_base: unknown; resultado: unknown
    }>>`
      SELECT
        COALESCE(SUM(ingresos_base), 0)::float AS ingresos_base,
        COALESCE(SUM(gastos_base),   0)::float AS gastos_base,
        COALESCE(SUM(resultado),     0)::float AS resultado
      FROM v_contab_pyg
      WHERE empresa_id = ${empresaId}::uuid
        AND anio = ${anio}
    `
    const r = rows[0]
    return {
      ingresosYtd: Number(r.ingresos_base),
      gastosYtd:   Number(r.gastos_base),
      resultadoYtd: Number(r.resultado),
      disponible: true,
    }
  } catch {
    return { ...NULO, nota: 'error al leer ialimp' }
  }
}

export async function getResumenSivra(anio: number, propertyId?: string | null): Promise<ResumenFinanciero> {
  try {
    const [ing, gas, ingHoy] = await Promise.all([
      propertyId
        ? prisma.$queryRaw<Array<{ total: unknown }>>`
            SELECT COALESCE(SUM(amount), 0)::float AS total
            FROM incomes
            WHERE EXTRACT(YEAR FROM date) = ${anio}
              AND "propertyId" = ${propertyId}
          `
        : prisma.$queryRaw<Array<{ total: unknown }>>`
            SELECT COALESCE(SUM(amount), 0)::float AS total
            FROM incomes
            WHERE EXTRACT(YEAR FROM date) = ${anio}
          `,
      // 🚨 `sqlGastoDePisos()` es obligatorio en las DOS ramas (ver lib/sivra/gasto-de-pisos.ts):
      // sin él esta suma contaba la BANDEJA como gasto confirmado —3,37 M€ en 2026 contra 13.755,66 €
      // reales, por la reserva del edificio de C/ San Luis 9 y un Modelo 200 triplicado— y, sin
      // propertyId, metía además la correduría y lo personal en un total cuyo ingreso sale de
      // `incomes`, que es solo pisos. Lo vigila gasto-de-pisos.test.ts sobre el fuente.
      propertyId
        ? prisma.$queryRaw<Array<{ total: unknown }>>`
            SELECT COALESCE(SUM(total), 0)::float AS total
            FROM gastos
            WHERE EXTRACT(YEAR FROM fecha) = ${anio}
              AND propiedad = ${propertyId}
              AND ${Prisma.raw(sqlGastoDePisos())}
          `
        : prisma.$queryRaw<Array<{ total: unknown }>>`
            SELECT COALESCE(SUM(total), 0)::float AS total
            FROM gastos
            WHERE EXTRACT(YEAR FROM fecha) = ${anio}
              AND ${Prisma.raw(sqlGastoDePisos())}
          `,
      // Solo reservas con checkout ya pasado (cobradas/cerradas a día de hoy)
      propertyId
        ? prisma.$queryRaw<Array<{ total: unknown }>>`
            SELECT COALESCE(SUM(amount), 0)::float AS total
            FROM incomes
            WHERE EXTRACT(YEAR FROM date) = ${anio}
              AND "propertyId" = ${propertyId}
              AND (
                ("checkOut" IS NOT NULL AND "checkOut"::date <= CURRENT_DATE)
                OR ("checkOut" IS NULL AND date::date <= CURRENT_DATE)
              )
          `
        : prisma.$queryRaw<Array<{ total: unknown }>>`
            SELECT COALESCE(SUM(amount), 0)::float AS total
            FROM incomes
            WHERE EXTRACT(YEAR FROM date) = ${anio}
              AND (
                ("checkOut" IS NOT NULL AND "checkOut"::date <= CURRENT_DATE)
                OR ("checkOut" IS NULL AND date::date <= CURRENT_DATE)
              )
          `,
    ])
    const i = Number(ing[0].total)
    const g = Number(gas[0].total)
    const hoy = Number(ingHoy[0].total)
    return {
      ingresosYtd: i,
      gastosYtd: g,
      resultadoYtd: i - g,
      ingresosHoy: hoy,
      resultadoHoy: hoy - g,
      disponible: true,
    }
  } catch {
    return { ...NULO, nota: 'error al leer sivra' }
  }
}

// ia-rest vive en la BD compartida (schema `iarest`) desde el corte de junio 2026, pero
// el resumen se sigue leyendo por el puerto HTTP de ia-rest (`/api/operador/financiero`,
// Bearer `OPERADOR_SHARED_SECRET`) — el MISMO patrón que el listado del god-panel
// (`lib/adapters/iarest.ts`): cada app es dueña de su schema y expone puertos, sin que
// plataforma acople una 2ª conexión ni Prisma sobre `iarest.*`.
export async function getResumenIaRest(localId: string | null, anio: number): Promise<ResumenFinanciero> {
  if (!localId) return { ...NULO, nota: 'sin local vinculado' }
  const base = process.env.IAREST_URL?.replace(/\/$/, '')
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!base || !secret) return { ...NULO, nota: 'ia-rest sin conectar (IAREST_URL + OPERADOR_SHARED_SECRET)' }
  try {
    const res = await fetch(
      `${base}/api/operador/financiero?local_id=${encodeURIComponent(localId)}&anio=${anio}`,
      { headers: { Authorization: `Bearer ${secret}` }, cache: 'no-store' },
    )
    if (!res.ok) return { ...NULO, nota: 'puerto ia-rest no disponible' }
    const r = await res.json() as { ingresos_base?: number; gastos_base?: number; resultado?: number }
    return {
      ingresosYtd:  Number(r.ingresos_base ?? 0),
      gastosYtd:    Number(r.gastos_base ?? 0),
      resultadoYtd: Number(r.resultado ?? 0),
      disponible: true,
    }
  } catch {
    return { ...NULO, nota: 'error al leer ia-rest' }
  }
}

// Registro de proveedores de KPIs por vertical (DataConnector SPI). Añadir una
// vertical nueva = añadir una entrada aquí, sin tocar el dispatcher. Cada proveedor
// sabe de qué BD lee (Prisma compartida, o cliente service-role para BD separada).
type ResumenProvider = (refExt: string | null, anio: number) => Promise<ResumenFinanciero>

const PROVIDERS: Record<string, ResumenProvider> = {
  ialimp: (refExt, anio) => (refExt ? getResumenIalimp(refExt, anio) : Promise.resolve(NULO)),
  sivra: (refExt, anio) => getResumenSivra(anio, refExt),
  'ia-rest': (refExt, anio) => (refExt ? getResumenIaRest(refExt, anio) : Promise.resolve(NULO)),
}

export async function getResumenNegocio(
  app: string | null,
  refExt: string | null,
  anio: number,
): Promise<ResumenFinanciero> {
  const provider = app ? PROVIDERS[app] : undefined
  if (!provider) return NULO
  return provider(refExt, anio)
}

// Financiero introducido a mano para negocios sin app (columnas negocios.ingresos_manual/gastos_manual).
// Disponible solo si hay al menos un valor; el resto del dashboard lo trata como cualquier otro resumen.
export function manualFinanciero(
  ingresos: number | null | undefined,
  gastos: number | null | undefined,
): ResumenFinanciero {
  if (ingresos == null && gastos == null) return NULO
  const i = Number(ingresos ?? 0)
  const g = Number(gastos ?? 0)
  return { ingresosYtd: i, gastosYtd: g, resultadoYtd: i - g, disponible: true }
}

export function fmtEur(n: number): string {
  return eur(n)
}
