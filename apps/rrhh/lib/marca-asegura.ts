// Marca de correduría «Grupo ASegura» para el Portal del Empleado. PURO (sin BD) → testeable.
// Se activa SIN migración: lista de empresa_id en la env RRHH_EMPRESAS_MARCA_ASEGURA (separados por coma).
// Solo toca el portal del empleado (/e y /e/entrar); el panel /admin y el resto de empresas no cambian.
import { derivarPaleta, type Paleta } from './branding'
import { HOST_CANONICO } from './host-canonico'

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

// ── Entorno 100 % Grupo ASegura: co-marca, pie y app instalable ─────────────────────────────────────
export const WEB_ASEGURA = 'https://grupoasegura.es'
export const WEB_ASEGURA_TEXTO = 'grupoasegura.es'
export const MANIFEST_BASE = '/manifest.json'
export const MANIFEST_ASEGURA = '/manifest-asegura.json'
export const ICONO_APPLE_ASEGURA = '/brand/icono-asegura-180.png'
export const TITULO_ASEGURA = 'Grupo ASegura · Portal del empleado'
/** Entrada de la app instalada con marca; `?m=asegura` hace que /e/entrar lleve la marca sin conocer la empresa. */
export const ENTRADA_ASEGURA = '/e/entrar?m=asegura'

/** ¿Esta empresa lleva la marca? Lee la env (una sola fuente para /e, /e/[token] y sus metadatos). */
export function marcaAseguraDeEmpresa(empresaId: string | null | undefined): boolean {
  return empresaConMarcaAsegura(empresaId, process.env[ENV_EMPRESAS_MARCA_ASEGURA])
}

/** Manifest que enlaza el layout de la ruta: el de Grupo ASegura solo con marca; si no, el de siempre. */
export function manifestParaMarca(marcaAsegura: boolean): string {
  return marcaAsegura ? MANIFEST_ASEGURA : MANIFEST_BASE
}

/** Metadatos de la ruta con marca (Next los fusiona sobre los del layout). Sin marca → `{}`: nada cambia. */
export function metadataMarcaAsegura(marcaAsegura: boolean) {
  if (!marcaAsegura) return {}
  return {
    title: TITULO_ASEGURA,
    manifest: MANIFEST_ASEGURA,
    icons: { icon: '/brand/icono-asegura.svg', apple: ICONO_APPLE_ASEGURA },
    appleWebApp: { capable: true, title: 'Grupo ASegura', statusBarStyle: 'default' as const },
  }
}

/** Color de la barra del navegador: cobalto con marca, el de siempre sin ella (`undefined` = hereda del layout). */
export function themeColorMarca(marcaAsegura: boolean): string | undefined {
  return marcaAsegura ? COBALTO_ASEGURA : undefined
}

// ── Rutas sin empresa conocida (/ y /login): la marca la da el host o ?m=asegura ───────────────────
/** ¿El host de la petición es el dominio propio del portal (empleados.grupoasegura.es)? Ignora puerto y mayúsculas. */
export function marcaPorHost(host: string | null | undefined): boolean {
  return (host ?? '').trim().toLowerCase().split(':')[0] === HOST_CANONICO
}

/** Marca en / y /login: host propio, o `?m=asegura` (preview/local). `m` puede venir como array en searchParams. */
export function marcaDePeticion(host: string | null | undefined, m?: string | string[] | null): boolean {
  const v = Array.isArray(m) ? m[0] : m
  return v === 'asegura' || marcaPorHost(host)
}
