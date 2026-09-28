import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { coberturasIncluidas, nombreFicheroPresupuesto, pdfPresupuesto, repartirOpciones, type DatosPdfPresupuesto } from './presupuesto-pdf.ts'

const base: DatosPdfPresupuesto = {
  cliente: 'Manuel Antonio Piña Franco',
  ramo: 'moto',
  creadoAt: new Date('2026-09-28T19:00:00Z'),
  venceEl: new Date('2026-10-12T19:00:00Z'),
  datosCalculo: [
    { titulo: 'Tomador', filas: [{ etiqueta: 'Nombre', valor: 'Manuel Antonio Piña Franco' }, { etiqueta: 'DNI', valor: '*****678Z' }] },
    { titulo: 'Vehículo', filas: [{ etiqueta: 'Matrícula', valor: '2121NST' }, { etiqueta: 'Kilómetros al año', valor: '5.000' }] },
  ],
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

test('tarjetas = las recomendadas; sin ninguna, las 3 primeras; el orden no se toca', () => {
  const o = (papeles: string[], n: number) => ({ n, papeles })
  const r = repartirOpciones([o([], 1), o(['mas_barata'], 2), o([], 3), o(['mejor_cubierta'], 4)])
  assert.deepEqual(r.tarjetas.map((x) => x.n), [2, 4])
  assert.deepEqual(r.resto.map((x) => x.n), [1, 3])
  const s = repartirOpciones([o([], 1), o([], 2), o([], 3), o([], 4)])
  assert.deepEqual(s.tarjetas.map((x) => x.n), [1, 2, 3])
  assert.deepEqual(s.resto.map((x) => x.n), [4])
})

test('nombre del fichero sin tildes ni espacios', () => {
  assert.equal(nombreFicheroPresupuesto(base), 'presupuesto-moto-Manuel-Antonio-Pina-Franco-2026-09-28.pdf')
})

test('genera un PDF con prima nula, franquicia y caracteres fuera de WinAnsi', async () => {
  const bytes = await pdfPresupuesto({ ...base, necesidades: 'Quiere asistencia en viaje 🚀' })
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-')
  // Datos ilegibles: se genera igual (y dice que no se han podido leer).
  const sin = await pdfPresupuesto({ ...base, datosCalculo: null })
  assert.equal(Buffer.from(sin.slice(0, 5)).toString(), '%PDF-')
})

test('el PDF no pinta los avisos internos de la compañía ni un enlace con token', () => {
  const src = readFileSync(new URL('./presupuesto-pdf.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /\.avisos\b/)
  assert.doesNotMatch(src, /token=/)
})

test('logo por la primera palabra; sin logo → null (se pinta la inicial, nunca un hueco)', async () => {
  const { claveLogo } = await import('./presupuesto-pdf.ts')
  assert.equal(claveLogo('Reale Seguros Generales'), 'reale')
  assert.equal(claveLogo('MAPFRE'), 'mapfre')
  assert.equal(claveLogo('Plus Ultra'), null)
})
