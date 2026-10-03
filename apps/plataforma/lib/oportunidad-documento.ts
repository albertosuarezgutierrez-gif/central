// Qué se le dice a Alberto tras subir un documento (29/09/2026): asegura abre SOLA la oportunidad de
// todo documento de seguro, y devuelve el desenlace en `oportunidad`. Cada desenlace se dice distinto
// porque se actúa distinto: no es lo mismo «ya es nuestra» que «no se ha podido leer».

export type AvisoOportunidadDocumento = {
  tono: 'ok' | 'info' | 'aviso'
  texto: string
  /** Ficha donde ha quedado la oportunidad (puede ser un lead nuevo). */
  clienteId: string | null
}

const fecha = (iso: unknown) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : null)
const txt = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 200) : null)

/** `null` = la respuesta no trae desenlace (subida a una póliza, o un asegura anterior a esto). */
export function interpretarOportunidadDocumento(v: unknown): AvisoOportunidadDocumento | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const clienteId = txt(o.clienteId)
  switch (o.estado) {
    case 'creada':
    case 'actualizada': {
      const vence = fecha(o.vence)
      const llamada = fecha(o.llamada)
      const quien = o.clienteNuevo === true
        // «De otra persona» solo si se subió desde OTRA ficha (en «Subir póliza» no hay ficha de partida).
        ? ` para un lead NUEVO${o.relacionado === true ? ' (el documento era de otra persona)' : ''}`
        : o.relacionado === true ? ' en la ficha del tomador (el documento era de otra persona)' : ''
      const cuando = vence
        ? `vence el ${vence}; llamada el ${llamada ?? '—'}`
        : 'sin vencimiento legible: queda una tarea para pedirlo'
      const que = o.estado === 'creada'
        ? 'Oportunidad abierta sola'
        : o.completada === true
          ? 'Ya tenía una oportunidad de este seguro: le he completado lo que faltaba'
          : 'Ya tenía una oportunidad de este seguro abierta: sigue esa'
      return { tono: 'ok', texto: `${que}${quien} (${cuando}).`, clienteId }
    }
    case 'ya_nuestra':
      return { tono: 'info', texto: 'Esta póliza ya es nuestra (en vigor): no es una oportunidad.', clienteId: null }
    case 'no_es_seguro':
      return { tono: 'info', texto: 'No trae datos de un seguro (compañía, nº, vencimiento ni prima): no abre oportunidad.', clienteId: null }
    case 'sin_persona':
      return { tono: 'aviso', texto: 'No se sabe de quién es el seguro: abre la oportunidad a mano.', clienteId: null }
    case 'sin_lectura':
      return { tono: 'aviso', texto: `No se ha podido leer${txt(o.motivo) ? ` (${txt(o.motivo)})` : ''}: abre la oportunidad a mano.`, clienteId: null }
    case 'error':
      return { tono: 'aviso', texto: `La oportunidad no se ha podido abrir${txt(o.motivo) ? ` (${txt(o.motivo)})` : ''}: ábrela a mano.`, clienteId: null }
    default:
      return null
  }
}

// ─── La ficha del tomador tras «Subir póliza» (03/10/2026) ──────────────────────────────────────
// asegura devuelve `ficha`: a qué ficha ha ido el documento, si se ha abierto ahora, qué HUECOS ha
// rellenado (solo nombres de campo, nunca valores) y los avisos. `null` = no se ha tocado ninguna.

export type FichaDocumento = { clienteId: string; creada: boolean; rellenados: string[]; avisos: string[] }

const lista = (v: unknown, max = 20) =>
  Array.isArray(v) ? v.flatMap(x => (typeof x === 'string' && x.trim() !== '' ? [x.trim().slice(0, 300)] : [])).slice(0, max) : []

/** `undefined` = asegura no dice nada de la ficha (versión anterior): no se afirma nada. */
export function interpretarFichaDocumento(v: unknown): FichaDocumento | null | undefined {
  if (v === undefined) return undefined
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const clienteId = txt(o.clienteId)
  if (!clienteId) return null
  return { clienteId, creada: o.creada === true, rellenados: lista(o.rellenados), avisos: lista(o.avisos) }
}

/** Una frase con lo que de verdad ha pasado en la ficha. */
export function textoFichaDocumento(f: FichaDocumento): string {
  const quien = f.creada ? 'Se ha abierto un lead nuevo para el tomador' : 'El documento es de una ficha que ya existía'
  const que = f.rellenados.length > 0
    ? `rellenado: ${f.rellenados.join(', ')}`
    : 'no se ha rellenado ningún dato (no había huecos o no se pudo)'
  return `${quien}; ${que}.`
}
