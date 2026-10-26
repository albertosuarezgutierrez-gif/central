// Marca «Grupo ASegura» del Portal del Empleado. PURO (sin BD) → testeable.
//
// 26/10/2026 (decisión de Alberto): la marca es SIEMPRE Grupo ASegura, para todas las empresas. Se acabó el doble
// diseño (beige/teal/serif) y su gating por la env `RRHH_EMPRESAS_MARCA_ASEGURA`, por host y por `?m=`.
// 🚨 Esa env YA NO SE LEE en ningún sitio: si sigue puesta en Vercel no hace nada ni rompe nada (se puede borrar).
// El color de cada empresa tampoco pinta ya la interfaz: solo su logo ("[cliente] con Grupo ASegura").
// Los colores salen de `@central/brand` (MARCA_ASEGURA + emitirRootCss en app/layout.tsx), nunca a mano.
import { MARCA_ASEGURA } from '@central/brand'

/** Cobalto de la marca (viene del paquete; solo para themeColor, el color por defecto de los PDF y los correos). */
export const COBALTO_ASEGURA = MARCA_ASEGURA.paleta.primario
export const PIE_ASEGURA = 'Herramienta gratuita de Grupo ASegura'
export const LOGO_ASEGURA = '/brand/logotipo-asegura.svg'
/** Portal del cliente de la correduría (producción). Sobrescribible con ASEGURA_PORTAL_URL. */
export const PORTAL_ASEGURA_POR_DEFECTO = 'https://clientes.grupoasegura.es'

/**
 * Enlace «Seguros». 🚨 REGLA LEGAL: solo viajan `email` (si lo hay) y `origen`.
 * Ningún otro dato del empleado ni de la empresa (nombre, DNI, domicilio, empresa_id…) se añade jamás a esta URL:
 * los datos de RR.HH. nunca se usan comercialmente. Lo usan la cabecera de /e y la de /admin.
 */
export function urlPortalAsegura(email: string | null | undefined, base?: string | null): string {
  const raiz = ((base ?? '').trim() || PORTAL_ASEGURA_POR_DEFECTO).replace(/\/+$/, '')
  const e = (email ?? '').trim()
  return `${raiz}/?${e ? `email=${encodeURIComponent(e)}&` : ''}origen=rrhh`
}

// ── Identidad de la app instalable ───────────────────────────────────────────────────────────────────
export const WEB_ASEGURA = 'https://grupoasegura.es'
export const WEB_ASEGURA_TEXTO = 'grupoasegura.es'
/** Manifest que enlaza el layout raíz (el mismo para todas las empresas). */
export const MANIFEST_PORTAL = '/manifest.json'
/** Manifest anterior: se conserva porque las apps ya instaladas lo tienen guardado. Mismo contenido de marca. */
export const MANIFEST_ASEGURA = '/manifest-asegura.json'
export const ICONO_APPLE_ASEGURA = '/brand/icono-asegura-180.png'
export const TITULO_ASEGURA = 'Grupo ASegura · Portal del empleado'
/** Entrada del empleado (start_url de la app instalada). */
export const ENTRADA_ASEGURA = '/e/entrar'
