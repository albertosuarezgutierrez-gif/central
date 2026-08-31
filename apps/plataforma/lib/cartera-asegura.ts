// Cartera de la correduría en vivo, vía el puerto HTTP de central-asegura
// (patrón puerto operador, como plataforma↔rrhh). Read-only.
//
// Tres estados, nunca dos: `sin_configurar` significa «el puerto no está
// conectado todavía» — NO que la correduría no tenga cartera. Un fallo de red
// o de secreto es `error` visible, jamás un resumen a ceros.
//
// El `error` lleva MOTIVO: un 401 (los secretos no coinciden), un
// `estado:'error'` de asegura (su BD no responde) y un timeout de red se
// arreglan en sitios distintos — un recuadro que solo dice «sin respuesta»
// obliga a adivinar cuál de los tres es (pasó el 31/08/2026).

export type MotivoErrorCartera =
  | 'secreto_rechazado'   // asegura devolvió 401/403: los dos ASEGURA_OPERADOR_SECRET no coinciden
  | 'asegura_error'       // asegura respondió pero no pudo leer su BD (estado:'error')
  | 'respuesta_ilegible'  // status o cuerpo inesperados (HTML, JSON malformado…)
  | 'red'                 // el fetch no llegó: timeout, DNS, TLS…

export type CarteraAsegura =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: MotivoErrorCartera }
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
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const r = (json as Record<string, unknown>).resumen
  if (typeof r !== 'object' || r === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
  const resumen = r as Record<string, unknown>
  if (resumen.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (resumen.estado === 'error') return { estado: 'error', motivo: 'asegura_error' }
  if (resumen.estado !== 'ok') return { estado: 'error', motivo: 'respuesta_ilegible' }
  for (const k of CAMPOS_NUM) {
    if (typeof resumen[k] !== 'number' || !Number.isFinite(resumen[k] as number)) {
      return { estado: 'error', motivo: 'respuesta_ilegible' }
    }
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
    return { estado: 'error', motivo: 'red' }
  }
}
