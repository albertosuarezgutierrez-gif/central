// Acciones del operador sobre UNA cuenta de «Mi empresa» que plataforma reenvía al puerto de apps/empresa
// (`app/api/operador/cuentas/[id]/route.ts`, su `switch (b.accion)`). Lista cerrada: lo demás → 400 `accion_desconocida`.
// `rol_app` = rol ESPECÍFICO de un miembro en una herramienta (EmpresasClient lo envía desde el desplegable de cada miembro).
// Cepo: herramientas-acciones.test.ts (= lo que envía el cliente y = los `case` de la ruta de empresa).
export const ACCIONES_CUENTA = ['dueno', 'ref', 'acceso', 'quitar_acceso', 'rol_app', 'origen', 'previa', 'activar', 'reenviar', 'recordatorio', 'anular'] as const
export type AccionCuenta = (typeof ACCIONES_CUENTA)[number]
const SET = new Set<string>(ACCIONES_CUENTA)
export const esAccionCuenta = (v: unknown): v is AccionCuenta => typeof v === 'string' && SET.has(v)
