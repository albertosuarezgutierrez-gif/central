// MOTOR DE SEÑALES de patrimonio (P16, 26/10/2026) — PURO, sin BD, red ni reloj (`hoy` se inyecta).
// Spec: docs/superpowers/specs/2026-10-24-portal-inicio-herramientas-oportunidades.md §3. Borrador legal: docs/legal/2026-10-26-borrador-p15-patrimonio.md.
//
// 🚨 APAGADO POR DEFECTO. Nada de esto se calcula ni se guarda salvo que `PATRIMONIO_SENALES_ACTIVAS=1`
// (`patrimonioSenalesActivas`). Encendido, la base legal es el INTERÉS LEGÍTIMO INFORMADO (decisión de Alberto, 26/10/2026;
// política de privacidad del portal, apartado «3 bis»): se calcula para toda ficha con patrimonio SALVO que alguna identidad
// que la opera se haya OPUESTO (`oposicion_senales_patrimonio`, `puedeCalcularSenales`).
// Una SEÑAL es un hecho calculado que solo ve Alberto; NO es una oportunidad ni autoriza contacto alguno.
//
// 🚨 `null` = no se sabe. Una señal exige un hecho AFIRMADO: `sin_mirar`, un contrato sin dato de impago o una póliza
// externa sin vigencia comprobada NO generan señal (regla de la casa: dato que no hay ≠ dato que no se ha mirado).
// 🚨 El INQUILINO jamás es lead: ninguna entrada de este módulo lleva datos de inquilino.

import { diasEntre, sumarDias, sumarMeses, type Fecha } from './fechas.ts'
import type { AlertaInfraseguro } from './infraseguro.ts'
import type { EstadoSeguroInmueble } from './enlace-seguro.ts'

// ─── Interruptor ───────────────────────────────────────────────────────────────────────────────────────────────

/** Nombre de la env. Un solo sitio: los cepos buscan este literal. */
export const ENV_PATRIMONIO_SENALES = 'PATRIMONIO_SENALES_ACTIVAS'

/** Solo el valor exacto `1` enciende. Vacío, `true`, `on`, espacios… = apagado (fail-closed). */
export function patrimonioSenalesActivas(valor: string | null | undefined): boolean {
  return valor === '1'
}

// ─── Catálogo ──────────────────────────────────────────────────────────────────────────────────────────────────

export const TIPOS_SENAL = [
  'inmueble_sin_seguro',
  'infraseguro',
  'poliza_externa_por_vencer',
  'alquiler_sin_impago',
  'hipoteca_con_seguros',
] as const
export type TipoSenal = (typeof TIPOS_SENAL)[number]

export function esTipoSenal(v: unknown): v is TipoSenal {
  return typeof v === 'string' && (TIPOS_SENAL as readonly string[]).includes(v)
}

export const ESTADOS_SENAL = ['abierta', 'promovida', 'descartada', 'resuelta', 'retirada'] as const
export type EstadoSenal = (typeof ESTADOS_SENAL)[number]

/** Estados con la señal viva (hay fila única por clave, índice parcial). */
export const ESTADOS_VIVOS: readonly EstadoSenal[] = ['abierta', 'promovida']

export type PrioridadSenal = 'alta' | 'media' | 'baja'

/** Días que una señal DESCARTADA por Alberto no se vuelve a crear (decisión de Alberto, 26/10/2026). */
export const DIAS_TRAS_DESCARTE = 180
/** Ventana de «póliza externa por vencer». */
export const DIAS_AVISO_EXTERNA = 60

// ─── Entradas ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface ContratoParaSenal {
  id: string
  /** Fecha en que terminó de verdad. `null` = sigue vivo. */
  terminadoEn: Fecha | null
  /** `true` = hay enlace `impago_alquiler` · `false` = consta que no · `null` = no se ha podido comprobar (NO genera señal). */
  tieneSeguroImpago: boolean | null
}

export interface InmuebleParaSenal {
  id: string
  alias: string
  uso: string
  referenciaCatastral: string | null
  estadoSeguro: EstadoSeguroInmueble
  infraseguro: AlertaInfraseguro | null
  /** `si` | `no` | `no_se` | `null` (no lo ha dicho). Solo `si` genera señal. */
  hipoteca: string | null
  /** Contratos NO archivados del inmueble (solo ids y estado: nunca datos del inquilino). */
  contratos: readonly ContratoParaSenal[]
}

export interface DeclaradaParaSenal {
  id: string
  ramo: string | null
  /** `YYYY-MM-DD`; `null` = sin vencimiento. */
  vencimiento: Fecha | null
  /** `true` vigente · `false` no · `null` no comprobado. */
  vigente: boolean | null
}

export interface SenalCalculada {
  tipo: TipoSenal
  ramo: string
  prioridad: PrioridadSenal
  /** `rc:<ref. catastral>` si consta; si no `inm:<id>`; `dec:<id>` para la externa; `con:<id>` para el contrato. */
  objeto: string
  /** `<cliente>:<objeto>:<tipo>`: identidad de la señal (la ficha del titular, nunca el nombre). */
  clave: string
  inmuebleId: string | null
  contratoId: string | null
  polizaDeclaradaId: string | null
  /** Solo cifras del riesgo y alias del inmueble. Sin PII, sin rentas, sin nada del inquilino. */
  datos: Record<string, string | number | boolean | null>
}

// ─── Generador ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Ramo que se ofrece para un uso. `null` = ese uso (garaje, trastero, otro) no tiene seguro propio que proponer. */
export function ramoDeUso(uso: string): 'hogar' | 'comercio' | null {
  if (uso === 'vivienda') return 'hogar'
  if (uso === 'local' || uso === 'oficina' || uso === 'nave') return 'comercio'
  return null
}

const objetoInmueble = (i: Pick<InmuebleParaSenal, 'id' | 'referenciaCatastral'>): string =>
  i.referenciaCatastral ? `rc:${i.referenciaCatastral}` : `inm:${i.id}`

/**
 * Las señales que hoy se dan para UNA ficha (su titular). Determinista, sin efectos. Por entrada, UNA regla por tipo:
 *  · `inmueble_sin_seguro`  — el cliente DECLARÓ que no tiene (`sin_seguro`). `sin_mirar`, `enlazado_sin_comprobar` y
 *                              `con_seguro_no_vigente` NO (ahí no consta «sin seguro»).
 *  · `infraseguro`          — `alertaInfraseguro` = `infraseguro`; `sin_dato` y `ok` no.
 *  · `alquiler_sin_impago`  — contrato vivo (`terminadoEn` null o posterior a `hoy`) y `tieneSeguroImpago === false`.
 *  · `hipoteca_con_seguros` — el cliente dijo `si`. `no`, `no_se` y `null` no.
 */
export function senalesDeInmueble(x: { clienteId: string; hoy: Fecha; inmueble: InmuebleParaSenal }): SenalCalculada[] {
  const { clienteId, hoy, inmueble: i } = x
  const salida: SenalCalculada[] = []
  const objeto = objetoInmueble(i)
  const ramoUso = ramoDeUso(i.uso)
  const base = { inmuebleId: i.id, contratoId: null, polizaDeclaradaId: null }
  const clave = (o: string, t: TipoSenal) => `${clienteId}:${o}:${t}`

  if (ramoUso !== null && i.estadoSeguro === 'sin_seguro') {
    salida.push({ ...base, tipo: 'inmueble_sin_seguro', ramo: ramoUso, prioridad: 'alta', objeto, clave: clave(objeto, 'inmueble_sin_seguro'), datos: { alias: i.alias, uso: i.uso } })
  }
  if (ramoUso !== null && i.infraseguro?.estado === 'infraseguro') {
    salida.push({
      ...base, tipo: 'infraseguro', ramo: ramoUso, prioridad: 'alta', objeto, clave: clave(objeto, 'infraseguro'),
      datos: { alias: i.alias, ratio: Math.round(i.infraseguro.ratio * 100) / 100, faltanteCent: i.infraseguro.faltante },
    })
  }
  if (i.hipoteca === 'si') {
    salida.push({ ...base, tipo: 'hipoteca_con_seguros', ramo: 'hogar', prioridad: 'baja', objeto, clave: clave(objeto, 'hipoteca_con_seguros'), datos: { alias: i.alias } })
  }
  for (const c of i.contratos) {
    const vivo = c.terminadoEn === null || c.terminadoEn > hoy
    if (!vivo || c.tieneSeguroImpago !== false) continue
    const o = `con:${c.id}`
    salida.push({
      tipo: 'alquiler_sin_impago', ramo: 'impago_alquiler', prioridad: 'media', objeto: o, clave: clave(o, 'alquiler_sin_impago'),
      inmuebleId: i.id, contratoId: c.id, polizaDeclaradaId: null, datos: { alias: i.alias },
    })
  }
  return salida
}

/** Pólizas DECLARADAS de otra compañía que vencen pronto: señal propia (no cuelga de un inmueble). */
export function senalesDeDeclaradas(x: { clienteId: string; hoy: Fecha; declaradas: readonly DeclaradaParaSenal[] }): SenalCalculada[] {
  const limite = sumarDias(x.hoy, DIAS_AVISO_EXTERNA)
  const salida: SenalCalculada[] = []
  for (const d of x.declaradas) {
    if (d.vigente !== true || d.vencimiento === null) continue
    if (d.vencimiento < x.hoy || d.vencimiento > limite) continue
    const o = `dec:${d.id}`
    salida.push({
      tipo: 'poliza_externa_por_vencer', ramo: d.ramo ?? 'otros', prioridad: 'alta', objeto: o, clave: `${x.clienteId}:${o}:poliza_externa_por_vencer`,
      inmuebleId: null, contratoId: null, polizaDeclaradaId: d.id,
      datos: { vence: d.vencimiento, dias: diasEntre(x.hoy, d.vencimiento) },
    })
  }
  return salida
}

export function calcularSenales(x: {
  clienteId: string
  hoy: Fecha
  inmuebles: readonly InmuebleParaSenal[]
  declaradas: readonly DeclaradaParaSenal[]
}): SenalCalculada[] {
  return [
    ...x.inmuebles.flatMap((inmueble) => senalesDeInmueble({ clienteId: x.clienteId, hoy: x.hoy, inmueble })),
    ...senalesDeDeclaradas({ clienteId: x.clienteId, hoy: x.hoy, declaradas: x.declaradas }),
  ]
}

// ─── Permiso ───────────────────────────────────────────────────────────────────────────────────────────────────

export type PermisoContacto = 'pedido' | 'consentido' | 'sin_permiso' | 'opuesto'

/**
 * Qué permiso hay para CONTACTAR sobre una FICHA (la señal no lo da: calcular ≠ contactar). Llegan los estados vigentes de
 * TODAS las identidades que la operan como propia:
 *  · `oposiciones` — `oposicion_senales_patrimonio` (`true` opuesta · `false` retiró la oposición · `null` nunca).
 *  · `comerciales` — el consentimiento `comercial` («me contactéis con una propuesta») sobre la versión vigente de su texto
 *    (`true` · `false` retirado · `null` nunca / otra versión).
 * Gana la más restrictiva: una oposición basta, incluso por encima de una petición anterior. `comercial === false` NO es
 * oposición a las señales: es «sin permiso» para contactar.
 */
export function permisoContacto(x: {
  peticionAbierta: boolean
  oposiciones: readonly (boolean | null)[]
  comerciales: readonly (boolean | null)[]
}): PermisoContacto {
  if (x.oposiciones.some((o) => o === true)) return 'opuesto'
  if (x.peticionAbierta) return 'pedido'
  if (x.comerciales.some((c) => c === true)) return 'consentido'
  return 'sin_permiso'
}

/**
 * Política de cálculo vigente: `interes_legitimo` (decisión de Alberto, 26/10/2026). Se calcula salvo oposición. La
 * variante «con consentimiento previo» se descartó; volver a ella exige otro texto de privacidad y otra casilla.
 */
export const POLITICA_CALCULO = 'interes_legitimo' as const

/**
 * ¿Se pueden calcular señales de esta ficha? Interruptor apagado → NUNCA. Encendido → SÍ salvo que alguna identidad que la
 * opera tenga la oposición VIGENTE (`true`). `null` (nunca se opuso) y `false` (retiró la oposición) no impiden. Sin
 * identidades (`[]`) se calcula: nadie se ha opuesto.
 */
export function puedeCalcularSenales(x: { interruptor: boolean; oposiciones: readonly (boolean | null)[] }): boolean {
  if (!x.interruptor) return false
  return !x.oposiciones.some((o) => o === true)
}

// ─── Retención ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Plazo de conservación de una señal (decisión de Alberto, 26/10/2026): 24 meses desde su CIERRE (descartada, promovida y
 * cerrada, resuelta, retirada: `cerradaEn`) o, si sigue viva, desde su última actualización (`ultimaVezEn`: el motor la
 * refresca cada día mientras la condición se da; si deja de refrescarse es que no hay actividad). Pasado el plazo, el
 * cron la BORRA. Es mayor que `DIAS_TRAS_DESCARTE`: borrar una descartada nunca la hace volver antes de los 180 días.
 */
export const MESES_RETENCION_SENALES = 24

/** Fecha de corte: lo anterior (estrictamente) a este día se purga. */
export function corteRetencionSenales(hoy: Fecha): Fecha {
  return sumarMeses(hoy, -MESES_RETENCION_SENALES)
}

/**
 * ¿Toca borrar esta señal? Cerrada → cuenta `cerradaEn`; viva → cuenta `ultimaVezEn`. Sin la fecha que toca (dato roto)
 * NO se borra (estado conservador: no se destruye lo que no se sabe fechar; se ve en la cola y se revisa).
 */
export function debePurgarseSenal(x: { cerradaEn: Fecha | null; ultimaVezEn: Fecha | null; hoy: Fecha }): boolean {
  const referencia = x.cerradaEn ?? x.ultimaVezEn
  if (referencia === null) return false
  return referencia < corteRetencionSenales(x.hoy)
}

// ─── Regla de los 180 días y reconciliación ────────────────────────────────────────────────────────────────────

export interface FilaSenalExistente {
  id: string
  clave: string
  estado: EstadoSenal
  /** `YYYY-MM-DD` del cierre; `null` si está viva. */
  cerradaEn: Fecha | null
}

/** Una señal descartada no vuelve hasta pasados `DIAS_TRAS_DESCARTE` días; las demás cerradas sí pueden volver. */
export function puedeRecrearseTrasCierre(x: { estado: EstadoSenal; cerradaEn: Fecha | null; hoy: Fecha }): boolean {
  if (x.estado !== 'descartada') return true
  // Descartada sin fecha de cierre: dato roto → no se recrea (estado conservador).
  if (x.cerradaEn === null) return false
  return diasEntre(x.cerradaEn, x.hoy) >= DIAS_TRAS_DESCARTE
}

export interface PlanSenales {
  insertar: SenalCalculada[]
  refrescar: { id: string; senal: SenalCalculada }[]
  /** La condición ya no se da. */
  resolver: string[]
  /** Se ha perdido el permiso (oposición, o la ficha ya no está viva): las abiertas se retiran. */
  retirar: string[]
}

/**
 * Qué hacer con las señales de UNA ficha. `existentes` trae las vivas y, de las cerradas, las que haya (se usa la MÁS
 * RECIENTE por clave). Sin permiso: no se inserta nada y las ABIERTAS se retiran. Las `promovida` nunca se tocan desde
 * aquí (ya hay una oportunidad; la cierra quien la trabaja).
 */
export function planificarSenales(x: {
  calculadas: readonly SenalCalculada[]
  existentes: readonly FilaSenalExistente[]
  permitido: boolean
  hoy: Fecha
}): PlanSenales {
  const plan: PlanSenales = { insertar: [], refrescar: [], resolver: [], retirar: [] }
  const vivas = new Map<string, FilaSenalExistente>()
  const cerradas = new Map<string, FilaSenalExistente>()
  for (const e of x.existentes) {
    if (ESTADOS_VIVOS.includes(e.estado)) vivas.set(e.clave, e)
    else {
      const previa = cerradas.get(e.clave)
      if (!previa || (e.cerradaEn ?? '') > (previa.cerradaEn ?? '')) cerradas.set(e.clave, e)
    }
  }

  if (!x.permitido) {
    for (const v of vivas.values()) if (v.estado === 'abierta') plan.retirar.push(v.id)
    return plan
  }

  const hay = new Set<string>()
  for (const s of x.calculadas) {
    if (hay.has(s.clave)) continue
    hay.add(s.clave)
    const viva = vivas.get(s.clave)
    if (viva) {
      plan.refrescar.push({ id: viva.id, senal: s })
      continue
    }
    const cerrada = cerradas.get(s.clave)
    if (cerrada && !puedeRecrearseTrasCierre({ estado: cerrada.estado, cerradaEn: cerrada.cerradaEn, hoy: x.hoy })) continue
    plan.insertar.push(s)
  }
  for (const v of vivas.values()) if (v.estado === 'abierta' && !hay.has(v.clave)) plan.resolver.push(v.id)
  return plan
}

/** Texto llano de cada tipo, para la cola de `/correduria`. Sin cifras del cliente. */
export const ROTULO_SENAL: Readonly<Record<TipoSenal, string>> = {
  inmueble_sin_seguro: 'Inmueble que el cliente dice que no tiene seguro',
  infraseguro: 'Capital asegurado por debajo del valor estimado',
  poliza_externa_por_vencer: 'Póliza con otra compañía que vence pronto',
  alquiler_sin_impago: 'Alquiler vivo sin seguro de impago',
  hipoteca_con_seguros: 'Tiene hipoteca: seguros del banco mejorables',
}
