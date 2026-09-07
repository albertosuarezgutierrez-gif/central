// El correo de «te invito a ver mis seguros»: el enlace, el cuerpo y el envío.
//
// Las REGLAS no están aquí: están en el módulo puro
// (`@central/module-seguros-portal/invitacion`). Lee su cabecera antes de tocar
// una línea de esto — sobre todo el apartado «LO QUE EL CORREO NO PUEDE DECIR»,
// que es lo que este fichero implementa.
//
// ── 🚨 QUIEN RECIBE ESTO TODAVÍA ES UN DESCONOCIDO ─────────────────────────
//
// José escribe una dirección a mano. Puede equivocarse de letra, y puede
// escribir un buzón compartido (`administracion@…`, el correo de una empresa,
// el móvil de la familia). Así que en el instante en que sale este correo NO
// hay ninguna prueba de que al otro lado esté la persona que José tiene en la
// cabeza — y todo lo que se cuente aquí se lo cuenta a quien sea que abra ese
// buzón, sin consentimiento de nadie.
//
// De ahí que el cuerpo diga **quién invita y nada más**: ni qué se asegura, ni
// con quién, ni cuánto cuesta, ni ningún identificador. El día que alguien
// quiera «que se entienda mejor» y añada un dato, `CAMPOS_PROHIBIDOS_EN_INVITACION`
// y su test (`lib/invitaciones.test.ts`) lo paran.
//
// 📌 Por la misma razón el texto no distingue si se invita a UNA póliza o a
// todas: eso ya es información sobre la cartera de José. Se enseña dentro, en
// la pantalla de aceptar, cuando la persona ya ha probado que es ella.
//
// ⚠️ Y este es el ÚNICO correo que el portal sabe mandar además del código de
// acceso, y funciona por la misma razón: la dirección viaja **en claro dentro
// de la petición** (la acaba de escribir quien invita). De la BD no se puede
// sacar ninguna —`portal_invitacion` guarda solo el hash—, así que reenviar
// esto más tarde, desde un cron, es imposible a propósito.
import { remitenteCorreo } from '@central/module-seguros'
import { DIAS_VIGENCIA_INVITACION } from '@central/module-seguros-portal'

/** Escapa lo que va dentro del HTML. `mensaje` lo escribe una persona. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Quita saltos de línea de lo que va a una CABECERA (el asunto).
 *
 * El nombre sale de la cartera, no de un formulario, pero una cabecera es una
 * cabecera: un `\r\n` dentro del asunto parte el mensaje y deja añadir un `Bcc:`.
 * Cuesta una línea y cierra la clase entera de fallo.
 */
function unaLinea(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim()
}

/**
 * El enlace del correo. `null` = no hay dominio configurado, y entonces la
 * invitación **no se escribe siquiera** (lo decide `lib/invitaciones.ts`).
 *
 * 🚨 Aquí el enlace NO es una comodidad como en el correo del código —donde el
 * código abre igual la puerta y el enlace solo pre-rellena la pantalla—: aquí
 * **el enlace ES el mecanismo**. Sin él, quien recibe el correo no tiene forma
 * de llegar a la invitación, y la fila se queda ocupando el sitio del índice
 * único sin que nadie pueda aceptarla nunca. Por eso no se inventa un dominio.
 *
 * Solo https: el token viaja en la ruta, y por http lo lee la red entera.
 */
export function enlaceDeInvitacion(token: string): string | null {
  const base = process.env.PORTAL_PUBLIC_URL?.trim()
  if (!base) return null

  let url: URL
  try {
    url = new URL(base)
  } catch {
    // Del error sale el motivo; jamás el token, que es la llave.
    console.error('[portal/invitacion] PORTAL_PUBLIC_URL no es una URL válida: no se puede invitar')
    return null
  }
  if (url.protocol !== 'https:') {
    console.error('[portal/invitacion] PORTAL_PUBLIC_URL no es https: no se puede invitar')
    return null
  }

  url.pathname = `/invitacion/${token}`
  return url.toString()
}

export type DatosCorreoInvitacion = {
  /**
   * Nombre de la ficha que invita. `null` = **no se sabe el nombre** (la ficha
   * no tiene uno legible), nunca `''` ni «Desconocido». El texto lo dice como
   * lo que es, sin fingir que conoce a nadie.
   */
  invitante: string | null
  /** Lo que escribió quien invita, ya recortado por el módulo puro. */
  mensaje: string | null
  enlace: string
}

export type CuerpoCorreo = { asunto: string; texto: string; html: string }

/**
 * El cuerpo del correo, PURO: sin red, sin BD y sin `process.env` más allá del
 * buzón de respuesta. Está separado del envío para que su test pueda recorrer
 * el texto entero buscando lo que no puede aparecer — un cepo que necesitara un
 * servidor SMTP para correr no lo correría nadie.
 */
export function cuerpoInvitacion(d: DatosCorreoInvitacion): CuerpoCorreo {
  // La ficha existe (se acaba de leer de la cartera), lo que falta es un nombre
  // que enseñar. Decir «un cliente de Grupo ASegura» es cierto; inventarle un
  // nombre o dejar el hueco en blanco, no.
  const quien = unaLinea(d.invitante ?? '') || 'Un cliente de Grupo ASegura'

  // El buzón único de la correduría, para quien no conozca a esa persona. Si no
  // está configurado no se inventa una dirección: se le dice que no haga nada,
  // que es lo que de verdad protege (sin su aceptación no se comparte nada).
  const contacto = process.env.PORTAL_MAIL_REPLY_TO?.trim() || null

  const asunto = `${quien} te invita a ver sus seguros`

  const lineas = [
    'Hola:',
    '',
    `${quien} te ha invitado a consultar sus seguros en Mis Seguros, el portal de Grupo ASegura.`,
  ]
  // El texto de otra persona va entrecomillado y en su propio bloque: que se
  // vea que lo escribió quien invita y no nosotros.
  if (d.mensaje !== null) lineas.push('', 'Te escribe esto:', `«${d.mensaje}»`)
  lineas.push(
    '',
    'Para aceptar o rechazar, entra aquí:',
    d.enlace,
    '',
    'Entrarás con TU correo y un código de un solo uso. Este enlace no abre sesión por sí mismo, ' +
      'así que a quien se lo reenvíes no le sirve de nada.',
    '',
    `La invitación caduca en ${DIAS_VIGENCIA_INVITACION} días.`,
    '',
    'Si no conoces a esa persona, no hagas nada: sin que tú aceptes no se comparte nada contigo, ' +
      'y la invitación se caduca sola.' + (contacto ? ` Si prefieres decírnoslo, escribe a ${contacto}.` : ''),
  )
  const texto = lineas.join('\n')

  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;line-height:1.5">` +
    `<p>Hola:</p>` +
    `<p><strong>${esc(quien)}</strong> te ha invitado a consultar sus seguros en ` +
    `<strong>Mis Seguros</strong>, el portal de Grupo ASegura.</p>` +
    (d.mensaje !== null
      ? `<blockquote style="margin:16px 0;padding:8px 12px;border-left:3px solid #ddd;color:#444">` +
        `${esc(d.mensaje)}</blockquote>`
      : '') +
    `<p><a href="${esc(d.enlace)}" style="display:inline-block;padding:12px 20px;background:#0b5;` +
    `color:#fff;text-decoration:none;border-radius:8px">Ver la invitación</a></p>` +
    `<p style="color:#666;font-size:13px">Entrarás con TU correo y un código de un solo uso. ` +
    `Este enlace no abre sesión por sí mismo, así que a quien se lo reenvíes no le sirve de nada.</p>` +
    `<p style="color:#666;font-size:13px">La invitación caduca en ${DIAS_VIGENCIA_INVITACION} días. ` +
    `Si no conoces a esa persona, no hagas nada: sin que tú aceptes no se comparte nada contigo, ` +
    `y la invitación se caduca sola.` +
    (contacto ? ` Si prefieres decírnoslo, escribe a ${esc(contacto)}.` : '') +
    `</p></div>`

  return { asunto, texto, html }
}

/**
 * Manda el correo. `true` = el proveedor lo aceptó.
 *
 * 🚨 Un `false` NO es una excepción y **no significa que no haya invitación**:
 * la fila ya está escrita cuando esto se llama, y por eso quien llama contesta
 * `envio_fallido` (502) y no «no se ha invitado». Decir lo segundo sería mentir
 * dos veces: la invitación existe, y el segundo intento chocaría con el índice
 * único. Misma línea que separa `502 envio_fallido` de `503 canal_no_disponible`
 * en el acceso.
 */
export async function enviarInvitacion(destino: string, d: DatosCorreoInvitacion): Promise<boolean> {
  // 🚨 El transporte se carga AQUÍ, no arriba, y no es un capricho de
  // rendimiento: `cuerpoInvitacion()` tiene un cepo que recorre el texto entero
  // buscando lo que no puede decir (`lib/invitaciones.test.ts`), y ese cepo
  // corre con `node --test`, que no sabe resolver `@central/core-email` (su
  // `main` importa sin extensión). Con el import arriba, el cepo no podría
  // cargar este módulo y el texto habría que probarlo leyendo la fuente — o
  // sea, no probarlo. El transporte se pide cuando de verdad se va a enviar.
  const { createMailTransporter } = await import('@central/core-email')
  const transporter = createMailTransporter()
  if (!transporter) {
    console.error('[portal/invitacion] no hay proveedor de correo configurado')
    return false
  }

  const from = remitenteCorreo(process.env.PORTAL_MAIL_FROM)
  if (!from) {
    console.error('[portal/invitacion] falta PORTAL_MAIL_FROM: no se envía la invitación')
    return false
  }
  // Se manda desde el subdominio verificado y se responde al buzón único de la
  // correduría, igual que el correo del código (ver `lib/canal-email.ts`).
  const replyTo = process.env.PORTAL_MAIL_REPLY_TO?.trim() || undefined

  const { asunto, texto, html } = cuerpoInvitacion(d)

  try {
    await transporter.sendMail({
      from,
      to: destino,
      ...(replyTo ? { replyTo } : {}),
      subject: asunto,
      text: texto,
      html,
    })
    return true
  } catch (e) {
    // El motivo, nunca el destino ni el enlace: el enlace lleva el token dentro
    // y un log es el sitio donde una llave sobrevive más tiempo.
    console.error('[portal/invitacion] fallo enviando la invitación:', e instanceof Error ? e.message : e)
    return false
  }
}
