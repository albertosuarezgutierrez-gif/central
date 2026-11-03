// Reglas PURAS de «todo documento de seguro subido es una oportunidad» (29/09/2026).
//
// Alberto: «toda documentación que se suba, donde se suba —recibo, póliza, imagen—, esa
// información no se puede perder porque hay que llamarlo un mes y pico antes del vencimiento».
// Decisiones suyas del mismo día: llamada 45 días antes; sin vencimiento legible se crea igual
// con una tarea para pedirlo; si el documento es de OTRA persona, lead automático por DNI y
// relación con quien lo sube.
//
// Aquí no hay BD ni red: lo que decide va testeado en `oportunidad-documento-reglas.test.ts`.

import { DIAS_AVISO_OPORTUNIDAD, decidirFichaPorIdentidad, fechaAvisoOportunidad, mismaCompania } from '@central/module-seguros'

/** Días antes del vencimiento a los que se llama: la regla única de las oportunidades (`@central/module-seguros`). */
export const DIAS_LLAMADA_ANTES_VENCIMIENTO = DIAS_AVISO_OPORTUNIDAD

const RAMOS = ['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos', 'responsabilidad_civil', 'comercio', 'comunidades', 'accidentes', 'empresas', 'rc_profesional', 'dyo', 'flotas', 'transporte_mercancias', 'ciberriesgos', 'decenal', 'embarcaciones', 'mascotas', 'impago_alquiler', 'viaje', 'caucion', 'patinete', 'otros'] as const
export type RamoDocumento = (typeof RAMOS)[number]

/** El ramo leído, o `otros`: un documento de seguro sin ramo claro sigue siendo una venta. */
export function ramoOportunidad(ramo: unknown): RamoDocumento {
  return RAMOS.find((r) => r === ramo) ?? 'otros'
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (s: string) => new Date(`${s}T00:00:00Z`)

/**
 * El PRÓXIMO vencimiento. Una póliza de 2025 subida hoy vence otra vez este año: los seguros
 * se renuevan cada año, así que un vencimiento pasado se corre de año en año hasta hoy o
 * después. Sin esto, la oportunidad nacería con la fecha ya vencida y nadie la llamaría.
 */
export function proximoVencimiento(fecha: string | null | undefined, hoy: Date): string | null {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const d = utc(fecha)
  if (Number.isNaN(d.getTime())) return null
  const hoyIso = iso(hoy)
  let anios = 0
  let r = fecha
  while (r < hoyIso && anios < 30) {
    anios++
    const n = new Date(Date.UTC(d.getUTCFullYear() + anios, d.getUTCMonth(), d.getUTCDate()))
    // 29/02 en año no bisiesto: Date lo pasa a 01/03; se queda en el 28/02.
    if (n.getUTCMonth() !== d.getUTCMonth()) n.setUTCDate(0)
    r = iso(n)
  }
  return r < hoyIso ? null : r
}

/** Cuándo llamar: 45 días antes del vencimiento; si eso ya pasó (o no hay fecha), mañana. */
export function fechaLlamada(vence: string | null, hoy: Date): string {
  return fechaAvisoOportunidad(vence, iso(hoy))
}

/**
 * ¿Trae algo de un seguro? Un DNI, un carné o una foto cualquiera no traen compañía, nº de
 * póliza, vencimiento ni prima: se guardan como documento y no abren nada.
 */
export function esDocumentoDeSeguro(d: { compania?: unknown; numeroPoliza?: unknown; fechaVencimiento?: unknown; primaAnual?: unknown }): boolean {
  const txt = (v: unknown) => typeof v === 'string' && v.trim() !== ''
  return txt(d.compania) || txt(d.numeroPoliza) || txt(d.fechaVencimiento) || (typeof d.primaAnual === 'number' && d.primaAnual > 0)
}

// Partículas que no identifican a nadie: «de la» no puede contar como media persona.
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'i'])
const sinEspacios = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, '')
const palabras = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9ñ]+/).filter((p) => p.length >= 2 && !PARTICULAS.has(p))

/**
 * ¿Es el mismo nombre? Las pólizas escriben «PIÑA FRANCO MANUEL ANTONIO» y la ficha «Manuel Antonio
 * Piña Franco»: se compara por palabras, sin orden. Mismo si TODAS las palabras del nombre más corto
 * están en el otro y son al menos dos. Un padre «Manuel Piña Ruiz» no es su hijo «Manuel Antonio
 * Piña Franco» (falta «ruiz»). Ante la duda, NO es el mismo: duplicar se ve, mezclar no. Las
 * partículas («de», «la», «y»…) no cuentan.
 */
export function mismoNombre(a: string | null | undefined, b: string | null | undefined, opts: { exacto?: boolean } = {}): boolean {
  // El OCR a veces pega las palabras («JOSE ANTONIOMARTINAVILA»): idénticos sin espacios = mismo nombre.
  // Solo igualdad total (con ≥ 2 palabras en AMBOS lados), nunca parcial.
  const sa = sinEspacios(a)
  if (sa !== '' && sa === sinEspacios(b) && Math.min(palabras(a).length, palabras(b).length) >= 2) return true
  const pa = new Set(palabras(a))
  const pb = new Set(palabras(b))
  const [corto, largo] = pa.size <= pb.size ? [pa, pb] : [pb, pa]
  if (corto.size < 2) return false
  // `exacto`: las mismas palabras, sin sobrar ninguna. Es lo que se exige cuando el documento trae un
  // DNI que la ficha no tiene: «Manuel Piña» (hijo, sin DNI) no se queda la póliza de «Manuel Piña Ruiz».
  if (opts.exacto && corto.size !== largo.size) return false
  for (const p of corto) if (!largo.has(p)) return false
  return true
}

const dniNormal = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')

export type DecisionFicha =
  /** `reactivar`: la ficha estaba DESCARTADA y es la única con ese DNI/CIF: se usa y se reactiva (22/10/2026). */
  | { tipo: 'ficha'; clienteId: string; porque: 'dni_ficha' | 'dni_cartera' | 'nombre' | 'sin_tomador'; reactivar?: boolean }
  | { tipo: 'lead' }
  | { tipo: 'sin_persona' }
  /** Dos o más fichas ACTIVAS con el mismo DNI/CIF (22/10/2026): no se elige a ciegas ni se abre otra. */
  | { tipo: 'ambigua'; candidatas: string[] }

/**
 * ¿A qué ficha va la oportunidad? Por IDENTIDAD (DNI) antes que por nombre, y dos DNI distintos
 * no se funden nunca (regla «agrupar personas por identidad»).
 *
 * - `clienteSube`: la ficha donde se ha subido (null si se sube sin ficha, p. ej. el portal sin
 *   vínculo). `dniFicha`: su DNI descifrado (null si no tiene o no se pudo leer).
 * - `coincidencias`: fichas con el DNI del documento. `null` = no se pudo buscar (≠ `[]`).
 */
export function decidirFicha(e: {
  clienteSube: string | null
  nombreFicha: string | null
  dniFicha: string | null
  tomador: string | null
  dniDocumento: string | null
  coincidencias: { id: string; activo: boolean }[] | null
}): DecisionFicha {
  const dniDoc = dniNormal(e.dniDocumento)
  if (dniDoc) {
    if (e.clienteSube && e.dniFicha && dniNormal(e.dniFicha) === dniDoc) return { tipo: 'ficha', clienteId: e.clienteSube, porque: 'dni_ficha' }
    // En TODA la cartera, descartadas incluidas (22/10/2026): la activa antes que la descartada; la
    // única descartada se usa y se REACTIVA; dos activas = ambigua (`decidirFichaPorIdentidad`).
    const d = decidirFichaPorIdentidad(e.coincidencias ?? [], e.clienteSube)
    if (d.tipo === 'ficha') return { tipo: 'ficha', clienteId: d.clienteId, porque: 'dni_cartera', ...(d.reactivar ? { reactivar: true } : {}) }
    if (d.tipo === 'ambigua') return { tipo: 'ambigua', candidatas: d.candidatas }
    // La ficha no tiene DNI guardado (o no se pudo leer) pero se llama igual: es ella. Con OTRO DNI
    // en la ficha, no: es otra persona aunque se llame igual.
    if (e.clienteSube && !e.dniFicha && mismoNombre(e.tomador, e.nombreFicha, { exacto: true })) return { tipo: 'ficha', clienteId: e.clienteSube, porque: 'nombre' }
    return { tipo: 'lead' }
  }
  if (!e.tomador || palabras(e.tomador).length === 0) {
    return e.clienteSube ? { tipo: 'ficha', clienteId: e.clienteSube, porque: 'sin_tomador' } : { tipo: 'sin_persona' }
  }
  if (e.clienteSube && mismoNombre(e.tomador, e.nombreFicha)) return { tipo: 'ficha', clienteId: e.clienteSube, porque: 'nombre' }
  return { tipo: 'lead' }
}

/**
 * Sin ficha por DNI, las fichas que comparten su teléfono o email son POSIBLES DUPLICADOS, y nada
 * más (03/10/2026, revisión del PR #4147): no se asigna la póliza a ninguna ni se le escribe el DNI.
 *
 * 🚨 Un móvil identifica un HOGAR, no a una persona (740 números compartidos por 1.599 fichas; caso
 * fundacional del 21/09/2026: el hijo trae la póliza del padre con SU teléfono). Asignar por
 * contacto fundiría a dos personas para siempre; duplicar se ve y se arregla fusionando por SQL con
 * lote y guarda de identidad. Se abre el lead y se deja la nota «posible duplicado de <id>».
 */
export function posiblesDuplicadosPorContacto(candidatos: { id: string }[], excepto?: string | null): string[] {
  return [...new Set(candidatos.map((c) => c.id))].filter((id) => id !== excepto)
}

/** Orígenes donde quien sube el documento es el CLIENTE (no el corredor). */
export const ORIGENES_DEL_CLIENTE: readonly string[] = ['portal', 'solicitud']

/**
 * ¿Se vuelcan a la ficha los datos personales que trae el documento? (03/10/2026, revisión PR #4147)
 *
 * 🚨 Desde el PORTAL (o el enlace de datos) sube el cliente, y el email que se vuelque puede acabar
 * enlazando la sesión del portal: subir la póliza de OTRA persona con tu email sería tomar su cuenta.
 * Ahí solo se vuelca si la ficha destino es la PROPIA de quien sube. Nunca sin verificar, ni sin
 * tomador (no se sabe de quién son los datos).
 */
export function puedeVolcarEnFicha(e: {
  origen: string
  verificado: boolean
  hayTomador: boolean
  porqueFicha: string | null
  clienteId: string
  clienteSube: string | null
}): boolean {
  if (!e.verificado || !e.hayTomador || e.porqueFicha === 'sin_tomador') return false
  if (ORIGENES_DEL_CLIENTE.includes(e.origen)) return e.clienteSube !== null && e.clienteId === e.clienteSube
  return true
}

/**
 * ¿Se abren fichas y relaciones para las FIGURAS de la póliza (propietario, conductores)? Solo si
 * sube el CORREDOR (03/10/2026, revisión): desde el portal o el enlace de datos sube el cliente, y
 * una relación «Otra» nueva aparece en sus sugerencias del portal (nombre de un tercero y una puerta
 * para pedir acceso a sus pólizas). Además, lo mismo que `puedeVolcarEnFicha`.
 */
export function puedeAbrirFiguras(e: Parameters<typeof puedeVolcarEnFicha>[0]): boolean {
  if (ORIGENES_DEL_CLIENTE.includes(e.origen)) return false
  return puedeVolcarEnFicha(e)
}

/** El tomador tal como sale del documento para abrir su lead. `dni` = su DNI/NIE o, de una empresa, su CIF. */
export type AltaTomador = { nombre: string; apellidos: string; dni: string | null; tipoPersona: 'fisica' | 'juridica' | null }

export type PlanTomador =
  | { tipo: 'ficha'; clienteId: string; porque: 'dni_ficha' | 'dni_cartera' | 'nombre' | 'sin_tomador'; reactivar?: boolean }
  | { tipo: 'ambigua'; candidatas: string[] }
  /** Lead nuevo CON su DNI/CIF si lo trae (`alta.dni`), sin él si no; y las fichas que solo comparten contacto. */
  | { tipo: 'lead'; alta: AltaTomador; posiblesDuplicados: string[] }
  | { tipo: 'sin_persona' }

/**
 * ¿De quién es el documento? (03/10/2026, «Subir póliza» = lo mismo que la ficha → Documentos.)
 * Une `decidirFicha` y `posiblesDuplicadosPorContacto` sobre UNA búsqueda en la cartera
 * (`encontradas`: lo que devuelve `coincidencias()` con el DNI/CIF, el teléfono y el email del
 * documento; `null` = no se pudo buscar ≠ `[]`).
 *
 * 🚨 Solo el DNI/CIF (índice ciego) asigna una ficha. Una ficha que comparte el teléfono o el email
 * NUNCA se elige (un móvil es un hogar): sale en `posiblesDuplicados` para la nota del lead nuevo.
 * Sin ficha de contexto y sin coincidencia por identidad, el lead nace con el DNI/CIF del documento;
 * sin ninguno, sin identificador.
 */
export function planTomador(e: {
  clienteSube: string | null
  nombreFicha: string | null
  dniFicha: string | null
  alta: AltaTomador | null
  /** `activo` = `clientes.activo` (22/10/2026: antes se suponía `true` para todas y una descartada podía ganar). */
  encontradas: { id: string; por: string; activo?: boolean }[] | null
}): PlanTomador {
  const porIdentidad = e.encontradas === null
    ? null
    : [...new Set(e.encontradas.filter((x) => x.por === 'dni').map((x) => x.id))].map((id) => ({
        id,
        // Sin el dato (llamada antigua) se supone activa: es lo que se hacía antes.
        activo: e.encontradas!.some((x) => x.id === id && x.por === 'dni' && x.activo !== false),
      }))
  const d = decidirFicha({
    clienteSube: e.clienteSube,
    nombreFicha: e.nombreFicha,
    dniFicha: e.dniFicha,
    tomador: e.alta ? `${e.alta.nombre} ${e.alta.apellidos}`.trim() : null,
    dniDocumento: e.alta?.dni ?? null,
    coincidencias: porIdentidad,
  })
  if (d.tipo !== 'lead') return d
  if (!e.alta) return { tipo: 'sin_persona' }
  const identidad = new Set((porIdentidad ?? []).map((c) => c.id))
  const porContacto = (e.encontradas ?? []).filter((x) => (x.por === 'telefono' || x.por === 'email') && !identidad.has(x.id))
  return { tipo: 'lead', alta: e.alta, posiblesDuplicados: posiblesDuplicadosPorContacto(porContacto) }
}

/** Lo que la pantalla necesita saber de la ficha tras subir un documento SIN ficha de contexto. */
export type FichaDelDocumento = {
  clienteId: string
  /** `true` = lead abierto ahora con este documento; `false` = ya existía. */
  creada: boolean
  /** Campos rellenados (solo sus NOMBRES: «fecha de nacimiento», «domicilio», «CIF»…). */
  rellenados: string[]
  avisos: string[]
}

type VolcadoResumible =
  | { estado: 'rellenada'; campos: string[]; avisos: string[] }
  | { estado: 'nada_que_rellenar'; avisos: string[] }
  | { estado: 'no_tocada'; motivo: string }
  | { estado: 'error'; motivo: string }
  | null

const POR_QUE_NO_TOCADA: Record<string, string> = {
  dni_distinto: 'el DNI/CIF del documento no es el de la ficha: no se ha rellenado nada',
  sin_dni_documento: 'el documento no trae DNI ni CIF legible: no se ha rellenado nada de la ficha',
  dni_ficha_ilegible: 'el DNI de la ficha no se ha podido leer: no se ha rellenado nada',
  sin_ficha: 'la ficha no se ha encontrado al rellenarla',
}

/**
 * La ficha resultante de un documento subido, para la respuesta del puerto: id, si se creó, los
 * NOMBRES de lo rellenado y los avisos. Sin un solo valor personal. `null` = no se tocó ninguna
 * ficha (ya nuestra, sin tomador, no es un seguro, no se leyó).
 */
export function fichaDelDocumento(o: {
  estado: string
  clienteId?: string
  clienteNuevo?: boolean
  ficha?: VolcadoResumible
  posiblesDuplicados?: string[]
  conIdentificador?: boolean
}): FichaDelDocumento | null {
  if (!o.clienteId) return null
  const avisos: string[] = []
  const creada = o.clienteNuevo === true
  if (creada && o.conIdentificador === false) avisos.push('el documento no trae DNI ni CIF legible: el lead se ha abierto sin identificador')
  const v = o.ficha ?? null
  let rellenados: string[] = []
  if (v === null) {
    if (o.estado === 'creada' || o.estado === 'actualizada') avisos.push('no se ha intentado rellenar la ficha')
  } else if (v.estado === 'rellenada') {
    rellenados = v.campos
    avisos.push(...v.avisos)
  } else if (v.estado === 'nada_que_rellenar') {
    avisos.push(...v.avisos)
  } else if (v.estado === 'no_tocada') {
    // Lead sin identificador: ya se ha dicho arriba, no se repite.
    if (!(creada && o.conIdentificador === false && v.motivo === 'sin_dni_documento')) avisos.push(POR_QUE_NO_TOCADA[v.motivo] ?? `no se ha rellenado la ficha (${v.motivo})`)
  } else {
    avisos.push('no se ha podido rellenar la ficha')
  }
  const dup = o.posiblesDuplicados ?? []
  if (dup.length > 0) avisos.push(`${dup.length === 1 ? 'una ficha comparte' : `${dup.length} fichas comparten`} su teléfono o email: posible duplicado (anotado en la ficha, no se ha fundido ni asignado)`)
  if (o.estado === 'error') avisos.push('la oportunidad no se ha podido abrir: ábrela a mano')
  return { clienteId: o.clienteId, creada, rellenados, avisos }
}

/** Estados en los que una oportunidad sigue ABIERTA (cualquier otro: ganada, perdida, descartada… = cerrada). */
const ESTADOS_ABIERTOS: readonly string[] = ['competencia', 'en_negociacion', 'pendiente_cliente']

/** Nº de póliza comparable: mayúsculas y sin espacios, guiones, puntos ni barras («18.162.048» = «18162048»). `null` si queda vacío. */
export function normalizarNumeroPoliza(n: string | null | undefined): string | null {
  const t = (n ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return t === '' ? null : t
}

export type OportunidadExistente = { id: string; estado: string; numeroPoliza: string | null; aseguradora: string | null }

/**
 * ¿Ya existe la oportunidad de ESTE documento? (06/10/2026: nº 18162048 subido dos veces = dos oportunidades.)
 * Reutiliza la primera ABIERTA con el mismo nº de póliza (normalizado) y la misma compañía (o
 * desconocida en alguno de los dos lados). Sin nº en el documento o en la existente no se puede
 * afirmar que sea la misma: se crea (la regla por ramo/compañía de `crearOportunidad` sigue después).
 * Una cerrada o descartada no cuenta: una renovación nueva sí es una oportunidad nueva.
 */
export function decidirOportunidadExistente(
  nueva: { numeroPoliza: string | null; aseguradora: string | null },
  existentes: OportunidadExistente[],
): { accion: 'reutilizar'; id: string } | { accion: 'crear' } {
  const n = normalizarNumeroPoliza(nueva.numeroPoliza)
  if (!n) return { accion: 'crear' }
  const ya = existentes.find(
    (o) => ESTADOS_ABIERTOS.includes(o.estado) && normalizarNumeroPoliza(o.numeroPoliza) === n && mismaCompania(nueva.aseguradora, o.aseguradora) !== 'otra',
  )
  return ya ? { accion: 'reutilizar', id: ya.id } : { accion: 'crear' }
}

export type OportunidadDeLaPoliza = OportunidadExistente & { clienteId: string }

export type DecisionOportunidadPoliza =
  | { accion: 'actualizar'; id: string; clienteId: string }
  /** `cerradas`: la misma póliza ya tuvo oportunidad (ganada, perdida, descartada): se crea y se avisa. */
  | { accion: 'crear'; cerradas: string[] }
  /** Varias ABIERTAS de la misma póliza en fichas distintas y ninguna es la del documento: no se elige. */
  | { accion: 'ambigua'; ids: string[] }
  /**
   * El nº de póliza casa con una abierta, pero no se puede afirmar que sea la misma (23/10/2026, revisión):
   * el DNI/CIF leído es de OTRA ficha, o falta la compañía en un lado. NO se escribe nada (ni lectura, ni
   * personas, ni relación): solo aviso.
   */
  | { accion: 'revisar'; id: string; clienteId: string; porque: 'ficha_distinta' | 'compania_ausente' }

/**
 * ¿Ya tiene oportunidad ESTA póliza en TODA la correduría? (22/10/2026, «escanear nunca duplica».)
 * Mismo nº normalizado y misma compañía (o desconocida en un lado). Una ABIERTA → se ACTUALIZA, esté
 * en la ficha que esté (el nº + compañía identifican la póliza mejor que la ficha que se haya elegido).
 * Varias abiertas: la de la primera ficha de `preferidas` (tomador por DNI/CIF, la de donde se sube)
 * que tenga alguna, la más antigua; si ninguna está en esas fichas y hay más de una ficha → ambigua.
 * Las CERRADAS no se reabren: se devuelven para avisar. Sin nº → crear.
 */
export function decidirOportunidadDeLaPoliza(
  nueva: { numeroPoliza: string | null; aseguradora: string | null },
  existentes: readonly OportunidadDeLaPoliza[],
  preferidas: readonly (string | null)[] = [],
  /** Ficha decidida por DNI/CIF (`decidirFicha` → `tipo==='ficha'`); `null`/omitida = el documento no la fija. */
  fichaPorDni: string | null = null,
): DecisionOportunidadPoliza {
  const n = normalizarNumeroPoliza(nueva.numeroPoliza)
  if (!n) return { accion: 'crear', cerradas: [] }
  const misma = existentes.filter((o) => normalizarNumeroPoliza(o.numeroPoliza) === n && mismaCompania(nueva.aseguradora, o.aseguradora) !== 'otra')
  const abiertas = misma.filter((o) => ESTADOS_ABIERTOS.includes(o.estado))
  const cerradas = misma.filter((o) => !ESTADOS_ABIERTOS.includes(o.estado)).map((o) => o.id)
  if (abiertas.length === 0) return { accion: 'crear', cerradas }
  // Adoptar una abierta solo con identidad firme: misma compañía (conocida en los dos lados) y, si el DNI
  // fija ficha, que sea la de la oportunidad. Si no, a revisar sin escribir nada.
  const adoptar = (o: OportunidadDeLaPoliza): DecisionOportunidadPoliza => {
    if (mismaCompania(nueva.aseguradora, o.aseguradora) !== 'misma') return { accion: 'revisar', id: o.id, clienteId: o.clienteId, porque: 'compania_ausente' }
    if (fichaPorDni && fichaPorDni !== o.clienteId) return { accion: 'revisar', id: o.id, clienteId: o.clienteId, porque: 'ficha_distinta' }
    return { accion: 'actualizar', id: o.id, clienteId: o.clienteId }
  }
  for (const c of preferidas) {
    const suya = c ? abiertas.find((o) => o.clienteId === c) : undefined
    if (suya) return adoptar(suya)
  }
  const fichas = new Set(abiertas.map((o) => o.clienteId))
  if (fichas.size === 1) return adoptar(abiertas[0])
  return { accion: 'ambigua', ids: abiertas.map((o) => o.id) }
}

/**
 * El Telegram a Alberto cuando una subida NO elige a ciegas (22/10/2026). Solo ids (ficha u
 * oportunidad) y el origen: ni nombres, ni DNI/CIF, ni nº de póliza.
 */
export function textoAvisoAmbiguo(e: { motivo: 'ficha_ambigua' | 'oportunidad_ambigua' | 'oportunidad_dudosa' | 'figura_ambigua'; ids: readonly string[]; origen: string; n?: number }): string {
  const ids = e.ids.slice(0, 10).map((id) => `<code>${id}</code>`).join(', ')
  if (e.motivo === 'ficha_ambigua') return `⚠️ <b>Póliza subida sin asignar</b> (${e.origen}): el DNI/CIF del tomador está en ${e.ids.length} fichas ACTIVAS (${ids}). No se ha elegido ninguna ni abierto otra: revisa y funde si son la misma persona, y vuelve a subirla.`
  if (e.motivo === 'oportunidad_ambigua') return `⚠️ <b>Póliza subida sin asignar</b> (${e.origen}): ya tiene ${e.ids.length} oportunidades ABIERTAS en fichas distintas (${ids}). No se ha actualizado ninguna: deja una sola y vuelve a subirla.`
  if (e.motivo === 'oportunidad_dudosa') return `⚠️ <b>Póliza subida sin asignar</b> (${e.origen}): su nº de póliza coincide con la oportunidad ${ids}, pero el DNI/CIF del tomador es de otra ficha o falta la compañía. No se ha escrito nada: revisa si es la misma póliza y vuelve a subirla.`
  return `⚠️ <b>Póliza subida</b> (${e.origen}): ${e.n ?? 1} persona(s) de la póliza tienen su DNI/CIF en varias fichas activas: no se han vinculado${ids ? ` (oportunidad ${ids})` : ''}. Revisa los posibles duplicados.`
}
