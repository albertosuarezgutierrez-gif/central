import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planBackfillContacto, type FilaContacto, type CampoContacto } from './backfill-contacto.ts'

// Hash de juguete: determinístico y legible. Imita a los reales: email en
// minúsculas, teléfono solo dígitos, y `null` cuando no queda nada que hashear.
const h = (campo: CampoContacto, v: string): string | null => {
  const n = campo === 'email' ? v.trim().toLowerCase() : v.replace(/\D/g, '')
  return n === '' ? null : `H(${campo}:${n})`
}
const fila = (x: Partial<FilaContacto> & { id: string }): FilaContacto => ({
  origen: 'ficha',
  campo: 'email',
  valor: null,
  hashActual: null,
  ...x,
})

test('una ficha con email y sin hash es rellenable, con el hash normalizado', () => {
  const p = planBackfillContacto([fila({ id: 'a', valor: ' Pepe@Correo.ES ' })], h)
  assert.equal(p.filas[0].destino, 'rellenable')
  assert.equal(p.filas[0].hash, 'H(email:pepe@correo.es)')
  assert.equal(p.resumen.email.rellenables, 1)
  assert.deepEqual(p.choques, [])
})

test('la que ya tiene hash no se toca', () => {
  const p = planBackfillContacto([fila({ id: 'a', valor: 'x@y.es', hashActual: 'H(email:x@y.es)' })], h)
  assert.equal(p.filas[0].destino, 'ya_tiene')
  assert.equal(p.resumen.email.yaTiene, 1)
  assert.equal(p.resumen.email.rellenables, 0)
})

test('sin dato y descifrado fallido son DOS estados distintos, y ninguno se escribe', () => {
  const p = planBackfillContacto(
    [fila({ id: 'a' }), fila({ id: 'b', descifradoFallido: true }), fila({ id: 'c', valor: '   ' })],
    h,
  )
  assert.equal(p.filas[0].destino, 'sin_dato')
  assert.equal(p.filas[1].destino, 'ilegible')
  assert.equal(p.filas[2].destino, 'sin_dato')
  assert.equal(p.resumen.email.sinDato, 2)
  assert.equal(p.resumen.email.ilegibles, 1)
  assert.equal(p.resumen.email.rellenables, 0)
})

test('un valor que descifra pero no produce hash es no_hasheable, no «sin dato»', () => {
  const p = planBackfillContacto([fila({ id: 'a', campo: 'telefono', valor: 'sin teléfono' })], h)
  assert.equal(p.filas[0].destino, 'no_hasheable')
  assert.equal(p.resumen.telefono.noHasheables, 1)
  assert.equal(p.resumen.telefono.sinDato, 0)
})

test('dos FICHAS con el mismo email chocan: ninguna se escribe y salen como grupo', () => {
  // `uq_clientes_email_lookup_hash` es UNIQUE: escribir la segunda reventaría.
  const p = planBackfillContacto(
    [fila({ id: 'a', valor: 'casa@x.es' }), fila({ id: 'b', valor: 'CASA@x.es' })],
    h,
  )
  assert.deepEqual(p.filas.map((f) => f.destino), ['choca', 'choca'])
  assert.equal(p.resumen.email.enChoque, 2)
  assert.equal(p.resumen.email.rellenables, 0)
  assert.deepEqual(p.choques, [{ fichas: ['a', 'b'], hayPreexistente: false }])
})

test('una ficha sin hash cuyo email YA lo tiene otra ficha choca contra la preexistente', () => {
  const p = planBackfillContacto(
    [fila({ id: 'a', valor: 'casa@x.es', hashActual: 'H(email:casa@x.es)' }), fila({ id: 'b', valor: 'casa@x.es' })],
    h,
  )
  assert.equal(p.filas[0].destino, 'ya_tiene')
  assert.equal(p.filas[1].destino, 'choca')
  assert.deepEqual(p.choques, [{ fichas: ['a', 'b'], hayPreexistente: true }])
})

test('el mismo email en una ficha y en una fila HIJA no choca: la hija no tiene índice único', () => {
  const p = planBackfillContacto(
    [fila({ id: 'a', valor: 'casa@x.es' }), fila({ id: 'h1', origen: 'hija', valor: 'casa@x.es' })],
    h,
  )
  assert.deepEqual(p.filas.map((f) => f.destino), ['rellenable', 'rellenable'])
  assert.deepEqual(p.choques, [])
})

test('dos fichas con el mismo TELÉFONO no chocan: un móvil es un hogar, y no hay índice único', () => {
  const p = planBackfillContacto(
    [fila({ id: 'a', campo: 'telefono', valor: '600 11 22 33' }), fila({ id: 'b', campo: 'telefono', valor: '+34600112233' })],
    h,
  )
  assert.deepEqual(p.filas.map((f) => f.destino), ['rellenable', 'rellenable'])
  assert.equal(p.resumen.telefono.rellenables, 2)
  assert.equal(p.resumen.telefono.enChoque, 0)
})

test('el resumen cuenta cada campo por separado', () => {
  const p = planBackfillContacto(
    [
      fila({ id: 'a', valor: 'a@x.es' }),
      fila({ id: 'b', campo: 'telefono', valor: '600112233' }),
      fila({ id: 'c', campo: 'telefono' }),
    ],
    h,
  )
  assert.equal(p.resumen.email.total, 1)
  assert.equal(p.resumen.telefono.total, 2)
  assert.equal(p.resumen.telefono.sinDato, 1)
  assert.equal(p.resumen.telefono.rellenables, 1)
})

// ─── Mitades del email (búsqueda parcial) ────────────────────────────────────
const mitades = (v: string) => {
  const at = v.indexOf('@')
  if (at <= 0) return null
  return { dominio: `D(${v.slice(at + 1).toLowerCase()})`, usuario: `U(${v.slice(0, at).toLowerCase()})` }
}

test('las mitades se planifican TAMBIÉN en filas que ya tienen su hash principal', () => {
  // Es el caso del corpus entero el 08/09/2026: 4.251 fichas con hash y sin mitades.
  const p = planBackfillContacto([fila({ id: 'a', valor: 'x@y.es', hashActual: 'H(email:x@y.es)' })], h, mitades)
  assert.equal(p.filas[0].destino, 'ya_tiene')
  assert.deepEqual(p.filas[0].derivados, { dominio: 'D(y.es)', usuario: 'U(x)' })
  assert.equal(p.resumen.email.derivadosPendientes, 1)
})

test('una fila con las dos mitades ya puestas no tiene nada que escribir', () => {
  const p = planBackfillContacto(
    [fila({ id: 'a', valor: 'x@y.es', hashActual: 'H', derivadosActuales: { dominio: 'D(y.es)', usuario: 'U(x)' } })],
    h,
    mitades,
  )
  assert.equal(p.filas[0].derivados, null)
  assert.equal(p.resumen.email.derivadosPendientes, 0)
})

test('solo se escribe la mitad que falta, y las fichas que CHOCAN también reciben las suyas', () => {
  const p = planBackfillContacto(
    [
      fila({ id: 'a', valor: 'casa@x.es', derivadosActuales: { dominio: 'D(x.es)', usuario: null } }),
      fila({ id: 'b', valor: 'casa@x.es' }),
    ],
    h,
    mitades,
  )
  assert.deepEqual(p.filas.map((f) => f.destino), ['choca', 'choca'])
  assert.deepEqual(p.filas[0].derivados, { dominio: null, usuario: 'U(casa)' })
  assert.deepEqual(p.filas[1].derivados, { dominio: 'D(x.es)', usuario: 'U(casa)' })
  assert.equal(p.resumen.email.derivadosPendientes, 2)
})

test('sin función de mitades, o en teléfono, no se planifica ninguna', () => {
  const sinFn = planBackfillContacto([fila({ id: 'a', valor: 'x@y.es' })], h)
  assert.equal(sinFn.filas[0].derivados, null)
  const tel = planBackfillContacto([fila({ id: 'a', campo: 'telefono', valor: '600112233' })], h, mitades)
  assert.equal(tel.filas[0].derivados, null)
  assert.equal(tel.resumen.telefono.derivadosPendientes, 0)
})
