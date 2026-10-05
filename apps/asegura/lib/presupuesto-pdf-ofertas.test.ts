// Plantilla del estudio comparativo (F4, 05/10/2026): lo PURO de la vista (celdas, columnas, deltas) y que
// el PDF sale válido y multipágina con datos ANÓNIMOS.
// Para verlo en rojo: en `textoCelda`, cambia `NO_FIGURA` por `'0,00€'` → falla «null es No figura».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { compararOfertas, type OfertaNormalizada, type ValorGarantia } from '@central/module-seguros'
import {
  AVISO_LEGAL_OFERTAS, NO_FIGURA, filasParaColumnas, garantiasClave, leerEstudio, lineasResumen, nombreFicheroOfertas,
  pdfEstudioOfertas, repartirColumnas, textoCelda, textoDelta, textoInfraseguro, type DatosPdfOfertas,
} from './presupuesto-pdf-ofertas.ts'
import { narrativaDeterminista } from './estudio-ia.ts'

const v = (p: Partial<ValorGarantia> = {}): ValorGarantia => ({ estado: null, capital: null, limite: null, franquicia: null, ...p })
const of = (id: string, rol: 'actual' | 'oferta', compania: string, primaTotal: number | null, garantias: Record<string, ValorGarantia>): OfertaNormalizada =>
  ({ id, rol, compania, producto: 'Producto X', primaNeta: null, primaTotal, garantias })

const OFERTAS: OfertaNormalizada[] = [
  of('a', 'actual', 'Compañía Actual', 1000, { continente: v({ estado: 'incluida', capital: 200000 }), rc: v({ estado: 'incluida', capital: 300000, franquicia: 150 }), robo: v({ estado: 'incluida', limite: 6000 }) }),
  of('b', 'oferta', 'Compañía B', 1090.4, { continente: v({ estado: 'incluida', capital: 250000 }), rc: v({ estado: 'incluida', capital: 150000 }) }),
  of('c', 'oferta', 'Compañía C', null, { continente: v({ estado: 'excluida' }) }),
]

function datos(ofertas = OFERTAS): DatosPdfOfertas {
  const comparacion = compararOfertas({ ramo: 'comunidades', ofertas, superficieM2: 400 })
  const n = narrativaDeterminista(comparacion, 'b')
  return {
    referencia: 'AS-26-0099', cliente: 'Comunidad Anónima', ramo: 'comunidades',
    creadoAt: new Date('2026-10-05T10:00:00Z'), venceEl: new Date('2026-11-04T10:00:00Z'), necesidades: 'Quiere más capital de continente.',
    estudio: { recomendadaId: 'b', actualId: 'a', comparacion, narrativa: { resumen: n.resumen, recomendacion: n.recomendacion } },
    mediador: { marca: 'Grupo ASegura', nombre: 'Mediador de prueba', claveDgsfp: 'CS-F/0000', domicilio: 'Calle Falsa 1, Sevilla', email: null },
  }
}

test('null es «No figura», nunca 0 ni «no cubre»; excluida se dice excluida', () => {
  const c = compararOfertas({ ramo: 'comunidades', ofertas: OFERTAS })
  const fila = (k: string) => c.filas.find((f) => f.clave === k)!
  assert.equal(textoCelda(fila('robo').celdas[1]).texto, NO_FIGURA)
  assert.equal(textoCelda(undefined).texto, NO_FIGURA)
  assert.equal(textoCelda(fila('continente').celdas[2]).texto, 'Excluida')
  assert.equal(textoCelda(fila('continente').celdas[1]).texto, '250.000,00€')
  assert.equal(textoCelda(fila('rc').celdas[0]).texto, '300.000,00€\nFranquicia 150,00€')
  assert.equal(textoCelda(fila('robo').celdas[0]).texto, 'Límite 6.000,00€')
  assert.ok(!/(^|\s)0,00€/.test(textoCelda(fila('robo').celdas[1]).texto))
})

test('marcas: peor, mejor y hueco frente a la actual', () => {
  const c = compararOfertas({ ramo: 'comunidades', ofertas: OFERTAS })
  const f = (k: string) => c.filas.find((x) => x.clave === k)!
  assert.equal(textoCelda(f('continente').celdas[1]).marca, 'mejor')
  assert.equal(textoCelda(f('rc').celdas[1]).marca, 'peor')
  assert.equal(textoCelda(f('robo').celdas[1]).marca, 'hueco')
  assert.equal(textoCelda(f('rc').celdas[0]).marca, null)
})

test('columnas: la actual va en todas las tablas y ninguna lleva más de 4', () => {
  const muchas = [OFERTAS[0], ...['b', 'c', 'd', 'e', 'f'].map((id) => of(id, 'oferta', id, 1, {}))]
  const t = repartirColumnas(muchas, 4)
  assert.equal(t.length, 2)
  for (const cols of t) { assert.equal(cols[0].id, 'a'); assert.ok(cols.length <= 4) }
  assert.deepEqual(t.flat().filter((o) => o.rol === 'oferta').map((o) => o.id), ['b', 'c', 'd', 'e', 'f'])
  assert.equal(repartirColumnas(OFERTAS, 4).length, 1)
  assert.deepEqual(repartirColumnas([], 4), [])
  // Sin actual: hasta 4 ofertas por tabla.
  assert.equal(repartirColumnas(muchas.slice(1), 4).length, 2)
})

test('filas por trozo: las que ninguna columna del trozo menciona se omiten', () => {
  const c = compararOfertas({ ramo: 'comunidades', ofertas: OFERTAS })
  assert.ok(filasParaColumnas(c.filas, ['c']).every((f) => f.celdas.find((x) => x.ofertaId === 'c')!.consta))
  assert.equal(filasParaColumnas(c.filas, []).length, 0)
})

test('garantías clave: solo las incluidas, con su cifra', () => {
  const c = compararOfertas({ ramo: 'comunidades', ofertas: OFERTAS })
  const g = garantiasClave(c.filas, 'a', 8)
  assert.ok(g.some((x) => x.endsWith(': 200.000,00€')))
  assert.ok(g.some((x) => x.includes('límite 6.000,00€')))
  assert.deepEqual(garantiasClave(c.filas, 'c', 8), [])
  assert.equal(garantiasClave(c.filas, 'a', 1).length, 1)
})

test('delta de prima: formato español, sin adivinar cuando no hay base', () => {
  assert.equal(textoDelta({ deltaPrimaEur: 90.4, deltaPrimaPct: 9 }), '90,40€ más al año que tu póliza actual (+9,0%)')
  assert.equal(textoDelta({ deltaPrimaEur: -1234.5, deltaPrimaPct: -12.3 }), '1.234,50€ menos al año que tu póliza actual (-12,3%)')
  assert.equal(textoDelta({ deltaPrimaEur: 0, deltaPrimaPct: 0 }), 'Misma prima anual que tu póliza actual')
  assert.equal(textoDelta({ deltaPrimaEur: null, deltaPrimaPct: null }), null)
})

test('resumen: franquicia null = no figura; infraseguro con €/m² y referencia', () => {
  const c = compararOfertas({ ramo: 'comunidades', ofertas: OFERTAS, superficieM2: 400 })
  const rb = c.resumen.find((r) => r.ofertaId === 'b')!
  assert.equal(lineasResumen(rb, true)[0], 'Franquicia: no figura en la oferta')
  assert.ok(lineasResumen(rb, true).some((l) => l.includes('con menos cobertura')))
  assert.equal(lineasResumen(rb, false).length, 1)
  const ra = c.resumen.find((r) => r.ofertaId === 'a')!
  assert.equal(lineasResumen(ra, true)[0], 'Franquicia máxima declarada: 150,00€')
  assert.ok(rb.infraseguroContinente)
  assert.match(textoInfraseguro(rb.infraseguroContinente!), /625,00€\/m².*1\.100,00€\/m²/)
})

test('estudio: una forma que no cuadra no se pinta', () => {
  const d = datos()
  assert.ok(leerEstudio(JSON.parse(JSON.stringify(d.estudio))))
  assert.equal(leerEstudio(null), null)
  assert.equal(leerEstudio({ comparacion: {}, narrativa: {} }), null)
  assert.equal(leerEstudio({ ...d.estudio, narrativa: { resumen: 1 } }), null)
})

test('aviso legal: RDL 3/2020, datos de las compañías y no sustituye a la póliza', () => {
  assert.match(AVISO_LEGAL_OFERTAS, /Real Decreto-ley 3\/2020/)
  assert.match(AVISO_LEGAL_OFERTAS, /facilitados por las propias compañías/)
  assert.match(AVISO_LEGAL_OFERTAS, /No sustituye a la póliza/)
})

test('el nombre del fichero no lleva tildes ni espacios', () => {
  assert.equal(nombreFicheroOfertas(datos()), 'estudio-AS-26-0099-comunidad-de-propietarios-Comunidad-Anonima-2026-10-05.pdf')
})

test('el PDF sale válido (con y sin póliza actual, con una oferta sin prima)', async () => {
  for (const ofs of [OFERTAS, OFERTAS.slice(1)]) {
    const d = datos(ofs)
    if (ofs.length === 2) d.estudio = { ...d.estudio, actualId: null }
    const bytes = await pdfEstudioOfertas(d)
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-')
    assert.ok(bytes.length > 5000)
  }
})

test('con muchas ofertas y garantías el PDF pasa de una página', async () => {
  const garantias: Record<string, ValorGarantia> = {}
  for (const k of ['continente', 'contenido', 'rc', 'robo', 'agua', 'incendio', 'juridica', 'cristales', 'electricos']) garantias[k] = v({ estado: 'incluida', capital: 10000 })
  const muchas = [of('a', 'actual', 'Actual', 900, garantias), ...['b', 'c', 'd', 'e', 'f'].map((id) => of(id, 'oferta', `Compañía ${id}`, 800 + id.charCodeAt(0), garantias))]
  const bytes = await pdfEstudioOfertas(datos(muchas))
  const paginas = (await PDFDocument.load(bytes)).getPageCount()
  assert.ok(paginas >= 2, `páginas: ${paginas}`)
})
