/**
 * Datos canónicos del MEDIADOR (Grupo ASegura) para todo lo que se le enseña al
 * cliente final: información precontractual del art. 173 del Real Decreto-ley
 * 3/2020 (distribución de seguros), pies de página legales y políticas.
 *
 * Vive en `@central/module-seguros` y no en una app porque los DOS lados de la
 * correduría lo necesitan y tienen que decir exactamente lo mismo: el panel del
 * corredor (`apps/asegura` / `plataforma`) y el portal del asegurado
 * (`apps/asegura-portal`). Dos copias del número de registro DGSFP es una copia
 * de más: el día que cambie una, la otra miente sin que falle nada.
 *
 * 🚨 Lo que NO se declara aquí, a propósito:
 *
 * - **La lista de ramos.** El art. 173 RDL 3/2020 no la exige (pide identidad, registro,
 *   participaciones, ausencia de vinculación y procedimiento de reclamación), y
 *   el alcance exacto de la inscripción en el Registro Administrativo de la
 *   DGSFP no se ha comprobado contra el registro público. Enumerar ramos sin
 *   haberlo mirado sería una afirmación sobre datos que no se han visto, y
 *   además es la clase de dato que un cliente usa para decidir.
 * - **Un Delegado de Protección de Datos.** Que exista o no es un hecho, no una
 *   redacción: se declarará cuando esté confirmado y con un buzón que se sepa
 *   que recibe correo. Mientras tanto los derechos se ejercen por el contacto
 *   general, que sí está verificado.
 *
 * PENDIENTE_REVISION_LEGAL: la redacción de `PUNTOS_PRECONTRACTUALES` y de
 * `NO_EXCLUSIVIDAD` es la operativa actual. Cuando haya sign-off de abogado se
 * sustituyen estas cadenas sin tocar ni las pantallas ni los tests.
 */

/**
 * Versión de los textos legales que se le muestran al cliente.
 *
 * Es la que se guarda en `seguros.portal_consentimiento.version_texto`: un
 * consentimiento sin la versión del texto aceptado no acredita nada, porque
 * nadie puede decir después QUÉ se aceptó. Se sube a mano cada vez que cambie
 * el fondo de cualquiera de las páginas legales (no por una errata).
 */
export const VERSION_TEXTOS_LEGALES = '2026-10-v3'

/**
 * Fecha de la última revisión de fondo de los textos legales (ISO, UTC).
 * `2026-10-v3` (27/10/2026): la política del portal publica el apartado «3 ter» (el inquilino que entra por el enlace de su
 * propietario, su petición de precio —medidas precontractuales— y su casilla aparte de ofertas) y dos filas en la tabla de
 * bases legales. BORRADOR sin revisión de abogado (ver el informe de la sesión).
 * `2026-10-v2` (26/10/2026): la política de privacidad del portal publica el apartado «3 bis» (revisión de los seguros
 * de los inmuebles, base interés legítimo, derecho de oposición). Al subirla, cada cliente vuelve a acreditar la
 * información precontractual (`lds_art19`) en su siguiente entrada con código (`necesitaRegistro`).
 * 🚨 Constante ÚNICA: el portal, las solicitudes de supresión, el export RGPD y la aceptación de presupuestos de
 * `apps/asegura` la importan de aquí; nadie copia el literal.
 */
export const FECHA_TEXTOS_LEGALES = '2026-10-27'

/**
 * Versión de los textos legales de la WEB PÚBLICA (`apps/asegura-web`).
 *
 * 🚨 Es una constante APARTE de `VERSION_TEXTOS_LEGALES` a propósito, y no por
 * duplicar: son dos documentos distintos, con público distinto y con
 * consecuencias distintas al cambiarlos.
 *
 * `VERSION_TEXTOS_LEGALES` no es solo un número que se pinta en un pie: se
 * guarda en `seguros.portal_consentimiento.version_texto` y `necesitaRegistro()`
 * la compara con la que cada cliente aceptó. Subirla obliga a **todos** los
 * clientes del portal a volver a acreditar la información precontractual la
 * próxima vez que entren.
 *
 * Cuando el 05/09/2026 la web pública añadió medición de visitas hubo que
 * reescribir su apartado de cookies. Con una sola constante, ese cambio —que no
 * toca en absoluto lo que un cliente del portal aceptó— habría hecho firmar de
 * nuevo a la cartera entera y habría ensuciado el registro de consentimientos,
 * que es una prueba. La alternativa era no subir la versión y dejar que el pie
 * de una página reescrita siguiera anunciando la anterior, que es justo lo que
 * la versión existe para impedir. De ahí las dos.
 *
 * Regla: cambia el fondo de una página de `apps/asegura-web` → sube esta. Cambia
 * el fondo de una página del portal → sube la otra.
 *
 * Arranca en `w1`, que es la revisión que introdujo la medición de visitas. Lo
 * que la web publicó ANTES de esta separación salió bajo `2026-09-v4`: la `w`
 * evita que las dos series se confundan al leer un pie de página antiguo.
 *
 * 🚨 `w2` (05/09/2026) corrige un fallo GRAVE de `w1`: se subió la versión
 * al añadir la medición, pero los textos **no se reescribieron**. La política
 * de privacidad y el aviso legal seguían diciendo «no hay analítica ni cookies
 * de terceros, y por eso no se te pide consentimiento» mientras el layout
 * cargaba Cookiebot y PostHog. Eso no es un texto viejo: es información falsa
 * al interesado (arts. 12-13 RGPD y 22.2 LSSI) y, ante una inspección, prueba
 * documental en contra. En `w2` los apartados de cookies dicen lo que el
 * código hace, aparecen la base jurídica del consentimiento y la del control
 * antiabuso por IP, y Cookiebot y PostHog se nombran como encargados.
 *
 * Lección, porque volverá a pasar: **subir la versión no es revisar el texto.**
 * La constante solo acredita QUÉ estaba publicado; que lo publicado sea cierto
 * hay que comprobarlo leyendo la página contra el código.
 *
 * `w3` (24/09/2026): el aviso legal decía «no hay área privada de cliente»
 * cuando la web ya enlaza al portal de clientes; ahora dice dónde está.
 *
 * `w1` de octubre (11/10/2026): la política de privacidad incorpora el tratamiento de las
 * conversaciones de WhatsApp (canal de Meta, cifrado, análisis con IA minimizado, retención).
 */
export const VERSION_TEXTOS_WEB = '2026-10-w1'

/** Fecha de la última revisión de fondo de los textos de la web pública. */
export const FECHA_TEXTOS_WEB = '2026-10-11'

// `MEDIADOR`, `REMITENTE_CORREDURIA` y `remitenteCorreo` viven en `@central/legal-templates` (paquete neutro, 07/11/2026)
// para que las herramientas lean al encargado sin importar module-seguros. Se re-exportan aquí: nadie cambia sus imports.
// Import RELATIVO a propósito (mismo patrón que module-tarificacion): resuelve igual en Next, tsc, node --test y tsx.
import { MEDIADOR, REMITENTE_CORREDURIA, remitenteCorreo } from '../../legal-templates/src/encargado.ts'
export { MEDIADOR, REMITENTE_CORREDURIA, remitenteCorreo }

/** Ausencia de vinculación contractual exclusiva (art. 173 RDL 3/2020). */
export const NO_EXCLUSIVIDAD =
  'Como corredor de seguros, el mediador no mantiene vinculación contractual exclusiva con ninguna entidad aseguradora, ni posee participación directa o indirecta superior al 10 % en ninguna de ellas, ni ninguna entidad aseguradora participa en más del 10 % en el mediador. El asesoramiento se presta con criterio de imparcialidad sobre las compañías disponibles.'

/**
 * Canales de reclamación, EN ORDEN: primero el propio mediador, y solo si no se
 * resuelve, el supervisor. Enseñarlos al revés invita a que el cliente empiece
 * por la DGSFP, que es exactamente lo que la ley quiere evitar.
 */
export const CANALES_RECLAMACION = [
  {
    id: 'sac',
    etiqueta: 'Servicio de Atención al Cliente del mediador',
    detalle: 'Primer paso. Plazo máximo de respuesta: un mes desde la presentación.',
    contacto: MEDIADOR.identidad.email,
    href: `mailto:${MEDIADOR.identidad.email}`,
  },
  {
    id: 'dgsfp',
    etiqueta: 'Dirección General de Seguros y Fondos de Pensiones (DGSFP)',
    detalle:
      'Servicio de Reclamaciones. Solo si el Servicio de Atención al Cliente no resuelve o no responde en plazo.',
    contacto: 'www.dgsfp.mineco.gob.es',
    href: 'https://www.dgsfp.mineco.gob.es',
  },
  {
    id: 'aepd',
    etiqueta: 'Agencia Española de Protección de Datos (AEPD)',
    detalle: 'Para lo que afecte al tratamiento de datos personales.',
    contacto: 'www.aepd.es',
    href: 'https://www.aepd.es',
  },
] as const

export type CanalReclamacion = (typeof CANALES_RECLAMACION)[number]
export type IdCanalReclamacion = CanalReclamacion['id']

/**
 * Los cuatro apartados obligatorios del art. 173 RDL 3/2020 en formato escaneable. Es lo
 * que va en la pantalla precontractual y en el pie de las apps; la versión larga
 * vive en la página de información del mediador de cada app.
 */
export const PUNTOS_PRECONTRACTUALES = [
  {
    id: 'identidad',
    titulo: 'Quién intermedia',
    cuerpo: `${MEDIADOR.identidad.nombre}, ${MEDIADOR.identidad.figura.toLowerCase()}, inscrito en el Registro Administrativo de Distribuidores de Seguros de la DGSFP con la clave ${MEDIADOR.identidad.claveDgsfp}. NIF ${MEDIADOR.identidad.nif}. Domicilio profesional: ${MEDIADOR.identidad.domicilio}.`,
  },
  {
    id: 'independencia',
    titulo: 'Independencia frente a las aseguradoras',
    cuerpo: NO_EXCLUSIVIDAD,
  },
  {
    id: 'remuneracion',
    titulo: 'Cómo se remunera',
    cuerpo: MEDIADOR.remuneracion.resumen,
  },
  {
    id: 'reclamaciones',
    titulo: 'A quién reclamar',
    cuerpo:
      'Las reclamaciones se dirigen primero al Servicio de Atención al Cliente del mediador y, si no se resuelven, a la DGSFP (Servicio de Reclamaciones). Lo relativo a datos personales puede llevarse además a la AEPD.',
  },
] as const

export type PuntoPrecontractual = (typeof PUNTOS_PRECONTRACTUALES)[number]
export type IdPuntoPrecontractual = PuntoPrecontractual['id']

/**
 * Una línea con la identificación mínima del mediador, para pies de página donde
 * no cabe la ficha entera. Es lo que el art. 173 RDL 3/2020 exige que el cliente vea SIEMPRE,
 * no solo si entra en una página aparte.
 */
export function lineaIdentificacion(): string {
  const { nombre, figura, claveDgsfp, nif } = MEDIADOR.identidad
  return `${nombre} · ${figura} inscrito en la DGSFP con clave ${claveDgsfp} · NIF ${nif}`
}


/**
 * El teléfono, escrito como se lee: `+34 637 34 99 90`.
 *
 * Existe como función y no como una segunda constante para que **no puedan
 * divergir**: dos cadenas con el mismo número escritas a mano acaban siendo
 * dos números distintos el día que uno se corrige y el otro no, y en un
 * teléfono de contacto eso significa llamadas que no llegan.
 *
 * Solo entiende el formato español (`+34` + 9 dígitos), que es el único que
 * hay. Con cualquier otro devuelve el número tal cual, sin inventarse una
 * agrupación que en ese país podría no significar nada.
 */
export function telefonoLegible(): string {
  const t = MEDIADOR.identidad.telefono
  const m = /^\+34(\d{3})(\d{2})(\d{2})(\d{2})$/.exec(t)
  return m ? `+34 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : t
}

/**
 * Enlace de WhatsApp al mediador, con el primer mensaje ya escrito.
 *
 * `wa.me` quiere el número **sin `+` y sin espacios**; con el `+` delante
 * abre la app pero deja el chat en blanco, que es un fallo que no da error y
 * solo se ve probándolo en un móvil de verdad.
 */
export function whatsappUrl(texto: string): string {
  const numero = MEDIADOR.identidad.telefono.replace(/\D/g, '')
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}
