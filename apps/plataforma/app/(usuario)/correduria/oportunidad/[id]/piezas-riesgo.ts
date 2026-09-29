// Piezas puras de la pantalla del riesgo: fechas, motivo de un error del puerto y la llamada a
// `/api/correduria/oportunidad/figuras`. Sin React, para que las compartan los componentes.

/** `2026-09-29` o un ISO completo → `29/09/2026`. Lo que no tiene forma de fecha se enseña tal cual. */
export function fechaEs(iso: string | null): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  // Un ISO con hora es UTC: la fecha de Madrid puede ser la del día siguiente a medianoche.
  if (iso.length > 10) {
    const d = new Date(iso)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })
    }
  }
  return `${m[3]}/${m[2]}/${m[1]}`
}

export type Respuesta = { ok: boolean; status: number; json: Record<string, unknown> | null }

/** El motivo que manda asegura, o el código HTTP; nunca un «error» sin más. */
export function motivoDe(r: Respuesta): string {
  const j = r.json ?? {}
  const m = typeof j.motivo === 'string' && j.motivo.trim() !== '' ? j.motivo : typeof j.causa === 'string' ? j.causa : null
  if (r.status === 0) return 'No se ha podido hablar con el servidor. No se sabe si se ha guardado: recarga antes de repetir.'
  return m ?? `HTTP ${r.status}`
}

export async function llamarFiguras(method: 'POST' | 'DELETE', body: Record<string, unknown>): Promise<Respuesta> {
  try {
    const res = await fetch('/api/correduria/oportunidad/figuras', {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { ok: res.ok && json?.estado === 'ok', status: res.status, json }
  } catch {
    return { ok: false, status: 0, json: null }
  }
}
