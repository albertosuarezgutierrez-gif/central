/**
 * Invitar al portal **por WhatsApp**, con el mismo mensaje que va por correo.
 *
 * ── Lo que pidió Alberto (08/09/2026) ───────────────────────────────────────
 * «Como tenemos el tema de WhatsApp ya desarrollado, poner al lado el botón de
 * WhatsApp: le doy y ese mismo mensaje se le envía al cliente, que tenemos el
 * teléfono, se le confirma qué correo es el que tiene asignado para acceder y
 * el enlace.»
 *
 * ── 🚨 Esto NO envía nada, y la pantalla tiene que decirlo ──────────────────
 * No hay WhatsApp Business API en la casa todavía. Lo único que existe es
 * `wa.me`, que **abre WhatsApp con el mensaje escrito** y espera a que Alberto
 * le dé a enviar. O sea: el botón de correo sale del servidor y se sabe si el
 * proveedor lo aceptó; este no sale de ningún sitio y **no hay forma de saber
 * si se mandó**. Por eso su rótulo no dice «enviar» sino «abrir WhatsApp», y
 * por eso —a diferencia del correo— no se anota nada en el historial: anotar
 * «se le invitó por WhatsApp» sobre un clic que solo abrió una ventana es la
 * afirmación falsa de siempre, y encima en el sitio donde más dura.
 *
 * ── 🚨 Y por qué el correo que se nombra NO se elige aquí ───────────────────
 * El mensaje le dice al cliente CON QUÉ dirección entra, y el portal solo le
 * mandará el código a la que reconozca. Una ficha puede tener dos correos, así
 * que «coge el primero de la lista» es una segunda regla de elección conviviendo
 * con la de asegura (`estadoEmailDeFicha`): el día que se separen, el cliente
 * teclearía la dirección que le dijimos y no recibiría nada, sin ningún error
 * por ninguna parte. La dirección la manda el puerto (`portal.emailInvitacion`)
 * y si viene `null` **no se ofrece el canal**: no se nombra un correo a ojo.
 *
 * Mismo criterio con el enlace, que llega del puerto (`ASEGURA_PORTAL_URL` de
 * asegura) en vez de escribirse aquí.
 *
 * Módulo PURO: sin red, sin env y sin BD. El veredicto de «esto es un móvil» lo
 * sigue dando `urlWhatsapp()` de `lib/telefono-wa.ts`, que es la fuente única
 * del repo; aquí no se vuelve a normalizar ningún número.
 */
import { urlWhatsapp } from './telefono-wa.ts'
import type { AccionPortal, PortalCartera } from './portal-cliente-asegura.ts'

/** Quita saltos de línea de lo que se mete dentro del mensaje. */
function unaLinea(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim()
}

/**
 * El primer teléfono de la ficha que se pueda afirmar que es un móvil, en el
 * orden en que se le pasen (el principal primero). `null` = ninguno lo es, que
 * **no** significa «no tiene teléfono»: significa que no se puede prometer
 * WhatsApp sobre él. Un fijo abre el chat igualmente y el «este número no está
 * en WhatsApp» solo se ve DESPUÉS de pulsar.
 */
export function movilParaInvitar(telefonos: readonly (string | null | undefined)[]): string | null {
  for (const t of telefonos) {
    const tel = (t ?? '').trim()
    if (tel !== '' && urlWhatsapp(tel) !== null) return tel
  }
  return null
}

export type DatosMensajeWhatsapp = {
  /** Nombre del cliente. `null` = no hay uno legible: se saluda sin nombre, no se inventa. */
  nombre: string | null
  /** La dirección EXACTA con la que entra, tal y como la manda asegura. */
  email: string
  enlace: string
  /** `true` = ya entraba y esto es recordarle dónde está, no abrirle nada nuevo. */
  yaEntraba: boolean
}

/**
 * El texto que se le manda. Es el hermano de `cuerpoInvitacionPortal` de
 * asegura y dice lo mismo, con una diferencia deliberada: **aquí sí se nombra
 * la dirección**. Por correo no hace falta (le llega a esa misma dirección);
 * por WhatsApp es justo el dato que falta para poder entrar.
 *
 * 🚨 Y nada más que eso. Ni compañía, ni póliza, ni matrícula, ni prima, ni
 * DNI, ni cuántos seguros tiene: el número lo ha tecleado Alberto y puede ser
 * el de un familiar o tener un dígito cambiado. Todo lo demás se enseña DENTRO,
 * cuando la persona ha probado que es ella. Es la misma lista de campos
 * prohibidos que vigila el cepo del correo, y aquí la sostiene el hecho de que
 * esta función solo reciba tres datos.
 */
export function mensajeInvitacionWhatsapp(d: DatosMensajeWhatsapp): string {
  const nombre = unaLinea(d.nombre ?? '')
  const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:'
  return [
    saludo,
    '',
    d.yaEntraba
      ? 'Te reenvío el enlace de Mis Seguros, el portal de Grupo ASegura, por si lo habías perdido:'
      : 'Ya puedes consultar tus seguros por internet en Mis Seguros, el portal de Grupo ASegura:',
    d.enlace,
    '',
    `Entras con tu correo ${unaLinea(d.email)}: el portal te manda ahí un código de un solo uso y listo. ` +
      'No hay contraseña que recordar.',
    '',
    'Un saludo, Grupo ASegura.',
  ].join('\n')
}

/** El `wa.me` con el mensaje ya escrito, o `null` si ese número no es un móvil. */
export function enlaceWhatsappConMensaje(telefono: string, texto: string): string | null {
  const base = urlWhatsapp(telefono)
  if (base === null) return null
  return `${base}?text=${encodeURIComponent(texto)}`
}

/**
 * Qué se puede ofrecer hoy por WhatsApp. Los cinco desenlaces están separados
 * por la misma razón que los siete del portal: cada uno se arregla en un sitio
 * distinto, y «no se puede» a secas dejaría a Alberto sin saber si le falta el
 * móvil, si el problema es el correo o si es que a este cliente no hay que
 * invitarle todavía.
 */
export type CanalWhatsapp =
  /** Hay móvil, correo que nombrar y enlace: el botón abre WhatsApp escrito. */
  | { estado: 'listo'; url: string; texto: string; telefono: string }
  /**
   * No se ofrece nada porque tampoco se ofrece por correo (`ambiguo`,
   * `resuelve_a_otra`, `sin_email`…). 🚨 Este es el desenlace importante: el
   * canal nuevo **no puede ser un atajo alrededor de los frenos del viejo**.
   * Mandarle el enlace por WhatsApp a alguien cuyo correo lleva a otra ficha
   * produce exactamente la bóveda vacía que el correo se negaba a producir.
   */
  | { estado: 'no_procede'; nota: null }
  | { estado: 'sin_movil'; nota: string }
  | { estado: 'sin_correo_que_nombrar'; nota: string }
  | { estado: 'sin_enlace'; nota: string }

export function canalWhatsapp(
  { accion, portal, enlace, telefonos, nombre }: {
    accion: AccionPortal
    portal: PortalCartera
    enlace: string | null
    telefonos: readonly (string | null | undefined)[]
    nombre: string | null
  },
): CanalWhatsapp {
  if (accion === 'ninguna') return { estado: 'no_procede', nota: null }

  if (portal.emailInvitacion === null) {
    return {
      estado: 'sin_correo_que_nombrar',
      nota:
        'Por WhatsApp haría falta decirle con qué correo entra, y asegura no ha podido confirmar cuál es. ' +
        'No se nombra uno a ojo: si no es el que el portal reconoce, teclearía su dirección y no recibiría ningún código.',
    }
  }
  if (enlace === null) {
    return {
      estado: 'sin_enlace',
      nota: 'No hay una dirección de portal configurada (ASEGURA_PORTAL_URL), así que el mensaje no tendría a dónde llevar.',
    }
  }

  const telefono = movilParaInvitar(telefonos)
  if (telefono === null) {
    return {
      estado: 'sin_movil',
      nota:
        'No consta un móvil en esta ficha, así que no se ofrece WhatsApp. Un fijo abre el chat igual y el ' +
        '«este número no está en WhatsApp» solo se ve después de pulsar.',
    }
  }

  const texto = mensajeInvitacionWhatsapp({
    nombre,
    email: portal.emailInvitacion,
    enlace,
    yaEntraba: portal.estado === 'ya_entra',
  })
  const url = enlaceWhatsappConMensaje(telefono, texto)
  // `movilParaInvitar` ya lo ha juzgado con la misma función, así que esto no
  // debería ocurrir; si ocurriera, no se pinta un botón roto.
  if (url === null) return { estado: 'sin_movil', nota: 'No se ha podido componer el enlace de WhatsApp con ese número.' }
  return { estado: 'listo', url, texto, telefono }
}
