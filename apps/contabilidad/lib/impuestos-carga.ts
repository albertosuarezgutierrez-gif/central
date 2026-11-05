// Carga de datos para un modelo desde la BD (cada lectura en su PROPIA transacción RLS y a prueba de tablas que aún no existen).
// La lógica está en `impuestos.ts` / `impuestos-datos.ts` (probadas sin BD); esto solo junta los repositorios.
import {
  rangoDeModelo, type CuadreIva, type ModeloAeat, type PeriodoModelo, type SumaCuenta,
} from '@central/module-contabilidad'
import { conEmpresa } from './db.ts'
import { repoSql } from './repo.ts'
import { repoF4Sql, type FilaDeclaracion, type RepoF4 } from './repo-f4.ts'
import { datosFiscalesDeHechos, type DatosFiscales } from './impuestos-datos.ts'
import { compensacionPendiente, cuadreDelPeriodo, rendimiento130, type EntradaCalculo } from './impuestos.ts'

const TIMEOUT = { timeout: 30_000 }
const LIMITE_ASIENTOS_130 = 20_000

/** Ejecuta con el repositorio F4 de la empresa en una transacción propia. */
export const conF4 = <R>(empresaId: string, fn: (f4: RepoF4) => Promise<R>) => conEmpresa(empresaId, (tx) => fn(repoF4Sql(tx, empresaId.toLowerCase())), TIMEOUT)

/** Hechos fiscales del rango; si `facturas_recibidas` (0003) no existe, reintenta sin ella (en otra transacción: la primera quedó abortada). */
export async function cargarDatosFiscales(empresaId: string, desde: string, hasta: string): Promise<{ datos: DatosFiscales; truncado: boolean; sinFacturas: boolean }> {
  let sinFacturas = false
  let r: Awaited<ReturnType<RepoF4['hechosFiscales']>>
  try {
    r = await conF4(empresaId, (f4) => f4.hechosFiscales(desde, hasta, true))
  } catch {
    sinFacturas = true
    r = await conF4(empresaId, (f4) => f4.hechosFiscales(desde, hasta, false))
  }
  const datos = datosFiscalesDeHechos(r.filas)
  if (sinFacturas) datos.avisos.push('Facturas recibidas (esquema de la fase 3) sin aplicar: los proveedores salen sin NIF.')
  return { datos, truncado: r.truncado, sinFacturas }
}

export type CargaModelo = { entrada: EntradaCalculo; cuadre: CuadreIva | null; extra: Record<string, unknown> }

/** Todo lo que necesita `calcularConDatos` para un modelo y periodo. */
export async function cargarEntradaModelo(empresaId: string, modelo: ModeloAeat, anio: number, periodo: PeriodoModelo): Promise<CargaModelo> {
  const rango = rangoDeModelo(anio, periodo)
  const id = empresaId.toLowerCase()
  const vacio: DatosFiscales = { ops: [], retenciones: [], refAAsiento: {}, avisos: [] }

  if (modelo === '130') {
    const { asientos, truncado, regimen } = await conEmpresa(empresaId, async (tx) => {
      const a = await repoSql(tx, id).asientosPeriodo({ desde: `${anio}-01-01`, hasta: rango.hasta, limite: LIMITE_ASIENTOS_130 })
      return { asientos: a.asientos, truncado: a.truncado, regimen: await repoF4Sql(tx, id).regimenIva() }
    }, TIMEOUT)
    // `declaraciones` (0004) en su propia transacción: si aún no existe, no hay pagos previos que restar y se avisa en la pantalla.
    const presentados = await conF4(empresaId, (f4) => f4.presentados130(anio)).catch(() => [] as FilaDeclaracion[])
    return { entrada: { modelo, anio, periodo, datos: vacio, regimenIva: regimen, compensarAnteriores: 0, rendimiento130: rendimiento130(asientos, anio, periodo, presentados), truncado }, cuadre: null, extra: {} }
  }

  const { datos, truncado } = await cargarDatosFiscales(empresaId, rango.desde, rango.hasta)
  const { regimen, sumas } = await conEmpresa(empresaId, async (tx) => {
    const f4 = repoF4Sql(tx, id)
    const sumas: SumaCuenta[] = modelo === '303' ? await f4.sumasFiscalesDeHechos(rango.desde, rango.hasta) : []
    return { regimen: await f4.regimenIva(), sumas }
  }, TIMEOUT)
  const pres303 = modelo === '303' ? await conF4(empresaId, (f4) => f4.presentados303(anio)).catch(() => [] as FilaDeclaracion[]) : []
  const compensar = modelo === '303' ? compensacionPendiente(pres303, anio, periodo) : 0
  const cuadre = cuadreDelPeriodo(modelo, anio, periodo, datos, sumas)
  return {
    entrada: { modelo, anio, periodo, datos, regimenIva: regimen, compensarAnteriores: compensar, rendimiento130: null, truncado },
    cuadre, extra: { cuadre, refAAsiento: datos.refAAsiento },
  }
}
