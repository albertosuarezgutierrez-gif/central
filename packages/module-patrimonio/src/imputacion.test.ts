// Imputación de facturas: la IA PROPONE, el cliente CONFIRMA, y el inmueble elegido se busca DENTRO de lo que
// la identidad gestiona (aislamiento por código, como en el resto del portal).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { categoriaPorTexto, confirmarImputacion, normalizarNif, proponerImputacion, type ContextoImputacion } from './imputacion.ts'
import type { Inmueble, Titular } from './tipos.ts'

const titular = (id: string, nif: string | null): Titular => ({ id, tipo: 'sociedad', nombre: id, nif, deduceIva: false })
const inmueble = (id: string, titularId: string, p: Partial<Inmueble> = {}): Inmueble => ({
  id, titularId, alias: id, uso: 'vivienda', referenciaCatastral: null, suministros: [], cp: '41003',
  direccion: null, superficieM2: 80, anioConstruccion: 1970, enComunidad: true, ...p,
})

const ctx: ContextoImputacion = {
  titulares: [titular('t1', 'B12345678'), titular('t2', 'B87654321')],
  inmuebles: [
    inmueble('i1', 't1', { referenciaCatastral: '1234567TG3413S0001AB', direccion: 'Calle Socorro 24 41003 Sevilla' }),
    inmueble('i2', 't1', { suministros: ['ES0031 4000 0000 0001 JN0F'], direccion: 'Calle Socorro 2 41003 Sevilla' }),
    inmueble('i3', 't2', { direccion: 'Avenida de la Constitución 10 41004 Sevilla' }),
  ],
}

test('referencia catastral exacta → inmueble con confianza alta', () => {
  const p = proponerImputacion({ referenciaCatastral: '1234567 TG3413S 0001 AB', concepto: 'Recibo IBI 2026' }, ctx)
  assert.equal(p.inmuebleId, 'i1')
  assert.equal(p.titularId, 't1')
  assert.equal(p.confianza, 'alta')
  assert.equal(p.categoria, 'IMPUESTOS')
})

test('CUPS → inmueble con confianza alta, categoría suministros', () => {
  const p = proponerImputacion({ referenciaSuministro: 'es0031400000000001jn0f', proveedor: 'Endesa Energía', concepto: 'Factura electricidad' }, ctx)
  assert.equal(p.inmuebleId, 'i2')
  assert.equal(p.confianza, 'alta')
  assert.equal(p.categoria, 'SUMINISTROS')
})

test('dirección: «Socorro 24» no casa con «Socorro 2» (todas las fichas, con número)', () => {
  const p = proponerImputacion({ direccion: 'C/ Socorro, 24 - 41003 SEVILLA', concepto: 'Cuota comunidad de propietarios' }, ctx)
  assert.equal(p.inmuebleId, 'i1')
  assert.equal(p.confianza, 'media')
  assert.equal(p.categoria, 'COMUNIDAD')
})

test('NIF del destinatario acota a sus inmuebles; un titular con un solo inmueble → propuesta media', () => {
  const p = proponerImputacion({ nifCliente: 'ES-B87654321', concepto: 'Reparación fontanería' }, ctx)
  assert.equal(p.inmuebleId, 'i3')
  assert.equal(p.confianza, 'media')
  assert.equal(p.categoria, 'MANTENIMIENTO')
  assert.equal(p.aNombreDeOtro, false)
})

test('factura a nombre de un NIF ajeno: se marca y no se da confianza', () => {
  const p = proponerImputacion({ nifCliente: '12345678Z', referenciaCatastral: '1234567TG3413S0001AB' }, ctx)
  assert.equal(p.aNombreDeOtro, true)
  assert.equal(p.confianza, 'baja')
})

test('sin pistas: no se inventa inmueble ni categoría; el cajón OTRO de la IA se anula', () => {
  const p = proponerImputacion({ concepto: 'Servicios varios', categoria: 'OTRO' }, ctx)
  assert.equal(p.inmuebleId, null)
  assert.equal(p.categoria, null)
  assert.equal(p.confianza, 'baja')
})

test('categoría de la IA del catálogo se acepta si el texto no decide', () => {
  const p = proponerImputacion({ concepto: 'Servicios varios', categoria: 'gestion' }, ctx)
  assert.equal(p.categoria, 'GESTION')
})

test('categoriaPorTexto: seguro, hipoteca, gestoría', () => {
  assert.equal(categoriaPorTexto('Recibo póliza hogar'), 'SEGURO')
  assert.equal(categoriaPorTexto('Cuota préstamo hipotecario', 'Hipoteca'), 'FINANCIACION')
  assert.equal(categoriaPorTexto('Honorarios administrador de fincas'), 'GESTION')
  assert.equal(categoriaPorTexto(null, ''), null)
})

test('normalizarNif quita ES, espacios y guiones', () => {
  assert.equal(normalizarNif(' es-b12345678 '), 'B12345678')
  assert.equal(normalizarNif(''), null)
  assert.equal(normalizarNif(null), null)
})

const eleccion = { inmuebleId: 'i1', titularId: null, categoria: 'COMUNIDAD', fecha: '2026-10-01', base: null, total: 6_000, concepto: 'Cuota' }

test('confirmar: inmueble gestionado → gasto confirmado del titular del inmueble', () => {
  const r = confirmarImputacion(eleccion, ctx)
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.gasto.titularId, 't1')
    assert.equal(r.gasto.estado, 'confirmado')
    assert.equal(r.gasto.origen, 'factura')
  }
})

test('confirmar: un inmueble que NO gestionas (id manipulado) → inmueble_ajeno', () => {
  assert.deepEqual(confirmarImputacion({ ...eleccion, inmuebleId: 'i-de-otro' }, ctx), { ok: false, error: 'inmueble_ajeno' })
  // Inmueble en la lista pero de un titular que no está entre los gestionados (lista sin filtrar): también fuera.
  const sucio: ContextoImputacion = { titulares: [ctx.titulares[1]], inmuebles: ctx.inmuebles }
  assert.deepEqual(confirmarImputacion(eleccion, sucio), { ok: false, error: 'inmueble_ajeno' })
})

test('confirmar: gasto del titular sin inmueble exige titular gestionado', () => {
  assert.deepEqual(confirmarImputacion({ ...eleccion, inmuebleId: null, titularId: 'tx' }, ctx), { ok: false, error: 'titular_ajeno' })
  const r = confirmarImputacion({ ...eleccion, inmuebleId: null, titularId: 't2', categoria: 'GESTION' }, ctx)
  assert.ok(r.ok && r.gasto.inmuebleId === null && r.gasto.titularId === 't2')
})

test('confirmar: categoría, fecha e importes se validan', () => {
  assert.deepEqual(confirmarImputacion({ ...eleccion, categoria: 'CAFES' }, ctx), { ok: false, error: 'categoria_invalida' })
  assert.deepEqual(confirmarImputacion({ ...eleccion, fecha: '2026-02-30' }, ctx), { ok: false, error: 'fecha_invalida' })
  assert.deepEqual(confirmarImputacion({ ...eleccion, total: null }, ctx), { ok: false, error: 'sin_importe' })
  assert.deepEqual(confirmarImputacion({ ...eleccion, total: 60.5 }, ctx), { ok: false, error: 'importe_invalido' })
})
