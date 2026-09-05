/**
 * «Tienes un acceso esperando»: el correo que avisa a quien la correduría ha
 * anotado como autorizado a ver los seguros de otra ficha.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * `autorizarVer()` escribe una fila de `portal_autorizacion` con
 * `origen = 'corredor'` que nace PENDIENTE: no abre nada hasta que la persona
 * autorizada entre al portal y la acepte. Hasta el 05/09/2026 nadie se lo
 * contaba: Alberto anotaba el consentimiento y después tenía que escribir el
 * correo a mano, o la autorización se quedaba ahí caducándose sola. Un permiso
 * que el interesado no sabe que existe es un permiso que no existe.
 *
 * ── 🚨 Por qué el envío vive en `apps/asegura` y no en el portal ────────────
 *
 * Misma razón que `lib/avisos-vencimiento.ts`: el portal guarda **solo hashes**
 * del canal (`portal_canal.valor_hash`), y un hash no se revierte — desde allí
 * no hay destinatario al que escribir. El panel del corredor corre con
 * `prisma_seguros` y sí lee `cliente_emails` cifrado, así que el correo sale de
 * aquí.
 *
 * ── 🚨 LO QUE ESTE CORREO NO PUEDE DECIR ────────────────────────────────────
 *
 * Quien lo recibe **todavía no ha aceptado nada**, y la dirección la ha tecleado
 * Alberto: puede ser un buzón compartido (`administracion@…`) o tener una letra
 * mal. Así que el cuerpo dice QUIÉN le ha dado acceso y dónde confirmarlo, y
 * nada más: ni compañía, ni número de póliza, ni matrícula, ni prima, ni DNI —
 * ni siquiera qué alcance se le ha dado, que ya es información sobre la cartera
 * ajena. Eso se enseña DENTRO, cuando la persona ha probado que es ella.
 *
 * Es la misma regla del correo de invitación del portal, y se apoya en la misma
 * lista: `CAMPOS_PROHIBIDOS_EN_INVITACION`. El cepo que la aplica está en
 * `lib/correo-aviso-acceso.test.ts` y recorre el texto entero.
 *
 * ── El enlace ───────────────────────────────────────────────────────────────
 *
 * Va a `/autorizaciones` del portal, y **no lleva token**: aquí no hace falta
 * ninguno. La persona entra con SU correo y un código de un solo uso, el portal
 * la vincula sola a su ficha por el índice ciego del email
 * (`apps/asegura-portal/lib/vinculo.ts`) y ahí ve lo que tiene pendiente. Un
 * enlace sin llave dentro es además un enlace que se puede reenviar sin abrir
 * nada.
 */
/** Escapa lo que va dentro del HTML. El nombre sale de la cartera, pero se escapa igual. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Quita saltos de línea de lo que va a una CABECERA (el asunto). Un `\r\n` en
 * el asunto parte el mensaje y deja colar un `Bcc:`.
 */
function unaLinea(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim()
}

/**
 * A dónde manda el correo. `null` = no hay portal utilizable y entonces **no se
 * envía**: un correo que dice «entra aquí» sin el «aquí» no sirve de nada, y
 * adivinar un dominio manda a la persona a ningún sitio.
 *
 * El valor por defecto es donde el portal sirve HOY, igual que en
 * `apps/asegura-web/lib/sitio.ts`; cuando `clientes.grupoasegura.es` esté
 * repuntado a Vercel se cambia la variable y esto no se toca.
 */
export function enlaceDeAutorizaciones(
  base: string | undefined = process.env.ASEGURA_PORTAL_URL ?? 'https://asegura-portal.vercel.app',
): string | null {
  const limpio = base?.trim()
  if (!limpio) return null
  let url: URL
  try {
    url = new URL(limpio)
  } catch {
    console.error('[asegura/aviso-acceso] ASEGURA_PORTAL_URL no es una URL válida: no se avisa')
    return null
  }
  // Solo https: el correo lleva a una pantalla donde se teclea un código de acceso.
  if (url.protocol !== 'https:') {
    console.error('[asegura/aviso-acceso] ASEGURA_PORTAL_URL no es https: no se avisa')
    return null
  }
  url.pathname = '/autorizaciones'
  return url.toString()
}

export type DatosAvisoAcceso = {
  /**
   * Nombre de la ficha que cede. `null` = **no se sabe** (la ficha no tiene uno
   * legible), nunca `''` ni «Desconocido»: el texto lo dice como lo que es.
   */
  otorgante: string | null
  enlace: string
  /**
   * Hasta cuándo se puede confirmar. `null` = no consta, y entonces el correo
   * **no menciona ninguna fecha** en vez de inventarse un plazo.
   */
  caducaEn: Date | null
}

export type CuerpoAviso = { asunto: string; texto: string; html: string }

function fechaEs(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

/**
 * El cuerpo, PURO: sin red, sin BD y sin más `process.env` que el buzón de
 * respuesta. Separado del envío para que su cepo pueda recorrer el texto entero
 * — un guardián que necesitara un servidor SMTP para correr no lo correría nadie.
 */
export function cuerpoAvisoAcceso(d: DatosAvisoAcceso): CuerpoAviso {
  // La ficha existe (se acaba de leer de la cartera); lo que falta es un nombre
  // que enseñar. Decir «un cliente de Grupo ASegura» es cierto; inventarle un
  // nombre, no.
  const quien = unaLinea(d.otorgante ?? '') || 'Un cliente de Grupo ASegura'
  const contacto = process.env.ASEGURA_MAIL_REPLY_TO?.trim() || null

  const asunto = `${quien} te ha dado acceso a sus seguros`

  const lineas = [
    'Hola:',
    '',
    `${quien} nos ha dicho que quiere darte acceso a sus seguros en Mis Seguros, el portal de Grupo ASegura.`,
    '',
    'Todavía no está abierto: hace falta que lo confirmes tú. Entra aquí:',
    d.enlace,
    '',
    'Entrarás con TU correo y un código de un solo uso. Este enlace no abre sesión por sí mismo, ' +
      'así que a quien se lo reenvíes no le sirve de nada.',
  ]
  if (d.caducaEn) lineas.push('', `Si no lo confirmas, el acceso se cierra solo el ${fechaEs(d.caducaEn)}.`)
  lineas.push(
    '',
    'Si no esperabas esto, no hagas nada: sin que tú lo confirmes no se te comparte nada.' +
      (contacto ? ` Si prefieres decírnoslo, escribe a ${contacto}.` : ''),
  )
  const texto = lineas.join('\n')

  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;line-height:1.5">` +
    `<p>Hola:</p>` +
    `<p><strong>${esc(quien)}</strong> nos ha dicho que quiere darte acceso a sus seguros en ` +
    `<strong>Mis Seguros</strong>, el portal de Grupo ASegura.</p>` +
    `<p>Todavía no está abierto: hace falta que lo confirmes tú.</p>` +
    `<p><a href="${esc(d.enlace)}" style="display:inline-block;padding:12px 20px;background:#0b5;` +
    `color:#fff;text-decoration:none;border-radius:8px">Confirmar el acceso</a></p>` +
    `<p style="color:#666;font-size:13px">Entrarás con TU correo y un código de un solo uso. ` +
    `Este enlace no abre sesión por sí mismo, así que a quien se lo reenvíes no le sirve de nada.</p>` +
    (d.caducaEn
      ? `<p style="color:#666;font-size:13px">Si no lo confirmas, el acceso se cierra solo el ${fechaEs(d.caducaEn)}.</p>`
      : '') +
    `<p style="color:#666;font-size:13px">Si no esperabas esto, no hagas nada: sin que tú lo confirmes ` +
    `no se te comparte nada.` +
    (contacto ? ` Si prefieres decírnoslo, escribe a ${esc(contacto)}.` : '') +
    `</p></div>`

  return { asunto, texto, html }
}

/**
 * Manda el correo. `true` = el proveedor lo aceptó.
 *
 * Un `false` NO significa que la autorización no exista: la fila ya estaba
 * escrita mucho antes de llamar aquí. Por eso quien llama contesta
 * `error_envio` y no «no se ha autorizado» — decir lo segundo llevaría a
 * reintentar la anotación, que ya está hecha.
 */
export async function enviarAvisoAcceso(destino: string, d: DatosAvisoAcceso): Promise<boolean> {
  // El transporte se carga AQUÍ, no arriba, por lo mismo que en el correo de
  // invitación del portal: el cepo de `cuerpoAvisoAcceso()` corre con
  // `node --test`, que no sabe resolver `@central/core-email` (su `main`
  // importa sin extensión). Con el import arriba, el cepo no podría cargar este
  // módulo y el texto habría que probarlo leyendo la fuente — o sea, no probarlo.
  const { createMailTransporter } = await import('@central/core-email')
  const transporter = createMailTransporter()
  if (!transporter) {
    console.error('[asegura/aviso-acceso] no hay proveedor de correo configurado')
    return false
  }
  const from = process.env.ASEGURA_MAIL_FROM
  if (!from) {
    console.error('[asegura/aviso-acceso] falta ASEGURA_MAIL_FROM: no se avisa')
    return false
  }
  const replyTo = process.env.ASEGURA_MAIL_REPLY_TO?.trim() || undefined

  const { asunto, texto, html } = cuerpoAvisoAcceso(d)
  try {
    await transporter.sendMail({ from, to: destino, ...(replyTo ? { replyTo } : {}), subject: asunto, text: texto, html })
    return true
  } catch (e) {
    // El motivo, nunca el destino: un log es donde un dato personal sobrevive más tiempo.
    console.error('[asegura/aviso-acceso] fallo enviando el aviso:', e instanceof Error ? e.message : e)
    return false
  }
}
