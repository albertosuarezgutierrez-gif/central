// ────────────────────────────────────────────────────────────────────────────
// Aviso de OPORTUNIDADES a 45 días de su vencimiento (regla única, 29/09/2026).
//
// Toda oportunidad —un seguro que no está con nosotros y cuyo vencimiento conocemos, venga de donde
// venga— pasa a Alberto `DIAS_AVISO_OPORTUNIDAD` días antes de vencer; antes de eso no se contacta a
// nadie. asegura dice cuáles están en ventana (`/api/operador/oportunidades-aviso`); aquí se decide
// qué mandar y la idempotencia: una vez por oportunidad y ciclo (clave `id|vence`, hito
// `oportunidad_45` en `correduria_avisos_renovacion`). Todo PURO: sin BD, sin red.
// ────────────────────────────────────────────────────────────────────────────
import { claveAvisoOportunidad, DIAS_AVISO_OPORTUNIDAD, DIAS_PREAVISO_TOMADOR } from '@central/module-seguros'
import { rotuloRamo } from '../seguimiento-asegura.ts'

/** Hito con el que se marca en `correduria_avisos_renovacion` (la PK es id + vencimiento + hito). */
export const HITO_OPORTUNIDAD = 'oportunidad_45'

export type OportunidadEnAviso = {
  id: string
  cliente: string
  ramo: string | null
  aseguradora: string | null
  vence: string
  dias: number
  fueCliente: boolean
}

export type LecturaOportunidadesAviso =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }
  /** `sinVencimiento`: abiertas sin fecha (no se avisan). `null`/ausente = no se sabe (asegura viejo o recuento fallido), nunca 0. */
  | { estado: 'ok'; oportunidades: OportunidadEnAviso[]; truncado: boolean; sinVencimiento?: number | null }

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export function interpretarOportunidadesAviso(status: number, json: unknown): LecturaOportunidadesAviso {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: status === 200 ? 'respuesta_ilegible' : 'asegura_error' }
  }
  const o = json as Record<string, unknown>
  if (o.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (o.estado !== 'ok' || !Array.isArray(o.oportunidades)) return { estado: 'error', motivo: 'asegura_error' }
  const oportunidades = o.oportunidades.flatMap((f): OportunidadEnAviso[] => {
    if (typeof f !== 'object' || f === null) return []
    const x = f as Record<string, unknown>
    const id = txt(x.id)
    const vence = txt(x.vence)
    if (!id || !vence || !/^\d{4}-\d{2}-\d{2}$/.test(vence) || typeof x.dias !== 'number') return []
    return [{
      id, vence, dias: x.dias,
      cliente: txt(x.cliente) ?? '(sin nombre)',
      ramo: txt(x.ramo), aseguradora: txt(x.aseguradora),
      fueCliente: x.fueCliente === true,
    }]
  })
  const sin = o.sinVencimiento
  const sinVencimiento = typeof sin === 'number' && Number.isInteger(sin) && sin >= 0 ? sin : null
  return { estado: 'ok', oportunidades, truncado: o.truncado === true, sinVencimiento }
}

/** Las que aún no se han avisado en este ciclo. `yaAvisadas` = claves `id|vence`. */
export function oportunidadesPorAvisar(
  ops: readonly OportunidadEnAviso[],
  yaAvisadas: ReadonlySet<string>,
): OportunidadEnAviso[] {
  return ops.filter((o) => !yaAvisadas.has(claveAvisoOportunidad(o.id, o.vence)))
}

/** Un nombre con `*` o `_` no puede romper el Markdown del aviso (mismo criterio que `llamadas-hoy.ts`). */
const plano = (s: string) => s.replace(/[*_`[\]]/g, ' ').replace(/\s+/g, ' ').trim()

function fechaEs(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/**
 * Qué nombres van arriba. Primero las que aún llegan al preaviso de un mes del tomador (LCS art. 22), las
 * que antes lo pierden delante; detrás, las que ya no llegan este año. No se quita ninguna: con cientos
 * del volcado antiguo entrando a la vez, lo que cambia es que los nombres a la vista sean los que todavía
 * pueden cambiarse de compañía.
 */
export function ordenAviso(ops: readonly OportunidadEnAviso[]): { aTiempo: OportunidadEnAviso[]; tarde: OportunidadEnAviso[] } {
  const porDias = [...ops].sort((a, b) => a.dias - b.dias)
  return {
    aTiempo: porDias.filter((o) => o.dias >= DIAS_PREAVISO_TOMADOR),
    tarde: porDias.filter((o) => o.dias < DIAS_PREAVISO_TOMADOR),
  }
}

/** Las oportunidades abiertas sin vencimiento no entran en el aviso de 45 días: se dice cuántas hay. */
export function textoSinVencimiento(n: number): string {
  return `📭 ${n} oportunidad${n === 1 ? '' : 'es'} abierta${n === 1 ? '' : 's'} con vencimiento desconocido: no se avisa${n === 1 ? '' : 'n'} hasta que alguien lo pida al cliente.`
}

/**
 * El bloque del mensaje diario. `null` = nada nuevo que avisar. Si asegura no se pudo leer, se DICE
 * (una lista vacía no autoriza a callar un fallo).
 */
export function bloqueOportunidades(l: LecturaOportunidadesAviso, nuevas: readonly OportunidadEnAviso[]): string | null {
  if (l.estado === 'sin_configurar') return null
  if (l.estado === 'error') {
    return `🎯 *Oportunidades a ${DIAS_AVISO_OPORTUNIDAD} días*\nNo he podido leerlas (${l.motivo}). ` +
      'Esto NO significa que no haya ninguna: hoy no se ha podido mirar.'
  }
  if (nuevas.length === 0 && !l.truncado) return null
  const { aTiempo, tarde } = ordenAviso(nuevas)
  const partes = [`🎯 *Oportunidades a ${DIAS_AVISO_OPORTUNIDAD} días de su vencimiento* — toca llamar:`]
  if (tarde.length) {
    partes.push(`${aTiempo.length} aún a tiempo de dar la baja a su compañía (preaviso de un mes); ` +
      `${tarde.length} con el plazo de baja ya pasado: la llamada es para el próximo vencimiento.`)
  }
  const orden = [...aTiempo, ...tarde]
  for (const o of orden.slice(0, 25)) {
    const compania = o.aseguradora ? plano(o.aseguradora) : 'compañía no consta'
    const propio = o.fueCliente ? ' · cliente propio: llamar, sin mandar precio antes' : ''
    const plazo = o.dias < DIAS_PREAVISO_TOMADOR ? ' · plazo de baja pasado' : ''
    partes.push(`• ${plano(o.cliente)} — ${rotuloRamo(o.ramo)} en ${compania}, vence el ${fechaEs(o.vence)} (${o.dias} d)${plazo}${propio}`)
  }
  if (orden.length > 25) partes.push(`…y ${orden.length - 25} más en /correduria/vencimientos.`)
  if (l.truncado) partes.push('⚠️ La lectura llegó al tope de filas: puede haber más que no salen aquí.')
  // Las que no tienen fecha no se avisan: se dice (no se callan), solo cuando ya hay mensaje que mandar.
  if (typeof l.sinVencimiento === 'number' && l.sinVencimiento > 0) partes.push(textoSinVencimiento(l.sinVencimiento))
  return partes.join('\n')
}
