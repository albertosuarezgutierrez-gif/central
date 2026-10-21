// Decisión PURA de los avisos al responsable por correo fallido (sin BD ni correo → testeable).
// Tabla: `rrhh.avisos_admin` (migración 0027). Aquí NO entra nunca el código ni la clave.

export type CanalEnvio = 'acceso' | 'notificacion' | 'firma'
export type MotivoFallo = 'sin_proveedor' | 'error_servidor'

/** Como mucho un aviso por empleado (y canal) cada 6 horas. */
export const VENTANA_DEDUPE_MS = 6 * 60 * 60 * 1000

/** Sin transporte (`createMailTransporter()` → null) = sin proveedor; si lo había y falló = error del servidor. */
export function motivoFallo(hayTransporte: boolean): MotivoFallo {
  return hayTransporte ? 'error_servidor' : 'sin_proveedor'
}

export function textoMotivo(m: MotivoFallo): string {
  return m === 'sin_proveedor' ? 'sin proveedor de correo' : 'error del servidor de correo'
}

/** ¿Hay que crear aviso? No si el último del mismo empleado y canal es de hace menos de 6 h. */
export function debeAvisar(ultimoAviso: Date | null | undefined, ahora: Date = new Date()): boolean {
  if (!ultimoAviso) return true
  const t = ultimoAviso.getTime()
  if (Number.isNaN(t)) return true
  return ahora.getTime() - t >= VENTANA_DEDUPE_MS
}

export type DatosAviso = { canal: CanalEnvio; motivo: MotivoFallo; nombre?: string | null; email?: string | null }

/** Texto del aviso. Solo nombre y email del empleado: ningún código, hash ni clave. */
export function textoAvisoEnvio(d: DatosAviso): string {
  const m = textoMotivo(d.motivo)
  const quien = `${d.nombre?.trim() || 'un empleado'}${d.email ? ` (${d.email})` : ''}`
  if (d.canal === 'acceso') {
    return `No se pudo enviar el código de acceso a ${quien}. Motivo: ${m}. Puedes darle acceso con «Nuevo enlace» en su ficha.`
  }
  if (d.canal === 'firma') {
    return `No se pudo enviar el código de firma a ${quien}. Motivo: ${m}. El empleado puede firmar igualmente desde su portal.`
  }
  return d.nombre || d.email
    ? `No se pudo enviar un correo de aviso a ${quien}. Motivo: ${m}.`
    : `No se pudo enviar un correo de aviso a los responsables de RR.HH. Motivo: ${m}.`
}
