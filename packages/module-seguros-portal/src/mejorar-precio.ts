// «Quiero que me mejores el precio» (Fase 1 de ASegura OS, pieza 1-5).
//
// El cliente ve en su portal lo que le renueva pronto y, con un botón, pide
// que se lo mire la correduría. Es la venta que INICIA EL CLIENTE, la más
// barata que existe. Lo que pide acaba en la cartera como una oportunidad con
// su tarea para hoy, que es lo que Alberto ve en «Hoy · Tareas de hoy».
//
// Puro (sin BD): lo usan las DOS apps —el portal para pintar y validar antes
// de mandar, asegura para validar otra vez antes de escribir— y con dos copias
// de la regla divergirían en silencio.
//
// 🚨 Lo que NO se promete: ni un precio ni un ahorro. «Lo miramos y te decimos
// si hay algo mejor» es información; «te lo bajamos» es asesoramiento
// (RDL 3/2020). El copy de la pantalla lo dice así.

/** Cuánto antes del vencimiento se enseña una póliza en «Tus vencimientos». */
export const DIAS_VENTANA_VENCIMIENTOS = 60

export const PRIORIDADES_PRECIO = ['precio', 'coberturas', 'ambas'] as const
export type PrioridadPrecio = (typeof PRIORIDADES_PRECIO)[number]

export const CANALES_PRECIO = ['llamada', 'correo'] as const
export type CanalPrecio = (typeof CANALES_PRECIO)[number]

export const MOMENTOS_LLAMADA = ['manana', 'tarde', 'igual'] as const
export type MomentoLlamada = (typeof MOMENTOS_LLAMADA)[number]

export const ROTULO_PRIORIDAD: Record<PrioridadPrecio, string> = {
  precio: 'Pagar menos',
  coberturas: 'Estar mejor cubierto',
  ambas: 'Las dos cosas',
}
export const ROTULO_CANAL: Record<CanalPrecio, string> = { llamada: 'Llamada', correo: 'Correo' }
export const ROTULO_MOMENTO: Record<MomentoLlamada, string> = {
  manana: 'Por la mañana (9-14 h)',
  tarde: 'Por la tarde (16-18 h)',
  igual: 'Me da igual',
}

/** Tope de la nota libre del cliente. Va a la tarea, no a un historial que no se puede borrar. */
export const MAX_NOTA_PRECIO = 500

export type PeticionPrecio = {
  prioridad: PrioridadPrecio
  canal: CanalPrecio
  /** Solo con llamada; con correo es `null`. */
  momento: MomentoLlamada | null
  nota: string | null
}

export function validarPeticionPrecio(b: unknown): { ok: true; peticion: PeticionPrecio } | { ok: false; motivo: string } {
  const o = (typeof b === 'object' && b !== null ? b : {}) as Record<string, unknown>
  const prioridad = PRIORIDADES_PRECIO.find((p) => p === o.prioridad)
  if (!prioridad) return { ok: false, motivo: 'Dinos qué te importa más.' }
  const canal = CANALES_PRECIO.find((c) => c === o.canal)
  if (!canal) return { ok: false, motivo: 'Dinos cómo prefieres que te contactemos.' }
  let momento: MomentoLlamada | null = null
  if (canal === 'llamada') {
    momento = MOMENTOS_LLAMADA.find((m) => m === o.momento) ?? null
    if (!momento) return { ok: false, motivo: 'Dinos cuándo te viene mejor que te llamemos.' }
  }
  const nota = typeof o.nota === 'string' && o.nota.trim() !== '' ? o.nota.trim().slice(0, MAX_NOTA_PRECIO) : null
  return { ok: true, peticion: { prioridad, canal, momento, nota } }
}

/**
 * Días desde `hoyIso` hasta `fechaIso` (los dos `YYYY-MM-DD`, días de calendario).
 * `null` si alguna no es una fecha válida.
 */
export function diasHasta(fechaIso: string, hoyIso: string): number | null {
  const a = Date.parse(`${fechaIso}T00:00:00Z`)
  const b = Date.parse(`${hoyIso}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((a - b) / 86_400_000)
}

/**
 * ¿Entra en «Tus vencimientos»? De hoy a `DIAS_VENTANA_VENCIMIENTOS` días.
 * Una fecha PASADA no entra: con la póliza vigente significa que la compañía
 * no ha mandado la renovación, y decirle al cliente «te renovó hace 3 meses»
 * sería afirmar algo que no sabemos.
 */
export function enVentanaVencimientos(dias: number | null): boolean {
  return dias !== null && dias >= 0 && dias <= DIAS_VENTANA_VENCIMIENTOS
}

/**
 * El texto de la TAREA que ve Alberto (no el cliente). Lleva la nota libre del
 * cliente porque es lo que tiene que leer antes de llamar; por eso va en la
 * tarea y NO en `oportunidad_historial`, que no se puede borrar.
 */
export function textoTareaPrecio(d: {
  ramo: string | null
  compania: string | null
  numeroPoliza: string | null
  fechaVencimiento: string | null
  peticion: PeticionPrecio
}): string {
  const p = d.peticion
  const poliza = [d.ramo, d.compania, d.numeroPoliza ? `nº ${d.numeroPoliza}` : null].filter(Boolean).join(' · ')
  const vence = d.fechaVencimiento ? `, renueva el ${d.fechaVencimiento}` : ''
  const contacto = p.canal === 'llamada'
    ? `llamada, ${ROTULO_MOMENTO[p.momento ?? 'igual'].toLowerCase()}`
    : 'por correo'
  return [
    `El cliente pide desde el portal que le mejores el precio de su póliza (${poliza || 'sin datos'}${vence}).`,
    `Le importa: ${ROTULO_PRIORIDAD[p.prioridad].toLowerCase()}. Contactar: ${contacto}.`,
    p.nota ? `Nota del cliente: ${p.nota}` : null,
  ].filter(Boolean).join('\n')
}
