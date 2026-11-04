// RENOVACIÓN CON ALTERNATIVAS en la app del cliente (Alberto, 04/11/2026): las reglas PURAS (sin BD, red ni envs).
// Test: `renovacion-alternativas-reglas.test.ts`. La parte con BD, Catastro y Telegram vive en `renovacion-alternativas.ts`.
//
// El flujo, en corto:
//   1. Alberto pulsa «Preparar renovación con alternativas» en una póliza NUESTRA en vigor (o se lo pide al asistente).
//      Se abre/reutiliza la oportunidad de la póliza (`abrirRiesgoDePoliza`), en hogar se completa la vivienda con el
//      Catastro (gratis; solo lo vacío, nunca un dato confirmado), la renovación actual entra como oferta `actual` con la
//      prima de `primaConRecibos()` (nunca la de la póliza sola) y los precios de los bots y de Avant2 como ofertas.
//   2. Se monta un presupuesto de ofertas en BORRADOR con `modo = 'renovacion'` y le llega a Alberto por Telegram: resumen,
//      enlace a «Ver como el cliente» y ✅ Publicar en la app / ✏️ Modificar. Nada sale sin ese ✅.
//   3. ✅ = Alberto da por revisadas ESAS ofertas y lo publica: `enviado_at` + `canal_aviso = 'app'`. La campana del portal
//      lo deriva de ahí y `avisos-intranet` manda el correo de aviso de acceso (sin título ni datos).
//   4. En la app el cliente elige «Quiero esta opción» o «Me quedo con mi renovación». ELEGIR NO EMITE NI FIRMA: avisa a
//      Alberto (Telegram + historial) y deja el presupuesto «elegido». TARIFICAR ≠ EMITIR: la emisión la confirma él.
//
// 🚨 Quién lo ve en la app: SOLO quien está vinculado a la ficha del TOMADOR (`portal_vinculo`, sin la vista del corredor).
//    Quien ve la póliza por una autorización o por figurar en ella NO ve el presupuesto: el Telegram lo dice antes de
//    publicar, y sin nadie del tomador en la app no se publica (`canal_no_disponible`, 503 ≠ «el envío falló», 502).

import type { Boton } from '@central/core-telegram'
import { eur } from './dinero.ts'

export const MODO_RENOVACION = 'renovacion'
export const ACTOR_RENOVACION = 'sistema:renovacion-alternativas'
/** `info_riesgo.renovacionCatastro`: qué rellenó el Catastro en la preparación (nombres de campo, nunca valores). */
export const CLAVE_CATASTRO_RENOVACION = 'renovacionCatastro'
/** Eventos del presupuesto (append-only). */
export const EVENTO_REVISION_TG = 'renovacion_revision_telegram'
export const EVENTO_PUBLICADO = 'renovacion_publicada'
export const EVENTO_ELECCION = 'renovacion_eleccion_cliente'
/** Cambios de opinión del cliente en 24 h: más que esto es un bucle, no una decisión. */
export const MAX_ELECCIONES_DIA = 5
/** Cuántas cotizaciones de Avant2 (las más baratas por compañía y nivel) entran como alternativas. */
export const MAX_AVANT2_RENOVACION = 6

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── 1. ¿Se puede preparar? ───────────────────────────────────────────────────

export type PolizaParaRenovar = {
  /** `esCarteraEnVigor()` ya calculado por quien lee (cartera CIMA viva, estado vigente, no sustituida). */
  enVigor: boolean
  fusionada: boolean
  ramo: string | null
}

export type DecisionPreparar = { ok: true } | { ok: false; status: 404 | 409 | 422; motivo: string }

export function decidirPreparacion(p: PolizaParaRenovar | null): DecisionPreparar {
  if (p === null) return { ok: false, status: 404, motivo: 'Esa póliza no es de esta correduría.' }
  if (p.fusionada) return { ok: false, status: 409, motivo: 'La póliza está fusionada en otra: prepara la renovación desde la buena.' }
  if (!p.enVigor) return { ok: false, status: 409, motivo: 'La póliza no está en vigor en CIMA: no hay renovación que comparar.' }
  if (!p.ramo) return { ok: false, status: 422, motivo: 'La póliza no tiene ramo: no se sabe con qué compararla.' }
  return { ok: true }
}

// ─── 2. La renovación actual como oferta `actual` ─────────────────────────────

export type RenovacionActual = {
  polizaId: string
  compania: string | null
  /** `primaConRecibos().prima`. `null` = NO CONSTA (nunca 0). */
  prima: number | null
  /** La prima sale del recibo de la renovación (no de la póliza). */
  deRecibo: boolean
  /** `vencimientoConRecibos()`, `YYYY-MM-DD`. `null` = no consta. */
  vence: string | null
}

/** Clave idempotente de la oferta `actual`: misma póliza, prima y vencimiento = la misma fila. */
export function claveRenovacionActual(a: RenovacionActual): string {
  return `cartera:${a.polizaId}:${a.prima === null ? 'sin-prima' : a.prima.toFixed(2)}:${a.vence ?? 'sin-vencimiento'}`
}

/** La fila `oportunidad_oferta` (rol `actual`) de la renovación. Sin compañía no hay fila (el CHECK de revisada la exige). */
export function filaOfertaActual(a: RenovacionActual): { compania: string; producto: string; primaTotal: number | null; datosExtra: Record<string, unknown> } | null {
  const compania = a.compania?.trim()
  if (!compania) return null
  return {
    compania,
    producto: 'Tu renovación actual',
    primaTotal: a.prima,
    datosExtra: {
      renovacionClave: claveRenovacionActual(a),
      fuente: 'cartera_cima',
      polizaId: a.polizaId,
      primaDeRecibo: a.deRecibo,
      vence: a.vence,
    },
  }
}

// ─── 3. Precios de Avant2 como ofertas ────────────────────────────────────────

export type PrecioAvant2Renovacion = {
  id: string
  compania: string | null
  producto: string | null
  modalidad: string | null
  /** La prima solo vale como ANUAL (meses = 12); otra cosa no se compara con la renovación. */
  primaAnual: number | null
  franquiciaEur: number | null
}

export function claveAvant2(tarificacionId: string, precioId: string): string {
  return `avant2:${tarificacionId}:${precioId}`
}

/** La fila `oportunidad_oferta` de un precio de Avant2; `null` = no es una alternativa comparable (sin compañía o sin prima anual). */
export function filaOfertaAvant2(tarificacionId: string, p: PrecioAvant2Renovacion, garantias: Record<string, unknown> | null): {
  compania: string; producto: string; primaTotal: number; garantias: Record<string, unknown> | null; datosExtra: Record<string, unknown>
} | null {
  const compania = p.compania?.trim()
  if (!compania || p.primaAnual === null || !Number.isFinite(p.primaAnual) || p.primaAnual <= 0) return null
  const producto = [p.producto?.trim(), p.modalidad?.trim()].filter((x): x is string => !!x).join(' · ') || 'Sin producto'
  return {
    compania,
    producto,
    primaTotal: Math.round(p.primaAnual * 100) / 100,
    garantias: garantias && Object.keys(garantias).length > 0 ? garantias : null,
    datosExtra: {
      avant2Clave: claveAvant2(tarificacionId, p.id),
      fuente: 'avant2',
      // `null` = Avant2 no declara franquicia (nunca «sin franquicia»).
      franquiciaGeneral: typeof p.franquiciaEur === 'number' && Number.isFinite(p.franquiciaEur) && p.franquiciaEur >= 0 ? p.franquiciaEur : null,
      ...(p.modalidad?.trim() ? { modalidad: p.modalidad.trim() } : {}),
    },
  }
}

// ─── 4. Comparación con la renovación ─────────────────────────────────────────

export type OpcionComparable = { id: string; compania: string; producto: string; primaEur: number; franquiciaEur: number | null; nivel: string | null }
export type OpcionComparada = OpcionComparable & {
  /** prima − renovación. `null` = la renovación no consta: no se calcula ahorro (nunca «0»). */
  diferenciaEur: number | null
  sentido: 'mas_barata' | 'mas_cara' | 'igual' | null
}

export function compararConRenovacion(primaRenovacion: number | null, opciones: readonly OpcionComparable[]): OpcionComparada[] {
  const base = primaRenovacion !== null && Number.isFinite(primaRenovacion) && primaRenovacion > 0 ? primaRenovacion : null
  return [...opciones]
    .sort((a, b) => a.primaEur - b.primaEur || a.compania.localeCompare(b.compania, 'es'))
    .map((o) => {
      if (base === null) return { ...o, diferenciaEur: null, sentido: null }
      const d = Math.round((o.primaEur - base) * 100) / 100
      return { ...o, diferenciaEur: d, sentido: d < 0 ? 'mas_barata' : d > 0 ? 'mas_cara' : 'igual' }
    })
}

/** «48,20€ menos que tu renovación» / «12,00€ más» / «el mismo precio». `null` = no se puede decir. */
export function textoDiferencia(o: Pick<OpcionComparada, 'diferenciaEur' | 'sentido'>): string | null {
  if (o.diferenciaEur === null || o.sentido === null) return null
  if (o.sentido === 'igual') return 'el mismo precio que tu renovación'
  return `${eur(Math.abs(o.diferenciaEur))} ${o.sentido === 'mas_barata' ? 'menos' : 'más'} que tu renovación`
}

// ─── 5. Catastro: completar la vivienda sin pisar nada ────────────────────────

/** Lo que se usa del Catastro (de `catastroPorReferencia`). `null` en un campo = el Catastro no lo trae. */
export type CatastroParaVivienda = {
  referencia: string
  metrosCuadrados: number | null
  anioConstruccion: number | null
  codigoPostal: string | null
  uso: string | null
}

/** Campos de `datosVivienda` que el Catastro puede RELLENAR si están vacíos (lo demás solo se anota como consulta). */
export const CAMPOS_RELLENA_CATASTRO = ['referenciaCatastral', 'cp', 'metrosCuadrados', 'anioConstruccion'] as const
export type CampoRellenaCatastro = (typeof CAMPOS_RELLENA_CATASTRO)[number]

export type ResultadoViviendaCatastro =
  | { estado: 'confirmada' }
  | { estado: 'otra_referencia' }
  | {
      estado: 'completada'
      /** SOLO las claves a escribir (merge sobre `datosVivienda`); `confirmadoAt` nunca está. */
      cambios: Record<string, string | number>
      /** Campos que el Catastro ha RELLENADO (estaban vacíos). Nombres, nunca valores. */
      anadidos: CampoRellenaCatastro[]
      /** Campos ya escritos donde el Catastro dice otra cosa: no se tocan, se avisa. */
      distintos: CampoRellenaCatastro[]
    }

const vacio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
const normRef = (v: unknown) => (typeof v === 'string' ? v.replace(/[\s-]/g, '').toUpperCase() : '')

/**
 * Lo que la preparación escribe en `datosVivienda` con la respuesta del Catastro (mismo criterio que la solicitud de hogar,
 * `CLAVES_BLOQUE_CATASTRO`): un bloque CONFIRMADO por Alberto no se toca; con OTRA referencia guardada tampoco (se avisa);
 * si no, se rellena lo vacío y se anota la consulta (`catastro*`). Lo que el Catastro no trae no se escribe (nunca 0).
 */
export function completarViviendaConCatastro(vivienda: Record<string, unknown> | null, c: CatastroParaVivienda, ahoraIso: string): ResultadoViviendaCatastro {
  const v = vivienda ?? {}
  if (!vacio(v.confirmadoAt)) return { estado: 'confirmada' }
  const ref = normRef(c.referencia)
  if (!vacio(v.referenciaCatastral) && normRef(v.referenciaCatastral) !== ref) return { estado: 'otra_referencia' }
  const delCatastro: Record<CampoRellenaCatastro, string | number | null> = {
    referenciaCatastral: /^[0-9A-Z]{20}$/.test(ref) ? ref : null,
    cp: typeof c.codigoPostal === 'string' && /^\d{5}$/.test(c.codigoPostal.trim()) ? c.codigoPostal.trim() : null,
    metrosCuadrados: typeof c.metrosCuadrados === 'number' && Number.isFinite(c.metrosCuadrados) && c.metrosCuadrados > 0 ? c.metrosCuadrados : null,
    anioConstruccion: typeof c.anioConstruccion === 'number' && Number.isInteger(c.anioConstruccion) && c.anioConstruccion >= 1500 ? c.anioConstruccion : null,
  }
  const cambios: Record<string, string | number> = {}
  const anadidos: CampoRellenaCatastro[] = []
  const distintos: CampoRellenaCatastro[] = []
  for (const campo of CAMPOS_RELLENA_CATASTRO) {
    const cat = delCatastro[campo]
    if (cat === null) continue
    if (vacio(v[campo])) { cambios[campo] = cat; anadidos.push(campo) }
    else if (String(v[campo]).replace(/[\s-]/g, '').toUpperCase() !== String(cat).toUpperCase()) distintos.push(campo)
  }
  // La consulta en sí (no son datos del seguro: sirven para avisar de discrepancias). Solo lo que trae.
  if (delCatastro.referenciaCatastral !== null) cambios.catastroReferencia = delCatastro.referenciaCatastral
  cambios.catastroConsultadoAt = ahoraIso
  if (typeof c.uso === 'string' && c.uso.trim() !== '') cambios.usoCatastral = c.uso.trim().slice(0, 60)
  if (delCatastro.metrosCuadrados !== null) cambios.catastroMetrosCuadrados = delCatastro.metrosCuadrados
  if (delCatastro.anioConstruccion !== null) cambios.catastroAnioConstruccion = delCatastro.anioConstruccion
  return { estado: 'completada', cambios, anadidos, distintos }
}

export const ETIQUETA_CAMPO_CATASTRO: Readonly<Record<CampoRellenaCatastro, string>> = {
  referenciaCatastral: 'referencia catastral', cp: 'código postal', metrosCuadrados: 'superficie', anioConstruccion: 'año de construcción',
}

/** Cómo fue el Catastro, para el Telegram y la pantalla. Nunca valores ni dirección. */
export type EstadoCatastroRenovacion =
  | { estado: 'no_aplica' } // no es hogar
  | { estado: 'completada'; anadidos: CampoRellenaCatastro[]; distintos: CampoRellenaCatastro[] }
  | { estado: 'confirmada' } | { estado: 'otra_referencia' }
  | { estado: 'sin_datos_para_buscar' } | { estado: 'varios' } | { estado: 'ninguno' } | { estado: 'no_encontrado' } | { estado: 'error' }

export function lineaCatastro(c: EstadoCatastroRenovacion): string | null {
  switch (c.estado) {
    case 'no_aplica': return null
    case 'completada': {
      const a = c.anadidos.map((k) => ETIQUETA_CAMPO_CATASTRO[k])
      const d = c.distintos.map((k) => ETIQUETA_CAMPO_CATASTRO[k])
      return [
        a.length ? `🏠 Del Catastro (sin confirmar): ${a.join(', ')}.` : '🏠 Catastro consultado: no faltaba nada que rellenar.',
        ...(d.length ? [`⚠️ El Catastro dice otra cosa en: ${d.join(', ')} (no se ha tocado; revísalo).`] : []),
      ].join('\n')
    }
    case 'confirmada': return '🏠 La vivienda ya está confirmada: el Catastro no la toca.'
    case 'otra_referencia': return '⚠️ La vivienda tiene OTRA referencia catastral guardada: el Catastro no la toca (revísalo).'
    case 'sin_datos_para_buscar': return '🏠 Catastro sin consultar: falta la referencia o la calle con número, municipio y provincia.'
    case 'varios': return '🏠 Catastro: varios inmuebles en esa dirección y no se sabe cuál (elígelo en el riesgo).'
    case 'ninguno': case 'no_encontrado': return '🏠 Catastro: no encuentra esa vivienda (no significa que no exista).'
    case 'error': return '🏠 Catastro: no ha respondido. Esto NO significa que no haya datos.'
  }
}

// ─── 6. Quién lo verá en la app ───────────────────────────────────────────────

export type QuienVeEnApp = {
  /** Identidades del portal vinculadas a la FICHA DEL TOMADOR (sin vistas de corredor). Son las únicas que lo ven. */
  vinculadasTomador: number
  /** Nombres de pila de quien ve ESTA póliza en su app por otra vía (autorización vigente o figurar en ella) y NO verá el presupuesto. `null` = desconocido. */
  otrosVenPoliza: { nombre: string | null; via: 'autorizacion' | 'interviniente' }[]
}

export type DecisionDestinatarios =
  | { publicable: true; lineas: string[] }
  | { publicable: false; motivo: 'sin_app' | 'no_consta'; lineas: string[] }

/** `null` = no se pudo mirar: NO se publica (no se afirma que lo verá alguien). */
export function decidirDestinatarios(q: QuienVeEnApp | null): DecisionDestinatarios {
  if (q === null) return { publicable: false, motivo: 'no_consta', lineas: ['⚠️ No he podido comprobar quién lo verá en la app: no se publica hasta poder mirarlo.'] }
  const otros = q.otrosVenPoliza.map((o) => `${o.nombre ?? 'alguien'} (${o.via === 'autorizacion' ? 'autorizado por la tomadora/el tomador' : 'figura en la póliza'})`)
  const lineaOtros = otros.length
    ? [`⚠️ Ven esta póliza en su app pero NO verán este presupuesto (solo lo ve quien entra con la ficha del tomador): ${otros.join(', ')}.`]
    : []
  if (q.vinculadasTomador <= 0) {
    return { publicable: false, motivo: 'sin_app', lineas: ['⛔ El tomador NO usa la app: publicarlo no llegaría a nadie. Mándaselo por correo o WhatsApp desde la ficha.', ...lineaOtros] }
  }
  return { publicable: true, lineas: [`📱 Lo verá el tomador en su app (${q.vinculadasTomador === 1 ? 'una cuenta' : `${q.vinculadasTomador} cuentas`}).`, ...lineaOtros] }
}

// ─── 7. Telegram de revisión: resumen + ✅ / ✏️ ───────────────────────────────

/** Prefijo de `callback_data` (enrutado en el webhook de plataforma): `crv_pub:<presupuestoId>` (43 bytes). */
export const PREFIJO_RENOVACION_TG = 'crv'
export const CALLBACK_PUBLICAR = `${PREFIJO_RENOVACION_TG}_pub`

export type EntradaRevision = {
  cliente: string | null
  referencia: string | null
  ramo: string
  actual: RenovacionActual
  opciones: readonly OpcionComparada[]
  /** Líneas de «la más barata por nivel» (ya escritas). */
  niveles: readonly string[]
  catastro: EstadoCatastroRenovacion
  destinatarios: DecisionDestinatarios
  /** Ofertas que pasarían a «revisadas» al pulsar ✅ (las que aún no lo están). */
  sinRevisar: number
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function textoRevision(e: EntradaRevision): string {
  const quien = e.cliente ? esc(e.cliente) : 'el cliente'
  const lineas = [
    `🔁 <b>Renovación con alternativas</b> · ${esc(e.ramo)}${e.referencia ? ` · ${esc(e.referencia)}` : ''}`,
    `Para ${quien}. Borrador: NO ha salido nada.`,
    '',
    `<b>Tu renovación actual</b> (${esc(e.actual.compania ?? 'compañía sin leer')}): ${e.actual.prima === null ? '<i>prima no consta</i>' : eur(e.actual.prima)}${e.actual.prima !== null && e.actual.deRecibo ? ' (del recibo)' : ''}${e.actual.vence ? ` · vence ${e.actual.vence.split('-').reverse().join('/')}` : ''}`,
  ]
  if (e.opciones.length === 0) lineas.push('Sin alternativas con precio.')
  for (const o of e.opciones.slice(0, 8)) {
    const dif = textoDiferencia(o)
    lineas.push(`• ${esc(o.compania)} — ${esc(o.producto)}: <b>${eur(o.primaEur)}</b>${o.franquiciaEur === null ? '' : ` · franquicia ${eur(o.franquiciaEur)}`}${o.nivel ? ` · ${esc(o.nivel)}` : ''}${dif ? ` (${esc(dif)})` : ''}`)
  }
  if (e.opciones.length > 8) lineas.push(`… y ${e.opciones.length - 8} más en la vista previa.`)
  if (e.niveles.length) lineas.push('', '<b>La más barata por nivel</b>', ...e.niveles.map((n) => esc(n)))
  const cat = lineaCatastro(e.catastro)
  if (cat) lineas.push('', esc(cat))
  lineas.push('', ...e.destinatarios.lineas.map((l) => esc(l)))
  if (e.sinRevisar > 0) lineas.push(`✅ = das por revisadas estas ${e.sinRevisar === 1 ? 'oferta' : `${e.sinRevisar} ofertas`} (precio y coberturas) y lo publicas en su app.`)
  lineas.push('Elegir en la app NO emite nada: te avisaré de lo que elija.')
  return lineas.join('\n')
}

export function botonesRevision(presupuestoId: string, urls: { vista: string; modificar: string }, publicable: boolean): Boton[][] {
  return [
    ...(publicable ? [[{ texto: '✅ Enviar al cliente (app)', callback: `${CALLBACK_PUBLICAR}:${presupuestoId}` }]] : []),
    [{ texto: '👁 Ver como el cliente', url: urls.vista }, { texto: '✏️ Modificar', url: urls.modificar }],
  ]
}

export type DecisionBotonRenovacion = { ok: true; presupuestoId: string; quien: string } | { ok: false; toast: string }

/** ¿Vale esta pulsación? Solo el titular (from.id EXACTO); sin chat configurado, nadie. */
export function decidirBotonRenovacion(cb: { from?: { id?: unknown } | null } | null | undefined, accion: string, args: readonly string[], chatAutorizado: string | undefined): DecisionBotonRenovacion {
  const esperado = String(chatAutorizado ?? '').trim()
  const quien = String(cb?.from?.id ?? '').trim()
  if (!esperado || !quien || quien !== esperado) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  if (accion !== 'pub' || args.length !== 1 || !UUID.test(args[0] ?? '')) return { ok: false, toast: 'Botón no válido' }
  return { ok: true, presupuestoId: args[0].toLowerCase(), quien }
}

/** Línea que sustituye a los botones tras pulsar ✅. */
export function lineaTrasPublicar(estado: string): string {
  switch (estado) {
    case 'publicado': return '✅ <i>Publicado en su app: le llega el aviso en la campana (y el correo de aviso de acceso, sin detalles).</i>'
    case 'ya_publicado': return '<i>Ya estaba publicado: no se hace nada más.</i>'
    case 'no_vigente': return '⌛ <i>Este mensaje no es el último de este borrador (se rehízo): usa el más reciente.</i>'
    case 'canal_no_disponible': return '⛔ <i>El tomador no usa la app: no se ha publicado. Mándaselo por correo o WhatsApp desde la ficha.</i>'
    case 'sin_migracion': return '🔒 <i>Falta aplicar la migración 2026-11-05b: no se ha publicado nada.</i>'
    case 'caducado': return '⌛ <i>Los precios han caducado: prepara la renovación de nuevo.</i>'
    case 'retirado': return '<i>Ese borrador se retiró: no se publica.</i>'
    case 'sin_necesidades': return '📝 <i>Faltan sus exigencias y necesidades: escríbelas en el presupuesto (✏️) y vuelve a pulsar.</i>'
    case 'no_encontrado': return '⚠️ <i>No encuentro ese borrador de renovación.</i>'
    default: return `⚠️ <i>No se ha podido publicar (${esc(estado)}). Mira la póliza antes de repetir.</i>`
  }
}

// ─── 8. La elección del cliente (sin firma) ───────────────────────────────────

export type Eleccion = { tipo: 'opcion'; opcionId: string } | { tipo: 'renovacion' }

export function validarEleccion(b: unknown): Eleccion | null {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null
  const o = b as Record<string, unknown>
  if (o.eleccion === 'renovacion') return { tipo: 'renovacion' }
  if (o.eleccion === 'opcion' && typeof o.opcionId === 'string' && UUID.test(o.opcionId.trim())) return { tipo: 'opcion', opcionId: o.opcionId.trim().toLowerCase() }
  return null
}

export type EstadoParaElegir = {
  modo: string | null
  enviadoAt: Date | null
  venceEl: Date
  retiradoAt: Date | null
  aceptadoAt: Date | null
  emitidoAt: Date | null
  eleccionActual: Eleccion | null
  /** Elecciones del cliente en las últimas 24 h. */
  eleccionesDia: number
}

export type DecisionEleccion =
  | { ok: true; cambio: boolean }
  | { ok: false; estado: 'no_admite' | 'caducado' | 'limite' | 'no_encontrado' }

/**
 * ¿Puede el cliente elegir ahora? Solo una RENOVACIÓN publicada, vigente, sin retirar, sin firmar y sin emitir. Puede
 * cambiar de opinión (cada cambio avisa a Alberto) hasta `MAX_ELECCIONES_DIA` en 24 h. La misma elección otra vez no es
 * un cambio: no vuelve a avisar.
 */
export function decidirEleccion(p: EstadoParaElegir, e: Eleccion, opcionValida: boolean, hoy: Date): DecisionEleccion {
  if (p.modo !== MODO_RENOVACION || p.enviadoAt === null) return { ok: false, estado: 'no_encontrado' }
  if (p.retiradoAt !== null || p.aceptadoAt !== null || p.emitidoAt !== null) return { ok: false, estado: 'no_admite' }
  if (p.venceEl.getTime() < hoy.getTime()) return { ok: false, estado: 'caducado' }
  if (e.tipo === 'opcion' && !opcionValida) return { ok: false, estado: 'no_encontrado' }
  const misma = p.eleccionActual !== null && p.eleccionActual.tipo === e.tipo &&
    (e.tipo === 'renovacion' || (p.eleccionActual.tipo === 'opcion' && p.eleccionActual.opcionId === e.opcionId))
  if (misma) return { ok: true, cambio: false }
  if (p.eleccionesDia >= MAX_ELECCIONES_DIA) return { ok: false, estado: 'limite' }
  return { ok: true, cambio: true }
}

/** Telegram INTERNO a Alberto con lo que eligió (nombre de pila, nunca DNI/IBAN/dirección) y el enlace a la ficha. */
export function textoEleccion(e: { tomador: string | null; ramo: string; eleccion: Eleccion; opcion: { compania: string; producto: string; primaEur: number } | null; primaRenovacion: number | null; enlace: string; cambio: boolean }): string {
  const quien = e.tomador ? `<b>${esc(e.tomador)}</b>` : 'El cliente'
  const que = e.eleccion.tipo === 'renovacion'
    ? `se queda con su renovación${e.primaRenovacion === null ? '' : ` (${eur(e.primaRenovacion)})`}`
    : e.opcion ? `quiere <b>${esc(e.opcion.compania)} — ${esc(e.opcion.producto)}</b> por ${eur(e.opcion.primaEur)}` : 'ha elegido una alternativa'
  return [
    `🗳️ ${quien} ${que} (${esc(e.ramo)}).${e.cambio ? '' : ' Lo ha vuelto a confirmar.'}`,
    'Lo ha elegido en la app. NO se ha emitido ni firmado nada: confírmalo con la compañía y prepara la emisión tú.',
    `<a href="${esc(e.enlace)}">Abrir la ficha del cliente</a>`,
  ].join('\n')
}

/** Línea del historial interno de la ficha (sin importes de terceros ni datos personales). */
export function lineaHistorialEleccion(e: Eleccion, opcion: { compania: string; producto: string } | null, ramo: string): string {
  return e.tipo === 'renovacion'
    ? `El cliente elige en la app quedarse con su renovación de ${ramo} (no emite nada; pendiente de Alberto).`
    : `El cliente elige en la app la alternativa ${opcion ? `${opcion.compania} — ${opcion.producto}` : '(opción)'} para su ${ramo} (no emite nada; pendiente de Alberto).`
}
