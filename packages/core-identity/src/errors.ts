/**
 * Errores de identidad con código HTTP asociado. Las rutas de cada app pueden
 * mapear `error.status` directamente a la respuesta (401/403) sin acoplarse al
 * framework concreto.
 */

/** El llamante no está autenticado (sin sesión válida). HTTP 401. */
export class UnauthenticatedError extends Error {
  readonly status = 401
  constructor(message = 'No autenticado') {
    super(message)
    this.name = 'UnauthenticatedError'
  }
}

/** Autenticado pero sin permiso para esta acción o recurso. HTTP 403. */
export class ForbiddenError extends Error {
  readonly status = 403
  constructor(message = 'Sin permiso') {
    super(message)
    this.name = 'ForbiddenError'
  }
}
