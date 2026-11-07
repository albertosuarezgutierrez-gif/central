// Casos de uso del ONBOARDING guiado (F6): plan de cuentas, saldos iniciales (asiento de apertura) y terceros. Repositorios inyectados; sin BD directa.
//   · Plan: solo AÑADE cuentas (lo existente no se pisa); un padre que recibe subcuentas deja de admitir apuntes.
//   · Saldos: UN asiento de apertura por ejercicio (`apertura-inicial:AAAA`, la BD lo impide dos veces salvo rectificación), que debe cuadrar al céntimo
//     y caer en un ejercicio ABIERTO que aún no tenga movimientos de apertura. Todo o nada: el llamador revierte si `ok: false`.
//   · Terceros: NIF validado con el algoritmo de core-fiscal (inyectado) y único por (NIF, tipo).
import {
  asientoAperturaInicial, importarPlanCsv, importarTercerosCsv, refAperturaInicial, type ValidadorNif,
} from '@central/module-contabilidad'
import type { RepoContable } from './repo.ts'
import type { RepoF6 } from './repo-f6.ts'
import { ejercicioContable, hashAsiento, planDesdeFilas } from './servicio.ts'

type Fila = { linea: number; motivo: string }
type Res<T> = ({ ok: true } & T) | { ok: false; errores: Fila[] }

export async function importarPlan(repo: RepoContable, f6: RepoF6, csv: string): Promise<Res<{ nuevas: number; yaExistentes: number; padres: number; avisos: Fila[] }>> {
  const plan = planDesdeFilas(await repo.planCuentas())
  const r = importarPlanCsv(csv, plan)
  // Con errores en alguna fila no se importa NADA: un plan a medias es peor que ninguno (el CSV se corrige y se vuelve a subir).
  if (r.errores.length) return { ok: false, errores: r.errores }
  if (r.cuentas.length === 0) return { ok: false, errores: [{ linea: 0, motivo: r.yaExistentes.length ? 'todas las cuentas del fichero ya existen' : 'el fichero no contiene cuentas' }] }
  await repo.sembrarPlan(r.cuentas)
  await f6.marcarCuentasNoHoja(r.padresQueDejanDeSerHoja)
  return { ok: true, nuevas: r.cuentas.length, yaExistentes: r.yaExistentes.length, padres: r.padresQueDejanDeSerHoja.length, avisos: [] }
}

export type MetaApertura = { usuarioId: string | null }
export async function importarSaldosIniciales(repo: RepoContable, csv: string, fecha: string, meta: MetaApertura): Promise<Res<{ asientoId: string; numero: number; total: number; lineas: number }>> {
  const anio = Number(String(fecha).slice(0, 4))
  const ej = Number.isInteger(anio) ? await repo.ejercicio(anio) : null
  if (!ej) return { ok: false, errores: [{ linea: 0, motivo: `no existe el ejercicio de la fecha ${fecha}` }] }
  if (ej.estado !== 'abierto') return { ok: false, errores: [{ linea: 0, motivo: `el ejercicio ${anio} está ${ej.estado === 'cerrado' ? 'cerrado' : 'en cierre'}` }] }
  const plan = planDesdeFilas(await repo.planCuentas())
  const r = asientoAperturaInicial(csv, plan, ejercicioContable(ej), fecha)
  if (!r.ok) return { ok: false, errores: r.errores }
  const numero = await repo.reservarNumero(anio)
  const a = r.asiento
  const id = await repo.insertarAsiento({
    ejercicio: anio, numero, fecha: a.fecha, concepto: a.concepto, origen: 'apertura', origenTipo: 'apertura', origenRef: refAperturaInicial(anio),
    hash: hashAsiento(a), creadoPor: meta.usuarioId, apuntes: a.apuntes,
  })
  await repo.auditar({ actor: 'usuario', usuarioId: meta.usuarioId, accion: 'apertura_inicial', entidad: 'asientos', entidadId: id, detalle: { numero, lineas: a.apuntes.length, total: r.totalDebe } })
  return { ok: true, asientoId: id, numero, total: r.totalDebe, lineas: a.apuntes.length }
}

export async function importarTerceros(f6: RepoF6, csv: string, validarNif: ValidadorNif, usuarioId: string | null): Promise<Res<{ nuevos: number; repetidos: number }>> {
  const r = importarTercerosCsv(csv, validarNif)
  if (r.errores.length) return { ok: false, errores: r.errores }
  if (r.terceros.length === 0) return { ok: false, errores: [{ linea: 0, motivo: 'el fichero no contiene terceros' }] }
  return { ok: true, ...(await f6.insertarTerceros(r.terceros, usuarioId)) }
}
