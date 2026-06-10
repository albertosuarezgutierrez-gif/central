// Registro de adaptadores de verticales para el god-panel.
// Añadir una vertical = una línea aquí + su adaptador en ./<vertical>.ts

import { ialimpAdapter } from './ialimp'
import { sivraAdapter } from './sivra'
import { iarestAdapter } from './iarest'
import type { VerticalAdapter, Vertical, ClienteSaaS } from './types'

export const ADAPTERS: Record<Vertical, VerticalAdapter> = {
  ialimp: ialimpAdapter,
  sivra: sivraAdapter,
  iarest: iarestAdapter,
}

export function getAdapter(v: string): VerticalAdapter | undefined {
  return (ADAPTERS as Record<string, VerticalAdapter>)[v]
}

/** Lista los clientes de TODAS las verticales (cada adaptador degrada a [] si falla). */
export async function listarTodos(): Promise<ClienteSaaS[]> {
  const listas = await Promise.all(Object.values(ADAPTERS).map(a => a.listar()))
  return listas.flat()
}

export type { Vertical, ClienteSaaS } from './types'
export type { Cliente360 } from './types'
