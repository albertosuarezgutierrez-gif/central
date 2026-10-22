// PATRIMONIO (22/10/2026, paso 8) — carpetas de documentos por owner y QUIÉN puede hacer qué en cada una. PURO.
//
// Usa el motor `@central/module-documental` (owner opaco tipo+id, `ConfigCarpeta`, `puedeVer`/`puedeSubir`). Las carpetas las
// define ESTA vertical, no el módulo. Dos actores del módulo: `gestor` (el titular y sus autorizados con nivel Gestión/Total)
// y `titular` = el INQUILINO por su enlace (paso 12, aún no existe): solo ve y sube a su carpeta de recibos del seguro.
//
// 🚨 FAIL-CLOSED: owner, carpeta, rol o acción desconocidos → `false`. La carpeta se valida contra la lista del OWNER (una
// carpeta de contrato no vale para un inmueble). Borrar NO existe para el inquilino. «Consulta» (solo ver) no es un nivel
// que hoy dé `accesosPatrimonio` (solo `gestion`/`total`): si algún día lo hay, `puede(nivel,'ver')` ya lo cubre.
import { indexarCarpetas, puedeSubir, puedeVer, type ConfigCarpeta } from '@central/module-documental'
import { puede, type NivelPatrimonio } from '@central/module-patrimonio'

export const OWNERS_DOCUMENTO = ['inmueble', 'contrato', 'inquilino'] as const
export type OwnerDocumento = (typeof OWNERS_DOCUMENTO)[number]

const G = (id: string, etiqueta: string): ConfigCarpeta => ({ id, etiqueta, titularPuedeSubir: false, titularPuedeVer: false })

/** Ids únicos en toda la taxonomía (`indexarCarpetas` lanza si se repite uno). */
export const CARPETAS_POR_OWNER: Readonly<Record<OwnerDocumento, readonly ConfigCarpeta[]>> = Object.freeze({
  inmueble: [G('escritura', 'Escritura y notas'), G('facturas', 'Facturas'), G('seguro_inmueble', 'Seguro'), G('fotos', 'Fotos'), G('otros_inmueble', 'Otros')],
  contrato: [G('contrato_firmado', 'Contrato firmado'), G('anexos', 'Anexos y actualizaciones'), G('otros_contrato', 'Otros')],
  inquilino: [
    // La ÚNICA carpeta que el inquilino ve y a la que sube (recibo de su seguro de hogar).
    { id: 'recibos', etiqueta: 'Recibos del seguro', titularPuedeSubir: true, titularPuedeVer: true },
    G('identificacion', 'Identificación'),
    G('otros_inquilino', 'Otros'),
  ],
})

export const CARPETA_FACTURAS = 'facturas'

const TODAS = indexarCarpetas(OWNERS_DOCUMENTO.flatMap((o) => [...CARPETAS_POR_OWNER[o]]))

export const esOwnerDocumento = (v: unknown): v is OwnerDocumento => typeof v === 'string' && (OWNERS_DOCUMENTO as readonly string[]).includes(v)

/** ¿La carpeta existe PARA ESE owner? */
export function carpetaDeOwner(owner: unknown, carpeta: unknown): boolean {
  return esOwnerDocumento(owner) && typeof carpeta === 'string' && CARPETAS_POR_OWNER[owner].some((c) => c.id === carpeta)
}

export type RolDocumental = NivelPatrimonio | 'inquilino'
export type AccionDocumental = 'ver' | 'subir' | 'borrar'

/**
 * Tabla de permisos. Gestión/Total: ven (`ver`) y suben/borran (`gestionar_gastos_documentos`); `inquilino` solo ve y sube en
 * carpetas que el módulo marca para el titular (recibos) y NUNCA borra. Rol `null`/desconocido (sin acceso) → nada.
 */
export function puedeDocumento(rol: RolDocumental | null | undefined, accion: AccionDocumental, owner: unknown, carpeta: unknown): boolean {
  if (!carpetaDeOwner(owner, carpeta)) return false
  const id = carpeta as string
  if (rol === 'inquilino') {
    if (owner !== 'inquilino') return false
    if (accion === 'ver') return puedeVer(TODAS, id, 'titular')
    if (accion === 'subir') return puedeSubir(TODAS, id, 'titular')
    return false
  }
  if (rol !== 'gestion' && rol !== 'total') return false
  return puede(rol, accion === 'ver' ? 'ver' : 'gestionar_gastos_documentos')
}
