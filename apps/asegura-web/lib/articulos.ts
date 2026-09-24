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
   * Las normas que el texto cita, por su **id** en `NORMAS_CITABLES`
   * (`@central/module-seguros`) — no como texto libre.
   *
   * 🚨 El cambio importa: con texto libre, «declarar la base» solo probaba que
   * alguien había escrito una frase; el artículo podía citar el 38 y declarar
   * el 22 sin que nada fallara. Con ids, la cita se resuelve contra una lista
   * verificada contra el BOE, la página enlaza la fuente, y un cepo comprueba
   * que TODA norma nombrada en el texto esté respaldada. Es lo que hace
   * publicable un artículo que no ha escrito una persona.
   */
  base?: readonly string[]
  /** Slugs de `RAMOS` con los que enlaza. El enlazado interno reparte el peso. */
  ramos?: readonly string[]
  /**
   * La llamada a la acción DENTRO del artículo (19/09/2026), pintada entre el
   * cuerpo y las FAQ. Es opcional a propósito: solo la llevan los artículos
   * cuya intención tiene una herramienta detrás (la carta de no renovación
   * del gestor). Un CTA genérico en cada artículo es ruido, no conversión.
   * `href` es una ruta interna o el centinela `'PORTAL'`, que la página del
   * artículo resuelve a `PORTAL_URL` (aquí no se importa `lib/sitio` para no
   * arrastrar la config del sitio al módulo de contenido); el texto pasa por el
   * mismo cepo de copy que el resto (`textoArticulo` lo incluye).
   */
  cta?: { titulo: string; texto: string; boton: string; href: string }
}

export const ARTICULOS: readonly Articulo[] = [
  {
    slug: 'preaviso-un-mes-no-renovar-seguro',
    h1: 'El preaviso de un mes para no renovar tu seguro',
    title: 'Preaviso de un mes para no renovar el seguro',
    description:
      'Tu póliza no se decide el día que vence, sino un mes antes. Qué dice el artículo 22 de la Ley de Contrato de Seguro y cómo calcular tu fecha real.',
    fecha: '2026-09-07',
    consulta: 'preaviso de un mes para cancelar el seguro',
    resumen:
      'Si no quieres que tu póliza se prorrogue, tienes que decirlo por escrito con al menos un mes de antelación al vencimiento. Pasada esa fecha ya no hay decisión que tomar: hay un año más.',
    base: ['lcs-22'],
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
    base: ['lcs-22'],
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
    base: ['lcs-18', 'lcs-20', 'lcs-23', 'orden-ecc-2502-2012'],
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
  {
    slug: 'que-cubre-de-verdad-el-seguro-de-hogar',
    h1: 'Qué cubre de verdad tu seguro de hogar (y qué no)',
    title: 'Qué cubre de verdad tu seguro de hogar',
    description:
      'Continente, contenido y los límites que nadie lee hasta el siniestro: qué cubre un seguro de hogar estándar, qué queda fuera y qué capital declarar.',
    fecha: '2026-09-15',
    consulta: 'qué cubre de verdad mi seguro de hogar',
    resumen:
      'Un seguro de hogar no cubre "la casa": cubre lo que has declarado, del modo en que lo has declarado. La mayoría de sorpresas en un siniestro salen de dos sitios: confundir continente con contenido, y un capital que no se revisó desde que se contrató.',
    ramos: ['hogar', 'comunidades'],
    secciones: [
      {
        titulo: 'Continente y contenido no son el mismo seguro',
        parrafos: [
          'El continente es la vivienda en sí: paredes, suelos, techos, instalaciones fijas y la cocina que viene empotrada. El contenido es todo lo que te llevarías si te mudaras: muebles, electrodomésticos, ropa, menaje.',
          'Si eres propietario y vives en la vivienda, normalmente necesitas los dos. Si vives de alquiler, el continente suele ser cosa de quien te alquila, y lo tuyo es el contenido —además de la responsabilidad civil, para lo que puedas causar sin querer a un vecino—.',
          'La confusión más cara pasa al revés de lo que parece: alguien asegura bien el continente y dice "ya está protegido", y el día que se estropea el sofá, el frigorífico o el portátil descubre que eso vivía en la otra póliza, la que no contrató.',
        ],
      },
      {
        titulo: 'Los objetos que llevan límite propio, aunque la póliza diga "todo riesgo"',
        parrafos: [
          'Joyas, relojes, dinero en efectivo, obras de arte, instrumentos musicales, bicicletas o el portátil que sacas de casa todos los días: casi ninguna póliza los cubre por su valor real sin más. Llevan un sublímite —una cantidad tope, mucho más baja que el capital general del contenido— salvo que se declaren aparte.',
          '"Todo riesgo" describe el tipo de cobertura —cualquier daño accidental, no solo una lista cerrada de causas—, no el importe. Un anillo de herencia o una cámara profesional pueden superar ese sublímite sin que nadie se haya dado cuenta hasta que hace falta reclamarlo.',
          'Si tienes algo así en casa, es una pregunta concreta que hacer antes de firmar, no una duda para el día del siniestro: cuál es el límite para esa categoría y si compensa declararlo aparte.',
        ],
      },
      {
        titulo: 'Lo que casi ninguna póliza cubre sin más',
        parrafos: [
          'Un seguro de hogar cubre daños accidentales y súbitos: una tubería que revienta, una tormenta, un incendio. Lo que no suele cubrir es el deterioro progresivo: una humedad que lleva meses filtrando por falta de mantenimiento, una grieta que avanza poco a poco, una instalación vieja que nunca se revisó.',
          'La diferencia entre las dos cosas no siempre es obvia desde fuera —una mancha de humedad puede venir de una avería puntual o de un problema que arrastra años—, y es exactamente lo que un perito viene a determinar. Por eso el informe de la aseguradora, cuando deniega algo, tiene que decir cuál de las dos cosas ha visto.',
          'También suelen quedar fuera los daños en una vivienda desocupada más allá de cierto tiempo seguido, y cualquier daño causado a propósito. Y el capital de contenido no cubre lo que ya estaba roto antes de contratar: un seguro protege contra lo que puede pasar, no repara lo que ya había pasado.',
        ],
      },
      {
        titulo: 'El capital asegurado: por qué "de menos" sale más caro que "de más"',
        parrafos: [
          'El continente se asegura por el valor de reconstrucción —lo que costaría volver a levantar la vivienda—, no por el precio al que se vendería ni por lo que se pagó al comprarla: el suelo no hay que reconstruirlo. El contenido se asegura por el valor de reposición: lo que costaría comprar hoy algo equivalente a lo que tienes.',
          'Un capital que se queda corto no solo limita lo que se cobra en un siniestro total: en muchas pólizas, si el capital declarado es menor que el valor real, la indemnización de un daño PARCIAL también se reduce en la misma proporción, no solo la de un siniestro que se lo lleve todo.',
          'Y un capital revisado hace años suele quedarse corto sin que nadie lo note: una reforma, una cocina nueva, un salón que se ha ido llenando. Es de las pocas cosas de la póliza que conviene mirar aunque no haya pasado nada, no solo cuando cambia de vencimiento.',
        ],
      },
      {
        titulo: 'Dónde entra revisarlo antes, y no después',
        parrafos: [
          'Casi todo lo de arriba está escrito en las condiciones particulares del contrato: los sublímites por categoría, qué se entiende por vivienda desocupada, cómo se calcula el capital. Es un documento largo y técnico, y es normal que nadie lo lea entero hasta que hace falta.',
          'Como corredores, eso es justo lo que miramos antes de que firmes: qué capital tiene sentido para tu vivienda, qué objetos merecen declararse aparte y qué exclusiones son razonables y cuáles no. La diferencia no se nota el día que contratas, se nota el día que necesitas usarlo.',
        ],
      },
    ],
    faq: [
      {
        pregunta: '¿Mi seguro de hogar cubre las humedades?',
        respuesta:
          'Depende de la causa. Una avería puntual y accidental —una tubería que revienta— suele estar cubierta. Una humedad que avanza despacio por falta de mantenimiento o por un problema estructural de fondo, normalmente no. Lo determina el informe del perito.',
      },
      {
        pregunta: 'Vivo de alquiler, ¿tengo que asegurar el continente?',
        respuesta:
          'Habitualmente no: el continente suele ser responsabilidad de quien te alquila la vivienda. Lo tuyo como inquilino es el contenido —tus muebles y pertenencias— y la responsabilidad civil por lo que puedas causar sin querer.',
      },
      {
        pregunta: 'Tengo joyas de valor en casa, ¿están cubiertas por el todo riesgo?',
        respuesta:
          'Probablemente hasta un límite, no por su valor completo. Las joyas, el efectivo y otros objetos de valor suelen llevar un sublímite propio dentro del capital de contenido. Merece la pena preguntarlo y, si hace falta, declararlos aparte antes de que ocurra algo, no después.',
      },
      {
        pregunta: '¿Y lo que pasa en las zonas comunes del edificio?',
        respuesta:
          'Eso lo cubre el seguro de la comunidad, no el tuyo. Cuándo interviene uno y cuándo el otro —por ejemplo, en una fuga que empieza en una tubería comunitaria— depende de dónde esté el origen del daño.',
      },
    ],
  },
  {
    slug: 'cuando-empieza-a-cubrir-un-seguro',
    h1: '¿Desde cuándo cubre un seguro recién contratado?',
    title: '¿Desde cuándo cubre un seguro contratado?',
    description: 'Un seguro no cubre desde que lo firmas ni desde que lo pagas. Te explicamos cuándo empieza la cobertura real y por qué importa.',
    fecha: '2026-09-15',
    resumen: 'Un seguro empieza a cubrir desde la fecha de efecto que marca el contrato, no desde que lo firmas ni pagas. Firmar y pagar son pasos previos necesarios, pero la cobertura arranca cuando el contrato dice, y un siniestro antes de esa fecha no está cubierto.',
    consulta: 'desde cuándo cubre un seguro recién contratado',
    ramos: ['hogar', 'auto'],
    secciones: [
      {
        titulo: 'Firmar, pagar y que empiece a cubrir: tres momentos distintos',
        parrafos: [
          'Contratas un seguro hoy y crees que ya estás protegido. Pero si tienes un siniestro esta misma tarde, puede que te lleves una sorpresa: el seguro no cubre todavía.',
          'Hay tres momentos que no coinciden en el tiempo. Primero firmas la póliza, o aceptas la propuesta. Después pagas la primera prima, o al menos la fracción inicial. Y solo entonces empieza la cobertura, en la fecha de efecto que marca el contrato.',
          'La fecha de efecto es la que cuenta. Puede ser el mismo día que firmas, el día siguiente, o varios días después. Depende de cómo se haya acordado y de cuándo se complete el pago. Pero hasta que no llega esa fecha, el seguro no responde.',
        ],
      },
      {
        titulo: 'Por qué un siniestro del mismo día puede quedar fuera',
        parrafos: [
          'Imagina que contratas un seguro de hogar por la mañana y por la tarde se te inunda la cocina. Si la fecha de efecto es mañana a las cero horas, ese siniestro no está cubierto. El contrato no estaba en vigor cuando ocurrió.',
          'Esto no es mala fe de la aseguradora. Es que el contrato funciona como cualquier otro: tiene una fecha de inicio. Antes de esa fecha, no hay obligación de cubrir nada.',
          'Por eso es importante preguntar cuándo empieza la cobertura antes de firmar. Si necesitas protección inmediata, hay que asegurarse de que la fecha de efecto sea hoy mismo, y de que el pago esté hecho antes de esa hora.',
          'En algunos seguros, sobre todo los obligatorios como el de coche, la cobertura puede empezar en el momento en que se completa el pago y se emite el certificado. Pero en otros, como los de hogar o salud, lo habitual es que haya un desfase de al menos un día.',
        ],
      },
      {
        titulo: 'Qué pasa si pagas tarde o el recibo se devuelve',
        parrafos: [
          'Si firmas pero no pagas, el seguro no empieza. La fecha de efecto queda en suspenso hasta que se complete el pago. Y si el primer recibo se devuelve, la aseguradora puede anular el contrato desde el principio, como si nunca hubiera existido.',
          'Esto significa que si tienes un siniestro antes de que se regularice el pago, no hay cobertura. Aunque hayas firmado, aunque tengas el número de póliza, aunque te hayan enviado el documento.',
          'En renovaciones es distinto. Si ya eres cliente y se te devuelve un recibo, la aseguradora suele darte un plazo para pagarlo antes de suspender la cobertura. Pero en la primera contratación no hay margen: sin pago, no hay seguro.',
        ],
      },
      {
        titulo: 'Cómo asegurarte de que la cobertura empieza cuando la necesitas',
        parrafos: [
          'Antes de firmar, pregunta cuándo empieza la cobertura. Pide que te lo pongan por escrito en la propuesta o en el correo de confirmación.',
          'Si necesitas que empiece hoy, dilo claramente. A veces es posible adelantar la fecha de efecto si el pago se hace al momento, por ejemplo con tarjeta o transferencia inmediata.',
          'Guarda el justificante de pago y el documento de la póliza. Si hay un siniestro justo después de contratar, vas a necesitar demostrar que el contrato estaba en vigor.',
          'Y si tienes dudas, pregúntanos. Como corredores, podemos coordinar con la aseguradora para que la fecha de efecto se ajuste a lo que necesitas, y evitar que te quedes sin cobertura en el momento crítico.',
        ],
      },
    ],
    faq: [
      { pregunta: '¿Puedo contratar un seguro con efecto retroactivo?', respuesta: 'No. Un seguro no puede cubrir algo que ya ha pasado. La fecha de efecto siempre es presente o futura. Si ya has tenido un siniestro, no puedes contratar un seguro para cubrirlo después.' },
      { pregunta: '¿Qué pasa si tengo un siniestro el mismo día que contrato pero antes de pagar?', respuesta: 'No está cubierto. Sin pago no hay cobertura, aunque hayas firmado la propuesta. El contrato solo surte efecto cuando se completa el pago y llega la fecha de efecto acordada.' },
      { pregunta: '¿Puedo cancelar un seguro antes de que empiece a cubrir?', respuesta: 'Depende de cómo lo hayas contratado. Si lo contrataste a distancia, por internet o por teléfono, la ley te da un plazo para desistir sin tener que explicar por qué, y en los seguros de vida ese plazo es más largo. Fuera de esos casos, si puedes anularlo y con qué coste lo marcan las condiciones de tu póliza. Antes de firmar, pregunta cómo se anula y qué pasa con la prima que ya hayas pagado.' },
    ],
  },
  // ⬇️ MARCADOR DE INSERCIÓN — no quitar.
  //
  {
    slug: 'como-dar-de-baja-un-seguro-a-tiempo',
    h1: 'Cómo dar de baja un seguro a tiempo, paso a paso',
    title: 'Cómo dar de baja un seguro a tiempo',
    description:
      'Para no renovar un seguro hay que avisar por escrito un mes antes del vencimiento. Qué lleva la carta, por dónde enviarla y qué hacer después. Vale para todas.',
    fecha: '2026-09-19',
    consulta: 'cómo dar de baja un seguro',
    resumen:
      'Un seguro no se «da de baja» cuando quieres: se decide no renovarlo, por escrito, con al menos un mes de antelación al vencimiento. Si sigues estos pasos y guardas el justificante, la póliza termina el día que vence y no te llega ningún recibo más.',
    base: ['lcs-22'],
    ramos: ['auto', 'hogar', 'vida-y-salud'],
    cta: {
      titulo: 'Te preparamos la carta con los datos de tu póliza',
      texto:
        'Sube el PDF o una foto de tu póliza a tu área privada: la leemos, te decimos hasta qué día puedes enviarla y te dejamos la carta lista para copiar, imprimir o abrir en tu correo. La envías tú, y queda a tu nombre. Gratis y sin ser cliente.',
      boton: 'Preparar mi carta',
      href: 'PORTAL',
    },
    secciones: [
      {
        titulo: 'Primero: no es una baja, es no renovar',
        parrafos: [
          'La mayoría de los seguros —coche, hogar, salud, decesos— son contratos anuales que se prorrogan solos cada año. Por eso lo que haces cuando «das de baja» un seguro no es cancelarlo hoy: es decirle a la compañía que no quieres la prórroga siguiente.',
          'Eso tiene una consecuencia: no puedes dejar el seguro a mitad de año sin más. Lo normal es que la póliza siga en vigor hasta la fecha de vencimiento y termine ese día. Salvo que la propia póliza prevea otra cosa, o que vendas el bien asegurado, la salida está en el vencimiento.',
          'Y tiene una ventaja: mientras llega, sigues cubierto. Nadie se queda sin seguro por avisar con tiempo.',
        ],
      },
      {
        titulo: 'Segundo: calcula tu fecha de verdad',
        parrafos: [
          'El artículo 22 de la Ley de Contrato de Seguro exige que el tomador comunique por escrito su oposición a la prórroga con al menos un mes de antelación al vencimiento. La compañía, si es ella la que no quiere renovarte, necesita dos.',
          'Así que tu fecha no es la del vencimiento: es un mes antes. Si vence el 15 de marzo, el último día para avisar es el 13 de febrero. A partir de ahí la póliza se renueva un año más, aunque no hayas pagado todavía el recibo.',
          'Es la fecha que más gente se pasa, y no por descuido: el recibo de la renovación llega después de esa fecha, cuando ya no hay nada que decidir.',
        ],
      },
      {
        titulo: 'Tercero: qué tiene que llevar la carta',
        parrafos: [
          'No hay un modelo oficial. Basta un escrito claro con: tu nombre y apellidos y tu NIF como tomador; el número de póliza; la compañía a la que va dirigida; la fecha de vencimiento; y la frase que importa: que comunicas tu voluntad de no prorrogar el contrato a su vencimiento, conforme al artículo 22 de la Ley de Contrato de Seguro.',
          'Añade la petición de que te confirmen por escrito la recepción y la baja con efectos desde el vencimiento, y de que no emitan recibos por periodos posteriores. Fecha y firma.',
          'Algunas compañías piden además una copia del DNI del tomador. Si la tuya lo indica en su web o en la póliza, adjúntala: es un motivo habitual para que una solicitud se quede sin tramitar.',
        ],
      },
      {
        titulo: 'Cuarto: por dónde enviarla, y por dónde no',
        parrafos: [
          'Lo que cuenta es poder demostrar cuándo se envió. Sirven: el correo electrónico a la dirección que la compañía tenga señalada para estas comunicaciones, el formulario de baja de su área de cliente, o un burofax con acuse de recibo a su domicilio social. La póliza suele indicar el canal en sus condiciones.',
          'Guarda el justificante: el correo enviado, el acuse del burofax, la captura del formulario con la fecha. Si más adelante hay discusión, lo que decide es la fecha de envío.',
          'Lo que no vale: llamar por teléfono sin más, y dejar de pagar el recibo. Una llamada no deja constancia; un impago no es una notificación y tiene consecuencias propias, peores que no renovar en plazo.',
        ],
      },
      {
        titulo: 'Quinto: qué pasa después',
        parrafos: [
          'La compañía debería confirmarte por escrito que la póliza queda sin efecto desde el vencimiento. Si en dos semanas no tienes respuesta, reclama por el mismo canal, adjuntando tu envío anterior.',
          'Si aun así te giran el recibo de la renovación, no lo devuelvas sin más: contesta por escrito con tu justificante y pide la anulación. Devolver un recibo sin explicar por qué se parece mucho a un impago.',
          'Y si vas a contratar otro seguro, que empiece el mismo día en que termina el anterior. Un hueco de un día entre los dos es un día sin cobertura, y en el coche, además, una infracción.',
        ],
      },
      {
        titulo: 'Y una alternativa que casi nadie conoce',
        parrafos: [
          'Si lo que te pasa es que nadie te atiende, no hace falta cancelar el seguro para arreglarlo. Puedes cambiar de correduría sin cambiar de compañía: la póliza sigue igual, con el mismo número, las mismas coberturas y el mismo precio, y lo que cambia es quién la gestiona y quién te representa ante la aseguradora.',
          'Es un trámite aparte, sin esperar al vencimiento y sin preaviso. Lo contamos en detalle en la página de cambio de correduría.',
        ],
      },
    ],
    faq: [
      {
        pregunta: '¿Puedo dar de baja el seguro antes de que venza?',
        respuesta:
          'Como norma general, no: el contrato dura hasta el vencimiento y ahí termina si has avisado a tiempo. Hay situaciones concretas —vender el coche o la casa, por ejemplo— que se tratan aparte. Mira las condiciones de tu póliza o pregúntanos.',
      },
      {
        pregunta: '¿Y si se me ha pasado el mes de preaviso?',
        respuesta:
          'La póliza se renueva un año más. Anótate la fecha del vencimiento siguiente y su mes de preaviso, y envía la carta con tiempo. Mientras tanto puedes revisar coberturas y capitales por si conviene ajustarlos.',
      },
      {
        pregunta: '¿Tengo que decir por qué me voy?',
        respuesta:
          'No. La ley solo pide que comuniques tu oposición a la prórroga por escrito y en plazo. Un motivo no cambia nada y no hace falta darlo.',
      },
      {
        pregunta: '¿Cambiar de correduría es dar de baja el seguro?',
        respuesta:
          'No. Son dos cosas distintas: la póliza sigue con su compañía y lo que cambia es quién la gestiona. No exige preaviso ni esperar al vencimiento.',
      },
    ],
  },
  {
    slug: 'siniestro-coche-que-hacer-paso-a-paso',
    h1: 'He tenido un accidente con el coche: qué hacer en las primeras horas',
    title: 'He tenido un accidente: qué hacer ahora',
    description:
      'En un accidente, los primeros pasos salvan tiempo después. Desde cómo asegurar el lugar hasta cuándo avisar a la compañía y qué datos guardar.',
    fecha: '2026-09-20',
    consulta: 'qué hacer si tengo un accidente de coche parte amistoso',
    resumen:
      'Los minutos después de un accidente importan. Lo que hagas en el lugar, cómo rellenar el parte y cuándo avisar a la compañía son los pasos que después reclaman tiempo y dinero.',
    ramos: ['auto'],
    cta: {
      titulo: 'Si ya tienes el parte, nosotros lo tramitamos',
      texto:
        'Sube tu parte amistoso o el justificante del accidente a tu área privada y nos encargaremos de comunicarlo a la compañía. Sin esperas, sin fax ni correos de un lado a otro.',
      boton: 'Comunicar mi accidente',
      href: '/siniestro',
    },
    secciones: [
      {
        titulo: 'Los primeros minutos: seguridad antes que pruebas',
        parrafos: [
          'El primer paso es asegurarse de que todos están ilesos y que no hay un riesgo mayor. Si hay heridos, lesión o peligro —por ejemplo, un coche boca abajo o tráfico peligroso—, avisa a emergencias sin esperar.',
          'Cuando todos estén seguros, si es posible, coloca un chaleco reflectante y los triángulos de preseñalización a una distancia suficiente del lugar, siguiendo las indicaciones de la póliza o el código de circulación de tu comunidad. Si no puedes hacerlo —por peligro o porque hay que ayudar a alguien— no lo hagas.',
          'No muevas los vehículos de su posición a menos que impidan la circulación y sea seguro hacerlo. Un desplazamiento pequeño puede cambiar toda la versión de cómo pasó el accidente.',
        ],
      },
      {
        titulo: 'Fotografías: tu registro del accidente',
        parrafos: [
          'Con el móvil, haz fotos del lugar completo: los dos vehículos en su posición, los daños, la señalización del lugar, el estado del asfalto, el tráfico alrededor. Haz varias desde ángulos distintos.',
          'Si hay señales de tráfico relevantes —una curva, una salida o una limitación de velocidad— fotografía también esas. Son contexto que después importa.',
          'Guarda las fotos. Muchas compañías las piden, y son la prueba más rápida de cómo estaban las cosas.',
        ],
      },
      {
        titulo: 'El parte amistoso: a dónde van los datos',
        parrafos: [
          'Es un documento que rellenan los dos conductores juntos en el lugar del accidente. Lleva los datos de los dos vehículos, de los conductores, de las aseguradoras y una descripción de cómo pasó. Ambos lo firman.',
          'Importante: no admitas culpa por escrito en el parte. Una descripción es «salí de un garaje» o «venía en el carril derecho». Lo que NO es: «fue culpa mía» o «no vi venir el coche». Lo segundo acaba la discusión sobre responsabilidad antes de que empiece.',
          'Si el otro conductor no quiere firmar o no quiere hacer un parte amistoso, anota en tu móvil: su matrícula, su nombre, su teléfono, la de su aseguradora si la tienes a mano, el número de su póliza si lo dice. Busca testigos que vieron el accidente y anota también sus datos. Eso sustituye al parte cuando no lo hay.',
        ],
      },
      {
        titulo: 'Cuándo avisar a la aseguradora',
        parrafos: [
          'La ley obliga a comunicar el accidente a la compañía en el plazo que figure en tu póliza. Como regla general, ese plazo es de siete días desde el accidente, aunque muchas pólizas dan más tiempo. Comprueba el tuyo en el condicionado.',
          'No esperes a que te lo pidan: envía un correo con el parte y las fotos tan pronto como puedas, aunque sea el mismo día. Es beneficioso para ti: cuanto antes la compañía tenga la información, antes puede actuar.',
          'Guarda el comprobante de que lo has enviado: la captura del correo, el acuse de recibo, lo que sea que demuestre CUÁNDO se lo comunicaste.',
        ],
      },
      {
        titulo: 'Documentos que tienes que guardar',
        parrafos: [
          'El parte amistoso, si lo hay. Si no lo hay, tus notas de datos y testigos. Las fotos del lugar y los vehículos. El informe de la policía, si la policía fue. El comprobante de que comunicaste el accidente a la aseguradora.',
          'Si la compañía te pide el certificado de antecedentes de tráfico (tu histórico de partes), puedes solicitarlo en la Dirección General de Tráfico con un justificante de identidad.',
          'Todo esto junto es lo que va después a la aseguradora, así que guardarlo en una carpeta de tu correo o en el móvil te evita un viaje cuando la compañía lo pide.',
        ],
      },
      {
        titulo: 'Cómo entra un corredor en la tramitación',
        parrafos: [
          'Tu correduría es el intermediario entre tú y la compañía: lo que comunicas a tu corredor cuenta como comunicado a la aseguradora. Así que el parte y las fotos los puedes mandar a la correduría primero, y la compañía los recibe igual.',
          'Un corredor también ve el expediente de la aseguradora y puede gestionar los tiempos de peritación, las llamadas y los pasos siguientes sin que tengas que estar encima de cada correo.',
        ],
      },
    ],
    faq: [
      {
        pregunta: '¿Tengo que rellenar un parte si no hay culpa clara?',
        respuesta:
          'Sí. El parte amistoso es lo que describe qué pasó según lo que los dos vieron. Que no haya culpa clara no significa que no haya parte: solo que los dos conductores describen su versión sin echarle la culpa al otro. La compañía y el seguro del otro es quien decide después qué fue de verdad.',
      },
      {
        pregunta: '¿Qué pasa si paso el plazo de los siete días sin avisar a la compañía?',
        respuesta:
          'Depende de lo que diga tu póliza y de cuánto tiempo después avises. Si el retraso ha impedido a la compañía investigar o actuar, puede justificar una reducción en la indemnización. Por eso vale la pena avisar rápido, aunque sea por correo.',
      },
      {
        pregunta: '¿Los datos de tráfico se usan para subirme la prima?',
        respuesta:
          'Un siniestro declarado y resuelto entra en tu histórico de siniestralidad, y eso es lo que consulta la compañía al renovar la póliza. Si el otro fue culpable y la compañía es la suya quien paga, muchas pólizas no penalizan tu renovación. Si no hay culpable claro, tu prima puede verse afectada.',
      },
    ],
  },
  {
    slug: 'siniestro-hogar-fuga-agua-que-hacer',
    h1: 'Tienes una fuga de agua en casa: qué hacer y qué cubre el seguro',
    title: 'Fuga de agua: qué hacer y qué cubre',
    description:
      'Una fuga de agua puede ser un gasto enorme o estar cubierto. Qué pasos dar, a quién avisar y cómo saber si la póliza lo cubre.',
    fecha: '2026-09-20',
    consulta: 'fuga de agua daños por agua en casa qué hacer seguro hogar',
    resumen:
      'Antes de llamar al fontanero, el primer paso es cortar el agua y documentar el daño. Luego avisar a la compañía. Si es tubería común interviene el seguro de la comunidad; si es privativa, el tuyo. Lo que no cubre casi nunca es la falta de mantenimiento.',
    ramos: ['hogar', 'comunidades'],
    cta: {
      titulo: 'Si tienes una fuga, nosotros la tramitamos con la compañía',
      texto:
        'Sube las fotos del daño y el presupuesto de reparación a tu área privada, y nos encargamos de gestionar la reclamación con la aseguradora. Tú solo tienes que reparar; nosotros miramos si lo paga la póliza.',
      boton: 'Comunicar mi fuga',
      href: '/siniestro',
    },
    secciones: [
      {
        titulo: 'Los primeros pasos: cortar y documentar',
        parrafos: [
          'Nada de correr al reparador todavía. El primer paso es cortar el agua en la llave de paso, para que la fuga deje de hacer daño mientras decides qué hacer. La válvula suele estar en el sótano, bajo el fregadero o donde entra el agua en la vivienda.',
          'Una vez cortada el agua, abre un grifo para que salga la presión residual. Luego, con el móvil, haz fotos de toda la zona afectada: qué está mojado, dónde está el daño, las manchas en las paredes y los techos. Estas fotos son tu comprobante de que el daño es real y de dónde está.',
          'Si hay agua acumulada —en un falso techo, dentro de un armario—, hazlo saber. El daño suele no estar solo donde se ve la mancha: está en todo lo que mojó el agua, y la aseguradora necesita saberlo.',
        ],
      },
      {
        titulo: 'Avisar a la compañía',
        parrafos: [
          'Contacta con tu aseguradora o con la correduría para avisar de la fuga. Muchas pólizas tienen un teléfono de urgencias para esto, así que mira el dorso de tu póliza antes de llamar.',
          'Lo que tienen que saber: dónde está la fuga, cómo la descubriste, qué daño hay a la vista y si el origen es una tubería de la vivienda o de la comunidad (si lo sabes). Si no lo sabes, no adivines: la aseguradora mandará a un perito para saberlo.',
          'La compañía responde en un plazo que depende de tu póliza y de la urgencia del daño. Mientras tanto, puedes adoptar medidas razonables para evitar que el daño empeore —secar, ventilar—, pero no repares nada sin que la aseguradora lo apruebe primero.',
        ],
      },
      {
        titulo: 'Quién repara: reparador de la compañía o el tuyo',
        parrafos: [
          'Muchas pólizas de hogar tienen un acuerdo con reparadores de su red: la aseguradora llama a uno de ellos, que viene sin presupuesto previo y repara todo. Tú no pagas nada en el momento; el coste se carga a la póliza.',
          'Si tu póliza no tiene esa red, o si prefieres tu reparador de confianza, puedes contratar uno tú mismo. Entonces sí tienes que presupuestar, enviarle el presupuesto a la aseguradora para que lo apruebe, y cuando esté arreglado, presentar la factura para el reembolso.',
          'Lo importante: que antes de reparar la compañía haya visto el daño o haya dado su visto bueno. Una reparación sin avisar puede quedar fuera de cobertura.',
        ],
      },
      {
        titulo: 'Daños a un vecino: responsabilidad civil del hogar',
        parrafos: [
          'Si el agua llegó al piso de abajo o mojó algo del vecino, aquí entra la cobertura de responsabilidad civil de tu hogar. Es la garantía que responde si causas un daño sin querer a un tercero.',
          'Lo que tiene que saber tu aseguradora es que el agua mojó el piso de abajo, qué le hizo daño exactamente y si el vecino ya tiene una factura de reparación. Eso va en la reclamación: es daño indirecto que tu fuga causó.',
          'Si el vecino presenta la factura, puede reclamar a tu aseguradora directamente. La responsabilidad civil es para eso: para que el tercero damnificado no tenga que litigar contigo, sino que la aseguradora lo resuelve.',
        ],
      },
      {
        titulo: 'La comunidad y sus tuberías: dónde termina tu responsabilidad',
        parrafos: [
          'Si la fuga salió de una tubería común —la bajante que sube por el edificio, la acometida general—, es responsabilidad de la comunidad y su seguro. Si salió de una instalación dentro de tu vivienda —tus tuberías, tu grifo—, es cosa tuya.',
          'El problema es que a menudo no está claro: el agua viene de un elemento común pero el daño que causa es en una vivienda privada. Ahí es donde se pone complejo y es justo lo que vigila un perito.',
          'Cuando avises a la aseguradora de tu fuga, menciona si crees que el origen es común o privativo. Si es común, la aseguradora hablará con la de la comunidad. No es tu problema resolver entre las dos: es cosa de seguros.',
        ],
      },
      {
        titulo: 'Qué no suele cubrir una póliza de hogar',
        parrafos: [
          'Una humedad que viene de una fuga puntual casi siempre está cubierta. Una humedad que lleva meses o años filtrando por una mala impermeabilización o por falta de mantenimiento casi nunca: es deterioro progresivo, no un siniestro accidental.',
          'La diferencia no siempre es obvia desde fuera. Un perito viene a determinar si lo que ve es una avería repentina —una tubería que revienta— o un problema que arrastra tiempo. Eso es lo que decide si la compañía paga.',
          'También está fuera generalmente lo que pasó por negligencia: una tubería que sabías que estaba rota y no reparaste, un grifo que goteaba hace meses. El seguro protege contra lo que puede pasar, no contra lo que ya había pasado sin que lo arreglaras.',
        ],
      },
    ],
    faq: [
      {
        pregunta: '¿Debo arreglar la fuga ya o esperar a que la aseguradora lo apruebe?',
        respuesta:
          'Si es una fuga activa —sigue saliendo agua—, corta la llave y no hagas nada más hasta que la aseguradora la vea o la apruebe. Una reparación que hiciste sin avisar puede quedar fuera de cobertura. Si tienes que actuar por urgencia —por ejemplo, hay riesgo de inundación— hazlo, pero comunícaselo a la aseguradora en el acto y guarda la factura.',
      },
      {
        pregunta: '¿Cómo sé si es tubería de la comunidad o mía?',
        respuesta:
          'En la mayoría de los casos, lo que está dentro de tu vivienda es tuyo; lo que está en zonas comunes es de la comunidad. Pero hay excepciones: bajantes verticales a veces son comunes aunque pasen por tu vivienda, y a veces son privativas si la reforma las pasó por dentro. La única forma segura es que venga un técnico a mirarlo. Eso es precisamente lo que hace el perito.',
      },
      {
        pregunta: '¿Tengo que pagar algo de mi bolsillo si se aprueba el daño?',
        respuesta:
          'Depende de tu póliza. La mayoría tienen una franquicia —una cantidad que pagas tú como participación en el daño—. Eso lo descubre la aseguradora cuando valora el daño. Si la factura es por debajo de la franquicia, sales al 100 % de tu bolsillo; si es por encima, tú pagas la franquicia y la aseguradora el resto.',
      },
      {
        pregunta: '¿Se me puede subir la prima por una fuga?',
        respuesta:
          'Un siniestro de agua que paga la aseguradora entra en tu histórico. Eso puede influir en la prima al renovar, pero depende de cómo lo interprete cada compañía y de tu histórico anterior. Si es el primero y la culpa fue de una avería puntual, muchas aseguradoras no penalizan. Si es el tercero en dos años, sí puede influir.',
      },
    ],
  },
  {
    slug: 'siniestro-salud-autorizacion-y-reembolso',
    h1: 'Seguro de salud: cómo pedir una autorización y qué hacer si te la deniegan',
    title: 'Pedir autorización en el seguro de salud',
    description:
      'La autorización no siempre es automática. Qué pruebas la necesitan, cómo pedirla, en qué plazo responden y qué hacer si te la deniegan.',
    fecha: '2026-09-20',
    consulta: 'cómo pedir autorización seguro de salud reembolso',
    resumen:
      'No todas las pruebas y tratamientos de un seguro de salud son automáticos. Algunas necesitan aprobación previa de la aseguradora. Aquí está cómo se pide, qué tiempo tarda, y qué hacer si te dicen que no.',
    base: ['orden-ecc-2502-2012'],
    ramos: ['vida-y-salud'],
    cta: {
      titulo: 'Si tu aseguradora te deniega, nosotros te ayudamos a reclamar',
      texto:
        'Una denegación de autorización o reembolso no es la última palabra. Reclamar ante la aseguradora es el primer paso, y si no responden en plazo, hay vías ante la DGSFP. Cuéntanos qué pasó.',
      boton: 'He recibido una denegación',
      href: '/siniestro',
    },
    secciones: [
      {
        titulo: 'Cuadro médico y reembolso: cómo se autoriza cada uno',
        parrafos: [
          'En el cuadro médico, el médico es de la red de la aseguradora y ya está acreditado. No necesitas autorización para cada visita, aunque sí para algunas pruebas o cirugías especiales. Tu médico pide la autorización directamente a la aseguradora; la mayoría de las veces es automática.',
          'En reembolso, tú eliges el médico y el centro donde quieras. Luego presentas la factura a la aseguradora para que te devuelva el importe. Esto también puede necesitar aprobación previa en algunos tratamientos.',
          'La diferencia importa: en cuadro médico no sacas dinero del bolsillo; en reembolso adelantas tú y luego esperas a que te lo devuelvan. Por eso vale la pena entender cuándo hace falta autorización.',
        ],
      },
      {
        titulo: 'Qué pruebas necesitan autorización previa',
        parrafos: [
          'Casi nunca una consulta con el médico. Muchas veces una prueba que cuesta dinero: resonancia magnética, tomografía, análisis genéticos, algunas cirugías. Carencias y preexistencias también pueden necesitar comprobación.',
          'Cada aseguradora tiene su lista: lo que cubre directamente y lo que primero hay que autorizar. Eso sale en tu póliza, en el condicionado o en el apartado de «pruebas que necesitan autorización».',
          'Si no está claro si tu prueba necesita autorización, llama a la aseguradora ANTES de hacerla. Una prueba hecha sin autorización puede quedar fuera de cobertura.',
        ],
      },
      {
        titulo: 'Cómo se pide y en qué plazo responden',
        parrafos: [
          'La forma depende de la aseguradora: a veces tu médico llama por teléfono y obtiene respuesta en el acto, a veces hay que presentar un formulario escrito, a veces el médico la pide por una plataforma en línea.',
          'El plazo suele ser de unos pocos días para algo urgente, o de una o dos semanas para algo más rutinario. Si no tienes respuesta en el plazo que dice la póliza, insiste: una autorización que no llega es lo mismo que si te la negaran.',
          'Lo importante es que cuando vaya a hacerse la prueba, ya tengas el sí por escrito. Una autorización verbal puede ser un "no se aprobó" cuando después reclamas.',
        ],
      },
      {
        titulo: 'Qué hacer si te la deniegan',
        parrafos: [
          'Primero, pide por escrito al servicio de atención al cliente de la aseguradora que te explique por escrito por qué la deniegan. La razón puede ser: no entra en tu póliza, está en período de carencia, es una preexistencia que excluye, o no reúne los requisitos. Sin la razón por escrito, no puedes reclamar de verdad.',
          'Luego, contesta a esa denegación con los argumentos que creas que tienes: si necesitas la prueba por urgencia médica, si el médico cree que es necesaria, si ha habido un cambio en tu situación médica desde que contrató la póliza. Eso va al servicio de atención al cliente de la aseguradora.',
          'Si la aseguradora no te contesta en dos meses, o si su respuesta sigue siendo no y tú no estás de acuerdo, puedes acudir al Servicio de Reclamaciones de la Dirección General de Seguros y Fondos de Pensiones. Es gratis, no necesitas abogado, y la aseguradora tiene que responder. Su informe no te vincula a ganar, pero pesa, y muchas veces acaba en acuerdo.',
        ],
      },
      {
        titulo: 'Períodos de carencia y preexistencias',
        parrafos: [
          'Carencia es el tiempo que tienes que esperar desde que entra en vigor la póliza hasta poder usar ciertas prestaciones. Varían: hay algunos servicios que puedes usar ya, otros necesitan de tres a seis meses. Eso depende de la aseguradora y del tipo de póliza.',
          'Si tienes una enfermedad anterior a contratar la póliza, hay que declararla en el cuestionario de salud. La aseguradora decide entonces si la acepta, la excluye o aplica un recargo. Eso queda por escrito en tu póliza. No declararla no la convierte en cubierta después: es justo el motivo más frecuente de denegación de una prestación.',
          'Si tu carencia todavía está en curso, o si tienes una preexistencia excluida y pides cobertura para eso, la denegación es probable que sea automática. Ahí la vía de reclamación es más corta porque la respuesta es casi segura. Mejor revisarlo antes de pedir la autorización.',
        ],
      },
    ],
    faq: [
      {
        pregunta: '¿Por qué mi médico dice que es urgente pero la aseguradora dice que espere?',
        respuesta:
          'La urgencia médica (lo que tú necesitas ahora) no siempre coincide con la cobertura de la póliza (lo que la aseguradora está obligada a pagar). Si el médico cree que es urgente, cuéntaselo por escrito a la aseguradora: una situación urgente puede justificar saltarse la carencia o acelerar la autorización. Pero sin decirles que es urgente, eso no lo saben.',
      },
      {
        pregunta: '¿Cuánto tiempo debo esperar el reembolso después de la autorización?',
        respuesta:
          'Depende de la aseguradora, pero lo normal es entre dos y cuatro semanas desde que presentas la factura con la autorización. Si pasan más de seis semanas sin noticias, reclama. Un reembolso que tarda demasiado es una demora que tiene consecuencias en la normativa de seguros.',
      },
      {
        pregunta: '¿Una preexistencia me deja fuera de toda cobertura o solo de esa enfermedad?',
        respuesta:
          'Depende de cómo la aseguradora la haya resuelto. A veces es una exclusión total: esa enfermedad no se cubre. A veces es una exclusión parcial: solo dentro de un plazo, o solo ciertos tratamientos. Eso tiene que estar escrito en tu póliza. Revísalo antes de pedir una autorización para algo relacionado.',
      },
    ],
  },
  // 23/09/2026. «claims made» ~90 búsquedas/mes, KD 0 (DataForSEO vía OpenSEO),
  // y Search Console ya enseñaba la web para esa consulta desde la página de RC
  // en la posición ~76. Los arts. 3 y 73 LCS se verificaron el mismo día contra
  // el texto consolidado del BOE (ver `lcs-3`/`lcs-73` en `NORMAS_CITABLES`).
  {
    slug: 'que-es-claims-made-seguro-responsabilidad-civil',
    h1: 'Qué es «claims made» en un seguro de responsabilidad civil',
    title: 'Qué es claims made en un seguro de RC',
    description:
      'Claims made significa que la póliza responde por la fecha de la reclamación, no por la del hecho. Qué implica, qué es la retroactividad y dónde están los huecos.',
    fecha: '2026-09-23',
    consulta: 'claims made',
    resumen:
      'Una póliza «claims made» responde de las reclamaciones que te llegan mientras está en vigor, no de los hechos que ocurren mientras está en vigor. La diferencia parece técnica hasta el día en que cambias de compañía o dejas la actividad.',
    base: ['lcs-3', 'lcs-73'],
    ramos: ['responsabilidad-civil', 'responsabilidad-civil-autonomos'],
    secciones: [
      {
        titulo: 'Dos formas de decir «cuándo» cubre una póliza',
        parrafos: [
          'Un seguro de responsabilidad civil tiene que fijar qué momento cuenta para saber si un siniestro entra: el día en que ocurrió el hecho o el día en que alguien te reclama por él. En muchos ramos coinciden casi siempre. En la responsabilidad civil, sobre todo la profesional, pueden separarse años.',
          'En el sistema de ocurrencia manda la fecha del hecho: si el error o el daño se produjo mientras la póliza estaba en vigor, esa póliza responde aunque la reclamación llegue después. En el sistema de reclamación —en inglés, «claims made»— manda la fecha de la reclamación: la póliza responde de lo que te reclamen mientras está en vigor.',
        ],
      },
      {
        titulo: 'La retroactividad: hasta dónde mira hacia atrás',
        parrafos: [
          'Una póliza por reclamación no cubre cualquier hecho del pasado. Fija una fecha de retroactividad, y solo responde de reclamaciones por hechos ocurridos a partir de ese día.',
          'Es el dato que más se pasa por alto al contratar y el que más pesa al cambiar de compañía. Si tu póliza nueva tiene una retroactividad corta, un trabajo hecho antes queda fuera de la nueva; y si la vieja era por reclamación, tampoco responde, porque la reclamación llega cuando ya no está en vigor.',
        ],
      },
      {
        titulo: 'El periodo posterior: qué pasa cuando la póliza se acaba',
        parrafos: [
          'La otra cara es el periodo de reclamación posterior: un plazo después de que la póliza termine durante el que todavía se aceptan reclamaciones por hechos ocurridos mientras estuvo vigente.',
          'Importa sobre todo al dejar la actividad: jubilación, cierre del negocio, cambio de profesión. Sin ese periodo, lo que te reclamen al día siguiente de cancelar no lo cubre nadie.',
        ],
      },
      {
        titulo: 'Qué dice la ley, y qué tiene que cumplir la póliza',
        parrafos: [
          'El artículo 73 de la Ley de Contrato de Seguro admite dos fórmulas. La primera limita la cobertura a las reclamaciones presentadas hasta un plazo después de que termine el contrato, que no puede ser inferior a un año. La segunda la limita a las reclamaciones presentadas mientras la póliza está en vigor, pero entonces tiene que cubrir también los hechos ocurridos al menos un año antes de que empezara.',
          'La ley las trata como cláusulas limitativas de los derechos del asegurado, y el artículo 3 exige que ese tipo de cláusulas aparezcan destacadas de modo especial en la póliza y que las aceptes específicamente por escrito.',
          'Si tu póliza delimita la cobertura por reclamación y esa cláusula no aparece destacada ni firmada, merece la pena revisarlo con quien te la gestiona.',
        ],
      },
      {
        titulo: 'Qué miramos antes de mover una póliza de RC',
        parrafos: [
          'Tres datos, siempre juntos: el sistema de la póliza actual (ocurrencia o reclamación), su fecha de retroactividad y si deja periodo posterior. Con esos tres se ve si el cambio abre un hueco y cómo cerrarlo pactando la retroactividad en la póliza nueva.',
          'Es un análisis que no depende de la compañía, sino del condicionado, y por eso se hace con la póliza delante.',
        ],
      },
    ],
    faq: [
      {
        pregunta: '¿Es peor una póliza claims made que una de ocurrencia?',
        respuesta:
          'No necesariamente. Es la forma habitual en la responsabilidad civil profesional y puede cubrir bien si la retroactividad y el periodo posterior están pactados. Lo que la hace peligrosa es no saber que la tienes cuando cambias de compañía o dejas de trabajar.',
      },
      {
        pregunta: '¿Dónde veo si mi póliza es claims made?',
        respuesta:
          'En las condiciones generales o especiales, en el apartado de delimitación temporal de la cobertura o ámbito temporal. Busca las expresiones «reclamación», «fecha de retroactividad» y «periodo de reclamación posterior».',
      },
      {
        pregunta: 'Voy a jubilarme. ¿Qué pasa con los trabajos que hice?',
        respuesta:
          'Si tu póliza es por reclamación, lo que te reclamen después de cancelarla solo lo cubre el periodo posterior que tenga pactado. Antes de darla de baja conviene comprobar ese plazo y, si hace falta, negociar uno más largo.',
      },
    ],
  },
  // 23/09/2026. Idea de Alberto: que se puede dar parte por WhatsApp es algo
  // que muchos asegurados no saben. Lo que dice de cada compañía sale de las
  // capturas de sus webs de ese día (las mismas que verificaron
  // `telefonos-companias.ts`). 🚨 NINGÚN número va aquí: vive en
  // `/telefonos-siniestros`, que tiene una sola fuente y su fecha. Dos copias de
  // un teléfono de siniestros es una copia que se queda vieja sin que falle
  // nada; lo vigila `telefonos-companias.test.ts`.
  {
    slug: 'dar-parte-seguro-por-whatsapp',
    h1: '¿Se puede dar parte del seguro por WhatsApp? Qué compañías lo permiten',
    title: 'Dar parte del seguro por WhatsApp: qué compañías',
    description:
      'Varias aseguradoras ya aceptan el parte por WhatsApp, pero no todas ni para todos los seguros. Qué compañías lo ofrecen, para qué y qué mandar en el mensaje.',
    fecha: '2026-09-23',
    consulta: 'dar parte seguro por whatsapp',
    resumen:
      'Sí, en varias compañías. Occident atiende siniestros por WhatsApp en el mismo número que usa para llamar; Mapfre y Fidelidade lo tienen para el seguro de hogar, y Generali para pedir la grúa. No es universal: depende de la compañía y del tipo de seguro, así que antes de escribir conviene saber a qué número y para qué.',
    base: ['lcs-16'],
    ramos: ['hogar', 'auto'],
    cta: {
      titulo: 'Los números, comprobados en la web de cada compañía',
      texto:
        'Tenemos en una sola página los teléfonos y los WhatsApp de siniestros y asistencia de las compañías con las que trabajamos, con la fecha en que los comprobamos en su web oficial.',
      boton: 'Ver los teléfonos de siniestros',
      href: '/telefonos-siniestros',
    },
    secciones: [
      {
        titulo: 'Qué compañías aceptan el parte por WhatsApp',
        parrafos: [
          'Occident usa el mismo número para llamar y para escribir por WhatsApp, y en su web lo da tanto para declarar un siniestro de hogar como uno de auto. Es el caso más completo: un solo número para todo.',
          'Mapfre tiene un WhatsApp para dar parte del seguro de hogar, en horario de lunes a viernes de 8:00 a 20:00. Ese mismo número lo usa también para autorizaciones médicas. Para el coche publica sus teléfonos de asistencia en carretera, no un WhatsApp.',
          'Fidelidade publica un WhatsApp en su página de siniestros de hogar, junto a su línea de atención al cliente.',
          'Generali permite pedir la grúa por WhatsApp desde su página de asistencia en carretera. Ojo: eso es asistencia —que venga alguien a sacarte de la carretera—, no la declaración del siniestro.',
          'Lo comprobamos en la web oficial de cada compañía el 23 de septiembre de 2026. Las compañías cambian sus canales, así que el número exacto está siempre en nuestra página de teléfonos, con la fecha de la última comprobación.',
        ],
      },
      {
        titulo: 'Qué mandar en el primer mensaje',
        parrafos: [
          'El número de póliza, o si no lo tienes a mano, tu DNI o la matrícula del coche. Es lo primero que te van a pedir para localizarte.',
          'Qué ha pasado, cuándo y dónde, en dos o tres frases. No hace falta un relato largo: la compañía te preguntará lo que necesite.',
          'Fotos del daño. Es la gran ventaja del WhatsApp frente a la llamada: las mandas en el momento, con la fecha del móvil, y quedan unidas a la conversación.',
          'En un accidente de coche, además, la foto del parte amistoso firmado por los dos conductores, por las dos caras.',
        ],
      },
      {
        titulo: 'Las ventajas, y lo que no cambia',
        parrafos: [
          'Queda todo por escrito: qué dijiste, cuándo lo dijiste y qué te contestaron. Si luego hay un desacuerdo, tienes la conversación. Con una llamada, lo único que queda es tu memoria.',
          'Lo que no cambia es el plazo. El artículo 16 de la Ley de Contrato de Seguro pide comunicar el siniestro en un máximo de siete días desde que lo conoces, salvo que tu póliza dé más, y el canal no lo alarga. Escribir por WhatsApp un viernes por la noche cuenta; que te contesten el lunes no significa que hayas avisado el lunes.',
          'Tampoco cambia lo que cubre la póliza. Dar parte por WhatsApp es solo la forma de avisar: la cobertura, la franquicia y la peritación son las mismas que si llamas.',
        ],
      },
      {
        titulo: 'Si tu compañía no tiene WhatsApp, o no sabes cuál es',
        parrafos: [
          'Del resto de compañías con las que trabajamos no hemos encontrado un WhatsApp de siniestros publicado en su web. Eso no quiere decir que no lo tengan para algún producto concreto: mira el dorso de tu póliza o la app de la compañía.',
          'Y si tu seguro lo llevamos nosotros, escríbenos a nosotros. Damos el parte con la compañía, te decimos qué documentos hacen falta y seguimos el expediente hasta que se cierra. Para eso está el corredor.',
        ],
      },
    ],
    faq: [
      {
        pregunta: '¿Vale un parte dado por WhatsApp igual que por teléfono?',
        respuesta:
          'Sí, si es un canal que la propia compañía publica para dar parte. Guarda la conversación: es la prueba de cuándo avisaste y de qué contaste.',
      },
      {
        pregunta: '¿Puedo mandar fotos y vídeos del daño?',
        respuesta:
          'Sí, y conviene hacerlo en el primer mensaje o justo después. Fotos generales para situar el daño y de cerca para ver el detalle, antes de limpiar o reparar nada.',
      },
      {
        pregunta: '¿Me atienden a cualquier hora?',
        respuesta:
          'Depende de la compañía. Occident publica atención las 24 horas; el WhatsApp de hogar de Mapfre, de lunes a viernes de 8:00 a 20:00. Fuera de horario puedes escribir igual, pero la respuesta llegará cuando abran.',
      },
    ],
  },
  // El agente quincenal de `apps/plataforma` (`lib/correduria/blog-agente.ts`)
  // añade el artículo nuevo JUSTO ENCIMA de esta línea y abre un PR. Es la
  // única forma en que un proceso automático toca este fichero: no reescribe
  // nada de lo que ya hay, solo inserta.
  //
  // 🚨 Si alguien borra el marcador, la inserción falla — y falla en SILENCIO,
  // porque el agente no puede saber que el hueco ya no está: el síntoma sería
  // «el blog dejó de crecer», semanas después. Lo vigila `articulos.test.ts`.
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
    ...(a.cta ? [a.cta.titulo, a.cta.texto, a.cta.boton] : []),
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
