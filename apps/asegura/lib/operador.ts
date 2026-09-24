import { bearerAutorizado } from '@central/module-seguros-pii'

/** Puerto de operador (plataforma → asegura) por secreto compartido.
 *  Cerrado por defecto: si falta ASEGURA_OPERADOR_SECRET, no autoriza nada.
 *  Secreto PROPIO de asegura (mismo patrón que RRHH_OPERADOR_SECRET en iarrhh).
 *
 *  🚨 La comparación es en TIEMPO CONSTANTE (`bearerAutorizado`), no `===`: un
 *  `===` corta en el primer carácter distinto y el tiempo de respuesta filtra
 *  cuánto prefijo ha acertado quien prueba. Detrás de este puerto está la
 *  cartera entera. */
export function operadorAutorizado(req: Request): boolean {
  return bearerAutorizado(req.headers.get('authorization'), process.env.ASEGURA_OPERADOR_SECRET)
}
