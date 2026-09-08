// El mensaje que Alberto abre YA ESCRITO al pulsar el icono de WhatsApp de una
// ficha, para no teclear lo mismo ochenta veces.
//
// Petición de Alberto (08/09/2026): «crea un botón de invitación… que yo pulse
// y le diga los mensajes así de bienvenida, diciéndole qué correo es el que
// tiene acceso… si esa persona, en vez de cliente es lead, se le envía otro
// tipo de mensaje».
//
// ── 🚨 POR QUÉ EL TEXTO VIVE AQUÍ Y NO EN EL COMPONENTE ────────────────────
//
// Porque es COPY DE LA CORREDURÍA, y en esta casa el copy de la correduría pasa
// por `copy-regulado.ts` (RDL 3/2020: prometer un precio o un ahorro convierte
// la comunicación en asesoramiento, que arrastra análisis objetivo e IPID). Un
// literal escrito dentro de un `.tsx` no lo mira nadie: el guardián de este
// módulo pasa CADA mensaje por `revisarCopy()`, así que el cepo se dispara al
// escribirlo, no cuando ya se ha mandado por WhatsApp — donde, como en redes,
// lo enviado no se corrige.
//
// ── 🚨 EL MENSAJE NO LLEVA NUNCA EL ENLACE DEL PORTAL ──────────────────────
//
// Solo el CORREO al que va la invitación. El enlace viaja por email a propósito
// (ver `invitacion.ts` de `@central/module-seguros-portal`): la identidad se
// prueba con un código de un solo uso que llega al buzón del invitado, y ese es
// justo el mecanismo que se rompería mandando el token por un canal reenviable.
// Un chat de WhatsApp se reenvía con dos toques.
//
// Así que el reparto es: **WhatsApp avisa, el correo abre.** Y de paso tapa el
// fallo real de que la invitación se le vaya a spam y el cliente no se entere.
//
// ── 🚨 «TE VOY A MANDAR», NO «TE HE MANDADO» ───────────────────────────────
//
// El botón de WhatsApp NO dispara la invitación: son dos acciones distintas y
// Alberto puede pulsar esta antes, después o sin la otra. Un mensaje que afirma
// «te he mandado un correo» sería falso justo la mitad de las veces, y el
// cliente se quedaría mirando una bandeja vacía. El futuro es verdad en los dos
// órdenes.
import { revisarCopy } from './copy-regulado.ts'
import { MEDIADOR } from './mediador.ts'

/** A quién se le escribe, y con qué se le puede escribir. */
export type DestinatarioWhatsapp = {
  /**
   * Si tiene pólizas vivas con la correduría. Se decide FUERA (la ficha ya lo
   * deriva de los hechos, no del enum `tipo`: CIMA engancha pólizas por DNI a
   * fichas que siguen marcadas como `lead`).
   */
  esCliente: boolean
  /** Cómo se le llama en el saludo. Se recorta al nombre de pila. */
  nombre: string
  /**
   * El correo al que le llegaría la invitación al portal.
   *
   * 🚨 `null` NO es «no tiene correo, da igual»: cambia el mensaje entero. Sin
   * correo no hay portal que ofrecer, así que en vez de prometer un acceso que
   * no puede llegar a ninguna parte, el mensaje se lo PIDE. Prometer el envío y
   * no poder hacerlo es el modo de fallo que deja al cliente esperando.
   */
  email: string | null
}

/**
 * Cómo se presenta. Sale de `MEDIADOR` y no de un literal: el nombre comercial
 * está protegido en un solo sitio (`test/regression-nombre-comercial-asegura`)
 * y escribirlo a mano aquí sería la segunda copia que se queda atrás.
 */
const FIRMA = `${MEDIADOR.identidad.nombre.split(' ').slice(0, 2).join(' ')}, de ${MEDIADOR.marca}`

/**
 * El nombre de pila, para que el saludo no diga «Hola Jose Antonio Suárez
 * Gutiérrez». Si viene vacío, no se saluda por el nombre: un «Hola ,» delata
 * la plantilla más que no saludar.
 */
export function nombreDePila(nombre: string): string | null {
  const limpio = nombre.trim().replace(/\s+/g, ' ')
  if (!limpio) return null
  // Una razón social («GLOBAL 2 SL») no tiene nombre de pila y cortarla por el
  // primer espacio produce «Hola GLOBAL». Se saluda entera.
  const primera = limpio.split(' ')[0]!
  return primera.length >= 3 ? primera : limpio
}

/** El saludo, con o sin nombre. */
function saludo(nombre: string): string {
  const pila = nombreDePila(nombre)
  return pila ? `Hola ${pila}, soy ${FIRMA}` : `Hola, soy ${FIRMA}`
}

/**
 * El mensaje ya escrito para abrir WhatsApp con esta persona.
 *
 * Tres textos, no dos, porque hay tres situaciones que se arreglan de forma
 * distinta: el cliente al que se le puede dar el portal, el cliente al que hay
 * que pedirle antes un correo, y el que todavía no es cliente.
 */
export function mensajeWhatsapp(d: DestinatarioWhatsapp): string {
  const hola = saludo(d.nombre)

  // Todavía no es cliente: no hay pólizas que enseñarle, así que NO se le
  // ofrece el portal — entraría a una bóveda vacía, que es peor que no entrar
  // (misma razón que `portal-cliente-asegura.ts`). Se le ofrece la persona.
  if (!d.esCliente) {
    return [
      `${hola}, corredor de seguros.`,
      '',
      'Encantado. Te dejo mi contacto por aquí para lo que necesites de tus seguros: una duda, un parte, o echar un ojo a una póliza que tengas contratada con otro.',
      '',
      'Cuando quieras, me escribes.',
    ].join('\n')
  }

  // Cliente sin correo en la ficha: el portal existe pero no hay por dónde
  // mandarle la llave. Se le pide, que es la acción que desatasca.
  if (!d.email) {
    return [
      `${hola}.`,
      '',
      'Quiero darte acceso a tu área de clientes, donde tienes tus pólizas y tus recibos siempre a mano.',
      '',
      '¿Me pasas un correo electrónico y te mando el enlace para entrar?',
    ].join('\n')
  }

  return [
    `${hola}.`,
    '',
    'Te voy a dar acceso a tu área de clientes: ahí tienes tus pólizas y tus recibos siempre a mano.',
    '',
    `Te llega un correo a ${d.email} con el enlace para entrar. Si no lo ves, echa un vistazo a la carpeta de spam.`,
    '',
    'Cualquier cosa, me escribes por aquí.',
  ].join('\n')
}
