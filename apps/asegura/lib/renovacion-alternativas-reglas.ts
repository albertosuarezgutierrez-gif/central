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
// 🚨 Quién lo ve en la app (05/11/2026, Alberto): quien está vinculado a la ficha del TOMADOR con nivel de operar
//    (`portal_vinculo`, sin la vista del corredor) Y quien el tomador AUTORIZA con Gestión o Total (`portal_autorizacion`
//    vigente, esa póliza o la ficha entera; regla única `identidadesQueEligenRenovacion` de `@central/module-seguros-portal`).
//    Quien solo CONSULTA (o figura en la póliza) no lo ve: el Telegram lo dice antes de publicar, y sin nadie que pueda
//    elegir en la app no se publica allí (`canal_no_disponible`, 503 ≠ «el envío falló», 502): se ofrece correo o WhatsApp
//    (el cliente elige desde el ENLACE, el mismo acceso por token/código de siempre). Lo preferido es la app.
// 🚨 Vale la PRIMERA elección (`duenoDeEleccion`): la otra persona ve «ya elegida por <nombre de pila>».

import type { Boton } from '@central/core-telegram'
import { EVENTO_ELECCION_RENOVACION, mismaPersonaQueElige, type DuenoEleccion, type ElectorRenovacion } from '@central/module-seguros-portal'
import { eur } from './dinero.ts'
import { puedeOperar } from './ficha-de-poliza.ts'

export const MODO_RENOVACION = 'renovacion'
export const ACTOR_RENOVACION = 'sistema:renovacion-alternativas'
/** `info_riesgo.renovacionCatastro`: qué rellenó el Catastro en la preparación (nombres de campo, nunca valores). */
export const CLAVE_CATASTRO_RENOVACION = 'renovacionCatastro'
/** Eventos del presupuesto (append-only). */
export const EVENTO_REVISION_TG = 'renovacion_revision_telegram'
export const EVENTO_PUBLICADO = 'renovacion_publicada'
export const EVENTO_ELECCION = EVENTO_ELECCION_RENOVACION
/** Alberto pulsó ✅ para mandarlo por correo o WhatsApp (el envío en sí deja sus eventos de siempre: `enviado`/`enlace_generado`). */
export const EVENTO_ENVIO_CANAL = 'renovacion_envio_canal'
/** El Telegram a Alberto con la elección del cliente NO salió (queda también en el historial de la ficha, con su motivo). */
export const EVENTO_AVISO_FALLIDO = 'renovacion_eleccion_aviso_fallido'
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

/**
 * La fusión que se ESCRIBE (revisión 04/11/2026): en los datos del seguro GANA el dato existente (`cambios || existente`):
 * lo que alguien escribió entre la lectura y la escritura no se pisa; un hueco vacío sí se rellena. Las marcas de la
 * consulta (`catastro*`, `usoCatastral`) son las de ESTA consulta. El UPDATE además va condicionado a lo leído (CAS).
 */
export function fusionarViviendaCatastro(existente: Record<string, unknown> | null, cambios: Record<string, unknown>): Record<string, unknown> {
  const e = existente ?? {}
  const datos = new Set<string>(CAMPOS_RELLENA_CATASTRO)
  const out: Record<string, unknown> = { ...e }
  for (const [k, v] of Object.entries(cambios)) {
    if (!datos.has(k) || vacio(e[k])) out[k] = v
  }
  return out
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
  /** Identidades del portal vinculadas a la FICHA DEL TOMADOR con nivel de operar (sin vistas de corredor). */
  vinculadasTomador: number
  /**
   * Identidades AUTORIZADAS por el tomador con Gestión o Total sobre esta póliza (05/11/2026): lo ven y pueden elegir.
   * Nombre de pila (`null` = no consta). Ausente = no se miró (lectura antigua): cuenta como ninguna.
   */
  autorizadosEligen?: { nombre: string | null }[]
  /** Nombres de pila de quien ve ESTA póliza en su app por otra vía (solo consulta o figurar en ella) y NO verá el presupuesto. `null` = desconocido. */
  otrosVenPoliza: { nombre: string | null; via: 'autorizacion' | 'interviniente' }[]
}

/** Identidades (sin repetir) cuyo vínculo con la ficha del tomador deja OPERAR: quien solo ve (`tarjeta`, `completo`) no puede elegir. */
export function contarVinculadasQueOperan(vinculos: readonly { identidadId: string; nivel: string }[]): number {
  return new Set(vinculos.filter((v) => typeof v.identidadId === 'string' && v.identidadId.trim() !== '' && puedeOperar(v.nivel)).map((v) => v.identidadId.trim())).size
}

export type DecisionDestinatarios =
  | { publicable: true; lineas: string[] }
  | { publicable: false; motivo: 'sin_app' | 'no_consta'; lineas: string[] }

/** Recordatorio fijo (Alberto, 05/11/2026): el canal preferido es la app. */
export const LINEA_PREFERIDA_APP = '💡 Lo preferido es la app: allí ve las alternativas, elige y le llegan los avisos.'

/**
 * `null` = no se pudo mirar: NO se publica en la app (no se afirma que lo verá alguien) y tampoco se ofrecen correo/WhatsApp
 * a ciegas: primero hay que poder mirarlo. Sin nadie que pueda elegir en la app (`sin_app`), se ofrece correo o WhatsApp.
 */
export function decidirDestinatarios(q: QuienVeEnApp | null): DecisionDestinatarios {
  if (q === null) return { publicable: false, motivo: 'no_consta', lineas: ['⚠️ No he podido comprobar quién lo verá en la app: no se publica hasta poder mirarlo.'] }
  const otros = q.otrosVenPoliza.map((o) => `${o.nombre ?? 'alguien'} (${o.via === 'autorizacion' ? 'autorizado solo para consultar' : 'figura en la póliza'})`)
  const lineaOtros = otros.length
    ? [`⚠️ Ven esta póliza en su app pero NO verán este presupuesto (solo el tomador y quien él autoriza con Gestión o Total): ${otros.join(', ')}.`]
    : []
  const autorizados = q.autorizadosEligen ?? []
  const nombresAut = autorizados.map((a) => a.nombre ?? 'alguien').join(', ')
  if (q.vinculadasTomador <= 0 && autorizados.length === 0) {
    return {
      publicable: false, motivo: 'sin_app',
      lineas: ['⛔ Nadie que pueda elegir usa la app (ni el tomador ni un autorizado con Gestión o Total). Puedes mandárselo por correo o WhatsApp: elige desde el enlace, sin firma.', LINEA_PREFERIDA_APP, ...lineaOtros],
    }
  }
  const lineaTomador = q.vinculadasTomador > 0
    ? `📱 Lo verá el tomador en su app (${q.vinculadasTomador === 1 ? 'una cuenta' : `${q.vinculadasTomador} cuentas`}).`
    : '📱 El tomador no usa la app.'
  const lineaAut = autorizados.length > 0 ? [`👥 También lo verá y podrá elegir: ${nombresAut} (autorizado por el tomador). Vale la primera elección.`] : []
  return { publicable: true, lineas: [lineaTomador, ...lineaAut, ...lineaOtros] }
}

// ─── 7. Telegram de revisión: resumen + ✅ / ✏️ ───────────────────────────────

/** Prefijo de `callback_data` (enrutado en el webhook de plataforma): `crv_pub:<presupuestoId>` (43 bytes). */
export const PREFIJO_RENOVACION_TG = 'crv'
export const CALLBACK_PUBLICAR = `${PREFIJO_RENOVACION_TG}_pub`
/** ✅ por CORREO (`crv_cor:<id>`, 44 bytes) y ✅ por WHATSAPP (`crv_wa:<id>`, 43 bytes): solo si nadie puede elegir en la app. */
export const CALLBACK_CORREO = `${PREFIJO_RENOVACION_TG}_cor`
export const CALLBACK_WHATSAPP = `${PREFIJO_RENOVACION_TG}_wa`

/** Por dónde sale la renovación tras el ✅: la app (preferida) o el enlace de siempre por correo o WhatsApp. */
export type CanalRenovacion = 'app' | 'email' | 'whatsapp_enlace'
const CANAL_DE_ACCION: Readonly<Record<string, CanalRenovacion>> = { pub: 'app', cor: 'email', wa: 'whatsapp_enlace' }

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

/**
 * Los botones del Telegram de revisión. Con alguien que pueda elegir en la app: SOLO la app (lo preferido). Sin nadie
 * (`sin_app`): correo y WhatsApp (el cliente elige desde el enlace). Si no se pudo mirar (`no_consta`): ningún ✅.
 */
export function botonesRevision(presupuestoId: string, urls: { vista: string; modificar: string }, destino: boolean | Pick<DecisionDestinatarios, 'publicable'> & { motivo?: string }): Boton[][] {
  const d = typeof destino === 'boolean' ? { publicable: destino, motivo: destino ? undefined : 'no_consta' } : destino
  const enviar: Boton[][] = d.publicable
    ? [[{ texto: '✅ Enviar al cliente (app)', callback: `${CALLBACK_PUBLICAR}:${presupuestoId}` }]]
    : d.motivo === 'sin_app'
      ? [[{ texto: '✅ Enviar por correo', callback: `${CALLBACK_CORREO}:${presupuestoId}` }, { texto: '✅ Preparar WhatsApp', callback: `${CALLBACK_WHATSAPP}:${presupuestoId}` }]]
      : []
  return [...enviar, [{ texto: '👁 Ver como el cliente', url: urls.vista }, { texto: '✏️ Modificar', url: urls.modificar }]]
}

export type DecisionBotonRenovacion = { ok: true; presupuestoId: string; quien: string; canal: CanalRenovacion } | { ok: false; toast: string }

/** ¿Vale esta pulsación? Solo el titular (from.id EXACTO); sin chat configurado, nadie. */
export function decidirBotonRenovacion(cb: { from?: { id?: unknown } | null } | null | undefined, accion: string, args: readonly string[], chatAutorizado: string | undefined): DecisionBotonRenovacion {
  const esperado = String(chatAutorizado ?? '').trim()
  const quien = String(cb?.from?.id ?? '').trim()
  if (!esperado || !quien || quien !== esperado) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  const canal = Object.hasOwn(CANAL_DE_ACCION, accion) ? CANAL_DE_ACCION[accion] : undefined
  if (!canal || args.length !== 1 || !UUID.test(args[0] ?? '')) return { ok: false, toast: 'Botón no válido' }
  return { ok: true, presupuestoId: args[0].toLowerCase(), quien, canal }
}

/** Línea que sustituye a los botones tras pulsar ✅. */
export function lineaTrasPublicar(estado: string): string {
  switch (estado) {
    case 'publicado': return '✅ <i>Publicado en su app: le llega el aviso en la campana (y el correo de aviso de acceso, sin detalles).</i>'
    case 'enviado': return '✅ <i>Enviado por correo con el enlace: puede elegir desde ahí, sin firma.</i>'
    case 'enlace': return '📲 <i>WhatsApp preparado (lleva el enlace y su código): ábrelo en tu móvil y mándalo tú. Puede elegir desde el enlace, sin firma.</i>'
    case 'ya_publicado': return '<i>Ya estaba publicado: no se hace nada más.</i>'
    case 'no_vigente': return '⌛ <i>Este mensaje no es el último de este borrador (se rehízo): usa el más reciente.</i>'
    case 'canal_no_disponible': return '⛔ <i>Nadie que pueda elegir usa la app: no se ha publicado. Mándaselo por correo o WhatsApp.</i>'
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
  /**
   * Enlace del WhatsApp generado tras el ✅ de Alberto (`enlace_generado_at`): ya ha salido de su móvil aunque no haya
   * confirmado el envío (la misma regla que abre la página: `abiertoAlCliente`). Ausente = no consta.
   */
  enlaceGeneradoAt?: Date | null
  /** De quién es la elección ya hecha (PRIMER evento). Ausente o `null` = nadie ha elegido. */
  dueno?: DuenoEleccion | null
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
  /** Ya eligió OTRA persona (vale la primera): se le dice quién, con su nombre de pila y nada más. */
  | { ok: false; estado: 'ya_elegida'; por: string | null }

/**
 * ¿Puede el cliente elegir ahora? Solo una RENOVACIÓN publicada, vigente, sin retirar, sin firmar y sin emitir. Puede
 * cambiar de opinión (cada cambio avisa a Alberto) hasta `MAX_ELECCIONES_DIA` en 24 h. La misma elección otra vez no es
 * un cambio: no vuelve a avisar.
 */
export function decidirEleccion(
  p: EstadoParaElegir, e: Eleccion, opcionValida: boolean, hoy: Date,
  quien: { papel: 'tomador' | 'autorizado'; identidadId: string | null } = { papel: 'tomador', identidadId: null },
): DecisionEleccion {
  const salio = p.enviadoAt !== null || (p.enlaceGeneradoAt ?? null) !== null
  if (p.modo !== MODO_RENOVACION || !salio) return { ok: false, estado: 'no_encontrado' }
  if (p.retiradoAt !== null || p.aceptadoAt !== null || p.emitidoAt !== null) return { ok: false, estado: 'no_admite' }
  if (p.venceEl.getTime() < hoy.getTime()) return { ok: false, estado: 'caducado' }
  if (e.tipo === 'opcion' && !opcionValida) return { ok: false, estado: 'no_encontrado' }
  // Vale la PRIMERA elección: otra persona no la pisa (ni repitiendo la misma). Quien eligió puede cambiar de opinión.
  if (p.dueno && !mismaPersonaQueElige(p.dueno, quien)) return { ok: false, estado: 'ya_elegida', por: p.dueno.nombre }
  const misma = p.eleccionActual !== null && p.eleccionActual.tipo === e.tipo &&
    (e.tipo === 'renovacion' || (p.eleccionActual.tipo === 'opcion' && p.eleccionActual.opcionId === e.opcionId))
  if (misma) return { ok: true, cambio: false }
  if (p.eleccionesDia >= MAX_ELECCIONES_DIA) return { ok: false, estado: 'limite' }
  return { ok: true, cambio: true }
}

/** «en la app» / «desde el enlace del WhatsApp». */
export function textoVia(via: ElectorRenovacion['via']): string {
  return via === 'enlace_whatsapp' ? 'desde el enlace del WhatsApp' : 'en la app'
}

/** Quién eligió, para Alberto: «la tomadora/el tomador» o «Juan (autorizado por el tomador)». Nombre de pila, nada más. */
export function textoQuienElige(e: ElectorRenovacion): string {
  if (e.papel === 'tomador') return e.nombre ? `${e.nombre} (tomador)` : 'el tomador'
  return `${e.nombre ?? 'una persona autorizada'} (autorizado por el tomador con Gestión o Total)`
}

/** Telegram INTERNO a Alberto con lo que eligió (nombre de pila, nunca DNI/IBAN/dirección) y el enlace a la ficha. */
export function textoEleccion(e: { tomador: string | null; ramo: string; eleccion: Eleccion; opcion: { compania: string; producto: string; primaEur: number } | null; primaRenovacion: number | null; enlace: string; cambio: boolean; elector?: ElectorRenovacion }): string {
  const quien = e.tomador ? `<b>${esc(e.tomador)}</b>` : 'El cliente'
  const que = e.eleccion.tipo === 'renovacion'
    ? `se queda con su renovación${e.primaRenovacion === null ? '' : ` (${eur(e.primaRenovacion)})`}`
    : e.opcion ? `quiere <b>${esc(e.opcion.compania)} — ${esc(e.opcion.producto)}</b> por ${eur(e.opcion.primaEur)}` : 'ha elegido una alternativa'
  return [
    `🗳️ ${quien} ${que} (${esc(e.ramo)}).${e.cambio ? '' : ' Lo ha vuelto a confirmar.'}`,
    e.elector
      ? `Lo ha elegido ${esc(textoQuienElige(e.elector))} ${textoVia(e.elector.via)}. NO se ha emitido ni firmado nada: confírmalo con la compañía y prepara la emisión tú.`
      : 'Lo ha elegido en la app. NO se ha emitido ni firmado nada: confírmalo con la compañía y prepara la emisión tú.',
    `<a href="${esc(e.enlace)}">Abrir la ficha del cliente</a>`,
  ].join('\n')
}

/**
 * Línea del historial interno de la ficha (sin importes de terceros ni datos personales). Con `elector` dice QUIÉN eligió
 * (nombre de pila y papel) y POR DÓNDE, con la cuenta del portal (identidad) cuando la hay: el id completo va en el evento.
 */
export function lineaHistorialEleccion(e: Eleccion, opcion: { compania: string; producto: string } | null, ramo: string, elector?: ElectorRenovacion): string {
  const quien = elector
    ? `${elector.papel === 'tomador' ? `El cliente${elector.nombre ? ` (${elector.nombre})` : ''}` : `${elector.nombre ?? 'Una persona'} (autorizado por el tomador)`} ${textoVia(elector.via)}${elector.identidadId ? ` [cuenta del portal ${elector.identidadId.slice(0, 8)}]` : ''}`
    : 'El cliente en la app'
  return e.tipo === 'renovacion'
    ? `${quien} elige quedarse con su renovación de ${ramo} (no emite nada; pendiente de Alberto).`
    : `${quien} elige la alternativa ${opcion ? `${opcion.compania} — ${opcion.producto}` : '(opción)'} para su ${ramo} (no emite nada; pendiente de Alberto).`
}

// ─── 10. Quién elige (05/11/2026) ─────────────────────────────────────────────

/** Lo que dice la ficha DUEÑA del presupuesto para ESTE acceso (`fichaPropiaDeRecurso` o, con el enlace, `fichaDeToken`). */
export type FichaParaElegir =
  | { estado: 'ok'; clienteId: string }
  | { estado: 'sin_ficha' } | { estado: 'ajena' } | { estado: 'sin_permiso' } | { estado: 'error' }

export type DecisionElector =
  | { ok: true; papel: 'tomador' | 'autorizado' }
  | { ok: false; estado: 'no_encontrado' | 'sin_permiso' | 'error' }

/**
 * ¿Quién elige? PURO. Primero el lado del TOMADOR (vínculo con nivel de operar, o su enlace del WhatsApp); si no, un
 * AUTORIZADO con Gestión o Total (`autorizadoElige`, regla de `identidadesQueEligenRenovacion`); si no, nadie.
 *  - Por el ENLACE solo elige el tomador: un token caducado, de otro presupuesto o regenerado no resuelve ficha
 *    (`ajena` → 404); el de una PERSONA DE CONTACTO ve pero no opera (`sin_permiso`, 403).
 *  - Un fallo leyendo la ficha es `error` (503), nunca «no es tuyo» ni un intento por la vía del autorizado.
 *  - Ajena, sin relación o autorizado sin nivel: 404 neutro (nunca «es de otro»).
 */
export function decidirElector(e: { via: 'identidad' | 'enlace'; ficha: FichaParaElegir; autorizadoElige: boolean | null }): DecisionElector {
  if (e.ficha.estado === 'ok') return { ok: true, papel: 'tomador' }
  if (e.ficha.estado === 'error') return { ok: false, estado: 'error' }
  if (e.via === 'enlace') return { ok: false, estado: e.ficha.estado === 'sin_permiso' ? 'sin_permiso' : 'no_encontrado' }
  if (e.autorizadoElige === null) return { ok: false, estado: 'error' }
  return e.autorizadoElige ? { ok: true, papel: 'autorizado' } : { ok: false, estado: 'no_encontrado' }
}

// ─── 9. Revisión adversarial (04/11/2026) ─────────────────────────────────────

export const MOTIVO_RENOVACION_SIN_FIRMA = 'Esta es tu renovación con alternativas: aquí no se acepta ni se firma. Elige en la propia página («Quiero esta opción» o «Me quedo con mi renovación») y tu corredor te dirá si hace falta firmar algo.'

/** Una RENOVACIÓN (modo) no entra por preparar/código/firmar del presupuesto de siempre. `null` = puede seguir. */
export function bloqueoFirmaRenovacion(modo: string | null | undefined): string | null {
  return modo === MODO_RENOVACION ? MOTIVO_RENOVACION_SIN_FIRMA : null
}

export type ViaPublicar = 'telegram' | 'pantalla'

/**
 * ¿Vale esta publicación? Desde TELEGRAM hace falta el message_id del botón y que sea el del ÚLTIMO mensaje de revisión
 * registrado (sin id o sin revisión registrada: no). Desde la PANTALLA (sesión de plataforma) no hay mensaje que mirar.
 */
export function decidirMensajeVigente(e: { via: ViaPublicar; pedido: number | null; ultimo: number | null }): { ok: true } | { ok: false; motivo: string } {
  if (e.via === 'pantalla') return { ok: true }
  if (typeof e.pedido !== 'number' || !Number.isInteger(e.pedido)) return { ok: false, motivo: 'Desde Telegram hace falta el mensaje del botón: no se publica sin él.' }
  if (e.ultimo !== e.pedido) return { ok: false, motivo: 'Ese mensaje no es el último de este borrador.' }
  return { ok: true }
}

/** Historial interno al PREPARAR (como al publicar y al elegir). Sin importes ni datos personales. */
export function lineaHistorialPreparada(ramo: string, nOpciones: number): string {
  return `Renovación con alternativas de ${ramo} preparada (${nOpciones === 1 ? 'una alternativa' : `${nOpciones} alternativas`}): borrador pendiente de revisar, no ha salido nada al cliente.`
}

/** Historial interno cuando el Telegram de la elección no sale: la elección ya está guardada; lo que falta es que Alberto lo sepa. */
export function lineaHistorialAvisoFallido(motivo: string): string {
  return `⚠️ El cliente eligió en la app, pero el aviso por Telegram a Alberto NO salió (${motivo.slice(0, 80)}). Revisa su elección en el presupuesto.`
}
