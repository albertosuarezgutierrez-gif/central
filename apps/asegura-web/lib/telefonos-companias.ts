// Los teléfonos para dar parte de cada compañía — la materia prima de
// `/telefonos-siniestros`.
//
// 🚨 NINGÚN número de aquí se publica mientras `verificado` sea `false`, y el
// cepo (`telefonos-companias.test.ts`) lo obliga. Es la regla más cara de la
// casa en su versión más literal: un teléfono de siniestros equivocado no
// falla en ningún test, falla cuando alguien lo marca después de un golpe.
//
// De dónde sale cada dato: la copia que ya usa el portal del cliente,
// `seguros.companias_dgs` (`telefono_siniestros`, `telefono_asistencia`,
// `whatsapp_siniestros`, `horario_siniestros`), leída el 23/09/2026. Esta web
// NO tiene base de datos a propósito (ver el apartado de `apps/asegura-web`
// del CLAUDE.md raíz), así que el dato vive aquí copiado: si cambia en la BD,
// se cambia aquí en el mismo PR.
//
// Por qué casi todos están en `false`: desde el entorno de las sesiones la red
// bloquea los dominios de las compañías, así que la BD los rellenó con
// EXTRACTOS de buscador restringidos al dominio oficial — no leyendo la página.
// En la ficha de Mapfre pone literalmente «confirmar antes de imprimirlo en
// nada», y una web pública es imprimirlo. Verificar es abrir `fuente`, ver que
// dice lo mismo y poner `verificado: true` con la fecha: lo hace una persona.
//
// La excepción es Occident: su línea la confirmó Alberto el 14/09/2026 (voz y
// WhatsApp en el mismo número, 24 horas los 365 días), contrastada con el
// perfil verificado de WhatsApp Business.

import { esPublicable } from './companias-baja.ts'

export type TelefonoCompania = {
  slug: string
  nombre: string
  /** Para dar parte, tal y como se marca. `null` = no lo tenemos. */
  siniestros: string | null
  /** Asistencia (grúa, urgencias en casa). Puede coincidir con el de siniestros. */
  asistencia: string | null
  /** WhatsApp para dar parte, en E.164. No es un número de voz: no lleva `tel:`. */
  whatsapp: string | null
  /** Horario de la línea de siniestros. `null` = no lo sabemos, NO «siempre». */
  horario: string | null
  /** La página oficial donde se comprueba. Es lo que se enlaza si no está verificado. */
  fuente: string
  verificado: boolean
  /** `AAAA-MM-DD` de la verificación humana. Obligatoria si `verificado`. */
  verificadoEl: string | null
}

export const TELEFONOS_COMPANIAS: readonly TelefonoCompania[] = [
  {
    slug: 'mapfre',
    nombre: 'Mapfre',
    siniestros: '900 122 122',
    asistencia: '900 122 122',
    whatsapp: null,
    horario: null,
    fuente: 'https://www.mapfre.es/particulares/contacto/atencion/',
    verificado: false,
    verificadoEl: null,
  },
  {
    slug: 'allianz',
    nombre: 'Allianz',
    siniestros: '900 300 250',
    asistencia: null,
    whatsapp: null,
    horario: 'de lunes a viernes, de 9:00 a 19:00',
    fuente: 'https://www.allianz.es/contacto.html',
    verificado: false,
    verificadoEl: null,
  },
  {
    slug: 'occident',
    nombre: 'Occident',
    siniestros: '917 83 83 83',
    asistencia: null,
    whatsapp: '+34917838383',
    horario: '24 horas, los 365 días',
    fuente: 'https://www.occident.com/',
    verificado: true,
    verificadoEl: '2026-09-14',
  },
  {
    slug: 'reale',
    nombre: 'Reale',
    siniestros: '900 365 900',
    asistencia: '900 365 900',
    whatsapp: null,
    horario: null,
    fuente: 'https://www.reale.es/es/te-ayudamos/asistencia',
    verificado: false,
    verificadoEl: null,
  },
  {
    slug: 'generali',
    nombre: 'Generali',
    siniestros: '900 903 433',
    asistencia: '900 903 433',
    whatsapp: null,
    horario: null,
    fuente: 'https://www.generali.es/contacto-generali',
    verificado: false,
    verificadoEl: null,
  },
]

/** El número tal y como se marca: solo dígitos y el `+` inicial. */
export function hrefTel(numero: string): string {
  const limpio = numero.replace(/[^\d+]/g, '')
  return `tel:${limpio.startsWith('+') ? limpio : `+34${limpio}`}`
}

/**
 * Lo que la página puede enseñar de cada compañía. Las no verificadas salen
 * SIN ningún número —solo el nombre y su página oficial—: no se filtran de la
 * lista, porque desaparecer se leería como «con esa no hay nada que hacer».
 */
export function telefonosParaPublicar(): Array<
  | { publicable: true; c: TelefonoCompania }
  | { publicable: false; c: Pick<TelefonoCompania, 'slug' | 'nombre' | 'fuente'> }
> {
  return TELEFONOS_COMPANIAS.map((c) =>
    esPublicable(c) ? { publicable: true as const, c } : { publicable: false as const, c: { slug: c.slug, nombre: c.nombre, fuente: c.fuente } },
  )
}
