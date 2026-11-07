// Comentarios del dueño y de la gestoría por ASIENTO o por DOCUMENTO (factura recibida o referencia de documento). PURO.
// Un comentario cuelga de EXACTAMENTE un objeto. Solo se añaden (no se editan ni se borran: es el hilo de la conversación contable).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MAX_TEXTO_COMENTARIO = 2000
export type ObjetoComentable = { tipo: 'asiento'; id: string } | { tipo: 'factura_recibida'; id: string } | { tipo: 'documento'; ref: string }
export type ComentarioValido = { objeto: ObjetoComentable; texto: string }

export function validarComentario(e: unknown): { ok: true; valor: ComentarioValido } | { ok: false; errores: string[] } {
  const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>
  const errores: string[] = []
  const texto = typeof o.texto === 'string' ? o.texto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim() : ''
  if (!texto) errores.push('el comentario está vacío')
  if (texto.length > MAX_TEXTO_COMENTARIO) errores.push(`el comentario excede ${MAX_TEXTO_COMENTARIO} caracteres`)
  const dados = (['asientoId', 'facturaId', 'documentoRef'] as const).filter((k) => o[k] !== undefined && o[k] !== null && o[k] !== '')
  let objeto: ObjetoComentable | null = null
  if (dados.length !== 1) errores.push('indica exactamente uno: asientoId, facturaId o documentoRef')
  else if (dados[0] === 'asientoId') { typeof o.asientoId === 'string' && UUID_RE.test(o.asientoId) ? (objeto = { tipo: 'asiento', id: o.asientoId.toLowerCase() }) : errores.push('asientoId no válido') }
  else if (dados[0] === 'facturaId') { typeof o.facturaId === 'string' && UUID_RE.test(o.facturaId) ? (objeto = { tipo: 'factura_recibida', id: o.facturaId.toLowerCase() }) : errores.push('facturaId no válido') }
  else {
    const ref = typeof o.documentoRef === 'string' ? o.documentoRef.trim() : ''
    ref && ref.length <= 300 ? (objeto = { tipo: 'documento', ref }) : errores.push('documentoRef vacío o de más de 300 caracteres')
  }
  return errores.length || !objeto ? { ok: false, errores } : { ok: true, valor: { objeto, texto } }
}

/** Revisión: marca un asiento o una factura como revisados. Mismas reglas de identificador. */
export function validarRevision(e: unknown): { ok: true; valor: { tipo: 'asiento' | 'factura_recibida'; id: string } } | { ok: false; errores: string[] } {
  const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>
  const tipo = o.tipo === 'asiento' || o.tipo === 'factura_recibida' ? o.tipo : null
  if (!tipo) return { ok: false, errores: ['tipo debe ser asiento o factura_recibida'] }
  if (typeof o.id !== 'string' || !UUID_RE.test(o.id)) return { ok: false, errores: ['id no válido'] }
  return { ok: true, valor: { tipo, id: o.id.toLowerCase() } }
}
