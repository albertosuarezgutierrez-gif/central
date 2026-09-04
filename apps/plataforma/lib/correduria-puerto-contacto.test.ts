import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarBusqueda } from './correduria-puerto.ts'

// El puerto normaliza lo que manda asegura. Lo que se protege aquí no es el
// camino feliz: es que un asegura ANTERIOR a los iconos no acabe afirmando
// «este cliente no tiene teléfono», que es la mentira barata de este cambio.

function respuesta(hallazgo: Record<string, unknown>) {
  return {
    estado: 'ok',
    termino: 'jose',
    buscable: true,
    distintos: 1,
    avisos: [],
    bloques: [{ tipo: 'nombre', valor: 'jose', hallazgos: [hallazgo], cobertura: null, explicacion: '' }],
  }
}

const BASE = { clienteId: 'c1', nombre: 'Jose Suárez', tipo: 'cliente', polizas: 2, porque: 'nombre' }

function soloHallazgo(json: unknown) {
  const r = interpretarBusqueda(200, json)
  assert.equal(r.estado, 'ok', `esperaba ok y vino ${JSON.stringify(r)}`)
  if (r.estado !== 'ok') throw new Error('inalcanzable')
  return r.bloques[0].hallazgos[0]
}

test('🚨 un asegura VIEJO no manda contacto: no se inventa, y NO se afirma que no lo haya', () => {
  const h = soloHallazgo(respuesta({ ...BASE }))
  assert.equal(h.telefono, null)
  assert.equal(h.email, null)
  // `false` = «no consta que sea ilegible», que es distinto de decir que no hay
  // teléfono. Quien pinta decide no escribir nada, y por eso no miente.
  assert.equal(h.telefonoIlegible, false)
  assert.equal(h.emailIlegible, false)
})

test('el contacto viaja tal cual cuando asegura lo manda', () => {
  const h = soloHallazgo(respuesta({ ...BASE, telefono: '607905544', email: 'jsuarezsalas@gmail.com' }))
  assert.equal(h.telefono, '607905544')
  assert.equal(h.email, 'jsuarezsalas@gmail.com')
})

test('🚨 «cifrado y no se abre» NO se degrada a «no consta»', () => {
  const h = soloHallazgo(respuesta({ ...BASE, telefono: null, telefonoIlegible: true }))
  assert.equal(h.telefono, null)
  assert.equal(h.telefonoIlegible, true)
})

test('una cadena vacía no es un teléfono, y un booleano de mentira no cuela', () => {
  const h = soloHallazgo(respuesta({ ...BASE, telefono: '', email: 42, telefonoIlegible: 'sí' }))
  assert.equal(h.telefono, null)
  assert.equal(h.email, null)
  // Solo el `true` literal cuenta: cualquier otra cosa deja el estado callado.
  assert.equal(h.telefonoIlegible, false)
})
