// El aviso AUTOMÁTICO de la ITV del vehículo asegurado (21/10/2026): la parte PURA, sin BD.
//
// Reusa el cálculo de `itv.ts` (`proximaItv`/`perfilItvDeRamo`); aquí solo se decide CUÁNDO avisar, CON QUÉ
// palabras y a quién NO (si ya tiene un recordatorio propio de ITV para ese coche).
//
// 🚨 Lo que este aviso NO hace, a propósito:
//  · No afirma una fecha que no es firme. `proximaItv` distingue `primera` (la primera ITV del vehículo: tan
//    firme como su matriculación) de `ciclo_estimado` (suponemos que pasó las anteriores en su aniversario).
//    El segundo se dice «fecha estimada» y manda a mirar la pegatina; nunca «vence el X» a secas.
//  · No hay escalón «vencida». `proximaItv` avanza al ciclo siguiente en cuanto la fecha pasa (nadie sabe
//    cuándo pasó la última inspección), así que «tu ITV está vencida» sería inventarse una fecha ya cumplida y
//    acusar de circular sin ITV a quien quizá la pasó. Tras el día 0 el aviso calla hasta el siguiente ciclo.
//  · No inventa la matriculación. Solo cuenta la que da la compañía (EIAC) o la que la persona declaró; la
//    ESTIMADA a partir de la matrícula (puede bailar semanas) no dispara avisos: sin fecha de matriculación,
//    sin aviso.
import { perfilItvDeRamo, proximaItv, type FiabilidadItv, type PerfilItv } from './itv.ts'

/** Escalones del aviso: a 30 y 7 días y el mismo día. Dentro de cada tramo no se repite (va en la clave). */
export const UMBRALES_AVISO_ITV = [30, 7, 0] as const
export type UmbralItv = (typeof UMBRALES_AVISO_ITV)[number]

/** La ventana más ancha: el primer umbral. */
export const DIAS_VENTANA_AVISO_ITV = UMBRALES_AVISO_ITV[0]

/** Lo que hay que HACER, en una frase. */
export const TEXTO_QUE_HACER_ITV =
  'Pide cita en una estación ITV; circular sin ITV en vigor es sancionable y puede complicar un siniestro.'

/**
 * El tramo en el que está una ITV a la que le faltan `faltan` días: el MENOR umbral que aún no se ha pasado
 * (45 → null, 30 → 30, 8 → 30, 7 → 7, 1 → 7, 0 → 0). `null` fuera de ventana (más de 30 días, o ya pasó).
 */
export function umbralItv(faltan: number | null): UmbralItv | null {
  if (faltan === null || !Number.isInteger(faltan) || faltan < 0 || faltan > DIAS_VENTANA_AVISO_ITV) return null
  for (let i = UMBRALES_AVISO_ITV.length - 1; i >= 0; i--) {
    if (faltan <= UMBRALES_AVISO_ITV[i]!) return UMBRALES_AVISO_ITV[i]!
  }
  return null
}

/** Un vehículo asegurado con lo mínimo para calcularle la ITV. NO lleva ningún dato de más. */
export type VehiculoParaAviso = {
  /** `cartera:<id>` / `declarada:<id>`: estable (la `key` y el sello) y el mismo `valor` que usa el selector. */
  id: string
  /** Código de ramo de la BD (`'auto'`, `'moto'`…). Otro ramo no tiene ITV que calcular. */
  ramo: string | null
  matricula: string | null
  /** `cosa` del bien («Seat Ibiza · 1234BCD») o solo marca y modelo. `null` = no informada. */
  cosa: string | null
  /**
   * `YYYY-MM-DD` REAL: la que da la compañía o la que declaró la persona. `null` = no consta (nunca la
   * estimada por la matrícula).
   */
  fechaMatriculacion: string | null
}

/** Un recordatorio propio de la persona, lo mínimo para saber si ya cubre un vehículo. */
export type RecordatorioParaDedup = {
  tipo: string
  polizaId: string | null
  polizaDeclaradaId: string | null
  titulo: string
}

/** Mayúsculas y solo letras y dígitos: «1234 bcd» y «1234-BCD» son la misma matrícula. */
function claveMatricula(m: string | null | undefined): string | null {
  if (typeof m !== 'string') return null
  const limpia = m.toUpperCase().replace(/[^A-Z0-9]/g, '')
  // Menos de 4 caracteres no identifica un vehículo: es un resto de volcado (mismo criterio que `claveVehiculo`).
  return limpia.length >= 4 ? limpia : null
}

/**
 * La matrícula con lo justo para que su dueño la reconozca: los 4 primeros caracteres y «…» (`1234…`).
 * `null` si no hay matrícula usable.
 */
export function matriculaEnmascarada(m: string | null | undefined): string | null {
  const c = claveMatricula(m)
  return c === null ? null : `${c.slice(0, 4)}…`
}

/** Marca y modelo de `cosa` (quita «· matrícula» si va dentro). `null` si no queda nada. */
function modeloDe(v: Pick<VehiculoParaAviso, 'cosa' | 'matricula'>): string | null {
  if (typeof v.cosa !== 'string') return null
  const m = claveMatricula(v.matricula)
  const partes = v.cosa
    .split('·')
    .map((p) => p.trim())
    .filter((p) => p !== '' && (m === null || claveMatricula(p) !== m))
  const t = partes.join(' ').trim()
  return t === '' ? null : t
}

/** «tu vehículo Seat Ibiza (1234…)», «tu vehículo 1234…» o, sin nada que decir, «tu vehículo». */
export function nombreVehiculo(v: Pick<VehiculoParaAviso, 'cosa' | 'matricula'>): string {
  const modelo = modeloDe(v)
  const mask = matriculaEnmascarada(v.matricula)
  if (modelo !== null && mask !== null) return `tu vehículo ${modelo} (${mask})`
  if (modelo !== null) return `tu vehículo ${modelo}`
  if (mask !== null) return `tu vehículo ${mask}`
  return 'tu vehículo'
}

/**
 * ¿Ya tiene la persona un recordatorio propio de ITV para este vehículo? Entonces la campana ya le avisa por
 * ese (`obligacion_en_ventana`) y el automático NO se duplica. Casa por la póliza a la que cuelga o, si no
 * cuelga de ninguna, porque el título lleve la matrícula. Un recordatorio de ITV sin póliza ni matrícula no se
 * puede atribuir a ningún coche: no cubre a ninguno (mejor repetir un aviso que esconder uno).
 */
export function vehiculoCubiertoPorRecordatorio(
  v: Pick<VehiculoParaAviso, 'id' | 'matricula'>,
  recordatorios: readonly RecordatorioParaDedup[],
): boolean {
  const m = claveMatricula(v.matricula)
  for (const r of recordatorios) {
    if (r.tipo !== 'itv') continue
    if (r.polizaId !== null && v.id === `cartera:${r.polizaId}`) return true
    if (r.polizaDeclaradaId !== null && v.id === `declarada:${r.polizaDeclaradaId}`) return true
    if (m !== null && r.polizaId === null && r.polizaDeclaradaId === null) {
      const t = r.titulo.toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (t.includes(m)) return true
    }
  }
  return false
}

const MS_DIA = 86_400_000

function dmy(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

export type ItvParaAviso = {
  /** `YYYY-MM-DD`. */
  fecha: string
  fiabilidad: FiabilidadItv
  perfil: PerfilItv
  umbral: UmbralItv
}

/**
 * La ITV de un vehículo SI toca avisar hoy: tiene perfil (auto/moto), una matriculación real y la próxima
 * ITV cae en la ventana. `null` en cualquier otro caso (no se inventa nada).
 */
export function itvParaAviso(v: VehiculoParaAviso, hoy: Date): ItvParaAviso | null {
  const perfil = perfilItvDeRamo(v.ramo)
  if (perfil === null || v.fechaMatriculacion === null) return null
  const itv = proximaItv({ fechaMatriculacion: v.fechaMatriculacion, perfil, hoy })
  if (itv === null) return null
  const hoyDia = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  const faltan = Math.round((new Date(`${itv.fecha}T00:00:00Z`).getTime() - hoyDia) / MS_DIA)
  const umbral = umbralItv(faltan)
  if (umbral === null) return null
  return { fecha: itv.fecha, fiabilidad: itv.fiabilidad, perfil, umbral }
}

/** Título y detalle del aviso. La fecha se dice como fecha firme SOLO si lo es. */
export function textoAvisoItv(v: Pick<VehiculoParaAviso, 'cosa' | 'matricula'>, itv: ItvParaAviso): { titulo: string; detalle: string } {
  const que = `La ITV de ${nombreVehiculo(v)}`
  const estimada = itv.fiabilidad === 'ciclo_estimado'
  const cuando = itv.umbral === 0 ? 'vence hoy' : 'vence pronto'
  const titulo = `${que} ${cuando}${estimada ? ' (fecha estimada)' : ''}`
  const furgoneta = itv.perfil === 'turismo' ? ' Si es una furgoneta o un vehículo de trabajo, su calendario es otro.' : ''
  const fecha = estimada
    ? `Fecha estimada: ${dmy(itv.fecha)}, suponiendo que pasaste las anteriores en su fecha. Mira la pegatina de tu última ITV para saber la tuya.`
    : itv.umbral === 0
      ? `Vence hoy (${dmy(itv.fecha)}).`
      : `Vence el ${dmy(itv.fecha)}.`
  return { titulo, detalle: `${fecha} ${TEXTO_QUE_HACER_ITV}${furgoneta}` }
}
