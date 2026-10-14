// EXPLORADOR IA del tarificador — presentación PURA de /correduria/tarificador/exploraciones (13/10/2026, fase C).
// Tipos de lo que sirve el puerto de asegura (`/api/operador/tarificador/exploraciones*`), lectores de respuesta,
// textos y reglas de los botones. Sin red y sin React: lo usan el componente cliente, las rutas y `node --test`.
// Nada de datos personales: los pasos llegan ya saneados (claves del catálogo, refs, etiquetas del portal).
import type { MapaExploracion } from '@central/module-tarificacion'
import { eur } from './dinero.ts'

export type EstadoMapa = 'borrador' | 'revisado' | 'descartado'

export type ResumenExploracion = {
  id: string
  trabajoId: string
  compania: string
  producto: string
  entrada: string
  /** Estado del TRABAJO: pendiente · en_curso · ok · requiere_humano · error_* · cancelado. */
  estadoTrabajo: string
  estadoMapa: EstadoMapa
  conDatosReales: boolean
  pasos: number
  llamadasIA: number
  costeEstimadoEur: number
  /** Coste REAL de `ai_usos` (lo añade plataforma). `null` = no se pudo leer ≠ 0. */
  costeRealEur: number | null
  modelo: string | null
  motivoFin: string | null
  tieneMapa: boolean
  revisadoPor: string | null
  revisadoEn: string | null
  creadoEn: string
  cerradaEn: string | null
}

export type AccionResumen = {
  accion: 'rellenar' | 'elegir' | 'marcar' | 'avanzar' | 'terminar' | 'parar'
  ref: string | null
  dato: string | null
  detalle: string | null
}

export type PasoResumen = {
  n: number
  huella: string
  pantalla: string | null
  tipo: string | null
  origen: 'ia' | 'mapa' | 'regla'
  costeEur: number
  acciones: AccionResumen[]
  rechazada: boolean
  motivo: string | null
}

export type DetalleExploracion = ResumenExploracion & { pasosLista: PasoResumen[]; mapa: MapaExploracion | null; mapaInvalido: boolean }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** Mensaje legible de una respuesta que no ha ido bien (o `null` si fue bien). */
export function mensajeError(status: number, json: unknown, que: string): string | null {
  if (status >= 200 && status < 300) return null
  const o = obj(json)
  if (o?.estado === 'explorador_sin_esquema') return typeof o.mensaje === 'string' ? o.mensaje : 'Falta aplicar el SQL del explorador.'
  if (status === 503 && o?.estado === 'sin_configurar') return 'Falta configurar el puerto de asegura (ASEGURA_OPERADOR_SECRET) en plataforma.'
  if (status === 502) return 'No se ha podido hablar con asegura (red). Prueba en un rato.'
  if (status === 401 || status === 403) return 'Sin permiso.'
  if (status === 409) {
    if (o?.estado === 'sin_mapa') return `${que}: la exploración no tiene mapa todavía.`
    if (o?.estado === 'sin_cerrar') return `${que}: la exploración sigue abierta; espera a que termine.`
    if (o?.estado === 'mapa_invalido') return `${que}: el mapa guardado no pasa la validación.`
  }
  if (status === 404) return `${que}: esa exploración ya no existe.`
  const detalle = typeof o?.mensaje === 'string' ? o.mensaje : typeof o?.causa === 'string' ? o.causa : null
  return `${que}: no ha ido bien${detalle ? ` (${detalle})` : ` (HTTP ${status})`}.`
}

export function leerLista(status: number, json: unknown): { ok: true; lista: ResumenExploracion[] } | { ok: false; mensaje: string } {
  const e = mensajeError(status, json, 'Leer las exploraciones')
  if (e) return { ok: false, mensaje: e }
  const l = obj(json)?.exploraciones
  if (!Array.isArray(l) || !l.every((x) => obj(x) && typeof obj(x)!.id === 'string')) return { ok: false, mensaje: 'La respuesta de asegura no tiene la forma esperada.' }
  return { ok: true, lista: l as ResumenExploracion[] }
}

export function leerDetalle(status: number, json: unknown): { ok: true; detalle: DetalleExploracion } | { ok: false; mensaje: string } {
  const e = mensajeError(status, json, 'Leer la exploración')
  if (e) return { ok: false, mensaje: e }
  const d = obj(obj(json)?.exploracion)
  if (!d || typeof d.id !== 'string' || !Array.isArray(d.pasosLista) || (d.mapa !== null && !obj(d.mapa))) return { ok: false, mensaje: 'La respuesta de asegura no tiene la forma esperada.' }
  return { ok: true, detalle: d as unknown as DetalleExploracion }
}

export type Tono = 'neutral' | 'positivo' | 'negativo' | 'aviso' | 'info'

/** Etiqueta de estado: el mapa aprobado/descartado manda; si no, en qué está el trabajo. Lo desconocido, neutral. */
export function estadoExploracion(r: Pick<ResumenExploracion, 'estadoTrabajo' | 'estadoMapa' | 'tieneMapa'>): { texto: string; tono: Tono } {
  if (r.estadoMapa === 'revisado') return { texto: 'Mapa aprobado', tono: 'positivo' }
  if (r.estadoMapa === 'descartado') return { texto: 'Descartada', tono: 'neutral' }
  switch (r.estadoTrabajo) {
    case 'pendiente': return { texto: 'En cola', tono: 'info' }
    case 'en_curso': return { texto: 'Explorando', tono: 'info' }
    case 'requiere_humano': return { texto: 'Pide una persona', tono: 'aviso' }
    case 'error_reintentable': return { texto: 'Error (reintenta)', tono: 'aviso' }
    case 'error_definitivo': return { texto: 'Error', tono: 'negativo' }
    case 'cancelado': return { texto: 'Cancelada', tono: 'neutral' }
    case 'ok': return r.tieneMapa ? { texto: 'Mapa por revisar', tono: 'aviso' } : { texto: 'Terminada sin mapa', tono: 'neutral' }
    default: return { texto: r.estadoTrabajo, tono: 'neutral' }
  }
}

const MOTIVOS_FIN: Record<string, string> = {
  resultado: 'Llegó al precio',
  otp: 'Pide verificación (OTP/SMS)',
  captcha: 'Pide CAPTCHA',
  cerca_de_emision: 'Pantalla cerca de emisión',
  dato_sensible_requerido: 'Pide un dato personal',
  aceptar_requerido: 'Necesita «Aceptar» no autorizado',
  bucle: 'Se quedó en bucle',
  tope: 'Tope de llamadas, acciones, tiempo o coste',
  sin_salida: 'Sin salida en la pantalla',
  ambiguo: 'La IA no tuvo claro qué hacer',
  error_portal: 'Error del portal',
  guard_emision: 'Frenada por el guard de emisión',
}

/** Motivo de parada en castellano. Sin motivo → «—»; uno que no conocemos se enseña tal cual. */
export const motivoFinTexto = (m: string | null): string => (m === null ? '—' : (MOTIVOS_FIN[m] ?? m))

/** Coste a mostrar: el real de `ai_usos` si se pudo leer; si no, el estimado con «≈»; sin cifra legible, «—». */
export function costeExploracion(r: Pick<ResumenExploracion, 'costeRealEur' | 'costeEstimadoEur'>): { texto: string; real: boolean } {
  if (r.costeRealEur !== null && Number.isFinite(r.costeRealEur)) return { texto: eur(r.costeRealEur), real: true }
  if (Number.isFinite(r.costeEstimadoEur)) return { texto: `≈${eur(r.costeEstimadoEur)}`, real: false }
  return { texto: '—', real: false }
}

/** La clave con la que la pasarela graba el gasto de esta exploración en `ai_usos.cliente_ref`. */
export const refCosteExplorador = (trabajoId: string): string => `explorador:${trabajoId}`

const VERBOS: Record<AccionResumen['accion'], string> = {
  rellenar: 'Rellenar', elegir: 'Elegir opción en', marcar: 'Marcar', avanzar: 'Avanzar', terminar: 'Terminar', parar: 'Parar',
}

/** Una acción en una línea. Solo refs y claves del catálogo: nunca el valor. */
export function textoAccion(a: AccionResumen): string {
  if (a.accion === 'terminar') return 'Terminar: precio a la vista'
  const cabeza = a.ref ? `${VERBOS[a.accion]} ${a.ref}` : VERBOS[a.accion]
  if (a.accion === 'rellenar') return a.dato ? `${cabeza} ← ${a.dato}` : cabeza
  return a.detalle ? `${cabeza} (${a.detalle})` : cabeza
}

export const ORIGEN_TEXTO: Record<PasoResumen['origen'], string> = { ia: 'IA', mapa: 'Mapa', regla: 'Regla' }

/** «Aprobar mapa» solo marca el estado (no genera código). Hace falta un mapa válido, la exploración cerrada y sin decidir. */
export function puedeAprobarMapa(d: Pick<DetalleExploracion, 'mapa' | 'mapaInvalido' | 'estadoMapa' | 'cerradaEn'>): { ok: boolean; motivo: string | null } {
  if (d.estadoMapa === 'revisado') return { ok: false, motivo: 'El mapa ya está aprobado.' }
  if (d.estadoMapa === 'descartado') return { ok: false, motivo: 'La exploración está descartada: vuelve a borrador para aprobarla.' }
  if (d.mapaInvalido) return { ok: false, motivo: 'El mapa guardado no pasa la validación.' }
  if (!d.mapa) return { ok: false, motivo: 'Aún no hay mapa.' }
  if (!d.cerradaEn) return { ok: false, motivo: 'La exploración sigue abierta.' }
  return { ok: true, motivo: null }
}

/** Texto del `window.confirm` de aprobar: deja claro que no se genera código ni se enciende nada. */
export const textoConfirmarAprobar = (r: Pick<ResumenExploracion, 'compania' | 'producto'>): string =>
  `¿Aprobar el mapa de ${r.compania} · ${r.producto}?\n\nSolo lo marca como revisado. No genera código ni activa nada: la conversión a adaptador es un PR aparte.`

// ─── Nueva exploración ───────────────────────────────────────────────────────

/** Lista CERRADA (= `ENTRADAS_EXPLORACION` de @central/module-tarificacion; lo vigila el test). */
export const OPCIONES_NUEVA = [
  { entrada: 'allianz:particulares:hogar', compania: 'Allianz', producto: 'Hogar' },
  { entrada: 'allianz:particulares:comunidades', compania: 'Allianz', producto: 'Comunidades (oráculo)' },
  { entrada: 'mapfre:nueva_produccion:auto', compania: 'Mapfre', producto: 'Auto' },
] as const
export const ENTRADA_POR_DEFECTO = 'allianz:particulares:hogar'

/**
 * ¿Existe en asegura el endpoint que encola una exploración? SÍ desde la fase B (13/10/2026):
 * `POST /api/operador/tarificador/exploracion`, que plataforma alcanza por `POST /api/correduria/tarificador/exploraciones`.
 * Lo que decide si de verdad arranca es asegura (`TARIFICADOR_RPA_ACTIVO` + `TARIFICADOR_EXPLORADOR_ACTIVO` + integración):
 * si está apagado responde 503 `apagado` y la pantalla dice «Explorador apagado».
 */
export const ENCOLAR_DISPONIBLE = true

/** ¿La entrada es de la lista cerrada? (la ruta de plataforma no reenvía otra cosa). */
export const esEntradaNueva = (v: unknown): v is (typeof OPCIONES_NUEVA)[number]['entrada'] =>
  typeof v === 'string' && OPCIONES_NUEVA.some((o) => o.entrada === v)

export type ResultadoEncolar =
  | { ok: true; trabajoId: string; lanzado: boolean; texto: string }
  | { ok: false; apagado: boolean; mensaje: string }

/**
 * Lee la respuesta de encolar. 503 `apagado` (RPA o explorador) → «Explorador apagado» con el interruptor que dice asegura.
 * 202 → encolada (y si la máquina arrancó ya o queda en cola). Lo demás, con `mensajeError` (+ el `motivo` de un 409).
 */
export function leerEncolar(status: number, json: unknown): ResultadoEncolar {
  const o = obj(json)
  if (status === 503 && o?.estado === 'apagado') {
    const detalle = typeof o.mensaje === 'string' ? ` (${o.mensaje})` : ''
    return { ok: false, apagado: true, mensaje: `Explorador apagado${detalle}. No se ha encolado nada.` }
  }
  if (status >= 200 && status < 300) {
    if (o?.estado !== 'encolado' || typeof o.trabajoId !== 'string') return { ok: false, apagado: false, mensaje: 'La respuesta de asegura no tiene la forma esperada.' }
    const lanzado = o.lanzado === true
    return { ok: true, trabajoId: o.trabajoId, lanzado, texto: lanzado ? 'Exploración encolada y en marcha.' : 'Exploración encolada: arrancará cuando haya hueco.' }
  }
  if (status === 409 && typeof o?.motivo === 'string') return { ok: false, apagado: false, mensaje: `Nueva exploración: rechazada (${o.motivo}).` }
  return { ok: false, apagado: false, mensaje: mensajeError(status, json, 'Nueva exploración') ?? 'Nueva exploración: no ha ido bien.' }
}
