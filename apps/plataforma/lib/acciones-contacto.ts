/**
 * Los tres enlaces de «hablar con esta persona»: llamar, WhatsApp y escribir.
 *
 * Petición de Alberto (04/09/2026, sobre la captura del buscador): «al lado de
 * cada nombre cliente aparezca icono tlf para poder llamarlo, mail y whassap».
 *
 * 🚨 El veredicto de WhatsApp **NO se decide aquí**: se delega en
 * `urlWhatsapp()` de `lib/telefono-wa.ts`, que ya es la fuente única del repo y
 * está más probada (rechaza extensiones, letras y los `+34` que no son móvil, y
 * topa el E.164 en 15 dígitos). Este módulo solo compone los tres `href` para
 * que la UI no repita la misma normalización en cada pantalla. Dos criterios
 * distintos de «esto admite WhatsApp» conviviendo en la misma app es el fallo
 * silencioso de siempre: el icono aparecería en una pantalla y no en otra para
 * el mismo número.
 *
 * Lo que SÍ decide este módulo es el tercer estado, que `telefono-wa` no ve: un
 * contacto `ilegible` —cifrado que asegura no ha podido abrir— **no ofrece
 * nada**, porque el valor que tenemos delante no es su teléfono. Ofrecer un
 * `tel:` sobre una cadena base64 es prometer una acción que falla.
 */
import { urlWhatsapp } from './telefono-wa.ts'
import { enlaceWhatsappConMensaje } from './invitacion-whatsapp.ts'

export type AccionesContacto = {
  /** href de `tel:`, o null si no hay teléfono utilizable. */
  tel: string | null
  /** href de `mailto:`, o null. */
  email: string | null
  /** href de wa.me, o null si no se puede afirmar que el número sea un móvil. */
  whatsapp: string | null
  /** Por qué no se ofrece todo lo que se esperaría. Para el `title`. */
  nota: string | null
}

export function accionesContacto(
  { telefono, email, ilegible = false, mensaje }:
  {
    telefono?: string | null
    email?: string | null
    ilegible?: boolean
    /**
     * Texto con el que abrir WhatsApp ya escrito. Se propaga tal cual: este
     * módulo NO redacta nada (el copy de la correduría vive en
     * `@central/module-seguros`, donde pasa los cepos de `copy-regulado`).
     *
     * 🚨 Para INVITAR AL PORTAL no se pasa por aquí: ese mensaje lo compone
     * `canalWhatsapp()` de `lib/invitacion-whatsapp.ts`, que es quien sabe con
     * qué correo entra el cliente. Dos sitios redactando esa invitación son dos
     * reglas de elección del correo que un día se separan.
     */
    mensaje?: string | null
  },
): AccionesContacto {
  if (ilegible) {
    return { tel: null, email: null, whatsapp: null, nota: 'el contacto está cifrado y no se ha podido leer' }
  }

  const tel = (telefono ?? '').trim()
  const correo = (email ?? '').trim()
  const texto = (mensaje ?? '').trim()
  const whatsapp = tel
    ? (texto ? enlaceWhatsappConMensaje(tel, texto) : urlWhatsapp(tel))
    : null

  return {
    tel: tel ? `tel:${tel.replace(/\s/g, '')}` : null,
    email: correo ? `mailto:${correo}` : null,
    whatsapp,
    // Un teléfono sin WhatsApp no es un error: es un fijo, y decirlo evita que
    // el hueco se lea como «se ha caído el icono».
    nota: tel && whatsapp === null ? 'este número no consta como móvil: no se ofrece WhatsApp' : null,
  }
}
