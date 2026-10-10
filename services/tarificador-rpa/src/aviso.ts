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

/**
 * Portal de sesión MANUAL (SMS en el acceso, p. ej. Generali): no hay sesión guardada, caducó o el portal la rechazó.
 * El robot no entra por su cuenta (eso pediría otro SMS): Alberto tiene que volver a iniciarla a mano.
 */
export function textoAvisoSesionManual(compania: string): string {
  return `${nombreCompania(compania)}: la sesión del robot no existe o ha caducado; hay que iniciarla de nuevo a mano (con su SMS) y pulsar Reintentar`
}
