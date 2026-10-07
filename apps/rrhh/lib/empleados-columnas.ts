// Lista BLANCA de columnas de rrhh.empleados que pueden viajar al navegador en el LISTADO
// del panel del responsable (GET /api/admin/empleados y la página /admin/empleados).
// Módulo PURO (sin prisma) para poder testearlo aislado.
//
// NUNCA añadir aquí `acceso_token` (con él se entra al portal como el empleado) ni `pin_hash`.
// El enlace de acceso se pide de uno en uno: POST /api/admin/empleados/[id]/enlace.

export const COLUMNAS_LISTADO_EMPLEADOS = [
  'id', 'nombre', 'apellidos', 'dni', 'nss', 'email', 'telefono', 'puesto', 'estado',
  'creada_at', 'fecha_reconocimiento_medico',
] as const

/** Columnas que jamás pueden salir en un listado ni en props hacia un Client Component. */
export const COLUMNAS_SECRETAS_EMPLEADOS = ['acceso_token', 'pin_hash'] as const

/** Fragmento SQL `col1, col2, …` (constantes de código, no entrada de usuario). */
export const SQL_COLUMNAS_LISTADO_EMPLEADOS = COLUMNAS_LISTADO_EMPLEADOS.join(', ')

/** Ruta relativa del portal del empleado para un token (el origin lo pone el cliente). */
export const rutaPortalEmpleado = (token: string) => `/e/${encodeURIComponent(token)}`
