/**
 * La regla PURA de `avisos-carnet-silencio.ts` (sin BD, para poder probarla): de qué fichas está apagado el
 * aviso de caducidad del carné. Las reglas (niveles que operan, basta una identidad, sin fila = encendido) están
 * en la cabecera de aquel fichero.
 */
import { NIVELES_QUE_OPERAN } from './ficha-de-poliza.ts'

/** Pura: de los vínculos y las identidades con el aviso apagado, las fichas cuyo aviso del carné está apagado. */
export function fichasConCarnetSilenciado(x: {
  vinculos: readonly { identidadId: string; clienteId: string; nivel: string }[]
  silenciadas: ReadonlySet<string>
}): Set<string> {
  const out = new Set<string>()
  for (const v of x.vinculos) {
    if (!(NIVELES_QUE_OPERAN as readonly string[]).includes(v.nivel)) continue
    if (x.silenciadas.has(v.identidadId)) out.add(v.clienteId)
  }
  return out
}
