import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { coberturasIncluidas, nombreFicheroPresupuesto, pdfPresupuesto, rotuloGaraje, type DatosPdfPresupuesto } from './presupuesto-pdf.ts'

const base: DatosPdfPresupuesto = {
  cliente: 'Manuel Antonio Piña Franco',
  ramo: 'moto',
  creadoAt: new Date('2026-09-28T19:00:00Z'),
  venceEl: new Date('2026-10-12T19:00:00Z'),
  vehiculo: { matricula: '2121NST', kmAnuales: 5000, garaje: 'Garaje privado' },
  necesidades: null,
  opciones: [
    { compania: 'Allianz', producto: 'Allianz Motos', modalidad: 'ALLIANZ MOTO BÁSICO', categoria: 'Terceros', primaEur: 188.37, franquiciaEur: null, firmeza: 'estimado', papeles: ['mas_barata'], coberturas: ['Responsabilidad civil obligatoria'] },
    { compania: 'Reale', producto: 'Reale Moto', modalidad: null, categoria: null, primaEur: null, franquiciaEur: 150, firmeza: 'firme', papeles: [], coberturas: [] },
  ],
  mediador: { marca: 'Grupo ASegura', nombre: 'Alberto Suárez Gutiérrez', claveDgsfp: 'CS-F/0170', domicilio: 'Sevilla', email: 'hola@grupoasegura.es' },
}

test('coberturas: solo las incluidas, sin repetir, y un JSON raro no revienta', () => {
  assert.deepEqual(
    coberturasIncluidas({ lista: [{ nombre: 'RC', incluida: true }, { nombre: 'Robo', incluida: false }, { nombre: 'RC' }, { texto: 'sin nombre' }] }),
    ['RC'],
  )
  assert.deepEqual(coberturasIncluidas(null), [])
  assert.deepEqual(coberturasIncluidas('basura'), [])
})

test('garaje: solo se traduce lo que se reconoce; un id numérico de auto no se inventa', () => {
  assert.equal(rotuloGaraje('NoGarage'), 'Sin garaje')
  assert.equal(rotuloGaraje('PrivateGarage'), 'Garaje privado')
  assert.equal(rotuloGaraje('3'), null)
  assert.equal(rotuloGaraje(null), null)
})

test('nombre del fichero sin tildes ni espacios', () => {
  assert.equal(nombreFicheroPresupuesto(base), 'presupuesto-moto-Manuel-Antonio-Pina-Franco-2026-09-28.pdf')
})

test('genera un PDF con prima nula, franquicia y caracteres fuera de WinAnsi', async () => {
  const bytes = await pdfPresupuesto({ ...base, necesidades: 'Quiere asistencia en viaje 🚀' })
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-')
})

test('el PDF no pinta los avisos internos de la compañía ni un enlace con token', () => {
  const src = readFileSync(new URL('./presupuesto-pdf.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /\.avisos\b/)
  assert.doesNotMatch(src, /token=/)
})
