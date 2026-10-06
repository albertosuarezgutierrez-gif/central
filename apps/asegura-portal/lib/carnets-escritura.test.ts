// Cepo de «Mis carnés» en el portal (`carnets-escritura.ts` + `carnets-vista.ts`): la entrada se valida con
// Zod y nunca lleva identidad ni clienteId, la respuesta del puente se lee sin convertir un fallo en «ok», y
// los textos distinguen `sin_puente` (503) de `error` (502) sin culpar al cliente.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { interpretarEscrituraCarnet, leerEscrituraCarnet, statusEscrituraCarnet } from './carnets-escritura.ts'
import { fechaCarnetEs, necesitaSelectorTitular, textoAvisoCarnet, titularesEscribibles } from './carnets-vista.ts'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const K = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const ID = '11111111-1111-4111-8111-111111111111'

// ─── Entrada ─────────────────────────────────────────────────────────────────

test('alta válida; identidadId o clienteId colados en el cuerpo se descartan', () => {
  assert.deepEqual(
    leerEscrituraCarnet('alta', { fichaId: A, tipo: 'B', fecha: '2012-03-04', identidadId: ID, clienteId: B }),
    { accion: 'alta', fichaId: A, tipo: 'B', fecha: '2012-03-04' },
  )
})

test('🪤 sin titular, con id que no es uuid o sin datos → null (400)', () => {
  assert.equal(leerEscrituraCarnet('alta', { tipo: 'B', fecha: '2012-03-04' }), null)
  assert.equal(leerEscrituraCarnet('alta', { fichaId: 'x', tipo: 'B', fecha: '2012-03-04' }), null)
  assert.equal(leerEscrituraCarnet('alta', { fichaId: A, tipo: '', fecha: '2012-03-04' }), null)
  assert.equal(leerEscrituraCarnet('cambio', { fichaId: A, tipo: 'B', fecha: '2012-03-04' }, '../otro'), null)
  assert.equal(leerEscrituraCarnet('baja', {}, K), null)
  assert.equal(leerEscrituraCarnet('alta', null), null)
})

test('cambio y baja válidos llevan el id de la URL', () => {
  assert.deepEqual(leerEscrituraCarnet('cambio', { fichaId: A, tipo: 'A2', fecha: '2015-01-02' }, K), { accion: 'cambio', id: K, fichaId: A, tipo: 'A2', fecha: '2015-01-02' })
  assert.deepEqual(leerEscrituraCarnet('baja', { fichaId: A }, K), { accion: 'baja', id: K, fichaId: A })
})

// ─── Respuesta del puente ────────────────────────────────────────────────────

test('ok solo con 2xx, estado ok e id', () => {
  assert.deepEqual(interpretarEscrituraCarnet(200, { estado: 'ok', id: K }), { estado: 'ok', id: K })
  assert.equal(interpretarEscrituraCarnet(500, { estado: 'ok', id: K }).estado, 'error')
  assert.equal(interpretarEscrituraCarnet(200, { estado: 'ok' }).estado, 'error')
  assert.equal(interpretarEscrituraCarnet(200, null).estado, 'error')
})

test('estados del puente → estados del portal', () => {
  assert.deepEqual(
    interpretarEscrituraCarnet(422, { estado: 'invalido', motivo: 'La fecha del carné no puede ser futura.', campo: 'fecha' }),
    { estado: 'invalido', motivo: 'La fecha del carné no puede ser futura.', campo: 'fecha' },
  )
  assert.deepEqual(interpretarEscrituraCarnet(422, { estado: 'invalido', motivo: 'datos_invalidos' }), { estado: 'invalido', motivo: 'dato no válido' })
  assert.deepEqual(interpretarEscrituraCarnet(409, { estado: 'duplicado' }), { estado: 'duplicado' })
  assert.deepEqual(interpretarEscrituraCarnet(404, { estado: 'no_encontrado' }), { estado: 'no_encontrado' })
  assert.deepEqual(interpretarEscrituraCarnet(409, { estado: 'sin_ficha' }), { estado: 'sin_ficha' })
  assert.deepEqual(interpretarEscrituraCarnet(503, { estado: 'sin_configurar' }), { estado: 'sin_puente' })
  assert.equal(interpretarEscrituraCarnet(503, { estado: 'error', causa: 'x' }).estado, 'error')
  assert.equal(interpretarEscrituraCarnet(401, { error: 'No autorizado' }).estado, 'error')
})

test('HTTP del portal: sin_puente 503 ≠ error 502; alta 201', () => {
  assert.equal(statusEscrituraCarnet('sin_puente'), 503)
  assert.equal(statusEscrituraCarnet('error'), 502)
  assert.equal(statusEscrituraCarnet('ok', true), 201)
  assert.equal(statusEscrituraCarnet('ok'), 200)
  assert.equal(statusEscrituraCarnet('invalido'), 422)
  assert.equal(statusEscrituraCarnet('duplicado'), 409)
  assert.equal(statusEscrituraCarnet('no_encontrado'), 404)
})

// ─── Pantalla ────────────────────────────────────────────────────────────────

test('selector de titular solo con MÁS de un titular escribible; uno sin ficha no cuenta', () => {
  const ana = { fichaId: A, nombre: 'Ana', carnets: [] }
  const blas = { fichaId: B, nombre: 'Blas', carnets: [] }
  const viejo = { fichaId: '', nombre: '', carnets: [] }
  assert.equal(necesitaSelectorTitular([ana]), false)
  assert.equal(necesitaSelectorTitular([ana, blas]), true)
  assert.equal(necesitaSelectorTitular([ana, viejo]), false)
  assert.deepEqual(titularesEscribibles([viejo]), [])
})

test('los textos de fallo no culpan al cliente ni confunden 503 con 502', () => {
  const sinPuente = textoAvisoCarnet({ estado: 'sin_puente' })
  const error = textoAvisoCarnet({ estado: 'error', causa: 'red' })
  assert.notEqual(sinPuente, error)
  for (const t of [sinPuente, error]) {
    assert.doesNotMatch(t, /revisa/i, t)
    assert.match(t, /No se ha cambiado nada/)
  }
  assert.match(error, /problema nuestro/)
  assert.match(textoAvisoCarnet({ estado: 'invalido', motivo: 'La fecha del carné no puede ser futura.' }), /no puede ser futura\. No se ha guardado/)
  assert.match(textoAvisoCarnet({ estado: 'duplicado' }), /cambia su fecha/)
})

test('fecha de caducidad en formato español; lo que no es fecha se deja tal cual', () => {
  assert.equal(fechaCarnetEs('2031-07-09'), '09/07/2031')
  assert.equal(fechaCarnetEs('raro'), 'raro')
})

test('las rutas del portal sacan la identidad de la cookie y no aceptan clienteId', () => {
  const sinComentarios = (rel: string) =>
    readFileSync(new URL(rel, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
  for (const rel of ['../app/api/mis-datos/carnets/route.ts', '../app/api/mis-datos/carnets/[id]/route.ts']) {
    const src = sinComentarios(rel)
    assert.match(src, /requireIdentidad\(\)/, rel)
    assert.match(src, /escribirYResponder\(identidad\.id,/, rel)
    assert.doesNotMatch(src, /clienteId|identidadId/, rel)
  }
  // La pantalla no lleva Zod al navegador.
  assert.doesNotMatch(sinComentarios('../app/(portal)/boveda/MisCarnets.tsx'), /carnets-escritura|from 'zod'/)
})

test('🪤 H4: «MisCarnets» recibe el día de MADRID (no el UTC): a las 23:30 UTC el máximo de la fecha sería ayer', () => {
  const page = readFileSync(new URL('../app/(portal)/boveda/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /<MisCarnets [^>]*hoy=\{hoyMadrid\}/)
  assert.match(page, /const hoyMadrid = new Date\(\)\.toLocaleDateString\('en-CA', \{ timeZone: 'Europe\/Madrid' \}\)/)
  // y a esa hora el día UTC y el de Madrid difieren: justo el caso que el viejo `toISOString` fallaba
  const ahora = new Date('2026-10-10T23:30:00Z')
  assert.equal(ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }), '2026-10-11')
  assert.equal(ahora.toISOString().slice(0, 10), '2026-10-10')
})
