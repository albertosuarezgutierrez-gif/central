// PATRIMONIO (27/10/2026, P7) — lectura con BD del informe anual para el gestor. La cuenta es `informeFiscal` (fiscal.ts) sobre
// `rentabilidadDeIdentidad`; esto solo añade QUÉ titular es cada inmueble para agrupar por identidad.
//
// 🚨 Parte de `accesosPatrimonio(identidadId)`: el titular que llega en la URL NO consulta, se busca DENTRO de los accesos
// (`titularPermitido`); el que no está = `no_encontrado` (404, nunca 403). Lanza si la BD falla: jamás un informe con ceros.
import { prisma } from '../db'
import { getIdentidad } from '../session'
import { accesosPatrimonio, titularPermitido } from './accesos'
import { informeFiscal } from './fiscal'
import { informeGestor, type InformeGestor, type TitularDeInmueble } from './informe-gestor'
import { rentabilidadDeIdentidad } from './rentabilidad-bd'

export type ResultadoInformeGestor =
  | { kind: 'ok'; informe: InformeGestor; titulares: { id: string; nombre: string }[] }
  | { kind: 'sin_patrimonio' }
  | { kind: 'no_encontrado' }

/** `anio` y `titular` llegan de la URL sin fiar. `titular` = `cliente_id` de la ficha del titular. */
export async function informeGestorDeIdentidad(identidadId: string, anio: unknown, titular?: unknown): Promise<ResultadoInformeGestor> {
  if ((await getIdentidad())?.id !== identidadId) return { kind: 'sin_patrimonio' }
  const accesos = await accesosPatrimonio(identidadId)
  if (accesos.size === 0) return { kind: 'sin_patrimonio' }
  const pedido = titular === undefined || titular === null || titular === '' ? undefined : titularPermitido(titular, accesos)
  if (pedido === null) return { kind: 'no_encontrado' }

  const d = await rentabilidadDeIdentidad(identidadId, anio)
  if (!d) return { kind: 'sin_patrimonio' }
  const filas = await prisma.portalPatrimonioInmueble.findMany({
    where: { id: { in: d.inmuebles.map((i) => i.id) }, archivadoEn: null, titular: { clienteId: { in: [...accesos.keys()] }, archivadoEn: null } },
    select: { id: true, titular: { select: { clienteId: true } } },
  })
  const metaDe = new Map(d.inmuebles.map((i) => [i.id, i]))
  const titularDe = new Map<string, TitularDeInmueble>(filas.map((f) => [f.id, { id: f.titular.clienteId, nombre: metaDe.get(f.id)?.titular ?? '', alias: metaDe.get(f.id)?.alias }]))
  const informe = informeGestor(informeFiscal(d.resultado, d.inmuebles, d.periodo), titularDe, pedido)
  const vistos = new Map<string, string>()
  for (const t of titularDe.values()) if (!vistos.has(t.id)) vistos.set(t.id, t.nombre)
  return { kind: 'ok', informe, titulares: [...vistos].map(([id, nombre]) => ({ id, nombre })) }
}
