// «Visible para el empleado» (migración 0029, `rrhh.documentos.visible_empleado`). Reglas PURAS, sin BD.
//   · Por defecto TRUE: todo lo anterior sigue viéndose igual.
//   · Un documento oculto no se lista, no se firma, no se avisa ni se cuenta para el empleado.
//   · Un documento con firma (pendiente/firmado) debe ser visible: si no, el empleado no podría firmarlo.
//   · Las nóminas se ven siempre.

/** Carpeta cuyos documentos el empleado ve SIEMPRE (no se pueden ocultar). */
export const CARPETA_SIEMPRE_VISIBLE = 'nominas'

/** Solo un `false` explícito (o '0'/'false' de un formulario) oculta; cualquier otra cosa = visible. */
export function normalizarVisible(v: unknown): boolean {
  if (v === false) return false
  if (typeof v === 'string') return !['0', 'false'].includes(v.trim().toLowerCase())
  return true
}

export function empleadoPuedeVerDocumento(d: { carpeta: string; visible_empleado?: boolean | null }): boolean {
  if (d.carpeta === CARPETA_SIEMPRE_VISIBLE) return true
  return d.visible_empleado !== false
}

/**
 * Devuelve el mensaje de error, o null si la combinación es válida.
 * `firma`: estado_firma de BD ('no_requiere'|'pendiente'|'pendiente_empresa'|'firmado') o modo de envío
 * ('none'|'solo_empleado'|'empresa_y_empleado'); 'no_requiere' y 'none' = sin firma.
 */
export function validarVisibilidad(p: { carpeta: string; visible: boolean; firma: string | null | undefined }): string | null {
  if (p.visible) return null
  if (p.carpeta === CARPETA_SIEMPRE_VISIBLE) return 'Las nóminas las ve siempre el empleado: no se pueden ocultar'
  if (p.firma && p.firma !== 'none' && p.firma !== 'no_requiere') {
    return 'Un documento con firma debe ser visible para el empleado (si no, no podría firmarlo)'
  }
  return null
}
