// Marca de correduría «Grupo ASegura» para el Portal del Empleado. PURO (sin BD) → testeable.
// Se activa SIN migración: lista de empresa_id en la env RRHH_EMPRESAS_MARCA_ASEGURA (separados por coma).
// Solo toca el portal del empleado (/e y /e/entrar); el panel /admin y el resto de empresas no cambian.
import { derivarPaleta, type Paleta } from './branding'

export const ENV_EMPRESAS_MARCA_ASEGURA = 'RRHH_EMPRESAS_MARCA_ASEGURA'
export const COBALTO_ASEGURA = '#3364ee'
export const PIE_ASEGURA = 'Herramienta gratuita de Grupo ASegura'
export const LOGO_ASEGURA = '/brand/logotipo-asegura.svg'
/** Portal del cliente de la correduría (producción). Sobrescribible con ASEGURA_PORTAL_URL. */
export const PORTAL_ASEGURA_POR_DEFECTO = 'https://clientes.grupoasegura.es'

/** ¿Esta empresa lleva la marca Grupo ASegura? `lista` = valor de la env (coma-separado). */
export function empresaConMarcaAsegura(empresaId: string | null | undefined, lista: string | null | undefined): boolean {
  const id = (empresaId ?? '').trim().toLowerCase()
  if (!id || !lista) return false
  return lista.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).includes(id)
}

/** Paleta efectiva: cobalto ASegura si la empresa lleva la marca; si no, la derivada de su color (o null). */
export function paletaEmpresa(marcaAsegura: boolean, colorEmpresa: string | null | undefined): Paleta | null {
  return derivarPaleta(marcaAsegura ? COBALTO_ASEGURA : (colorEmpresa ?? ''))
}

/** Variables CSS del contenedor del portal. Sin marca ASegura devuelve lo de siempre (color de la empresa). */
export function estiloMarcaEmpresa(marcaAsegura: boolean, colorEmpresa: string | null | undefined): Record<string, string> {
  const p = paletaEmpresa(marcaAsegura, colorEmpresa)
  if (!p) return {}
  return { '--accent': p.accent, '--accent-ink': p.accentInk, '--accent-soft': p.accentSoft }
}

/**
 * Enlace de la tarjeta «Mis seguros». 🚨 REGLA LEGAL: solo viajan `email` (si lo hay) y `origen`.
 * Ningún otro dato del empleado (nombre, DNI, domicilio, empresa_id…) se añade jamás a esta URL.
 */
export function urlPortalAsegura(email: string | null | undefined, base?: string | null): string {
  const raiz = ((base ?? '').trim() || PORTAL_ASEGURA_POR_DEFECTO).replace(/\/+$/, '')
  const e = (email ?? '').trim()
  return `${raiz}/?${e ? `email=${encodeURIComponent(e)}&` : ''}origen=rrhh`
}
