// Borradores para LinkedIn — el canal que Alberto eligió el 07/09/2026.
//
// ─── Por qué esto es DATO y no un chat ─────────────────────────────────────
// Un post publicado no se puede editar como una página. Si un texto promete un
// precio, ya lo ha visto quien lo iba a ver. Por eso el copy de redes pasa por
// el MISMO cepo regulatorio que el de la web (`revisarCopy` de
// `@central/module-seguros`, RDL 3/2020) y vive en el repo, donde ese cepo
// corre en cada commit. Un borrador escrito en una conversación no lo vigila
// nadie.
//
// ─── Por qué LinkedIn y no Instagram ───────────────────────────────────────
// El ramo con más comisión medida es hogar (68,74 €/póliza/año contra 40,87 €
// de auto), pero el hueco creíble de la cartera son COMUNIDADES y COMERCIO, y
// eso lo decide un administrador de fincas, un presidente o un gerente — no se
// vende con un reel a desconocidos. Además, de los 80 clientes vivos solo 6 son
// personas jurídicas: el B2B hay que construirlo, y LinkedIn es su canal.
//
// ─── Lo que este fichero NO hace ───────────────────────────────────────────
// **No publica.** Ni aquí ni en ningún sitio: regla global de comunicaciones
// salientes: el borrador lo prepara el repo, publica Alberto. Cuando exista un
// adaptador de LinkedIn (`w_member_social`, que es self-serve para el perfil
// personal), seguirá publicando él pulsando un botón.

import { revisarCopy, explicarInfracciones, type Infraccion } from '@central/module-seguros'

export type Borrador = {
  /** Estable: es la referencia cuando Alberto diga «publica el de comunidades». */
  id: string
  /** Etiqueta corta del asunto. Sirve para no repetir tema dos semanas seguidas. */
  tema: 'comunidades' | 'comercio' | 'flota' | 'hogar' | 'renovacion' | 'marca'
  /** Título INTERNO. No se publica: es lo que se lee en la lista. */
  titulo: string
  /** El texto tal cual se publica. Sin hashtags de relleno. */
  texto: string
  /** A quién va y qué busca. Para que se publique sabiendo lo que se publica. */
  porQue: string
  /**
   * La norma citada, si cita alguna. Se anota para poder VERIFICARLA antes de
   * publicar: una cita inventada cuesta más que no citar, y en un post no se
   * puede corregir.
   */
  base?: string
  /** Página propia que el post refuerza, si la hay. */
  enlace?: string
}

/** Tope duro de LinkedIn para el cuerpo de un post. */
export const MAX_LINKEDIN = 3000

export const BORRADORES: readonly Borrador[] = [
  {
    id: 'comunidades-infraseguro',
    tema: 'comunidades',
    titulo: 'El número de la póliza de la comunidad que nadie mira',
    porQue:
      'Administradores de fincas y presidentes. Es el hueco más creíble de la cartera: no hay comparador que venda comunidades y decide una persona concreta.',
    base: 'Art. 30 de la Ley 50/1980 de Contrato de Seguro (regla proporcional; es dispositiva, se puede excluir por pacto).',
    texto: `Si presides o administras una comunidad, hay un número en la póliza que casi nadie mira y que decide cuánto se cobra el día que pasa algo: el capital de continente.

Funciona así. Si el edificio está asegurado por menos de lo que costaría reconstruirlo, la compañía indemniza en la misma proporción. Un daño de 20.000 € en un edificio asegurado al 60 % de su valor no se paga entero, y no es por mala fe: es lo que dice el artículo 30 de la Ley de Contrato de Seguro.

Lo que casi nadie sabe es que esa regla es dispositiva. Se puede pactar con la compañía que no se aplique, y entonces se escribe en las condiciones particulares. Pero hay que pedirlo.

Dos preguntas para la próxima junta:

· ¿De cuándo es el capital de continente y quién lo calculó?
· ¿La póliza excluye la regla proporcional, sí o no?

Si nadie sabe contestarlas, la comunidad no sabe qué cobraría.

Soy corredor de seguros, inscrito en la DGSFP con clave CS-F/0170. No trabajo para ninguna compañía: leo el contrato y digo lo que veo.`,
  },
  {
    id: 'renovacion-preaviso',
    tema: 'renovacion',
    titulo: 'Tu seguro no se renueva el día que vence',
    porQue:
      'Todo el mundo. Es el post más compartible de la lista y el que más conversaciones abre, porque el lector puede comprobarlo hoy en su propia póliza.',
    base: 'Art. 22 de la Ley 50/1980 de Contrato de Seguro (oposición a la prórroga: un mes el tomador, dos el asegurador).',
    texto: `Tu seguro no se renueva el día que vence. Se renueva un mes antes, y es la fecha que casi todo el mundo se pasa.

El artículo 22 de la Ley de Contrato de Seguro lo dice sin rodeos: para oponerte a la prórroga tienes que notificarlo por escrito con al menos un mes de antelación al vencimiento. La compañía, si es ella la que no quiere renovar, necesita dos meses.

O sea que si tu póliza vence el 15 de marzo, tu fecha real es el 13 de febrero. El 20 de febrero ya no hay decisión que tomar: hay un año más.

Por eso, cuando aviso a un cliente, la fecha que le doy no es la del vencimiento. Es la accionable.

Ábrete hoy las pólizas de tu empresa y apunta esa fecha, no la otra. Es un minuto, y decide si el año que viene lo eliges tú o lo elige el calendario.`,
  },
  {
    id: 'hogar-banco-hipoteca',
    tema: 'hogar',
    titulo: 'El seguro de hogar no tiene que ser el del banco',
    porQue:
      'Particulares con hipoteca, que es donde está la comisión medida más alta (hogar). Y es un mensaje que el banco nunca va a dar.',
    base: 'Art. 17 de la Ley 5/2019 de contratos de crédito inmobiliario (el prestamista debe aceptar pólizas de otra entidad con garantías equivalentes y no puede cobrar por revisarlas).',
    texto: `«Es que el seguro de hogar tengo que tenerlo con el banco.» No.

El banco puede exigir que la vivienda esté asegurada mientras dure la hipoteca. Lo que no puede es obligarte a que la póliza sea suya.

El artículo 17 de la Ley 5/2019 obliga a la entidad a aceptar el seguro de cualquier compañía que ofrezca condiciones y garantías equivalentes a las suyas, tanto al firmar como en cada renovación. Y no puede cobrarte por revisarlo.

Dos matices que conviene tener claros, porque es donde se lía todo el mundo:

· El banco SÍ puede ofrecerte una bonificación en el tipo de interés por contratar productos con ellos. Eso es una oferta combinada y es legal. Lo que no puede es hacerlo condición para darte el préstamo.
· Si rechaza tu póliza alternativa, tiene que justificarlo por escrito y señalar qué garantía concreta no alcanza la equivalencia.

Si alguna vez te han dicho que no se puede cambiar, pide esa justificación por escrito. La conversación cambia.`,
  },
  {
    id: 'flota-mercancia',
    tema: 'flota',
    titulo: 'El seguro del camión no cubre lo que llevas dentro',
    porQue:
      'Empresas con furgonetas y transportistas. Es el nicho que la web no cubría hasta esta semana y el que más encaja con LinkedIn.',
    enlace: 'https://grupoasegura.es/seguros/flota',
    texto: `Si tu empresa tiene furgonetas y reparte, esto vale más que cualquier comparativa:

El seguro del vehículo responde de los daños que el vehículo causa. No de lo que llevas dentro.

Es la confusión más cara que veo en flotas pequeñas. La empresa da por hecho que va cubierta porque «el seguro es a todo riesgo», y el día que se pierde una carga descubre dos cosas: que la mercancía se asegura aparte, y que no es igual mover mercancía propia que ajena — con la ajena entra tu responsabilidad como transportista.

Tres cosas que revisar antes que ninguna otra:

· Quién puede conducir. Conductor designado, ocupacional o cualquier empleado con permiso en vigor. Y qué pasa exactamente si conduce alguien que no encaja en lo declarado.
· Cómo se dan de alta los vehículos nuevos a mitad de año y desde qué momento quedan cubiertos. No siempre es desde la llamada.
· Si la carga tiene valor, dónde está asegurada.

Una flota no es la suma de los seguros de coche de una empresa: es una sola póliza con condiciones comunes y una siniestralidad que se mira en conjunto al renovar. Se negocia distinto.`,
  },
  {
    id: 'comercio-actividad-declarada',
    tema: 'comercio',
    titulo: 'La línea de la póliza que discute tu siniestro',
    porQue:
      'Comerciantes y pymes. Es un problema que el lector puede tener HOY sin saberlo, y comprobarlo cuesta un minuto.',
    texto: `El motivo más habitual de que un siniestro de comercio acabe discutido no es la letra pequeña. Es una línea de la primera página: la actividad declarada.

La compañía tarifica según lo que pone ahí, porque es el riesgo que acepta. Si en la póliza consta «tienda de ropa» y hace dos años montaste un taller de arreglos en la trastienda, el riesgo real ya no es el que se aceptó. Y eso se mira justo cuando pasa algo.

No es una trampa: es cómo funciona el contrato. Y se arregla comunicándolo, que suele costar una llamada.

Si desde que firmaste has cambiado de actividad, ampliado el local o metido maquinaria nueva, abre la póliza y lee esa línea. Si no describe lo que haces hoy, actualízala antes de que haga falta.`,
  },
  {
    id: 'marca-corredor-agente',
    tema: 'marca',
    titulo: 'Corredor, agente y comparador no son lo mismo',
    porQue:
      'El único post de marca de la tanda. Explica por qué existe la correduría sin hablar de precio, y termina con un dato comprobable.',
    base: 'Real Decreto-ley 3/2020 (distribución de seguros; el corredor es mediador independiente, con clave DGSFP y RC obligatoria).',
    texto: `Corredor, agente y comparador no son lo mismo, y la diferencia se nota justo el día del siniestro.

· El agente representa a una compañía. Te ofrece su producto, y puede ser el que te conviene.
· El comparador ordena resultados. Nadie está mirando si esas coberturas son comparables entre sí.
· El corredor es un mediador independiente. Analiza el riesgo, trabaja con varias compañías y, cuando hay siniestro, está en tu lado del contrato.

No es una cuestión de simpatía: es a quién representa cada uno, y está en la ley (Real Decreto-ley 3/2020).

Un corredor, además, tiene una clave en el registro de la DGSFP que cualquiera puede consultar, y un seguro de responsabilidad civil obligatorio por si se equivoca.

La mía es CS-F/0170. Se puede comprobar.`,
  },
]

/** Un borrador con lo que le pasa, si le pasa algo. */
export type RevisionBorrador = {
  id: string
  infracciones: Infraccion[]
  /** Caracteres del texto. LinkedIn corta en `MAX_LINKEDIN`. */
  largo: number
  /** `true` si se puede publicar tal cual. */
  limpio: boolean
}

export function revisarBorrador(b: Borrador): RevisionBorrador {
  const infracciones = revisarCopy(b.texto)
  const largo = b.texto.length
  return { id: b.id, infracciones, largo, limpio: infracciones.length === 0 && largo <= MAX_LINKEDIN }
}

export function revisarBorradores(bs: readonly Borrador[] = BORRADORES): RevisionBorrador[] {
  return bs.map(revisarBorrador)
}

/** Frase para un mensaje de error o un aviso. `''` si está limpio. */
export function explicarRevision(r: RevisionBorrador): string {
  const partes: string[] = []
  if (r.infracciones.length > 0) partes.push(explicarInfracciones(r.infracciones))
  if (r.largo > MAX_LINKEDIN) partes.push(`${r.largo} caracteres (LinkedIn corta en ${MAX_LINKEDIN})`)
  return partes.join(' · ')
}
