/**
 * Interruptor de módulos por empresa (tabla `rrhh.empresa_modulos`, migración 0031). Reglas PURAS.
 * Tres estados honestos: fila → su valor · sin fila → «apagado» (es el defecto del módulo) · error al leer → «no se sabe».
 */
export type ModoModulo = 'reparto' | 'calculo'
export const MODULOS = ['nominas', 'contabilidad_nominas'] as const
export type Modulo = (typeof MODULOS)[number]

export interface FilaModulo {
  activo: boolean
  modo: string
  activado_por: string | null
  activado_at: Date | string | null
}

export type EstadoModulo =
  | { estado: 'activo'; modo: ModoModulo; activadoPor: string | null; activadoAt: string | null }
  | { estado: 'apagado' }
  | { estado: 'desconocido'; motivo: string }

export function estadoDeFila(fila: FilaModulo | null | undefined): EstadoModulo {
  if (!fila || !fila.activo) return { estado: 'apagado' }
  if (fila.modo !== 'reparto' && fila.modo !== 'calculo') return { estado: 'desconocido', motivo: `modo inesperado: ${fila.modo}` }
  const at = fila.activado_at == null ? null : new Date(fila.activado_at).toISOString()
  return { estado: 'activo', modo: fila.modo, activadoPor: fila.activado_por, activadoAt: at }
}

/** Modo del MOTOR para una empresa: solo 'calculo' si el módulo está activo en modo cálculo; si no, simulación (borrador). */
export function modoMotor(e: EstadoModulo): 'calculo' | 'simulacion' {
  return e.estado === 'activo' && e.modo === 'calculo' ? 'calculo' : 'simulacion'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type CambioModulo = {
  empresaId: string; modulo: Modulo; activo: boolean; modo: ModoModulo; activadoPor: string
  /** Solo `contabilidad_nominas` (N3): empresa de contabilidad que recibe los hechos de nómina. */
  contabilidadEmpresaId: string | null
}

/** Valida el cuerpo del PUT del operador. Todo explícito: sin modo por defecto, sin «quién» vacío. */
export function validarCambioModulo(b: unknown): { ok: true; cambio: CambioModulo } | { ok: false; error: string } {
  const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>
  const empresaId = typeof o.empresa_id === 'string' ? o.empresa_id.trim().toLowerCase() : ''
  if (!UUID.test(empresaId)) return { ok: false, error: 'empresa_id (uuid) obligatorio' }
  if (!MODULOS.includes(o.modulo as Modulo)) return { ok: false, error: `modulo debe ser uno de: ${MODULOS.join(', ')}` }
  if (typeof o.activo !== 'boolean') return { ok: false, error: 'activo (boolean) obligatorio' }
  if (o.modo !== 'reparto' && o.modo !== 'calculo') return { ok: false, error: "modo debe ser 'reparto' o 'calculo'" }
  const activadoPor = typeof o.activado_por === 'string' ? o.activado_por.trim().slice(0, 120) : ''
  if (!activadoPor) return { ok: false, error: 'activado_por obligatorio (quién lo activa)' }
  let contabilidadEmpresaId: string | null = null
  if (o.modulo === 'contabilidad_nominas') {
    contabilidadEmpresaId = typeof o.contabilidad_empresa_id === 'string' ? o.contabilidad_empresa_id.trim().toLowerCase() : ''
    if (o.activo && !UUID.test(contabilidadEmpresaId)) return { ok: false, error: 'contabilidad_empresa_id (uuid) obligatorio para activar contabilidad_nominas' }
    if (!UUID.test(contabilidadEmpresaId)) contabilidadEmpresaId = null
  }
  return { ok: true, cambio: { empresaId, modulo: o.modulo as Modulo, activo: o.activo, modo: o.modo, activadoPor, contabilidadEmpresaId } }
}
