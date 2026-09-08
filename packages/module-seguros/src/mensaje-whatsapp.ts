// El mensaje de PRESENTACIÓN que se abre en WhatsApp con quien todavía NO es
// cliente.
//
// Petición de Alberto (08/09/2026): «si esa persona, en vez de cliente es lead,
// se le envía otro tipo de mensaje».
//
// ── 🚨 LO QUE ESTE MÓDULO **NO** HACE: invitar al portal ────────────────────
//
// Eso ya existe y vive en otro sitio: `lib/invitacion-whatsapp.ts` de
// `apps/plataforma` (PR #2604), que nombra el correo EXACTO con el que el
// cliente entra —el que manda asegura en `portal.emailInvitacion`, la misma
// regla que elige el destinatario del correo— y el enlace del portal.
//
// Escribir aquí un segundo mensaje de invitación sería una segunda regla de
// elección del correo conviviendo con aquella: el día que se separen, el
// cliente teclearía la dirección que le dijimos y no recibiría ningún código,
// sin un solo error por ninguna parte. Por eso este módulo se queda SOLO con el
// caso que aquel deja fuera a propósito.
//
// ── Por qué el lead queda fuera de aquel canal ──────────────────────────────
//
// Porque el portal enseña TUS pólizas y un lead no tiene ninguna: entraría a
// una bóveda vacía, que es peor que no entrar (mismo criterio que
// `portal-cliente-asegura.ts`). Su `canalWhatsapp` devuelve `no_procede` y no
// ofrece nada — correctamente. Lo que faltaba era tener algo que decirle.
//
// ── 🚨 Y por qué el texto vive en el módulo y no en el `.tsx` ───────────────
//
// Porque es COPY DE LA CORREDURÍA y en esta casa pasa por `copy-regulado.ts`
// (RDL 3/2020: prometer un precio o un ahorro convierte la comunicación en
// asesoramiento, que arrastra análisis objetivo e IPID). Un literal escrito
// dentro de un componente no lo mira ningún cepo, y lo enviado por WhatsApp
// —como lo publicado en redes— no se corrige con un commit.
import { MEDIADOR } from './mediador.ts'

/**
 * Cómo se presenta. Sale de `MEDIADOR` y no de un literal: el nombre comercial
 * está protegido en un solo sitio (`test/regression-nombre-comercial-asegura`)
 * y escribirlo a mano aquí sería la segunda copia que se queda atrás.
 */
const FIRMA = `${MEDIADOR.identidad.nombre.split(' ').slice(0, 2).join(' ')}, de ${MEDIADOR.marca}`

/**
 * El nombre de pila, para que el saludo no diga «Hola José Antonio Suárez
 * Gutiérrez». `null` si no hay ninguno legible: se saluda sin nombre, porque un
 * «Hola ,» delata la plantilla más que no saludar.
 */
export function nombreDePila(nombre: string): string | null {
  const limpio = nombre.trim().replace(/\s+/g, ' ')
  if (!limpio) return null
  // Una razón social («GLOBAL 2 SL») no tiene nombre de pila y cortarla por el
  // primer espacio produce «Hola GLOBAL». Se saluda entera.
  const primera = limpio.split(' ')[0]!
  return primera.length >= 3 ? primera : limpio
}

/**
 * El mensaje ya escrito para abrir WhatsApp con un lead: quién eres y para qué
 * estás, y nada más.
 *
 * 🚨 No ofrece el portal (no tiene pólizas que ver), no promete precio (sería
 * asesoramiento) y no dice «tus pólizas»: con la correduría no tiene ninguna, y
 * escribirlo sería hablarle como a un cliente que no es.
 */
export function mensajePresentacionWhatsapp(nombre: string): string {
  const pila = nombreDePila(nombre)
  return [
    pila ? `Hola ${pila}, soy ${FIRMA}, corredor de seguros.` : `Hola, soy ${FIRMA}, corredor de seguros.`,
    '',
    'Encantado. Te dejo mi contacto por aquí para lo que necesites de tus seguros: una duda, un parte, o echar un ojo a una póliza que tengas contratada con otro.',
    '',
    'Cuando quieras, me escribes.',
  ].join('\n')
}
