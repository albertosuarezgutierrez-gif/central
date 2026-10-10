import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BORRADOR_TTL_MS,
  borrarBorrador,
  claveBorradorAutoNuevo,
  claveBorradorRetarificar,
  guardarBorrador,
  leerBorrador,
  leerBorradorAutoNuevo,
  type AlmacenLocal,
} from './borrador-local.ts'

/** Almacén de mentira, con los tres fallos reales de `localStorage`. */
function almacenFalso(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial))
  let reventarAlEscribir = false
  let reventarAlLeer = false
  const a: AlmacenLocal = {
    getItem: (k) => {
      if (reventarAlLeer) throw new Error('SecurityError')
      return datos.get(k) ?? null
    },
    setItem: (k, v) => {
      if (reventarAlEscribir) throw new Error('QuotaExceededError')
      datos.set(k, v)
    },
    removeItem: (k) => {
      datos.delete(k)
    },
  }
  return {
    a,
    datos,
    romperEscritura: () => {
      reventarAlEscribir = true
    },
    romperLectura: () => {
      reventarAlLeer = true
    },
  }
}

const AHORA = 1_758_000_000_000

test('lo que se guarda se recupera igual', () => {
  const { a } = almacenFalso()
  guardarBorrador('k', { matricula: '2222DDD', correcciones: { dni: '00000001R' } }, a, AHORA)
  assert.deepEqual(leerBorrador('k', a, AHORA), {
    matricula: '2222DDD',
    correcciones: { dni: '00000001R' },
  })
})

test('el sello de tiempo NO se devuelve como si fuera un campo del formulario', () => {
  const { a } = almacenFalso()
  guardarBorrador('k', { matricula: '2222DDD' }, a, AHORA)
  const b = leerBorrador<Record<string, unknown>>('k', a, AHORA)
  assert.ok(b !== null)
  assert.equal('guardadoEn' in b, false)
})

test('sin nada guardado devuelve null, no un objeto vacío', () => {
  const { a } = almacenFalso()
  assert.equal(leerBorrador('k', a, AHORA), null)
})

test('un borrador caducado NO se devuelve', () => {
  const { a } = almacenFalso()
  guardarBorrador('k', { matricula: '2222DDD' }, a, AHORA)
  assert.equal(leerBorrador('k', a, AHORA + BORRADOR_TTL_MS + 1), null)
})

test('justo en el límite del TTL todavía vale', () => {
  const { a } = almacenFalso()
  guardarBorrador('k', { matricula: '2222DDD' }, a, AHORA)
  assert.deepEqual(leerBorrador('k', a, AHORA + BORRADOR_TTL_MS), { matricula: '2222DDD' })
})

test('leer uno caducado lo BORRA: el dato personal no se queda esperando', () => {
  const { a, datos } = almacenFalso()
  guardarBorrador('k', { correcciones: { dni: '00000001R' } }, a, AHORA)
  leerBorrador('k', a, AHORA + BORRADOR_TTL_MS + 1)
  assert.equal(datos.has('k'), false)
})

test('un JSON corrupto devuelve null en vez de lanzar', () => {
  const { a } = almacenFalso({ k: '{esto no es json' })
  assert.equal(leerBorrador('k', a, AHORA), null)
})

test('un JSON válido que no es objeto devuelve null', () => {
  const { a } = almacenFalso({ k: '"soy una cadena"' })
  assert.equal(leerBorrador('k', a, AHORA), null)
  const b = almacenFalso({ k: '[1,2,3]' })
  assert.equal(leerBorrador('k', b.a, AHORA), null)
})

test('sin sello de tiempo se trata como caducado (no se sabe de cuándo es)', () => {
  const { a } = almacenFalso({ k: JSON.stringify({ matricula: '2222DDD' }) })
  assert.equal(leerBorrador('k', a, AHORA), null)
})

test('sin almacén (render en servidor) no lanza: null al leer, nada al escribir', () => {
  assert.equal(leerBorrador('k', null, AHORA), null)
  assert.doesNotThrow(() => guardarBorrador('k', { a: 1 }, null, AHORA))
  assert.doesNotThrow(() => borrarBorrador('k', null))
})

test('si el almacén revienta al escribir, la pantalla NO se entera', () => {
  const { a, romperEscritura } = almacenFalso()
  romperEscritura()
  assert.doesNotThrow(() => guardarBorrador('k', { matricula: '2222DDD' }, a, AHORA))
})

test('si el almacén revienta al leer, devuelve null en vez de lanzar', () => {
  const { a, romperLectura } = almacenFalso()
  romperLectura()
  assert.equal(leerBorrador('k', a, AHORA), null)
})

test('borrar deja la pantalla sin borrador', () => {
  const { a } = almacenFalso()
  guardarBorrador('k', { matricula: '2222DDD' }, a, AHORA)
  borrarBorrador('k', a)
  assert.equal(leerBorrador('k', a, AHORA), null)
})

test('guardar dos veces se queda con lo último, no acumula', () => {
  const { a } = almacenFalso()
  guardarBorrador('k', { matricula: '2222DDD', garaje: 'via' }, a, AHORA)
  guardarBorrador('k', { matricula: '5655DSM' }, a, AHORA)
  assert.deepEqual(leerBorrador('k', a, AHORA), { matricula: '5655DSM' })
})

test('cada cliente y cada póliza tienen SU clave: un borrador no pisa a otro', () => {
  assert.notEqual(claveBorradorAutoNuevo('aaa'), claveBorradorAutoNuevo('bbb'))
  assert.notEqual(claveBorradorAutoNuevo('x'), claveBorradorRetarificar('x'))
  assert.notEqual(claveBorradorAutoNuevo('x', 'op1'), claveBorradorAutoNuevo('x'), 'la variante de un riesgo no lee el borrador del cliente')
  // La de retarificar no cambia: ya hay borradores vivos con ese nombre.
  assert.equal(claveBorradorRetarificar('p1'), 'asegura_retarificar_borrador_p1')
})

test('dos clientes distintos guardan borradores independientes', () => {
  const { a } = almacenFalso()
  guardarBorrador(claveBorradorAutoNuevo('c1'), { matricula: '2222DDD' }, a, AHORA)
  guardarBorrador(claveBorradorAutoNuevo('c2'), { matricula: '5655DSM' }, a, AHORA)
  assert.deepEqual(leerBorrador(claveBorradorAutoNuevo('c1'), a, AHORA), { matricula: '2222DDD' })
  assert.deepEqual(leerBorrador(claveBorradorAutoNuevo('c2'), a, AHORA), { matricula: '5655DSM' })
})

test('ir a la ficha y volver: la misma URL da la misma clave y recupera el borrador', () => {
  const { a } = almacenFalso()
  for (const op of [undefined, null, 'op1']) {
    const ida = claveBorradorAutoNuevo('c1', op)
    guardarBorrador(ida, { matricula: '2222DDD' }, a, AHORA)
    // La vuelta recalcula la clave desde la misma URL: tiene que ser idéntica (sin `undefined` en el nombre).
    assert.equal(claveBorradorAutoNuevo('c1', op), ida)
    assert.deepEqual(leerBorrador(ida, a, AHORA), { matricula: '2222DDD' })
  }
  // `undefined` y `null` (sin ?oportunidad=) son el MISMO borrador; con oportunidad es otro, a propósito.
  assert.equal(claveBorradorAutoNuevo('c1', undefined), claveBorradorAutoNuevo('c1', null))
  assert.doesNotMatch(claveBorradorAutoNuevo('c1'), /undefined|null/)
})

function almacenConClaves(): { a: AlmacenLocal; datos: Map<string, string> } {
  const datos = new Map<string, string>()
  const a: AlmacenLocal = {
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
    key: (i) => [...datos.keys()][i] ?? null,
    get length() { return datos.size },
  }
  return { a, datos }
}

test('auto nuevo: entrar sin ?oportunidad= recupera el borrador de su variante (y al revés); lo propio manda', () => {
  const { a } = almacenConClaves()
  guardarBorrador(claveBorradorAutoNuevo('c1', 'opA'), { matricula: 'AAA' }, a, AHORA - 1000)
  guardarBorrador(claveBorradorAutoNuevo('c1', 'opB'), { matricula: 'BBB' }, a, AHORA)
  guardarBorrador(claveBorradorAutoNuevo('c2', 'opC'), { matricula: 'CCC' }, a, AHORA)
  assert.deepEqual(leerBorradorAutoNuevo('c1', null, a, AHORA), { matricula: 'BBB' }, 'el más reciente, solo de SU cliente')
  assert.equal(leerBorradorAutoNuevo('c3', null, a, AHORA), null)
  guardarBorrador(claveBorradorAutoNuevo('c1'), { matricula: 'SIN' }, a, AHORA)
  assert.deepEqual(leerBorradorAutoNuevo('c1', 'opZ', a, AHORA), { matricula: 'SIN' }, 'con op y sin borrador propio, el del cliente')
  assert.deepEqual(leerBorradorAutoNuevo('c1', 'opA', a, AHORA), { matricula: 'AAA' }, 'lo propio manda')
  assert.deepEqual(leerBorradorAutoNuevo('c1', undefined, a, AHORA), { matricula: 'SIN' })
})

test('PedirDatos enlaza a la pantalla de tarificar CON ?oportunidad= (si no, abre otro borrador)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../app/(usuario)/correduria/cliente/[id]/PedirDatos.tsx', import.meta.url), 'utf8')
  assert.match(src, /const tarificar = .*\?oportunidad=\$\{encodeURIComponent\(oportunidadId\)\}/)
})
