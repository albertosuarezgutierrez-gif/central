// Onboarding · importar el PLAN DE CUENTAS de la empresa desde un CSV (el de su gestoría o su programa anterior). PURO.
//
// Columnas (cabecera obligatoria, en cualquier orden, con o sin tildes): `codigo`, `nombre` y, opcional, `naturaleza` (D/A, deudora/acreedora, debe/haber).
// Sin `naturaleza` se HEREDA de la cuenta padre (prefijo más largo ya existente en el plan o en el propio fichero). Si no hay padre, la fila se rechaza:
// nunca se adivina por el grupo (un 4xx puede ser deudora o acreedora).
// Reglas: código `^[1-9]\d{2,}$`; nombre 1-200 caracteres; un código repetido en el fichero es error; uno que YA existe en el plan se omite (no se pisa).
// Una cuenta que pasa a tener subcuentas deja de admitir apuntes (igual que `crearSubcuenta`): se devuelve en `padresQueDejanDeSerHoja`.
import { tablaCsv } from './csv.ts'
import type { PlanDeCuentas } from '../partida/plan.ts'

export type CuentaImportada = { codigo: string; nombre: string; grupo: number; naturaleza: 'deudora' | 'acreedora'; admiteApuntes: boolean; activa: true }
export type ResultadoImportPlan = {
  cuentas: CuentaImportada[]
  /** Códigos del fichero que ya existían en el plan (no se tocan). */
  yaExistentes: string[]
  /** Cuentas del plan (existentes o del fichero) que reciben subcuentas y dejan de admitir apuntes. */
  padresQueDejanDeSerHoja: string[]
  errores: { linea: number; motivo: string }[]
}

const CODIGO_RE = /^[1-9][0-9]{2,11}$/
export function leerNaturaleza(v: string): 'deudora' | 'acreedora' | null {
  const t = v.trim().toLowerCase()
  if (['d', 'deudora', 'debe', 'deudor'].includes(t)) return 'deudora'
  if (['a', 'acreedora', 'haber', 'acreedor'].includes(t)) return 'acreedora'
  return null
}

export function importarPlanCsv(texto: string, plan: PlanDeCuentas): ResultadoImportPlan {
  const t = tablaCsv(texto, { codigo: ['cuenta', 'subcuenta', 'cod'], nombre: ['descripcion', 'titulo', 'denominacion'], naturaleza: ['tipo', 'saldo'] }, ['codigo', 'nombre'])
  if (!t.ok) return { cuentas: [], yaExistentes: [], padresQueDejanDeSerHoja: [], errores: t.errores.map((motivo) => ({ linea: 1, motivo })) }
  const errores: { linea: number; motivo: string }[] = []
  const vistos = new Set<string>()
  const nuevas = new Map<string, { linea: number; nombre: string; nat: 'deudora' | 'acreedora' | null }>()
  const yaExistentes: string[] = []
  for (const { linea, valores: v } of t.filas) {
    const codigo = v.codigo.replace(/\s/g, '')
    if (!CODIGO_RE.test(codigo)) { errores.push({ linea, motivo: `código inválido «${v.codigo}» (3 a 12 cifras, sin empezar por 0)` }); continue }
    if (vistos.has(codigo)) { errores.push({ linea, motivo: `código ${codigo} repetido en el fichero` }); continue }
    vistos.add(codigo)
    if (!v.nombre || v.nombre.length > 200) { errores.push({ linea, motivo: `cuenta ${codigo}: nombre vacío o de más de 200 caracteres` }); continue }
    let nat: 'deudora' | 'acreedora' | null = null
    if (v.naturaleza) {
      nat = leerNaturaleza(v.naturaleza)
      if (!nat) { errores.push({ linea, motivo: `cuenta ${codigo}: naturaleza «${v.naturaleza}» no reconocida (usa D/A)` }); continue }
    }
    if (plan.cuentas[codigo]) { yaExistentes.push(codigo); continue }
    nuevas.set(codigo, { linea, nombre: v.nombre, nat })
  }
  // Naturaleza heredada: se resuelve con padres del plan o del fichero (en orden de código: un padre siempre es más corto/menor).
  const natDe = (codigo: string): 'deudora' | 'acreedora' | null => {
    for (let len = codigo.length - 1; len >= 3; len--) {
      const p = codigo.slice(0, len)
      const n = nuevas.get(p)?.nat ?? plan.cuentas[p]?.naturaleza ?? null
      if (n) return n
    }
    return null
  }
  const cuentas: CuentaImportada[] = []
  for (const codigo of [...nuevas.keys()].sort((a, b) => a.length - b.length || (a < b ? -1 : 1))) {
    const x = nuevas.get(codigo)!
    const nat = x.nat ?? natDe(codigo)
    if (!nat) { errores.push({ linea: x.linea, motivo: `cuenta ${codigo}: sin naturaleza y sin cuenta padre de la que heredarla` }); continue }
    x.nat = nat
    cuentas.push({ codigo, nombre: x.nombre, grupo: Number(codigo[0]), naturaleza: nat, admiteApuntes: true, activa: true })
  }
  // Padres: toda cuenta (del plan o importada) que sea prefijo estricto de otra importada.
  const todas = new Set<string>([...Object.keys(plan.cuentas), ...cuentas.map((c) => c.codigo)])
  const padres = new Set<string>()
  for (const c of cuentas) {
    for (let len = c.codigo.length - 1; len >= 3; len--) {
      const p = c.codigo.slice(0, len)
      if (todas.has(p)) { padres.add(p); break }
    }
  }
  // Un padre importado en este mismo fichero se inserta ya como NO hoja.
  const finales: CuentaImportada[] = cuentas.map((c) => (padres.has(c.codigo) ? { ...c, admiteApuntes: false } : c))
  return {
    cuentas: finales.sort((a, b) => (a.codigo < b.codigo ? -1 : 1)),
    yaExistentes,
    padresQueDejanDeSerHoja: [...padres].filter((p) => plan.cuentas[p]?.admiteApuntes === true).sort(),
    errores: errores.sort((a, b) => a.linea - b.linea),
  }
}
