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

/**
 * Origen público (https://host) para armar enlaces que salen del taller. Primero la variable `TALLER_URL_PUBLICA`; si falta, el host de la
 * petición (solo https en producción). Sin ninguno válido → null (no se compone un enlace con un dominio inventado).
 */
export function origenPublico(env: Record<string, string | undefined>, host: string | null | undefined, proto: string | null | undefined): string | null {
  const fijo = env.TALLER_URL_PUBLICA?.trim()
  const candidato = fijo || (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `${proto === 'http' ? 'http' : 'https'}://${host}` : '')
  try {
    const u = new URL(candidato)
    const ok = u.protocol === 'https:' || (u.protocol === 'http:' && env.NODE_ENV !== 'production')
    return ok && !u.username && !u.password ? u.origin : null
  } catch {
    return null
  }
}
