// Reglas de asiento por empresa: validación, mezcla con la plantilla del sector y procedencia de cada cuenta. PURO.
//
// Formato guardado (`reglas_asiento.cuentas`, jsonb plano por tipo de hecho): `{ "ingreso": "705", "categoria:mano_obra": "705" }`.
// Las claves `categoria:<x>` solo existen para venta y compra. Precedencia: regla de la empresa > plantilla del sector > genérica.
import { combinarReglas, esMedioPago, REGLAS_PGC, type MedioPago, type ReglasAsiento } from '../partida/hechos.ts'
import type { PlanDeCuentas } from '../partida/plan.ts'
import { plantillaDe } from './plantillas.ts'

export type TipoRegla = 'venta' | 'compra' | 'cobro' | 'pago' | 'nomina'
export const TIPOS_REGLA: readonly TipoRegla[] = ['venta', 'compra', 'cobro', 'pago', 'nomina']
export type ReglasEmpresa = Partial<Record<TipoRegla, Readonly<Record<string, string>>>>

export const PREFIJO_CATEGORIA = 'categoria:'
export const PREFIJO_MEDIO = 'medio:'
export const CATEGORIA_RE = /^[a-z][a-z0-9_]{1,40}$/
const CUENTA_RE = /^[1-9][0-9]{2,11}$/

/** Campos de cuenta de cada tipo (los mismos que `REGLAS_PGC`). */
export const CAMPOS_REGLA: Readonly<Record<TipoRegla, readonly string[]>> = {
  venta: Object.keys(REGLAS_PGC.venta), compra: Object.keys(REGLAS_PGC.compra), cobro: Object.keys(REGLAS_PGC.cobro),
  pago: Object.keys(REGLAS_PGC.pago), nomina: Object.keys(REGLAS_PGC.nomina),
}

/**
 * Problemas de las cuentas que la empresa quiere guardar para un tipo de hecho (vacío = válido): campos conocidos, categorías con
 * nombre válido (solo venta/compra) y CADA cuenta existente en el plan y de nivel hoja (admite apuntes).
 */
export function validarReglasEmpresa(tipo: string, cuentas: unknown, plan: PlanDeCuentas): string[] {
  const errs: string[] = []
  if (!(TIPOS_REGLA as readonly string[]).includes(tipo)) return [`tipo de hecho no admitido: ${tipo}`]
  if (!cuentas || typeof cuentas !== 'object' || Array.isArray(cuentas)) return ['las cuentas deben ser un objeto { campo: cuenta }']
  const entradas = Object.entries(cuentas as Record<string, unknown>)
  if (entradas.length === 0) errs.push('ninguna cuenta: indica al menos una')
  if (entradas.length > 60) errs.push('demasiadas cuentas (máx. 60)')
  const campos = CAMPOS_REGLA[tipo as TipoRegla]
  for (const [k, v] of entradas) {
    const esCategoria = k.startsWith(PREFIJO_CATEGORIA)
    if (k.startsWith(PREFIJO_MEDIO)) {
      if (tipo !== 'cobro' && tipo !== 'pago') errs.push(`${k}: los medios solo existen en cobro y pago`)
      else if (!esMedioPago(k.slice(PREFIJO_MEDIO.length))) errs.push(`${k}: medio desconocido (efectivo, bizum, transferencia, tarjeta, otro)`)
    } else if (esCategoria) {
      if (tipo !== 'venta' && tipo !== 'compra') errs.push(`${k}: las categorías solo existen en venta y compra`)
      else if (!CATEGORIA_RE.test(k.slice(PREFIJO_CATEGORIA.length))) errs.push(`${k}: nombre de categoría no válido (minúsculas, números y _)`)
    } else if (!campos.includes(k)) errs.push(`${k}: campo desconocido en ${tipo}`)
    if (typeof v !== 'string' || !CUENTA_RE.test(v)) { errs.push(`${k}: «${String(v)}» no es un código de cuenta`); continue }
    const c = plan.cuentas[v]
    if (!c) errs.push(`${k}: la cuenta ${v} no existe en el plan`)
    else if (!c.admiteApuntes) errs.push(`${k}: la cuenta ${v} no es de nivel hoja (usa una subcuenta)`)
  }
  return errs
}

/** Separa las cuentas guardadas en campos normales y categorías; descarta lo que no tenga forma de cuenta. */
export function separarCategorias(guardadas: Readonly<Record<string, string>> | undefined): { campos: Record<string, string>; categorias: Record<string, string>; medios: Partial<Record<MedioPago, string>> } {
  const campos: Record<string, string> = {}
  const categorias: Record<string, string> = {}
  const medios: Partial<Record<MedioPago, string>> = {}
  for (const [k, v] of Object.entries(guardadas ?? {})) {
    if (typeof v !== 'string' || !CUENTA_RE.test(v)) continue
    if (k.startsWith(PREFIJO_MEDIO)) { const m = k.slice(PREFIJO_MEDIO.length); if (esMedioPago(m)) medios[m] = v } else if (k.startsWith(PREFIJO_CATEGORIA)) { const c = k.slice(PREFIJO_CATEGORIA.length); if (CATEGORIA_RE.test(c)) categorias[c] = v } else campos[k] = v
  }
  return { campos, categorias, medios }
}

/** Reglas EFECTIVAS: genérica ← plantilla del sector ← reglas de la empresa. Solo campos conocidos con forma de cuenta. */
export function reglasEfectivasDeSector(sector: unknown, empresa: ReglasEmpresa = {}): ReglasAsiento {
  const base = plantillaDe(sector).reglas
  const v = separarCategorias(empresa.venta)
  const c = separarCategorias(empresa.compra)
  const solo = (tipo: TipoRegla, campos: Record<string, string>) =>
    Object.fromEntries(Object.entries(campos).filter(([k]) => CAMPOS_REGLA[tipo].includes(k)))
  return combinarReglas(base, {
    venta: solo('venta', v.campos), compra: solo('compra', c.campos),
    cobro: solo('cobro', separarCategorias(empresa.cobro).campos), pago: solo('pago', separarCategorias(empresa.pago).campos),
    nomina: solo('nomina', separarCategorias(empresa.nomina).campos),
    categorias: { venta: v.categorias, compra: c.categorias },
    medios: { cobro: separarCategorias(empresa.cobro).medios, pago: separarCategorias(empresa.pago).medios },
  })
}

export type ProcedenciaRegla = 'empresa' | 'sector' | 'generica'

/** ¿De dónde sale la cuenta de un campo (o `categoria:x`)? Para mostrarlo en Ajustes. */
export function procedenciaRegla(sector: unknown, empresa: ReglasEmpresa, tipo: TipoRegla, campo: string): ProcedenciaRegla {
  const esMed = campo.startsWith(PREFIJO_MEDIO)
  const grupo = esMed ? 'medios' : campo.startsWith(PREFIJO_CATEGORIA) ? 'categorias' : 'campos'
  const nombre = esMed ? campo.slice(PREFIJO_MEDIO.length) : campo.startsWith(PREFIJO_CATEGORIA) ? campo.slice(PREFIJO_CATEGORIA.length) : campo
  if (Object.prototype.hasOwnProperty.call(separarCategorias(empresa[tipo])[grupo], nombre)) return 'empresa'
  const p = plantillaDe(sector).reglas
  if (esMed) {
    const m = tipo === 'cobro' ? p.medios?.cobro : tipo === 'pago' ? p.medios?.pago : undefined
    return m && nombre in m ? 'sector' : 'generica'
  }
  if (campo.startsWith(PREFIJO_CATEGORIA)) {
    const cat = campo.slice(PREFIJO_CATEGORIA.length)
    const mapa = tipo === 'venta' ? p.categorias?.venta : tipo === 'compra' ? p.categorias?.compra : undefined
    return mapa && cat in mapa ? 'sector' : 'generica'
  }
  const delSector = (p[tipo] as Record<string, string>)[campo]
  return delSector !== (REGLAS_PGC[tipo] as Record<string, string>)[campo] ? 'sector' : 'generica'
}
