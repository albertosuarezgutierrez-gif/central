// Guardián de la lista blanca de normas.
//
// Lo que se vigila aquí no es que la lista tenga entradas, sino que
// `mencionesNormativas` no deje pasar una cita. Un falso negativo de esa
// función es una cita inventada publicada bajo la clave DGSFP de Alberto, así
// que los casos de abajo son las formas reales en que un texto nombra una
// norma, no ejemplos de laboratorio.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NORMAS_CITABLES,
  normaPorId,
  citaLegible,
  mencionesNormativas,
  citasNoRespaldadas,
  idsDesconocidos,
} from './normas.ts'

test('cada norma está completa y verificada contra una fuente', () => {
  assert.ok(NORMAS_CITABLES.length > 0)
  const vistos = new Set<string>()
  for (const n of NORMAS_CITABLES) {
    assert.ok(!vistos.has(n.id), `id duplicado: ${n.id}`)
    vistos.add(n.id)
    assert.match(n.id, /^[a-z0-9-]+$/, `id con formato raro: ${n.id}`)
    assert.ok(n.norma.trim().length > 10, `${n.id}: nombre de norma incompleto`)
    assert.ok(n.sintesis.trim().length > 30, `${n.id}: síntesis demasiado corta para significar algo`)
    // El enlace es lo que permite a quien lee comprobar la cita. Sin él, la
    // lista blanca solo traslada la confianza de un sitio a otro.
    assert.match(n.url, /^https:\/\/www\.boe\.es\//, `${n.id}: la fuente debe ser el texto consolidado del BOE`)
    assert.match(n.verificado, /^\d{4}-\d{2}-\d{2}$/, `${n.id}: falta la fecha de verificación`)
    assert.ok(n.verificado <= new Date().toISOString().slice(0, 10), `${n.id}: verificada en el futuro`)
    assert.ok(n.cubre.length > 0, `${n.id}: no declara qué menciones autoriza, así que no autoriza ninguna`)
  }
})

test('normaPorId no inventa', () => {
  assert.equal(normaPorId('no-existe'), null)
  assert.equal(normaPorId('lcs-22')?.articulo, '22')
})

test('la cita legible identifica la norma y dice qué contiene', () => {
  const n = normaPorId('lcs-22')!
  const cita = citaLegible(n)
  assert.match(cita, /Artículo 22/)
  assert.match(cita, /Ley 50\/1980/)
  assert.ok(cita.length > 60, 'una cita sin síntesis no permite comprobar nada')
})

// 🚨 EL cepo. Cada caso es una forma en que un texto real nombra una norma.
test('mencionesNormativas caza todas las formas de citar', () => {
  const casos: [string, string][] = [
    ['El artículo 22 de la Ley de Contrato de Seguro dice…', 'articulo:22'],
    ['según el art. 20 de la misma ley', 'articulo:20'],
    ['los artículos 18 y 20 obligan a', 'articulo:20'],
    ['los artículos 18, 20 y 23 regulan', 'articulo:23'],
    ['la Ley 50/1980 lo regula', 'ley:50/1980'],
    ['la Orden ECC/2502/2012 fija el procedimiento', 'orden:ECC/2502/2012'],
    ['el Real Decreto-ley 3/2020 distingue', 'rdl:3/2020'],
  ]
  for (const [texto, esperada] of casos) {
    assert.ok(
      mencionesNormativas(texto).includes(esperada),
      `no cazó «${esperada}» en: ${texto}`,
    )
  }
})

// El texto de cada artículo del blog termina diciendo «Este artículo informa
// con carácter general…». Si eso contara como cita, el cepo pediría respaldar
// una norma que no existe y sería imposible publicar nada.
test('«este artículo» no es una cita legal', () => {
  assert.deepEqual(mencionesNormativas('Este artículo informa con carácter general y no sustituye…'), [])
  assert.deepEqual(mencionesNormativas('lee también el artículo sobre el preaviso'), [])
})

test('una cita sin respaldo se detecta', () => {
  // El artículo 38 de la LCS existe (peritación), pero NO está verificado en la
  // lista: citarlo sería afirmar algo que nadie ha comprobado.
  const sinRespaldo = citasNoRespaldadas('el artículo 38 obliga al perito a', ['lcs-22'])
  assert.deepEqual(sinRespaldo, ['articulo:38'])
})

test('una cita respaldada pasa', () => {
  assert.deepEqual(citasNoRespaldadas('el artículo 22 de la Ley 50/1980', ['lcs-22']), [])
})

test('un id inexistente en base no se resuelve en silencio', () => {
  assert.deepEqual(idsDesconocidos(['lcs-22', 'lcs-999']), ['lcs-999'])
  assert.deepEqual(idsDesconocidos(['lcs-22']), [])
})
