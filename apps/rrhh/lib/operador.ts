/** Autoriza el puerto de operador (god-panel → rrhh) por secreto compartido.
 *  Cerrado por defecto: si falta OPERADOR_SHARED_SECRET, no autoriza. */
export function operadorAutorizado(req: Request): boolean {
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!secret) return false
  return (req.headers.get('authorization') || '') === `Bearer ${secret}`
}
