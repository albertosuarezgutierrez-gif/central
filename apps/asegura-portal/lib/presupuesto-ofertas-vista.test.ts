// Presupuestos de origen `ofertas` en el portal (F4, 05/10/2026). Datos ANÓNIMOS.
// Para verlo en rojo: en `valorCelda`, devuelve `{ texto: 'Excluida', tono: 'no' }` también para `no_consta`
// → falla «lo que la oferta no menciona es “No figura”, nunca “Excluida”».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  TEXTOS_OFERTAS, copyOfertas, cuadroOfertas, esRecomendada, garantiasTarjeta, ordenarOfertas, origenVista, puedeDescargarPdf,
  textoCompaniasOfertas, textoValidezOfertas, valorCelda,
} from './presupuesto-ofertas-vista.ts'
import { esPapel, etiquetaPapeles, revisarCopyFijo } from './presupuesto-vista.ts'
import { nombreFicheroSeguro, esPdf } from './presupuesto-pdf.ts'
import type { CoberturasOpcion } from './tabla-coberturas.ts'

const cob = (lista: CoberturasOpcion['lista']): CoberturasOpcion => ({ estado: lista === null ? 'no_intentado' : lista.length ? 'leidas' : 'vacias', lista })
const op = (id: string, orden: number, compania: string, papeles: string[], lista: CoberturasOpcion['lista']) =>
  ({ id, orden, compania, producto: 'Prod', papeles: papeles as never, coberturasDetalle: cob(lista) })

const OPCIONES = [
  op('b', 2, 'Compañía B', [], [{ nombre: 'Continente', incluida: true, texto: 'Capital 250.000,00€' }, { nombre: 'Robo', incluida: false, texto: null }]),
  op('a', 3, 'Compañía A', ['recomendada'], [{ nombre: 'Continente', incluida: true, texto: 'Capital 200.000,00€ · Franquicia 150,00€' }, { nombre: 'Responsabilidad civil', incluida: true, texto: null }]),
  op('c', 1, 'Compañía C', [], null),
]

test('origen: solo los dos conocidos; el resto es null (no se pinta ni se acepta)', () => {
  assert.equal(origenVista('ofertas'), 'ofertas')
  assert.equal(origenVista('codeoscopic'), 'codeoscopic')
  assert.equal(origenVista('otro'), null)
  assert.equal(origenVista(null), null)
})

test('«recomendada» es un papel conocido y se dice como lo que es: la marca el corredor', () => {
  assert.equal(esPapel('recomendada'), true)
  assert.equal(etiquetaPapeles(['recomendada'], false), 'La que te recomienda tu corredor')
  assert.equal(esRecomendada({ papeles: ['recomendada'] }), true)
  assert.equal(esRecomendada({ papeles: [] }), false)
})

test('orden: la recomendada primero y el resto en el orden congelado', () => {
  assert.deepEqual(ordenarOfertas(OPCIONES).map((o) => o.id), ['a', 'c', 'b'])
  // No muta la entrada.
  assert.deepEqual(OPCIONES.map((o) => o.id), ['b', 'a', 'c'])
})

test('lo que la oferta no menciona es «No figura», nunca «Excluida»; «Excluida» solo si la oferta lo dice', () => {
  assert.deepEqual(valorCelda({ estado: 'no_consta', texto: null }), { texto: 'No figura', tono: 'no_figura' })
  assert.deepEqual(valorCelda({ estado: 'no', texto: null }), { texto: 'Excluida', tono: 'no' })
  assert.deepEqual(valorCelda({ estado: 'si', texto: 'Capital 1,00€' }), { texto: 'Capital 1,00€', tono: 'si' })
  assert.deepEqual(valorCelda({ estado: 'si', texto: null }), { texto: 'Incluida', tono: 'si' })
  assert.deepEqual(valorCelda({ estado: 'ver_texto', texto: null }), { texto: 'No figura', tono: 'no_figura' })
})

test('cuadro: columnas en el orden de las tarjetas, huecos como «No figura» y las ilegibles se dicen', () => {
  const c = cuadroOfertas(OPCIONES)
  assert.deepEqual(c.columnas.map((x) => x.id), ['a', 'c', 'b'])
  assert.equal(c.columnas[0].recomendada, true)
  assert.deepEqual(c.sinLeer, ['Compañía C'])
  const cont = c.filas.find((f) => f.nombre === 'Continente')!
  assert.deepEqual(cont.celdas.map((x) => x.texto), ['Capital 200.000,00€ · Franquicia 150,00€', 'No figura', 'Capital 250.000,00€'])
  const robo = c.filas.find((f) => f.nombre === 'Robo')!
  assert.deepEqual(robo.celdas.map((x) => x.tono), ['no_figura', 'no_figura', 'no'])
  assert.deepEqual(cuadroOfertas([]).filas, [])
})

test('tarjeta: solo las incluidas, con tope y el resto contado; sin leer ≠ vacía', () => {
  const g = garantiasTarjeta(OPCIONES[1])
  assert.deepEqual(g.items, ['Continente: Capital 200.000,00€ · Franquicia 150,00€', 'Responsabilidad civil'])
  assert.equal(g.sinLeer, false)
  const muchas = op('x', 1, 'X', [], Array.from({ length: 8 }, (_, i) => ({ nombre: `G${i}`, incluida: true, texto: null })))
  assert.deepEqual([garantiasTarjeta(muchas, 5).items.length, garantiasTarjeta(muchas, 5).resto], [5, 3])
  assert.equal(garantiasTarjeta(OPCIONES[2]).sinLeer, true)
  assert.deepEqual(garantiasTarjeta(op('y', 1, 'Y', [], [])), { items: [], resto: 0, sinLeer: false })
  // Una excluida no entra en «lo que cubre».
  assert.ok(!garantiasTarjeta(OPCIONES[0]).items.some((t) => t.startsWith('Robo')))
})

test('PDF: solo de ofertas y ya enviado', () => {
  assert.equal(puedeDescargarPdf({ origen: 'ofertas', enviadoAt: new Date() }), true)
  assert.equal(puedeDescargarPdf({ origen: 'ofertas', enviadoAt: null }), false)
  assert.equal(puedeDescargarPdf({ origen: 'codeoscopic', enviadoAt: new Date() }), false)
  assert.equal(puedeDescargarPdf({ origen: null, enviadoAt: new Date() }), false)
})

test('descarga: nombre sin rutas ni comillas y solo se sirve un PDF de verdad', () => {
  assert.equal(nombreFicheroSeguro('estudio-AS-26-0099.pdf'), 'estudio-AS-26-0099.pdf')
  assert.equal(nombreFicheroSeguro('../../etc/passwd'), 'estudio-comparativo.pdf')
  assert.equal(nombreFicheroSeguro('a"b.pdf'), 'a_b.pdf')
  assert.equal(nombreFicheroSeguro(null), 'estudio-comparativo.pdf')
  assert.equal(esPdf(new TextEncoder().encode('%PDF-1.7 ...')), true)
  assert.equal(esPdf(new TextEncoder().encode('{"estado":"error"}')), false)
})

test('textos: validez sin «válido hasta» a secas, compañías sin inventar consultas y copy limpio', () => {
  assert.match(textoValidezOfertas('1 de enero', '16 de enero', false), /Ofertas recibidas el 1 de enero/)
  assert.match(textoValidezOfertas('1 de enero', '16 de enero', true), /No las doy por buenas/)
  assert.equal(textoCompaniasOfertas(3), 'Las ofertas que te pongo delante son de 3 compañías.')
  assert.doesNotMatch(textoCompaniasOfertas(3), /Consult/i)
  assert.ok(copyOfertas().length > 10)
  assert.equal(revisarCopyFijo(), '')
})

test('ofertas: ningún texto dice que «se calculó» el precio (no hay tarificación detrás)', () => {
  for (const t of copyOfertas()) assert.doesNotMatch(t, /calcul/i, t)
  assert.doesNotMatch(TEXTOS_OFERTAS.revisaIntro, /calcul/i)
})

test('la pantalla enseña el texto de ofertas y no el de la tarificación cuando el origen es ofertas', () => {
  const rev = readFileSync(new URL('../app/(portal)/boveda/presupuesto/[id]/RevisaTusDatos.tsx', import.meta.url), 'utf8')
  assert.match(rev, /origen === 'ofertas' \? TEXTOS_OFERTAS\.revisaIntro/)
  assert.match(rev, /origen === 'ofertas' \? TEXTOS_OFERTAS\.sinDatos/)
  const ace = readFileSync(new URL('../app/(portal)/boveda/presupuesto/[id]/AceptarOpcion.tsx', import.meta.url), 'utf8')
  assert.match(ace, /origen === 'ofertas' \? TEXTOS_OFERTAS\.casillaPista/)
  const pag = readFileSync(new URL('../app/(portal)/boveda/presupuesto/[id]/page.tsx', import.meta.url), 'utf8')
  assert.match(pag, /p\.origen === null/, 'un origen desconocido no se pinta')
  assert.match(pag, /origen=\{p\.origen\}/)
  const est = readFileSync(new URL('../app/(portal)/boveda/presupuesto/[id]/EstudioOfertas.tsx', import.meta.url), 'utf8')
  assert.match(est, /origen="ofertas"/)
})
