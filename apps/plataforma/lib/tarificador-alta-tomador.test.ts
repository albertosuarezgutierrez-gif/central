// Bloqueo de Mapfre moto por la ficha del tomador (19/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bloqueosAltaTomador } from './tarificador-alta-tomador.ts'

test('bloqueosAltaTomador: falta nombre, apellido o nacimiento → Mapfre bloqueado, sin valores', () => {
  const b = bloqueosAltaTomador([{ campo: 'nombre' }, { campo: 'apellido1' }, { campo: 'fechaNacimiento' }, { campo: 'sexo' }], false)
  assert.deepEqual(Object.keys(b ?? {}), ['mapfre'])
  assert.match(b!.mapfre, /^Falta el nombre, el primer apellido y la fecha de nacimiento en la ficha del tomador/)
  assert.match(bloqueosAltaTomador([{ campo: 'fechaNacimiento_invalida' }], false)!.mapfre, /fecha de nacimiento/)
})

test('bloqueosAltaTomador: nada que bloquear (ficha completa, solo faltas ajenas, o precalificación ilegible) → undefined', () => {
  assert.equal(bloqueosAltaTomador([], false), undefined)
  assert.equal(bloqueosAltaTomador([{ campo: 'sexo' }, { campo: 'fechaCarnet' }], false), undefined)
  assert.equal(bloqueosAltaTomador(null, false), undefined)
  assert.equal(bloqueosAltaTomador([{ campo: 'apellido1' }], true), undefined, 'empresa: solo la razón social')
  assert.match(bloqueosAltaTomador([{ campo: 'nombre' }], true)!.mapfre, /razón social/)
})

test('CotizadorMoto pasa el bloqueo a PrecioBots (como BotsAutoRiesgo)', () => {
  const src = readFileSync(new URL('../app/(usuario)/correduria/cliente/[id]/moto-nuevo/CotizadorMoto.tsx', import.meta.url), 'utf8')
  assert.match(src, /bloqueosPorCompania=\{bloqueosAltaTomador\(faltanInicial, tomadorEmpresa\)\}/)
  assert.match(src, /sexoSinFicha: \(faltanInicial \?\? \[\]\)\.some\(\(f\) => f\.campo === 'sexo'\)/)
})
