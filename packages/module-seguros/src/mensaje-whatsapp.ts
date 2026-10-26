// El mensaje de PRESENTACIÓN que se abre en WhatsApp con quien todavía NO es
// cliente.
//
// Petición de Alberto (08/09/2026): «si esa persona, en vez de cliente es lead,
// se le envía otro tipo de mensaje» y, sobre la primera versión, «hay q vender
// la intranet para que entre y meta sus datos… es una herramienta gratis que no
// existe y así puede controlar todos sus seguros».
//
// ── 🚨 Este mensaje SÍ lleva el portal, y la versión anterior se equivocaba ──
//
// La primera redacción no lo nombraba «porque un lead entraría a una bóveda
// vacía». Se comprobó contra el código de `apps/asegura-portal` y era falso:
//
//   · Entrar no exige cartera: el código de un solo uso se manda a cualquier
//     correo (`app/api/acceso/solicitar`) y la vinculación con la cartera pasa
//     DESPUÉS del login y no lo bloquea (`lib/vinculo.ts`).
//   · La bóveda sin pólizas no es una lista muda: tiene su texto propio.
//   · **«Añade una póliza» se pinta sin ninguna condición**, y admite pólizas
//     de CUALQUIER compañía («da igual que no sea nuestra»), por PDF/foto o a
//     mano. Solo exige compañía O número.
//   · Su pantalla de entrada dice literalmente: «Todos tus seguros en un sitio.
//     Gratis, seas cliente o no.»
//
// O sea: la bóveda vacía no es un callejón, es el estado inicial de una
// herramienta que se llena sola en cuanto la usa. Lo que había aquí antes era
// una suposición sobre el producto, no el producto.
//
// ── 🚨 Lo que este mensaje NO puede prometer ────────────────────────────────
//
// Que se las gestionamos. El propio portal lo declara sobre una póliza que
// declara el usuario: «no la contratamos ni la gestionamos por ti». Es un
// cuaderno suyo con avisos de vencimiento, no un encargo de mediación —
// prometerlo por WhatsApp asumiría un deber que no existe, y encima sobre
// pólizas de otras compañías.
//
// ── Qué NO hace este módulo: invitar al portal a un CLIENTE ─────────────────
//
// Ese canal ya existe y vive en `lib/invitacion-whatsapp.ts` de
// `apps/plataforma` (PR #2604), que nombra el correo EXACTO con el que entra
// —el que manda asegura en `portal.emailInvitacion`, la misma regla que elige
// el destinatario del correo—. Escribir aquí una segunda invitación sería una
// segunda regla de elección del correo conviviendo con aquella: el día que se
// separen, el cliente teclearía la dirección que le dijimos y no recibiría
// ningún código, sin un solo error por ninguna parte.
//
// Por eso este mensaje **no nombra ningún correo**: no le dice con cuál entrar
// (no lo sabemos: la ficha de un lead puede tener otro, o ninguno), le dice que
// entra con el suyo. Es cierto para todo el mundo y no compite con aquella
// regla.
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
import { nombreRamoParaCliente, type RamoSolicitud } from './solicitud-datos.ts'

/**
 * Cómo se presenta. Sale de `MEDIADOR` y no de un literal: el nombre comercial
 * está protegido en un solo sitio (`test/regression-nombre-comercial-asegura`)
 * y escribirlo a mano aquí sería la segunda copia que se queda atrás.
 */
const FIRMA = `${MEDIADOR.identidad.nombre.split(' ').slice(0, 2).join(' ')}, de ${MEDIADOR.marca}`

/**
 * El mensaje ya escrito para abrir WhatsApp con un lead: quién eres, qué le
 * ofreces y dónde entra.
 *
 * ── Por qué UN solo enlace, y por qué es el portal ─────────────────────────
 *
 * La web pública (`MEDIADOR.identidad.web`) también sirve para presentarse,
 * pero en un mensaje corto dos URLs compiten y la persona no sabe cuál abrir.
 * El que se queda es el que tiene algo que HACER al otro lado; y quién somos
 * lo cuenta igual, porque el portal es de la casa y lo dice en su entrada.
 *
 * 🚨 Se le habla SIEMPRE de «tus seguros», nunca de «tus pólizas con
 * nosotros»: con la correduría no tiene ninguna, y ahí está justo la gracia de
 * la herramienta — vale para las que tiene con otros.
 */
export function mensajePresentacionWhatsapp(nombre: string): string {
  const pila = nombreDePila(nombre)
  return [
    pila ? `Hola ${pila}, soy ${FIRMA}, corredor de seguros.` : `Hola, soy ${FIRMA}, corredor de seguros.`,
    '',
    'Te escribo para dejarte una herramienta nuestra que es gratis y no te pide nada a cambio: una intranet donde tienes TODOS tus seguros en un sitio, sean de la compañía que sean.',
    '',
    'Subes la póliza (vale una foto) o la apuntas a mano, y con la fecha de vencimiento te avisamos antes de que se renueve sola. Son tus apuntes: los guardas tú, no hace falta que cambies nada ni que dejes de estar donde estás.',
    '',
    `Entras con tu correo, sin instalar nada: ${MEDIADOR.identidad.portal}`,
    '',
    'Y para cualquier duda de tus seguros, un parte o echar un ojo a una póliza que tengas contratada, me escribes por aquí.',
  ].join('\n')
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * El WhatsApp de SEGUIMIENTO a un lead de Vencimientos. Lo abre Alberto con un
 * clic y lo envía él desde su teléfono: nada sale solo.
 *
 * Texto dictado por Alberto el 30/09/2026 («Hola {nombre}, soy Alberto, de
 * GrupoASegura.es. Si no me equivoco, tu seguro de {coche} vence en
 * {noviembre}. ¿Te preparo un estudio sin compromiso?…»). Sustituye al del
 * 23/09 y al de Recaptación, que llevaba la web.
 *
 * 🚨 Tres cosas que no se negocian:
 *   · «Si no me equivoco»: la fecha del lead es ESTIMADA (aniversario de una
 *     póliza antigua), así que no se afirma.
 *   · No promete precio ni ahorro («te preparo un estudio», no «te lo bajo»):
 *     lo vigila `copy-regulado`.
 *   · Lleva la BAJA en el propio mensaje. WhatsApp es comunicación electrónica
 *     (LSSI art. 21) y cada envío comercial tiene que ofrecer una forma
 *     sencilla de no recibir más.
 *
 * «GrupoASegura.es» sale de `MEDIADOR` (marca sin espacios + el dominio de su
 * web), no de un literal: el nombre comercial está protegido en un solo sitio.
 * WhatsApp lo pinta como enlace; Alberto lo sabe y lo quiere así.
 */
export function mensajeRenovacionLeadWhatsapp(d: { nombre: string | null; ramo: string | null; mesAniversario: number | null }): string {
  const pila = nombreDePila(d.nombre)
  const ramo = ramoColoquial(d.ramo)
  const mes = d.mesAniversario !== null && d.mesAniversario >= 1 && d.mesAniversario <= 12 ? MESES[d.mesAniversario - 1] : null
  const seguro = ramo ? `tu seguro de ${ramo}` : 'tu seguro'
  const cuando = mes ? `vence en ${mes}` : 'vence pronto'
  return `${pila ? `Hola ${pila}` : 'Hola'}, soy ${NOMBRE_PILA_MEDIADOR}, de ${MARCA_WEB}. ` +
    `Si no me equivoco, ${seguro} ${cuando}. ¿Te preparo un estudio sin compromiso? ` +
    'Si no quieres que te escriba más, dímelo y no lo vuelvo a hacer. ¡Gracias!'
}

/** «Alberto»: el nombre de pila del mediador, sin apellidos. */
const NOMBRE_PILA_MEDIADOR = MEDIADOR.identidad.nombre.split(' ')[0]

/** «GrupoASegura.es»: la marca sin espacios y el dominio de primer nivel de su web. */
const MARCA_WEB = `${MEDIADOR.marca.replace(/\s+/g, '')}.${new URL(MEDIADOR.identidad.web).hostname.split('.').pop()}`

/**
 * El ramo como lo dice la gente: «tu seguro de coche», no «de auto». Un ramo que
 * no se sabe decir en corto devuelve `null` y el mensaje dice «tu seguro».
 */
const RAMO_COLOQUIAL: Record<string, string> = {
  auto: 'coche',
  moto: 'moto',
  hogar: 'casa',
  vida: 'vida',
  salud: 'salud',
  comercio: 'negocio',
  responsabilidad_civil: 'responsabilidad civil',
  decesos: 'decesos',
}

export function ramoColoquial(ramo: string | null): string | null {
  if (!ramo) return null
  return RAMO_COLOQUIAL[ramo.trim().toLowerCase().replace(/[\s-]+/g, '_')] ?? null
}

/** Cuántos datos como máximo se listan cuando no hay enlace: un WhatsApp no es un formulario. */
const MAX_DATOS_SIN_ENLACE = 8

/**
 * El WhatsApp para pedir a un lead o cliente lo necesario para tarificar (30/10/2026). Lo abre Alberto, lo revisa y lo
 * envía él: nada sale solo.
 *
 *   · Con `url` (el enlace al formulario `/datos` de esa oportunidad): lo manda y ya.
 *   · Sin `url` (no se pudo emitir, o ya había uno vivo cuyo token no se puede repetir): lista los datos mínimos del
 *     ramo, sacados del catálogo (`datosMinimosSolicitud`), nunca a mano.
 *   · En los dos, pide una foto de la póliza actual o del último recibo (compañía y vencimiento).
 *
 * 🚨 Sin datos del cliente (ni DNI, ni IBAN, ni nº de póliza): el mensaje se reenvía y puede acabar en cualquier chat.
 * No promete precio ni ahorro («revisar y comparar»): lo vigila `copy-regulado`.
 */
export function mensajeDatosTarificarWhatsapp(d: { nombre: string | null; ramo: RamoSolicitud; url: string | null; datosMinimos: readonly string[] }): string {
  const pila = nombreDePila(d.nombre)
  const lineas = [
    `${pila ? `Hola ${pila}` : 'Hola'}, soy ${NOMBRE_PILA_MEDIADOR}, de ${MARCA_WEB}.`,
    '',
    `Quiero revisar ${nombreRamoParaCliente(d.ramo)} y comparar opciones, sin compromiso.`,
  ]
  if (d.url) {
    lineas.push('', `Para eso necesito unos datos; te lleva dos minutos: ${d.url}`)
  } else {
    const datos = d.datosMinimos.slice(0, MAX_DATOS_SIN_ENLACE)
    if (datos.length > 0) {
      lineas.push('', 'Para eso necesito que me digas:', ...datos.map((x) => `- ${x}`))
      if (d.datosMinimos.length > datos.length) lineas.push('- y algún dato más, que te voy preguntando')
    }
  }
  lineas.push('', 'Y si puedes, mándame una foto de tu póliza actual o del último recibo: así veo con qué compañía estás y cuándo vence.', '', 'Si no quieres que te escriba más, dímelo y no lo vuelvo a hacer. ¡Gracias!')
  return lineas.join('\n')
}
