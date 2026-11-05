// Compras: factura recibida (manual) → hecho `compra` → asiento cuadrado; duplicado; NIF; retención; pagos con medio (570/572).
// Cepos vistos fallar el 05/11/2026: (1) desactivar la comprobación de duplicado en `registrarFacturaRecibida` → rojo en «DUPLICADO»;
// (2) saltarse `problemasDeNif` (core-fiscal) → rojo en «NIF inválido»; (3) quitar la retención del hecho (module-contabilidad) → rojo en
// «retención IRPF». Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { totalesAsiento, type EntradaFacturaRecibida } from '@central/module-contabilidad'
import { pendientesDePago, registrarFacturaRecibida, registrarPago, sugerirProveedor } from '../lib/compras.ts'
import { crearAlmacen } from './_repo-memoria.ts'

const A = '00000000-0000-4000-8000-00000000000a'
const HOY = new Date('2026-11-05T10:00:00Z')
const meta = { usuarioId: '00000000-0000-4000-8000-0000000000f1', hoy: HOY }

const factura: EntradaFacturaRecibida = {
  proveedor: { nif: 'b-12345674', nombre: ' Recambios Sur SL ' }, numero: '2026/0045', fecha: '2026-11-03',
  lineas: [{ base: 10000, tipoIva: 21, categoria: 'mercaderias' }, { base: 5000, tipoIva: 10, categoria: 'suministros' }], adjuntoRef: 'drive:factura-045.pdf',
}

const nuevo = (sector = 'generico') => { const al = crearAlmacen(); al.empresaLista(A, 2026, 'abierto', sector); return { al, repo: al.repo(A) } }
const suma = (a: { apuntes: readonly { cuenta: string; debe: number; haber: number }[] }, cuenta: string, lado: 'debe' | 'haber') => a.apuntes.filter((p) => p.cuenta === cuenta).reduce((t, p) => t + p[lado], 0)

test('factura recibida: asiento CUADRADO (gasto + 472 / 400), factura guardada, proveedor recordado y auditoría', async () => {
  const { al, repo } = nuevo()
  const r = await registrarFacturaRecibida(repo, factura, meta)
  assert.ok(r.ok, JSON.stringify(r))
  assert.deepEqual([r.base, r.cuota, r.total, r.aPagar], [15000, 2600, 17600, 17600])
  const d = al.datos(A)
  assert.equal(d.asientos.length, 1)
  const a = d.asientos[0]
  assert.equal(totalesAsiento({ apuntes: a.apuntes } as never).debe, totalesAsiento({ apuntes: a.apuntes } as never).haber)
  assert.equal(suma(a, '600', 'debe'), 10000)
  assert.equal(suma(a, '628', 'debe'), 5000)
  assert.equal(suma(a, '472', 'debe'), 2600)
  assert.equal(suma(a, '400', 'haber'), 17600)
  assert.equal(d.f3.facturas[0].proveedorNif, 'B12345674')
  assert.equal(d.f3.facturas[0].adjuntoRef, 'drive:factura-045.pdf') // solo la referencia
  assert.equal(d.f3.proveedores[0].categoria, 'mercaderias')
  assert.ok(d.auditoria.some((x) => x.accion === 'registrar_factura_recibida'))
})

test('NIF inválido (letra de control mala) → rechazada sin tocar el libro', async () => {
  const { al, repo } = nuevo()
  const r = await registrarFacturaRecibida(repo, { ...factura, proveedor: { nif: '12345678A', nombre: 'Mal' } }, meta)
  assert.ok(!r.ok && r.motivo === 'datos')
  assert.match(!r.ok ? r.errores.join(' ') : '', /letra del NIF/)
  assert.equal(al.datos(A).asientos.length, 0)
  assert.equal(al.datos(A).hechos.length, 0)
  const r2 = await registrarFacturaRecibida(repo, { ...factura, proveedor: { nif: 'B12345670', nombre: 'Mal CIF' } }, meta)
  assert.ok(!r2.ok && r2.motivo === 'datos')
})

test('DUPLICADO: mismo NIF y número (aunque cambien mayúsculas, espacios, guiones o ceros) → rechazado; no genera otro asiento ni otro hecho', async () => {
  const { al, repo } = nuevo()
  assert.ok((await registrarFacturaRecibida(repo, factura, meta)).ok)
  for (const variante of [{ ...factura }, { ...factura, numero: ' 2026/45 ' }, { ...factura, proveedor: { ...factura.proveedor, nif: 'B 12345674' } }, { ...factura, fecha: '2026-11-04' }]) {
    const r = await registrarFacturaRecibida(repo, variante, meta)
    assert.ok(!r.ok && r.motivo === 'duplicado', JSON.stringify(r))
  }
  assert.equal(al.datos(A).asientos.length, 1)
  assert.equal(al.datos(A).hechos.length, 1)
  assert.equal(al.datos(A).f3.facturas.length, 1)
  // otro número del mismo proveedor y el mismo número de OTRO proveedor sí entran
  assert.ok((await registrarFacturaRecibida(repo, { ...factura, numero: '2026/46' }, meta)).ok)
  assert.ok((await registrarFacturaRecibida(repo, { ...factura, proveedor: { nif: 'A58818501', nombre: 'Otro SA' } }, meta)).ok)
})

test('retención IRPF: 623 + 472 / 410 por el neto + 4751 por la retención; cuadra y «a pagar» = total − retención', async () => {
  const { al, repo } = nuevo()
  const r = await registrarFacturaRecibida(repo, {
    proveedor: { nif: '12345678Z', nombre: 'Ana Gestora' }, numero: 'F-7', fecha: '2026-11-02',
    lineas: [{ base: 20000, tipoIva: 21, categoria: 'profesionales' }], retencionPct: 15,
  }, meta)
  assert.ok(r.ok, JSON.stringify(r))
  assert.deepEqual([r.retencion, r.total, r.aPagar], [3000, 24200, 21200])
  const a = al.datos(A).asientos[0]
  assert.equal(suma(a, '623', 'debe'), 20000)
  assert.equal(suma(a, '472', 'debe'), 4200)
  assert.equal(suma(a, '4751', 'haber'), 3000)
  assert.equal(suma(a, '410', 'haber'), 21200)
  assert.equal(suma(a, '400', 'haber'), 0)
  assert.equal(a.apuntes.reduce((t, p) => t + p.debe, 0), a.apuntes.reduce((t, p) => t + p.haber, 0))
  assert.deepEqual([al.datos(A).f3.proveedores[0].tipo, al.datos(A).f3.proveedores[0].retencionPct], ['acreedor', 15])
})

test('proveedor recordado: la próxima vez se sugiere su categoría y retención; uno desconocido devuelve null', async () => {
  const { repo } = nuevo()
  await registrarFacturaRecibida(repo, { proveedor: { nif: '12345678Z', nombre: 'Ana' }, numero: '1', fecha: '2026-11-02', lineas: [{ base: 1000, tipoIva: 21, categoria: 'profesionales' }], retencionPct: 15 }, meta)
  assert.deepEqual(await sugerirProveedor(repo, '12345678z'), { nif: '12345678Z', nombre: 'Ana', tipo: 'acreedor', categoria: 'profesionales', retencionPct: 15 })
  assert.equal(await sugerirProveedor(repo, 'B12345674'), null)
  assert.equal(await sugerirProveedor(repo, 'no es un nif'), null)
})

test('plantilla del taller: «trabajos_terceros» va a 607; la regla de la empresa manda sobre la plantilla', async () => {
  const { al, repo } = nuevo('taller')
  await registrarFacturaRecibida(repo, { ...factura, lineas: [{ base: 10000, tipoIva: 21, categoria: 'trabajos_terceros' }] }, meta)
  assert.equal(suma(al.datos(A).asientos[0], '607', 'debe'), 10000)
})

test('ejercicio inexistente o cerrado: la factura NO se guarda como registrada (el llamador revierte); el motivo se dice', async () => {
  const { repo } = nuevo()
  const r = await registrarFacturaRecibida(repo, { ...factura, fecha: '2025-12-30' }, meta)
  assert.ok(!r.ok && r.motivo === 'no_asentada')
  assert.match(!r.ok ? r.errores.join(' ') : '', /ejercicio 2025/)
  const al2 = crearAlmacen(); al2.empresaLista(A, 2026, 'cerrado')
  const r2 = await registrarFacturaRecibida(al2.repo(A), factura, meta)
  assert.ok(!r2.ok && r2.motivo === 'no_asentada')
  assert.equal(al2.datos(A).f3.facturas.length, 0)
})

test('forma: fecha futura, sin líneas, base con decimales → lista de problemas', async () => {
  const { repo } = nuevo()
  const r = await registrarFacturaRecibida(repo, { ...factura, fecha: '2026-12-31', lineas: [{ base: 12.5, tipoIva: 21 }] }, meta)
  assert.ok(!r.ok && r.motivo === 'datos')
  assert.ok(!r.ok && r.errores.length >= 2)
})

test('pagos: banco (572) y efectivo (570), parcial y total; el asiento cuadra y la partida se va cerrando', async () => {
  const { al, repo } = nuevo()
  await registrarFacturaRecibida(repo, factura, meta)
  const [p0] = await pendientesDePago(repo, HOY)
  assert.deepEqual([p0.cuenta, p0.pendiente, p0.documento], ['400', 17600, 'B12345674 2026/0045'])

  const p1 = await registrarPago(repo, { documento: p0.documento, importe: 10000, fecha: '2026-11-04', medio: 'transferencia' }, meta)
  assert.ok(p1.ok && p1.pendienteTras === 7600, JSON.stringify(p1))
  const p2 = await registrarPago(repo, { documento: p0.documento, importe: 7600, fecha: '2026-11-05', medio: 'efectivo' }, meta)
  assert.ok(p2.ok && p2.pendienteTras === 0)

  const [, a1, a2] = al.datos(A).asientos
  assert.deepEqual([suma(a1, '400', 'debe'), suma(a1, '572', 'haber'), suma(a1, '570', 'haber')], [10000, 10000, 0])
  assert.deepEqual([suma(a2, '400', 'debe'), suma(a2, '570', 'haber'), suma(a2, '572', 'haber')], [7600, 7600, 0])
  for (const a of [a1, a2]) assert.equal(a.apuntes.reduce((t, p) => t + p.debe, 0), a.apuntes.reduce((t, p) => t + p.haber, 0))
  assert.deepEqual(await pendientesDePago(repo, HOY), [])
})

test('pago con retención: el pendiente es el NETO en 410 y se paga contra 410', async () => {
  const { al, repo } = nuevo()
  await registrarFacturaRecibida(repo, { proveedor: { nif: '12345678Z', nombre: 'Ana' }, numero: 'F-7', fecha: '2026-11-02', lineas: [{ base: 20000, tipoIva: 21, categoria: 'profesionales' }], retencionPct: 15 }, meta)
  const [p] = await pendientesDePago(repo, HOY)
  assert.deepEqual([p.cuenta, p.pendiente], ['410', 21200])
  const r = await registrarPago(repo, { documento: p.documento, importe: 21200, fecha: '2026-11-05', medio: 'transferencia' }, meta)
  assert.ok(r.ok)
  assert.equal(suma(al.datos(A).asientos[1], '410', 'debe'), 21200)
})

test('pago rechazado: más de lo pendiente, factura inexistente, importe 0, fecha futura, medio raro', async () => {
  const { al, repo } = nuevo()
  await registrarFacturaRecibida(repo, factura, meta)
  const doc = 'B12345674 2026/0045'
  const malos = [
    { documento: doc, importe: 17601, fecha: '2026-11-05', medio: 'transferencia' }, { documento: 'NO EXISTE', importe: 100, fecha: '2026-11-05', medio: 'transferencia' },
    { documento: doc, importe: 0, fecha: '2026-11-05', medio: 'transferencia' }, { documento: doc, importe: 100, fecha: '2026-12-31', medio: 'transferencia' },
    { documento: doc, importe: 100, fecha: '2026-11-05', medio: 'cheque' },
  ]
  for (const m of malos) assert.equal((await registrarPago(repo, m as never, meta)).ok, false, JSON.stringify(m))
  assert.equal(al.datos(A).asientos.length, 1)
})
