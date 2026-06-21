// Módulos por cliente (god-panel). La tabla `tenant_modulos` (BD compartida)
// guarda overrides explícitos; sin fila = ACTIVO (opt-out). El gateo real lo
// aplica cada vertical (ialimp lee estos módulos en su login → JWT → middleware).

import { prisma } from './db'

export interface ModuloDef { key: string; label: string }
export interface ModuloEstado { key: string; label: string; activo: boolean }

// Catálogo de módulos gateables por vertical. 'configuracion' nunca se apaga.
export const CATALOGO: Record<string, ModuloDef[]> = {
  ialimp: [
    { key: 'agenda', label: 'Agenda' },
    { key: 'clientes', label: 'Clientes / Negocio' },
    { key: 'rrhh', label: 'Equipo / RRHH' },
    { key: 'stock', label: 'Materiales / Stock' },
    { key: 'facturacion', label: 'Facturación' },
    { key: 'informes', label: 'Informes' },
    { key: 'contabilidad', label: 'Contabilidad' },
    { key: 'concursos', label: 'Concursos públicos' },
  ],
  iarest: [],
  sivra: [],
}

export function tieneCatalogo(vertical: string): boolean {
  return (CATALOGO[vertical]?.length ?? 0) > 0
}

/** Estado de cada módulo del catálogo para un cliente (activo por defecto). */
export async function getModulos(vertical: string, ref: string): Promise<ModuloEstado[]> {
  const cat = CATALOGO[vertical] || []
  if (!cat.length) return []
  const rows = await prisma.$queryRaw<Array<{ modulo: string; activo: boolean }>>`
    SELECT modulo, activo FROM tenant_modulos WHERE vertical = ${vertical} AND ref = ${ref}
  `
  const off = new Map(rows.map(r => [r.modulo, r.activo]))
  return cat.map(m => ({ key: m.key, label: m.label, activo: off.get(m.key) ?? true }))
}

/** Lista de módulos DESACTIVADOS para un cliente (lo que consume el gateo). */
export async function getModulosOff(vertical: string, ref: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ modulo: string }>>`
    SELECT modulo FROM tenant_modulos WHERE vertical = ${vertical} AND ref = ${ref} AND activo = false
  `
  return rows.map(r => r.modulo)
}

/** Enciende/apaga un módulo para un cliente (upsert). */
export async function setModulo(vertical: string, ref: string, modulo: string, activo: boolean): Promise<void> {
  const cat = CATALOGO[vertical] || []
  if (!cat.some(m => m.key === modulo)) throw new Error('Módulo no válido')
  await prisma.$executeRaw`
    INSERT INTO tenant_modulos (vertical, ref, modulo, activo, updated_at)
    VALUES (${vertical}, ${ref}, ${modulo}, ${activo}, now())
    ON CONFLICT (vertical, ref, modulo) DO UPDATE SET activo = ${activo}, updated_at = now()
  `
}
