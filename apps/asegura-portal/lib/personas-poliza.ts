/**
 * Las personas de CIMA de UNA póliza (asegura#880) para su ficha: las figuras que SON el cliente
 * (completas, para que confirme sus datos), las demás de una póliza suya (papel y nombre) y los
 * terceros de sus siniestros (papel, nombre, matrícula y compañía del contrario).
 *
 * ─── Por qué por el puente ───────────────────────────────────────────────────
 * Las figuras van cifradas y este portal no tiene `PII_ENCRYPTION_KEY` a propósito (ver
 * `lib/mis-datos.ts`). Las lee y descifra `apps/asegura` (`/api/portal/personas-poliza`), que
 * resuelve la póliza por `portal_vinculo` de la identidad: aquí no se manda ningún `clienteId`.
 *
 * ─── Defensa en profundidad ──────────────────────────────────────────────────
 * Lo recibido se vuelve a pasar por la MISMA lista blanca (`figuraPropiaParaCliente`,
 * `figuraAjenaParaCliente`, `tercerosParaCliente`): un asegura viejo o roto no cuela un teléfono
 * de un tercero. Y quien pinta solo cruza siniestros que ya están en la cartera autorizada.
 *
 * Sin puente, sin respuesta o con error → `null`: la ficha se calla (no se afirma «no hay nadie»).
 */
import {
  figuraAjenaParaCliente,
  figuraPropiaParaCliente,
  tercerosParaCliente,
  type FiguraAjenaCliente,
  type FiguraPropiaCliente,
  type TerceroCliente,
} from '@central/module-seguros-portal'

import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config.ts'

export type PersonasDePoliza = {
  /** `null` = la póliza aún no trae figuras de CIMA. */
  propias: FiguraPropiaCliente[] | null
  otras: FiguraAjenaCliente[]
  /** Terceros por siniestro. `null` = no se han podido leer. */
  terceros: Map<string, TerceroCliente[]> | null
}

const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Respuesta del puente → `PersonasDePoliza`, re-filtrada por lista blanca. PURA (con test). */
export function interpretarPersonas(j: unknown): PersonasDePoliza | null {
  if (!esObjeto(j) || j.estado !== 'ok') return null
  const propias = Array.isArray(j.propias)
    ? j.propias.filter(esObjeto).map(figuraPropiaParaCliente)
    : null
  const otras = Array.isArray(j.otras)
    ? j.otras.filter(esObjeto).map(figuraAjenaParaCliente).filter((x): x is FiguraAjenaCliente => x !== null)
    : []
  let terceros: Map<string, TerceroCliente[]> | null = null
  if (Array.isArray(j.siniestros)) {
    terceros = new Map()
    for (const s of j.siniestros) {
      if (!esObjeto(s) || typeof s.siniestroId !== 'string') continue
      const l = tercerosParaCliente(s.terceros)
      if (l.length > 0) terceros.set(s.siniestroId, l)
    }
  }
  return { propias, otras, terceros }
}

export async function personasDePoliza(identidadId: string, polizaId: string): Promise<PersonasDePoliza | null> {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const qs = new URLSearchParams({ identidadId, polizaId })
    const res = await fetch(`${base.replace(/\/+$/, '')}/api/portal/personas-poliza?${qs}`, {
      headers: { authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: control.signal,
    })
    if (!res.ok) return null
    return interpretarPersonas(await res.json().catch(() => null))
  } catch (e) {
    console.error('[personas-poliza] puente:', e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(reloj)
  }
}
