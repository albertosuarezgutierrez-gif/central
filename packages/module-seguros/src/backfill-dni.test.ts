import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planBackfillDni, tokensNombre, type FichaDni } from './backfill-dni.ts'

// Hash de juguete: determinístico y legible en los asserts.
const h = (dni: string) => `H(${dni.toUpperCase().replace(/[^A-Z0-9]/g, '')})`
const ficha = (x: Partial<FichaDni> & { id: string }): FichaDni => ({
  esCliente: true,
  dni: null,
  hashActual: null,
  ...x,
})

test('una ficha con DNI y sin hash es rellenable', () => {
  const p = planBackfillDni([ficha({ id: 'a', dni: '12345678Z' })], h)
  assert.equal(p.filas[0].destino, 'rellenable')
  assert.equal(p.filas[0].hash, 'H(12345678Z)')
  assert.deepEqual(p.choques, [])
})

test('dos fichas cliente con el mismo DNI NO son rellenables: son un choque', () => {
  // Es el caso que revienta `uq_clientes_dni_lookup_hash`, y el hallazgo que se busca.
  const p = planBackfillDni(
    [ficha({ id: 'a', dni: '12345678Z' }), ficha({ id: 'b', dni: '12.345.678-z' })],
    h,
  )
  assert.deepEqual(p.filas.map((f) => f.destino), ['choca', 'choca'])
  assert.equal(p.choques.length, 1)
  assert.deepEqual(p.choques[0].fichas, ['a', 'b'])
  assert.equal(p.resumen.rellenables, 0)
})

test('el choque contra una ficha que YA tenía el hash pone a esa primera', () => {
  // La preexistente es la que sobrevive por defecto en la fusión.
  const p = planBackfillDni(
    [ficha({ id: 'nueva', dni: '12345678Z' }), ficha({ id: 'vieja', hashActual: 'H(12345678Z)' })],
    h,
  )
  assert.equal(p.choques.length, 1)
  assert.deepEqual(p.choques[0].fichas, ['vieja', 'nueva'])
  assert.equal(p.choques[0].hayPreexistente, true)
})

test('un lead con el mismo DNI que un cliente no choca: el índice único es parcial', () => {
  const p = planBackfillDni(
    [ficha({ id: 'cli', dni: '12345678Z' }), ficha({ id: 'lead', dni: '12345678Z', esCliente: false })],
    h,
  )
  assert.deepEqual(p.choques, [])
  assert.deepEqual(p.filas.map((f) => f.destino), ['rellenable', 'rellenable'])
})

test('el DNI que no descifra es ILEGIBLE, nunca «sin DNI»', () => {
  const p = planBackfillDni([ficha({ id: 'a', dni: null, descifradoFallido: true })], h)
  assert.equal(p.filas[0].destino, 'ilegible')
  assert.equal(p.filas[0].motivo, 'no_descifra')
  assert.equal(p.resumen.sinDni, 0)
})

test('sin clave de hashing la ficha cae en ilegible, no en rellenable', () => {
  // `computeDniLookupHash` devuelve null si falta PII_LOOKUP_KEY. Tratar eso
  // como «nada que hacer» dejaría el backfill en silencio diciendo que ya está.
  const p = planBackfillDni([ficha({ id: 'a', dni: '12345678Z' })], () => null)
  assert.equal(p.filas[0].destino, 'ilegible')
  assert.equal(p.resumen.rellenables, 0)
})

test('si el hashing lanza, la ficha cae en ilegible en vez de tumbar el plan', () => {
  const p = planBackfillDni([ficha({ id: 'a', dni: '12345678Z' })], () => {
    throw new Error('PII_LOOKUP_KEY malformed')
  })
  assert.equal(p.filas[0].destino, 'ilegible')
})

test('un valor de cajón no genera hash: no puede fundir a dos personas', () => {
  // «PENDIENTE» en dos fichas distintas las fundiría en una si se hashease.
  const pareceDoc = (d: string) => /^\d{8}[A-Z]$/.test(d.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  const p = planBackfillDni(
    [ficha({ id: 'a', dni: 'PENDIENTE' }), ficha({ id: 'b', dni: 'PENDIENTE' })],
    h,
    pareceDoc,
  )
  assert.deepEqual(p.filas.map((f) => f.destino), ['ilegible', 'ilegible'])
  assert.deepEqual(p.choques, [])
  assert.equal(p.filas[0].motivo, 'no_parece_documento')
})

test('la ficha sin DNI se cuenta aparte de la ilegible', () => {
  const p = planBackfillDni(
    [ficha({ id: 'a' }), ficha({ id: 'b', dni: '   ' }), ficha({ id: 'c', dni: null, descifradoFallido: true })],
    h,
  )
  assert.equal(p.resumen.sinDni, 2)
  assert.equal(p.resumen.ilegibles, 1)
})

test('el resumen cuadra con las filas', () => {
  const p = planBackfillDni(
    [
      ficha({ id: 'a', dni: '12345678Z' }),
      ficha({ id: 'b', dni: '12345678Z' }),
      ficha({ id: 'c', dni: '87654321X' }),
      ficha({ id: 'd', hashActual: 'H(11111111H)' }),
      ficha({ id: 'e' }),
    ],
    h,
  )
  const { total, sinDni, yaTiene, ilegibles, rellenables, enChoque } = p.resumen
  assert.equal(total, 5)
  assert.equal(sinDni + yaTiene + ilegibles + rellenables + enChoque, total)
  assert.equal(enChoque, 2)
  assert.equal(rellenables, 1)
})

test('tres fichas con el mismo DNI salen en un solo grupo', () => {
  const p = planBackfillDni(
    ['a', 'b', 'c'].map((id) => ficha({ id, dni: '12345678Z' })),
    h,
  )
  assert.equal(p.choques.length, 1)
  assert.equal(p.choques[0].fichas.length, 3)
})

// ─── El DNI centinela (05/09/2026) ──────────────────────────────────────────
// Un documento con letra correcta tecleado en la ficha de veinte personas
// distintas. Pasa `looksLikeDniNieCif`, así que el filtro de valores de cajón no
// lo ve, y 14.990 de las 15.092 fichas sin hash son `lead` — donde el índice
// único no protege y el hash se escribiría sin que nada fallase.

test('un DNI con TRES nombres sin nada en común es un centinela: no se escribe en ninguna', () => {
  const p = planBackfillDni(
    [
      ficha({ id: 'a', esCliente: false, dni: '12345678Z', nombre: 'Ángel 14386' }),
      ficha({ id: 'b', esCliente: false, dni: '12345678Z', nombre: 'Chema 14134' }),
      ficha({ id: 'c', esCliente: false, dni: '12345678Z', nombre: 'Eva 12895' }),
    ],
    h,
  )
  assert.deepEqual(p.filas.map((f) => f.destino), ['compartido', 'compartido', 'compartido'])
  assert.equal(p.resumen.rellenables, 0)
  assert.equal(p.resumen.compartidos, 3)
  assert.equal(p.compartidos.length, 1)
  assert.equal(p.compartidos[0].nombresDistintos, 3)
  assert.deepEqual(p.choques, [], 'no es un choque: son `lead`, y además no hay a quién fusionar')
})

test('el centinela manda sobre el choque: veinte personas no se fusionan en una', () => {
  const p = planBackfillDni(
    [
      ficha({ id: 'a', dni: '12345678Z', nombre: 'Alberto Suárez Gutiérrez' }),
      ficha({ id: 'b', dni: '12345678Z', nombre: 'Alejandro Sáez Caro' }),
      ficha({ id: 'c', dni: '12345678Z', nombre: 'Daniela Goncalves' }),
    ],
    h,
  )
  assert.deepEqual(p.filas.map((f) => f.destino), ['compartido', 'compartido', 'compartido'])
  assert.equal(p.resumen.enChoque, 0, 'ninguna queda como candidata a fusión')
  assert.equal(p.compartidos.length, 1)
})

test('tres variantes del MISMO nombre no son un centinela: son la misma persona', () => {
  // «Proyecto Assento» / «Proyecto Assento .» / «Proyecto Assento (sin apellidos)»
  // — el caso real del grupo 280. Comparten tokens, así que siguen siendo choque.
  const p = planBackfillDni(
    [
      ficha({ id: 'a', dni: '12345678Z', nombre: 'Proyecto Assento' }),
      ficha({ id: 'b', dni: '12345678Z', nombre: 'Proyecto Assento .' }),
      ficha({ id: 'c', dni: '12345678Z', nombre: 'Proyecto Assento (sin apellidos)' }),
    ],
    h,
  )
  assert.deepEqual(p.filas.map((f) => f.destino), ['choca', 'choca', 'choca'])
  assert.deepEqual(p.compartidos, [])
})

test('con DOS nombres distintos NO se activa: ahí un DNI mal tecleado y una variante se ven igual', () => {
  // «Adela Gutiérrez Alcalá» / «Adela Alcalá» es la misma persona; «Elisa de Paz
  // Campo» / «Juan Antonio Romero López» no. Con dos fichas no se distingue, así
  // que se dejan en `choca`, que es lo que las pone delante de una persona.
  const p = planBackfillDni(
    [
      ficha({ id: 'a', dni: '12345678Z', nombre: 'Elisa de Paz Campo' }),
      ficha({ id: 'b', dni: '12345678Z', nombre: 'Juan Antonio Romero López' }),
    ],
    h,
  )
  assert.deepEqual(p.filas.map((f) => f.destino), ['choca', 'choca'])
  assert.deepEqual(p.compartidos, [])
})

test('la ficha que YA tenía el hash cuenta para detectar el centinela, y no se le quita', () => {
  const p = planBackfillDni(
    [
      ficha({ id: 'vieja', hashActual: 'H(12345678Z)', nombre: 'Alberto Suárez Gutiérrez' }),
      ficha({ id: 'b', esCliente: false, dni: '12345678Z', nombre: 'Chema 14134' }),
      ficha({ id: 'c', esCliente: false, dni: '12345678Z', nombre: 'Eva 12895' }),
    ],
    h,
  )
  const porId = new Map(p.filas.map((f) => [f.id, f]))
  assert.equal(porId.get('vieja')?.destino, 'ya_tiene', 'un hash escrito no se borra desde aquí')
  assert.equal(porId.get('b')?.destino, 'compartido')
  assert.equal(porId.get('c')?.destino, 'compartido')
  assert.equal(p.compartidos[0].fichas.length, 3, 'el grupo la incluye: hay que mirarla a mano')
})

test('sin nombres no se afirma que sea un centinela', () => {
  // Tres fichas con el mismo DNI y ningún nombre: no se sabe si son la misma
  // persona o veinte. No es «no es centinela», es que no se ha podido mirar —
  // y se quedan en `choca`, que es donde las ve una persona.
  const p = planBackfillDni(
    [
      ficha({ id: 'a', dni: '12345678Z' }),
      ficha({ id: 'b', dni: '12345678Z' }),
      ficha({ id: 'c', dni: '12345678Z' }),
    ],
    h,
  )
  assert.deepEqual(p.compartidos, [])
  assert.deepEqual(p.filas.map((f) => f.destino), ['choca', 'choca', 'choca'])
})

test('tokensNombre tira los códigos que el volcado pegó al apellido', () => {
  assert.deepEqual(tokensNombre('Ángel 14386'), ['angel'])
  assert.deepEqual(tokensNombre('García Suárez 14354'), ['garcia', 'suarez'])
  assert.deepEqual(tokensNombre('Proyecto Assento (sin apellidos)'), ['proyecto', 'assento'])
  assert.deepEqual(tokensNombre(null), [])
})

test('«Lead 12345» no es un nombre: es la marca de que la ficha no lo trae', () => {
  assert.deepEqual(tokensNombre('Lead 12345'), [])
  assert.deepEqual(tokensNombre('LEAD 20979'), [])
  assert.deepEqual(tokensNombre('Lead'), [])
  // Un apellido de verdad al lado sí cuenta: sólo se anula cuando no queda nada más.
  assert.deepEqual(tokensNombre('Lead Villegas 133'), ['lead', 'villegas'])
})

test('las fichas sin nombre del volcado NO convierten un duplicado en centinela', () => {
  // Caso real (05/09/2026, grupo 3 de la foto del plan): una persona repetida
  // más sus dos fichas por-póliza del volcado. Contando «lead» como nombre
  // salían 3 nombres distintos y el grupo se marcaba centinela, que lo sacaba
  // de la cola de fusión — justo al revés de lo que hay que hacer con él.
  const p = planBackfillDni(
    [
      ficha({ id: 'p1', dni: '12345678Z', nombre: 'Jose Angel 12950' }),
      ficha({ id: 'p2', esCliente: false, dni: '12345678Z', nombre: 'Jose Angel Benedito Mauri' }),
      ficha({ id: 'v1', esCliente: false, dni: '12345678Z', nombre: 'Lead 18478' }),
      ficha({ id: 'v2', esCliente: false, dni: '12345678Z', nombre: 'Lead 19369' }),
    ],
    h,
  )
  assert.deepEqual(p.compartidos, [], 'no es un centinela: es la misma persona repetida')
  assert.equal(p.resumen.compartidos, 0)
  assert.equal(p.filas.find((f) => f.id === 'p1')?.destino, 'rellenable')
})

test('un grupo de puras fichas «Lead N» no se marca centinela', () => {
  // Sin un solo nombre no se puede afirmar que sean personas distintas, y son
  // la mitad de la cartera: marcarlas dejaría el backfill sin escribir nada.
  const p = planBackfillDni(
    [
      ficha({ id: 'a', esCliente: false, dni: '12345678Z', nombre: 'Lead 1' }),
      ficha({ id: 'b', esCliente: false, dni: '12345678Z', nombre: 'Lead 2' }),
      ficha({ id: 'c', esCliente: false, dni: '12345678Z', nombre: 'Lead 3' }),
    ],
    h,
  )
  assert.deepEqual(p.compartidos, [])
  assert.deepEqual(p.filas.map((f) => f.destino), ['rellenable', 'rellenable', 'rellenable'])
})

test('el centinela de verdad sigue saltando aunque lo entierren fichas sin nombre', () => {
  // El grupo medido: 5.615 fichas «Lead N» y un puñado de personas sin relación
  // entre sí. Las que mandan son las que tienen nombre.
  const p = planBackfillDni(
    [
      ficha({ id: 'x1', esCliente: false, dni: '12345678Z', nombre: 'Alberto Suárez Gutiérrez' }),
      ficha({ id: 'x2', esCliente: false, dni: '12345678Z', nombre: 'Chema 14134' }),
      ficha({ id: 'x3', esCliente: false, dni: '12345678Z', nombre: 'Eva 12895' }),
      ...Array.from({ length: 20 }, (_, i) =>
        ficha({ id: `l${i}`, esCliente: false, dni: '12345678Z', nombre: `Lead ${i}` }),
      ),
    ],
    h,
  )
  assert.equal(p.compartidos.length, 1)
  assert.equal(p.compartidos[0].nombresDistintos, 3, 'las «Lead N» no cuentan como nombre')
  assert.equal(p.compartidos[0].fichas.length, 23, 'pero sí entran en el grupo: llevan el DNI malo')
  assert.equal(p.resumen.compartidos, 23)
})
