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

export type EstadoDocumentacion = 'sin_revisar' | 'sin_adjuntos' | 'con_adjuntos' | 'ocultos'

/** Lo que el Portal deja ver sin sesión iniciada (`muroDocumental` del módulo). */
export type Muro = 'ninguno' | 'parcial' | 'total' | null | undefined

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
  muro: Muro = 'ninguno',
): EstadoDocumentacion {
  // 🚨 Un `[]` detrás del muro del Portal no es «revisada y sin adjuntos»: es
  // «no me dejan ver la lista». Con adjuntos a la vista se dice lo que hay —
  // pero sabiendo que puede faltar alguno (`parcial`), eso lo matiza el resumen.
  if ((muro === 'total' || muro === 'parcial') && !docs?.length) return 'ocultos'
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
  muro: Muro = 'ninguno',
): string {
  const estado = estadoDocumentacion(docs, publicaAdjuntos, muro)
  if (estado === 'ocultos') return 'documentos ocultos: hay que iniciar sesión en el Portal'
  if (estado === 'sin_revisar') return 'adjuntos sin revisar'
  if (estado === 'sin_adjuntos') return 'sin documentos adjuntos'
  const lista = docs as DocumentoAdjunto[]
  const escaneados = lista.filter((d) => d.legible === false).length
  // Con muro parcial la lista está capada: decir «2 documentos» a secas invita a
  // dar por hecho que no hay más, y el Portal acaba de decir que sí los hay.
  const uno = lista.length === 1
  const capada = muro === 'parcial' ? ` visible${uno ? '' : 's'} sin sesión (el Portal esconde el resto)` : ''
  return `${lista.length} documento${uno ? '' : 's'}${capada}${escaneados > 0 ? `, ${escaneados} sin capa de texto` : ''}`
}
