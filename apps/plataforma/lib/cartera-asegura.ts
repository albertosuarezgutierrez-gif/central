// Cartera de la correduría en vivo, vía el puerto HTTP de central-asegura
// (patrón puerto operador, como plataforma↔rrhh). Read-only.
//
// Tres estados, nunca dos: `sin_configurar` significa «el puerto no está
// conectado todavía» — NO que la correduría no tenga cartera. Un fallo de red
// o de secreto es `error` visible, jamás un resumen a ceros.

export type CarteraAsegura =
  | { estado: 'sin_configurar' }
  | { estado: 'error' }
  | {
      estado: 'ok'
      nombre: string | null
      clientes: number
      leads: number
      polizasVigentes: number
      polizasPendientesFecha: number
      polizasNoVigentes: number
      siniestrosAbiertos: number
    }

const CAMPOS_NUM = [
  'clientes', 'leads', 'polizasVigentes', 'polizasPendientesFecha', 'polizasNoVigentes', 'siniestrosAbiertos',
] as const

/** Interpretación PURA de la respuesta del puerto (testeable sin red).
 *  Cualquier forma inesperada degrada a `error`, nunca a un resumen inventado. */
export function interpretarCartera(status: number, json: unknown): CarteraAsegura {
  if (status !== 200 || typeof json !== 'object' || json === null) return { estado: 'error' }
  const r = (json as Record<string, unknown>).resumen
  if (typeof r !== 'object' || r === null) return { estado: 'error' }
  const resumen = r as Record<string, unknown>
  if (resumen.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (resumen.estado !== 'ok') return { estado: 'error' }
  for (const k of CAMPOS_NUM) {
    if (typeof resumen[k] !== 'number' || !Number.isFinite(resumen[k] as number)) return { estado: 'error' }
  }
  const correduria = (json as Record<string, unknown>).correduria as Record<string, unknown> | undefined
  return {
    estado: 'ok',
    nombre: typeof correduria?.nombre === 'string' ? correduria.nombre : null,
    clientes: resumen.clientes as number,
    leads: resumen.leads as number,
    polizasVigentes: resumen.polizasVigentes as number,
    polizasPendientesFecha: resumen.polizasPendientesFecha as number,
    polizasNoVigentes: resumen.polizasNoVigentes as number,
    siniestrosAbiertos: resumen.siniestrosAbiertos as number,
  }
}

/** Lee la cartera por el puerto de central-asegura. La URL no es un secreto y
 *  cae al dominio del proyecto; el secreto NUNCA tiene fallback. */
export async function carteraAsegura(): Promise<CarteraAsegura> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  const url = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
  try {
    const res = await fetch(`${url}/api/operador/resumen`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    })
    const json = await res.json().catch(() => null)
    return interpretarCartera(res.status, json)
  } catch {
    return { estado: 'error' }
  }
}
