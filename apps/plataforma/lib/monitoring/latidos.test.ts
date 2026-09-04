import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { evaluarLatido, AGENTES_VIGILADOS } from './latidos.ts'

const ahora = new Date('2026-07-21T08:00:00Z')

test('huella fresca → sin alerta', () => {
  const r = evaluarLatido({ ahora, ultimo: new Date('2026-07-21T06:00:00Z'), maxHoras: 6 })
  assert.equal(r.alerta, false)
  assert.ok(r.horas !== null && r.horas < 6)
})

test('huella vieja pasado el umbral → alerta', () => {
  const r = evaluarLatido({ ahora, ultimo: new Date('2026-07-01T00:00:00Z'), maxHoras: 192 })
  assert.equal(r.alerta, true)
  assert.ok(r.horas !== null && r.horas > 192)
})

test('sin ninguna señal → alerta', () => {
  const r = evaluarLatido({ ahora, ultimo: null, maxHoras: 6 })
  assert.equal(r.alerta, true)
  assert.equal(r.horas, null)
  assert.match(r.motivo, /ni una sola ejecución/)
})

// Las dos averías que antes se confundían en un mismo «sin ninguna señal» (31/07/2026:
// el escaneo de facturas corría a diario y moría en 504 antes de escribir su huella).
test('se ejecuta pero nunca completa → alerta que lo dice, no «sin señal»', () => {
  const r = evaluarLatido({
    ahora,
    ultimo: null,
    ultimoIntento: new Date('2026-07-21T06:15:00Z'),
    maxHoras: 30,
    detalle: 'pasada en curso — aún sin completar',
  })
  assert.equal(r.alerta, true)
  assert.equal(r.horas, null)
  assert.match(r.motivo, /NUNCA completa/)
  assert.match(r.motivo, /1\.8 h/)
  assert.doesNotMatch(r.motivo, /ni una sola ejecución/)
  assert.match(r.motivo, /pasada en curso/)
})

test('pasada buena vieja pero sigue arrancando → dice que arrancó, sin diagnosticar cuál de los dos', () => {
  const r = evaluarLatido({
    ahora,
    ultimo: new Date('2026-07-10T08:00:00Z'),
    ultimoIntento: new Date('2026-07-21T06:15:00Z'),
    maxHoras: 30,
  })
  assert.equal(r.alerta, true)
  assert.match(r.motivo, /SÍ arrancó/)
})

// 04/09/2026. `ok=false` con intento fresco son DOS averías, no una: los agentes que escriben
// `'pasada en curso'` al arrancar (facturas-scan, prevision-pisos, subastas-mercado, ses-latido)
// mueren a medias; los que escriben solo al final (el programador de accesos de Tuya) TERMINAN y
// se declaran con problemas. El vigía afirmaba «(se ejecuta y no termina)» para los dos, que manda
// a mirar el reloj de la función cuando la avería está en el parte.
test('con intento fresco NO se afirma que no termina: se ofrecen las dos y manda el parte', () => {
  const r = evaluarLatido({
    ahora,
    ultimo: new Date('2026-07-10T08:00:00Z'),
    ultimoIntento: new Date('2026-07-21T06:15:00Z'),
    maxHoras: 30,
    detalle: '2 cerradura(s) · 0 PIN creado(s) · 4 con ERROR',
  })
  assert.doesNotMatch(r.motivo, /se ejecuta y no termina/,
    'no se puede afirmar: el mismo ok=false lo escribe quien arranca y quien termina mal')
  assert.match(r.motivo, /se queda a medias/)
  assert.match(r.motivo, /se declara con problemas/)
  assert.match(r.motivo, /4 con ERROR/, 'el parte, que es lo que distingue los dos casos, va pegado')
})

// El vigía no diagnostica por ti lo que no ha mirado: la nota del programador de accesos cableaba
// «es el trial de IoT Core caducado, no un fallo nuevo» y llevaba un mes siendo falsa (el error
// real era `Tuya 2001: device is offline`). Una nota que te dice que ignores la alerta con una
// causa de hace un mes es peor que no tener nota.
test('ninguna nota de agente cablea un código de error concreto como causa', () => {
  for (const ag of AGENTES_VIGILADOS) {
    assert.doesNotMatch(ag.nota, /no un fallo nuevo/,
      `${ag.id}: la nota invita a descartar la alerta con un diagnóstico que no se ha comprobado`)
  }
})

test('pasada buena fresca → sin alerta aunque el intento sea el mismo', () => {
  const t = new Date('2026-07-21T06:15:00Z')
  const r = evaluarLatido({ ahora, ultimo: t, ultimoIntento: t, maxHoras: 30 })
  assert.equal(r.alerta, false)
})

test('justo en el umbral no alerta; un minuto más allá sí', () => {
  const justo = new Date(ahora.getTime() - 6 * 3_600_000)
  assert.equal(evaluarLatido({ ahora, ultimo: justo, maxHoras: 6 }).alerta, false)
  const pasado = new Date(justo.getTime() - 60_000)
  assert.equal(evaluarLatido({ ahora, ultimo: pasado, maxHoras: 6 }).alerta, true)
})

test('el registro tiene ids únicos y umbrales positivos', () => {
  const ids = AGENTES_VIGILADOS.map(a => a.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const a of AGENTES_VIGILADOS) assert.ok(a.maxHoras > 0, `${a.id} debe tener umbral > 0`)
})

// Guarda de regresión (16/08/2026): sivra_eventos_verificar se declaró vigilado sin añadir su query
// a PROBES y cada parte diario salía en «Sin poder comprobar». PROBES vive en la ruta del cron
// (Prisma.sql, no importable desde node --test), así que se lee el fuente y se extraen sus claves.
test('todo agente de AGENTES_VIGILADOS tiene su sonda en PROBES del cron', () => {
  const ruta = join(dirname(fileURLToPath(import.meta.url)), '../../app/api/cron/agentes-latido/route.ts')
  const src = readFileSync(ruta, 'utf8')
  const desde = src.indexOf('const PROBES')
  const hasta = src.indexOf('async function handler')
  assert.ok(desde >= 0 && hasta > desde, 'no se encuentra el bloque PROBES en la ruta del cron')
  const bloque = src.slice(desde, hasta)
  const claves = new Set([...bloque.matchAll(/^ {2}(\w+): Prisma\.sql/gm)].map(m => m[1]))
  assert.ok(claves.size > 0, 'el patrón de claves de PROBES no casó ninguna entrada — ¿cambió el formato?')
  for (const a of AGENTES_VIGILADOS) {
    assert.ok(claves.has(a.id), `«${a.etiqueta}» (${a.id}) está declarado en AGENTES_VIGILADOS pero sin sonda en PROBES — añádela en el mismo PR`)
  }
})
