// ────────────────────────────────────────────────────────────────────────────
// Titular de la documentación adjunta de una subasta. Puro (sin BD ni red):
// lo consume la ficha de `/subastas` y lo cubren tests con `node --test`.
// ────────────────────────────────────────────────────────────────────────────

/** Un adjunto de la ficha del BOE tal y como se guarda en `subastas.documentos`. */
export interface DocumentoAdjunto {
  titulo: string
  url: string
  /** `false` = escaneado o ilegible. `null` = no se intentó leer. */
  legible?: boolean | null
}

export type EstadoDocumentacion = 'sin_revisar' | 'sin_adjuntos' | 'con_adjuntos'

/**
 * `null`/`undefined` = la ficha AÚN NO se ha revisado. `[]` = revisada y el BOE
 * no publica adjuntos. Son cosas distintas y hay que decirlas distinto.
 *
 * @param publicaAdjuntos `false` para las fuentes SIN ficha documental (los
 *   lotes de la Junta viven en una web propia, sin PDFs que listar): ahí un
 *   NULL no es «pendiente de revisar» —nunca habrá nada que revisar— y
 *   prometerle a Alberto una pasada que no va a llegar es otra forma de mentir.
 */
export function estadoDocumentacion(
  docs: DocumentoAdjunto[] | null | undefined,
  publicaAdjuntos = true,
): EstadoDocumentacion {
  if (docs == null) return publicaAdjuntos ? 'sin_revisar' : 'sin_adjuntos'
  return docs.length === 0 ? 'sin_adjuntos' : 'con_adjuntos'
}

/**
 * Texto del `<summary>` de «Cargas y documentación».
 *
 * 🚨 Nunca afirmar una ausencia que no se sabe: la columna `documentos` es más
 * nueva que las filas del corpus, así que una subasta ingerida antes la tiene a
 * NULL hasta que pasa el cron. Tratar ese NULL como lista vacía hacía que una
 * subasta con EDICTO y CERTIFICACIÓN DE CARGAS publicados en el BOE dijera
 * «sin documentos adjuntos» (queja de Alberto, 30/07/2026) — justo en el dato
 * que decide si se puja.
 */
export function resumenDocumentos(
  docs: DocumentoAdjunto[] | null | undefined,
  publicaAdjuntos = true,
): string {
  const estado = estadoDocumentacion(docs, publicaAdjuntos)
  if (estado === 'sin_revisar') return 'adjuntos sin revisar'
  if (estado === 'sin_adjuntos') return 'sin documentos adjuntos'
  const lista = docs as DocumentoAdjunto[]
  const escaneados = lista.filter((d) => d.legible === false).length
  return `${lista.length} documento${lista.length === 1 ? '' : 's'}${escaneados > 0 ? `, ${escaneados} sin capa de texto` : ''}`
}
