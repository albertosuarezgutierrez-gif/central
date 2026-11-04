// Recorrido de la INSTANTÁNEA del catálogo por compañía (gratis). La red se inyecta (`llamar`) para
// poder probarla sin vendor; la ruta pasa `peticion` del cliente ya cableado.
//
// Tres barreras contra gastar: (1) solo se componen paths de la lista cerrada (`pathDe`), (2) ANTES de
// cada llamada se re-comprueba `esEndpointGratis('GET', path)` y si no pasa se ABORTA sin llamar,
// (3) tope de llamadas (`TOPE_LLAMADAS`) con pausa entre ellas. Un fallo de una llamada no tumba
// el resto: queda como fila `llamada` con estado `error` (no se pudo mirar ≠ no hay).

import {
  esEndpointGratis,
  filasDeInstantanea,
  llamadasDeProductos,
  llamadasFijas,
  PAUSA_MS,
  ramosDe,
  TOPE_LLAMADAS,
  type FilaCatalogo,
  type Llamada,
  type ResultadoLlamada,
} from './catalogo-companias.ts'

export type Llamar = (path: string) => Promise<unknown>

export class EndpointNoPermitido extends Error {
  constructor(path: string) {
    super(`endpoint fuera de la lista gratis: ${path}`)
    this.name = 'EndpointNoPermitido'
  }
}

export async function recorrerCatalogo(
  llamar: Llamar,
  opciones: { pausaMs?: number; tope?: number; dormir?: (ms: number) => Promise<void> } = {},
): Promise<{ filas: FilaCatalogo[]; llamadasHechas: number; truncado: boolean }> {
  const pausa = opciones.pausaMs ?? PAUSA_MS
  const tope = Math.min(opciones.tope ?? TOPE_LLAMADAS, TOPE_LLAMADAS)
  const dormir = opciones.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const resultados: ResultadoLlamada[] = []
  let hechas = 0

  const una = async (ll: Llamada) => {
    if (!esEndpointGratis('GET', ll.path)) throw new EndpointNoPermitido(ll.path)
    if (hechas >= tope) return false
    if (hechas > 0 && pausa > 0) await dormir(pausa)
    hechas++
    try {
      resultados.push({ llamada: ll, estado: 'ok', cuerpo: await llamar(ll.path) })
    } catch (e) {
      const http = typeof (e as { status?: unknown })?.status === 'number' ? (e as { status: number }).status : null
      resultados.push({ llamada: ll, estado: 'error', mensaje: e instanceof Error ? e.message : String(e), http })
    }
    return true
  }

  for (const ll of llamadasFijas()) if (!(await una(ll))) break
  const ramosRes = resultados.find((r) => r.llamada.clave === 'ramos')
  const ramos = ramosRes && ramosRes.estado === 'ok' ? ramosDe(ramosRes.cuerpo) : []
  const { llamadas, truncado } = llamadasDeProductos(ramos, hechas, tope)
  for (const ll of llamadas) await una(ll)
  return { filas: filasDeInstantanea(resultados, truncado), llamadasHechas: hechas, truncado }
}
