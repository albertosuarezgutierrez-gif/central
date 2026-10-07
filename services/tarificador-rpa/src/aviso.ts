// Texto del aviso de verificación humana (módulo hoja: lo importan errores.ts y verificacion.ts sin ciclo).

/** «allianz» → «Allianz». */
export function nombreCompania(clave: string): string {
  const s = clave.trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'El portal'
}

/** El aviso a Alberto. Sin datos del riesgo ni del portal: solo la compañía. */
export function textoAvisoVerificacion(compania: string): string {
  return `${nombreCompania(compania)} pide verificación: entra en su portal, valida y pulsa Reintentar`
}
