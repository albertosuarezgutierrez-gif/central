// Sustitución AUTOMÁTICA de una póliza por otra: el cliente se cambia de compañía (o renueva con
// número nuevo) y la póliza nueva entra por CIMA sin que nadie la enlace con la vieja.
//
// Caso fundacional (23/09/2026): José Suárez pasó su Hyundai Kona 9833LJC de Mapfre a Reale y el
// portal le enseñaba DOS seguros «En vigor» del mismo coche. La Reale no salió de un presupuesto
// emitido por Codeoscopic (que ya enlaza solo, `lib/emision.ts` de asegura), así que nada decía que
// una sustituía a la otra. Dictado de Alberto: «tiene que ser automático… tienes información de
// todo en cada momento».
//
// Solo se enlaza cuando la prueba es DETERMINISTA — mismo cliente, mismo ramo y el MISMO riesgo — y
// la nueva empieza cerca del aniversario de la vieja. Qué es «el mismo riesgo» depende del ramo
// (Alberto, 23/09/2026: «motor tiene matrícula, inmueble… dirección (referencia catastral), vida…
// DNI»): matrícula en motor; referencia catastral —o, sin ella, la dirección DESCIFRADA + CP— en
// inmuebles; el DNI (índice ciego) del asegurado en los ramos de personas. Sin ese dato no hay
// prueba y no se enlaza: RC, comercio sin dirección… (medido: CIMA no manda nada del riesgo en ellos).
// Si una vieja casa con dos nuevas (o una nueva con dos viejas) no se enlaza ninguna: elegir por el
// orden de la consulta enlazaría el coche equivocado, y ese error no deja hueco visible.
//
// La misma clave destapa la DUPLICIDAD: dos pólizas vigentes del mismo riesgo que se solapan y no
// se suceden (el cliente paga dos veces lo mismo, o una entró dos veces con números distintos).

import { formatoMatricula, normalizarMatricula } from './matricula.ts'
import { normalizarNumeroPoliza } from './duplicados.ts'
import { normalizarDireccion } from './busqueda.ts'

/** Días antes del vencimiento de la vieja en los que la nueva puede empezar (cambio anticipado). */
export const SUSTITUCION_DIAS_ANTES = 60
/** Días después del vencimiento de la vieja en los que aún se considera continuación. */
export const SUSTITUCION_DIAS_DESPUES = 30

export type PolizaParaSustitucion = {
  id: string
  clienteId: string
  /** `tipo` de la póliza (`auto`, `moto`…). */
  ramo: string
  numeroPoliza: string | null
  /** `YYYY-MM-DD`. `null` = no se sabe → no se enlaza. */
  fechaInicio: string | null
  fechaVencimiento: string | null
  /** `datos_especificos.matricula` tal cual (motor). `null`/vacía = sin prueba → no se enlaza. */
  matricula: string | null
  /** Referencia catastral del inmueble, si la hay. */
  refCatastral?: string | null
  /** Dirección del riesgo YA DESCIFRADA (inmuebles). Un valor que sigue cifrado (`v1:`) no cuenta. */
  direccion?: string | null
  cp?: string | null
  /** Índice ciego del DNI del asegurado (ramos de personas). */
  nifAsegurado?: string | null
  /** La nueva tiene que seguir en vigor: una que el cliente ya anuló no sustituye a nada. */
  vigente: boolean
  /** Ya marcada como sustituida (por emisión o por una pasada anterior). */
  sustituida: boolean
  /** Ya tiene `poliza_origen_id`: ya sabe a quién sustituye. */
  conOrigen: boolean
  /** `poliza_padre_id`: la renovación ya encadenada no es una sustitución. */
  padreId?: string | null
}

/** Cómo se sabe que es el mismo riesgo. `valor` solo lleva la matrícula (dato del contrato); una
 *  dirección o un DNI no se repiten fuera de aquí. */
export type RiesgoComun = { tipo: 'matricula' | 'catastro' | 'direccion' | 'asegurado'; valor: string | null }

export type SustitucionDetectada = { viejaId: string; nuevaId: string; riesgo: RiesgoComun }
export type DuplicidadDetectada = { aId: string; bId: string; riesgo: RiesgoComun }

export type ResultadoSustituciones = {
  enlaces: SustitucionDetectada[]
  /** Parejas que casaban pero no de forma única: no se enlazan y se cuentan. */
  ambiguas: number
  /** Dos vigentes del mismo riesgo que se solapan sin sucederse. No se toca nada: se avisa. */
  duplicidades: DuplicidadDetectada[]
}

const MOTOR = new Set(['auto', 'moto'])
const INMUEBLE = new Set(['hogar', 'comercio', 'comunidades', 'pyme', 'oficina'])
const PERSONAS = new Set(['vida', 'salud', 'decesos', 'accidentes'])

/** La clave del riesgo según el ramo, o `null` si no hay prueba. */
export function claveRiesgo(p: PolizaParaSustitucion): { clave: string; riesgo: RiesgoComun } | null {
  if (MOTOR.has(p.ramo)) {
    const m = normalizarMatricula(p.matricula ?? '')
    // Solo una matrícula con formato real prueba algo («PENDIENTE», «SIN», un bastidor no).
    return formatoMatricula(m) !== 'desconocido' ? { clave: `mat:${m}`, riesgo: { tipo: 'matricula', valor: m } } : null
  }
  if (INMUEBLE.has(p.ramo)) {
    const rc = (p.refCatastral ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    // 20 caracteres = un inmueble; 14 = la PARCELA entera (todo el edificio): no distingue pisos.
    if (rc.length === 20) return { clave: `cat:${rc}`, riesgo: { tipo: 'catastro', valor: null } }
    const d = p.direccion ?? ''
    const cp = (p.cp ?? '').replace(/\D/g, '')
    if (d.startsWith('v1:') || cp.length !== 5) return null
    const n = normalizarDireccion(d)
    // Sin número no es una dirección de un inmueble concreto (una calle entera no prueba nada).
    return n.length >= 8 && /\d/.test(n) ? { clave: `dir:${cp}|${n}`, riesgo: { tipo: 'direccion', valor: null } } : null
  }
  if (PERSONAS.has(p.ramo)) {
    const h = (p.nifAsegurado ?? '').trim()
    return h.length >= 16 ? { clave: `nif:${h}`, riesgo: { tipo: 'asegurado', valor: null } } : null
  }
  return null
}

function dias(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5)
}

function menosUnAnio(fecha: string): string {
  const [a, m, d] = fecha.split('-')
  const anio = Number(a) - 1
  // 29/02 de un año sin bisiesto → 28/02.
  const ultimo = new Date(Date.UTC(anio, Number(m), 0)).getUTCDate()
  return `${anio}-${m}-${String(Math.min(Number(d), ultimo)).padStart(2, '0')}`
}

/**
 * Distancia (en días) del inicio de la nueva al aniversario de la vieja más cercano. Se mira también
 * el ANTERIOR al vencimiento: si el cliente no avisó a tiempo, CIMA ya trae la vieja renovada (su
 * vencimiento salta un año) cuando la nueva entra. Medido el 23/09/2026: Occident renovada hasta
 * 09/09/2027 y la Allianz del mismo coche con efecto 17/09/2026.
 */
function distanciaAniversario(inicioVieja: string, vencimiento: string, inicioNueva: string): number {
  const a = dias(vencimiento, inicioNueva)
  const anterior = menosUnAnio(vencimiento)
  // El aniversario anterior solo cuenta si la vieja ya estaba viva entonces (se RENOVÓ ahí). Si es
  // su propio efecto, dos pólizas que empiezan con un día de diferencia se «sustituirían» entre sí.
  if (anterior <= inicioVieja) return a
  const b = dias(anterior, inicioNueva)
  return Math.abs(a) <= Math.abs(b) ? a : b
}

/**
 * Parejas vieja → nueva que se pueden enlazar solas. Ninguna escritura: quien llama marca la vieja
 * `sustituida_at` y la nueva `poliza_origen_id`.
 */
export function detectarSustituciones(polizas: readonly PolizaParaSustitucion[]): ResultadoSustituciones {
  const porBien = new Map<string, { riesgo: RiesgoComun; grupo: PolizaParaSustitucion[] }>()
  for (const p of polizas) {
    const r = claveRiesgo(p)
    if (r === null || p.fechaInicio === null) continue
    const k = `${p.clienteId}|${p.ramo}|${r.clave}`
    const g = porBien.get(k) ?? { riesgo: r.riesgo, grupo: [] }
    g.grupo.push(p)
    porBien.set(k, g)
  }

  const candidatas: SustitucionDetectada[] = []
  const duplicidades: DuplicidadDetectada[] = []
  for (const { riesgo, grupo } of porBien.values()) {
    if (grupo.length < 2) continue
    for (const vieja of grupo) {
      if (vieja.sustituida || vieja.fechaVencimiento === null) continue
      for (const nueva of grupo) {
        if (nueva.id === vieja.id || !nueva.vigente || nueva.conOrigen || nueva.fechaInicio === null) continue
        if (nueva.padreId === vieja.id) continue
        // La misma póliza escrita dos veces (volcado + CIMA, ceros a la izquierda) NO es una sustitución.
        const nv = normalizarNumeroPoliza(vieja.numeroPoliza)
        if (nv !== null && nv === normalizarNumeroPoliza(nueva.numeroPoliza)) continue
        if (nueva.fechaInicio <= vieja.fechaInicio!) continue
        const d = distanciaAniversario(vieja.fechaInicio!, vieja.fechaVencimiento, nueva.fechaInicio)
        if (d < -SUSTITUCION_DIAS_ANTES || d > SUSTITUCION_DIAS_DESPUES) {
          // No se suceden: si las dos siguen vigentes y se pisan, es una duplicidad.
          if (vieja.vigente && nueva.fechaInicio < vieja.fechaVencimiento) duplicidades.push({ aId: vieja.id, bId: nueva.id, riesgo })
          continue
        }
        candidatas.push({ viejaId: vieja.id, nuevaId: nueva.id, riesgo })
      }
    }
  }

  const cuentaVieja = new Map<string, number>()
  const cuentaNueva = new Map<string, number>()
  for (const c of candidatas) {
    cuentaVieja.set(c.viejaId, (cuentaVieja.get(c.viejaId) ?? 0) + 1)
    cuentaNueva.set(c.nuevaId, (cuentaNueva.get(c.nuevaId) ?? 0) + 1)
  }
  const enlaces = candidatas.filter((c) => cuentaVieja.get(c.viejaId) === 1 && cuentaNueva.get(c.nuevaId) === 1)
  return { enlaces, ambiguas: candidatas.length - enlaces.length, duplicidades }
}

/**
 * Lo que ve el cliente, POR LECTOR (ya filtrado por lo que ese lector puede ver): qué vieja se retira
 * de la LISTA porque su sustituta ocupa su sitio. Solo se retira si la nueva está en la misma lista,
 * ya ha EMPEZADO y está vigente, y la vieja no tiene nada pendiente (un siniestro abierto, un recibo
 * devuelto): hasta entonces las dos se enseñan. Esconder de la lista no quita el acceso — la ficha,
 * los partes y los recibos de la vieja siguen siendo suyos. Devuelve `viejaId → nuevaId`.
 */
export function sustituidasARetirar(
  polizas: readonly { id: string; sustituyeAId: string | null; fechaInicio: Date | null; vigente: boolean; conPendientes: boolean }[],
  hoy: Date,
): Map<string, string> {
  const porId = new Map(polizas.map((p) => [p.id, p]))
  const retirar = new Map<string, string>()
  for (const n of polizas) {
    const v = n.sustituyeAId === null ? undefined : porId.get(n.sustituyeAId)
    if (v === undefined || !n.vigente || n.fechaInicio === null || n.fechaInicio > hoy || v.conPendientes) continue
    retirar.set(v.id, n.id)
  }
  return retirar
}

/**
 * La anulación de la VIEJA cuando la sustituta ya está emitida y nadie la ha pedido (la nueva se
 * emitió fuera de nuestro presupuesto: en la web de la compañía o de Codeoscopic). Nace `solicitada`
 * y la FIRMA el cliente en su portal; el correo a la compañía sale después por la cola, como siempre.
 *
 * Efecto: el vencimiento si la nueva empieza como mucho 30 días antes (es un cambio a vencimiento, lo
 * más fácil de aceptar para la compañía); si no —la vieja ya se renovó sola—, el día que empieza la
 * nueva. `null` = no hay con qué (sin fechas): se deja al corredor.
 */
export function solicitudPorSustitucion(
  s: { vencimiento: string | null; inicioNueva: string | null; mismaCompania: boolean },
  hoy: string,
): { tipo: 'sustitucion'; solicitadaPor: 'cliente'; motivo: 'competidor' | 'otro'; motivoTexto: string | null; fechaEfecto: string } | null {
  if (s.inicioNueva === null) return null
  const aVencimiento = s.vencimiento !== null && s.vencimiento >= hoy && dias(s.inicioNueva, s.vencimiento) <= 30
  const fechaEfecto = aVencimiento ? s.vencimiento! : s.inicioNueva
  return {
    tipo: 'sustitucion',
    solicitadaPor: 'cliente',
    motivo: s.mismaCompania ? 'otro' : 'competidor',
    motivoTexto: s.mismaCompania ? 'Sustituida por otra póliza de la misma compañía.' : null,
    fechaEfecto,
  }
}
