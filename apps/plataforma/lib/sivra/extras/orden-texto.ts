// lib/sivra/extras/orden-texto.ts — el TEXTO que lee la empresa de limpieza.
//
// Módulo PURO a propósito (sin BD, sin mailer, sin `@/`): lo que se le manda a una persona que
// va a actuar sobre un piso tiene que poder probarse sin levantar nada. `orden-limpieza.ts`
// pone el envío y el registro; aquí solo se decide qué pone el email.

/** dd/mm/aaaa desde un ISO/date; deja igual lo que no reconozca. */
export function fmtFecha(f: string): string {
  const m = (f || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (f || '?')
}

export interface DatosOrden {
  piso: string
  direccion?: string
  checkIn: string
  /** Resumen corto para el asunto («colocar cuna»). */
  titulo: string
  /** Lo que hay que hacer, en una frase. Sale tal cual en el cuerpo. */
  instruccion: string
  huesped?: string
}

/**
 * Asunto y cuerpo de una orden a la limpieza.
 *
 * 🚨 Deliberadamente SIN importe y sin la palabra «pagado». El email hermano (`aviso-limpieza.ts`)
 * sí lo dice porque lo dispara el webhook de Stripe, que ha visto el cobro; esta ruta no ha visto
 * ninguno —la orden se manda igual si el huésped pagó por Bizum o si el extra se regala—, así que
 * afirmar aquí que algo está cobrado sería declarar un dato que nadie ha comprobado.
 */
export function componerOrden(d: DatosOrden): { asunto: string; texto: string } {
  const asunto = `${d.piso} · ${fmtFecha(d.checkIn)} · ${d.titulo.toLowerCase()}`
  const lineas = [
    `Hola:`,
    ``,
    `Para la entrada del ${fmtFecha(d.checkIn)} en ${d.piso}${d.direccion ? ` (${d.direccion})` : ''}:`,
    ``,
    `  ${d.instruccion}`,
    ``,
  ]
  if (d.huesped) lineas.push(`(Huésped: ${d.huesped}.)`, ``)
  lineas.push(`Gracias.`)
  return { asunto, texto: lineas.join('\n') }
}

export type OrdenVista = {
  instruccion: string
  enviadoAt: string | null
  error: string | null
  /** Id de la tarea en `/invitado/limpieza`. `null` = la limpieza NO la ve en su pantalla. */
  tareaId: string | null
}
export type ResumenOrdenes = { tono: 'ok' | 'aviso' | 'error' | 'neutro'; texto: string }

/**
 * Titular de las órdenes de limpieza de una reserva, para pintarlo en la ficha.
 *
 * 🚨 LA PREGUNTA NO ES «¿salió el email?», ES «¿LO VE QUIEN TIENE QUE HACERLO?» (01/09/2026).
 * Sique Brilla (Vanesa) ya no entra en ialimp: su único acceso es `/invitado/limpieza`, que lee
 * `limpieza_tareas`. Una orden con el email enviado pero SIN tarea está pedida en un canal que
 * ellos no abren — y pintarla en verde sería decir «avisada» de algo invisible. Por eso el orden
 * de gravedad va por `tareaId`, no por `enviadoAt`.
 *
 * Desenlaces (el estado es lo que decide qué hacer, por eso no se colapsan):
 *   `undefined` → todavía no se ha cargado: NO se dice nada (null).
 *   `null`      → no se ha podido consultar: se DECLARA el hueco, jamás «no hay nada pedido».
 *   `[]`        → consultado: no se ha pedido nada.
 *   sin tarea NI email → 🛑 nadie se ha enterado.
 *   sin tarea, con email → ⚠️ salió el correo, pero no está en su pantalla.
 *   con tarea → 🧹 la limpieza lo ve (aunque el email fallara: el canal que importa está cubierto).
 */
export function resumenOrdenes(ordenes: OrdenVista[] | null | undefined): ResumenOrdenes | null {
  if (ordenes === undefined) return null
  if (ordenes === null) return { tono: 'aviso', texto: '🧹 Órdenes a limpieza: no se han podido consultar' }
  if (ordenes.length === 0) return { tono: 'neutro', texto: '🧹 Sin órdenes a la limpieza' }

  const invisibles = ordenes.filter(o => !o.tareaId)
  if (invisibles.length) {
    const mudas = invisibles.filter(o => !o.enviadoAt)
    const lista = invisibles.map(o => o.instruccion).join(' · ')
    return mudas.length
      ? { tono: 'error', texto: `🛑 La limpieza NO se ha enterado: ${lista}` }
      : { tono: 'aviso', texto: `⚠️ Enviado por email, pero NO está en la pantalla de la limpieza: ${lista}` }
  }
  return { tono: 'ok', texto: `🧹 Pedido a la limpieza: ${ordenes.map(o => o.instruccion).join(' · ')}` }
}
