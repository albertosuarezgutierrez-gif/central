/**
 * La regla PURA de `avisos-carnet-silencio.ts` (sin BD, para poder probarla): de qué fichas está apagado el
 * aviso de caducidad del carné. Las reglas (solo el titular, basta una identidad, sin fila = encendido) están
 * en la cabecera de aquel fichero.
 */
/**
 * Solo el TITULAR (vínculo `gestionar`) puede callar el correo del carné de SU ficha (decisión 21/10/2026):
 * una identidad con `administrar` sobre la ficha de otra persona no la calla. Ante la duda, se envía.
 */
const NIVEL_TITULAR = 'gestionar'

/** Pura: de los vínculos y las identidades con el aviso apagado, las fichas cuyo aviso del carné está apagado. */
export function fichasConCarnetSilenciado(x: {
  vinculos: readonly { identidadId: string; clienteId: string; nivel: string }[]
  silenciadas: ReadonlySet<string>
}): Set<string> {
  const out = new Set<string>()
  for (const v of x.vinculos) {
    if (v.nivel !== NIVEL_TITULAR) continue
    if (x.silenciadas.has(v.identidadId)) out.add(v.clienteId)
  }
  return out
}
