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
    slug: 'me-han-subido-el-recibo-sin-avisar',
    consulta: 'me han cobrado el seguro más caro sin avisarme',
    angulo:
      'Qué pasa cuando el recibo llega con una prima distinta a la del año anterior sin comunicación previa, y qué margen deja el plazo de oposición.',
    normas: ['lcs-22'],
    ramos: ['hogar', 'auto', 'comunidades'],
  },
  {
    slug: 'cuanto-tarda-en-pagar-un-seguro-un-siniestro',
    consulta: 'cuánto tarda el seguro en pagar un siniestro',
    angulo:
      'Los plazos reales: el importe mínimo a los cuarenta días, cuándo empieza a correr la mora y qué se puede hacer mientras la peritación sigue abierta.',
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
