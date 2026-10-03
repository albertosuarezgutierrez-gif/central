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
  assert.match(t, /Choque con otro vehículo · 26\/09\/2026 · póliza de cartera/)
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

test('lleva cliente, quién lo da si es otro, compañía, ramo, nº de póliza y enlace a la ficha', () => {
  const t = textoAvisoParteNuevo({
    ...BASE,
    nombre: 'Alberto Suárez',
    cliente: 'Jose Suarez Salas',
    loDaOtro: true,
    compania: 'Occident',
    ramo: 'hogar',
    numeroPoliza: 'GPDF<1>',
    enlace: 'https://plataforma.test/correduria/poliza/abc',
  })
  assert.match(t, /Parte nuevo en el portal: Jose Suarez Salas \(lo da Alberto Suárez, que no es el titular\)/)
  assert.match(t, /Occident · Hogar · nº GPDF&lt;1&gt;/)
  assert.match(t, /<a href="https:\/\/plataforma\.test\/correduria\/poliza\/abc">Abrir en \/correduria<\/a>/)
})

test('el titular que da su propio parte no sale como «autorizado»; sin base, sin enlace inventado', () => {
  const t = textoAvisoParteNuevo({ ...BASE, cliente: 'Ana Pérez', loDaOtro: false, enlace: null })
  assert.match(t, /Parte nuevo en el portal: Ana Pérez\n/)
  assert.doesNotMatch(t, /no es el titular|<a /)
  assert.match(t, /míralo en \/correduria/)
  // Un enlace que no es https no se pinta como enlace.
  assert.doesNotMatch(textoAvisoParteNuevo({ ...BASE, enlace: 'javascript:alert(1)' }), /<a /)
})

test('lleva 2-3 datos clave del ramo, sin nombres ni teléfonos de terceros', () => {
  const t = textoAvisoParteNuevo({
    ...BASE,
    datosRamo: {
      existeDeclaracionAmistosa: true,
      existeAtestado: false,
      contrarios: [{ conductor: 'Luis <Pérez>', telefono: '600112233' }],
    },
  })
  assert.match(t, /Otros vehículos implicados: 1 · ¿Habéis rellenado el parte amistoso\? Sí/)
  assert.ok(!t.includes('Luis') && !t.includes('600112233'))
  assert.ok(!textoAvisoParteNuevo({ ...BASE, datosRamo: null }).includes('implicados'))
})
