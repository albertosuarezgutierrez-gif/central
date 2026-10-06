/**
 * ¿Quién llama? (05/10/2026). Búsqueda por teléfono SOLO por índice ciego y exacta: se prueban
 * las variantes de dígitos con las que el teléfono puede estar hasheado (`34600…`, `600…`,
 * `0034600…`) en `clientes` y en `cliente_telefonos`. Solo lectura; devuelve nombre y si es
 * cliente en vigor o lead. Ni DNI, ni dirección, ni pólizas.
 *
 * Pensado para una futura app móvil (identificar la llamada entrante); hoy lo consume quien
 * tenga el Bearer de operador.
 *
 * 🚨 Tres desenlaces: `sin_clave_lookup` (no se PUEDE buscar: falta PII_LOOKUP_KEY) ≠
 * `no_encontrado` (se buscó y no hay; y aun así puede ser una ficha sin hash) ≠ `ok`.
 */
import { sqlCarteraEnVigor } from '@central/module-seguros'
import { variantesIndiceTelefono } from '@central/module-seguros/telefono-e164'
import { computeTelefonoLookupHash } from '@central/module-seguros-pii'

import { prismaAsegura } from './asegura-db'
import { Prisma } from './generated/asegura-client'

export type CoincidenciaLlamada = { clienteId: string; nombre: string; apellidos: string; grupo: 'cliente' | 'lead' }

export type ResultadoLlamada =
  | { estado: 'invalido' }
  | { estado: 'sin_clave_lookup' }
  | { estado: 'no_encontrado'; nota: string }
  | { estado: 'ok'; coincidencias: CoincidenciaLlamada[] }

const MAX = 20

export async function quienLlama(correduriaId: string, tel: string): Promise<ResultadoLlamada> {
  const variantes = variantesIndiceTelefono(tel).filter((v) => v.length >= 6)
  if (variantes.length === 0) return { estado: 'invalido' }
  const hashes = variantes.map((v) => computeTelefonoLookupHash(v)).filter((h): h is string => h !== null)
  if (hashes.length === 0) return { estado: 'sin_clave_lookup' }

  const db = prismaAsegura()
  const [directos, secundarios] = await Promise.all([
    db.cliente.findMany({ where: { correduriaId, telefonoLookupHash: { in: hashes } }, select: { id: true, mergedIntoClienteId: true }, take: MAX }),
    db.clienteTelefono.findMany({ where: { correduriaId, telefonoLookupHash: { in: hashes } }, select: { clienteId: true }, take: MAX }),
  ])
  // Si el hash está en una ficha fusionada, la persona es la superviviente.
  const ids = new Set<string>()
  for (const d of directos) ids.add(d.mergedIntoClienteId ?? d.id)
  const sec = secundarios.map((s) => s.clienteId)
  if (sec.length) {
    const fichas = await db.cliente.findMany({ where: { correduriaId, id: { in: sec } }, select: { id: true, mergedIntoClienteId: true } })
    for (const f of fichas) ids.add(f.mergedIntoClienteId ?? f.id)
  }
  if (ids.size === 0) {
    return { estado: 'no_encontrado', nota: 'Búsqueda exacta por índice ciego: una ficha cuyo teléfono no tiene hash no aparece.' }
  }

  const lista = [...ids].slice(0, MAX)
  const [fichas, vigor] = await Promise.all([
    db.cliente.findMany({ where: { correduriaId, id: { in: lista }, mergedIntoClienteId: null }, select: { id: true, nombre: true, apellidos: true } }),
    db.$queryRaw<{ id: string }[]>(Prisma.sql`
      select distinct p.cliente_id::text as id
      from polizas p
      where p.correduria_id = ${correduriaId}::uuid and p.cliente_id::text in (${Prisma.join(lista)})
        and p.merged_into_poliza_id is null
        and ${Prisma.raw(sqlCarteraEnVigor('p'))}`),
  ])
  const enVigor = new Set(vigor.map((v) => v.id))
  const coincidencias = fichas.map((f) => ({ clienteId: f.id, nombre: f.nombre, apellidos: f.apellidos, grupo: enVigor.has(f.id) ? ('cliente' as const) : ('lead' as const) }))
  if (coincidencias.length === 0) return { estado: 'no_encontrado', nota: 'El hash casa con una ficha que ya no está disponible.' }
  coincidencias.sort((a, b) => (a.grupo === b.grupo ? 0 : a.grupo === 'cliente' ? -1 : 1))
  return { estado: 'ok', coincidencias }
}
