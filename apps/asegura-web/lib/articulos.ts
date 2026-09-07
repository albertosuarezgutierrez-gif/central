// Los artículos del blog. Datos, no JSX — igual que `ramos.ts`, y por el mismo
// motivo: el copy se revisa de un vistazo, lo barre un test en cada commit y se
// reutiliza en el JSON-LD sin escribirlo dos veces.
//
// ─── Qué hacen aquí, y por qué no son «más páginas de ramo» ────────────────
// El mapa de consultas (`.claude/skills/seo-asegura/references/keywords.md`)
// tiene un bloque —intención de PROBLEMA— que ninguna página de ramo cubre:
// alguien que busca «cuánto tiempo tengo para no renovar el seguro» no está
// comprando, está atascado. Esas búsquedas casi no tienen competencia porque
// los comparadores no las trabajan: no venden nada al contestarlas.
//
// 🚨 REGLA REGULATORIA, la misma que `ramos.ts` (RDL 3/2020, arts. 173-178):
// esta web INFORMA, no asesora. Nada de precios, ahorros ni superlativos. Lo
// vigila `articulos.test.ts` con `revisarCopy` de `@central/module-seguros`,
// que es la MISMA lista que barre el copy de los ramos y los borradores de
// redes. Una sola fuente: dos copias divergen y una deja de vigilar.
//
// 🚨 Y UNA REGLA PROPIA DE ESTE FICHERO: si el texto cita una norma, el
// artículo declara `base` con cuál es. No es documentación — es lo que permite
// VERIFICARLA antes de publicar. Un número de artículo inventado en una web de
// seguros es peor que no citar ninguno: parece autoridad y no lo es.
//
// Todas las normas citadas aquí se comprobaron en fuente el 07/09/2026.

import type { Faq } from './ramos.ts'
import { url } from './sitio.ts'

export type SeccionArticulo = {
  /** `<h2>`. Uno por bloque; la jerarquía del artículo la marcan estos. */
  titulo: string
  /** Párrafos del bloque. Sin HTML: se pintan como `<p>`. */
  parrafos: readonly string[]
}

export type Articulo = {
  /** Segmento de URL: `/blog/<slug>`. No se cambia una vez publicado. */
  slug: string
  /** `<h1>`. Dice el problema del lector, no el nombre del producto. */
  h1: string
  /** `<title>` SIN la marca: la plantilla del layout se la añade sola. */
  title: string
  /** `<meta name="description">`. ~110-165 caracteres. */
  description: string
  /** Publicación, `AAAA-MM-DD`. Alimenta `datePublished` del JSON-LD. */
  fecha: string
  /** Última revisión, si la hubo. Alimenta `dateModified`. */
  revisado?: string
  /** Entradilla: la respuesta corta, antes de desarrollarla. */
  resumen: string
  /** La búsqueda que este artículo cubre. Para no escribir dos veces la misma. */
  consulta: string
  secciones: readonly SeccionArticulo[]
  faq?: readonly Faq[]
  /**
   * Las normas que el texto cita, con el nombre completo. Obligatorio si el
   * artículo nombra una ley o un artículo: es lo que se verifica antes de
   * publicar y lo que permite comprobarlo después.
   */
  base?: readonly string[]
  /** Slugs de `RAMOS` con los que enlaza. El enlazado interno reparte el peso. */
  ramos?: readonly string[]
}

export const ARTICULOS: readonly Articulo[] = [
  {
    slug: 'preaviso-un-mes-no-renovar-seguro',
    h1: 'El preaviso de un mes para no renovar tu seguro',
    title: 'El preaviso de un mes para no renovar el seguro',
    description:
      'Tu póliza no se decide el día que vence, sino un mes antes. Qué dice el artículo 22 de la Ley de Contrato de Seguro y cómo calcular tu fecha real.',
    fecha: '2026-09-07',
    consulta: 'preaviso de un mes para cancelar el seguro',
    resumen:
      'Si no quieres que tu póliza se prorrogue, tienes que decirlo por escrito con al menos un mes de antelación al vencimiento. Pasada esa fecha ya no hay decisión que tomar: hay un año más.',
    base: ['Artículo 22 de la Ley 50/1980, de 8 de octubre, de Contrato de Seguro (prórroga y oposición a la prórroga).'],
    ramos: ['auto', 'hogar', 'comunidades'],
    secciones: [
      {
        titulo: 'Qué dice exactamente la ley',
        parrafos: [
          'El artículo 22 de la Ley de Contrato de Seguro establece que el contrato se prorroga automáticamente al final de cada periodo, y que cualquiera de las dos partes puede oponerse a esa prórroga notificándoselo a la otra por escrito.',
          'Los plazos no son iguales para los dos. El tomador —tú— necesita avisar con al menos un mes de antelación a la fecha de vencimiento. La compañía, si es ella la que no quiere renovar, necesita dos meses.',
          'Esa asimetría no es un detalle: significa que el margen para decidir es tuyo solo hasta cierto día, y que la aseguradora tiene que darte más tiempo del que te da a ti.',
        ],
      },
      {
        titulo: 'Cómo se calcula tu fecha real',
        parrafos: [
          'Coge la fecha de vencimiento de la póliza y réstale un mes. Ese es el último día en que puedes decidir.',
          'Si tu seguro vence el 15 de marzo, tu fecha es el 13 de febrero. El 20 de febrero la conversación ya no es «me quedo o me voy»: es «me quedo un año más y lo miro el que viene».',
          'Es la fecha que más se pasa, y no por descuido: el recibo llega después, así que muchas personas se enteran de que la póliza se ha renovado cuando ya no podían evitarlo.',
        ],
      },
      {
        titulo: 'Cómo se comunica',
        parrafos: [
          'Por escrito y dejando constancia de la fecha en que se envió. Un correo electrónico a la dirección que la compañía tenga señalada, un burofax o el canal que la propia póliza indique para las comunicaciones.',
          'Guarda el justificante. Si más adelante hay discusión sobre si avisaste a tiempo, lo que cuenta es poder demostrar CUÁNDO se envió, no que se enviara.',
          'Y una recomendación de sentido común: no dejes de pagar el recibo como forma de cancelar. No es una notificación, y las consecuencias de un impago son distintas —y peores— que las de una no renovación en plazo.',
        ],
      },
      {
        titulo: 'Qué hacemos nosotros con esta fecha',
        parrafos: [
          'Cuando llevamos una póliza, la fecha que avisamos al cliente no es la del vencimiento: es la accionable, la de un mes antes. Avisar el día del vencimiento es avisar cuando ya no se puede hacer nada.',
          'Si tienes varias pólizas repartidas entre compañías, ese calendario es justo lo que se pierde. Merece la pena tenerlas apuntadas en algún sitio con la fecha corregida, aunque sea en un papel.',
        ],
      },
    ],
    faq: [
      {
        pregunta: '¿Vale con llamar por teléfono para no renovar?',
        respuesta:
          'La ley pide una notificación por escrito. Una llamada puede servir para avisar, pero no deja constancia de la fecha, que es justo lo que se discute cuando hay desacuerdo. Envía el escrito aunque hayas llamado antes.',
      },
      {
        pregunta: 'Se me ha pasado la fecha. ¿Puedo hacer algo?',
        respuesta:
          'La póliza queda prorrogada un periodo más. Lo que sí puedes hacer es preparar la salida con tiempo para el vencimiento siguiente y, mientras tanto, revisar si las coberturas y las sumas aseguradas siguen encajando con lo que tienes.',
      },
      {
        pregunta: '¿Y si la compañía es la que no quiere renovarme?',
        respuesta:
          'Puede hacerlo, pero tiene que comunicártelo con al menos dos meses de antelación al vencimiento. Ese plazo mayor existe para darte margen de buscar alternativa.',
      },
      {
        pregunta: '¿Cambiar de correduría obliga a cambiar de seguro?',
        respuesta:
          'No. Son dos cosas distintas: la póliza sigue con su compañía y lo que cambia es quién la gestiona y quién te representa ante ella.',
      },
    ],
  },
  {
    slug: 'me-han-subido-el-seguro-en-la-renovacion',
    h1: 'Me han subido el seguro en la renovación: qué mirar antes de decidir',
    title: 'Me han subido el seguro en la renovación',
    description:
      'La prima sube y el recibo llega sin explicación. Qué puede cambiar la compañía al vencimiento, qué preguntar antes de moverte y cuál es tu plazo real.',
    fecha: '2026-09-07',
    consulta: 'me han subido el seguro del coche en la renovación',
    resumen:
      'Una subida en la renovación no siempre significa lo mismo, y la respuesta correcta depende de por qué ha subido. Antes de cambiar de compañía conviene saber qué ha cambiado en la póliza.',
    base: [
      'Artículo 22 de la Ley 50/1980, de 8 de octubre, de Contrato de Seguro (prórroga; el asegurador debe comunicar su oposición con dos meses de antelación).',
    ],
    ramos: ['auto', 'hogar', 'comercio'],
    secciones: [
      {
        titulo: 'Primero: distinguir una subida de un cambio de contrato',
        parrafos: [
          'No es lo mismo que suba la prima manteniendo lo mismo, que la compañía modifique las condiciones para el periodo siguiente. Lo segundo tiene que comunicártelo con antelación al vencimiento, y entonces la decisión que tienes delante no es solo de precio: es de contenido.',
          'Así que la primera pregunta no es «cuánto ha subido», sino «qué ha cambiado». Compara el recibo nuevo con las condiciones particulares: capitales, franquicias, garantías incluidas y excluidas.',
        ],
      },
      {
        titulo: 'Los motivos habituales, y qué se puede hacer con cada uno',
        parrafos: [
          'Siniestralidad. Si has dado partes, la compañía recalcula el riesgo. Es lo más frecuente y también lo que más se puede negociar: a veces compensa asumir una franquicia mayor a cambio de recuperar la prima anterior.',
          'Revalorización automática. Muchas pólizas de hogar y de comunidad actualizan capitales cada año con un índice. La prima sube porque el capital asegurado sube, y eso no es una subida arbitraria: si el capital ya no se corresponde con la realidad del inmueble, lo que hay que revisar es el capital.',
          'Cambios del propio riesgo. Un conductor nuevo, un local que ha ampliado actividad, una obra en la comunidad. Aquí la subida responde a algo que efectivamente ha cambiado.',
          'Cambio de política de la compañía. Ocurre, y es el caso en el que menos margen hay dentro de esa aseguradora.',
        ],
      },
      {
        titulo: 'Qué pedir antes de mover nada',
        parrafos: [
          'El detalle del recibo, con la prima desglosada. Un número total no dice nada; el desglose sí, porque separa lo que es prima de lo que son impuestos y recargos.',
          'El histórico de siniestros que la compañía te aplica. Si hay un parte que no reconoces, o uno que se cerró sin coste, conviene aclararlo antes de aceptar el recálculo.',
          'Las condiciones particulares del periodo nuevo. Es donde aparece si además de subir el precio ha cambiado alguna garantía.',
        ],
      },
      {
        titulo: 'Y el reloj que corre mientras decides',
        parrafos: [
          'Aunque la subida te parezca injustificada, tu plazo para oponerte a la prórroga sigue siendo el mismo: un mes antes del vencimiento, por escrito.',
          'Es el error más caro de esta situación. Se pide explicación, se espera respuesta, la respuesta tarda, y cuando llega ya se ha pasado la fecha en la que se podía decidir. Pide la explicación y prepara la notificación en paralelo: si al final te quedas, no la envías.',
        ],
      },
      {
        titulo: 'Cambiar de compañía no siempre es la respuesta',
        parrafos: [
          'A veces sí y a veces no, y lo que decide es la comparación de coberturas, no la del recibo. Dos pólizas con la misma prima pueden tener franquicias, capitales y exclusiones muy distintas, y eso solo se ve cuando alguien las lee en paralelo.',
          'Como corredores eso es exactamente lo que hacemos: analizar el riesgo y llevarlo a varias compañías. Lo que no puede hacerse desde una web —ni desde un comparador— es decirte de antemano qué va a pasar con tu prima, porque la fija cada aseguradora según tu riesgo concreto.',
        ],
      },
    ],
    faq: [
      {
        pregunta: '¿La compañía puede subirme la prima sin avisar?',
        respuesta:
          'La prima del periodo siguiente aparece en el recibo de renovación. Si además modifica las condiciones del contrato para ese periodo, esa modificación tiene que comunicártela antes del vencimiento, con el plazo que la ley señala.',
      },
      {
        pregunta: 'He dado un parte y no me han indemnizado. ¿Cuenta igual?',
        respuesta:
          'Depende de la compañía y de cómo se cerrara el expediente. Un parte declarado y cerrado sin coste no debería computar igual que uno indemnizado; si aparece en tu histórico, pídelo por escrito y revisa el detalle.',
      },
      {
        pregunta: '¿Me penaliza cambiar de aseguradora todos los años?',
        respuesta:
          'En algunos ramos la antigüedad con la misma compañía influye en las condiciones que te ofrece. Es un factor más a tener en cuenta, junto con las coberturas, no una razón por sí sola para quedarse ni para irse.',
      },
    ],
  },
  {
    slug: 'siniestro-denegado-que-hacer',
    h1: 'Te han denegado un siniestro: los plazos y los pasos',
    title: 'Qué hacer si te deniegan un siniestro',
    description:
      'Qué plazos tiene la aseguradora para pagar, qué pedir cuando rechaza un siniestro y en qué orden se reclama. Con los artículos de la ley que lo regulan.',
    fecha: '2026-09-07',
    consulta: 'me han denegado un siniestro qué puedo hacer',
    resumen:
      'Una denegación no es la última palabra, pero sí arranca un reloj. Estos son los plazos que la ley impone a la compañía, los que te impone a ti, y el orden en que conviene reclamar.',
    base: [
      'Artículo 18 de la Ley 50/1980, de 8 de octubre, de Contrato de Seguro (pago del importe mínimo en cuarenta días desde la declaración del siniestro).',
      'Artículo 20 de la Ley 50/1980 (mora del asegurador: interés legal del dinero incrementado en un 50 %).',
      'Artículo 23 de la Ley 50/1980 (prescripción: dos años en seguros de daños, cinco en seguros de personas).',
      'Orden ECC/2502/2012 (Servicio de Reclamaciones de la Dirección General de Seguros y Fondos de Pensiones).',
    ],
    ramos: ['hogar', 'comunidades', 'auto'],
    secciones: [
      {
        titulo: 'Lo primero: pide la denegación por escrito y motivada',
        parrafos: [
          'Una denegación verbal o un «esto no entra» por teléfono no sirve para nada, ni para ti ni para discutirlo después. Pide que te digan por escrito qué cláusula aplican y por qué.',
          'Ese documento es la pieza central de todo lo demás. Sin él no se puede saber si el problema es que el daño no está cubierto, que hay una exclusión aplicable, que falta documentación o que discrepan en la valoración. Son cuatro problemas distintos con cuatro salidas distintas.',
        ],
      },
      {
        titulo: 'Los plazos que la ley impone a la compañía',
        parrafos: [
          'El artículo 18 de la Ley de Contrato de Seguro obliga a la aseguradora a pagar, dentro de los cuarenta días desde que recibe la declaración del siniestro, el importe mínimo de lo que pueda deber según lo que ya conoce. No es la indemnización final: es un pago a cuenta mientras se peritan los daños.',
          'El artículo 20 añade la consecuencia de incumplirlo. La compañía incurre en mora si no ha cumplido su prestación en el plazo de tres meses desde el siniestro, o si no ha pagado ese importe mínimo en los cuarenta días. La indemnización por mora es un interés anual igual al legal del dinero incrementado en un 50 %.',
          'Conviene saberlo aunque no acabes reclamándolo: cambia el tono de la conversación cuando la compañía sabe que el plazo corre.',
        ],
      },
      {
        titulo: 'Si discrepáis en el importe, no en la cobertura',
        parrafos: [
          'Es un caso distinto del rechazo, y tiene su propia vía. En los seguros de daños, cuando las partes no se ponen de acuerdo en la valoración, la ley prevé un procedimiento de peritación en el que cada parte designa a un perito y, si no coinciden, se nombra a un tercero.',
          'Antes de llegar ahí, pide el informe del perito de la compañía. Muchas discrepancias de importe se resuelven al leerlo, porque aparece qué partidas ha valorado y cuáles no ha incluido.',
        ],
      },
      {
        titulo: 'El orden en que se reclama',
        parrafos: [
          'Primero, el Servicio de Atención al Cliente de la propia aseguradora. Es un trámite obligado antes de ir más allá y a veces resuelve, sobre todo cuando el problema era documental.',
          'Si no responde en dos meses o su respuesta no te satisface, el Servicio de Reclamaciones de la Dirección General de Seguros y Fondos de Pensiones. Es gratuito y no necesitas abogado. Su informe no es vinculante para la compañía, pero pesa, y presentar la reclamación interrumpe el plazo de prescripción mientras se tramita.',
          'Y en último término, la vía judicial. Aquí manda el artículo 23: dos años para reclamar en los seguros de daños y cinco en los de personas, contados desde que pudiste ejercer la acción.',
        ],
      },
      {
        titulo: 'Dónde entra un corredor',
        parrafos: [
          'En que la reclamación la hace alguien que lee el condicionado todos los días y que no trabaja para la aseguradora. Un corredor es un mediador independiente: cuando hay siniestro, está en tu lado del contrato.',
          'No siempre se gana —hay denegaciones correctas, y decirlo también forma parte del trabajo—, pero la diferencia entre una reclamación bien planteada y un correo de queja es enorme, y casi siempre está en citar la cláusula exacta y el plazo exacto.',
        ],
      },
    ],
    faq: [
      {
        pregunta: '¿Cuánto tiempo tengo para reclamar?',
        respuesta:
          'El artículo 23 de la Ley de Contrato de Seguro fija dos años en los seguros de daños y cinco en los de personas. Presentar la reclamación ante el Servicio de Reclamaciones de la DGSFP interrumpe ese plazo mientras se tramita.',
      },
      {
        pregunta: '¿Tengo que pagar un abogado para reclamar a la DGSFP?',
        respuesta:
          'No. La reclamación ante el Servicio de Reclamaciones es gratuita y se presenta sin abogado ni procurador. Antes hay que haber pasado por el Servicio de Atención al Cliente de la aseguradora.',
      },
      {
        pregunta: 'La compañía tarda meses y no me dice nada. ¿Eso tiene consecuencia?',
        respuesta:
          'Sí. El artículo 20 prevé intereses de demora cuando la aseguradora no cumple su prestación en tres meses desde el siniestro o no abona el importe mínimo dentro de los cuarenta días desde la declaración.',
      },
      {
        pregunta: '¿Puede la compañía anular mi póliza por haber reclamado?',
        respuesta:
          'Puede oponerse a la prórroga al vencimiento, como en cualquier otra póliza, avisando con dos meses de antelación. Lo que no puede es resolver el contrato en marcha por el hecho de que hayas reclamado.',
      },
    ],
  },
]

export function articuloPorSlug(slug: string): Articulo | null {
  return ARTICULOS.find((a) => a.slug === slug) ?? null
}

/** Todo el texto visible de un artículo, en una cadena, para barrerlo. */
export function textoArticulo(a: Articulo): string {
  return [
    a.h1,
    a.title,
    a.description,
    a.resumen,
    ...a.secciones.flatMap((s) => [s.titulo, ...s.parrafos]),
    ...(a.faq ?? []).flatMap((f) => [f.pregunta, f.respuesta]),
  ].join(' ')
}

/** Los artículos que enlazan con un ramo. Alimenta el enlazado de su página. */
export function articulosDeRamo(slug: string): Articulo[] {
  return ARTICULOS.filter((a) => a.ramos?.includes(slug))
}

/**
 * Entradas de sitemap del blog: el índice más una fila por artículo.
 *
 * 🚨 Vive aquí, y no dentro de `app/sitemap.ts`, por una razón de VERIFICACIÓN:
 * el sitemap de Next no se puede ejecutar desde `node --test` (alias `@/`, tipos
 * de `next`), así que su guardián solo podía leer el fuente con expresiones
 * regulares — y al romperlo a propósito el 07/09/2026 se quedó VERDE con la
 * lista de artículos borrada del sitemap, porque el texto del cuerpo del `map`
 * seguía en el fichero. Con la construcción en una función pura, el cepo
 * comprueba las URL y las fechas que salen de verdad.
 *
 * El parámetro `articulos` existe para el guardián: con los tres artículos
 * publicados el mismo día, un cepo sobre «qué fecha se emite» no puede ponerse
 * rojo si le cambias `a.fecha` por `new Date()` —salen iguales—, así que el test
 * le pasa artículos con fechas del pasado y ahí sí se ve la diferencia.
 *
 * Las fechas SÍ se declaran (al contrario que en la portada y los ramos, donde
 * se omiten): aquí cada artículo sabe cuándo se publicó y cuándo se revisó, así
 * que `lastModified` es un dato, no la hora de la petición disfrazada de dato.
 */
export function entradasSitemapBlog(articulos: readonly Articulo[] = ARTICULOS): {
  url: string
  lastModified: Date
  changeFrequency: 'weekly' | 'yearly'
  priority: number
}[] {
  const fechas = articulos.map((a) => a.revisado ?? a.fecha).sort()
  return [
    {
      url: url('/blog'),
      // El índice cambió cuando cambió su artículo más reciente. Literal, no estimado.
      lastModified: new Date(fechas[fechas.length - 1]),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    ...articulos.map((a) => ({
      url: url(`/blog/${a.slug}`),
      lastModified: new Date(a.revisado ?? a.fecha),
      changeFrequency: 'yearly' as const,
      priority: 0.7,
    })),
  ]
}
