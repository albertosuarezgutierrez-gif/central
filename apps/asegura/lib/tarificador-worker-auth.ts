import { requireSecret } from '@central/core-identity'
import { bearerAutorizado } from '@central/module-seguros-pii'

/**
 * Puerto del WORKER del tarificador RPA (máquina efímera de Fly → asegura). Secreto PROPIO
 * (`TARIFICADOR_WORKER_SECRET`), distinto del de operador: el worker no puede abrir la cartera, solo
 * pedir el riesgo de SU trabajo y devolver el resultado.
 *
 * Cerrado por defecto: sin la env no autoriza a nadie (tampoco en desarrollo: sin fallback).
 * Comparación en TIEMPO CONSTANTE (`bearerAutorizado`).
 */
export function workerAutorizado(req: Request): boolean {
  let secreto: string
  try {
    secreto = requireSecret('TARIFICADOR_WORKER_SECRET')
  } catch {
    console.error('[tarificador] TARIFICADOR_WORKER_SECRET no definido: se DENIEGA todo')
    return false
  }
  return bearerAutorizado(req.headers.get('authorization'), secreto)
}
