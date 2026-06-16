/** Autoriza el puerto de operador (god-panel → rrhh) por secreto compartido.
 *  Cerrado por defecto: si falta RRHH_OPERADOR_SECRET, no autoriza.
 *  Secreto PROPIO de iarrhh (no se reutiliza el OPERADOR_SHARED_SECRET de ia-rest). */
export function operadorAutorizado(req: Request): boolean {
  const secret = process.env.RRHH_OPERADOR_SECRET
  if (!secret) return false
  return (req.headers.get('authorization') || '') === `Bearer ${secret}`
}
