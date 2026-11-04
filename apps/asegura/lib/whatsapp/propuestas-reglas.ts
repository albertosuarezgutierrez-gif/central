// Propuestas de la IA de WhatsApp (spec 2026-11-04 §5, decisión D1 de Alberto): reglas PURAS, sin BD.
//
// La IA NUNCA ejecuta b1-b3: solo deja una PROPUESTA (`whatsapp_propuestas`) y Alberto la aplica o la descarta con el
// botón de Telegram (callback `wap_ok:<id>` / `wap_no:<id>`). El handler del callback vive en PLATAFORMA (parte B), que
// llama a `POST /api/operador/whatsapp/propuesta` { id, decision } → `resolverPropuesta()` (`propuestas.ts`).
//
//   · fecha_cobro («pásamelo el día 15»): aplicar = `poliza_recibos.fecha_prometida_pago` + tarea «comprobar cobro» ese
//     día + nota. La situación del recibo NO se toca (la manda CIMA/la compañía).
//   · pagado («ya lo pagué»): aplicar = tarea «verificar cobro» + nota. JAMÁS cierra la devolución: eso es el botón
//     «cobrado de nuevo» (`resolverDevolucion`), que solo pulsa una persona.
//   · vencimiento («vence en marzo»): aplicar = la misma escritura que `EditarVencimiento` (`editarOportunidad` con
//     `reprogramar`): pisa `fecha_fin_vigencia` y mueve/crea la llamada de seguimiento.
// Un solo uso (anti-replay): una propuesta ya resuelta → 409; caducada (7 días) → 410 y no se aplica.

export const PREFIJO_WAP = 'wap'
export const CALLBACK_APLICAR = `${PREFIJO_WAP}_ok`
export const CALLBACK_DESCARTAR = `${PREFIJO_WAP}_no`
/** ✏️ Modificar: plataforma pide la corrección con force_reply (marca «[wap <uuid>]») y la manda como `modificar`. */
export const CALLBACK_MODIFICAR = `${PREFIJO_WAP}_ed`
/** ↩️ Deshacer una propuesta aplicada SOLA (modo autónomo). Un uso; solo el titular. */
export const CALLBACK_DESHACER = `${PREFIJO_WAP}_un`
/** Todas las acciones `wap_<acción>` que emite asegura (plataforma acepta exactamente estas; lo fija un test). */
export const ACCIONES_WAP = ['ok', 'no', 'ed', 'un'] as const

export const TIPOS_PROPUESTA = ['fecha_cobro', 'pagado', 'vencimiento'] as const
export type TipoPropuesta = (typeof TIPOS_PROPUESTA)[number]
export const ESTADOS_PROPUESTA = ['pendiente', 'aplicada', 'descartada', 'caducada'] as const
export type EstadoPropuesta = (typeof ESTADOS_PROPUESTA)[number]
export const DIAS_CADUCIDAD = 7

export type Decision = 'aplicar' | 'descartar'
/** Lo que llega al endpoint: además de ✅/❌, la corrección de ✏️ y el ↩️ de una autónoma. */
export type DecisionEndpoint =
  | { id: string; decision: Decision }
  | { id: string; decision: 'modificar'; correccion: string }
  | { id: string; decision: 'deshacer' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validarResolucion(b: unknown): ({ ok: true } & DecisionEndpoint) | { ok: false; motivo: string } {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, motivo: 'cuerpo no válido' }
  const o = b as Record<string, unknown>
  if (typeof o.id !== 'string' || !UUID.test(o.id)) return { ok: false, motivo: 'id no válido' }
  const id = o.id.toLowerCase()
  if (o.decision === 'aplicar' || o.decision === 'descartar') return { ok: true, id, decision: o.decision }
  if (o.decision === 'deshacer') return { ok: true, id, decision: 'deshacer' }
  if (o.decision === 'modificar') {
    if (typeof o.correccion !== 'string' || !o.correccion.trim() || o.correccion.length > 500) return { ok: false, motivo: 'correccion: texto de 1 a 500 caracteres' }
    return { ok: true, id, decision: 'modificar', correccion: o.correccion }
  }
  return { ok: false, motivo: 'decision debe ser aplicar, descartar, modificar o deshacer' }
}

/** ✅ / ❌ / ✏️: `wap_ok|no|ed:<uuid>` (43 bytes, bajo el tope de 64 de Telegram). */
export function botonesPropuesta(id: string, etiqueta?: string): { texto: string; callback: string }[] {
  const sufijo = etiqueta ? ` ${etiqueta}` : ''
  return [
    { texto: `✅ Aplicar${sufijo}`, callback: `${CALLBACK_APLICAR}:${id}` },
    { texto: `❌ Descartar${sufijo}`, callback: `${CALLBACK_DESCARTAR}:${id}` },
    { texto: `✏️ Modificar${sufijo}`, callback: `${CALLBACK_MODIFICAR}:${id}` },
  ]
}

/** El único botón de una propuesta aplicada SOLA: ↩️ Deshacer (`wap_un:<uuid>`). */
export function botonDeshacer(id: string, etiqueta?: string): { texto: string; callback: string }[] {
  return [{ texto: `↩️ Deshacer${etiqueta ? ` ${etiqueta}` : ''}`, callback: `${CALLBACK_DESHACER}:${id}` }]
}

/** De un `callback_data` de Telegram, la decisión y el id; cualquier otra cosa → null (no es nuestro o está mal). */
export function leerCallbackPropuesta(data: string): { id: string; decision: Decision } | null {
  const m = /^wap_(ok|no):([0-9a-f-]{36})$/i.exec(data)
  if (!m || !UUID.test(m[2])) return null
  return { id: m[2].toLowerCase(), decision: m[1] === 'ok' ? 'aplicar' : 'descartar' }
}

/** Cualquier `wap_<acción>:<uuid>` nuestro (las cuatro de `ACCIONES_WAP`); otra cosa → null. */
export function leerCallbackWap(data: string): { id: string; accion: (typeof ACCIONES_WAP)[number] } | null {
  const m = /^wap_(ok|no|ed|un):([0-9a-f-]{36})$/i.exec(data)
  if (!m || !UUID.test(m[2])) return null
  return { id: m[2].toLowerCase(), accion: m[1].toLowerCase() as (typeof ACCIONES_WAP)[number] }
}

/**
 * ↩️ ¿Se puede deshacer? Solo una propuesta `aplicada` SOLA (`resultado.autonoma === true`), con el valor previo
 * guardado y sin deshacer antes (un uso: `resultado.deshecha_at`). PURO.
 */
export function puedeDeshacer(p: { estado: string; resultado: Record<string, unknown> | null }):
  | { ok: true }
  | { ok: false; estado: 'no_autonoma' | 'ya_deshecha' | 'sin_previo'; status: 409 } {
  const r = p.resultado ?? {}
  if (p.estado !== 'aplicada' || r.autonoma !== true) return { ok: false, estado: 'no_autonoma', status: 409 }
  if (r.deshecha_at !== undefined && r.deshecha_at !== null) return { ok: false, estado: 'ya_deshecha', status: 409 }
  if (!r.previo || typeof r.previo !== 'object' || Array.isArray(r.previo)) return { ok: false, estado: 'sin_previo', status: 409 }
  return { ok: true }
}

export type EstadoActual = { estado: EstadoPropuesta; caducaAt: Date }
export type Veredicto =
  | { ok: true }
  | { ok: false; estado: 'ya_resuelta'; status: 409; era: EstadoPropuesta }
  | { ok: false; estado: 'caducada'; status: 410 }

/** ¿Se puede resolver AHORA? Un solo uso; una caducada no se aplica (sí se puede descartar: limpia el botón). */
export function puedeResolver(p: EstadoActual, decision: Decision, ahora: Date): Veredicto {
  if (p.estado !== 'pendiente') return { ok: false, estado: 'ya_resuelta', status: 409, era: p.estado }
  if (decision === 'aplicar' && p.caducaAt.getTime() <= ahora.getTime()) return { ok: false, estado: 'caducada', status: 410 }
  return { ok: true }
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** aaaa-mm-dd que existe de verdad en el calendario (2026-02-30 no). */
export function fechaIsoReal(s: string): boolean {
  if (!FECHA.test(s)) return false
  const [a, m, d] = s.split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1, d))
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** El payload que se guarda: solo la fecha (aaaa-mm-dd) cuando el tipo la lleva. Nada del texto del cliente. */
export function payloadPropuesta(tipo: TipoPropuesta, fecha: string | null): { fecha?: string } | null {
  if (tipo === 'pagado') return {}
  return fecha && fechaIsoReal(fecha) ? { fecha } : null
}

/** Una línea del aviso de Telegram, sin PII (ramo, fecha e importe ya formateados por quien llama). */
export function lineaPropuesta(tipo: TipoPropuesta, p: { ramo: string | null; fecha: string | null; importe: string | null }): string {
  const ramo = p.ramo ? p.ramo.replace(/_/g, ' ') : 'póliza'
  const fecha = p.fecha ? p.fecha.split('-').reverse().join('/') : '—'
  const importe = p.importe ? ` (${p.importe})` : ''
  if (tipo === 'fecha_cobro') return `💶 Promete pagar el recibo de ${ramo}${importe} el ${fecha}`
  if (tipo === 'pagado') return `✅ Dice que ya pagó el recibo de ${ramo}${importe}: verificar cobro`
  return `📅 Vencimiento de ${ramo}: ${fecha}`
}

/** Tareas que deja aplicar (texto fijo + fecha límite); `vencimiento` la decide `editarOportunidad`. */
export function tareaAlAplicar(tipo: TipoPropuesta, fecha: string | null, hoy: string): { descripcion: string; fechaLimite: string } | null {
  if (tipo === 'fecha_cobro' && fecha) return { descripcion: `Comprobar cobro del recibo prometido para el ${fecha.split('-').reverse().join('/')} (WhatsApp)`, fechaLimite: fecha < hoy ? hoy : fecha }
  if (tipo === 'pagado') return { descripcion: 'Verificar cobro: el cliente dice por WhatsApp que ya lo pagó', fechaLimite: hoy }
  return null
}

/** Aplicar falló: intenta devolver la propuesta a `pendiente`; si eso falla también, la deja `descartada` (nunca `aplicada` sin efecto). */
export async function cerrarSiFallaDevolver(devolver: () => Promise<void>, descartar: () => Promise<void>): Promise<void> {
  try {
    await devolver()
  } catch {
    await descartar()
  }
}
