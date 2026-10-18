// «Preparar presupuesto con lo que ha sacado el bot» (18/10/2026) — lo PURO: sin red ni envs, importable desde
// `'use client'`. Visibilidad del botón y texto del resultado. Nada se envía al cliente: es un BORRADOR.

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/** El botón solo tiene sentido si algún trabajo del bot terminó en `ok` (hay ofertas que presupuestar). */
export function hayTrabajoOk(trabajos: ReadonlyArray<{ estado: string }> | null | undefined): boolean {
  return !!trabajos && trabajos.some((t) => t.estado === 'ok')
}

export type VistaPresupuestoRpa = {
  tono: 'ok' | 'info' | 'error'
  texto: string
  /** Id del presupuesto (se enlaza a su PDF) cuando la respuesta lo trae. */
  presupuestoId: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Respuesta del endpoint de plataforma (status + JSON de asegura) → texto para el operador. */
export function vistaPresupuestoRpa(status: number, json: unknown): VistaPresupuestoRpa {
  const j = obj(json) ?? {}
  const id = typeof j.presupuestoId === 'string' && UUID.test(j.presupuestoId) ? j.presupuestoId : null
  const n = typeof j.ofertas === 'number' && Number.isFinite(j.ofertas) ? j.ofertas : null
  const ofertas = n === null ? '' : ` con ${n} ${n === 1 ? 'oferta' : 'ofertas'}`
  if (status === 200 && j.estado === 'creado') {
    return { tono: 'ok', texto: `Presupuesto en borrador preparado${ofertas}. No se ha enviado nada al cliente.`, presupuestoId: id }
  }
  if (status === 200 && j.estado === 'ya_existe') {
    return { tono: 'info', texto: `Ya había un borrador con estas mismas ofertas${ofertas}: no se ha creado otro.`, presupuestoId: id }
  }
  if (status === 200 && j.estado === 'superado') {
    return { tono: 'info', texto: 'Otra preparación más reciente ya dejó su borrador: no se ha cambiado nada.', presupuestoId: null }
  }
  if (status === 409 || (status === 200 && (j.estado === 'nada' || j.estado === 'esperando'))) {
    return { tono: 'info', texto: 'El bot no ha sacado ofertas con las que preparar un presupuesto.', presupuestoId: null }
  }
  if (status === 404) return { tono: 'error', texto: 'La oportunidad no existe o no es de la correduría.', presupuestoId: null }
  // 401/403 aquí es la sesión del usuario (exigirCorreduria); el rechazo del secreto de operador llega como 502.
  if (status === 401 || status === 403) return { tono: 'error', texto: 'Tu sesión ha caducado o no tiene acceso a la correduría: vuelve a entrar.', presupuestoId: null }
  if (status === 502) return { tono: 'error', texto: 'asegura no ha respondido: vuelve a intentarlo.', presupuestoId: null }
  if (status === 503 && j.estado === 'sin_configurar') return { tono: 'error', texto: 'Falta ASEGURA_OPERADOR_SECRET en plataforma.', presupuestoId: null }
  return { tono: 'error', texto: `No se ha podido preparar el presupuesto (asegura respondió ${status}).`, presupuestoId: null }
}
