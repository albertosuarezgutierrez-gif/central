// Comisiones de la correduría en vivo, por el puerto HTTP de central-asegura
// (patrón puerto operador, igual que `lib/cartera-asegura.ts`). Read-only.
//
// 🚨 Plataforma NO tiene `ASEGURA_DATABASE_URL`: esa env vive solo en
// `apps/asegura`. Todo el dato de la cartera entra por aquí.
//
// Tres estados, nunca dos: `sin_configurar` significa «el puerto no está
// conectado todavía» — NO que no haya comisiones. Un fallo lleva MOTIVO, porque
// un 401 (secretos que no coinciden), un error de la BD de asegura y un timeout
// se arreglan en sitios distintos.

export type MotivoErrorComisiones =
  | 'secreto_rechazado'   // 401/403: los dos ASEGURA_OPERADOR_SECRET no coinciden
  | 'asegura_error'       // asegura respondió pero no pudo leer su BD
  | 'respuesta_ilegible'  // status o cuerpo inesperados (HTML, JSON malformado…)
  | 'red'                 // el fetch no llegó: timeout, DNS, TLS…

export type PeriodoComisiones = {
  companiaCodigo: string
  periodoInicio: string
  periodoFin: string
  liqBruto: number | null
  liqRetencion: number | null
  liqRemesa: number | null
  liqHash: string | null
  pagado: number | null
}

export type DevengoCompania = {
  companiaCodigo: string
  mes: string
  bruto: number
  recibos: number
}

export type CoberturaCompania = {
  companiaCodigo: string
  recibos: number
  liquidaciones: number
  primerRecibo: string | null
  ultimoRecibo: string | null
}

export type ComisionesAsegura =
  | { estado: 'sin_configurar' }
  /**
   * `causa` es la categoría que manda asegura sobre su propio fallo
   * (`credenciales` · `permisos` · `conexion` · `esquema` · `sin_correduria` ·
   * `otro`, del mismo clasificador que el resto del puerto). Sin ella,
   * `asegura_error` es un callejón sin salida: dice que falló, no dónde — y la
   * causa REAL del 02/09/2026 fue `credenciales`, que solo se veía en los logs
   * del pooler. Es opcional a propósito: una versión desplegada más vieja de
   * asegura no la manda, y entonces se dice que no se sabe, no se inventa.
   */
  | { estado: 'error'; motivo: MotivoErrorComisiones; causa?: string }
  | {
      estado: 'ok'
      periodos: PeriodoComisiones[]
      devengos: DevengoCompania[]
      cobertura: CoberturaCompania[]
    }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/**
 * Interpretación PURA de la respuesta del puerto (testeable sin red).
 *
 * Cualquier forma inesperada degrada a `error`, NUNCA a unas comisiones
 * inventadas ni a listas vacías: una lista vacía con estado `ok` significa «la
 * cartera no tiene comisiones en la ventana», que es una afirmación distinta.
 */
export function interpretarComisiones(status: number, json: unknown): ComisionesAsegura {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const c = (json as Record<string, unknown>).comisiones
  if (typeof c !== 'object' || c === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
  const com = c as Record<string, unknown>
  if (com.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (com.estado === 'error') {
    // `asegura_error` sigue significando «respondió y no pudo leer su BD»; la
    // `causa` dice cuál de sus fallos fue. Solo se copia si es texto: es
    // contenido de otra app y acaba en un Telegram.
    const causa = typeof com.causa === 'string' && com.causa ? com.causa.slice(0, 40) : null
    return { estado: 'error', motivo: 'asegura_error', ...(causa ? { causa } : {}) }
  }
  if (com.estado !== 'ok') return { estado: 'error', motivo: 'respuesta_ilegible' }
  if (!Array.isArray(com.periodos) || !Array.isArray(com.devengos) || !Array.isArray(com.cobertura)) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }

  return {
    estado: 'ok',
    periodos: (com.periodos as Record<string, unknown>[])
      .map(p => ({
        companiaCodigo: str(p.companiaCodigo) ?? '',
        periodoInicio: str(p.periodoInicio) ?? '',
        periodoFin: str(p.periodoFin) ?? '',
        liqBruto: num(p.liqBruto),
        liqRetencion: num(p.liqRetencion),
        liqRemesa: num(p.liqRemesa),
        liqHash: str(p.liqHash),
        pagado: num(p.pagado),
      }))
      .filter(p => p.companiaCodigo && p.periodoInicio && p.periodoFin),
    devengos: (com.devengos as Record<string, unknown>[])
      .map(d => ({
        companiaCodigo: str(d.companiaCodigo) ?? '',
        mes: str(d.mes) ?? '',
        bruto: num(d.bruto) ?? 0,
        recibos: num(d.recibos) ?? 0,
      }))
      .filter(d => d.companiaCodigo && /^\d{4}-\d{2}$/.test(d.mes)),
    cobertura: (com.cobertura as Record<string, unknown>[])
      .map(k => ({
        companiaCodigo: str(k.companiaCodigo) ?? '',
        recibos: num(k.recibos) ?? 0,
        liquidaciones: num(k.liquidaciones) ?? 0,
        primerRecibo: str(k.primerRecibo),
        ultimoRecibo: str(k.ultimoRecibo),
      }))
      .filter(k => k.companiaCodigo),
  }
}

/** Lee las comisiones por el puerto de central-asegura. La URL no es un secreto
 *  y cae al dominio del proyecto; el secreto NUNCA tiene fallback. */
export async function comisionesAsegura(desde: string): Promise<ComisionesAsegura> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  try {
    const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
    const res = await fetch(`${base}/api/operador/comisiones?desde=${encodeURIComponent(desde)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    const json = await res.json().catch(() => null)
    return interpretarComisiones(res.status, json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

/**
 * Código DGS → nombre legible.
 *
 * 🚨 La CLAVE es el código, no el nombre: el nombre comercial cambia (Catalana
 * Occidente → Occident) y el código de la DGS no. Y ojo con el formato: son
 * `C0058`/`C0109`, no los `0131`/`0507` numéricos que asumía el `lib/cima.ts`
 * retirado — ese mapa estaba sencillamente mal.
 */
export const NOMBRE_POR_CODIGO_DGS: Record<string, string> = {
  C0058: 'Mapfre',
  C0109: 'Allianz',
  C0468: 'Occident',
  C0613: 'Reale',
  C0072: 'Generali',
}

/** Nombre legible, o el propio código si no está en el mapa. Devolver el código
 *  crudo es correcto: inventar un nombre sería peor que no saberlo. */
export function nombreCompania(codigo: string): string {
  return NOMBRE_POR_CODIGO_DGS[codigo] ?? codigo
}
