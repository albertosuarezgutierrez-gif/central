import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anioDePeticion, anioPorDefecto, polizasDelResumen, resumenAnual, type PolizaGestionadaEntrada } from './resumen-anual.ts'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const rec = (situacion: string, importe: number | null, f: string | null) => ({ situacion, importe, fechaSituacion: f ? d(f) : null })
const pol = (id: string, ramo: string, recibos: PolizaGestionadaEntrada['recibos'], siniestros: PolizaGestionadaEntrada['siniestros'] = []): PolizaGestionadaEntrada =>
  ({ id, compania: 'X', ramo, etiqueta: id, recibos, siniestros })

test('año por defecto: ene-mar el anterior, el resto el actual', () => {
  assert.equal(anioPorDefecto(d('2027-01-15')), 2026)
  assert.equal(anioPorDefecto(d('2027-03-31')), 2026)
  assert.equal(anioPorDefecto(d('2026-10-13')), 2026)
  assert.equal(anioDePeticion('1999', d('2026-10-13')), 2026)
  assert.equal(anioDePeticion('2025', d('2026-10-13')), 2025)
  assert.equal(anioDePeticion(undefined, d('2026-10-13')), 2026)
})

test('solo cuenta cobrado del año: anulado y pendiente fuera, y por fecha de COBRO', () => {
  const r = resumenAnual({
    anio: 2026,
    aportadas: [],
    gestionadas: [pol('a', 'Auto', [
      rec('cobrado', 100.5, '2026-03-01'),
      rec('cobrado', 50, '2026-12-31'),
      rec('anulado', 999, '2026-03-01'),
      rec('pendiente', 70, '2026-05-01'),
      rec('cobrado', 80, '2025-12-31'),
    ])],
  })
  assert.equal(r.gestionado.total, 150.5)
  assert.equal(r.gestionado.filas[0].recibosCobrados, 2)
})

test('null no es 0: sin cobros → total null; cobrado sin importe o sin fecha no suma y se dice', () => {
  const r = resumenAnual({
    anio: 2026,
    aportadas: [],
    gestionadas: [
      pol('sin', 'Hogar', [rec('pendiente', 10, null)]),
      pol('nv', 'Auto', null),
      pol('raro', 'Vida', [rec('cobrado', null, '2026-02-02'), rec('cobrado', 40, null)]),
    ],
  })
  assert.equal(r.gestionado.total, null)
  assert.equal(r.gestionado.filas[0].estado, 'sin_datos')
  assert.equal(r.gestionado.filas[0].pagado, null)
  assert.equal(r.gestionado.filas[1].estado, 'no_visible')
  assert.equal(r.gestionado.filas[2].cobradosSinImporte, 1)
  assert.equal(r.gestionado.filas[2].cobradosSinFecha, 1)
  assert.equal(r.gestionado.totalIncompleto, true)
  assert.equal(r.gestionado.polizasNoVisibles, 1)
})

test('desglose por ramo ordenado', () => {
  const r = resumenAnual({
    anio: 2026,
    aportadas: [],
    gestionadas: [
      pol('a', 'Hogar', [rec('cobrado', 10, '2026-01-01')]),
      pol('b', 'Auto', [rec('cobrado', 30, '2026-01-01')]),
      pol('c', 'Hogar', [rec('cobrado', 25, '2026-06-01')]),
    ],
  })
  assert.deepEqual(r.gestionado.porRamo, [{ ramo: 'Hogar', total: 35 }, { ramo: 'Auto', total: 30 }])
})

test('siniestros: solo del año, indemnización informada vs no, y no visible ≠ ninguno', () => {
  const r = resumenAnual({
    anio: 2026,
    aportadas: [],
    gestionadas: [
      pol('a', 'Auto', [], [
        { id: 's1', fechaHora: d('2026-04-01'), indemnizacion: 300 },
        { id: 's2', fechaHora: d('2026-05-01'), indemnizacion: null },
        { id: 's3', fechaHora: d('2025-05-01'), indemnizacion: 999 },
        { id: 's4', fechaHora: null, indemnizacion: 5 },
      ]),
      pol('b', 'Hogar', [], null),
    ],
  })
  const s = r.gestionado.siniestros
  assert.equal(s.total, 2)
  assert.equal(s.indemnizado, 300)
  assert.equal(s.sinIndemnizacionInformada, 1)
  assert.equal(s.sinFecha, 1)
  assert.equal(s.polizasNoVisibles, 1)
  const solo = resumenAnual({ anio: 2026, aportadas: [], gestionadas: [pol('b', 'Hogar', [], null)] })
  assert.equal(solo.gestionado.siniestros.total, null)
  const vacio = resumenAnual({ anio: 2026, aportadas: [], gestionadas: [pol('c', 'Hogar', [], [])] })
  assert.equal(vacio.gestionado.siniestros.total, 0)
  assert.equal(vacio.gestionado.siniestros.indemnizado, null)
})

test('aportado: solo `declarado` con prima y no vencida antes del año; nunca se mezcla con lo gestionado', () => {
  const r = resumenAnual({
    anio: 2026,
    gestionadas: [pol('a', 'Auto', [rec('cobrado', 100, '2026-01-01')])],
    aportadas: [
      { id: '1', compania: 'A', ramo: 'Hogar', etiqueta: 'x', procedencia: 'declarado', primaAnual: 200, fechaVencimiento: null },
      { id: '2', compania: 'B', ramo: 'Vida', etiqueta: 'y', procedencia: 'documento', primaAnual: 300, fechaVencimiento: null },
      { id: '3', compania: 'C', ramo: 'Vida', etiqueta: 'z', procedencia: 'declarado', primaAnual: null, fechaVencimiento: null },
      { id: '4', compania: 'D', ramo: 'Vida', etiqueta: 'w', procedencia: 'declarado', primaAnual: 50, fechaVencimiento: d('2025-06-01') },
    ],
  })
  assert.equal(r.aportado.total, 200)
  assert.equal(r.aportado.noIncluidas, 3)
  assert.equal(r.gestionado.total, 100)
})

test('🪤 fuera las pólizas de OTRO tomador en las que la ficha solo figura (figuraTitular definido)', () => {
  const r = polizasDelResumen([
    { polizas: [{ id: 'mia' }, { id: 'de-otro', figuraTitular: { papel: 'asegurado' } }] },
    { polizas: [{ id: 'mia-2', figuraTitular: undefined }] },
  ])
  assert.deepEqual(r.map((p) => p.id), ['mia', 'mia-2'])
})

test('🪤 cableado: /resumen saca las gestionadas de polizasDelResumen (no de t.polizas a pelo)', async () => {
  const { readFileSync } = await import('node:fs')
  const pagina = readFileSync(new URL('../app/(portal)/resumen/page.tsx', import.meta.url), 'utf8')
  assert.match(pagina, /polizasDelResumen\(propias\)\.map\(/)
  assert.doesNotMatch(pagina, /t\.polizas\.map\(/)
})
