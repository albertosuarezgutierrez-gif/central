// Horizonte del carril de LEADS de Vencimientos — decisión PURA, sin BD ni
// Prisma (así `node --test` la corre sin `prisma generate`).
//
// El horizonte corta por días hasta el aniversario y está bien para los leads
// SIN contactar («Por enviar»): no tiene motivo escribirles a un año vista. Pero
// NO puede esconder a quien ya está en conversación: si ya se le escribió (o
// respondió, o se le trabaja en seguimiento) y su aniversario cae más lejos,
// Alberto igualmente necesita verlo para actualizar su estado. Un lead que
// desaparece de la lista por «vence lejos» es trabajo abierto que se pierde.

export type EntradaHorizonte = {
  /** Días hasta el próximo aniversario estimado. */
  dias: number
  horizonteDias: number
  /** Contactos del último año (envíos sin rebote/queja + tareas de contacto cerradas). */
  intentos: number
  /** Respondió (abrió/pinchó un correo o cogió la llamada/WhatsApp). */
  respondio: boolean
  /** `competencia` = sin trabajar; cualquier otro (`en_negociacion`, `pendiente_cliente`) = en seguimiento. */
  estado: string
}

/**
 * ¿Entra en la lista? Dentro del horizonte, siempre. Fuera, solo si ya está en
 * conversación: `intentos > 0`, `respondio`, o `estado !== 'competencia'`.
 */
export function entraEnHorizonte(e: EntradaHorizonte): boolean {
  if (e.dias <= e.horizonteDias) return true
  return e.intentos > 0 || e.respondio || e.estado !== 'competencia'
}

// ─── Una fila por cliente ────────────────────────────────────────────────────
// Un cliente con varias pólizas de la competencia se trabaja UNA vez, así que
// el carril se queda con una sola de sus oportunidades. Si se eligiera sin más
// la que vence antes, el horizonte (que se aplica DESPUÉS, sobre la elegida)
// podría esconder trabajo abierto: con A `competencia` sin tocar a 150 días y
// B `en_negociacion` con llamadas a 300 días, se elegía A, A no entra en el
// horizonte (sin contactar y lejos) y el cliente desaparecía con B en marcha.
// Por eso manda la oportunidad EN CONVERSACIÓN; entre iguales, la que vence antes.

export type CandidataCliente = {
  clienteId: string
  /** Días hasta el próximo aniversario estimado de ESTA oportunidad. */
  dias: number
  /** Estado de ESTA oportunidad: `competencia` = sin trabajar. */
  estado: string
  /**
   * Contactos registrados como tarea cerrada de ESTA oportunidad (llamada,
   * correo o WhatsApp). Los envíos de recaptación van por cliente, no por
   * oportunidad: no distinguen entre dos oportunidades del mismo cliente.
   */
  intentosGestiones: number
  respondio: boolean
}

/** ¿Esta oportunidad está en conversación (se está trabajando)? */
export function enConversacion(c: Pick<CandidataCliente, 'estado' | 'intentosGestiones' | 'respondio'>): boolean {
  return c.estado !== 'competencia' || c.intentosGestiones > 0 || c.respondio
}

/** ¿`nueva` desplaza a `actual` como la fila del cliente? En conversación primero; entre iguales, la que vence antes. */
export function prefiereOportunidad(nueva: CandidataCliente, actual: CandidataCliente): boolean {
  const n = enConversacion(nueva)
  const a = enConversacion(actual)
  if (n !== a) return n
  return nueva.dias < actual.dias
}

/**
 * Una oportunidad por cliente (`elegida`) y cuántas otras tiene (`otras`). El
 * resultado no depende del orden de entrada salvo en empate exacto de días,
 * donde se queda la primera vista.
 */
export function unaPorCliente<T extends CandidataCliente>(filas: Iterable<T>): Map<string, { elegida: T; otras: number }> {
  const porCliente = new Map<string, { elegida: T; otras: number }>()
  for (const f of filas) {
    const previa = porCliente.get(f.clienteId)
    if (!previa) porCliente.set(f.clienteId, { elegida: f, otras: 0 })
    else porCliente.set(f.clienteId, { elegida: prefiereOportunidad(f, previa.elegida) ? f : previa.elegida, otras: previa.otras + 1 })
  }
  return porCliente
}
