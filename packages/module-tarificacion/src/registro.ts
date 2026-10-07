// Registro de adaptadores de portal por (compañía, ramo). Sin estado global: cada consumidor crea
// el suyo (el worker registra los adaptadores que trae compilados).

import type { TarificadorAdapter } from './tipos.ts'

type AdaptadorMinimo = Pick<TarificadorAdapter, 'compania' | 'ramo'>

/** Clave canónica de compañía: minúsculas, sin tildes ni espacios sobrantes («Allianz » → «allianz»). */
export function claveCompania(compania: string): string {
  return String(compania)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export type RegistroAdaptadores<A extends AdaptadorMinimo> = {
  registrar(a: A): void
  /** `null` = no hay adaptador para eso (nunca se cae a «el de otra compañía»). */
  obtener(compania: string, ramo: string): A | null
  claves(): string[]
}

export function crearRegistro<A extends AdaptadorMinimo = TarificadorAdapter>(): RegistroAdaptadores<A> {
  const mapa = new Map<string, A>()
  const k = (compania: string, ramo: string) => `${claveCompania(compania)}::${String(ramo).trim().toLowerCase()}`
  return {
    registrar(a) {
      const clave = k(a.compania, a.ramo)
      if (mapa.has(clave)) throw new Error(`registro: ya hay un adaptador para ${clave}`)
      mapa.set(clave, a)
    },
    obtener(compania, ramo) {
      return mapa.get(k(compania, ramo)) ?? null
    },
    claves() {
      return [...mapa.keys()].sort()
    },
  }
}
