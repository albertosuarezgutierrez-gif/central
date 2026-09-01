/** Puerto de operador (plataforma → asegura) por secreto compartido.
 *  Cerrado por defecto: si falta ASEGURA_OPERADOR_SECRET, no autoriza nada.
 *  Secreto PROPIO de asegura (mismo patrón que RRHH_OPERADOR_SECRET en iarrhh). */
export function operadorAutorizado(req: Request): boolean {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return false
  return (req.headers.get('authorization') || '') === `Bearer ${secret}`
}
