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

/** Relevo del código SMS por Telegram (19/10/2026): por qué no se pudo verificar. Sin el código ni datos del riesgo. */
export function textoAvisoCodigoSms(compania: string, motivo: 'sin_respuesta' | 'canal_no_disponible' | 'rechazado' | 'sello_invalido' | 'fin'): string {
  const c = nombreCompania(compania)
  if (motivo === 'sin_respuesta') return `${c} pidió el código SMS y no llegó por Telegram a tiempo (5 min): pulsa Reintentar y contesta al aviso con el código`
  if (motivo === 'rechazado') return `${c} no aceptó el código SMS: pulsa Reintentar y contesta con el código nuevo`
  if (motivo === 'canal_no_disponible') return `${c} pide el código SMS y no se ha podido pedir por Telegram: pulsa Reintentar (o entra en su portal y valida)`
  return `${c} pide el código SMS y el relevo por Telegram no ha terminado bien: pulsa Reintentar`
}
