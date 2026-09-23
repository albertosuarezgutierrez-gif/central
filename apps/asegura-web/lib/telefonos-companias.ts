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

export type LineaAsistencia = {
  /** Para qué es, como lo rotula la compañía: «Coche, moto y furgoneta». */
  para: string
  numeros: readonly string[]
  /** Como lo dice la compañía. `null` = no lo dice: NO se escribe «24 h». */
  horario: string | null
}

export type TelefonoCompania = {
  slug: string
  nombre: string
  /** Para dar parte, tal y como se marca. `null` = no lo tenemos. */
  siniestros: string | null
  /**
   * Asistencia 24 h (grúa, urgencias en casa). Una LISTA porque hay compañías
   * que dan un número por tipo de riesgo (Allianz: coche, hogar, pesados) y
   * colapsarlos en uno haría marcar el de la grúa por una fuga de agua.
   * `[]` = no lo tenemos. Si coincide con el de siniestros, no se repite.
   */
  asistencia: readonly LineaAsistencia[]
  /** WhatsApp para dar parte, en E.164. No es un número de voz: no lleva `tel:`. */
  whatsapp: string | null
  /**
   * Para qué sirve ese WhatsApp y cuándo atiende, si NO es la misma línea que la
   * de siniestros (Mapfre: solo hogar, L-V). `null` = es el mismo número.
   */
  whatsappNota?: string | null
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
    // 23/09/2026: verificado con una CAPTURA de mapfre.es (Particulares) que
    // envió Alberto. 🚨 Desmiente la BD: el 900 122 122 que `companias_dgs` daba
    // como «siniestros» es la línea de ASISTENCIA MÉDICA. La captura no trae un
    // número de voz para dar parte (solo el WhatsApp de hogar), así que
    // `siniestros` queda vacío en vez de adivinarlo. La segunda captura (página
    // entera) confirma que el de hogar es también el de ayuda en carretera.
    siniestros: null,
    asistencia: [
      { para: 'Hogar y ayuda en carretera', numeros: ['918 365 365', '900 822 822'], horario: '24 horas' },
      { para: 'Ayuda en carretera desde el extranjero', numeros: ['+34 915 811 823'], horario: '24 horas' },
      { para: 'Viajes', numeros: ['915 811 823', '900 814 400'], horario: '24 horas' },
      { para: 'Médica', numeros: ['900 122 122'], horario: '24 horas' },
      { para: 'Accidentes personales', numeros: ['918 366 224', '900 810 852'], horario: '24 horas' },
      { para: 'Decesos', numeros: ['918 366 181', '900 814 111'], horario: '24 horas' },
    ],
    whatsapp: '+34920750075',
    whatsappNota: 'para dar parte de hogar, de lunes a viernes de 8:00 a 20:00',
    horario: null,
    fuente: 'https://www.mapfre.es/particulares/contacto/atencion/',
    verificado: true,
    verificadoEl: '2026-09-23',
  },
  {
    slug: 'allianz',
    nombre: 'Allianz',
    // 23/09/2026: verificado con una CAPTURA de la web de Allianz («Teléfonos de
    // Urgencias 24h») que envió Alberto. Esa captura NO trae el número para dar
    // parte, así que el 900 300 250 (extracto de buscador) sale de aquí: lo
    // verificado es exactamente lo que se veía. Se omite la línea de
    // «fenómenos meteorológicos severos» (900 101 920): es una línea especial,
    // no la de un siniestro corriente.
    siniestros: null,
    asistencia: [
      { para: 'Coche, moto y furgoneta', numeros: ['900 117 115', '900 117 117'], horario: '24 horas' },
      { para: 'Hogar y comercio', numeros: ['913 255 258'], horario: '24 horas' },
      { para: 'Vehículos pesados', numeros: ['900 117 120'], horario: '24 horas' },
    ],
    // WhatsApp aportado por Alberto (corredor) el 23/09/2026, con su horario.
    whatsapp: '+34638930466',
    whatsappNota: 'de lunes a viernes, de 9:00 a 19:00 (dato de tu corredor, no de su web)',
    horario: null,
    fuente: 'https://www.allianz.es/contacto.html',
    verificado: true,
    verificadoEl: '2026-09-23',
  },
  {
    slug: 'occident',
    nombre: 'Occident',
    // Reconfirmado el 23/09/2026 con capturas de las páginas «Declaración de
    // siniestro de hogar» y «… de auto» de occident.com: las dos dan este número.
    siniestros: '917 83 83 83',
    asistencia: [],
    whatsapp: '+34917838383',
    horario: '24 horas, los 365 días',
    fuente: 'https://www.occident.com/',
    verificado: true,
    verificadoEl: '2026-09-23',
  },
  {
    slug: 'reale',
    nombre: 'Reale',
    // Captura de reale.es/es/te-ayudamos/contacto del 23/09/2026. Para ABRIR un
    // siniestro es atención al cliente (900 455 900); el 900 365 900 que traía
    // la BD es el de asistencia (grúa y hogar). El 91 454 74 00 sale en los tres
    // bloques: se publica solo en las asistencias, junto a su 900.
    siniestros: '900 455 900',
    asistencia: [
      { para: 'En carretera', numeros: ['900 365 900', '91 454 74 00'], horario: '24 horas, todos los días' },
      { para: 'Hogar', numeros: ['900 365 900', '91 454 74 00'], horario: '24 horas, todos los días' },
    ],
    whatsapp: null,
    horario: null,
    fuente: 'https://www.reale.es/es/te-ayudamos/contacto',
    verificado: true,
    verificadoEl: '2026-09-23',
  },
  {
    slug: 'generali',
    nombre: 'Generali',
    // Captura de su web del 23/09/2026: los dos números son de asistencia en
    // carretera (el 911 también desde el extranjero). La grúa por WhatsApp sale
    // como botón sin número visible. Ese número es +34 654 03 36 29: perfil de
    // WhatsApp Business VERIFICADO «Generali» (captura de Alberto, 23/09/2026),
    // con un asistente para gestiones de los seguros, grúa incluida. Horario no publicado.
    siniestros: null,
    asistencia: [
      { para: 'Asistencia en carretera', numeros: ['911 123 443', '900 903 433'], horario: null },
      { para: 'Asistencia en carretera desde el extranjero', numeros: ['+34 911 123 443'], horario: null },
    ],
    whatsapp: '+34654033629',
    whatsappNota: 'asistente virtual para gestiones y grúa; no publica horario (su perfil verificado de WhatsApp Business)',
    horario: null,
    fuente: 'https://www.generali.es/contacto-generali',
    verificado: true,
    verificadoEl: '2026-09-23',
  },
  {
    slug: 'fidelidade',
    nombre: 'Fidelidade',
    // Captura de su página «Siniestros y asistencia» del 23/09/2026, solo el
    // bloque HOGAR: el teléfono de emergencias venía plegado y auto no salía.
    siniestros: null,
    asistencia: [{ para: 'Hogar', numeros: ['915 901 759', '900 802 822'], horario: null }],
    whatsapp: '+34666519911',
    whatsappNota: 'para hogar',
    horario: null,
    fuente: 'https://www.fidelidade.es/',
    verificado: true,
    verificadoEl: '2026-09-23',
  },  {
    slug: 'asisa',
    nombre: 'Asisa',
    // Aseguradora de salud: no hay «parte», hay atención al cliente (24 h, todos
    // los días, según su página «Soy de ASISA», captura del 23/09/2026).
    siniestros: null,
    asistencia: [{ para: 'Atención al cliente', numeros: ['919 911 999', '900 922 992'], horario: '24 horas, todos los días' }],
    whatsapp: null,
    horario: null,
    fuente: 'https://www.asisa.es/',
    verificado: true,
    verificadoEl: '2026-09-23',
  },
]

/** `+34920750075` → `920 750 075`, para pintar un WhatsApp sin inventar formato. */
export function whatsappLegible(e164: string): string {
  const n = e164.replace(/^\+34/, '')
  return n.length === 9 ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : e164
}

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
export function telefonosParaPublicar(companias: readonly TelefonoCompania[] = TELEFONOS_COMPANIAS): Array<
  | { publicable: true; c: TelefonoCompania }
  | { publicable: false; c: Pick<TelefonoCompania, 'slug' | 'nombre' | 'fuente'> }
> {
  return companias.map((c) =>
    esPublicable(c) ? { publicable: true as const, c } : { publicable: false as const, c: { slug: c.slug, nombre: c.nombre, fuente: c.fuente } },
  )
}
