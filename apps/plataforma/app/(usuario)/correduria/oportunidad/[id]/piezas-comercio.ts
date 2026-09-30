/**
 * Piezas PURAS del formulario «Datos del comercio» (30/09/2026): las dos listas (capitales y medidas de
 * protección) viven en el formulario como FILAS de texto y de ahí van al PATCH como lista entera. Aquí, la
 * conversión filas ↔ lista y el «¿ha cambiado algo?» que decide qué se manda (nunca el formulario entero:
 * una lista sin tocar no se reenvía, y así no pisa una escritura concurrente).
 */
import { numeroDesdeTexto, type CapitalComercio, type MedidaComercio } from '@central/module-seguros'

export type FilaCapital = { bien: string; importe: string; modalidad: string; descripcion: string }
export type FilaMedida = { medida: string; valor: string }

export const filaCapitalVacia = (): FilaCapital => ({ bien: '', importe: '', modalidad: '', descripcion: '' })
export const filaMedidaVacia = (): FilaMedida => ({ medida: '', valor: '' })

/** Lo guardado como filas de formulario: `null` (sin mirar) y `[]` (revisado, vacío) son las dos «sin filas». */
export function filasDeCapitales(c: readonly CapitalComercio[] | null | undefined): FilaCapital[] {
  return (c ?? []).map((x) => ({ bien: x.bien, importe: String(x.importe), modalidad: x.modalidad ?? '', descripcion: x.descripcion ?? '' }))
}
export function filasDeMedidas(m: readonly MedidaComercio[] | null | undefined): FilaMedida[] {
  return (m ?? []).map((x) => ({ medida: x.medida, valor: x.valor ?? '' }))
}

const t = (s: string) => s.replace(/\s+/g, ' ').trim()
const vacia = (f: FilaCapital) => t(f.importe) === '' && t(f.descripcion) === '' && t(f.modalidad) === ''

/** Filas con algo escrito, tal como las entiende el servidor (el importe, ya como número si se puede leer). */
export function capitalesDeFilas(filas: readonly FilaCapital[]): Array<Record<string, unknown>> {
  return filas
    .filter((f) => !(f.bien === '' && vacia(f)))
    .map((f) => {
      const n = numeroDesdeTexto(f.importe)
      return { bien: f.bien, importe: t(f.importe) === '' ? null : Number.isFinite(n) ? n : f.importe, modalidad: t(f.modalidad) || null, descripcion: t(f.descripcion) || null }
    })
}
export function medidasDeFilas(filas: readonly FilaMedida[]): Array<Record<string, unknown>> {
  return filas.filter((f) => !(t(f.medida) === '' && t(f.valor) === '')).map((f) => ({ medida: t(f.medida) || null, valor: t(f.valor) || null }))
}

/**
 * ¿Hay que mandar la lista? `undefined` = no (mismo contenido: no se toca). Sin filas sobre un `null` guardado
 * tampoco es un cambio (no se inventa un «revisado, vacío»); sin filas sobre una lista con datos sí: es un borrado.
 */
export function listaAMandar<T>(guardado: readonly T[] | null, enviar: Array<Record<string, unknown>>): Array<Record<string, unknown>> | undefined {
  if (enviar.length === 0) return guardado === null || guardado.length === 0 ? undefined : []
  return JSON.stringify(enviar) === JSON.stringify(guardado) ? undefined : enviar
}
