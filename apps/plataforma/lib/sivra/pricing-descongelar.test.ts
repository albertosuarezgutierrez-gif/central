import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { descongelar, detalleDescongeladas, DIAS_CONGELADA } from './pricing-descongelar.ts'

const RUTA_APPLY = new URL('../../app/api/sivra/pricing/apply/route.ts', import.meta.url)

const VIVA = { diasSinEscribir: 2, rumorCaido: false }

test('una fecha que se reescribe con normalidad NO se toca', () => {
  const r = descongelar(VIVA)
  assert.equal(r.libera, false)
})

test('justo por debajo del tope sigue protegida', () => {
  const r = descongelar({ ...VIVA, diasSinEscribir: DIAS_CONGELADA - 1 })
  assert.equal(r.libera, false)
})

test('en el tope se libera, y dice cuántos días lleva', () => {
  const r = descongelar({ ...VIVA, diasSinEscribir: DIAS_CONGELADA })
  assert.equal(r.libera, true)
  assert.match(r.motivo, new RegExp(`${DIAS_CONGELADA} días`))
})

test('el caso real: Busto Reform 21-feb-2027, 41 días clavada', () => {
  const r = descongelar({ diasSinEscribir: 41, rumorCaido: false })
  assert.equal(r.libera, true)
  assert.match(r.motivo, /41 días/)
})

test('una fecha que el motor NUNCA pudo tarificar también se libera', () => {
  // House Sevillana 29-may-2027: 2,22x la mediana del piso, cero escrituras, cero comparables.
  const r = descongelar({ diasSinEscribir: null, rumorCaido: false })
  assert.equal(r.libera, true)
  assert.match(r.motivo, /nunca/)
})

test('🚨 el rumor caído libera YA, sin esperar los días', () => {
  // Decisión de Alberto: subir por un rumor y dejar la fecha trancada es el problema.
  const r = descongelar({ diasSinEscribir: 1, rumorCaido: true })
  assert.equal(r.libera, true)
  assert.match(r.motivo, /se descartó/)
})

test('el rumor caído manda sobre cualquier otra consideración', () => {
  const r = descongelar({ diasSinEscribir: 0, rumorCaido: true })
  assert.equal(r.libera, true)
})

test('días negativos o no finitos no liberan nada (dato corrupto ≠ permiso)', () => {
  for (const diasSinEscribir of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = descongelar({ diasSinEscribir, rumorCaido: false })
    assert.equal(r.libera, false, `${diasSinEscribir} no debería liberar`)
  }
})

test('un tope mal configurado no abre el candado de par en par', () => {
  const r = descongelar({ diasSinEscribir: 400, rumorCaido: false }, { diasMaximos: 0 })
  assert.equal(r.libera, false)
})

test('el tope es configurable', () => {
  const r = descongelar({ diasSinEscribir: 8, rumorCaido: false }, { diasMaximos: 7 })
  assert.equal(r.libera, true)
})

test('sin descongeladas el parte es null: no se inventa una línea', () => {
  assert.equal(detalleDescongeladas([]), null)
})

test('el parte agrupa por familia de motivo, no por el texto exacto', () => {
  const parte = detalleDescongeladas([
    { fecha: '2027-02-21', motivo: '41 días sin poder reescribirse (tope 21)' },
    { fecha: '2027-02-22', motivo: '35 días sin poder reescribirse (tope 21)' },
    { fecha: '2027-05-29', motivo: 'el evento que subió esta fecha se descartó' },
    { fecha: '2027-06-01', motivo: 'el motor nunca ha podido ponerle precio a esta fecha' },
  ])
  assert.ok(parte)
  assert.match(parte!, /4 noche\(s\)/)
  assert.match(parte!, /2 por antigüedad/)
  assert.match(parte!, /1 por rumor descartado/)
  assert.match(parte!, /1 por nunca tarificada/)
})

// ─── Guardián de cableado ────────────────────────────────────────────────────────────────────
// Ni tsc ni next build ven si el motor USA esta llave: borrar la llamada compila igual y las 270
// noches se vuelven a quedar presas en silencio. Mismo patrón que pricing-techo-mercado.test.ts.
test('guardián: pricing/apply llama a descongelar y lee el historial de escrituras', () => {
  const fuente = readFileSync(RUTA_APPLY, 'utf8')
  assert.match(fuente, /descongelar\(/, 'apply/route.ts ya no calcula la segunda llave')
  assert.match(fuente, /diasSinEscribir/, 'apply/route.ts ya no lee los días desde la última escritura')
  assert.match(fuente, /rumorCaido/, 'apply/route.ts ya no detecta el rumor descartado')
  // El fallo de la lectura auxiliar NO puede descongelar de más: sin historial se trata como
  // reciente. Si alguien lo cambia a `?? null`, un 500 de esa consulta abriría todos los candados.
  assert.match(
    fuente,
    /hayHistorialEscrituras/,
    'sin la guarda de historial, un fallo de lectura descongelaría el calendario entero',
  )
})
