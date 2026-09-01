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

import type { ObjetoAsegurado } from '@central/module-seguros'

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
      /** `null` = el puerto todavía no informa vencimientos (asegura sin desplegar
       *  con esta versión). NO es «no vence nada»: la UI lo dice como pendiente. */
      vence30: number | null
      vence60: number | null
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
  // Campos NUEVOS: opcionales a propósito. Si la versión desplegada de asegura
  // todavía no los manda, se propagan como null («no informado») en vez de
  // tumbar la cartera entera a «respuesta ilegible» durante el despliegue.
  const opcional = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  const correduria = (json as Record<string, unknown>).correduria as Record<string, unknown> | undefined
  return {
    vence30: opcional(resumen.vence30),
    vence60: opcional(resumen.vence60),
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
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/resumen`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    })
    const json = await res.json().catch(() => null)
    return interpretarCartera(res.status, json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

// ── Vencimientos ────────────────────────────────────────────────────────────
// Misma disciplina de tres estados que la cartera: una lista vacía con estado
// 'ok' significa «no hay pólizas que venzan en la ventana»; cualquier otra cosa
// es «no se ha podido mirar» y se dice como tal.

export type PolizaVencimiento = {
  id: string
  /**
   * El id del TOMADOR: lo que convierte su nombre en un enlace a su ficha.
   *
   * `null` NO es «no tiene cliente» (imposible: toda póliza tiene tomador). Es
   * que la versión desplegada de asegura todavía no manda el campo, y entonces
   * el nombre se pinta como texto y se dice por qué — nunca como un enlace roto.
   */
  clienteId: string | null
  cliente: string
  tipo: string
  aseguradora: string
  numeroPoliza: string | null
  fechaVencimiento: string
  dias: number
  urgencia: string
  prima: number | null
  fraccionamiento: string | null
  /**
   * Qué asegura la póliza. `null` NO es «no asegura nada» ni «no se sabe»: es
   * «esta versión desplegada de asegura todavía no manda el campo». Se separa
   * a propósito del `estado: 'no_informado'` que sí viene del puerto, porque se
   * arreglan en sitios distintos (desplegar vs. reclamar el dato a la compañía).
   */
  objeto: ObjetoAsegurado | null
}

const ESTADOS_OBJETO = new Set(['conocido', 'no_informado', 'cifrado', 'sin_objeto'])

/** Lectura defensiva del objeto asegurado. Una forma rara NO tumba la fila
 *  entera: degrada a `null` («el puerto no lo informa»), que la UI ya sabe decir. */
export function interpretarObjeto(v: unknown): ObjetoAsegurado | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.estado !== 'string' || !ESTADOS_OBJETO.has(o.estado)) return null
  const cadena = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null)
  return {
    estado: o.estado as ObjetoAsegurado['estado'],
    titulo: cadena(o.titulo),
    detalle: cadena(o.detalle),
    nota: cadena(o.nota),
  }
}

export type VencimientosAsegura =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: MotivoErrorCartera }
  | { estado: 'ok'; dias: number; polizas: PolizaVencimiento[] }

/** Interpretación PURA de la respuesta del puerto de vencimientos.
 *  Una fila con forma inesperada invalida la lista entera: media lista de
 *  renovaciones es peor que ninguna, porque nadie sabría cuál falta. */
export function interpretarVencimientos(status: number, json: unknown): VencimientosAsegura {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const r = json as Record<string, unknown>
  if (r.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (r.estado === 'error') return { estado: 'error', motivo: 'asegura_error' }
  if (r.estado !== 'ok' || !Array.isArray(r.polizas)) return { estado: 'error', motivo: 'respuesta_ilegible' }
  const polizas: PolizaVencimiento[] = []
  for (const fila of r.polizas) {
    if (typeof fila !== 'object' || fila === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const f = fila as Record<string, unknown>
    const textos = ['id', 'cliente', 'tipo', 'aseguradora', 'fechaVencimiento', 'urgencia'] as const
    if (textos.some(k => typeof f[k] !== 'string')) return { estado: 'error', motivo: 'respuesta_ilegible' }
    if (typeof f.dias !== 'number' || !Number.isFinite(f.dias)) {
      return { estado: 'error', motivo: 'respuesta_ilegible' }
    }
    polizas.push({
      id: f.id as string,
      clienteId: typeof f.clienteId === 'string' && f.clienteId !== '' ? f.clienteId : null,
      cliente: f.cliente as string,
      tipo: f.tipo as string,
      aseguradora: f.aseguradora as string,
      numeroPoliza: typeof f.numeroPoliza === 'string' ? f.numeroPoliza : null,
      fechaVencimiento: f.fechaVencimiento as string,
      dias: f.dias,
      urgencia: f.urgencia as string,
      // La prima ausente es null («la compañía no la informa»), nunca 0.
      prima: typeof f.prima === 'number' && Number.isFinite(f.prima) ? f.prima : null,
      fraccionamiento: typeof f.fraccionamiento === 'string' ? f.fraccionamiento : null,
      objeto: interpretarObjeto(f.objeto),
    })
  }
  const dias = typeof r.dias === 'number' && Number.isFinite(r.dias) ? r.dias : 90
  return { estado: 'ok', dias, polizas }
}

export async function vencimientosAsegura(dias = 90): Promise<VencimientosAsegura> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/vencimientos?dias=${dias}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    })
    const json = await res.json().catch(() => null)
    return interpretarVencimientos(res.status, json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}
