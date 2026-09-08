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
import { nombreDePila } from './nombre-de-pila.ts'

/**
 * Cómo se presenta. Sale de `MEDIADOR` y no de un literal: el nombre comercial
 * está protegido en un solo sitio (`test/regression-nombre-comercial-asegura`)
 * y escribirlo a mano aquí sería la segunda copia que se queda atrás.
 */
const FIRMA = `${MEDIADOR.identidad.nombre.split(' ').slice(0, 2).join(' ')}, de ${MEDIADOR.marca}`

/**
 * El mensaje ya escrito para abrir WhatsApp con un lead: quién eres, dónde
 * verte, y para qué estás.
 *
 * ── 🚨 Lleva la WEB, y NO el portal ────────────────────────────────────────
 *
 * Son dos sitios distintos y solo uno tiene algo que enseñarle:
 *
 *   · `MEDIADOR.identidad.web` (`apps/asegura-web`) es público y está hecho
 *     justo para quien todavía no es cliente. Ahí puede mirar quién eres sin
 *     hablar con nadie, que es lo que hace la gente antes de contestar.
 *   · El portal enseña TUS pólizas, y él no tiene ninguna: entraría a una
 *     bóveda vacía. Por eso tampoco se le nombra un correo «para acceder» —
 *     nombrar una llave de una puerta que no lleva a ningún sitio es peor que
 *     no dar ninguna.
 *
 * Una URL suelta en un primer mensaje a un desconocido se lee como spam; la
 * web de la persona que le acaba de escribir, no. La diferencia es que este
 * mensaje lo manda Alberto a mano, uno a uno, no un cron a una lista.
 *
 * 🚨 No promete precio (sería asesoramiento) y no dice «tus pólizas»: con la
 * correduría no tiene ninguna, y escribirlo sería hablarle como a un cliente
 * que no es.
 */
export function mensajePresentacionWhatsapp(nombre: string): string {
  const pila = nombreDePila(nombre)
  return [
    pila ? `Hola ${pila}, soy ${FIRMA}, corredor de seguros.` : `Hola, soy ${FIRMA}, corredor de seguros.`,
    '',
    'Encantado. Te dejo mi contacto por aquí para lo que necesites de tus seguros: una duda, un parte, o echar un ojo a una póliza que tengas contratada con otro.',
    '',
    `Aquí puedes ver quiénes somos y con qué compañías trabajamos: ${MEDIADOR.identidad.web}`,
    '',
    'Cuando quieras, me escribes.',
  ].join('\n')
}
