// Enlaces externos del menú. Sin fallback a un dominio literal: si la variable falta o no es https, el botón NO se muestra.
/** URL del Portal del Empleado (nóminas) o null. Solo https (y sin credenciales incrustadas). */
export function urlPortalEmpleado(env: Record<string, string | undefined> = process.env): string | null {
  const v = env.RRHH_PORTAL_URL?.trim()
  if (!v) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null
  } catch {
    return null
  }
}
