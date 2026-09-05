/**
 * «Ya puedes ver tus seguros»: el correo con el que la correduría invita a un
 * CLIENTE a entrar por primera vez en el portal.
 *
 * ── Por qué existe (05/09/2026) ─────────────────────────────────────────────
 *
 * Alberto: «no aparece el enviar invitación a la intranet». Y no aparecía
 * porque no existía. El portal (`apps/asegura-portal`) lleva desde el 01/09
 * funcionando, pero **la única forma de entrar era que el cliente supiera por su
 * cuenta que existe** y fuera a pedir un código: no había ni un botón en la
 * ficha, ni un correo, ni nada que se lo contara. Un portal del que el cliente
 * no sabe nada es, desde su lado, un portal que no existe — y desde el nuestro
 * se ve idéntico a uno que nadie usa porque no le interesa.
 *
 * Es el hermano del correo de `correo-aviso-acceso.ts`, un escalón antes: aquel
 * avisa a un TERCERO de que alguien le ha dado acceso a la cartera de otro; este
 * le dice a un cliente que la SUYA está ahí.
 *
 * ── 🚨 Este correo NO lleva token, y eso es lo que lo hace seguro ───────────
 *
 * El enlace va a la portada del portal y **no abre nada por sí mismo**. Quien lo
 * reciba tendrá que pedir un código de un solo uso a esa misma dirección, así
 * que reenviarlo no regala acceso a nadie. Meter aquí un token de sesión
 * convertiría un correo —que se reenvía, se cita y sobrevive en buzones
 * compartidos— en una llave de la cartera.
 *
 * ── 🚨 Y por eso tampoco puede contar NADA de la cartera ────────────────────
 *
 * La dirección la ha tecleado Alberto y puede ser un buzón compartido
 * (`administracion@…`) o tener una letra mal. Así que el cuerpo dice que hay un
 * portal y cómo entrar, y **nada más**: ni compañía, ni número de póliza, ni
 * matrícula, ni prima, ni DNI, ni cuántas pólizas tiene. Todo eso se enseña
 * DENTRO, cuando la persona ha probado que es ella. Lo vigila el cepo de
 * `correo-invitacion-portal.test.ts` con la MISMA lista que el resto de correos
 * del portal (`CAMPOS_PROHIBIDOS_EN_INVITACION`), para que la del panel del
 * corredor no se relaje por su cuenta.
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
 * A dónde manda el correo: la PORTADA del portal, que es donde se pide el
 * código. `null` = no hay portal utilizable y entonces **no se envía** — un
 * correo que dice «entra aquí» sin el «aquí» no sirve de nada, y adivinar un
 * dominio manda a la persona a ningún sitio.
 *
 * Misma variable y mismo valor por defecto que `enlaceDeAutorizaciones`: el
 * portal sirve HOY en `asegura-portal.vercel.app`, y cuando
 * `clientes.grupoasegura.es` esté repuntado a Vercel se cambia la variable y
 * esto no se toca.
 */
export function enlacePortal(
  base: string | undefined = process.env.ASEGURA_PORTAL_URL ?? 'https://asegura-portal.vercel.app',
): string | null {
  const limpio = base?.trim()
  if (!limpio) return null
  let url: URL
  try {
    url = new URL(limpio)
  } catch {
    console.error('[asegura/invitacion-portal] ASEGURA_PORTAL_URL no es una URL válida: no se invita')
    return null
  }
  // Solo https: el correo lleva a una pantalla donde se teclea un código de acceso.
  if (url.protocol !== 'https:') {
    console.error('[asegura/invitacion-portal] ASEGURA_PORTAL_URL no es https: no se invita')
    return null
  }
  url.pathname = '/'
  return url.toString()
}

export type DatosInvitacionPortal = {
  /**
   * Nombre del cliente al que se escribe. `null` = **no se sabe** (la ficha no
   * tiene uno legible), nunca `''` ni «Estimado cliente»: el texto arranca sin
   * nombre en vez de inventarse uno.
   */
  nombre: string | null
  enlace: string
  /**
   * `true` = esa ficha ya tiene a alguien entrando al portal, y esto es un
   * reenvío del enlace a quien lo ha perdido. Cambia el texto: prometerle a
   * alguien que «ya puede entrar por primera vez» cuando entró ayer es una
   * frase que le hace dudar de si le han abierto una cuenta nueva.
   */
  yaEntraba: boolean
}

export type CuerpoInvitacion = { asunto: string; texto: string; html: string }

/**
 * El cuerpo, PURO: sin red, sin BD y sin más `process.env` que el buzón de
 * respuesta. Separado del envío para que su cepo pueda recorrer el texto entero
 * — un guardián que necesitara un servidor SMTP para correr no lo correría nadie.
 */
export function cuerpoInvitacionPortal(d: DatosInvitacionPortal): CuerpoInvitacion {
  const nombre = unaLinea(d.nombre ?? '')
  const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:'
  const contacto = process.env.ASEGURA_MAIL_REPLY_TO?.trim() || null

  const asunto = d.yaEntraba
    ? 'Tu enlace de Mis Seguros, el portal de Grupo ASegura'
    : 'Ya puedes consultar tus seguros por internet'

  const lineas = [
    saludo,
    '',
    d.yaEntraba
      ? 'Aquí tienes otra vez el enlace de Mis Seguros, el portal de Grupo ASegura, por si lo habías perdido:'
      : 'Desde ahora puedes consultar tus seguros por internet en Mis Seguros, el portal de Grupo ASegura:',
    d.enlace,
    '',
    'Entras con ESTE mismo correo: el portal te manda un código de un solo uso y listo. ' +
      'No hay contraseña que recordar.',
    '',
    'Este enlace no abre sesión por sí mismo, así que a quien se lo reenvíes no le sirve de nada.',
    '',
    'Si prefieres seguir como hasta ahora, no hagas nada: no cambia nada de tus pólizas.' +
      (contacto ? ` Y si tienes cualquier duda, escríbenos a ${contacto}.` : ''),
  ]
  const texto = lineas.join('\n')

  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;line-height:1.5">` +
    `<p>${esc(saludo)}</p>` +
    `<p>${
      d.yaEntraba
        ? `Aquí tienes otra vez el enlace de <strong>Mis Seguros</strong>, el portal de Grupo ASegura, por si lo habías perdido.`
        : `Desde ahora puedes consultar tus seguros por internet en <strong>Mis Seguros</strong>, el portal de Grupo ASegura.`
    }</p>` +
    `<p><a href="${esc(d.enlace)}" style="display:inline-block;padding:12px 20px;background:#0b5;` +
    `color:#fff;text-decoration:none;border-radius:8px">Entrar en Mis Seguros</a></p>` +
    `<p style="color:#666;font-size:13px">Entras con ESTE mismo correo: el portal te manda un código de ` +
    `un solo uso y listo. No hay contraseña que recordar.</p>` +
    `<p style="color:#666;font-size:13px">Este enlace no abre sesión por sí mismo, así que a quien se lo ` +
    `reenvíes no le sirve de nada.</p>` +
    `<p style="color:#666;font-size:13px">Si prefieres seguir como hasta ahora, no hagas nada: no cambia ` +
    `nada de tus pólizas.` +
    (contacto ? ` Y si tienes cualquier duda, escríbenos a ${esc(contacto)}.` : '') +
    `</p></div>`

  return { asunto, texto, html }
}

/**
 * Manda el correo. `true` = el proveedor lo aceptó.
 *
 * Un `false` NO significa que el cliente no pueda entrar al portal: puede
 * hacerlo igual desde la portada con su correo. Lo único que ha fallado es
 * contárselo, y por eso quien llama contesta `error_envio` — que es lo que se
 * reintenta— y no «no tiene acceso».
 */
export async function enviarInvitacionPortal(destino: string, d: DatosInvitacionPortal): Promise<boolean> {
  // El transporte se carga AQUÍ, no arriba, por lo mismo que en el aviso de
  // acceso: el cepo de `cuerpoInvitacionPortal()` corre con `node --test`, que
  // no sabe resolver `@central/core-email` (su `main` importa sin extensión).
  // Con el import arriba, el cepo no podría cargar este módulo y el texto habría
  // que probarlo leyendo la fuente — o sea, no probarlo.
  const { createMailTransporter } = await import('@central/core-email')
  const transporter = createMailTransporter()
  if (!transporter) {
    console.error('[asegura/invitacion-portal] no hay proveedor de correo configurado')
    return false
  }
  const from = process.env.ASEGURA_MAIL_FROM
  if (!from) {
    console.error('[asegura/invitacion-portal] falta ASEGURA_MAIL_FROM: no se invita')
    return false
  }
  const replyTo = process.env.ASEGURA_MAIL_REPLY_TO?.trim() || undefined

  const { asunto, texto, html } = cuerpoInvitacionPortal(d)
  try {
    await transporter.sendMail({ from, to: destino, ...(replyTo ? { replyTo } : {}), subject: asunto, text: texto, html })
    return true
  } catch (e) {
    // El motivo, nunca el destino: un log es donde un dato personal sobrevive más tiempo.
    console.error('[asegura/invitacion-portal] fallo enviando la invitación:', e instanceof Error ? e.message : e)
    return false
  }
}
