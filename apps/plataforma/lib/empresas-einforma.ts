// Adapter del proveedor de enriquecimiento eInforma (Informa D&B). Aislado tras una interfaz para poder
// cambiar de proveedor sin tocar el resto. La parte de RED usa OAuth2 client_credentials; la parte de
// MAPEO (JSON -> DatosFinancieros) es PURA y testeable.
//
// ⏳ PENDIENTE de la API key de Alberto: sin `EINFORMA_CLIENT_ID`/`EINFORMA_CLIENT_SECRET` esto lanza
//    `EinformaNoConfigurado` y el resto del sistema degrada sin romper.
//
// ⚠️ Las RUTAS y los CAMPOS EXACTOS del payload (marcados abajo) hay que CONFIRMARLOS contra la
//    documentación / entorno de pruebas de eInforma al activar la key. Están centralizados en RUTAS y en
//    `mapearFinanciero` para que confirmarlos sea una edición de dos sitios, no una reescritura.

// Lo que guardamos por empresa tras enriquecer (subconjunto de columnas de empresas_enriquecimiento).
export interface DatosFinancieros {
  cif: string | null
  razonSocial: string | null
  cnae: string | null
  facturacion: number | null
  nEmpleados: number | null
  patrimonioNeto: number | null
  ebitdaN: number | null
  ebitdaN1: number | null
  fondoManiobra: number | null
  ultimoDeposito: string | null // 'YYYY-MM-DD'
  incidenciasPago: boolean | null
  incidenciasDetalle: string | null
  deudaFinanciera: number | null
  deudaEbitda: number | null
  refinanciaciones: number | null
}

export class EinformaNoConfigurado extends Error {
  constructor() {
    super('eInforma no configurado: faltan EINFORMA_CLIENT_ID / EINFORMA_CLIENT_SECRET')
    this.name = 'EinformaNoConfigurado'
  }
}

const BASE = process.env.EINFORMA_BASE_URL || 'https://api.einforma.com'

// ⚠️ CONFIRMAR con la doc/sandbox de eInforma al activar la key.
const RUTAS = {
  token: '/api/v1/oauth/token',
  // El informe financiero / cuentas anuales de una empresa por su CIF.
  informeFinanciero: (cif: string) => `/api/v1/companies/${encodeURIComponent(cif)}/report`,
}
const SCOPE = 'buscar:consultar:empresas'

export function einformaConfigurado(): boolean {
  return Boolean(process.env.EINFORMA_CLIENT_ID && process.env.EINFORMA_CLIENT_SECRET)
}

/** Pide un access_token por client_credentials (Basic auth con client_id:client_secret). */
async function obtenerToken(): Promise<string> {
  const id = process.env.EINFORMA_CLIENT_ID
  const secret = process.env.EINFORMA_CLIENT_SECRET
  if (!id || !secret) throw new EinformaNoConfigurado()
  const basic = Buffer.from(`${id}:${secret}`).toString('base64')
  const res = await fetch(`${BASE}${RUTAS.token}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(SCOPE)}`,
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`eInforma token ${res.status}: ${await res.text().catch(() => '')}`)
  const j = (await res.json()) as { access_token?: string }
  if (!j.access_token) throw new Error('eInforma: respuesta de token sin access_token')
  return j.access_token
}

// ---- MAPEO PURO (JSON del proveedor -> DatosFinancieros). Testeable sin red. ----

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
/** Lee una ruta 'a.b.c' de un objeto sin lanzar. */
function ruta(obj: unknown, camino: string): unknown {
  return camino.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)
}

/**
 * Extrae los datos financieros del payload del informe. Los caminos de campo (`ruta(...)`) son la
 * ⚠️ PARTE A CONFIRMAR con el payload real de eInforma; están todos aquí para ajustarlos de una vez.
 */
export function mapearFinanciero(payload: unknown): DatosFinancieros {
  const p = (payload ?? {}) as Record<string, unknown>
  return {
    cif: (ruta(p, 'identificativo.cif') as string) ?? (ruta(p, 'cif') as string) ?? null,
    razonSocial: (ruta(p, 'identificativo.denominacion') as string) ?? (ruta(p, 'razonSocial') as string) ?? null,
    cnae: (ruta(p, 'actividad.cnae') as string) ?? (ruta(p, 'cnae') as string) ?? null,
    facturacion: num(ruta(p, 'balance.cifraVentas') ?? ruta(p, 'facturacion')),
    nEmpleados: num(ruta(p, 'empleados') ?? ruta(p, 'balance.empleados')),
    patrimonioNeto: num(ruta(p, 'balance.patrimonioNeto') ?? ruta(p, 'patrimonioNeto')),
    ebitdaN: num(ruta(p, 'balance.ebitda') ?? ruta(p, 'ebitda')),
    ebitdaN1: num(ruta(p, 'balanceAnterior.ebitda') ?? ruta(p, 'ebitdaAnterior')),
    fondoManiobra: num(ruta(p, 'balance.fondoManiobra') ?? ruta(p, 'fondoManiobra')),
    ultimoDeposito: (ruta(p, 'cuentas.ultimoDeposito') as string) ?? (ruta(p, 'ultimoDeposito') as string) ?? null,
    incidenciasPago: incidencias(p),
    incidenciasDetalle: (ruta(p, 'incidencias.detalle') as string) ?? null,
    deudaFinanciera: num(ruta(p, 'balance.deudaFinanciera') ?? ruta(p, 'deudaFinanciera')),
    deudaEbitda: num(ruta(p, 'ratios.deudaEbitda') ?? ruta(p, 'deudaEbitda')),
    refinanciaciones: num(ruta(p, 'incidencias.refinanciaciones')),
  }
}

function incidencias(p: Record<string, unknown>): boolean | null {
  const v = ruta(p, 'incidencias.rai') ?? ruta(p, 'incidencias.asnef') ?? ruta(p, 'incidenciasPago')
  if (v == null) return null
  if (typeof v === 'boolean') return v
  const n = num(v)
  return n == null ? Boolean(v) : n > 0
}

/** Enriquece una empresa por su CIF contra eInforma. Lanza EinformaNoConfigurado si falta la key. */
export async function enriquecerEinforma(cif: string): Promise<DatosFinancieros> {
  const token = await obtenerToken()
  const res = await fetch(`${BASE}${RUTAS.informeFinanciero(cif)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`eInforma informe ${res.status}: ${await res.text().catch(() => '')}`)
  return mapearFinanciero(await res.json())
}
