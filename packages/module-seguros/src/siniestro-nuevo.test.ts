import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  decidirSiniestrosNuevos,
  detalleSiniestros,
  leerMarca,
  serializarMarca,
  textoAvisoSiniestros,
  TOPE_AVISO_SINIESTROS,
  type SiniestroEntrante,
} from './siniestro-nuevo.ts'

const HOY = new Date('2026-09-05T06:00:00.000Z')

/** Fixture con la forma REAL de las filas medidas el 05/09/2026 en `seguros.siniestros`. */
function sin(id: string, entradoEn: string, extra: Partial<SiniestroEntrante> = {}): SiniestroEntrante {
  return {
    id,
    entradoEn,
    ocurridoEn: '2026-07-01',
    cliente: 'GLOBAL 2 INSTALACIONES TÉCNICAS',
    clienteId: 'c-1',
    compania: 'Allianz',
    poliza: '058325150',
    referencia: '670760710',
    ...extra,
  }
}

// ── M2 · el histórico NO se manda ────────────────────────────────────────────

test('primera pasada: ancla la marca y NO avisa de los 67 del volcado', () => {
  const cartera = Array.from({ length: 67 }, (_, i) =>
    sin(`h-${i}`, `2026-06-${String(24 + (i % 7)).padStart(2, '0')}T07:2${i % 10}:00.000Z`),
  )
  const d = decidirSiniestrosNuevos({ marca: null, siniestros: cartera, hoy: HOY })
  assert.equal(d.avisar, false)
  assert.equal(d.motivo, 'primera_vez')
  assert.equal(d.avisar === false && d.motivo === 'primera_vez' ? d.anteriores : -1, 67)
  // Y la marca cubre al MÁS NUEVO, no al primero que venía en la lista.
  assert.equal(d.avisar === false && d.motivo === 'primera_vez' ? d.marca.instante.slice(0, 10) : '', '2026-06-30')
})

test('«primera pasada» y «no hay ninguno» NO se dicen igual', () => {
  const primera = detalleSiniestros(decidirSiniestrosNuevos({ marca: null, siniestros: [sin('a', '2026-07-02T08:28:12.331Z')], hoy: HOY }))
  const vacio = detalleSiniestros(decidirSiniestrosNuevos({
    marca: { instante: '2026-07-02T08:28:12.331Z', ids: ['a'] },
    siniestros: [sin('a', '2026-07-02T08:28:12.331Z')],
    hoy: HOY,
  }))
  assert.match(primera, /primera pasada/)
  assert.match(primera, /NO avisados a propósito/)
  assert.match(vacio, /ninguno \(comprobado\)/)
  assert.notEqual(primera, vacio)
})

test('cartera vacía en la primera pasada: ancla en HOY, para que el primero que llegue SÍ suene', () => {
  const d = decidirSiniestrosNuevos({ marca: null, siniestros: [], hoy: HOY })
  assert.equal(d.avisar === false && d.motivo === 'primera_vez' ? d.marca.instante : '', HOY.toISOString())
  const luego = decidirSiniestrosNuevos({
    marca: { instante: HOY.toISOString(), ids: [] },
    siniestros: [sin('nuevo', '2026-09-06T05:00:00.000Z')],
    hoy: HOY,
  })
  assert.equal(luego.avisar, true)
})

// ── M1 · la marca no avanza sola ─────────────────────────────────────────────

test('la marca propuesta cubre EXACTAMENTE la tanda avisada, ni un siniestro más', () => {
  // 25 siniestros entrando de minuto en minuto: la racha del día en que se
  // desatasque la ingesta de CIMA.
  const nuevos = Array.from({ length: TOPE_AVISO_SINIESTROS + 5 }, (_, i) =>
    sin(`n-${String(i).padStart(2, '0')}`, `2026-09-05T05:${String(i).padStart(2, '0')}:00.000Z`),
  )
  const d = decidirSiniestrosNuevos({ marca: { instante: '2026-07-02T08:28:12.331Z', ids: [] }, siniestros: nuevos, hoy: HOY })
  assert.equal(d.avisar, true)
  if (d.avisar !== true) return
  assert.equal(d.nuevos.length, TOPE_AVISO_SINIESTROS)
  assert.equal(d.restantes, 5)
  // La marca es la del ÚLTIMO INCLUIDO. Si cubriera a los 25, los 5 restantes
  // no volverían a salir nunca y serían 5 clientes sin su llamada.
  assert.equal(d.marca.instante, d.nuevos[d.nuevos.length - 1].entradoEn)
  const restantes = nuevos.filter(s => !d.nuevos.some(n => n.id === s.id))
  const segunda = decidirSiniestrosNuevos({ marca: d.marca, siniestros: nuevos, hoy: HOY })
  assert.equal(segunda.avisar === true ? segunda.nuevos.length : -1, restantes.length)
})

test('si el aviso no sale y la marca NO se guarda, la pasada siguiente reintenta los MISMOS', () => {
  const marca = { instante: '2026-07-02T08:28:12.331Z', ids: ['viejo'] }
  const lista = [sin('viejo', '2026-07-02T08:28:12.331Z'), sin('x', '2026-09-05T05:00:00.000Z')]
  const primera = decidirSiniestrosNuevos({ marca, siniestros: lista, hoy: HOY })
  // (aquí el Telegram falla → el cron NO guarda `primera.marca`)
  const segunda = decidirSiniestrosNuevos({ marca, siniestros: lista, hoy: HOY })
  assert.deepEqual(
    primera.avisar === true ? primera.nuevos.map(s => s.id) : null,
    segunda.avisar === true ? segunda.nuevos.map(s => s.id) : undefined,
  )
  assert.deepEqual(segunda.avisar === true ? segunda.nuevos.map(s => s.id) : [], ['x'])
})

// ── M6 · deduplicar por ID, no por fecha ─────────────────────────────────────

test('CIMA reenvía el mismo siniestro: no suena dos veces', () => {
  const s = sin('mismo', '2026-09-05T05:00:00.000Z')
  const d1 = decidirSiniestrosNuevos({ marca: { instante: '2026-09-01T00:00:00.000Z', ids: [] }, siniestros: [s], hoy: HOY })
  assert.equal(d1.avisar, true)
  const d2 = decidirSiniestrosNuevos({ marca: d1.avisar === true ? d1.marca : null, siniestros: [s], hoy: HOY })
  assert.equal(d2.avisar, false)
  assert.equal(d2.avisar === false ? d2.motivo : '', 'sin_novedades')
})

test('dos siniestros en el MISMO instante: el segundo no se pierde (el empate lo rompe el id)', () => {
  const a = sin('aaa', '2026-09-05T05:00:00.000Z')
  const b = sin('bbb', '2026-09-05T05:00:00.000Z')
  // Se avisó de `aaa`; la consulta es inclusiva y devuelve los dos.
  const d = decidirSiniestrosNuevos({ marca: { instante: a.entradoEn, ids: ['aaa'] }, siniestros: [a, b], hoy: HOY })
  assert.equal(d.avisar === true ? d.nuevos.map(s => s.id).join() : '', 'bbb')
})

// ── El eje del «nuevo» es cuándo ENTRÓ, no cuándo pasó ───────────────────────

test('un siniestro VIEJO que CIMA manda hoy SÍ suena', () => {
  // Caso real: hechos de agosto de 2025 grabados en junio de 2026.
  const antiguo = sin('viejo-hecho', '2026-09-05T05:00:00.000Z', { ocurridoEn: '2025-08-24' })
  const d = decidirSiniestrosNuevos({ marca: { instante: '2026-09-01T00:00:00.000Z', ids: [] }, siniestros: [antiguo], hoy: HOY })
  assert.equal(d.avisar, true)
  assert.match(textoAvisoSiniestros(d.avisar === true ? d.nuevos : []), /ocurrió el 24\/08\/2025/)
})

// ── M3 · «no se ha podido mirar» ≠ «no hay» ──────────────────────────────────

test('sin_datos dice que NO se ha mirado, y no se parece a «ninguno»', () => {
  const t = detalleSiniestros({ avisar: false, motivo: 'sin_datos', causa: 'secreto_rechazado' })
  assert.match(t, /NO se ha podido mirar/)
  assert.match(t, /secreto_rechazado/)
  assert.match(t, /NO significa que no haya entrado ninguno/)
  assert.doesNotMatch(t, /ninguno \(comprobado\)/)
})

// ── M4 · lo que el aviso NO puede decir ──────────────────────────────────────

test('el aviso dice que YA está abierto en la compañía y que hay que LLAMAR', () => {
  const t = textoAvisoSiniestros([sin('a', '2026-09-05T05:00:00.000Z')])
  assert.match(t, /ya están abiertos en la compañía/i)
  assert.match(t, /llamar al cliente/i)
  assert.match(t, /seguimiento/i)
})

test('CEPO: el aviso NUNCA insinúa que haya que abrirlo o comunicarlo', () => {
  const t = textoAvisoSiniestros([sin('a', '2026-09-05T05:00:00.000Z'), sin('b', '2026-09-05T06:00:00.000Z')], 3)
  for (const prohibido of [
    /sin comunicar/i, /pendiente de comunicar/i, /hay que comunicar/i, /comunícalo/i,
    /abre el (?:parte|siniestro)/i, /hay que abrir/i, /dar el parte/i, /sin cobertura/i,
  ]) {
    assert.doesNotMatch(t, prohibido, `el aviso no puede contener ${prohibido}`)
  }
})

// ── M5 · tramitador y perito fuera ───────────────────────────────────────────

test('CEPO: ni el aviso ni el módulo conocen al tramitador ni al perito', () => {
  const t = textoAvisoSiniestros([sin('a', '2026-09-05T05:00:00.000Z')])
  assert.doesNotMatch(t, /tramitador|perito/i)
  // Y no está ni en el tipo de entrada: el dato que no se recibe no se filtra.
  const fuente = readFileSync(new URL('./siniestro-nuevo.ts', import.meta.url), 'utf8')
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  assert.doesNotMatch(codigo, /tramitador|perito/i)
})

// ── Los huecos se declaran, no se rellenan ───────────────────────────────────

test('lo que la compañía no informa se DICE, no se pinta como vacío', () => {
  const t = textoAvisoSiniestros([
    sin('a', '2026-09-05T05:00:00.000Z', { cliente: null, compania: null, poliza: null, ocurridoEn: null, referencia: null }),
  ])
  assert.match(t, /cliente sin nombre en la ficha/)
  assert.match(t, /compañía no informada/)
  assert.match(t, /póliza no informada/)
  assert.match(t, /fecha del hecho no informada/)
})

test('con restantes, el aviso promete que ninguno se pierde', () => {
  assert.match(textoAvisoSiniestros([sin('a', '2026-09-05T05:00:00.000Z')], 4), /4 más esperando/)
  assert.doesNotMatch(textoAvisoSiniestros([sin('a', '2026-09-05T05:00:00.000Z')], 0), /más esperando/)
})

// ── La marca de agua en el `detalle` del latido ──────────────────────────────

test('la marca va y vuelve del detalle del latido', () => {
  const marca = { instante: '2026-09-05T05:00:00.000Z', ids: ['aaa', 'bbb'] }
  const guardado = serializarMarca(marca, detalleSiniestros({ avisar: false, motivo: 'sin_novedades' }))
  assert.deepEqual(leerMarca(guardado), marca)
  assert.match(guardado, /ninguno \(comprobado\)/)
})

test('un detalle ilegible o viejo se lee como «primera vez», que ancla sin mandar el histórico', () => {
  assert.equal(leerMarca(null), null)
  assert.equal(leerMarca('texto viejo sin cabecera'), null)
  assert.equal(leerMarca('no-es-fecha|aaa · algo'), null)
})
