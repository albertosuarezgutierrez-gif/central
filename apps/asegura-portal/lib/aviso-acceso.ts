// El aviso de que alguien ha entrado al portal POR PRIMERA VEZ.
//
// 🚨 Es el NUDGE, no el registro. El registro es `portal_acceso`, que se
// escribe dentro de la misma transacción que el login y no depende de nada
// externo. Si este aviso no sale, no se pierde información: se pierde la
// inmediatez. Confundir las dos cosas llevaría a tratar Telegram como la
// prueba, y un canal best-effort no puede serlo.
//
// Y por qué un aviso y no (solo) una pantalla: la regla de la casa es «¿en qué
// pantalla lo va a ver?». Alberto abre Telegram; no va a abrir una pestaña a
// mirar cinco filas por si acaso.
import { tgSend } from '@central/core-telegram'

/**
 * Tres estados, y `sin_canal` NO es un error. `tgSend` devuelve `null` cuando
 * faltan `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, o sea que un envío que nunca
 * se intentó es indistinguible de uno fallido si se colapsan. Se separan para
 * que el log del servidor pueda decir cuál de las dos cosas pasó — un aviso que
 * no llega y nadie sabe por qué es peor que no tenerlo.
 */
export type ResultadoAviso = 'enviado' | 'sin_canal' | 'error'

export type ContextoPrimerAcceso = {
  identidadId: string
  /** Lo que la persona escribió como nombre. Sin vínculo NO está verificado. */
  nombre: string | null
  /**
   * 🚨 TRES estados, porque `vincularIdentidad` devuelve seis y no se dejan
   * caer en un booleano:
   *   `si`         → `ok` / `ya_vinculada`: consta con qué ficha.
   *   `no`         → `sin_ficha`: se miró y no hay ninguna con ese correo.
   *   `no_se_sabe` → `ambiguo` / `sin_clave` / `error`: NO se ha podido
   *                  comprobar. Decir «no se ha casado con ninguna ficha»
   *                  aquí sería afirmar algo que nadie ha mirado, y encima en
   *                  el mensaje con el que Alberto decide si se preocupa.
   */
  vinculo: 'si' | 'no' | 'no_se_sabe'
}

/**
 * El texto, puro y probado aparte.
 *
 * 🚨 **El nombre solo se dice si hay VÍNCULO.** Sin él, lo único que hay es lo
 * que esa persona ha tecleado, y nadie lo ha comprobado: escribir «Ha entrado
 * Fulano» afirmaría una identidad que no consta. Sin vínculo se dice lo que sí
 * se sabe —que alguien entró y no casó con ninguna ficha—, que además es
 * justamente el caso que hay que mirar.
 *
 * Y no lleva el correo porque no existe: el portal solo guarda su hash.
 */
export function mensajePrimerAcceso(c: ContextoPrimerAcceso): string {
  const quien = c.vinculo === 'si' && c.nombre ? c.nombre : null
  const cabeza = `🔓 Primera entrada al portal del cliente${quien ? `: ${quien}` : ''}.`
  const cuerpo =
    c.vinculo === 'si'
      ? 'Se ha casado con una ficha de la cartera.'
      : c.vinculo === 'no'
        ? 'NO se ha casado con ninguna ficha: no verá ninguna póliza, pero conviene saber quién es.'
        : 'NO se ha podido comprobar si le corresponde alguna ficha, así que no se sabe qué verá. Míralo.'
  return `${cabeza}\n${cuerpo}\nIdentidad ${c.identidadId}`
}

/** Nunca lanza: un fallo del aviso no puede impedir que alguien entre. */
export async function avisarPrimerAcceso(c: ContextoPrimerAcceso): Promise<ResultadoAviso> {
  try {
    const id = await tgSend(mensajePrimerAcceso(c))
    if (id === null) {
      console.warn('[portal] primer acceso sin avisar: falta TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID en este proyecto')
      return 'sin_canal'
    }
    return 'enviado'
  } catch (e) {
    console.error('[portal] no se ha podido avisar del primer acceso:', e instanceof Error ? e.message : e)
    return 'error'
  }
}
