import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emailAlternativo, type AllegadoConEmail } from './contacto-alternativo.ts'
import type { IntervinienteFicha } from './intervinientes.ts'

const interviniente = (x: Partial<IntervinienteFicha>): IntervinienteFicha => ({
  polizaId: 'p1', rol: 'propietario', nombre: null, nombreIlegible: false,
  telefono: null, email: null, telefonoIlegible: false, emailIlegible: false,
  id: 'i1', fichaId: null, esTomador: false, origen: 'cima', personaClave: null, ...x,
})

const allegado = (x: Partial<AllegadoConEmail>): AllegadoConEmail => ({
  fichaId: 'f1', nombre: 'Pablo Franco Ruz', parentesco: 'Administración', email: 'pablo@elca.example', ...x,
})

test('sin intervinientes ni allegados: no hay a quién escribir', () => {
  assert.equal(emailAlternativo([], []), null)
  assert.equal(emailAlternativo(null, []), null)
})

test('🚨 el caso Studium/GLOBAL 2: sin nada en la póliza, se usa la persona de referencia', () => {
  const r = emailAlternativo([], [allegado({})])
  assert.equal(r?.email, 'pablo@elca.example')
  assert.equal(r?.via, 'allegado')
  assert.deepEqual(r?.quien, { nombre: 'Pablo Franco Ruz', rol: 'Administración' })
})

test('la póliza manda sobre la persona de referencia declarada', () => {
  const r = emailAlternativo(
    [interviniente({ email: 'conductor@x.example', rol: 'conductor_habitual', nombre: 'Juan' })],
    [allegado({})],
  )
  assert.equal(r?.email, 'conductor@x.example')
  assert.equal(r?.via, 'interviniente')
  assert.equal(r?.quien?.nombre, 'Juan')
})

test('el propio dato del tomador colgado de la póliza es SUYO, no de un tercero', () => {
  const r = emailAlternativo([interviniente({ email: 'tomador@x.example', esTomador: true })], [allegado({})])
  assert.equal(r?.via, 'tomador_en_poliza')
  assert.equal(r?.quien, null)
})

test('intervinientesSinMirar (null) no impide caer a la persona de referencia', () => {
  const r = emailAlternativo(null, [allegado({})])
  assert.equal(r?.via, 'allegado')
})

test('un allegado sin email no cuenta: se sigue buscando entre los demás', () => {
  const r = emailAlternativo([], [allegado({ email: '' }), allegado({ nombre: 'Berta', email: 'berta@x.example' })])
  assert.equal(r?.email, 'berta@x.example')
  assert.equal(r?.quien?.nombre, 'Berta')
})
