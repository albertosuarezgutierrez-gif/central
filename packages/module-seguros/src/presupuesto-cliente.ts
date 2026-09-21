/**
 * El presupuesto que ve el CLIENTE: estado derivado, caducidad y la regla de
 * las tres opciones de portada.
 *
 * Diseño completo en `docs/superpowers/specs/2026-09-21-asegura-presupuesto-al-cliente-design.md`.
 * Aquí solo vive lo PURO: sin BD, sin red, sin fechas implícitas — «hoy» entra
 * por parámetro para que los tests no caduquen solos.
 *
 * ⚠️ Nombre: `cotizaciones` ya está cogido (cotizador web) y `avisos-presupuesto.ts`
 * de asegura significa *presupuesto de TIEMPO*. De ahí el `-cliente`.
 */

import type { Comparativa, FilaPrecio, GrupoCobertura } from './comparativa-precios.ts'

// ─── Estado ──────────────────────────────────────────────────────────────────

/**
 * Los sellos del presupuesto. Todos opcionales y todos con el mismo idioma:
 * `null`/ausente = **no ha pasado**, nunca «no» (regla raíz del repo).
 */
export type SellosPresupuesto = {
  venceEl: string | Date
  enlaceGeneradoAt?: string | Date | null
  enviadoAt?: string | Date | null
  vistoAt?: string | Date | null
  elegidoAt?: string | Date | null
  aceptadoAt?: string | Date | null
  emitidoAt?: string | Date | null
  retiradoAt?: string | Date | null
}

export type EstadoPresupuesto =
  | 'retirado'
  | 'emitido'
  | 'aceptado'
  | 'elegido'
  | 'caducado'
  | 'visto'
  | 'enviado'
  /** 🚨 Se abrió WhatsApp con el mensaje escrito. NO consta que se enviara. */
  | 'enlazado'
  | 'borrador'

function instante(v: string | Date | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const t = v instanceof Date ? v.getTime() : Date.parse(v)
  return Number.isFinite(t) ? t : null
}

/**
 * El estado NO se guarda: se deriva de los sellos, igual que `estadoCliente()`.
 * Guardarlo obliga a mantenerlo sincronizado y el día que una transición se
 * olvide, la columna miente sin que nada falle.
 *
 * El orden es deliberado y cada salto tiene su porqué:
 * - `retirado` manda sobre todo: Alberto lo ha dado de baja a mano.
 * - `caducado` va ANTES que `visto`: un visto caducado es un caducado, porque
 *   lo que decide qué botones se pueden pulsar es la caducidad.
 * - `enlazado` es su propio estado y NO se funde con `enviado` (ver más abajo).
 */
export function estadoPresupuesto(p: SellosPresupuesto, hoy: Date): EstadoPresupuesto {
  if (instante(p.retiradoAt) !== null) return 'retirado'
  if (instante(p.emitidoAt) !== null) return 'emitido'
  if (instante(p.aceptadoAt) !== null) return 'aceptado'
  if (instante(p.elegidoAt) !== null) return 'elegido'
  const vence = instante(p.venceEl)
  if (vence !== null && vence < hoy.getTime()) return 'caducado'
  if (instante(p.vistoAt) !== null) return 'visto'
  if (instante(p.enviadoAt) !== null) return 'enviado'
  if (instante(p.enlaceGeneradoAt) !== null) return 'enlazado'
  return 'borrador'
}

/**
 * 🚨 `enlazado` NO es `enviado`, y la pantalla no los pinta igual.
 *
 * Con el enlace de WhatsApp el mensaje sale del móvil de Alberto: el sistema
 * sabe que se generó el enlace y **no puede saber si le dio a enviar**.
 * Fundirlos daría una cola que dice «enviado hace 4 días y no lo ha abierto»
 * sobre algo que quizá nunca salió, y Alberto perseguiría a alguien que no ha
 * recibido nada. Misma regla que `invitacion-whatsapp.ts` ya aplica hoy.
 */
export function constaEnvio(p: SellosPresupuesto): boolean {
  return instante(p.enviadoAt) !== null
}

/** Los estados en los que el cliente todavía puede elegir o firmar. */
export function admiteDecision(e: EstadoPresupuesto): boolean {
  return e === 'enviado' || e === 'visto' || e === 'elegido'
}

// ─── Caducidad ───────────────────────────────────────────────────────────────

/**
 * Decisión de Alberto (21/09/2026, §7 Q1): **15 días naturales**. Corto para
 * que no se muera entre que lo manda y el cliente lo mira; largo para que dé
 * tiempo a hablarlo en casa.
 */
export const VALIDEZ_PRESUPUESTO_DIAS = 15

const DIA_MS = 24 * 60 * 60 * 1000

export type FuenteVencimiento = 'fecha_efecto' | 'validez_casa' | 'oferta_vendor'

export type Vencimiento = {
  venceEl: Date
  /** Cuál de las tres mandó. Se PINTA: la procedencia de una fecha es parte del dato. */
  fuente: FuenteVencimiento
}

/**
 * `vence_el` es el MÍNIMO de lo que se sabe, porque el vendor no dice cuánto
 * vale un precio antes del ReRate (`expirationDate` solo aparece después, y
 * los precios reales tenían `expires_at` a NULL).
 *
 * Tres fuentes:
 * 1. `fechaEfecto − 1 día`. Una fecha de efecto pasada mata el proyecto: el
 *    ReRate contesta «The effective date cannot be before today» y
 *    `effectiveDate` es de solo lectura (incidente del 13/09/2026).
 * 2. `base + VALIDEZ_PRESUPUESTO_DIAS`, donde `base` es el envío si ya salió y
 *    la creación si todavía es borrador — la columna es NOT NULL y hay que
 *    poder calcularla antes de enviar.
 * 3. `expirationDate` de la oferta, **solo** si ya hubo ReRate.
 */
export function calcularVencimiento(e: {
  creadoAt: Date
  enviadoAt?: Date | null
  fechaEfecto?: Date | null
  expiraOferta?: Date | null
}): Vencimiento {
  const base = e.enviadoAt ?? e.creadoAt
  const candidatos: { t: number; fuente: FuenteVencimiento }[] = [
    { t: base.getTime() + VALIDEZ_PRESUPUESTO_DIAS * DIA_MS, fuente: 'validez_casa' },
  ]
  if (e.fechaEfecto) candidatos.push({ t: e.fechaEfecto.getTime() - DIA_MS, fuente: 'fecha_efecto' })
  if (e.expiraOferta) candidatos.push({ t: e.expiraOferta.getTime(), fuente: 'oferta_vendor' })
  // El mínimo. Con empate manda el primero declarado, que es el de la casa:
  // es el único que siempre existe, así que es el que no deja huecos.
  let ganador = candidatos[0]!
  for (const c of candidatos) if (c.t < ganador.t) ganador = c
  return { venceEl: new Date(ganador.t), fuente: ganador.fuente }
}

// ─── La regla de las tres ────────────────────────────────────────────────────

export type PapelPortada = 'equivalente' | 'mas_barata' | 'mejor_cubierta'

/**
 * Por qué no hay equivalente. **Dos motivos, no uno**, y la pantalla dice cuál:
 * colapsarlos es el fallo raíz del repo sobre la frase que más pesa en la
 * decisión del cliente.
 */
export type SinEquivalente =
  /** La póliza actual no trae desglose legible (CIMA no siempre lo manda) →
   *  «no puedo compararlo con lo que tienes». NO es «no hay nada parecido». */
  | 'actual_sin_coberturas'
  /** La actual SÍ se leyó y ninguna opción cae en su grupo. */
  | 'sin_equivalente'

export type OpcionPortada = {
  fila: FilaPrecio
  /** Puede llevar VARIOS: si dos papeles caen en la misma opción, se funden. */
  papeles: PapelPortada[]
  /** `true` cuando la más barata NO comparte cobertura con la actual. */
  coberturaDistinta: boolean
}

export type Portada = {
  opciones: OpcionPortada[]
  /** `null` con su motivo en `motivoSinEquivalente`. */
  equivalente: FilaPrecio | null
  motivoSinEquivalente: SinEquivalente | null
  masBarata: FilaPrecio | null
  mejorCubierta: FilaPrecio | null
  /** Cuándo los grupos NO son comparables entre sí. Si viene, se PINTA. */
  avisoEscala: string | null
}

/**
 * Elige las tres de portada sobre una `Comparativa` ya construida.
 *
 * Es una capa FINA encima de `agruparPrecios`, no un segundo motor: la
 * agrupación por cobertura, el orden y `masBarataEmitible` ya están resueltos
 * allí. En particular **no se ordena por precio por nuestra cuenta**: mezclar
 * Terceros y Todo Riesgo en un `sort` es la mentira que justifica toda esta
 * pieza, y en una lista de tres se agrava porque se lee entera.
 *
 * `claveNivelActual` es el `nivel.clave` de la póliza que el cliente tiene hoy,
 * o `null` si no se ha podido leer su cobertura.
 */
export function elegirPortada(c: Comparativa, claveNivelActual: string | null): Portada {
  const conFilas = c.grupos.filter((g) => g.filas.length > 0)

  // La equivalente: el grupo de la actual, y dentro la más barata QUE SE PUEDE
  // EMITIR (`masBarataEmitible`). Una bloqueada no se ofrece de portada.
  const grupoActual =
    claveNivelActual === null ? null : (conFilas.find((g) => g.nivel.clave === claveNivelActual) ?? null)
  const equivalente = grupoActual?.masBarataEmitible ?? null

  const motivoSinEquivalente: SinEquivalente | null =
    equivalente !== null ? null : claveNivelActual === null ? 'actual_sin_coberturas' : 'sin_equivalente'

  // La más barata: DENTRO del grupo de la equivalente. Sin equivalente, la más
  // barata de todas, pero marcada «cobertura distinta de la tuya».
  const masBarata = equivalente !== null ? equivalente : masBarataDe(conFilas)
  const coberturaDistinta = equivalente === null && masBarata !== null

  // La mejor cubierta: el grupo de MÁS cobertura disponible y, dentro, la más
  // barata. Nunca «la más cara»: caro no es sinónimo de mejor, y decirlo así
  // sería asesoramiento inventado.
  const mejorCubierta = mejorGrupo(conFilas)?.masBarataEmitible ?? null

  const opciones = fundirPapeles([
    [equivalente, 'equivalente' as const],
    [masBarata, 'mas_barata' as const],
    [mejorCubierta, 'mejor_cubierta' as const],
  ], coberturaDistinta)

  return {
    opciones,
    equivalente,
    motivoSinEquivalente,
    masBarata,
    mejorCubierta,
    avisoEscala: c.avisoEscala ?? null,
  }
}

/** La más barata emitible de TODOS los grupos. Los grupos ya vienen ordenados. */
function masBarataDe(grupos: GrupoCobertura[]): FilaPrecio | null {
  let mejor: FilaPrecio | null = null
  for (const g of grupos) {
    const f = g.masBarataEmitible
    if (f === null) continue
    const p = f.precio.primaEur
    // `null`, `undefined` y `NaN` son todos «no hay precio comparable»: ninguno
    // puede ganar una comparación de «la más barata» por ser el menor número.
    if (typeof p !== 'number' || !Number.isFinite(p)) continue
    if (mejor === null) { mejor = f; continue }
    const actual = mejor.precio.primaEur
    if (typeof actual !== 'number' || !Number.isFinite(actual) || actual > p) mejor = f
  }
  return mejor
}

/**
 * El grupo de más cobertura. `rango` ordena de menos a más y los niveles NO
 * reconocidos se van al final con rangos centinela (800/900): si se cogiera el
 * `rango` mayor a secas, «no reconocido» ganaría siempre y se ofrecería como
 * «la mejor cubierta» algo que nadie ha sabido clasificar.
 */
function mejorGrupo(grupos: GrupoCobertura[]): GrupoCobertura | null {
  let mejor: GrupoCobertura | null = null
  for (const g of grupos) {
    if (!g.nivel.reconocido) continue
    if (g.masBarataEmitible === null) continue
    if (mejor === null || g.nivel.rango > mejor.nivel.rango) mejor = g
  }
  return mejor
}

/**
 * Si dos papeles caen en la misma opción se FUNDEN y se dice («es a la vez la
 * equivalente y la más barata»). No se rellena el hueco con una cualquiera
 * para tener tres tarjetas: una tarjeta de relleno es una recomendación que
 * nadie ha hecho.
 */
function fundirPapeles(
  pares: readonly (readonly [FilaPrecio | null, PapelPortada])[],
  coberturaDistinta: boolean,
): OpcionPortada[] {
  const out: OpcionPortada[] = []
  for (const [fila, papel] of pares) {
    if (fila === null) continue
    const ya = out.find((o) => o.fila.indice === fila.indice)
    if (ya) {
      if (!ya.papeles.includes(papel)) ya.papeles.push(papel)
      continue
    }
    out.push({
      fila,
      papeles: [papel],
      coberturaDistinta: papel === 'mas_barata' && coberturaDistinta,
    })
  }
  return out
}
