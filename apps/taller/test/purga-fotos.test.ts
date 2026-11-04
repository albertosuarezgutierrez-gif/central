/* eslint-disable @typescript-eslint/no-explicit-any */
// Purga de fotos tras el plazo de conservación. Todo con `hoy` inyectado (AHORA) y fechas relativas.
//
// Cepos vistos fallar el 04/11/2026 (rompe → rojo → restaura):
//   (1) helper `fotosAPurgar` de module-taller: quitar `o.estado !== 'entregado'` → rojo en su test «NO toca» (aquí además lo ataja el filtro de la consulta);
//   (2) lib/purga-fotos.ts: quitar el filtro de rutas protegidas → rojo en «foto compartida con una ampliación enviada»;
//   (3) lib/purga-fotos.ts: marcar `purgadaEn` aunque Storage falle → rojo en «si Storage falla…».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { purgarFotos, purgarFotosDeTaller } from '../lib/purga-fotos.ts'
import { montar, T, T2 } from './_escenario.ts'
import { almacenFalso, deps, hace, montarPurga, sembrarOt } from './_purga.ts'

test('borra de Storage SOLO fotos de daños y de trabajo de OT entregadas hace más que el plazo, y marca la fila (no la borra)', async () => {
  const m = montarPurga()
  const vieja = sembrarOt(m, T, { estado: 'entregado', entregadoHace: 200, fotosTrabajo: 2, fotosDano: 2 })
  const { almacen, borrados } = almacenFalso()
  const r = await purgarFotos(deps(m, almacen))
  assert.deepEqual([...borrados].sort(), [...vieja.rutasTrabajo, ...vieja.rutasDano].sort())
  assert.equal(r.borradas, 4)
  assert.equal(m.bd.filas('otFoto').length, 2, 'la fila se queda')
  assert.equal(m.bd.filas('recepcionFoto').length, 2, 'la fila se queda')
  assert.ok(m.bd.filas('otFoto').every((f) => f.purgadaEn?.getTime() === deps(m, almacen).hoy.getTime()))
  assert.ok(m.bd.filas('recepcionFoto').every((f) => f.purgadaEn != null))
})

test('NO borra nada que no toca: dentro de plazo, sin entregar, sin fecha de entrega, ni las firmas', async () => {
  const m = montarPurga()
  const reciente = sembrarOt(m, T, { estado: 'entregado', entregadoHace: 100, fotosTrabajo: 1, fotosDano: 1 })
  const enCurso = sembrarOt(m, T, { estado: 'en_curso', entregadoHace: null, fotosTrabajo: 1, fotosDano: 1 })
  const terminada = sembrarOt(m, T, { estado: 'terminado', entregadoHace: 400, fotosTrabajo: 1, fotosDano: 1 }) // entregadoEn no debería existir, pero aunque exista
  const sinFecha = sembrarOt(m, T, { estado: 'entregado', entregadoHace: null, fotosTrabajo: 1 })
  const vieja = sembrarOt(m, T, { estado: 'entregado', entregadoHace: 200, fotosTrabajo: 1 })
  const { almacen, borrados, intentos } = almacenFalso()
  await purgarFotos(deps(m, almacen))
  assert.deepEqual(borrados, vieja.rutasTrabajo, 'solo la foto de la OT vieja')
  for (const o of [reciente, enCurso, terminada, sinFecha]) {
    for (const ruta of [...o.rutasTrabajo, ...o.rutasDano]) assert.ok(!intentos.includes(ruta), `no debía tocar ${ruta}`)
  }
  for (const o of [reciente, enCurso, terminada, sinFecha, vieja]) assert.ok(!intentos.includes(o.firmaRecepcion), 'las firmas no se tocan')
  assert.equal(m.bd.filas('otFoto').filter((f) => f.purgadaEn != null).length, 1)
  assert.equal(m.bd.filas('recepcionFoto').filter((f) => f.purgadaEn != null).length, 0)
})

test('cada taller con SU plazo y aislado por RLS: mismo caso, 120 días borra y 365 no', async () => {
  const m = montarPurga({ t: 120, t2: 365 })
  const a = sembrarOt(m, T, { estado: 'entregado', entregadoHace: 200, fotosTrabajo: 1 })
  const b = sembrarOt(m, T2, { estado: 'entregado', entregadoHace: 200, fotosTrabajo: 1 })
  const { almacen, borrados } = almacenFalso()
  await purgarFotos(deps(m, almacen))
  assert.deepEqual(borrados, a.rutasTrabajo)
  assert.ok(!borrados.includes(b.rutasTrabajo[0]))
  assert.equal(m.bd.filas('otFoto').find((f) => f.tallerId === T2)!.purgadaEn ?? null, null)
})

test('idempotente: la segunda pasada no vuelve a borrar nada', async () => {
  const m = montarPurga()
  sembrarOt(m, T, { estado: 'entregado', entregadoHace: 300, fotosTrabajo: 3, fotosDano: 2 })
  const { almacen, intentos } = almacenFalso()
  const a = await purgarFotos(deps(m, almacen))
  const tras1 = intentos.length
  const b = await purgarFotos(deps(m, almacen))
  assert.equal(a.borradas, 5)
  assert.equal(b.borradas, 0)
  assert.equal(intentos.length, tras1, 'ni siquiera se intenta borrar de nuevo')
})

test('si Storage falla, la foto NO se marca como purgada y se reintenta; las demás sí se marcan', async () => {
  const m = montarPurga()
  const o = sembrarOt(m, T, { estado: 'entregado', entregadoHace: 300, fotosTrabajo: 3 })
  const mala = o.rutasTrabajo[1]
  const caido = almacenFalso({ fallan: (r) => r === mala })
  const r1 = await purgarFotos(deps(m, caido.almacen))
  assert.equal(r1.fallidas, 1)
  assert.equal(r1.borradas, 2)
  const filaMala = m.bd.filas('otFoto').find((f) => f.ruta === mala)!
  assert.equal(filaMala.purgadaEn ?? null, null, 'sin borrado en Storage no hay marca')
  assert.equal(m.bd.filas('otFoto').filter((f) => f.purgadaEn != null).length, 2)
  // Al día siguiente Storage responde: se completa.
  const sano = almacenFalso()
  const r2 = await purgarFotos(deps(m, sano.almacen))
  assert.deepEqual(sano.borrados, [mala])
  assert.equal(r2.borradas, 1)
  assert.ok(m.bd.filas('otFoto').every((f) => f.purgadaEn != null))
})

test('foto compartida con una ampliación enviada al cliente (mismo archivo): NO se borra ni se marca', async () => {
  const m = montarPurga()
  const o = sembrarOt(m, T, { estado: 'entregado', entregadoHace: 300, fotosTrabajo: 2 })
  m.bd.sembrar('ampliacionFoto', { tallerId: T, presupuestoId: 'p', ruta: o.rutasTrabajo[0], huellaSha256: 'h' })
  const { almacen, borrados } = almacenFalso()
  const r = await purgarFotos(deps(m, almacen))
  assert.deepEqual(borrados, [o.rutasTrabajo[1]])
  assert.equal(r.protegidas, 1)
  assert.equal(m.bd.filas('otFoto').find((f) => f.ruta === o.rutasTrabajo[0])!.purgadaEn ?? null, null)
})

test('una ruta que es firma (recepción o entrega) jamás se borra, aunque figure como foto', async () => {
  const m = montarPurga()
  const o = sembrarOt(m, T, { estado: 'entregado', entregadoHace: 300, fotosTrabajo: 1 })
  const firmaEntrega = `${T}/ot-x/firma-entrega-abc.png`
  await m.conTaller(T, (tx: any) => tx.ordenTrabajo.update({ where: { id: o.ot.id }, data: { entregaFirmaRuta: firmaEntrega } }))
  m.bd.sembrar('otFoto', { tallerId: T, otId: o.ot.id, autorId: 'u', ruta: firmaEntrega, huellaSha256: 'h', capturadaEn: hace(1) })
  m.bd.sembrar('otFoto', { tallerId: T, otId: o.ot.id, autorId: 'u', ruta: o.firmaRecepcion, huellaSha256: 'h', capturadaEn: hace(1) })
  const { almacen, intentos } = almacenFalso()
  await purgarFotos(deps(m, almacen))
  assert.ok(!intentos.includes(firmaEntrega) && !intentos.includes(o.firmaRecepcion))
  assert.ok(intentos.includes(o.rutasTrabajo[0]))
})

test('plazo inválido en BD (< 90) o taller sin configuración: no se borra nada de ese taller', async () => {
  const m = montarPurga({ t: 30 })
  const o = sembrarOt(m, T, { estado: 'entregado', entregadoHace: 300, fotosTrabajo: 1 })
  const { almacen, intentos } = almacenFalso()
  const r = await m.conTaller(T, (tx: any) => purgarFotosDeTaller(tx, almacen, { tallerId: T, hoy: deps(m, almacen).hoy }))
  assert.equal(r.omitido, 'plazo de conservación inválido')
  assert.equal(intentos.length, 0)
  const m2 = montar()
  sembrarOt(m2, T, { estado: 'entregado', entregadoHace: 300, fotosTrabajo: 1 })
  const r2 = await m2.conTaller(T, (tx: any) => purgarFotosDeTaller(tx, almacen, { tallerId: T, hoy: deps(m2, almacen).hoy }))
  assert.equal(r2.omitido, 'sin configuración')
  assert.equal(o.rutasTrabajo.length, 1)
})

test('por lotes: con páginas de 1 orden se recorren todas', async () => {
  const m = montarPurga()
  for (let i = 0; i < 5; i++) sembrarOt(m, T, { estado: 'entregado', entregadoHace: 250 + i, fotosTrabajo: 1, fotosDano: 1 })
  const { almacen, borrados } = almacenFalso()
  const r = await m.conTaller(T, (tx: any) => purgarFotosDeTaller(tx, almacen, { tallerId: T, hoy: deps(m, almacen).hoy, loteOrdenes: 1 }))
  assert.equal(r.borradas, 10)
  assert.equal(borrados.length, 10)
})

test('el fallo de un taller no frena a los demás', async () => {
  const m = montarPurga({ t: 120, t2: 120 })
  sembrarOt(m, T, { estado: 'entregado', entregadoHace: 200, fotosTrabajo: 1 })
  const b = sembrarOt(m, T2, { estado: 'entregado', entregadoHace: 200, fotosTrabajo: 1 })
  const { almacen, borrados } = almacenFalso()
  const d = deps(m, almacen)
  const r = await purgarFotos({ ...d, conTaller: (id: string, fn: any, o: any) => (id === T ? Promise.reject(new Error('BD caída')) : d.conTaller(id, fn, o)) })
  assert.equal(r.talleresConError, 1)
  assert.deepEqual(borrados, b.rutasTrabajo)
})
