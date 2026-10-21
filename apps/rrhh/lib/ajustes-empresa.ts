// Validación pura del PATCH de ajustes de empresa (sin BD, testeable).
export type ResultadoAjuste = { ok: true; valor: boolean } | { ok: false; error: string }

/** Solo un booleano estricto: "true", 1, null o un campo ausente son 400. */
export function validarPermiteFicharSinUbicacion(body: unknown): ResultadoAjuste {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Cuerpo no válido' }
  }
  const v = (body as Record<string, unknown>).permite_fichar_sin_ubicacion
  if (typeof v !== 'boolean') return { ok: false, error: 'permite_fichar_sin_ubicacion debe ser true o false' }
  return { ok: true, valor: v }
}
