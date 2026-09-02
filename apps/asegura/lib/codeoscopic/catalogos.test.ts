import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarOpciones,
  normalizarMatricula,
  normalizarTexto,
  leerFecha,
  emparejar,
  hogarDisponible,
  type Opcion,
} from './catalogos.ts'

// ─── ¿Tarifica hogar? Tres estados ──────────────────────────────────────────

test('hogar disponible: devuelve el id EXACTO del vendor, no uno inventado', () => {
  const r = hogarDisponible([
    { id: 'Car', nombre: 'Auto' },
    { id: 'Home', nombre: 'Hogar' },
  ])
  assert.deepEqual(r, { estado: 'disponible', id: 'Home', nombre: 'Hogar' })
})

test('hogar se reconoce por el nombre en castellano aunque el id sea otro', () => {
  const r = hogarDisponible([{ id: 'HH', nombre: 'Hogar' }])
  assert.equal(r.estado, 'disponible')
  if (r.estado === 'disponible') assert.equal(r.id, 'HH')
})

test('🚨 lista vacía NO es «hogar no disponible»: es desconocido', () => {
  assert.deepEqual(hogarDisponible([]), { estado: 'desconocido' })
})

test('lista con ramos pero sin hogar: ausente, y se dice qué hay', () => {
  const r = hogarDisponible([{ id: 'Car', nombre: 'Auto' }])
  assert.deepEqual(r, { estado: 'ausente', ramos: ['Auto'] })
})

// ─── La respuesta del vendor viene con tres formas distintas ────────────────

test('lee las listas venga como venga (array pelado, items, data)', () => {
  const esperado = [{ id: '1', nombre: 'Sevilla' }]
  assert.deepEqual(normalizarOpciones([{ id: 1, name: 'Sevilla' }]), esperado)
  assert.deepEqual(normalizarOpciones({ items: [{ id: 1, name: 'Sevilla' }] }), esperado)
  assert.deepEqual(normalizarOpciones({ data: [{ id: 1, name: 'Sevilla' }] }), esperado)
})

test('acepta los nombres alternativos de id y de etiqueta', () => {
  assert.deepEqual(normalizarOpciones([{ code: 'C0058', description: 'Mapfre' }]), [
    { id: 'C0058', nombre: 'Mapfre' },
  ])
})

test('una entrada SIN id se descarta: un id vacío es un 400 pagado', () => {
  assert.deepEqual(normalizarOpciones([{ name: 'Sin id' }, { id: '  ', name: 'Vacío' }]), [])
})

test('si falta la etiqueta se usa el id, pero nunca al revés', () => {
  assert.deepEqual(normalizarOpciones([{ id: 'Single' }]), [{ id: 'Single', nombre: 'Single' }])
})

test('lo que no es una lista no revienta: devuelve vacío', () => {
  for (const raw of [null, undefined, 42, 'texto', {}, { items: 'no soy lista' }]) {
    assert.deepEqual(normalizarOpciones(raw), [])
  }
})

// ─── La fecha de matriculación y sus tres estados ───────────────────────────

test('lee la fecha del vendor y recorta la hora si la trae', () => {
  assert.equal(leerFecha({ date: '2021-10-01' }), '2021-10-01')
  assert.equal(leerFecha({ date: '2021-10-01T00:00:00Z' }), '2021-10-01')
  assert.equal(leerFecha({ registrationDate: '2019-03-15' }), '2019-03-15')
})

test('`null` del vendor NO se convierte en una fecha inventada', () => {
  for (const raw of [{ date: null }, {}, null, 'nada', { date: 'octubre' }]) {
    assert.equal(leerFecha(raw), null)
  }
})

test('la matrícula viaja sin espacios ni guiones y en mayúsculas', () => {
  assert.equal(normalizarMatricula(' 1234 abc '), '1234ABC')
  assert.equal(normalizarMatricula('se-1234-ab'), 'SE1234AB')
})

// ─── Emparejar texto del CRM con el catálogo: ante duda, nada ───────────────

const ESTADOS: Opcion[] = [
  { id: 'Single', nombre: 'Soltero' },
  { id: 'Married', nombre: 'Casado' },
  { id: 'Divorced', nombre: 'Divorciado' },
  { id: 'Widowed', nombre: 'Viudo' },
]

test('empareja ignorando mayúsculas y tildes', () => {
  assert.deepEqual(emparejar(ESTADOS, 'casado'), { id: 'Married', nombre: 'Casado' })
  assert.deepEqual(emparejar(ESTADOS, '  DIVORCIADO '), { id: 'Divorced', nombre: 'Divorciado' })
})

test('lo que no está EXACTO no se empareja: «Separado» no es «Soltero»', () => {
  assert.equal(emparejar(ESTADOS, 'Separado'), null)
  assert.equal(emparejar(ESTADOS, 'Sol'), null)
  assert.equal(emparejar(ESTADOS, 'pareja de hecho'), null)
})

test('sin texto no hay emparejamiento, y eso no es un error', () => {
  assert.equal(emparejar(ESTADOS, null), null)
  assert.equal(emparejar(ESTADOS, '   '), null)
})

test('si el catálogo tiene el mismo nombre dos veces NO se elige uno a ciegas', () => {
  const ambiguo: Opcion[] = [
    { id: 'A', nombre: 'Casado' },
    { id: 'B', nombre: 'casado' },
  ]
  assert.equal(emparejar(ambiguo, 'Casado'), null)
})

test('normalizarTexto quita tildes de verdad', () => {
  assert.equal(normalizarTexto('Alcalá de Guadaíra'), 'alcala de guadaira')
  assert.equal(normalizarTexto('  CÓRDOBA '), 'cordoba')
})
