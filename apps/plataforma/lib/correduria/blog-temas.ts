// La cola de temas del blog de la correduría.
//
// ─── Por qué una cola y no «que el modelo elija» ───────────────────────────
// El agente de blog de `apps/ia-rest` elige la keyword de Search Console: mira
// qué se busca de verdad, filtra lo que ya tiene artículo y escribe sobre lo
// siguiente. Es el diseño correcto, y aquí NO se puede copiar todavía porque
// `grupoasegura.es` no tiene la propiedad dada de alta en Search Console: no
// hay impresiones que leer.
//
// La alternativa tentadora —dejar que el modelo proponga el tema— es la mala:
// produce el artículo que un modelo cree que se busca sobre seguros, que es el
// mismo que ya han escrito los diez comparadores que copan esa búsqueda. Sin
// datos, el criterio lo pone Alberto: esta lista.
//
// ⏳ Cuando GSC esté conectada, `elegirTema` pasa a preferir las consultas con
// impresiones y sin clic, y esta lista queda como respaldo. El punto de
// extensión está marcado abajo.

/** Un tema aprobado, listo para que el agente lo desarrolle. */
export type TemaBlog = {
  /** Slug del artículo que se creará. Es también la clave para no repetir. */
  slug: string
  /** La búsqueda real que se quiere cubrir. Va al prompt tal cual. */
  consulta: string
  /** Qué tiene que responder el artículo. Cuanto más concreto, menos relleno. */
  angulo: string
  /**
   * Ids de `NORMAS_CITABLES` que el artículo PUEDE citar.
   *
   * 🚨 Acotar aquí y no dejarlo al modelo es lo que hace el tema publicable: el
   * agente solo recibe estas normas en el prompt, así que no tiene con qué
   * inventar otras. Un tema sin normas es un tema que se responde sin citar.
   */
  normas: readonly string[]
  /** Slugs de ramos con los que enlaza. */
  ramos: readonly string[]
}

/**
 * 🚨 ANTES DE AÑADIR UN TEMA: léelo contra lo que YA hay publicado.
 *
 * Dos páginas que responden la misma pregunta no suman, se restan: compiten
 * entre sí por la misma búsqueda y Google reparte lo que habría ido a una.
 *
 * Caso fundacional (07/09/2026, el mismo día de crear esta cola): el tema
 * `me-han-subido-el-recibo-sin-avisar` —«me han cobrado el seguro más caro sin
 * avisarme», artículo 22— respondía exactamente lo mismo que el artículo ya
 * publicado `me-han-subido-el-seguro-en-la-renovacion`, con la MISMA norma. Se
 * retiró. Y `cuanto-tarda-en-pagar-un-seguro-un-siniestro` rozaba a
 * `siniestro-denegado-que-hacer`, así que su ángulo dice ahora en voz alta en
 * qué se distingue: uno es el pago que se retrasa, el otro el que se niega.
 *
 * El cepo de `blog-agente.test.ts` caza la forma DURA (mismo slug que un
 * artículo publicado). La forma blanda —mismo tema con otras palabras— no la
 * puede juzgar un test léxico sin dar falsos positivos, y un cepo que no caza
 * lo que promete es peor que no tenerlo. Esa la juzga quien añade el tema.
 *
 * Temas aprobados, en orden. El agente coge el primero que no esté publicado.
 *
 * Todos se responden con normas ya verificadas contra el BOE
 * (`NORMAS_CITABLES` de `@central/module-seguros`). Añadir un tema que necesite
 * una norma nueva exige verificarla ANTES: si no está en la lista blanca, el
 * cepo del blog rechaza el artículo y el PR se queda rojo.
 */
export const TEMAS: readonly TemaBlog[] = [
  {
    slug: 'cuando-empieza-a-cubrir-un-seguro',
    consulta: 'desde cuándo cubre un seguro recién contratado',
    angulo:
      'Cuándo empieza la cobertura de verdad: la diferencia entre firmar, pagar y que el contrato surta efecto, y por qué un siniestro del mismo día puede quedar fuera.',
    normas: [],
    ramos: ['hogar', 'auto'],
  },
  {
    slug: 'cuanto-tarda-en-pagar-un-seguro-un-siniestro',
    consulta: 'cuánto tarda el seguro en pagar un siniestro',
    angulo:
      'Los plazos reales cuando la compañía SÍ acepta el siniestro y aun así no paga: el importe mínimo a los cuarenta días, cuándo empieza a correr la mora y qué hacer mientras la peritación sigue abierta. El rechazo ya lo cubre el artículo publicado «siniestro-denegado-que-hacer»: aquí se habla del pago que se retrasa, no del que se niega.',
    normas: ['lcs-18', 'lcs-20'],
    ramos: ['hogar', 'comercio'],
  },
  {
    slug: 'cuanto-tiempo-tengo-para-reclamar-al-seguro',
    consulta: 'cuánto tiempo tengo para reclamar a mi seguro',
    angulo:
      'Los plazos de prescripción y por qué son distintos según el tipo de seguro, con la vía de reclamación cuando la entidad no contesta.',
    normas: ['lcs-23', 'orden-ecc-2502-2012'],
    ramos: ['hogar', 'vida-y-salud'],
  },
  {
    slug: 'que-hace-un-corredor-de-seguros',
    consulta: 'qué diferencia hay entre un corredor y un agente de seguros',
    angulo:
      'Qué es un corredor, en qué se distingue de un agente vinculado a una compañía, y quién paga su trabajo. Sin comparar precios: explicando la figura.',
    normas: [],
    ramos: ['hogar', 'comercio'],
  },
  {
    slug: 'que-es-la-franquicia-de-un-seguro',
    consulta: 'qué es la franquicia de un seguro y cuándo se paga',
    angulo:
      'Qué significa la franquicia en la práctica: quién adelanta el dinero, en qué siniestros se descuenta y por qué una póliza con franquicia no es una póliza peor. Sin comparar precios: explicando el mecanismo.',
    normas: [],
    ramos: ['auto', 'hogar'],
  },
  {
    slug: 'quien-puede-conducir-mi-coche',
    consulta: 'puede conducir mi coche otra persona con mi seguro',
    angulo:
      'Quién está cubierto al volante de un coche que no es suyo, qué es un conductor ocasional y qué cambia si hay un conductor habitual declarado distinto del que iba conduciendo.',
    normas: [],
    ramos: ['auto', 'flota'],
  },
  {
    slug: 'seguro-de-la-comunidad-o-el-mio',
    consulta: 'qué cubre el seguro de la comunidad y qué el de mi piso',
    angulo:
      'Dónde acaba el seguro del edificio y dónde empieza el del piso cuando hay una fuga o una humedad, y por qué a veces intervienen los dos. El caso concreto que más se consulta en una comunidad.',
    normas: [],
    ramos: ['comunidades', 'hogar'],
  },
  {
    slug: 'responsabilidad-civil-de-un-negocio-pequeno',
    consulta: 'qué seguro de responsabilidad civil necesita un negocio pequeño',
    angulo:
      'Qué cubre una responsabilidad civil de explotación, en qué se distingue de la patronal y de la de producto, y qué preguntas hay que responder antes de fijar el capital. Sin recomendar un importe concreto.',
    normas: [],
    ramos: ['comercio', 'responsabilidad-civil'],
  },
  {
    slug: 'vendo-el-coche-que-pasa-con-el-seguro',
    consulta: 'qué pasa con el seguro si vendo el coche',
    angulo:
      'Qué ocurre con la póliza al transmitir el vehículo, qué hay que comunicar y a quién, y por qué el seguro no desaparece solo con la venta. Distinto de darla de baja al vencimiento.',
    normas: [],
    ramos: ['auto'],
  },
] as const

/**
 * El siguiente tema a escribir, o `null` si la cola está agotada.
 *
 * 🚨 `null` es un resultado NORMAL y hay que tratarlo como tal: significa «no
 * quedan temas aprobados», no «no hay nada que hacer». El agente avisa y para;
 * lo que no hace es inventarse el siguiente, que es exactamente el fallo que
 * esta cola existe para evitar.
 */
export function elegirTema(publicados: readonly string[]): TemaBlog | null {
  const hechos = new Set(publicados)
  return TEMAS.find((t) => !hechos.has(t.slug)) ?? null
}

/** Cuántos temas quedan. Para avisar antes de agotar la cola, no después. */
export function temasRestantes(publicados: readonly string[]): number {
  const hechos = new Set(publicados)
  return TEMAS.filter((t) => !hechos.has(t.slug)).length
}
