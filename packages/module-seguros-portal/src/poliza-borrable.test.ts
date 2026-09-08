import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MENSAJE_PARTE_EN_COMPANIA,
  avisoPartesConservados,
  describirPolizaDesligada,
  fotoDeLaPoliza,
  parteEnCompania,
  puedeBorrarDeclarada,
  type ParteDePoliza,
} from './poliza-borrable.ts'

const parte = (p: Partial<ParteDePoliza> = {}): ParteDePoliza => ({
  estado: 'enviado',
  siniestroId: null,
  ...p,
})

test('sin partes, se puede quitar y no hay nada que desligar', () => {
  assert.deepEqual(puedeBorrarDeclarada({ partes: [] }), { puede: true, partesADesligar: 0 })
})

test('un parte que la compañía NO tramita no impide quitarla: se desliga', () => {
  const r = puedeBorrarDeclarada({ partes: [parte(), parte({ estado: 'recibido' })] })
  assert.deepEqual(r, { puede: true, partesADesligar: 2 })
})

test('un parte descartado también se conserva: cuenta para desligar, no para borrar', () => {
  assert.deepEqual(puedeBorrarDeclarada({ partes: [parte({ estado: 'descartado' })] }), {
    puede: true,
    partesADesligar: 1,
  })
})

test('🚨 un parte abierto en la compañía BLOQUEA, y dice por qué', () => {
  const r = puedeBorrarDeclarada({ partes: [parte(), parte({ estado: 'abierto_en_compania' })] })
  assert.equal(r.puede, false)
  assert.equal(r.puede === false && r.reparo, 'parte_en_compania')
  assert.equal(r.puede === false && r.mensaje, MENSAJE_PARTE_EN_COMPANIA)
})

test('🚨 un siniestroId bloquea aunque el estado no lo diga', () => {
  // El id del expediente puede llegar por otra vía; basta con que exista para
  // que haya un tercero esperando.
  assert.equal(parteEnCompania(parte({ siniestroId: 'abc' })), true)
  assert.equal(puedeBorrarDeclarada({ partes: [parte({ siniestroId: 'abc' })] }).puede, false)
})

test('el mensaje del reparo no promete que se pueda borrar más tarde', () => {
  assert.ok(!/más tarde|luego|vuelve a intentarlo/i.test(MENSAJE_PARTE_EN_COMPANIA))
  assert.ok(/escríbenos/i.test(MENSAJE_PARTE_EN_COMPANIA))
})

test('el aviso dice que el parte NO se borra, y concuerda en número', () => {
  assert.equal(avisoPartesConservados(0), null)
  const uno = avisoPartesConservados(1)
  assert.ok(uno !== null && /El parte .*NO se borra/.test(uno))
  const dos = avisoPartesConservados(2)
  assert.ok(dos !== null && /Los 2 partes .*NO se borran/.test(dos))
})

test('la foto ignora los blancos y no inventa una foto vacía', () => {
  assert.equal(fotoDeLaPoliza({ compania: '  ', numeroPoliza: '', ramo: null }), null)
  assert.deepEqual(fotoDeLaPoliza({ compania: ' Occident ', numeroPoliza: null, ramo: 'auto' }), {
    compania: 'Occident',
    numeroPoliza: null,
    ramo: 'auto',
  })
})

test('una póliza desligada se sigue pudiendo nombrar', () => {
  assert.equal(
    describirPolizaDesligada({ compania: 'Occident', numeroPoliza: '548238086', ramo: 'auto' }),
    'Occident · auto · nº 548238086',
  )
  // Sin compañía ni ramo, el número solo NO se queda huérfano de etiqueta.
  assert.equal(
    describirPolizaDesligada({ compania: null, numeroPoliza: '123', ramo: null }),
    'Póliza sin compañía identificada · nº 123',
  )
  assert.equal(describirPolizaDesligada(null), null)
})
