import { test } from 'node:test'
import assert from 'node:assert/strict'

import { textoAvisoParteNuevo, type DatosAvisoParteNuevo } from './aviso-parte-nuevo.ts'

const BASE: DatosAvisoParteNuevo = {
  parteId: '0123456789abcdef',
  nombre: 'Ana <Pérez>',
  tipoSiniestro: 'colision',
  fechaHecho: '2026-09-26',
  hayHeridos: false,
  hayTerceros: true,
  polizaDeclarada: false,
  sinPoliza: false,
}

test('lleva quién, qué, cuándo y el id corto, con el nombre escapado', () => {
  const t = textoAvisoParteNuevo(BASE)
  assert.match(t, /Parte nuevo en el portal: Ana &lt;Pérez&gt;/)
  assert.match(t, /Choque o golpe · 26\/09\/2026 · póliza de cartera/)
  assert.match(t, /Heridos: no · Terceros: sí/)
  assert.match(t, /Parte 01234567/)
})

test('con heridos, el aviso lo dice DELANTE', () => {
  assert.ok(textoAvisoParteNuevo({ ...BASE, hayHeridos: true }).startsWith('🚑 CON HERIDOS'))
  assert.ok(!textoAvisoParteNuevo(BASE).includes('🚑'))
})

test('«no lo sabe» no se colapsa a «no»', () => {
  assert.match(textoAvisoParteNuevo({ ...BASE, hayHeridos: null, hayTerceros: null }), /Heridos: no lo sabe · Terceros: no lo sabe/)
})

test('sin nombre, sin tipo, sin póliza o póliza declarada: lo dice tal cual', () => {
  const t = textoAvisoParteNuevo({ ...BASE, nombre: '  ', tipoSiniestro: null, sinPoliza: true })
  assert.match(t, /: Un cliente/)
  assert.match(t, /sin tipo · 26\/09\/2026 · no sabe qué póliza/)
  assert.match(textoAvisoParteNuevo({ ...BASE, polizaDeclarada: true }), /póliza de otra correduría/)
})
