// Propuesta comercial: modelo PURO (dinero español, «No consta» nunca 0, orden de compañías, sin recomendación inventada)
// y que el PDF sale válido. Para verlo en rojo: en `textoCeldaPropuesta`/columnas cambia `NO_CONSTA` por `eur(0)` o quita `eur(` de la prima.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import type { TablaComparador, CeldaComparador } from '@central/module-tarificacion'
import { NO_CONSTA, construirPropuesta, nombreFicheroPropuesta, textoCeldaPropuesta } from './propuesta-comercial.ts'
import { pdfPropuesta } from './propuesta-comercial-pdf.ts'

const celda = (ofertaId: string, p: Partial<CeldaComparador> = {}): CeldaComparador =>
  ({ ofertaId, consta: true, sinValidar: false, estado: 'incluida', limite: null, franquicia: null, capitalEur: null, limiteEur: null, franquiciaEur: null, ...p })
const sinDato = (ofertaId: string): CeldaComparador => celda(ofertaId, { consta: false, estado: null })
const dif = { huecos: [], distintas: false, limiteMaxEur: null, ofertasLimiteMax: [], franquiciaMinEur: null, ofertasFranquiciaMin: [], ofertasSinIncluir: [] }

const TABLA: TablaComparador = {
  ramo: 'comunidades',
  columnas: [
    { ofertaId: 'z', compania: 'Zurich', producto: 'Hogar Plus', version: null, fichaId: 'f1', fichaEstado: 'validada', primaTotalEur: 2162.49 },
    { ofertaId: 'a', compania: 'Allianz', producto: 'Comunidades', version: null, fichaId: 'f2', fichaEstado: 'pendiente', primaTotalEur: null },
  ],
  filas: [
    { clave: 'continente', etiqueta: 'Continente', grupo: 'danos', celdas: [celda('z', { capitalEur: 1234567.5 }), sinDato('a')], diferencias: dif },
    { clave: 'rc_general', etiqueta: 'RC general', grupo: 'rc', celdas: [celda('z', { limiteEur: 300000, franquicia: { tipo: 'importe', eur: 150 } }), celda('a', { sinValidar: true, limiteEur: 600000, franquicia: { tipo: 'sin_franquicia' } })], diferencias: dif },
    { clave: 'robo', etiqueta: 'Robo', grupo: 'danos', celdas: [sinDato('z'), sinDato('a')], diferencias: dif },
    { clave: 'defensa', etiqueta: 'Defensa jurídica', grupo: 'juridica', celdas: [celda('z'), celda('a', { estado: 'excluida' })], diferencias: dif },
  ],
  avisos: [],
}
const base = { referencia: 'AS-26-0100', cliente: 'Comunidad Anónima', ramo: 'comunidades', fecha: new Date('2026-10-07T10:00:00Z'), tabla: TABLA }

test('dinero en formato español: 2.162,49€ y miles en 7 cifras', () => {
  const m = construirPropuesta(base)
  assert.equal(m.columnas[0].primaAnual, '2.162,49€')
  assert.equal(m.filas.find((f) => f.etiqueta === 'Continente')!.celdas[0], '1.234.567,50€')
  assert.equal(m.filas.find((f) => f.etiqueta === 'RC general')!.celdas[0], 'Límite 300.000,00€\nFranquicia 150,00€')
})

test('«No consta» nunca se pinta como 0', () => {
  const m = construirPropuesta(base)
  assert.equal(m.columnas[1].primaAnual, NO_CONSTA)
  assert.equal(m.columnas[1].primaAnualEur, null)
  assert.equal(m.filas.find((f) => f.etiqueta === 'Continente')!.celdas[1], NO_CONSTA)
  assert.equal(textoCeldaPropuesta(undefined), NO_CONSTA)
  for (const f of m.filas) for (const c of f.celdas) assert.doesNotMatch(c, /^0([,.]0+)?€?$/)
  assert.ok(!m.filas.some((f) => f.etiqueta === 'Robo'), 'una garantía de la que nadie dice nada no genera fila')
  assert.ok(m.avisos.some((a) => a.includes(NO_CONSTA)))
})

test('no incluida ≠ no consta; sin validar lleva asterisco y aviso', () => {
  const m = construirPropuesta(base)
  assert.equal(m.filas.find((f) => f.etiqueta === 'Defensa jurídica')!.celdas.join('|'), 'Incluida|No incluida')
  assert.equal(m.filas.find((f) => f.etiqueta === 'RC general')!.celdas[1], 'Límite 600.000,00€\nSin franquicia*')
  assert.ok(m.avisos.some((a) => a.includes('Allianz') && a.includes('validar')))
})

test('el orden de las compañías es el de entrada (sin ranking) y las filas siguen: capitales, RC, garantías', () => {
  const m = construirPropuesta(base)
  assert.deepEqual(m.companias, ['Zurich', 'Allianz'])
  assert.deepEqual(m.columnas.map((c) => c.compania), ['Zurich', 'Allianz'])
  assert.deepEqual(m.filas.map((f) => f.etiqueta), ['Continente', 'RC general', 'Defensa jurídica'])
})

test('sin recomendación el documento no recomienda; con ella la marca; una inexistente se omite', () => {
  assert.equal(construirPropuesta(base).recomendacion, null)
  assert.ok(construirPropuesta(base).columnas.every((c) => !c.recomendada))
  const con = construirPropuesta({ ...base, recomendacion: { compania: 'Allianz', motivos: ['Mayor RC', '  '] } })
  assert.deepEqual(con.recomendacion, { compania: 'Allianz', motivos: ['Mayor RC'] })
  assert.deepEqual(con.columnas.map((c) => c.recomendada), [false, true])
  const mala = construirPropuesta({ ...base, recomendacion: { compania: 'Inventada', motivos: ['x'] } })
  assert.equal(mala.recomendacion, null)
  assert.ok(mala.avisos.some((a) => a.includes('omitido')))
})

test('pie legal de mediador y aviso orientativo; del cliente solo nombre y referencia', () => {
  const m = construirPropuesta(base)
  assert.match(m.pieLegal, /Grupo ASegura/)
  assert.match(m.pieLegal, /CS-F\/0170/)
  assert.match(m.avisoOrientativo, /orientativo, sujeto a las condiciones de la compañía/)
  assert.deepEqual(Object.keys(m).filter((k) => /dni|nif|telefono|email|direccion/i.test(k)), [])
  assert.match(nombreFicheroPropuesta(m), /^propuesta-AS-26-0100-comunidad-de-propietarios-Comunidad-An-nima-2026-10-07\.pdf$|^propuesta-.*\.pdf$/)
})

test('el PDF sale válido (con y sin recomendación, y con 5 compañías en dos tablas)', async () => {
  const cinco: TablaComparador = {
    ...TABLA,
    columnas: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ ofertaId: id, compania: `Compañía ${id}`, producto: 'P', version: null, fichaId: null, fichaEstado: null, primaTotalEur: 100 })),
    filas: TABLA.filas.map((f) => ({ ...f, celdas: ['a', 'b', 'c', 'd', 'e'].map((id) => celda(id, { capitalEur: 1000 })) })),
  }
  for (const m of [construirPropuesta(base), construirPropuesta({ ...base, tabla: cinco, recomendacion: { compania: 'Compañía c', motivos: ['Buen precio'] } })]) {
    const bytes = await pdfPropuesta(m)
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-')
    assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 1)
  }
})
