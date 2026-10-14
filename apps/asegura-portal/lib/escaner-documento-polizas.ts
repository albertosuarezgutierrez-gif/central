// Las pólizas PROPIAS de una identidad que el escáner puede proponer o aceptar (13/10/2026).
// 🔒 Solo las suyas: fichas propias de la cartera + las que aportó ella. Nunca las autorizadas ni
// las de intervinientes: archivar un papel en la póliza de otro no es de este botón. El id viaja
// con prefijo (`c:` cartera, `d:` declarada) porque son dos espacios de uuid distintos.
import { randomUUID } from 'node:crypto'

import { carteraDeIdentidad } from './cartera-lectura'
import { prisma } from './db'
import { DECLARADA_NO_ELIMINADA } from './declaradas-eliminadas'
import { MAX_ARCHIVOS_POR_DIA, MAX_ESCANEOS_POR_DIA, prefijoArchivosDelDia, prefijoEscaneosDelDia, type PolizaCandidata } from './escaner-documento'
import { getIdentidad } from './session'

/**
 * Puerta pública: la identidad sale de la COOKIE (`lib/session`), nunca de quien llama.
 * `null` = sin sesión (≠ `[]`, que es «no tiene pólizas propias»).
 */
export async function polizasPropiasParaEscanerDeSesion(): Promise<PolizaCandidata[] | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return polizasPropiasParaEscaner(identidad.id)
}

async function polizasPropiasParaEscaner(identidadId: string): Promise<PolizaCandidata[]> {
  const [cartera, declaradas] = await Promise.all([
    carteraDeIdentidad(identidadId),
    prisma.portalPolizaDeclarada.findMany({
      where: { identidadId, ...DECLARADA_NO_ELIMINADA },
      select: { id: true, compania: true, numeroPoliza: true },
      take: 200,
    }),
  ])
  return [
    ...cartera.propias.flatMap((t) => t.polizas.map((p) => ({ id: `c:${p.id}`, compania: p.compania, numeroPoliza: p.numeroPoliza }))),
    ...declaradas.map((d) => ({ id: `d:${d.id}`, compania: d.compania, numeroPoliza: d.numeroPoliza })),
  ]
}

/**
 * Reserva UN escaneo del cupo diario de la identidad de la sesión (`MAX_ESCANEOS_POR_DIA`), en BD.
 * Cuenta antes (pasado el tope no escribe: un abuso no hace crecer la tabla) e inserta y vuelve a contar
 * después (dos peticiones a la vez se ven la una a la otra: no se cuelan las dos con el último hueco).
 * `null` = sin sesión. Un fallo de BD LANZA: quien llama no lo convierte en «hay cupo».
 */
export async function reservarEscaneoDeSesion(ahora: Date = new Date()): Promise<'ok' | 'tope' | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return reservarCupoDelDia(identidad.id, prefijoEscaneosDelDia(ahora), MAX_ESCANEOS_POR_DIA, ahora)
}

/** Lo mismo para ARCHIVAR (paso 2, `MAX_ARCHIVOS_POR_DIA`): tope en BD, no en memoria por instancia. */
export async function reservarArchivoDeSesion(ahora: Date = new Date()): Promise<'ok' | 'tope' | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return reservarCupoDelDia(identidad.id, prefijoArchivosDelDia(ahora), MAX_ARCHIVOS_POR_DIA, ahora)
}

async function reservarCupoDelDia(identidadId: string, prefijo: string, max: number, ahora: Date): Promise<'ok' | 'tope'> {
  const delDia = { identidadId, clave: { startsWith: prefijo } }
  if ((await prisma.portalAvisoLeido.count({ where: delDia })) >= max) return 'tope'
  await prisma.portalAvisoLeido.create({ data: { identidadId, clave: `${prefijo}${randomUUID()}`, creadoEn: ahora }, select: { clave: true } })
  return (await prisma.portalAvisoLeido.count({ where: delDia })) > max ? 'tope' : 'ok'
}
