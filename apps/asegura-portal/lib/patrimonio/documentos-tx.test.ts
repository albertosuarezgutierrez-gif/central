import { test } from 'node:test'
import assert from 'node:assert/strict'

import { guardarConTope, type TxMin } from './documentos-tx.ts'

/** `tx` falso: anota cada sentencia en orden. */
export function txFalso(o: { cuenta?: number; cuentaMes?: number; filas?: Record<string, unknown>[]; selloCount?: number; gastoCount?: number } = {}) {
  const log: string[] = []
  const args: Record<string, unknown[]> = {}
  const anota = (k: string, a: unknown) => { log.push(k); (args[k] ??= []).push(a) }
  let n = 0
  const filas = [...(o.filas ?? [])]
  const tx: TxMin = {
    $executeRaw: async (s, ...v) => { anota('lock', { sql: s.join('?'), v }); return 1 },
    portalPatrimonioDocumento: {
      count: async (a) => { anota('doc.count', a); return o.cuenta ?? 0 },
      create: async (a) => { anota('doc.create', a); return { id: `doc${++n}` } },
      findFirst: async (a) => { anota('doc.find', a); return filas.shift() ?? null },
      updateMany: async (a) => { anota('doc.update', a); return { count: o.selloCount ?? 1 } },
    },
    portalPatrimonioGasto: {
      // El recuento del mes va por titular (`titularId`); el del día, por identidad.
      count: async (a) => { anota('gasto.count', a); return (a as { where: { titularId?: string } }).where.titularId ? (o.cuentaMes ?? 0) : (o.cuenta ?? 0) },
      create: async (a) => { anota('gasto.create', a); return { id: 'g1' } },
      findFirst: async (a) => { anota('gasto.find', a); return filas.shift() ?? null },
      updateMany: async (a) => { anota('gasto.update', a); return { count: o.gastoCount ?? 1 } },
    },
  }
  return { tx, log, args }
}

const base = { identidadId: 'ident', titularId: 'tit', owner: { tipo: 'inmueble' as const, id: 'inm' }, carpeta: 'facturas', nombre: 'a.pdf', mime: 'application/pdf', sha256: 'a'.repeat(64), contenido: Buffer.from('%PDF-x'), desde: new Date('2026-10-22T00:00:00Z'), max: 40 }

test('tope de documentos: lock → count → create, en ese orden y en el mismo tx', async () => {
  const { tx, log, args } = txFalso()
  const r = await guardarConTope(tx, base)
  assert.deepEqual(log, ['lock', 'doc.count', 'doc.create'])
  assert.deepEqual(r, { ok: true, id: 'doc1' })
  assert.match((args.lock[0] as { sql: string }).sql, /pg_advisory_xact_lock/)
  assert.deepEqual((args.lock[0] as { v: unknown[] }).v, ['portal-documento:ident'])
})

test('tope de documentos: en el tope NO inserta (lock → count y nada más)', async () => {
  const { tx, log } = txFalso({ cuenta: 40 })
  assert.deepEqual(await guardarConTope(tx, base), { ok: false, motivo: 'tope' })
  assert.deepEqual(log, ['lock', 'doc.count'])
})
