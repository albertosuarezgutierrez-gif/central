/**
 * Entrada desde el Portal del Empleado (apps/rrhh): `/?email=<correo>&origen=rrhh`.
 *
 * Solo PRERRELLENA y rotula. No envía el código solo (un GET que mandara correo sería un amplificador),
 * no abre sesión y no vincula nada. El `origen` NO se guarda en BD: ni `portal_poliza_declarada` ni
 * `portal_alta_origen` (campaña + envío) tienen hueco para la fuente del lead, y no se inventa uno sin migración.
 */

// PENDIENTE revisión abogado/DPD
export const SUBTITULO_RRHH = 'Tu herramienta de seguros gratuita, desde el portal de tu empresa'

/** `true` solo con `origen=rrhh` exacto (primer valor si viene repetido). */
export function esOrigenRrhh(origen: unknown): boolean {
  const o = Array.isArray(origen) ? origen[0] : origen
  return o === 'rrhh'
}

/** `destinoValido` es el de `@central/module-seguros-portal` (se inyecta: este fichero queda sin imports y probable con `node --test`).
 *  El correo del enlace si tiene forma real de email; si no, `''` (campo vacío, nunca basura). Devuelve tal cual, sin normalizar. */
export function emailDeEntrada(raw: unknown, destinoValido: (tipo: 'email', destino: string) => boolean): string {
  const e = Array.isArray(raw) ? raw[0] : raw
  if (typeof e !== 'string') return ''
  const limpio = e.trim()
  return destinoValido('email', limpio) ? limpio : ''
}
