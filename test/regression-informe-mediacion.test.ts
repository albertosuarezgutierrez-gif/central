// Cepos del informe anual de mediación en plataforma: una respuesta a medias no se pinta (daría
// totales falsos), las compañías sin recibos se declaran, y el CSV no viaja sin su advertencia.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  companiasSinPrimas,
  csvInforme,
  interpretarInforme,
  type InformePuerto,
} from '../apps/plataforma/lib/informe-mediacion-asegura.ts'

const informe: InformePuerto = {
  primas: {
    año: 2025,
    filas: [{ compania: 'C0058', ramo: 'auto', recibos: 2, primas: 1234.5, primasNuevaProduccion: 234.5, primasCartera: 1000, primasOtras: 0, anulados: 1, devueltos: 0, pendientes: 0 }],
    total: { recibos: 2, primas: 1234.5, primasNuevaProduccion: 234.5, primasCartera: 1000, primasOtras: 0 },
    ilegibles: 1,
    sinFecha: 0,
    companiasConDatos: ['C0058'],
  },
  companias: { C0058: 'Mapfre', C0109: 'Allianz' },
  carteraHoy: [
    { compania: 'C0058', ramo: 'auto', polizas: 3 },
    { compania: 'C0109', ramo: 'hogar', polizas: 1 },
  ],
  quejas: { total: 1, abiertas: 0, cerradasEnPlazo: 1, cerradasFueraDePlazo: 0 },
}

test('🪤 una respuesta sin el bloque de quejas NO se pinta como informe', () => {
  const { quejas: _q, ...sinQuejas } = informe
  const r = interpretarInforme(200, { estado: 'ok', ...sinQuejas })
  assert.deepEqual(r, { estado: 'error', motivo: 'respuesta_ilegible' })
  assert.equal(interpretarInforme(200, { estado: 'ok', ...informe }).estado, 'ok')
})

test('🪤 estados del puerto: 404 = no desplegado, 503 = sin configurar, 401 = secreto', () => {
  assert.equal(interpretarInforme(404, null).estado, 'no_desplegado')
  assert.equal(interpretarInforme(503, { estado: 'sin_configurar' }).estado, 'sin_configurar')
  assert.deepEqual(interpretarInforme(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarInforme(500, { estado: 'error', causa: 'conexion' }), { estado: 'error', motivo: 'conexion' })
})

test('🪤 una compañía con pólizas y sin recibos se declara: sus primas no constan', () => {
  assert.deepEqual(companiasSinPrimas(informe), ['C0109'])
})

test('🪤 el CSV abre diciendo que NO es el modelo oficial, con coma decimal y los huecos', () => {
  const csv = csvInforme(informe, [{ codigo: 'C0058', compania: 'Mapfre', bruto: 100.5, retencion: null, periodos: 2, periodosSinExtracto: 1, periodosSinComprobar: 0, periodosSinRetencion: 1 }])
  const lineas = csv.split('\n')
  assert.match(lineas[0], /NO es el modelo oficial de la DGSFP/)
  assert.match(csv, /;1234,50;/)
  assert.match(csv, /sin recibos de CIMA este año.*Allianz/)
  assert.match(csv, /importe ilegible/)
  assert.match(csv, /;Mapfre;100,50;;2;1/)
})

test('🪤 una fila a medias (sin una columna que se pinta) NO se da por buena', () => {
  const roto = { ...informe, primas: { ...informe.primas, filas: [{ ...informe.primas.filas[0], primasCartera: undefined }] } }
  assert.deepEqual(interpretarInforme(200, { estado: 'ok', ...roto }), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('🪤 el CSV neutraliza un texto que Excel ejecutaría como fórmula, y no toca los números negativos', () => {
  const trampa = { ...informe, companias: { ...informe.companias, C0058: '=HYPERLINK("x")' }, primas: { ...informe.primas, total: { ...informe.primas.total, primasOtras: -12.5 } } }
  const csv = csvInforme(trampa, [])
  assert.match(csv, /;"'=HYPERLINK\(""x""\)";/)
  assert.match(csv, /;-12,50/)
})

test('🪤 sin libro de comisiones el CSV lo dice: la sección no está vacía, falta', () => {
  assert.match(csvInforme(informe, null), /No se ha podido leer el libro de comisiones/)
})
