import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dondeSeCorrigeHogar, figurasFrenteAPeticionHogar, filaHogarEditableEmbebida, propietarioEsTomadorDeRiesgo } from './cotizador-hogar.ts'

const tom = { rol: 'tomador', clienteId: 'c1', nombre: 'Ana' }
const prop = (clienteId: string) => ({ rol: 'propietario', clienteId, nombre: clienteId === 'c1' ? 'Ana' : 'Luis' })

test('embebido «solo condiciones»: solo la fecha de efecto y el estado civil se tocan aquí', () => {
  assert.ok(filaHogarEditableEmbebida('fechaEfecto'))
  assert.ok(filaHogarEditableEmbebida('estadoCivil'))
  for (const c of ['metrosCuadrados', 'capitalContinente', 'referenciaCatastral', 'alarma', 'propietarioEsTomador', 'nombre', 'dni']) {
    assert.equal(filaHogarEditableEmbebida(c), false, c)
  }
})

test('dónde se corrige: vivienda arriba en su bloque, personas en Intervinientes, condiciones aquí', () => {
  assert.equal(dondeSeCorrigeHogar({ campo: 'metrosCuadrados', grupo: 'como' }), 'vivienda')
  assert.equal(dondeSeCorrigeHogar({ campo: 'capitalContenido', grupo: 'capitales' }), 'vivienda')
  assert.equal(dondeSeCorrigeHogar({ campo: 'propietarioEsTomador', grupo: 'tomador' }), 'vivienda')
  assert.equal(dondeSeCorrigeHogar({ campo: 'dni', grupo: 'tomador' }), 'personas')
  assert.equal(dondeSeCorrigeHogar({ campo: 'fechaEfecto', grupo: 'cotizacion' }), 'aqui')
})

test('propietario: tres estados — el dato manda; sin dato y otro propietario = false; sin nada que lo diga = null', () => {
  assert.equal(propietarioEsTomadorDeRiesgo({ figuras: [tom, prop('c2')], tomadorId: 'c1', propietarioEsTomador: true }), true)
  assert.equal(propietarioEsTomadorDeRiesgo({ figuras: [tom], tomadorId: 'c1', propietarioEsTomador: false }), false)
  // Sin dato y el riesgo dice que el dueño es otra persona: no se deja que asegura suponga «sí».
  assert.equal(propietarioEsTomadorDeRiesgo({ figuras: [tom, prop('c2')], tomadorId: 'c1', propietarioEsTomador: null }), false)
  // Sin dato y nada lo contradice: no se sabe (ni sí ni no).
  assert.equal(propietarioEsTomadorDeRiesgo({ figuras: [tom], tomadorId: 'c1', propietarioEsTomador: null }), null)
  assert.equal(propietarioEsTomadorDeRiesgo({ figuras: [tom, prop('c1')], tomadorId: 'c1', propietarioEsTomador: null }), null)
})

test('contradicción entre Intervinientes y la vivienda BLOQUEA (no se pagan 0,50€ mandando al tomador como dueño)', () => {
  assert.match(figurasFrenteAPeticionHogar({ figuras: [tom, prop('c2')], tomadorId: 'c1', propietarioEsTomador: true }).bloqueo!, /Luis/)
  assert.match(figurasFrenteAPeticionHogar({ figuras: [tom, prop('c1')], tomadorId: 'c1', propietarioEsTomador: false }).bloqueo!, /propio tomador/)
})

test('propietario o asegurado distintos del tomador: aviso de que NO viajan, sin bloquear', () => {
  const r = figurasFrenteAPeticionHogar({ figuras: [tom, prop('c2'), { rol: 'asegurado', clienteId: 'c3', nombre: 'Eva' }], tomadorId: 'c1', propietarioEsTomador: false })
  assert.equal(r.bloqueo, null)
  assert.equal(r.avisos.length, 2)
  assert.match(r.avisos[0], /no viaja/)
  assert.match(r.avisos[1], /Eva/)
})

test('todo el tomador (o sin figuras extra): ni bloqueo ni avisos', () => {
  assert.deepEqual(figurasFrenteAPeticionHogar({ figuras: [tom], tomadorId: 'c1', propietarioEsTomador: null }), { bloqueo: null, avisos: [] })
  assert.deepEqual(figurasFrenteAPeticionHogar({ figuras: [tom, prop('c1'), { rol: 'asegurado', clienteId: 'c1', nombre: 'Ana' }], tomadorId: 'c1', propietarioEsTomador: true }), { bloqueo: null, avisos: [] })
})

test('pantalla completa hogar-nuevo: pasa el bloqueo de figurasFrenteAPeticionHogar al Formulario', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../cliente/[id]/hogar-nuevo/page.tsx', import.meta.url), 'utf8')
  assert.match(src, /figurasFrenteAPeticionHogar\(/)
  assert.match(src, /<Formulario[^>]*bloqueo=\{bloqueo\}/)
  // propietario otra persona + vivienda «propietario es tomador: sí» → bloqueo
  assert.ok(figurasFrenteAPeticionHogar({ figuras: [tom, prop('c2')], tomadorId: 'c1', propietarioEsTomador: true }).bloqueo)
})
