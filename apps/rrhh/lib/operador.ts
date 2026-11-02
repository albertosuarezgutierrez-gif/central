import { autorizacionBearerValida } from '@central/core-identity'

/** Autoriza el puerto de operador (god-panel → rrhh) por secreto compartido.
 *  Cerrado por defecto: si falta RRHH_OPERADOR_SECRET, no autoriza.
 *  Secreto PROPIO de iarrhh (no se reutiliza el OPERADOR_SHARED_SECRET de ia-rest). */
export function operadorAutorizado(req: Request): boolean {
  return autorizacionBearerValida(req, 'RRHH_OPERADOR_SECRET')
}
