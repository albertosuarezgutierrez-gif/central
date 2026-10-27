import { test } from 'node:test'
import assert from 'node:assert/strict'

import { txFalso } from './documentos-tx.test.ts'
import { ConfirmacionAdelantada, confirmarGasto, reservarConTope } from './facturas-tx.ts'
import { destinoDelFichero, reglaInmuebleSubida } from './facturas-regla.ts'
import type { DatosConfirmacion } from './facturas-api.ts'

const reserva = (inmuebleId: string | null) => ({
  identidadId: 'ident', titularId: 'tit', inmuebleId, carpetaFacturas: 'facturas',
  fichero: { nombre: 'f.pdf', mime: 'application/pdf', contenido: Buffer.from('%PDF-1') },
  desde: new Date('2026-10-22T00:00:00Z'), fechaMarcador: '2026-10-22', max: 20, cupoMes: 60, desdeMes: new Date('2026-10-01T00:00:00Z'), otrasLecturasMes: async () => 0, propuestaInicial: { v: 'normal' }, propuestaSinCupo: { v: 'sin_cupo' },
})

test('tope de facturas: lock → count → create gasto → create documento → repunte, todo en el mismo tx', async () => {
  const { tx, log, args } = txFalso()
  const r = await reservarConTope(tx, reserva('inm'))
  assert.deepEqual(log, ['lock', 'lock', 'gasto.count', 'gasto.count', 'gasto.create', 'doc.create', 'gasto.update'])
  assert.deepEqual(r, { ok: true, id: 'g1', documentoId: 'doc1', cupoAgotado: false })
  assert.deepEqual((args.lock[0] as { v: unknown[] }).v, ['portal-factura:ident'])
  assert.deepEqual((args.lock[1] as { v: unknown[] }).v, ['portal-cupo-ia:tit'], 'el cupo de IA se bloquea por TITULAR (lo comparte el volcado)')
})

test('cupo mensual: los VOLCADOS del mes cuentan en el mismo cupo que las facturas', async () => {
  const t = txFalso({ cuentaMes: 50 })
  const r = await reservarConTope(t.tx, { ...reserva(null), otrasLecturasMes: async () => 10 })
  assert.deepEqual(r, { ok: true, id: 'g1', documentoId: null, cupoAgotado: true })
  const t2 = txFalso({ cuentaMes: 50 })
  assert.deepEqual(await reservarConTope(t2.tx, { ...reserva(null), otrasLecturasMes: async () => 9 }), { ok: true, id: 'g1', documentoId: null, cupoAgotado: false })
})

test('tope de facturas: en el tope no se crea nada; sin inmueble no hay documento', async () => {
  const lleno = txFalso({ cuenta: 20 })
  assert.deepEqual(await reservarConTope(lleno.tx, reserva('inm')), { ok: false, motivo: 'tope' })
  assert.deepEqual(lleno.log, ['lock', 'lock', 'gasto.count'])
  const sin = txFalso()
  const r = await reservarConTope(sin.tx, reserva(null))
  assert.deepEqual(sin.log, ['lock', 'lock', 'gasto.count', 'gasto.count', 'gasto.create'])
  assert.deepEqual(r, { ok: true, id: 'g1', documentoId: null, cupoAgotado: false })
})

test('cupo mensual: se cuenta por TITULAR desde el inicio del mes, y agotado crea igual la fila pero sin promesa de lectura', async () => {
  const justo = txFalso({ cuentaMes: 59 })
  assert.deepEqual(await reservarConTope(justo.tx, reserva(null)), { ok: true, id: 'g1', documentoId: null, cupoAgotado: false })
  const lleno = txFalso({ cuentaMes: 60 })
  const r = await reservarConTope(lleno.tx, reserva('inm'))
  assert.deepEqual(r, { ok: true, id: 'g1', documentoId: 'doc1', cupoAgotado: true })
  const donde = (lleno.args['gasto.count'][1] as { where: Record<string, unknown> }).where
  assert.equal(donde.titularId, 'tit')
  assert.equal(donde.origen, 'factura')
  assert.deepEqual(donde.creadoEn, { gte: new Date('2026-10-01T00:00:00Z') })
  assert.deepEqual((lleno.args['gasto.create'][0] as { data: { propuesta: unknown } }).data.propuesta, { v: 'sin_cupo' })
  assert.deepEqual((justo.args['gasto.create'][0] as { data: { propuesta: unknown } }).data.propuesta, { v: 'normal' })
})

const datos = (inmuebleId: string | null): DatosConfirmacion => ({ inmuebleId, fecha: '2026-10-01', categoria: 'otros' as DatosConfirmacion['categoria'], concepto: null, baseCent: null, ivaCent: null, retencionCent: null, totalCent: 1000 })
const gasto = { estado: 'propuesto', inmuebleId: 'inm1', documentoId: 'docViejo', propuesta: { fuente: 'texto' } }
const viejo = { carpeta: 'facturas', nombre: 'f.pdf', mime: 'application/pdf', sha256: 'b'.repeat(64), contenido: new Uint8Array(Buffer.from('%PDF-1')) }
const x = (d: DatosConfirmacion) => ({ titularId: 'tit', identidadId: 'ident', gastoId: 'g1', datos: d, ahora: new Date('2026-10-22T10:00:00Z') })

test('confirmar con OTRO inmueble: copia al nuevo, sella el viejo y repunta el gasto (en ese orden)', async () => {
  const { tx, log, args } = txFalso({ filas: [gasto, viejo] })
  assert.equal(await confirmarGasto(tx, x(datos('inm2'))), 'ok')
  assert.deepEqual(log, ['gasto.find', 'doc.find', 'doc.create', 'doc.update', 'gasto.update'])
  const nuevo = (args['doc.create'][0] as { data: Record<string, unknown> }).data
  assert.equal(nuevo.inmuebleId, 'inm2')
  assert.equal(nuevo.titularId, 'tit')
  assert.deepEqual(nuevo.contenido, Buffer.from('%PDF-1'))
  assert.equal(nuevo.sha256, 'b'.repeat(64))
  const sello = args['doc.update'][0] as { where: { id: string; titularId: string }; data: Record<string, unknown> }
  assert.equal(sello.where.id, 'docViejo')
  assert.ok(sello.data.borradoEn instanceof Date)
  const g = (args['gasto.update'][0] as { data: Record<string, unknown> }).data
  assert.equal(g.documentoId, 'doc1')
  assert.equal(g.inmuebleId, 'inm2')
  assert.equal(g.estado, 'confirmado')
})

test('confirmar con el MISMO inmueble o «sin inmueble»: el documento no se toca', async () => {
  for (const d of [datos('inm1'), datos(null)]) {
    const { tx, log, args } = txFalso({ filas: [gasto] })
    assert.equal(await confirmarGasto(tx, x(d)), 'ok')
    assert.deepEqual(log, ['gasto.find', 'gasto.update'])
    assert.ok(!('documentoId' in (args['gasto.update'][0] as { data: object }).data))
  }
})

test('confirmar: gasto inexistente → no_encontrado; ya resuelto → ya_resuelto; sin escribir', async () => {
  const a = txFalso()
  assert.equal(await confirmarGasto(a.tx, x(datos('inm2'))), 'no_encontrado')
  assert.deepEqual(a.log, ['gasto.find'])
  const b = txFalso({ filas: [{ ...gasto, estado: 'confirmado' }] })
  assert.equal(await confirmarGasto(b.tx, x(datos('inm2'))), 'ya_resuelto')
  assert.deepEqual(b.log, ['gasto.find'])
})

test('confirmar: si el sello del viejo o el repunte del gasto no cuadran se LANZA (el tx se deshace)', async () => {
  const a = txFalso({ filas: [gasto, viejo], selloCount: 0 })
  await assert.rejects(confirmarGasto(a.tx, x(datos('inm2'))), ConfirmacionAdelantada)
  const b = txFalso({ filas: [gasto, viejo], gastoCount: 0 })
  await assert.rejects(confirmarGasto(b.tx, x(datos('inm2'))), ConfirmacionAdelantada)
})

test('regla de subida: con inmuebles hay que elegir; sin ninguno, aviso', () => {
  assert.equal(reglaInmuebleSubida(2, ''), 'elegir')
  assert.equal(reglaInmuebleSubida(2, '  '), 'elegir')
  assert.equal(reglaInmuebleSubida(2, 'inm1'), 'ok')
  assert.equal(reglaInmuebleSubida(0, ''), 'sin_inmuebles')
  assert.equal(reglaInmuebleSubida(0, 'inm1'), 'sin_inmuebles')
})

test('destino del fichero al confirmar', () => {
  assert.equal(destinoDelFichero('inm1', 'inm2'), 'se_traslada')
  assert.equal(destinoDelFichero('inm1', 'inm1'), 'queda')
  assert.equal(destinoDelFichero('inm1', ''), 'queda')
  assert.equal(destinoDelFichero(null, 'inm2'), 'sin_fichero')
})
