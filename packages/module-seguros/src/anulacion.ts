// packages/module-seguros/src/anulacion.ts
//
// Expediente de anulación de una póliza (Fase 2 de ASegura OS, pieza 2-d). PURO.
//
// El recorrido: solicitada → firmada (el cliente la firma) → comunicada (se manda a la compañía)
// → confirmada (CIMA ya la trae como no vigente). Se puede desistir en cualquier punto abierto.
//
// 🚨 No se comunica nada a la compañía sin firma del tomador: «comunicada» solo sale de «firmada».
// La comunicación misma NO se hace aquí: irá por la cola de aprobaciones (regla de comunicaciones
// salientes). Aquí solo se valida, se ordena y se dice cuál es el siguiente paso.

import { ventanaAnulacion } from './pago.ts'
import { MOTIVOS_PERDIDA, type MotivoPerdida } from './oportunidad-seguimiento.ts'

export const TIPOS_ANULACION = ['no_renovacion', 'inmediata', 'sustitucion'] as const
export type TipoAnulacion = (typeof TIPOS_ANULACION)[number]

export const SOLICITANTES_ANULACION = ['cliente', 'correduria', 'compania'] as const
export type SolicitanteAnulacion = (typeof SOLICITANTES_ANULACION)[number]

export const MOTIVOS_ANULACION = ['precio', 'competidor', 'coberturas', 'venta_del_bien', 'cliente_desiste', 'impago', 'otro'] as const
export type MotivoAnulacion = (typeof MOTIVOS_ANULACION)[number]

export const ESTADOS_ANULACION = ['solicitada', 'firmada', 'comunicada', 'confirmada', 'desistida'] as const
export type EstadoAnulacion = (typeof ESTADOS_ANULACION)[number]
export const ESTADOS_ANULACION_ABIERTA: readonly EstadoAnulacion[] = ['solicitada', 'firmada', 'comunicada']

export const ETIQUETA_TIPO_ANULACION: Record<TipoAnulacion, string> = {
  no_renovacion: 'Al vencimiento (no renovar)',
  inmediata: 'Anticipada (antes del vencimiento)',
  sustitucion: 'Por sustitución (la reemplaza otra póliza)',
}

export const ETIQUETA_MOTIVO_ANULACION: Record<MotivoAnulacion, string> = {
  precio: 'Precio',
  competidor: 'Se va a otra compañía o corredor',
  coberturas: 'Coberturas',
  venta_del_bien: 'Vendió el bien asegurado',
  cliente_desiste: 'Ya no lo necesita',
  impago: 'Impago',
  otro: 'Otro',
}

export const ETIQUETA_ESTADO_ANULACION: Record<EstadoAnulacion, string> = {
  solicitada: 'Solicitada',
  firmada: 'Firmada por el cliente',
  comunicada: 'Comunicada a la compañía',
  confirmada: 'Confirmada por la compañía',
  desistida: 'Desistida',
}

/** Días tras la fecha de efecto que se espera a que CIMA la refleje antes de dar la alarma. */
export const DIAS_ESPERA_CONFIRMACION = 15

export type SolicitudAnulacion = {
  tipo: TipoAnulacion
  solicitadaPor: SolicitanteAnulacion
  motivo: MotivoAnulacion
  motivoTexto: string | null
  /** `YYYY-MM-DD`. */
  fechaEfecto: string
}

export type ResultadoSolicitud =
  | { ok: true; solicitud: SolicitudAnulacion; advertencia: string | null }
  | { ok: false; motivo: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/

function fechaValida(s: unknown): s is string {
  return typeof s === 'string' && ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
}

function fechaEs(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function fechaHoraEs(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const f = d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })
  const h = d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })
  return `${f} a las ${h}`
}

function uno<T extends string>(lista: readonly T[], v: unknown): T | null {
  return lista.find((x) => x === v) ?? null
}

/**
 * Valida lo que pide el corredor contra la póliza. `vencimiento` y `hoy` en `YYYY-MM-DD` (Madrid).
 * Lo que es ilegal o imposible, se rechaza; lo que es posible pero arriesgado, pasa con advertencia.
 */
export function validarSolicitud(v: unknown, ctx: { vencimiento: string | null; hoy: string }): ResultadoSolicitud {
  if (!v || typeof v !== 'object') return { ok: false, motivo: 'Solicitud vacía.' }
  const o = v as Record<string, unknown>
  const tipo = uno(TIPOS_ANULACION, o.tipo)
  const solicitadaPor = uno(SOLICITANTES_ANULACION, o.solicitadaPor)
  const motivo = uno(MOTIVOS_ANULACION, o.motivo)
  if (!tipo) return { ok: false, motivo: 'Elige el tipo de anulación.' }
  if (!solicitadaPor) return { ok: false, motivo: 'Di quién la pide.' }
  if (!motivo) return { ok: false, motivo: 'Elige el motivo.' }
  const motivoTexto = typeof o.motivoTexto === 'string' && o.motivoTexto.trim() ? o.motivoTexto.trim().slice(0, 500) : null
  if (motivo === 'otro' && !motivoTexto) return { ok: false, motivo: 'Con «Otro», escribe el motivo.' }
  if (!fechaValida(o.fechaEfecto)) return { ok: false, motivo: 'Fecha de efecto no válida.' }
  const fechaEfecto = o.fechaEfecto
  const solicitud: SolicitudAnulacion = { tipo, solicitadaPor, motivo, motivoTexto, fechaEfecto }

  if (tipo === 'no_renovacion') {
    if (!ctx.vencimiento) return { ok: false, motivo: 'No consta el vencimiento de la póliza: sin él no se puede anular al vencimiento.' }
    if (fechaEfecto !== ctx.vencimiento) return { ok: false, motivo: `Al vencimiento, el efecto es el vencimiento (${fechaEs(ctx.vencimiento)}).` }
    if (ctx.vencimiento < ctx.hoy) return { ok: false, motivo: 'Ese vencimiento ya pasó: la póliza se ha renovado o ya no está. Revisa la fecha antes.' }
    const w = ventanaAnulacion(ctx.vencimiento, new Date(`${ctx.hoy}T12:00:00Z`))
    // Art. 22 LCS: el tomador se opone a la prórroga con un mes de antelación. Fuera de plazo la
    // compañía puede prorrogar igual; se deja tramitar (hay compañías que la aceptan), avisado.
    // La compañía, en cambio, tiene que avisar con dos meses.
    const diasHasta = diasEntre(ctx.hoy, ctx.vencimiento)
    const advertencia = solicitadaPor === 'compania'
      ? (diasHasta < 60 ? 'La compañía tiene que oponerse a la prórroga con dos meses de antelación (art. 22 LCS): este aviso llega tarde.' : null)
      : w && !w.enPlazo
        ? `Fuera del plazo del art. 22 LCS (había que avisar antes del ${fechaEs(w.limiteAviso)}): la compañía puede prorrogarla otro año.`
        : null
    return { ok: true, solicitud, advertencia }
  }

  if (diasEntre(fechaEfecto, ctx.hoy) > 90) return { ok: false, motivo: 'El efecto no puede ser de hace más de 90 días.' }
  if (ctx.vencimiento && fechaEfecto > ctx.vencimiento) {
    return { ok: false, motivo: `El efecto es posterior al vencimiento (${fechaEs(ctx.vencimiento)}): eso es anular al vencimiento.` }
  }
  if (tipo === 'inmediata') {
    return {
      ok: true,
      solicitud,
      advertencia: motivo === 'venta_del_bien'
        ? null
        : 'La baja anticipada depende del condicionado: no todas las compañías la admiten ni devuelven la prima no consumida.',
    }
  }
  return { ok: true, solicitud, advertencia: null }
}

// ─── Baja pedida por el CLIENTE desde el portal ───────────────────────────────────────────────
//
// El cliente no firma de inmediato lo que acaba de pedir: la solicitud queda RETENIDA 48 h (o hasta que el
// corredor la libere) para que le llame antes de que la carta salga hacia la compañía. Si el efecto es
// inminente (≤3 días) nace liberada: esperar 48 h la dejaría sin efecto a tiempo.

export const MOTIVOS_PORTAL = ['venta', 'precio', 'otro'] as const
export type MotivoPortal = (typeof MOTIVOS_PORTAL)[number]
export const HORAS_RETENCION_PORTAL = 48
/** Con el efecto a este número de días o menos, la solicitud del portal nace liberada (`liberada_por = 'plazo'`). */
export const DIAS_LIBERACION_DIRECTA = 3
/** Por debajo de estos días al vencimiento, la no renovación llega tarde para el preaviso del art. 22 LCS. */
export const DIAS_AVISO_VENCIMIENTO_PORTAL = 30

export type OrigenAnulacion = 'corredor' | 'portal'

export type SolicitudPortal = SolicitudAnulacion & { origen: 'portal'; fechaVenta: string | null; liberadaDeEntrada: boolean }

export type ResultadoSolicitudPortal =
  | { ok: true; solicitud: SolicitudPortal; advertencia: string | null }
  | { ok: false; error: 'ofrecer_presupuesto' | 'invalida'; motivo: string }

/**
 * Traduce lo que el cliente marca en el portal a una solicitud de anulación, con las MISMAS reglas que la del
 * corredor (`validarSolicitud`). `vencimiento` y `hoy` en `YYYY-MM-DD` (Madrid).
 *   · venta  → anticipada, con efecto = la fecha de venta (≤90 días atrás y no posterior al vencimiento).
 *   · precio → no renovación; antes tiene que haber visto la opción de mejorar el precio (`ofertaPrecioVista`).
 *   · otro   → no renovación; el motivo en texto es obligatorio.
 */
export function solicitudDesdePortal(cuerpo: unknown, ctx: { vencimiento: string | null; hoy: string }): ResultadoSolicitudPortal {
  if (!cuerpo || typeof cuerpo !== 'object') return { ok: false, error: 'invalida', motivo: 'Solicitud vacía.' }
  const o = cuerpo as Record<string, unknown>
  const motivo = uno(MOTIVOS_PORTAL, o.motivo)
  if (!motivo) return { ok: false, error: 'invalida', motivo: 'Elige el motivo.' }
  let texto = typeof o.motivoTexto === 'string' && o.motivoTexto.trim() ? o.motivoTexto.trim().slice(0, 500) : null

  let entrada: Record<string, unknown>
  let fechaVenta: string | null = null
  if (motivo === 'venta') {
    if (!fechaValida(o.fechaVenta)) return { ok: false, error: 'invalida', motivo: 'Indica la fecha en que vendiste el bien.' }
    // Una venta ya hecha: la fecha no puede ser futura (el resto —90 días, vencimiento— lo mira `validarSolicitud`).
    if (o.fechaVenta > ctx.hoy) return { ok: false, error: 'invalida', motivo: 'La fecha de la venta no puede ser futura.' }
    fechaVenta = o.fechaVenta
    entrada = { tipo: 'inmediata', motivo: 'venta_del_bien', motivoTexto: texto, fechaEfecto: fechaVenta }
  } else {
    if (motivo === 'precio' && o.ofertaPrecioVista !== true) {
      return { ok: false, error: 'ofrecer_presupuesto', motivo: 'Antes de darte de baja por el precio, déjanos mejorártelo: te preparamos un presupuesto sin compromiso.' }
    }
    if (motivo === 'precio') {
      // Opcionales: con qué compañía se compara y qué precio le ofrecen (texto estable, sin columnas nuevas).
      const oferta = textoOfertaPrecio(o.competidor, o.precioOfrecido)
      if (!oferta.ok) return { ok: false, error: 'invalida', motivo: oferta.motivo }
      texto = oferta.texto
    }
    if (motivo === 'otro' && !texto) return { ok: false, error: 'invalida', motivo: 'Cuéntanos el motivo.' }
    if (!ctx.vencimiento) return { ok: false, error: 'invalida', motivo: 'No consta el vencimiento de la póliza: sin él no se puede pedir la baja al vencimiento. Llámanos.' }
    entrada = { tipo: 'no_renovacion', motivo, motivoTexto: texto, fechaEfecto: ctx.vencimiento }
  }

  const v = validarSolicitud({ ...entrada, solicitadaPor: 'cliente' }, ctx)
  if (!v.ok) return { ok: false, error: 'invalida', motivo: v.motivo }
  let advertencia = v.advertencia // (el del corredor habla de plazos; al cliente, si queda poco, se le dice con su texto)
  if (v.solicitud.tipo === 'no_renovacion' && ctx.vencimiento && diasEntre(ctx.hoy, ctx.vencimiento) < DIAS_AVISO_VENCIMIENTO_PORTAL) {
    advertencia = `Quedan menos de ${DIAS_AVISO_VENCIMIENTO_PORTAL} días para el vencimiento: la compañía puede prorrogar la póliza otro año (art. 22 LCS). Te llamamos para verlo.`
  }
  return {
    ok: true,
    solicitud: { ...v.solicitud, origen: 'portal', fechaVenta, liberadaDeEntrada: diasEntre(ctx.hoy, v.solicitud.fechaEfecto) <= DIAS_LIBERACION_DIRECTA },
    advertencia,
  }
}

const MS_HORA = 3_600_000

/** Tope del texto que el cliente puede dejar en el motivo `precio` (compañía + precio ofrecido). */
export const MAX_TEXTO_PRECIO_PORTAL = 120

function limpiarTextoLibre(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  // Sin saltos ni caracteres de control, y sin «·» ni «:» que romperían el formato estable.
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f·]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim()
  return t === '' ? null : t
}

/** `123,45` · `1.234,56` · `123.45` · `1234` → euros, o `null` si no es un importe razonable. */
export function parsearEuros(v: unknown): number | null {
  let n: number
  if (typeof v === 'number') n = v
  else if (typeof v === 'string') {
    let t = v.replace(/[\s€]/g, '')
    if (t === '') return null
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
    n = Number(t)
  } else return null
  return Number.isFinite(n) && n > 0 && n <= 100_000 ? Math.round(n * 100) / 100 : null
}

/** `2.162,49€` (puntos de miles también en 4 cifras, coma decimal, € detrás). */
export function eurosEs(n: number): string {
  const [ent, dec] = n.toFixed(2).split('.')
  return `${ent!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}€`
}

/**
 * El texto estable de la oferta que el cliente dice tener: «competidor: X · precio_ofrecido: 123,45€» (cada parte solo
 * si la dio; ambas vacías → `null`). Saneado y ≤120 caracteres. Un precio no numérico es un error, no se descarta.
 */
export function textoOfertaPrecio(compania: unknown, precio: unknown): { ok: true; texto: string | null } | { ok: false; motivo: string } {
  const partes: string[] = []
  const c = limpiarTextoLibre(compania, 60)
  if (c) partes.push(`competidor: ${c}`)
  const hayPrecio = typeof precio === 'number' || (typeof precio === 'string' && precio.trim() !== '')
  if (hayPrecio) {
    const e = parsearEuros(precio)
    if (e === null) return { ok: false, motivo: 'El precio que te ofrecen no es válido: escribe solo el importe al año (p. ej. 123,45).' }
    partes.push(`precio_ofrecido: ${eurosEs(e)}`)
  }
  return { ok: true, texto: partes.length ? partes.join(' · ').slice(0, MAX_TEXTO_PRECIO_PORTAL) : null }
}

/** Cuándo se libera sola una baja pedida desde el portal: `created_at` + 48 h. */
export function liberaSolaAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + HORAS_RETENCION_PORTAL * MS_HORA)
}

/**
 * ¿Se puede firmar ya? Las del corredor, siempre. Las del portal, cuando el corredor las libera o pasan 48 h.
 * (La misma regla que `LIBERADA_SQL` en la consulta y que el CHECK `anulacion_portal_retenida` en la BD.)
 */
export function liberadaParaFirma(a: { origen: OrigenAnulacion; liberadaAt: Date | null; createdAt: Date }, ahora: Date): boolean {
  if (a.origen !== 'portal') return true
  if (a.liberadaAt) return true
  return ahora.getTime() >= liberaSolaAt(a.createdAt).getTime()
}

export type AccionAnulacion = 'marcar_firmada' | 'marcar_comunicada' | 'confirmar' | 'desistir'
export const ACCIONES_ANULACION: readonly AccionAnulacion[] = ['marcar_firmada', 'marcar_comunicada', 'confirmar', 'desistir']

/** El estado al que lleva una acción, o `null` si desde ahí no se puede. */
export function transicion(estado: EstadoAnulacion, accion: AccionAnulacion): EstadoAnulacion | null {
  if (!ESTADOS_ANULACION_ABIERTA.includes(estado)) return null
  switch (accion) {
    case 'marcar_firmada': return estado === 'solicitada' ? 'firmada' : null
    // Sin firma no se comunica: la anulación es del tomador, no de la correduría.
    case 'marcar_comunicada': return estado === 'firmada' ? 'comunicada' : null
    // Confirmar es que la compañía ha aplicado lo que se le comunicó: sin comunicación no hay qué confirmar.
    case 'confirmar': return estado === 'comunicada' ? 'confirmada' : null
    case 'desistir': return 'desistida'
  }
}

export type SiguientePaso = { texto: string; alerta: boolean }

/** Qué toca ahora con un expediente abierto. `hoy` en `YYYY-MM-DD`. */
export function siguientePaso(
  a: {
    estado: EstadoAnulacion
    fechaEfecto: string
    compania: string | null
    /** Pedida por el cliente desde el portal y aún RETENIDA: `liberaSolaAt` (ISO) es cuándo se libera sola. */
    pedidaPorCliente?: { liberaSolaAt: string } | null
  },
  hoy: string,
): SiguientePaso | null {
  const compania = a.compania ?? 'la compañía'
  switch (a.estado) {
    case 'solicitada': {
      if (a.pedidaPorCliente) {
        return { texto: `Pedida por el cliente: llámale; se libera sola el ${fechaHoraEs(a.pedidaPorCliente.liberaSolaAt)}.`, alerta: true }
      }
      const alerta = diasEntre(hoy, a.fechaEfecto) <= 15
      return { texto: `Falta la firma del cliente${alerta ? ` y el efecto es el ${fechaEs(a.fechaEfecto)}` : ''}.`, alerta }
    }
    case 'firmada': return { texto: `Firmada: falta comunicarla a ${compania}.`, alerta: diasEntre(hoy, a.fechaEfecto) <= 15 }
    case 'comunicada': {
      const tarde = diasEntre(a.fechaEfecto, hoy) - DIAS_ESPERA_CONFIRMACION
      return tarde > 0
        ? { texto: `CIMA aún no la refleja ${diasEntre(a.fechaEfecto, hoy)} días después del efecto: pide a ${compania} el suplemento de anulación.`, alerta: true }
        : { texto: `Comunicada: falta que ${compania} la aplique (se verá en CIMA).`, alerta: false }
    }
    default: return null
  }
}

/** Cómo queda la pérdida de cartera que explica esta anulación (revisión del evento de baja). */
export function resolucionDeAnulacion(a: { tipo: TipoAnulacion; motivo: MotivoAnulacion }): { resolucion: 'perdida'; motivo: MotivoPerdida } | { resolucion: 'no_es_perdida' } {
  if (a.tipo === 'sustitucion') return { resolucion: 'no_es_perdida' }
  const directo = MOTIVOS_PERDIDA.find((m) => m === a.motivo)
  return { resolucion: 'perdida', motivo: directo ?? 'otro' }
}

export type DatosCarta = {
  tomador: string
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  tipo: TipoAnulacion
  /** `YYYY-MM-DD`. */
  fechaEfecto: string
  /** `YYYY-MM-DD`: el día en que se compone (y se firma). */
  fechaCarta: string
  mediador: string
}

/**
 * La carta de anulación que el TOMADOR firma en el portal y que después se manda a la compañía.
 * `null` si falta un dato sin el cual la carta no identifica la póliza (compañía o número):
 * una carta con huecos no se puede firmar, porque lo firmado tiene que ser lo que se envía.
 *
 * El texto es EXACTAMENTE lo que se hashea: cualquier cambio de redacción cambia la huella de las
 * cartas futuras, nunca la de las ya firmadas (esas guardan su texto).
 */
export function cartaAnulacion(d: DatosCarta): string | null {
  const tomador = d.tomador.trim()
  if (!tomador || !d.compania?.trim() || !d.numeroPoliza?.trim()) return null
  const poliza = `la póliza nº ${d.numeroPoliza.trim()}${d.ramo ? ` (${d.ramo})` : ''}`
  const voluntad =
    d.tipo === 'no_renovacion'
      ? `me opongo a su prórroga, de modo que el contrato termine en su vencimiento del ${fechaEs(d.fechaEfecto)} (art. 22 de la Ley de Contrato de Seguro).`
      : d.tipo === 'sustitucion'
        ? `solicito su anulación con efecto el ${fechaEs(d.fechaEfecto)}, por sustituirse por otra póliza.`
        : `solicito su anulación con efecto el ${fechaEs(d.fechaEfecto)}.`
  return [
    `A la atención de ${d.compania.trim()}`,
    '',
    `Asunto: anulación de ${poliza}`,
    '',
    `Yo, ${tomador}, tomador de ${poliza}, ${voluntad}`,
    '',
    `Esta comunicación se tramita a través de mi corredor de seguros, ${d.mediador}.`,
    '',
    `Firmado electrónicamente el ${fechaEs(d.fechaCarta)}.`,
    tomador,
  ].join('\n')
}
