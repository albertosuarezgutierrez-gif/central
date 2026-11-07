// A dónde salta cada herramienta. URL base de cada app por env (no es secreto); sin ella, la tarjeta dice «enlace pendiente».
import { CATALOGO, type IdHerramienta, type AudTraspaso } from '@central/core-herramientas'

const ENV_URL: Record<AudTraspaso, string> = { contabilidad: 'CONTABILIDAD_URL', rrhh: 'RRHH_URL', taller: 'TALLER_URL' }

export function urlApp(h: IdHerramienta): string | null {
  const v = process.env[ENV_URL[CATALOGO[h].app]]?.trim().replace(/\/$/, '')
  return v && /^https:\/\//.test(v) ? v : null
}

/** ¿Se puede saltar con token desde aquí? (catálogo + URL configurada). Si no, la tarjeta lo explica. */
export const saltoDisponible = (h: IdHerramienta) => CATALOGO[h].traspaso && urlApp(h) !== null
