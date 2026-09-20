// Enlaza el triaje de correo con la ficha del cliente en `apps/asegura` (20/09/2026).
//
// Cuando el triaje clasifica un correo de aseguradora (`correduria` /
// `correduria-recibo`), pregunta al puerto de asegura si el texto habla de una
// póliza VIVA de la cartera. Si resuelve, se anota en el historial de ESE
// cliente; si no, no cambia nada — el aviso de Telegram/digest de siempre
// sigue siendo la única señal, como hasta hoy.
//
// 🚨 La resolución es EXACTA (letra a letra, tras normalizar) y la decide
// `apps/asegura`, que es quien tiene la cartera — este fichero solo habla por
// HTTP con el mismo secreto de operador que ya usan `leads-asegura.ts` y
// `cliente-edicion-asegura.ts`. Nunca inventa un cliente ni degrada un fallo
// de red a «no hay póliza»: eso sería tan malo como colgar la nota en la
// ficha equivocada, solo que en la otra dirección (se perdería la señal).

export type ResolucionCorreo = { clienteId: string; polizaId: string; numeroPoliza: string }

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

function cabeceras(): Record<string, string> | null {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  return secret ? { Authorization: `Bearer ${secret}`, 'content-type': 'application/json' } : null
}

function leerResolucion(v: unknown): ResolucionCorreo | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.clienteId === 'string' && typeof o.polizaId === 'string' && typeof o.numeroPoliza === 'string') {
    return { clienteId: o.clienteId, polizaId: o.polizaId, numeroPoliza: o.numeroPoliza }
  }
  return null
}

/**
 * `[]` = se ha preguntado y no hay ninguna póliza que case (lo normal: la mayoría
 * de correos de aseguradora son comunicados genéricos). `undefined` = NO se ha
 * podido preguntar (sin secreto, red, timeout, respuesta rara) — nunca se
 * colapsa a `[]`, o un fallo de red se leería como «no es de nadie» en vez de
 * «no lo sé». Puede traer MÁS DE UNO: una liquidación de comisiones nombra
 * pólizas de varios clientes a la vez.
 *
 * Timeout corto (6 s) A PROPÓSITO: esto corre dentro del bucle del triaje,
 * justo antes de que se agote el cupo de 10 correos por pasada (ver
 * `pasadaTriaje`), y un fallo aquí nunca puede ser la causa de que el cursor
 * deje de avanzar.
 */
export async function resolverCorreoAseguradora(texto: string): Promise<ResolucionCorreo[] | undefined> {
  const h = cabeceras()
  if (!h) return undefined
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/correo/resolver`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ texto }),
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    })
    if (!res.ok) return undefined
    const j = (await res.json().catch(() => null)) as { estado?: string; resueltos?: unknown } | null
    if (!j || j.estado !== 'ok' || !Array.isArray(j.resueltos)) return undefined
    return j.resueltos.map(leerResolucion).filter((r): r is ResolucionCorreo => r !== null)
  } catch {
    return undefined
  }
}

/** `true` = se anotó. `false` = no se pudo (sin secreto, red, o asegura rechazó). */
export async function anotarHistorialDesdeCorreo(clienteId: string, texto: string): Promise<boolean> {
  const h = cabeceras()
  if (!h) return false
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/cliente/historial`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ clienteId, tipo: 'gestion', texto, actor: 'triaje-correo' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    })
    return res.ok
  } catch {
    return false
  }
}
