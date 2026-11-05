// Puerto de hechos: `medio` del cobro/pago (efectivo|bizum|transferencia|tarjeta|otro) y su cuenta (570/572), `categoria` de línea,
// `dimensiones`; y la plantilla del sector que se aplica de verdad al asentar. Rechazos claros (400) de lo desconocido.
// Cepo visto fallar el 05/11/2026: quitar `'medio'` de PERMITIDOS.cobro en lib/hecho-entrada.ts → rojo en «acepta cada medio».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsearEntradaHecho } from '../lib/hecho-entrada.ts'
import { recibirHecho, reglasEfectivas } from '../lib/servicio.ts'
import { guardarReglaEmpresa } from '../lib/reglas.ts'
import { bloquesDeReglas } from '../lib/reglas-vista.ts'
import { crearAlmacen } from './_repo-memoria.ts'
import { rentabilidadDeFilas, MEDIOS_PAGO } from '@central/module-contabilidad'
import { datosRentabilidad, elegirDimension } from '../lib/rentabilidad.ts'

const A = '00000000-0000-4000-8000-00000000000a'
const E = '00000000-0000-4000-8000-0000000000e1'
const cobro = (extra: Record<string, unknown> = {}, ref = 'K-1') => ({ empresaId: A, hecho: { tipo: 'cobro', fecha: '2026-03-12', ref, importe: 5000, ...extra } })

test('el puerto acepta CADA medio de cobro y de pago; sin medio sigue valiendo', () => {
  for (const medio of MEDIOS_PAGO) {
    const c = parsearEntradaHecho(cobro({ medio }))
    assert.ok(c.ok, `cobro/${medio}`)
    assert.equal(c.ok && (c.valor.hecho as { medio?: string }).medio, medio)
    assert.ok(parsearEntradaHecho({ empresaId: A, hecho: { tipo: 'pago', fecha: '2026-03-12', ref: 'P', importe: 1, medio } }).ok, `pago/${medio}`)
  }
  assert.ok(parsearEntradaHecho(cobro()).ok)
})

test('medio desconocido o mal tipado → 400 claro; el medio no entra en ventas', () => {
  for (const medio of ['cheque', 'BIZUM', 3, null, '']) {
    const r = parsearEntradaHecho(cobro({ medio }))
    assert.equal(r.ok, false)
    assert.match(!r.ok ? r.errores.join() : '', /medio no admitido/)
  }
  const v = parsearEntradaHecho({ empresaId: A, hecho: { tipo: 'venta', fecha: '2026-03-12', ref: 'F', desglose: [{ base: 1, tipoIva: 21 }], medio: 'bizum' } })
  assert.match(!v.ok ? v.errores.join() : '', /campo no admitido en un hecho de venta: medio/)
})

test('categoría de línea y dimensiones: se validan y llegan al hecho', () => {
  const ok = parsearEntradaHecho({ empresaId: A, hecho: { tipo: 'venta', fecha: '2026-03-12', ref: 'F', desglose: [{ base: 100, tipoIva: 21, categoria: 'mano_obra' }], dimensiones: { ot: ' OT-7 ', mecanico: 'Pepe' } } })
  assert.ok(ok.ok)
  assert.deepEqual(ok.ok && (ok.valor.hecho as { dimensiones?: unknown }).dimensiones, { ot: 'OT-7', mecanico: 'Pepe' })
  for (const mal of [{ dimensiones: { 'Mal Nombre': 'x' } }, { dimensiones: { ot: '' } }, { dimensiones: [] }, { dimensiones: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}x`, 'v'])) }]) {
    assert.equal(parsearEntradaHecho({ empresaId: A, hecho: { tipo: 'venta', fecha: '2026-03-12', ref: 'F', desglose: [{ base: 1, tipoIva: 21 }], ...mal } }).ok, false)
  }
  assert.equal(parsearEntradaHecho({ empresaId: A, hecho: { tipo: 'venta', fecha: '2026-03-12', ref: 'F', desglose: [{ base: 1, tipoIva: 21, categoria: 'Mano Obra' }] } }).ok, false)
})

test('al asentar, el medio decide la cuenta: efectivo → 570, bizum/transferencia/tarjeta/otro → 572, sin medio → 572', async () => {
  const al = crearAlmacen(); al.empresaLista(A).origenes.add('taller')
  const esperado: Record<string, string> = { efectivo: '570', bizum: '572', transferencia: '572', tarjeta: '572', otro: '572' }
  for (const medio of MEDIOS_PAGO) {
    const p = parsearEntradaHecho(cobro({ medio }, `K-${medio}`))
    assert.ok(p.ok)
    const r = await recibirHecho(al.repo(A), 'taller', p.ok ? p.valor.hecho : (null as never))
    assert.equal(r.resultado, 'asentado', medio)
    const asiento = al.datos(A).asientos.at(-1)!
    assert.equal(asiento.apuntes[0].cuenta, esperado[medio], medio)
  }
  const sin = await recibirHecho(al.repo(A), 'taller', { tipo: 'cobro', fecha: '2026-03-13', ref: 'K-sin', importe: 100 })
  assert.equal(sin.resultado, 'asentado')
  assert.equal(al.datos(A).asientos.at(-1)!.apuntes[0].cuenta, '572')
})

test('la plantilla del sector se aplica al asentar (taller: mano de obra 705 y recambio 700) y la regla de la empresa la pisa', async () => {
  const al = crearAlmacen(); al.empresaLista(A, 2026, 'abierto', 'taller').origenes.add('taller')
  const venta = { tipo: 'venta' as const, fecha: '2026-03-10', ref: 'F-T', desglose: [{ base: 8000, tipoIva: 21, categoria: 'mano_obra' }, { base: 2000, tipoIva: 21, categoria: 'recambio' }] }
  assert.equal((await recibirHecho(al.repo(A), 'taller', venta)).resultado, 'asentado')
  assert.deepEqual(al.datos(A).asientos[0].apuntes.map((p) => p.cuenta), ['430', '705', '700', '477'])
  // La empresa decide que el recambio vaya a 701 (existe en el plan): precedencia empresa > sector.
  const g = await guardarReglaEmpresa(al.repo(A), 'venta', { 'categoria:recambio': '701' }, E)
  assert.deepEqual(g, { ok: true, version: 1 })
  await recibirHecho(al.repo(A), 'taller', { ...venta, ref: 'F-T2' })
  assert.deepEqual(al.datos(A).asientos[1].apuntes.map((p) => p.cuenta), ['430', '705', '701', '477'])
  assert.equal(al.datos(A).auditoria.some((x) => x.accion === 'guardar_regla'), true)
  assert.equal(reglasEfectivas({}, 'taller').venta.ingreso, '705')
  // Una venta SIN categoría con el sector taller se asienta igual que antes (sin regresión).
  assert.equal(reglasEfectivas({}, 'taller').compra.gasto, '600')
})

test('guardar reglas: rechaza cuentas que no existen / no son hoja / medios desconocidos, y NO consume versión', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const repo = al.repo(A)
  assert.deepEqual(await guardarReglaEmpresa(repo, 'venta', { ingreso: '999' }, E), { ok: false, errores: ['ingreso: la cuenta 999 no existe en el plan'] })
  const r = await guardarReglaEmpresa(repo, 'cobro', { 'medio:cheque': '572' }, E)
  assert.equal(r.ok, false)
  assert.equal((await guardarReglaEmpresa(repo, 'xx', { a: '1' }, E)).ok, false)
  assert.equal(al.datos(A).reglas.length, 0)
  // Cuenta ya dividida en subcuentas (no hoja): rechazada.
  al.datos(A).plan = al.datos(A).plan.map((c) => (c.codigo === '705' ? { ...c, admiteApuntes: false } : c))
  assert.match(JSON.stringify(await guardarReglaEmpresa(repo, 'venta', { ingreso: '705' }, E)), /nivel hoja/)
  // Válida: versiona.
  assert.deepEqual(await guardarReglaEmpresa(repo, 'cobro', { 'medio:tarjeta': '570' }, E), { ok: true, version: 1 })
  assert.deepEqual(await guardarReglaEmpresa(repo, 'cobro', { 'medio:tarjeta': '572', 'medio:efectivo': '570' }, E), { ok: true, version: 2 })
})

test('pantalla de reglas: efectivo → 570 y resto → 572 mostrados con su procedencia; lo editado figura como «empresa»', () => {
  const cobros = bloquesDeReglas('generico', { cobro: { 'medio:bizum': '570' } }).find((b) => b.tipo === 'cobro')!
  const f = (k: string) => cobros.filas.find((x) => x.clave === k)!
  assert.equal(f('medio:efectivo').valor, '570')
  assert.equal(f('medio:tarjeta').valor, '572')
  assert.equal(f('medio:bizum').valor, '570')
  assert.equal(f('medio:bizum').procedencia, 'empresa')
  assert.equal(f('medio:bizum').propia, true)
  assert.equal(f('medio:bizum').base, '572')
  assert.equal(f('medio:transferencia').propia, false)
  const venta = bloquesDeReglas('taller', {}).find((b) => b.tipo === 'venta')!
  assert.equal(venta.filas.find((x) => x.clave === 'categoria:recambio')!.valor, '700')
  assert.equal(venta.filas.find((x) => x.clave === 'categoria:recambio')!.procedencia, 'sector')
})

test('rentabilidad por dimensión con hechos reales: la dimensión viaja del hecho al libro y la lista blanca del sector manda', async () => {
  const al = crearAlmacen(); al.empresaLista(A, 2026, 'abierto', 'taller').origenes.add('taller')
  const v = (ref: string, base: number, ot?: string) => ({ tipo: 'venta' as const, fecha: '2026-03-10', ref, desglose: [{ base, tipoIva: 21 }], ...(ot ? { dimensiones: { ot } } : {}) })
  await recibirHecho(al.repo(A), 'taller', v('F1', 10000, 'OT-1'))
  await recibirHecho(al.repo(A), 'taller', { tipo: 'compra', fecha: '2026-03-11', ref: 'C1', desglose: [{ base: 4000, tipoIva: 21 }], dimensiones: { ot: 'OT-1' } })
  await recibirHecho(al.repo(A), 'taller', v('F2', 500))
  const { dimension, filas } = await datosRentabilidad(al.repo(A), 'taller', 'ot', { desde: '2026-01-01', hasta: '2026-12-31' })
  assert.equal(dimension.clave, 'ot')
  assert.deepEqual(filas.map((x) => [x.valor, x.margen]), [['OT-1', 6000], [null, 500]])
  assert.equal(elegirDimension('taller', "ot'; DROP TABLE x").clave, 'ot')
  assert.equal(elegirDimension('hosteleria', 'ot').clave, 'producto')
  assert.deepEqual(rentabilidadDeFilas([]), [])
})
