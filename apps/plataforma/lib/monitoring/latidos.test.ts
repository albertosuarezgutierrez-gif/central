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

test('pasada buena vieja pero sigue arrancando → se dice que no termina', () => {
  const r = evaluarLatido({
    ahora,
    ultimo: new Date('2026-07-10T08:00:00Z'),
    ultimoIntento: new Date('2026-07-21T06:15:00Z'),
    maxHoras: 30,
  })
  assert.equal(r.alerta, true)
  assert.match(r.motivo, /SÍ arrancó/)
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

// ── Estreno: el cuarto estado (04/09/2026) ────────────────────────────────────────────────────
// Las cuatro rutinas cableadas el 02/09 salieron en ROJO con «sin ninguna señal registrada» desde
// el minuto uno, y las dos mensuales (día 1) iban a seguir gritando hasta el 01/10 — 27 días de
// falsa alarma sobre agentes a los que sencillamente no les había tocado correr todavía.
test('recién dado de alta y sin señal → estreno, NO alerta', () => {
  const r = evaluarLatido({ ahora, ultimo: null, maxHoras: 840, vigiladoDesde: '2026-07-20' })
  assert.equal(r.alerta, false)
  assert.equal(r.estreno, true)
  assert.equal(r.horas, null)
  assert.match(r.motivo, /en estreno/)
  assert.doesNotMatch(r.motivo, /ni una sola ejecución/)
})

test('pasado su primer umbral sin señal → vuelve a ser alerta él solo', () => {
  // Alta hace 200 h con umbral 192 h: la gracia se agotó, y nadie ha tenido que acordarse de nada.
  const alta = new Date(ahora.getTime() - 200 * 3_600_000)
  const r = evaluarLatido({ ahora, ultimo: null, maxHoras: 192, vigiladoDesde: alta })
  assert.equal(r.alerta, true)
  assert.notEqual(r.estreno, true)
  assert.match(r.motivo, /ni una sola ejecución/)
})

// El estreno es SOLO para el silencio absoluto. Un agente que ya latió no vuelve a estrenarse:
// si su huella envejece es avería, por reciente que sea el alta de la vigilancia.
test('ya latió una vez → el alta reciente no lo exime', () => {
  const r = evaluarLatido({
    ahora,
    ultimo: new Date('2026-07-01T00:00:00Z'),
    maxHoras: 192,
    vigiladoDesde: '2026-07-20',
  })
  assert.equal(r.alerta, true)
  assert.notEqual(r.estreno, true)
})

// «Arranca y no termina» gana al estreno: hay señal de ejecución, así que ya se sabe algo.
test('sin pasada buena pero con intento → sigue siendo alerta, no estreno', () => {
  const r = evaluarLatido({
    ahora,
    ultimo: null,
    ultimoIntento: new Date('2026-07-21T06:15:00Z'),
    maxHoras: 840,
    vigiladoDesde: '2026-07-20',
  })
  assert.equal(r.alerta, true)
  assert.notEqual(r.estreno, true)
  assert.match(r.motivo, /NUNCA completa/)
})

// Lado conservador: una fecha de alta inválida o en el futuro (un dedazo al declararla) NO puede
// convertirse en un estreno eterno que silencie al agente para siempre.
test('vigiladoDesde inválido o futuro → alerta, nunca estreno perpetuo', () => {
  for (const malo of ['no-es-fecha', '2027-01-01']) {
    const r = evaluarLatido({ ahora, ultimo: null, maxHoras: 840, vigiladoDesde: malo })
    assert.equal(r.alerta, true, `«${malo}» debería alertar`)
    assert.notEqual(r.estreno, true)
  }
})

test('sin vigiladoDesde el comportamiento no cambia (sigue alertando)', () => {
  const r = evaluarLatido({ ahora, ultimo: null, maxHoras: 6 })
  assert.equal(r.alerta, true)
  assert.notEqual(r.estreno, true)
})

// Guarda de regresión: declarar un latido SIN fecha de alta lo condena a salir en rojo desde el
// despliegue hasta su primera pasada. Que sea el test quien lo recuerde, no la memoria de nadie.
test('todo agente vigilado declara vigiladoDesde con fecha real y pasada', () => {
  const hoy = new Date().toISOString().slice(0, 10)
  for (const a of AGENTES_VIGILADOS) {
    assert.match(
      a.vigiladoDesde ?? '',
      /^\d{4}-\d{2}-\d{2}$/,
      `«${a.etiqueta}» (${a.id}) no declara vigiladoDesde en formato YYYY-MM-DD`,
    )
    assert.ok(
      !Number.isNaN(new Date(a.vigiladoDesde).getTime()),
      `${a.id}: vigiladoDesde no es una fecha válida`,
    )
    assert.ok(
      a.vigiladoDesde <= hoy,
      `${a.id}: vigiladoDesde (${a.vigiladoDesde}) está en el futuro — sería un estreno perpetuo`,
    )
  }
})

// Invariante del que depende `clasificarSalud` para pintar el estreno en GRIS y no en verde:
// `evaluarLatido` solo devuelve `alerta:false` en dos casos, y el de «activo» SIEMPRE trae horas.
// Si alguien añadiera un tercer «sin alerta» sin horas que no fuese un estreno, el panel lo pintaría
// como «todavía no se sabe» y esto salta.
test('sin alerta y sin horas SOLO puede ser un estreno', () => {
  const casos = [
    evaluarLatido({ ahora, ultimo: null, maxHoras: 840, vigiladoDesde: '2026-07-20' }),
    evaluarLatido({ ahora, ultimo: new Date('2026-07-21T06:00:00Z'), maxHoras: 6 }),
    evaluarLatido({ ahora, ultimo: null, maxHoras: 6 }),
  ]
  for (const r of casos) {
    if (!r.alerta && r.horas === null) assert.equal(r.estreno, true)
    if (!r.alerta && r.estreno !== true) assert.notEqual(r.horas, null)
  }
})

// ── Pendiente conocido (04/09/2026) ───────────────────────────────────────────────────────────
// Alberto decidió dejar dos rojos vivos a propósito. Son pendientes REALES, así que apagarlos sería
// mentir; pero gritarlos cada mañana durante semanas es la misma fatiga de alarma que el estreno.
// Estos tests fijan los tres candados que impiden que esto se convierta en un mute.
const PEND = { motivo: 'cerradura sin conexión', revisarEl: '2026-07-25', mientras: '(Tuya 1109, 2001)' }
const viejo = new Date('2026-07-01T00:00:00Z')

test('avería declarada y dentro de plazo → sigue en alerta, pero marcada pendiente', () => {
  const r = evaluarLatido({
    ahora, ultimo: viejo, maxHoras: 30, detalle: '2 cerradura(s) · 3 con ERROR (Tuya 1109, 2001)',
    pendienteConocido: PEND,
  })
  // Sigue siendo alerta a propósito: la pantalla y `agente_salud` tienen que seguir diciendo la
  // verdad. Lo único que se aparta es la interrupción del Telegram.
  assert.equal(r.alerta, true)
  assert.equal(r.pendiente, true)
  assert.match(r.pendienteNota ?? '', /cerradura sin conexión/)
  assert.match(r.pendienteNota ?? '', /2026-07-25/)
})

// Candado 1: si el fallo CAMBIA, deja de casar y vuelve a sonar el mismo día.
test('un código de error nuevo rompe el marcador → deja de ser pendiente', () => {
  const r = evaluarLatido({
    ahora, ultimo: viejo, maxHoras: 30,
    detalle: '2 cerradura(s) · 4 con ERROR (Tuya 1109, 2001, 28841002)',
    pendienteConocido: PEND,
  })
  assert.equal(r.alerta, true)
  assert.notEqual(r.pendiente, true)
})

// Candado 1-bis: un cron que deja de escribir parte NO hereda el permiso de silencio del que sí lo
// escribía. Sin detalle no casa nada.
test('sin detalle NUNCA es pendiente (un cron mudo grita igual)', () => {
  const r = evaluarLatido({ ahora, ultimo: viejo, maxHoras: 30, detalle: null, pendienteConocido: PEND })
  assert.equal(r.alerta, true)
  assert.notEqual(r.pendiente, true)
})

test('«sin ninguna señal registrada» tampoco puede ser pendiente', () => {
  const r = evaluarLatido({ ahora, ultimo: null, maxHoras: 30, pendienteConocido: PEND })
  assert.equal(r.alerta, true)
  assert.notEqual(r.pendiente, true)
  assert.match(r.motivo, /ni una sola ejecución/)
})

// Candado 2: caduca solo. Nadie tiene que acordarse de quitar nada.
test('pasada la fecha de revisión vuelve a sonar sin que nadie toque nada', () => {
  const r = evaluarLatido({
    ahora, ultimo: viejo, maxHoras: 30, detalle: '3 con ERROR (Tuya 1109, 2001)',
    pendienteConocido: { ...PEND, revisarEl: '2026-07-20' }, // ahora = 21/07
  })
  assert.equal(r.alerta, true)
  assert.notEqual(r.pendiente, true)
})

// «Revisar el 21» significa el 21 ENTERO, no las 00:00 de ese día.
test('el día de la revisión cuenta entero', () => {
  const r = evaluarLatido({
    ahora, ultimo: viejo, maxHoras: 30, detalle: '3 con ERROR (Tuya 1109, 2001)',
    pendienteConocido: { ...PEND, revisarEl: '2026-07-21' },
  })
  assert.equal(r.pendiente, true)
})

test('un agente sano con pendiente declarado no inventa nada', () => {
  const r = evaluarLatido({
    ahora, ultimo: new Date('2026-07-21T06:00:00Z'), maxHoras: 30,
    detalle: '3 con ERROR (Tuya 1109, 2001)', pendienteConocido: PEND,
  })
  assert.equal(r.alerta, false)
  assert.notEqual(r.pendiente, true)
})

// Guardián: un pendiente mal declarado es un agente silenciado para siempre sin que nada lo delate.
test('todo pendienteConocido declarado tiene motivo, marcador y fecha válida', () => {
  for (const a of AGENTES_VIGILADOS) {
    const p = a.pendienteConocido
    if (!p) continue
    assert.ok(p.motivo.trim().length > 10, `${a.id}: el motivo tiene que explicar por qué se deja`)
    assert.ok(p.mientras.trim().length >= 8, `${a.id}: el marcador es demasiado corto — silenciaría de más`)
    assert.match(p.revisarEl, /^\d{4}-\d{2}-\d{2}$/, `${a.id}: revisarEl debe ser YYYY-MM-DD`)
    assert.ok(!Number.isNaN(new Date(p.revisarEl).getTime()), `${a.id}: revisarEl no es una fecha`)
  }
})
