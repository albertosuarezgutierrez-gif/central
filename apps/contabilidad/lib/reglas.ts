// Caso de uso «Ajustes → Reglas de asiento»: validar contra el plan de la empresa y guardar una versión nueva. Sin BD directa.
import { validarReglasEmpresa, TIPOS_REGLA, type TipoRegla } from '@central/module-contabilidad'
import type { RepoContable } from './repo.ts'
import { planDesdeFilas } from './servicio.ts'
import type { TipoHecho } from './hecho-entrada.ts'

export type ResultadoRegla = { ok: true; version: number } | { ok: false; errores: string[] }

export async function guardarReglaEmpresa(repo: RepoContable, tipo: string, cuentas: unknown, usuarioId: string | null): Promise<ResultadoRegla> {
  if (!(TIPOS_REGLA as readonly string[]).includes(tipo)) return { ok: false, errores: [`tipo de hecho no admitido: ${tipo}`] }
  const errores = validarReglasEmpresa(tipo, cuentas, planDesdeFilas(await repo.planCuentas()))
  if (errores.length) return { ok: false, errores }
  const limpias = Object.fromEntries(Object.entries(cuentas as Record<string, string>).map(([k, v]) => [k, v.trim()]))
  const version = await repo.guardarRegla(tipo as TipoRegla as TipoHecho, limpias, usuarioId)
  await repo.auditar({ actor: 'usuario', usuarioId, accion: 'guardar_regla', entidad: 'reglas_asiento', entidadId: `${tipo}:v${version}`, detalle: { tipo, cuentas: limpias } })
  return { ok: true, version }
}
