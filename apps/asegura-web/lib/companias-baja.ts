// Qué pide CADA compañía para no renovar una póliza — la materia prima de la
// serie «cómo dar de baja un seguro en [Compañía]» del plan de contenidos.
//
// 🚨 NADA de lo que hay aquí se publica mientras `verificado` sea `false`, y
// el cepo (`companias-baja.test.ts`) lo obliga. La razón es la regla de la
// casa «dato que no hay ≠ dato que no se ha mirado», en su versión más cara:
// un email de bajas o un teléfono equivocado en una guía de seguros hace que
// alguien mande su carta a un buzón que no existe y se le pase el plazo. Eso
// no falla en ningún test: falla en su recibo.
//
// Cómo se llenó (19/09/2026): un agente buscó en la web oficial de cada
// compañía, pero desde este entorno la red bloquea los cinco dominios
// (`mapfre.es`, `allianz.es`, `occident.com`, `reale.es`, `generali.es`), así
// que lo que hay son EXTRACTOS de buscador restringidos al dominio oficial —
// no una lectura directa de la página. Por eso todos están en
// `verificado: false`, con la URL exacta donde comprobarlos. Verificar es
// abrir esa URL, ver que dice lo mismo y poner `verificado: true` con la fecha:
// diez minutos por compañía, y lo hace una persona, no un agente.
//
// Con `verificado: true` la compañía entra en la sección «Qué pide tu
// compañía» del artículo `como-dar-de-baja-un-seguro-a-tiempo`, y es
// candidata a su propio artículo `dar-de-baja-seguro-<slug>` — que se escribe
// CON datos, no como plantilla con el nombre cambiado (una página por compañía
// con el mismo texto es una «doorway page», y Google las descuenta).

export type CompaniaBaja = {
  slug: string
  nombre: string
  /** Nombre legal completo, tal como lo publica su aviso legal. */
  entidad: string | null
  /** Domicilio social, para el burofax. */
  domicilio: string | null
  /** Canal oficial de baja: email o página. `null` = no consta uno específico. */
  canalBaja: { tipo: 'email' | 'formulario' | 'area_cliente'; valor: string } | null
  /** Qué exige adjuntar, con las palabras de la compañía. */
  requisitos: string | null
  /** Cita literal del plazo, si la compañía lo publica. */
  plazoCita: string | null
  /** Las URL oficiales donde se leyó cada cosa. */
  fuentes: readonly string[]
  /** `false` hasta que una persona abra las fuentes y lo confirme. */
  verificado: boolean
  /** `AAAA-MM-DD` de la verificación humana. Obligatoria si `verificado`. */
  verificadoEl: string | null
  /** Lo que el agente no pudo confirmar, para que quien verifique sepa dónde mirar. */
  dudas: string | null
}

export const COMPANIAS_BAJA: readonly CompaniaBaja[] = [
  {
    slug: 'mapfre',
    nombre: 'Mapfre',
    entidad: 'MAPFRE ESPAÑA, Compañía de Seguros y Reaseguros, S.A.',
    domicilio: 'Carretera de Pozuelo, 50, 28222 Majadahonda (Madrid)',
    canalBaja: null,
    requisitos: 'Por escrito, con datos del asegurado, número de póliza y fecha; recomienda un medio que deje constancia fehaciente.',
    plazoCita: 'al menos un mes de antelación cuando quien se oponga a la prórroga sea el tomador',
    fuentes: [
      'https://www.mapfre.es/particulares/seguros-de-hogar/articulos/plazo-dar-de-baja-seguro-de-hogar/',
      'https://www.mapfre.es/particulares/seguros-de-coche/articulos/cual-es-el-plazo-para-anular-un-seguro-de-coche/',
      'https://www.mapfre.es/particulares/contacto/atencion/',
    ],
    verificado: false,
    verificadoEl: null,
    dudas: 'No consta email ni dirección específica de bajas: solo domicilio social y teléfono de atención (918 365 365). Un extracto dice que se puede hacer desde el Área de Cliente.',
  },
  {
    slug: 'allianz',
    nombre: 'Allianz',
    entidad: 'ALLIANZ, Compañía de Seguros y Reaseguros, S.A.',
    domicilio: 'C/ Ramírez de Arellano, 35, 28043 Madrid',
    canalBaja: { tipo: 'formulario', valor: 'https://www.allianz.es/servicios/tramites-online-poliza/solicitar-anulacion.html' },
    requisitos: 'Recomienda fax, burofax o carta certificada, con fotocopia del DNI, datos del bien, número de póliza y fecha.',
    plazoCita: 'al menos un mes de antelación a la fecha de vencimiento de la póliza',
    fuentes: [
      'https://www.allianz.es/servicios/tramites-online-poliza/solicitar-anulacion.html',
      'https://www.allianz.es/seguro-de-coche/consejos-seguro-de-coche/dar-baja-seguro-coche.html',
      'https://www.allianz.es/informacion-legal.html',
    ],
    verificado: false,
    verificadoEl: null,
    dudas: 'El trámite online «Solicitar anulación» no se pudo abrir: confirmar si exige login y qué documentos pide. clientes.allianz@allianz.es aparece como email general, no consta que admita bajas.',
  },
  {
    slug: 'occident',
    nombre: 'Occident',
    entidad: 'Occident GCO, S.A.U. de Seguros y Reaseguros',
    domicilio: 'Calle Méndez Álvaro, 31, 28045 Madrid',
    canalBaja: null,
    requisitos: null,
    plazoCita: 'un mes si es el Tomador',
    fuentes: [
      'https://www.occident.com/doc/es/nota_informativa_salud_asistencia/nota-informativa_salud_asistencia_esp.pdf',
      'https://www.occident.com/en/legal-notice',
    ],
    verificado: false,
    verificadoEl: null,
    dudas: 'Sin página de bajas localizable y sin email de bajas. La cita del plazo es de una nota informativa de SALUD, no de una regla general. Teléfono general no atribuible con seguridad.',
  },
  {
    slug: 'reale',
    nombre: 'Reale',
    entidad: 'REALE SEGUROS GENERALES, S.A.U.',
    domicilio: 'Príncipe de Vergara, 125, 28002 Madrid',
    canalBaja: { tipo: 'email', valor: 'contactcenter.ret@reale.es' },
    requisitos: 'Solicitud firmada por el tomador, con el número de póliza en el asunto y copia del DNI o NIE adjunta.',
    plazoCita: 'con un mes de antelación al vencimiento',
    fuentes: ['https://www.reale.es/es/te-ayudamos/contacto', 'https://www.reale.es/es/te-ayudamos/faq'],
    verificado: false,
    verificadoEl: null,
    dudas: 'Es la más concreta de las cinco (email + requisitos en dos páginas oficiales). Solo falta abrir las dos URL y confirmar la cita literal.',
  },
  {
    slug: 'generali',
    nombre: 'Generali',
    entidad: 'Generali España, S.A. de Seguros y Reaseguros',
    domicilio: null,
    canalBaja: { tipo: 'formulario', valor: 'https://www.generali.es/info/baja' },
    requisitos: 'A través del mediador, en una oficina, o registrándose en MI GENERALI y adjuntando copia del DNI/NIE.',
    plazoCita: 'comunicar por escrito con un mes de antelación al vencimiento de la póliza',
    fuentes: ['https://www.generali.es/info/baja', 'https://www.generali.es/doc/Aviso_legal', 'https://www.generali.es/contacto-generali'],
    verificado: false,
    verificadoEl: null,
    dudas: 'Dos páginas oficiales dan DOS domicilios distintos (Orense 2 / Pl. Manuel Gómez-Moreno 5, ambos 28020 Madrid): por eso va a null. Confirmar cuál es el vigente.',
  },
] as const

/** Las que se pueden publicar. Hoy: ninguna, y eso es lo correcto hasta que alguien verifique. */
export function companiasBajaPublicables(): CompaniaBaja[] {
  return COMPANIAS_BAJA.filter((c) => c.verificado && c.verificadoEl !== null)
}
