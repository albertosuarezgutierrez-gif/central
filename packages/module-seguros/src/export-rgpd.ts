/**
 * El paquete de datos que se le entrega a un interesado cuando ejerce el
 * **derecho de acceso (art. 15 RGPD)** y el de **portabilidad (art. 20)**.
 *
 * 🚨 Un volcado de tablas NO es un export del art. 15, y este fichero existe
 * para que no se confundan:
 *
 * - El **art. 15** obliga a acompañar los datos con los **fines**, las
 *   **categorías**, los **destinatarios**, el **plazo de conservación**, el
 *   **origen** de lo que no aportó el interesado, sus **derechos** y si hay
 *   **decisiones automatizadas**. Un JSON de filas sin nada de eso es una
 *   respuesta incompleta que PARECE completa, que es lo peor de los dos mundos.
 * - El **art. 20** cubre MENOS: solo lo que la persona nos dio, tratado por
 *   consentimiento o contrato y por medios automatizados. Lo que dedujimos, lo
 *   que vino de la aseguradora o lo que generó el sistema **no es portable**.
 *   Marcarlo todo como portable acredita un derecho que no existe.
 *
 * Y una tercera trampa, la del repo: **una categoría que no se ha podido leer
 * no se omite en silencio**. Si el export sale sin las pólizas porque la
 * consulta falló, un export sin pólizas y uno de alguien que no tiene ninguna
 * se ven IGUAL. Por eso toda categoría conocida viaja siempre, con `incluida:
 * false` y un motivo cuando no hay datos que enseñar — y `construirExport()`
 * se niega a montar un paquete al que le falte alguna.
 *
 * PENDIENTE_REVISION_LEGAL: los textos de `FINES` y `DESTINATARIOS` describen
 * la operativa actual y coinciden con la política publicada del portal. Cuando
 * haya sign-off de abogado se sustituyen sin tocar la estructura.
 */

/** Las categorías de datos que la correduría puede tener de una persona. */
export const CATEGORIAS_EXPORT = [
  'identidad_portal',
  'canales',
  'acreditaciones',
  'bienes',
  'polizas_declaradas',
  'partes',
  'vinculos',
  'ficha_cartera',
  'polizas_cartera',
] as const
export type CategoriaExport = (typeof CATEGORIAS_EXPORT)[number]

/**
 * De dónde viene cada categoría. Es lo que decide si algo es **portable**: solo
 * lo aportado por la propia persona lo es (art. 20.1).
 */
export type OrigenDatos =
  /** Lo escribió o subió la persona en el portal. */
  | 'aportado_por_ti'
  /** Viene de la relación de mediación: pólizas, recibos, lo que manda la compañía. */
  | 'de_la_mediacion'
  /** Lo generó el sistema al operar (fechas de acceso, enlaces, acreditaciones). */
  | 'generado_por_el_sistema'

type Ficha = {
  titulo: string
  origen: OrigenDatos
  /** Qué se guarda, en una línea, para quien lea el paquete sin ser técnico. */
  descripcion: string
}

export const FICHA_CATEGORIA: Record<CategoriaExport, Ficha> = {
  identidad_portal: {
    titulo: 'Tu identidad en el portal',
    origen: 'generado_por_el_sistema',
    descripcion: 'Cuándo se creó tu acceso y cuándo entraste por última vez.',
  },
  canales: {
    titulo: 'Cómo entras',
    origen: 'aportado_por_ti',
    descripcion:
      'El correo con el que accedes. 🔒 No se guarda en claro: solo una huella criptográfica, que sirve para reconocerte pero no para leer la dirección. Por eso este apartado no puede devolverte tu propio correo.',
  },
  acreditaciones: {
    titulo: 'Constancia de que se te informó',
    origen: 'generado_por_el_sistema',
    descripcion:
      'Cuándo se te mostró la información del mediador, con qué versión de los textos legales, desde qué IP y con qué navegador (art. 19 de la Ley 16/2018).',
  },
  bienes: {
    titulo: 'Lo que aseguras',
    origen: 'aportado_por_ti',
    descripcion: 'Vehículos, viviendas y demás bienes que has dado de alta.',
  },
  polizas_declaradas: {
    titulo: 'Las pólizas que has declarado',
    origen: 'aportado_por_ti',
    descripcion:
      'Lo que has escrito o subido tú sobre tus seguros, incluido lo que se extrajo automáticamente de los documentos que subiste.',
  },
  partes: {
    titulo: 'Los partes que has abierto',
    origen: 'aportado_por_ti',
    descripcion: 'Lo que contaste de cada siniestro y en qué estado quedó.',
  },
  vinculos: {
    titulo: 'Enlace con tu ficha de la correduría',
    origen: 'generado_por_el_sistema',
    descripcion: 'Si tu acceso está enlazado con una ficha de cliente, y desde cuándo.',
  },
  ficha_cartera: {
    titulo: 'Tu ficha de cliente',
    origen: 'de_la_mediacion',
    descripcion: 'Los datos que la correduría tiene de ti como cliente por la relación de mediación.',
  },
  polizas_cartera: {
    titulo: 'Tus pólizas contratadas',
    origen: 'de_la_mediacion',
    descripcion: 'Las pólizas que constan en la cartera de la correduría, con sus fechas e importes.',
  },
}

/** Lo aportado por la persona es portable (art. 20); lo demás, solo accesible (art. 15). */
export function esPortable(categoria: CategoriaExport): boolean {
  return FICHA_CATEGORIA[categoria].origen === 'aportado_por_ti'
}

/** Una categoría dentro del paquete: o trae datos, o dice por qué no. */
export type BloqueExport =
  | { categoria: CategoriaExport; incluida: true; filas: readonly unknown[] }
  | { categoria: CategoriaExport; incluida: false; motivo: MotivoAusencia }

/**
 * Por qué falta una categoría. La distinción NO es cosmética: «no tienes» y «no
 * se ha podido mirar» son respuestas legales distintas, y colapsarlas convierte
 * un fallo técnico en una afirmación sobre los datos de alguien.
 */
export type MotivoAusencia =
  /** Se consultó y no hay nada. Es una respuesta, no un fallo. */
  | 'sin_datos'
  /** No se pudo consultar. El paquete queda INCOMPLETO y hay que decirlo. */
  | 'no_consultable'
  /** No aplica: no hay ficha de cliente enlazada, así que no hay cartera que enseñar. */
  | 'no_aplica'

export const MOTIVO_TEXTO: Record<MotivoAusencia, string> = {
  sin_datos: 'Se ha consultado y no consta ningún dato de esta categoría.',
  no_consultable:
    'No se ha podido consultar en el momento de generar este documento. Este apartado está INCOMPLETO: pídelo de nuevo o escríbenos y lo completamos.',
  no_aplica: 'No procede: tu acceso no está enlazado con ninguna ficha de cliente de la correduría.',
}

/** Los apartados del art. 15.1 que acompañan a los datos, además de los datos. */
export type InformacionArt15 = {
  fines: readonly string[]
  destinatarios: readonly string[]
  conservacion: readonly string[]
  derechos: string
  origen: string
  decisionesAutomatizadas: string
  transferenciasInternacionales: string
}

export const INFORMACION_ART15: InformacionArt15 = {
  fines: [
    'Identificarte y darte acceso al portal.',
    'Enseñarte tus seguros y avisarte de un vencimiento a tiempo.',
    'Recibir tus partes de siniestro y trasladarlos a la compañía.',
    'Leer automáticamente las pólizas que subes para rellenar sus campos.',
    'Conservar la documentación de la mediación y atender tus derechos y reclamaciones.',
  ],
  destinatarios: [
    'Las entidades aseguradoras con las que tengas o vayas a tener una póliza.',
    'Supabase — la base de datos, alojada en la Unión Europea (Irlanda).',
    'Vercel — el alojamiento de la aplicación.',
    'Resend — el envío del correo con tu código de acceso.',
    'OpenRouter y el proveedor de modelo al que enrute — leen el documento que subes.',
    'Sede Electrónica del Catastro — si escribes la dirección de una vivienda.',
  ],
  conservacion: [
    'Los códigos de acceso caducan a los diez minutos y se invalidan al usarse.',
    'Tu identidad y lo declarado, mientras mantengas la cuenta y la relación con la correduría.',
    'La documentación de la mediación, durante los plazos que exigen la normativa de seguros y la de prevención del blanqueo de capitales, y mientras puedan derivarse responsabilidades del contrato.',
  ],
  derechos:
    'Puedes pedir acceso, rectificación, supresión, limitación, portabilidad y oposición. Si no te contestamos en un mes o no estás conforme, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).',
  origen:
    'Lo marcado como «aportado por ti» lo escribiste o subiste tú. Lo marcado como «de la mediación» procede de la relación de mediación y de las entidades aseguradoras. Lo marcado como «generado por el sistema» lo produjo la aplicación al operar.',
  decisionesAutomatizadas:
    'No hay decisiones automatizadas con efectos jurídicos sobre ti (art. 22 RGPD). La lectura automática de una póliza que subes produce una PROPUESTA que no se da por buena hasta que tú la confirmas en pantalla.',
  transferenciasInternacionales:
    'Los documentos que subes se envían a un modelo de lenguaje a través de OpenRouter (empresa estadounidense) para extraer sus datos, así que pueden procesarse fuera del Espacio Económico Europeo. El resto del tratamiento se hace en la Unión Europea.',
}

export type ExportRgpd = {
  generadoEn: string
  versionTextosLegales: string
  mediador: { nombre: string; nif: string; claveDgsfp: string; contacto: string }
  /** `true` solo si TODAS las categorías se pudieron consultar. */
  completo: boolean
  apartados: readonly {
    categoria: CategoriaExport
    titulo: string
    descripcion: string
    origen: OrigenDatos
    portable: boolean
    incluida: boolean
    motivo?: string
    filas?: readonly unknown[]
  }[]
  informacion: InformacionArt15
}

export type EntradaExport = {
  bloques: readonly BloqueExport[]
  generadoEn: Date
  versionTextosLegales: string
  mediador: ExportRgpd['mediador']
}

/**
 * Monta el paquete. **Exige las nueve categorías**: si falta alguna lanza, en
 * vez de emitir un documento al que le falta un apartado sin que se note. Un
 * export incompleto que parece completo es peor que no tener export.
 */
export function construirExport(entrada: EntradaExport): ExportRgpd {
  const vistas = new Set(entrada.bloques.map((b) => b.categoria))
  const faltan = CATEGORIAS_EXPORT.filter((c) => !vistas.has(c))
  if (faltan.length > 0) {
    throw new Error(`export RGPD incompleto: faltan las categorías ${faltan.join(', ')}`)
  }
  if (vistas.size !== entrada.bloques.length) {
    throw new Error('export RGPD con categorías repetidas')
  }

  const apartados = CATEGORIAS_EXPORT.map((categoria) => {
    const bloque = entrada.bloques.find((b) => b.categoria === categoria)!
    const ficha = FICHA_CATEGORIA[categoria]
    const comun = {
      categoria,
      titulo: ficha.titulo,
      descripcion: ficha.descripcion,
      origen: ficha.origen,
      portable: esPortable(categoria),
    }
    return bloque.incluida
      ? { ...comun, incluida: true as const, filas: bloque.filas }
      : { ...comun, incluida: false as const, motivo: MOTIVO_TEXTO[bloque.motivo] }
  })

  // Solo `no_consultable` rompe la completitud: «no tienes» y «no aplica» son
  // respuestas, no huecos.
  const completo = !entrada.bloques.some((b) => !b.incluida && b.motivo === 'no_consultable')

  return {
    generadoEn: entrada.generadoEn.toISOString(),
    versionTextosLegales: entrada.versionTextosLegales,
    mediador: entrada.mediador,
    completo,
    apartados,
    informacion: INFORMACION_ART15,
  }
}
