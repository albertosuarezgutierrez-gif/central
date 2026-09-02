// Por qué NO se ha podido leer la cartera — módulo PURO (sin Prisma ni red), para
// que se pueda probar sin generar el cliente ni tocar la BD.
//
// 🚨 Existe porque un `estado: 'error'` pelado es un callejón sin salida: dice que
// falló, no dónde. Un fallo de conexión, un schema equivocado, un permiso que falta
// y una fila que no está se arreglan en CUATRO sitios distintos.

export type MotivoErrorCartera =
  | 'bd'              // la consulta llegó a Postgres y la rechazó (schema, permisos, tabla, conexión)
  | 'sin_correduria'  // la BD responde pero no hay fila en `corredurias`
  | 'desconocido'

/**
 * Pista CORTA y sin secretos sobre el fallo real: fuente + nombre del error +
 * código de Prisma + la tabla/columna que Prisma no encontró. Con un
 * `central/PrismaClientKnownRequestError/P2021/public.corredurias` se sabe en un
 * vistazo que se está mirando el schema equivocado.
 *
 * 🚨 NUNCA el `message` crudo: `PrismaClientInitializationError` lo trae con la
 * cadena de conexión dentro (usuario y contraseña), y esto acaba en un Telegram.
 */
export function detalleError(e: unknown, fuente: string): string {
  const err = e as { name?: unknown; code?: unknown; meta?: { table?: unknown; column?: unknown } }
  const partes = [fuente, typeof err?.name === 'string' && err.name ? err.name : 'Error']
  if (typeof err?.code === 'string' && err.code) partes.push(err.code)
  const donde = err?.meta?.table ?? err?.meta?.column
  if (typeof donde === 'string' && donde) partes.push(donde)
  return partes.join('/')
}
