/**
 * Mensajes con tu corredor (ASegura OS §Q.7, 24/09/2026). PURO: sin BD, sin red.
 *
 * Un hilo por TEMA: la póliza (`polizaId`) o «general» (`null`). Lo comparten el portal (el cliente
 * escribe y lee) y `apps/asegura` (el corredor contesta), para que las dos puntas cuenten los no
 * leídos y validen el cuerpo con la MISMA regla.
 *
 * 🚨 «Leído» es del DESTINATARIO: un mensaje del cliente lo lee el corredor y al revés. `leidoAt`
 * NULL = no consta que lo haya leído; no es «no lo ha leído».
 */

export const AUTORES_MENSAJE = ['cliente', 'corredor'] as const
export type AutorMensaje = (typeof AUTORES_MENSAJE)[number]

/** El mismo tope que el CHECK `portal_mensaje_cuerpo` de la BD. */
export const MAX_CUERPO_MENSAJE = 4000
/** Tope diario por identidad: corta el abuso sin estorbar a quien escribe de verdad. */
export const MAX_MENSAJES_DIA = 20

export type Mensaje = {
  id: string
  autor: AutorMensaje
  cuerpo: string
  polizaId: string | null
  creadoAt: string
  leidoAt: string | null
}

export type Hilo = {
  /** `null` = conversación general, sin póliza. */
  polizaId: string | null
  titulo: string
  mensajes: Mensaje[]
  ultimoAt: string
  /** Los del OTRO lado que quien mira aún no ha leído. */
  sinLeer: number
}

/** El cuerpo limpio, o `null` si no vale: vacío, solo espacios o más largo que el tope. */
export function normalizarCuerpo(crudo: unknown): string | null {
  if (typeof crudo !== 'string') return null
  const limpio = crudo.replace(/\r\n/g, '\n').trim()
  if (limpio.length === 0 || limpio.length > MAX_CUERPO_MENSAJE) return null
  return limpio
}

/** Mensajes que `lado` tiene sin leer: los escritos por el otro, sin sello de lectura. */
export function sinLeerPara(mensajes: readonly Mensaje[], lado: AutorMensaje): number {
  return mensajes.filter((m) => m.autor !== lado && m.leidoAt === null).length
}

/**
 * Agrupa por tema. Dentro, en orden de escritura; los hilos, el de actividad más reciente primero.
 * `tituloDe(polizaId)` pone el nombre del tema; un id que no sabe nombrar debe devolver algo
 * genérico («Una de tus pólizas»), nunca el número de póliza, que nadie se sabe.
 */
export function agruparHilos(
  mensajes: readonly Mensaje[],
  lado: AutorMensaje,
  tituloDe: (polizaId: string | null) => string,
): Hilo[] {
  const porTema = new Map<string, Mensaje[]>()
  for (const m of mensajes) {
    const k = m.polizaId ?? ''
    const lista = porTema.get(k)
    if (lista) lista.push(m)
    else porTema.set(k, [m])
  }
  const hilos: Hilo[] = []
  for (const [k, lista] of porTema) {
    const orden = [...lista].sort((a, b) => a.creadoAt.localeCompare(b.creadoAt))
    const polizaId = k === '' ? null : k
    hilos.push({
      polizaId,
      titulo: tituloDe(polizaId),
      mensajes: orden,
      ultimoAt: orden[orden.length - 1].creadoAt,
      sinLeer: sinLeerPara(orden, lado),
    })
  }
  return hilos.sort((a, b) => b.ultimoAt.localeCompare(a.ultimoAt))
}
