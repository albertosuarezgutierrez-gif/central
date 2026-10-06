import test from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluarAnulacionesEnBloque,
  textoAnulacionesEnBloque,
  textoRenovacionesAnuladas,
  textoRetrasoAnulacion,
  agruparPosiblesBajas,
  textoPosiblesBajas,
  tramoFirmaAnulaciones,
  type FicheroAnulacionFila,
} from './anulacion-bloque.ts'
import {
  saludIngesta,
  detalleSalud,
  firmaAvisoIngesta,
  normalizarFirmaIngesta,
  cambioAnulacionesEnFirma,
} from './ingesta.ts'

const fila = (o: Partial<FicheroAnulacionFila> = {}): FicheroAnulacionFila => ({
  entidad: 'C0058', entidadNombre: 'Mapfre', fichero: 'POL_1.zip', polizas: 47, anuladas: 25,
  impago: 11, otraCompania: 9, siniestralidad: 5, otros: 0, medianaDiasRetraso: 437, ...o,
})

test('bloque: el caso real (25/47 = 53%) se señala', () => {
  assert.equal(evaluarAnulacionesEnBloque([fila()]).length, 1)
})
test('bloque: bajo el 30% no se señala aunque pasen de 10', () => {
  assert.equal(evaluarAnulacionesEnBloque([fila({ polizas: 100, anuladas: 29 })]).length, 0)
})
test('bloque: exactamente el 30% con 10 anuladas SÍ', () => {
  assert.equal(evaluarAnulacionesEnBloque([fila({ polizas: 33, anuladas: 10 })]).length, 1)
})
test('bloque: menos de 10 anuladas no se señala aunque sea el 100%', () => {
  assert.equal(evaluarAnulacionesEnBloque([fila({ polizas: 9, anuladas: 9 })]).length, 0)
})
test('bloque: fichero sin pólizas no divide por cero', () => {
  assert.deepEqual(evaluarAnulacionesEnBloque([fila({ polizas: 0, anuladas: 10 })]), [])
})
test('bloque: texto con N/M, porcentaje y desglose por motivo', () => {
  const t = textoAnulacionesEnBloque(evaluarAnulacionesEnBloque([fila()]))
  assert.match(t, /25\/47 pólizas en AN \(53%\)/)
  assert.match(t, /11 impago · 9 otra compañía · 5 siniestralidad · 0 otros/)
  assert.match(t, /mediana 437 d/)
})
test('bloque: retraso null se dice «sin fecha legible», nunca 0 d', () => {
  const t = textoAnulacionesEnBloque([fila({ medianaDiasRetraso: null })])
  assert.match(t, /sin fecha legible/)
  assert.doesNotMatch(t, /mediana 0 d/)
})
test('bloque: lista vacía o null no redacta nada', () => {
  assert.equal(textoAnulacionesEnBloque([]), '')
  assert.equal(textoAnulacionesEnBloque(null), '')
})
test('renovación anulada: texto aparte, dice que no se reclama', () => {
  const t = textoRenovacionesAnuladas([{ entidad: 'C0058', entidadNombre: 'Mapfre', polizas: 4, vencimientoMasAntiguo: null }])
  assert.match(t, /Mapfre anuló la renovación de 4 póliza/)
  assert.match(t, /nada que reclamar/)
})
test('renovación anulada: polizas 0 no redacta', () => {
  assert.equal(textoRenovacionesAnuladas([{ entidad: 'C0058', entidadNombre: null, polizas: 0, vencimientoMasAntiguo: null }]), '')
})
test('retraso: mediana por compañía y null explícito', () => {
  assert.match(textoRetrasoAnulacion([{ entidad: 'C0058', entidadNombre: 'Mapfre', polizas: 27, medianaDias: 437 }]), /Mapfre 437 d \(27/)
  assert.match(textoRetrasoAnulacion([{ entidad: 'C0058', entidadNombre: null, polizas: 1, medianaDias: null }]), /C0058 sin fecha legible/)
})
test('posibles bajas: agrupa por compañía, sin repetir ni vacíos', () => {
  const g = agruparPosiblesBajas([
    { entidad: 'C0058', entidadNombre: 'Mapfre', numeroPoliza: 'B' },
    { entidad: 'C0058', entidadNombre: 'Mapfre', numeroPoliza: 'A' },
    { entidad: 'C0058', entidadNombre: 'Mapfre', numeroPoliza: 'A' },
    { entidad: 'C0058', entidadNombre: 'Mapfre', numeroPoliza: '  ' },
  ])
  assert.deepEqual(g[0].numeros, ['A', 'B'])
})
test('posibles bajas: recorta a 5 números y cuenta el resto', () => {
  const g = agruparPosiblesBajas(['1', '2', '3', '4', '5', '6', '7'].map(n => ({ entidad: 'C1', entidadNombre: null, numeroPoliza: n })))
  assert.match(textoPosiblesBajas(g), /C1 7 \(1, 2, 3, 4, 5 y 2 más\)/)
})
test('posibles bajas: sin nada no redacta', () => {
  assert.equal(textoPosiblesBajas([]), '')
  assert.equal(textoPosiblesBajas(undefined), '')
})
test('firma: los tres estados dan tramos distintos', () => {
  const t = (v: null | undefined | []) => tramoFirmaAnulaciones({ bloque: v, bajas: v, anuladas: v })
  assert.equal(t(undefined), '[||]')
  assert.equal(t([]), '[||]')
  assert.equal(t(null), '[?|?|?]')
})

// --- integración con saludIngesta ---
test('salud: anulación en bloque es INFORMATIVA: no degrada y sale en detalleSalud', () => {
  const s = saludIngesta({ cuarentena: [], ultimoPull: { horas: 2, procesados: 5 }, anulacionesPorFichero: [fila()] })
  assert.equal(s.estado, 'ok')
  assert.equal(s.anulacionesEnBloque?.length, 1)
  assert.match(detalleSalud(s), /Anulación en bloque/)
})
test('salud: anulacionesPorFichero null = hueco (parcial), nunca ok', () => {
  const s = saludIngesta({ cuarentena: [], ultimoPull: { horas: 2, procesados: 5 }, anulacionesPorFichero: null })
  assert.equal(s.estado, 'parcial')
})
test('salud: renovaciones anuladas NO degradan ni cuentan como sin llegar', () => {
  const s = saludIngesta({
    cuarentena: [], ultimoPull: { horas: 2, procesados: 5 }, renovacionesSinLlegar: [],
    renovacionesAnuladas: [{ entidad: 'C0058', entidadNombre: 'Mapfre', polizas: 3, vencimientoMasAntiguo: '2026-07-01' }],
  })
  assert.equal(s.estado, 'ok')
  assert.deepEqual(s.renovacionesSinLlegar, [])
  assert.match(detalleSalud(s), /Mapfre anuló la renovación de 3/)
})
test('salud: posiblesBajas null = hueco', () => {
  assert.equal(saludIngesta({ cuarentena: [], ultimoPull: { horas: 2, procesados: 5 }, posiblesBajas: null }).estado, 'parcial')
})
test('salud: el retraso null/ausente no es hueco', () => {
  assert.equal(saludIngesta({ cuarentena: [], ultimoPull: { horas: 2, procesados: 5 }, retrasoAnulacion: null }).estado, 'ok')
})
test('firma: diez tramos; una de nueve (antes del 06/10) se lee como sin anulaciones', () => {
  const s = saludIngesta({ cuarentena: [], ultimoPull: { horas: 2, procesados: 5 } })
  const hoy = firmaAvisoIngesta(s)
  assert.equal(hoy.split(':').length, 10)
  const vieja = hoy.slice(0, hoy.lastIndexOf(':'))
  assert.equal(normalizarFirmaIngesta(vieja), hoy)
})
test('firma: un bloque nuevo cambia el tramo; el retraso solo NO lo cambia', () => {
  const base = { cuarentena: [], ultimoPull: { horas: 2, procesados: 5 } }
  const sin = firmaAvisoIngesta(saludIngesta(base))
  const con = firmaAvisoIngesta(saludIngesta({ ...base, anulacionesPorFichero: [fila()] }))
  assert.equal(cambioAnulacionesEnFirma(sin, con), true)
  assert.equal(cambioAnulacionesEnFirma(con, con), false)
  const retraso = firmaAvisoIngesta(saludIngesta({ ...base, retrasoAnulacion: [{ entidad: 'C0058', entidadNombre: null, polizas: 3, medianaDias: 9 }] }))
  assert.equal(retraso, sin)
  assert.equal(cambioAnulacionesEnFirma(null, sin), false)
})
