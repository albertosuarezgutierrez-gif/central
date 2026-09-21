import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  VALIDEZ_PRESUPUESTO_DIAS,
  admiteDecision,
  calcularVencimiento,
  constaEnvio,
  elegirPortada,
  estadoPresupuesto,
} from './presupuesto-cliente.ts'
import type { Comparativa, FilaPrecio, GrupoCobertura, Nivel } from './comparativa-precios.ts'

const HOY = new Date('2026-09-21T12:00:00Z')
const d = (s: string) => new Date(s)

// ─── Estado ──────────────────────────────────────────────────────────────────

const VIVO = { venceEl: d('2026-10-06T00:00:00Z') }

test('sin ningún sello es un borrador', () => {
  assert.equal(estadoPresupuesto(VIVO, HOY), 'borrador')
})

test('🚨 enlazado NO es enviado: se abrió WhatsApp, no consta que saliera', () => {
  const p = { ...VIVO, enlaceGeneradoAt: d('2026-09-20T10:00:00Z') }
  assert.equal(estadoPresupuesto(p, HOY), 'enlazado')
  assert.equal(constaEnvio(p), false)
})

test('solo el sello de envío afirma que salió', () => {
  const p = { ...VIVO, enlaceGeneradoAt: d('2026-09-20T10:00:00Z'), enviadoAt: d('2026-09-20T10:05:00Z') }
  assert.equal(estadoPresupuesto(p, HOY), 'enviado')
  assert.equal(constaEnvio(p), true)
})

test('retirado manda sobre todo lo demás', () => {
  const p = {
    ...VIVO,
    enviadoAt: d('2026-09-01T00:00:00Z'),
    vistoAt: d('2026-09-02T00:00:00Z'),
    elegidoAt: d('2026-09-03T00:00:00Z'),
    aceptadoAt: d('2026-09-04T00:00:00Z'),
    emitidoAt: d('2026-09-05T00:00:00Z'),
    retiradoAt: d('2026-09-06T00:00:00Z'),
  }
  assert.equal(estadoPresupuesto(p, HOY), 'retirado')
})

test('un visto CADUCADO es un caducado, no un visto', () => {
  // El orden importa: lo que decide qué botones se pueden pulsar es la caducidad.
  const p = { venceEl: d('2026-09-10T00:00:00Z'), enviadoAt: d('2026-09-01T00:00:00Z'), vistoAt: d('2026-09-02T00:00:00Z') }
  assert.equal(estadoPresupuesto(p, HOY), 'caducado')
})

test('pero una vez ELEGIDO, caducar no lo devuelve atrás', () => {
  const p = { venceEl: d('2026-09-10T00:00:00Z'), elegidoAt: d('2026-09-02T00:00:00Z') }
  assert.equal(estadoPresupuesto(p, HOY), 'elegido')
})

test('el día exacto del vencimiento todavía NO está caducado', () => {
  assert.equal(estadoPresupuesto({ venceEl: HOY }, HOY), 'borrador')
})

test('una fecha ilegible no caduca el presupuesto por sorpresa', () => {
  // Un `Date.parse` fallido no puede convertirse en «caducado»: sería retirarle
  // los botones al cliente por un dato que no se ha sabido leer.
  assert.equal(estadoPresupuesto({ venceEl: 'no soy una fecha' }, HOY), 'borrador')
})

test('solo enviado/visto/elegido admiten que el cliente decida', () => {
  assert.equal(admiteDecision('enviado'), true)
  assert.equal(admiteDecision('visto'), true)
  assert.equal(admiteDecision('elegido'), true)
  for (const e of ['borrador', 'enlazado', 'caducado', 'aceptado', 'emitido', 'retirado'] as const) {
    assert.equal(admiteDecision(e), false, `${e} no puede admitir decisión`)
  }
})

// ─── Caducidad ───────────────────────────────────────────────────────────────

test('sin más datos, vale los días de la casa desde que se creó', () => {
  const v = calcularVencimiento({ creadoAt: d('2026-09-21T00:00:00Z') })
  assert.equal(v.fuente, 'validez_casa')
  assert.equal(v.venceEl.toISOString(), '2026-10-06T00:00:00.000Z')
  assert.equal(VALIDEZ_PRESUPUESTO_DIAS, 15)
})

test('una vez enviado, los días cuentan DESDE EL ENVÍO', () => {
  const v = calcularVencimiento({ creadoAt: d('2026-09-01T00:00:00Z'), enviadoAt: d('2026-09-21T00:00:00Z') })
  assert.equal(v.venceEl.toISOString(), '2026-10-06T00:00:00.000Z')
})

test('🚨 la fecha de efecto RECORTA: un día antes, porque una efecto pasada mata el proyecto', () => {
  const v = calcularVencimiento({ creadoAt: d('2026-09-21T00:00:00Z'), fechaEfecto: d('2026-09-25T00:00:00Z') })
  assert.equal(v.fuente, 'fecha_efecto')
  assert.equal(v.venceEl.toISOString(), '2026-09-24T00:00:00.000Z')
})

test('manda el MÍNIMO de las tres, no la última que llegue', () => {
  const v = calcularVencimiento({
    creadoAt: d('2026-09-21T00:00:00Z'),
    fechaEfecto: d('2026-12-01T00:00:00Z'),
    expiraOferta: d('2026-09-23T00:00:00Z'),
  })
  assert.equal(v.fuente, 'oferta_vendor')
  assert.equal(v.venceEl.toISOString(), '2026-09-23T00:00:00.000Z')
})

test('la fuente se DECLARA: la procedencia de una fecha es parte del dato', () => {
  const soloCasa = calcularVencimiento({ creadoAt: d('2026-09-21T00:00:00Z') })
  const conEfecto = calcularVencimiento({ creadoAt: d('2026-09-21T00:00:00Z'), fechaEfecto: d('2026-09-23T00:00:00Z') })
  assert.notEqual(soloCasa.fuente, conEfecto.fuente)
})

// ─── La regla de las tres ────────────────────────────────────────────────────

function nivel(clave: string, rango: number, reconocido = true): Nivel {
  return { clave, label: clave, rango, familia: 'auto', reconocido, matiz: null, etiquetaVendor: clave }
}

let indice = 0
function fila(primaEur: number | null, bloqueada = false): FilaPrecio {
  return {
    precio: { primaEur, compania: 'X', producto: 'P', modalidad: 'M', franquiciaEur: null } as FilaPrecio['precio'],
    nivel: nivel('x', 1),
    defensa: null,
    bloqueada,
    indice: indice++,
  }
}

function grupo(clave: string, rango: number, filas: FilaPrecio[], reconocido = true): GrupoCobertura {
  const emitibles = filas.filter((f) => !f.bloqueada && f.precio.primaEur !== null)
  const masBarata = emitibles.length
    ? emitibles.reduce((a, b) => ((a.precio.primaEur ?? Infinity) <= (b.precio.primaEur ?? Infinity) ? a : b))
    : null
  const n = nivel(clave, rango, reconocido)
  return {
    nivel: n,
    filas: filas.map((f) => ({ ...f, nivel: n })),
    total: filas.length,
    bloqueadas: filas.filter((f) => f.bloqueada).length,
    sinComprobar: 0,
    masBarataEmitible: masBarata === null ? null : { ...masBarata, nivel: n },
    matices: [],
  }
}

function comparativa(grupos: GrupoCobertura[], avisoEscala: string | null = null): Comparativa {
  return {
    grupos,
    total: grupos.reduce((n, g) => n + g.total, 0),
    mostrados: grupos.reduce((n, g) => n + g.filas.length, 0),
    ocultosPorFiltro: 0,
    bloqueadasOcultas: 0,
    avisoEscala,
  } as Comparativa
}

test('la equivalente sale del grupo de la póliza ACTUAL, no de la más barata', () => {
  const terceros = grupo('terceros', 1, [fila(300), fila(250)])
  const todoRiesgo = grupo('todo_riesgo', 3, [fila(600)])
  const p = elegirPortada(comparativa([terceros, todoRiesgo]), 'todo_riesgo')
  assert.equal(p.equivalente?.precio.primaEur, 600)
  assert.equal(p.motivoSinEquivalente, null)
})

test('🚨 sin cobertura legible de la actual, el motivo es «no puedo compararlo», no «no hay nada»', () => {
  const p = elegirPortada(comparativa([grupo('terceros', 1, [fila(250)])]), null)
  assert.equal(p.equivalente, null)
  assert.equal(p.motivoSinEquivalente, 'actual_sin_coberturas')
})

test('con la actual leída y ningún grupo que case, el motivo es el OTRO', () => {
  const p = elegirPortada(comparativa([grupo('terceros', 1, [fila(250)])]), 'todo_riesgo')
  assert.equal(p.equivalente, null)
  assert.equal(p.motivoSinEquivalente, 'sin_equivalente')
})

test('los dos motivos son distintos: colapsarlos es el fallo raíz del repo', () => {
  const a = elegirPortada(comparativa([grupo('terceros', 1, [fila(250)])]), null).motivoSinEquivalente
  const b = elegirPortada(comparativa([grupo('terceros', 1, [fila(250)])]), 'todo_riesgo').motivoSinEquivalente
  assert.notEqual(a, b)
})

test('🚨 sin equivalente, la más barata se marca «cobertura distinta de la tuya»', () => {
  const p = elegirPortada(comparativa([grupo('terceros', 1, [fila(250)]), grupo('todo_riesgo', 3, [fila(600)])]), null)
  const mb = p.opciones.find((o) => o.papeles.includes('mas_barata'))
  assert.ok(mb)
  assert.equal(mb!.coberturaDistinta, true)
})

test('con equivalente, la más barata es la equivalente y NO se marca distinta', () => {
  const p = elegirPortada(comparativa([grupo('terceros', 1, [fila(300), fila(250)])]), 'terceros')
  assert.equal(p.masBarata?.precio.primaEur, 250)
  const mb = p.opciones.find((o) => o.papeles.includes('mas_barata'))
  assert.equal(mb!.coberturaDistinta, false)
})

test('una opción BLOQUEADA no se ofrece de portada', () => {
  const g = grupo('terceros', 1, [fila(200, true), fila(400)])
  const p = elegirPortada(comparativa([g]), 'terceros')
  assert.equal(p.equivalente?.precio.primaEur, 400)
})

test('la mejor cubierta es la más barata DEL GRUPO MÁS ALTO, nunca la más cara', () => {
  const p = elegirPortada(
    comparativa([grupo('terceros', 1, [fila(250)]), grupo('todo_riesgo', 3, [fila(900), fila(600)])]),
    'terceros',
  )
  assert.equal(p.mejorCubierta?.precio.primaEur, 600)
})

test('🚨 un nivel NO reconocido nunca es «la mejor cubierta»', () => {
  // Los no reconocidos llevan rangos centinela altos (800/900): por rango a
  // secas ganarían siempre y se ofrecería como lo mejor algo sin clasificar.
  const p = elegirPortada(
    comparativa([grupo('todo_riesgo', 3, [fila(600)]), grupo('???', 900, [fila(1200)], false)]),
    'todo_riesgo',
  )
  assert.equal(p.mejorCubierta?.precio.primaEur, 600)
})

test('si dos papeles caen en la misma opción se FUNDEN, no se rellena con una cualquiera', () => {
  const p = elegirPortada(comparativa([grupo('terceros', 1, [fila(250), fila(400)])]), 'terceros')
  assert.equal(p.opciones.length, 1)
  assert.deepEqual(p.opciones[0]!.papeles.sort(), ['equivalente', 'mas_barata', 'mejor_cubierta'])
})

test('sin ninguna opción emitible, la portada sale vacía y no inventa nada', () => {
  const p = elegirPortada(comparativa([grupo('terceros', 1, [fila(250, true)])]), 'terceros')
  assert.deepEqual(p.opciones, [])
  assert.equal(p.equivalente, null)
  assert.equal(p.masBarata, null)
  assert.equal(p.mejorCubierta, null)
})

test('el aviso de escala se PROPAGA: es la advertencia por la que existe esto', () => {
  const c = comparativa([grupo('terceros', 1, [fila(250)])], 'Los grupos no son comparables entre sí')
  assert.equal(elegirPortada(c, 'terceros').avisoEscala, 'Los grupos no son comparables entre sí')
})

test('una prima null no se cuela como la más barata', () => {
  const p = elegirPortada(comparativa([grupo('terceros', 1, [fila(null), fila(300)])]), 'terceros')
  assert.equal(p.equivalente?.precio.primaEur, 300)
})
