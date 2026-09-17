/**
 * «Dinos qué echas de menos» — la sugerencia que el cliente escribe en el
 * portal y que le llega a Alberto por Telegram.
 *
 * ─── La decisión que sostiene el fichero ─────────────────────────────────────
 * 🚨 Aquí Telegram NO es un aviso: es EL REGISTRO. En el aviso de primer acceso
 * (`lib/aviso-acceso.ts`) el dato de verdad se guarda en `portal_acceso` y
 * Telegram solo adelanta la noticia, así que un envío perdido cuesta
 * inmediatez. Una sugerencia no se guarda en ninguna tabla del portal: si el
 * envío no sale, **el texto de esa persona no existe en ningún sitio**. Por eso
 * la pantalla no puede decir «recibida» hasta que conste que salió, y por eso
 * `resultadoSugerencia()` separa los tres desenlaces en vez de devolver un
 * booleano.
 *
 * ─── Y el escapado no es cosmético ──────────────────────────────────────────
 * 🚨 `tgSend` manda con `parse_mode: 'HTML'` por defecto. Un `<` en el texto de
 * alguien —«el botón de <ver póliza> no se ve»— hace que Telegram devuelva 400,
 * `tgSend` conteste `null` y el mensaje **se pierda sin un solo error**, con la
 * pantalla diciéndole que se ha enviado. Se escapa antes de componer, no
 * después: componer y escapar en el orden contrario se cargaría también las
 * etiquetas nuestras.
 */

/** Tope del texto. Generoso: quien se molesta en escribir suele explicarse. */
export const MAX_SUGERENCIA = 1500

/** Lo mínimo para que sea una sugerencia y no un dedazo en el botón. */
export const MIN_SUGERENCIA = 5

/** Escapa lo que HTML de Telegram interpreta. Solo estos tres, y en este orden. */
export function escaparHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Limpia el texto de la persona. Devuelve `null` cuando no hay sugerencia que
 * mandar — y `null` NO es un error que enseñarle: es que no ha escrito nada.
 *
 * Se colapsan los saltos de línea de más (tres o más seguidos) pero NO todos:
 * quien enumera tres cosas en tres líneas está siendo claro, y aplanarlo a un
 * párrafo hace su sugerencia más difícil de leer que la que escribió.
 */
export function normalizarSugerencia(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim()
  if (t.length < MIN_SUGERENCIA) return null
  return t.slice(0, MAX_SUGERENCIA)
}

export type ContextoSugerencia = {
  identidadId: string
  /** Lo que la persona tecleó al entrar. Sin vínculo NO está verificado. */
  nombre: string | null
  /** ¿Su acceso está casado con una ficha de la cartera? */
  vinculada: boolean
  /** En qué pantalla del portal estaba. `null` = no se supo. */
  desde: string | null
}

/**
 * El mensaje de Telegram.
 *
 * 🚨 **El nombre solo se dice si hay VÍNCULO**, igual que en el aviso de primer
 * acceso: sin él, lo único que hay es lo que esa persona tecleó y nadie lo ha
 * comprobado. «Sugerencia de Fulano» afirmaría una identidad que no consta.
 *
 * Y lleva la identidad **en texto plano y entera** a propósito: es lo único con
 * lo que Alberto puede volver a esa persona desde el mensaje, porque el portal
 * no guarda su correo (solo su hash).
 */
export function mensajeSugerencia(c: ContextoSugerencia, texto: string): string {
  const quien = c.vinculada && c.nombre ? escaparHtml(c.nombre) : null
  const cabeza = `💡 Sugerencia desde el portal del cliente${quien ? `: <b>${quien}</b>` : ''}`
  const marca = c.vinculada
    ? 'Tiene ficha en la cartera.'
    : 'Su acceso NO está casado con ninguna ficha (todavía no consta como cliente).'
  const donde = c.desde ? `\nEstaba en: ${escaparHtml(c.desde)}` : ''
  return `${cabeza}\n${marca}${donde}\n\n${escaparHtml(texto)}\n\nIdentidad ${c.identidadId}`
}

/** Qué se le puede decir a quien escribió. Ver la cabecera: `enviado` es lo único que promete algo. */
export type ResultadoSugerencia = 'enviada' | 'sin_canal' | 'error' | 'vacia'

/**
 * Traduce el desenlace del envío. `sin_canal` («no hay Telegram configurado en
 * este despliegue») y `error` («se intentó y no salió») **no se colapsan**: el
 * primero se arregla en Vercel y el segundo reintentando, y a la persona se le
 * dicen cosas distintas. Ninguno de los dos es «recibida».
 */
export function resultadoSugerencia(idMensaje: number | null, hubo: 'ok' | 'fallo'): ResultadoSugerencia {
  if (hubo === 'fallo') return 'error'
  return idMensaje === null ? 'sin_canal' : 'enviada'
}
