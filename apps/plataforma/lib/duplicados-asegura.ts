// Pólizas DUPLICADAS en la cartera viva de la correduría, desde la pantalla de
// Alberto: dos filas vivas con el mismo número en la misma compañía.
//
// Es el guardián de la conciliación Codeoscopic↔CIMA (docs/CORREDURIA-CRM-VISION.md
// §5): cuando emitamos por Codeoscopic y CIMA traiga la misma póliza sin
// casarla, aquí se ve antes de que la ficha pinte dos pólizas y el cliente
// cobre dos avisos. La agrupación la hace asegura (`polizasDuplicadas()` de
// `@central/module-seguros`) y la sirve por `GET /api/operador/duplicados`;
// esta app solo la lee y la pinta.
//
// Dos partes, como en `relaciones-asegura.ts`:
//   1. Lo PURO: `interpretarDuplicados` (test en
//      `test/regression-duplicados-asegura.test.ts`); lo importa el client
//      component `Duplicadas.tsx` (sin red ni env).
//   2. La RED: `duplicadosAsegura()`, solo desde la ruta API de plataforma.
//
// Regla de siempre: `grupos` solo existe en `ok`. Un `sin_configurar` o un
// `error` NUNCA se pintan como «sin duplicados»: se dice que no se ha podido
// comprobar, con el motivo.

import type { GrupoDuplicado } from '@central/module-seguros'

export type RespuestaDuplicados =
  | { estado: 'ok'; grupos: GrupoDuplicado[] }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

/** Una póliza dentro de un grupo, o `null` si no tiene forma. */
function leerPolizaGrupo(v: unknown): GrupoDuplicado['polizas'][number] | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = cadena(o.id)
  const clienteId = cadena(o.clienteId)
  if (id === null || clienteId === null) return null
  if (typeof o.confirmadaCima !== 'boolean') return null
  return { id, clienteId, confirmadaCima: o.confirmadaCima, estado: cadena(o.estado) ?? 'sin_informar' }
}

/**
 * Un grupo del puerto → `GrupoDuplicado`, o `null` si está mal formado. Un
 * grupo con menos de dos pólizas legibles no es un duplicado y se descarta.
 * `emitidaYCima` se recalcula aquí a partir de las pólizas (no se confía en
 * el flag que llega: si se perdiera una póliza por ilegible, el flag mentiría).
 */
export function leerGrupoDuplicado(v: unknown): GrupoDuplicado | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const numero = cadena(o.numero)
  const compania = cadena(o.compania)
  if (numero === null || compania === null || !Array.isArray(o.polizas)) return null
  const polizas = o.polizas.map(leerPolizaGrupo).filter((p): p is NonNullable<typeof p> => p !== null)
  if (polizas.length < 2) return null
  return {
    numero,
    compania,
    polizas,
    emitidaYCima: polizas.some((p) => p.confirmadaCima) && polizas.some((p) => !p.confirmadaCima),
  }
}

/**
 * La lista de grupos, o `null` si no llega o no es lista. Un grupo mal
 * formado se salta (no tumba el bloque); una LISTA que no es lista degrada a
 * `null` — jamás a `[]`, que diría «sin duplicados».
 */
export function leerGruposDuplicados(v: unknown): GrupoDuplicado[] | null {
  if (!Array.isArray(v)) return null
  return v.map(leerGrupoDuplicado).filter((g): g is GrupoDuplicado => g !== null)
}

export function interpretarDuplicados(status: number, json: unknown): RespuestaDuplicados {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 200 && o.estado === 'ok') {
    const grupos = leerGruposDuplicados(o.grupos)
    // Un `ok` sin lista legible no se convierte en «sin duplicados».
    if (grupos === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    return { estado: 'ok', grupos }
  }
  return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}` }
}

/** El motivo del puerto, en castellano de pantalla. Los que ya son frase se dejan. */
export function textoMotivoDuplicados(motivo: string): string {
  switch (motivo) {
    case 'secreto_rechazado':
      return 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos)'
    case 'respuesta_ilegible':
      return 'la respuesta de asegura no tenía la forma esperada'
    case 'asegura_error':
      return 'asegura respondió, pero no pudo leer la cartera'
    case 'red':
      return 'no se pudo llegar a asegura (timeout, DNS o TLS)'
    default:
      return motivo
  }
}

/** Cuántas pólizas sobran: en cada grupo, todas menos una. */
export function polizasSobrantes(grupos: readonly GrupoDuplicado[]): number {
  return grupos.reduce((s, g) => s + Math.max(0, g.polizas.length - 1), 0)
}

// ─── Red (solo desde la ruta API de plataforma) ──────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export type Reenvio = { status: number; json: unknown }

/** `GET /api/operador/duplicados` — los grupos de pólizas duplicadas en la cartera viva. */
export async function duplicadosAsegura(): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/duplicados`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}
