import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { descongelar, detalleDescongeladas, DIAS_CONGELADA, esSaltoNuestro, esDescensoNuestro } from './pricing-descongelar.ts'

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

// ── Tercera llave: el salto que la puso cara es NUESTRO y reciente ────────────────────────────
// Caso real: Busto Reform, jul-2027. Base normal del mes ~80€, OUTLIER_RATIO 1,4 → techo 112€.
// La pasada de las 14:30 del 03/09/2026 subió la noche de 82€ a 113€ (el filtro de liga del
// #2192) y a partir de ahí la guarda de outlier bloqueó su propia corrección.
const CTX = { old: 113, normalBase: 80, umbral: 1.4 }
const UE = { horas: 6, prev: 82, ult: 113 }

test('esSaltoNuestro: la subida propia reciente que cruza el umbral se reconoce', () => {
  assert.equal(esSaltoNuestro(UE, CTX), true)
})

test('esSaltoNuestro: (a) una subida vieja ya no es un disparo suelto', () => {
  assert.equal(esSaltoNuestro({ ...UE, horas: 72 }, CTX), false)
})

test('esSaltoNuestro: (b) si nuestra ultima escritura BAJO, no hay nada que deshacer', () => {
  assert.equal(esSaltoNuestro({ horas: 6, prev: 130, ult: 113 }, CTX), false)
})

test('esSaltoNuestro: (c) si ya era outlier ANTES, la razon viene de mas atras', () => {
  // 118 → 140: sube, pero 118 ya estaba por encima del techo de 112.
  assert.equal(esSaltoNuestro({ horas: 6, prev: 118, ult: 140 }, { ...CTX, old: 140 }), false)
})

test('esSaltoNuestro: (d) si el propietario lo cambio en Smoobu despues, el precio ya no es nuestro', () => {
  assert.equal(esSaltoNuestro(UE, { ...CTX, old: 150 }), false)
})

test('esSaltoNuestro: sin lectura de historial NO se descongela (degradacion conservadora)', () => {
  assert.equal(esSaltoNuestro(null, CTX), false)
})

test('esSaltoNuestro: sin base normal no se puede juzgar el umbral', () => {
  assert.equal(esSaltoNuestro(UE, { ...CTX, normalBase: 0 }), false)
})

test('esSaltoNuestro: prev NULL no se trata como 0 (seria una subida inventada)', () => {
  assert.equal(esSaltoNuestro({ horas: 6, prev: null, ult: 113 }, CTX), false)
})

test('descongelar: el salto nuestro libera, y con motivo propio', () => {
  const d = descongelar({ diasSinEscribir: 0, rumorCaido: false, saltoNuestro: true })
  assert.equal(d.libera, true)
  assert.match(d.motivo, /el motor hace horas/)
})

test('descongelar: sin salto nuestro, una fecha recien escrita sigue retenida', () => {
  assert.equal(descongelar({ diasSinEscribir: 0, rumorCaido: false, saltoNuestro: false }).libera, false)
})

test('detalleDescongeladas: la subida propia es su propia familia en el parte', () => {
  const txt = detalleDescongeladas([
    { fecha: '2027-07-05', motivo: 'la subida que la puso cara la escribió el motor hace horas' },
    { fecha: '2027-07-06', motivo: 'la subida que la puso cara la escribió el motor hace horas' },
    { fecha: '2027-03-01', motivo: '25 días sin poder reescribirse (tope 21)' },
  ])
  assert.match(String(txt), /2 por subida propia reciente/)
  assert.match(String(txt), /1 por antigüedad/)
})

// ── Cuarta llave: descenso en curso ───────────────────────────────────────────────────────────
// Caso real: Busto Reform 16/10/2026, que bajó 219→175 en la pasada del 03/09 08:31 y se quedó
// clavada tres pasadas seguidas mientras su vecina del 17/10 seguía descendiendo (140→120→112→90).
const BAJADA = { horas: 20, prev: 219, ult: 175 }

test('esDescensoNuestro: nuestra bajada reciente que sigue viva se reconoce', () => {
  assert.equal(esDescensoNuestro(BAJADA, { old: 175 }), true)
})

test('esDescensoNuestro: (a) pasada la ventana ya no es un descenso en curso', () => {
  assert.equal(esDescensoNuestro({ ...BAJADA, horas: 24 * 9 }, { old: 175 }), false)
})

test('esDescensoNuestro: (b) si nuestra ultima escritura SUBIO, no hay descenso que terminar', () => {
  assert.equal(esDescensoNuestro({ horas: 20, prev: 175, ult: 219 }, { old: 219 }), false)
})

test('esDescensoNuestro: (c) si el propietario lo resubio en Smoobu, el precio ya no es nuestro', () => {
  assert.equal(esDescensoNuestro(BAJADA, { old: 260 }), false)
})

test('esDescensoNuestro: sin historial NO se descongela', () => {
  assert.equal(esDescensoNuestro(null, { old: 175 }), false)
})

test('esDescensoNuestro: prev NULL no se trata como una bajada', () => {
  assert.equal(esDescensoNuestro({ horas: 20, prev: null, ult: 175 }, { old: 175 }), false)
})

test('descongelar: el descenso en curso libera, con motivo propio', () => {
  const d = descongelar({ diasSinEscribir: 0, rumorCaido: false, descensoEnCurso: true })
  assert.equal(d.libera, true)
  assert.match(d.motivo, /ya está bajando/)
})

test('las llaves 3 y 4 son simetricas y NO se pisan: subir y bajar se excluyen', () => {
  // La misma escritura no puede ser a la vez subida y bajada.
  const subida = { horas: 6, prev: 82, ult: 113 }
  assert.equal(esSaltoNuestro(subida, { old: 113, normalBase: 80, umbral: 1.4 }), true)
  assert.equal(esDescensoNuestro(subida, { old: 113 }), false)
  assert.equal(esSaltoNuestro(BAJADA, { old: 175, normalBase: 120, umbral: 1.4 }), false)
  assert.equal(esDescensoNuestro(BAJADA, { old: 175 }), true)
})

test('detalleDescongeladas: el descenso en curso es su propia familia', () => {
  const txt = detalleDescongeladas([
    { fecha: '2026-10-16', motivo: 'el motor ya está bajando esta fecha y el raíl no le dejó llegar' },
    { fecha: '2027-07-05', motivo: 'la subida que la puso cara la escribió el motor hace horas' },
  ])
  assert.match(String(txt), /1 por descenso en curso/)
  assert.match(String(txt), /1 por subida propia reciente/)
})
