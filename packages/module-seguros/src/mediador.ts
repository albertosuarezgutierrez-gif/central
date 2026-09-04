/**
 * Datos canónicos del MEDIADOR (Grupo ASegura) para todo lo que se le enseña al
 * cliente final: información precontractual del art. 19 de la Ley 16/2018 de
 * Distribución de Seguros (LDS), pies de página legales y políticas.
 *
 * Vive en `@central/module-seguros` y no en una app porque los DOS lados de la
 * correduría lo necesitan y tienen que decir exactamente lo mismo: el panel del
 * corredor (`apps/asegura` / `plataforma`) y el portal del asegurado
 * (`apps/asegura-portal`). Dos copias del número de registro DGSFP es una copia
 * de más: el día que cambie una, la otra miente sin que falle nada.
 *
 * 🚨 Lo que NO se declara aquí, a propósito:
 *
 * - **La lista de ramos.** El art. 19 LDS no la exige (pide identidad, registro,
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
export const VERSION_TEXTOS_LEGALES = '2026-09-v1'

/** Fecha de la última revisión de fondo de los textos legales (ISO, UTC). */
export const FECHA_TEXTOS_LEGALES = '2026-09-04'

export const MEDIADOR = {
  /** Nombre comercial. La persona que responde legalmente es `identidad`. */
  marca: 'Grupo ASegura',
  identidad: {
    nombre: 'Alberto Suárez Gutiérrez',
    nif: '28823484E',
    figura: 'Corredor de seguros (persona física)',
    /** Clave del Registro Administrativo de Distribuidores de Seguros (DGSFP). */
    claveDgsfp: 'CS-F/0170',
    domicilio: 'San Juan de La Palma, nº 28, 41003 Sevilla',
    email: 'info@grupoasegura.es',
  },
  /** Seguro de responsabilidad civil profesional, art. 156.3 Ley 16/2018. */
  responsabilidadCivil: {
    aseguradora: "Lloyd's of London",
    poliza: 'M201900135',
    referenciaLegal: 'Art. 156.3 Ley 16/2018',
  },
  remuneracion: {
    naturaleza: 'Comisión sobre la prima, abonada por la entidad aseguradora',
    /** Redacción breve para la pantalla precontractual (art. 19.1.f LDS). */
    resumen:
      'El mediador percibe una comisión sobre la prima que abona la entidad aseguradora. El cliente no paga ningún honorario adicional por el servicio de mediación.',
  },
} as const

/** Ausencia de vinculación contractual exclusiva (art. 19.1.b LDS). */
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
 * Los cuatro apartados obligatorios del art. 19 LDS en formato escaneable. Es lo
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
 * no cabe la ficha entera. Es lo que el art. 19 exige que el cliente vea SIEMPRE,
 * no solo si entra en una página aparte.
 */
export function lineaIdentificacion(): string {
  const { nombre, figura, claveDgsfp, nif } = MEDIADOR.identidad
  return `${nombre} · ${figura} inscrito en la DGSFP con clave ${claveDgsfp} · NIF ${nif}`
}
