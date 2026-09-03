// Quitar a una persona de UNA póliza de la correduría, desde la ficha de
// plataforma.
//
// EL PORQUÉ (03/09/2026): Alberto, mirando «👤 Personas en sus pólizas», vio a
// «Francisco Chacón Matito» como conductor ocasional y dijo «no se puede
// borrar, es un error». Era literal en las dos mitades: la fila era basura del
// volcado, y el puerto de asegura no tenía DELETE de intervinientes, así que
// quitarla exigía un lote SQL.
//
// La BD vive en `apps/asegura` (`seguros.poliza_intervinientes`); esta app
// habla con su puerto (`DELETE /api/operador/poliza/intervinientes`) con el
// secreto de operador — mismo patrón que `relaciones-asegura.ts`, del que sale
// copiado el trato de estados y de errores.
//
// 🚨 Una línea de CIMA NO se puede quitar: el puerto responde 409 porque el
// siguiente pull la recrearía. Ese motivo llega tal cual a la pantalla; aquí no
// se inventa ningún texto para él.

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

/**
 * Lo que devuelve el puerto al quitar. `error` es «no se ha podido hacer»;
 * `invalido`/`no_encontrado` son «no se ha hecho por un motivo» y lo traen.
 * `invalido` es también el 409 de CIMA, con su explicación.
 */
export type RespuestaQuitarInterviniente =
  | { estado: 'ok' }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'no_encontrado'; motivo: string | null }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

export function interpretarQuitarInterviniente(status: number, json: unknown): RespuestaQuitarInterviniente {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404 || o.estado === 'no_encontrado') return { estado: 'no_encontrado', motivo: cadena(o.motivo) }
  // 409 = la manda CIMA; 422 = falta el id. Los dos llegan como `invalido` con
  // el motivo de asegura, que es lo que se pinta sin reescribirlo.
  if (status === 409 || status === 422 || o.estado === 'invalido') {
    return { estado: 'invalido', motivo: cadena(o.motivo) ?? 'no se ha podido quitar' }
  }
  if (status === 200 && o.estado === 'ok') return { estado: 'ok' }
  return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}` }
}

/** El motivo del puerto, en castellano de pantalla. Los que ya son frase se dejan. */
export function textoMotivoInterviniente(motivo: string): string {
  switch (motivo) {
    case 'secreto_rechazado':
      return 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).'
    case 'asegura_error':
      return 'asegura respondió, pero no pudo escribir en su base de datos.'
    case 'red':
      return 'no se pudo llegar a asegura (timeout, DNS o TLS).'
    default:
      return motivo
  }
}

// ─── Red (solo desde las rutas API de plataforma) ────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

function cabeceras(): Record<string, string> | null {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  return secret ? { Authorization: `Bearer ${secret}` } : null
}

export type Reenvio = { status: number; json: unknown }

/**
 * `DELETE /api/operador/poliza/intervinientes` — `{intervinienteId, actor, motivo?}`.
 * `intervinienteId` es la FILA, no el cliente: la misma persona puede intervenir
 * en varias pólizas y solo se quita de la que se está mirando.
 */
export async function quitarIntervinienteAsegura(
  intervinienteId: string,
  actor: string,
  motivo?: string,
): Promise<Reenvio> {
  const h = cabeceras()
  if (!h) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/poliza/intervinientes`, {
      method: 'DELETE',
      headers: { ...h, 'content-type': 'application/json' },
      body: JSON.stringify({ intervinienteId, actor, ...(motivo ? { motivo } : {}) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}
