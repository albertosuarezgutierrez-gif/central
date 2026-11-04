import { autorizacionBearerValida } from '@central/core-identity'

/** Autoriza el puerto de operador (god-panel → rrhh) por secreto compartido.
 *  Cerrado por defecto: si falta RRHH_OPERADOR_SECRET, no autoriza.
 *  Secreto PROPIO de iarrhh (no se reutiliza el OPERADOR_SHARED_SECRET de ia-rest). */
export function operadorAutorizado(req: Request): boolean {
  return autorizacionBearerValida(req, 'RRHH_OPERADOR_SECRET')
}

/** Autoriza el puerto de FICHAJE del taller (apps/taller → rrhh). Secreto NUEVO y propio, distinto de
 *  `RRHH_OPERADOR_SECRET`: quien puede fichar desde el taller no puede dar de alta empresas ni leer personas.
 *  Cerrado por defecto: sin la env, no autoriza. */
export function fichajeTallerAutorizado(req: Request): boolean {
  return autorizacionBearerValida(req, 'RRHH_FICHAJE_TALLER_SECRET')
}
