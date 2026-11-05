// Casos de uso: cuadre, inmutabilidad (contraasiento), idempotencia del puerto de hechos y bandeja «por clasificar».
// Cepos vistos fallar el 05/11/2026: (1) quitar la búsqueda previa por clave en `recibirHecho` → rojo en idempotencia/conflicto;
// (2) guardar el asiento manual sin pasar por `crearAsiento` → rojo en descuadrado/cuentas/float. Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recibirHecho, registrarAsientoManual, rectificarAsiento, reglasEfectivas } from '../lib/servicio.ts'
import { crearAlmacen } from './_repo-memoria.ts'
import type { HechoContable } from '@central/module-contabilidad'

const A = '00000000-0000-4000-8000-00000000000a'
const usuario = { actor: 'usuario' as const, usuarioId: '00000000-0000-4000-8000-0000000000f1' }

const venta: HechoContable = { tipo: 'venta', fecha: '2026-03-10', ref: 'F-2026-001', desglose: [{ base: 10000, tipoIva: 21 }] }

test('asiento manual cuadrado: se guarda con número correlativo y queda auditado', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const repo = al.repo(A)
  const r1 = await registrarAsientoManual(repo, { fecha: '2026-02-01', concepto: 'Aportación', apuntes: [{ cuenta: '572', debe: 300000, haber: 0 }, { cuenta: '100', debe: 0, haber: 300000 }] }, usuario)
  const r2 = await registrarAsientoManual(repo, { fecha: '2026-02-02', concepto: 'Compra', apuntes: [{ cuenta: '600', debe: 1000, haber: 0 }, { cuenta: '572', debe: 0, haber: 1000 }] }, usuario)
  assert.ok(r1.ok && r2.ok)
  assert.deepEqual([r1.ok && r1.numero, r2.ok && r2.numero], [1, 2])
  assert.equal(al.datos(A).auditoria.filter((x) => x.accion === 'asentar').length, 2)
})

test('asiento DESCUADRADO: rechazado por el núcleo y NO llega al repositorio', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const r = await registrarAsientoManual(al.repo(A), { fecha: '2026-02-01', concepto: 'Mal', apuntes: [{ cuenta: '572', debe: 1000, haber: 0 }, { cuenta: '100', debe: 0, haber: 999 }] }, usuario)
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.errores.join(' ') : '', /descuadrado/)
  assert.equal(al.datos(A).asientos.length, 0)
  assert.equal(al.datos(A).ejercicios[0].ultimo, 0, 'no se consume número')
})

test('asiento con cuenta inexistente, fuera de ejercicio o en ejercicio cerrado: rechazado', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const repo = al.repo(A)
  const mal1 = await registrarAsientoManual(repo, { fecha: '2026-02-01', concepto: 'x', apuntes: [{ cuenta: '999', debe: 1, haber: 0 }, { cuenta: '100', debe: 0, haber: 1 }] }, usuario)
  const mal2 = await registrarAsientoManual(repo, { fecha: '2025-12-31', concepto: 'x', apuntes: [{ cuenta: '572', debe: 1, haber: 0 }, { cuenta: '100', debe: 0, haber: 1 }] }, usuario)
  assert.equal(mal1.ok, false)
  assert.equal(mal2.ok, false)
  const cerrado = crearAlmacen(); cerrado.empresaLista(A, 2026, 'cerrado')
  const mal3 = await registrarAsientoManual(cerrado.repo(A), { fecha: '2026-02-01', concepto: 'x', apuntes: [{ cuenta: '572', debe: 1, haber: 0 }, { cuenta: '100', debe: 0, haber: 1 }] }, usuario)
  assert.equal(mal3.ok, false)
  assert.match(!mal3.ok ? mal3.errores.join(' ') : '', /cerrado/)
})

test('importe con decimales (float) en un apunte: rechazado (céntimos enteros)', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const r = await registrarAsientoManual(al.repo(A), { fecha: '2026-02-01', concepto: 'x', apuntes: [{ cuenta: '572', debe: 10.5, haber: 0 }, { cuenta: '100', debe: 0, haber: 10.5 }] }, usuario)
  assert.equal(r.ok, false)
})

test('INMUTABLE: rectificar crea un contraasiento (debe↔haber) y el original no cambia; no se rectifica dos veces', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const repo = al.repo(A)
  const r = await registrarAsientoManual(repo, { fecha: '2026-02-01', concepto: 'Error', apuntes: [{ cuenta: '600', debe: 5000, haber: 0 }, { cuenta: '572', debe: 0, haber: 5000 }] }, usuario)
  assert.ok(r.ok)
  const original = JSON.stringify(al.datos(A).asientos[0])
  const c = await rectificarAsiento(repo, r.ok ? r.id : '', '2026-02-05', usuario)
  assert.ok(c.ok)
  const contra = al.datos(A).asientos[1]
  assert.equal(contra.origen, 'rectificacion')
  assert.deepEqual(contra.apuntes.map((p) => [p.cuenta, p.debe, p.haber]), [['600', 0, 5000], ['572', 5000, 0]])
  assert.equal(JSON.stringify(al.datos(A).asientos[0]), original, 'el original sigue idéntico')
  assert.ok(Object.isFrozen(al.datos(A).asientos[0]))
  const otra = await rectificarAsiento(repo, r.ok ? r.id : '', '2026-02-06', usuario)
  assert.equal(otra.ok, false)
  const deLaContra = await rectificarAsiento(repo, c.ok ? c.id : '', '2026-02-06', usuario)
  assert.equal(deLaContra.ok, false, 'un contraasiento no se rectifica')
})

test('PUERTO idempotente: el mismo hecho dos veces = UN asiento; la segunda respuesta es «duplicado»', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const repo = al.repo(A)
  const r1 = await recibirHecho(repo, 'taller', venta)
  const r2 = await recibirHecho(repo, 'taller', { ...venta, desglose: [{ base: 10000, tipoIva: 21 }] })
  assert.equal(r1.resultado, 'asentado')
  assert.equal(r2.resultado, 'asentado')
  assert.equal(r2.resultado === 'asentado' && r2.duplicado, true)
  assert.equal(r1.resultado === 'asentado' && r2.resultado === 'asentado' && r1.asientoId === r2.asientoId, true)
  assert.equal(al.datos(A).asientos.length, 1)
  assert.equal(al.datos(A).hechos.length, 1)
  // Venta 100,00 + IVA 21 % → 430 D 121,00 / 705 H 100,00 / 477 H 21,00.
  assert.deepEqual(al.datos(A).asientos[0].apuntes.map((p) => [p.cuenta, p.debe, p.haber]), [['430', 12100, 0], ['705', 0, 10000], ['477', 0, 2100]])
})

test('PUERTO: misma clave con contenido distinto = conflicto (nunca se pisa en silencio)', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const repo = al.repo(A)
  await recibirHecho(repo, 'taller', venta)
  const r = await recibirHecho(repo, 'taller', { ...venta, desglose: [{ base: 99999, tipoIva: 21 }] })
  assert.equal(r.resultado, 'conflicto')
  assert.equal(al.datos(A).asientos.length, 1)
})

test('PUERTO: la clave incluye app y tipo (factura y su cobro comparten ref y son hechos distintos)', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const repo = al.repo(A)
  await recibirHecho(repo, 'taller', venta)
  const cobro = await recibirHecho(repo, 'taller', { tipo: 'cobro', fecha: '2026-03-11', ref: 'F-2026-001', importe: 12100 })
  const otraApp = await recibirHecho(repo, 'ialimp', venta)
  assert.equal(cobro.resultado, 'asentado')
  assert.equal(otraApp.resultado, 'asentado')
  assert.equal(al.datos(A).asientos.length, 3)
})

test('PUERTO: ejercicio inexistente o cuenta de la regla que no existe → pendiente_de_regla (el hecho no se pierde)', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const repo = al.repo(A)
  const sinEjercicio = await recibirHecho(repo, 'taller', { ...venta, fecha: '2027-01-02', ref: 'F-2027-001' })
  assert.equal(sinEjercicio.resultado, 'pendiente_de_regla')
  al.datos(A).reglas.push({ tipo: 'venta', cuentas: { ingreso: '7059' }, version: 1 })
  const sinCuenta = await recibirHecho(repo, 'taller', { ...venta, ref: 'F-2026-002' })
  assert.equal(sinCuenta.resultado, 'pendiente_de_regla')
  assert.match(sinCuenta.resultado === 'pendiente_de_regla' ? sinCuenta.motivo : '', /7059/)
  assert.equal(al.datos(A).asientos.length, 0)
  assert.equal(al.datos(A).hechos.length, 2, 'los dos hechos quedan en la bandeja')
  // Reenviarlo no crea otro: sigue en la bandeja.
  const otra = await recibirHecho(repo, 'taller', { ...venta, ref: 'F-2026-002' })
  assert.equal(otra.resultado === 'pendiente_de_regla' && otra.duplicado, true)
})

test('PUERTO: hecho que el núcleo no sabe traducir (nómina que no cuadra) → rechazado y registrado', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const r = await recibirHecho(al.repo(A), 'rrhh', { tipo: 'nomina', fecha: '2026-03-31', ref: 'N-03', bruto: 200000, ssEmpresa: 60000, irpf: 30000, ssTrabajador: 13000, liquido: 1 })
  assert.equal(r.resultado, 'rechazado')
  assert.equal(al.datos(A).hechos[0].estado, 'rechazado')
  assert.equal(al.datos(A).asientos.length, 0)
})

test('reglas de la empresa: sobreescriben a la genérica solo con claves conocidas y códigos con forma de cuenta', () => {
  const r = reglasEfectivas({ venta: { ingreso: '700', cliente: 'DROP TABLE', inventada: '123' } })
  assert.equal(r.venta.ingreso, '700')
  assert.equal(r.venta.cliente, '430')
  assert.equal((r.venta as Record<string, string>).inventada, undefined)
})

test('aislamiento en casos de uso: lo que entra en la empresa A no aparece en la B', async () => {
  const B = '00000000-0000-4000-8000-00000000000b'
  const al = crearAlmacen(); al.empresaLista(A); al.empresaLista(B)
  await recibirHecho(al.repo(A), 'taller', venta)
  assert.equal((await al.repo(B).diario({ limite: 50 })).asientos.length, 0)
  assert.equal((await al.repo(B).hechoPorClave('taller', 'venta', venta.ref)), null)
})
