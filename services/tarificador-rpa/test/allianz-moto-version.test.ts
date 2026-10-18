// Allianz MOTO v0.7.0 (18/10/2026): la versión no bloquea. Regla pura de elección por similitud. Etiquetas con la FORMA del
// catálogo real (sin datos personales); códigos inventados.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allianzMoto, eleccionVersionMotoPorSimilitud, supuestosMoto, SUPUESTO_VERSION_SIMILITUD_MOTO } from '../src/adapters/allianz/auto.ts'
import { PREFIJO_SUPUESTOS, SUPUESTO_FAVORABLE_ANIOS, type FormularioAuto } from '@central/module-tarificacion'

const lista = (...etiquetas: string[]) => etiquetas.map((etiqueta, i) => ({ etiqueta, codigo: `C${i}` }))
const CATALOGO = lista('GS 30 YEARS 798C.C.', 'GS 798C.C.', 'GS 798C.C. (0B02)', 'GS ADVENTURE 798C.C.', 'GS 895C.C.', 'GS ADVENTURE 895C.C.')
const sel = (x: Partial<{ marca: string; modelo: string; descripcion: string; cilindradaCc: number | null }>) => ({ marca: 'BMW', modelo: 'F 800', cilindradaCc: 798, ...x })

test('versión casa con el riesgo y la cilindrada → UNA, sin supuesto', () => {
  const r = eleccionVersionMotoPorSimilitud(CATALOGO, sel({ descripcion: 'F 800 GS' }))
  assert.deepEqual(r, { eleccion: { codigo: 'C1', etiqueta: 'GS 798C.C.' }, supuesto: null })
  const adv = eleccionVersionMotoPorSimilitud(CATALOGO, sel({ descripcion: 'F 800 GS ADVENTURE' }))
  assert.equal(adv?.supuesto, `${SUPUESTO_VERSION_SIMILITUD_MOTO} (supuesto, había 2)`, 'GS y GS ADVENTURE casan: la primera, declarada')
  assert.equal(adv?.eleccion.etiqueta, 'GS 798C.C.')
})

test('la cilindrada desempata entre versiones que casan por texto', () => {
  const r = eleccionVersionMotoPorSimilitud(CATALOGO, sel({ descripcion: 'F 850 GS', cilindradaCc: 895 }))
  assert.deepEqual(r, { eleccion: { codigo: 'C4', etiqueta: 'GS 895C.C.' }, supuesto: null })
})

test('ninguna casa por texto → la primera de la cilindrada del riesgo (o de la lista), DECLARADA con el total', () => {
  const r = eleccionVersionMotoPorSimilitud(CATALOGO, sel({ modelo: 'OTRA' }))
  assert.deepEqual(r, { eleccion: { codigo: 'C0', etiqueta: 'GS 30 YEARS 798C.C.' }, supuesto: `${SUPUESTO_VERSION_SIMILITUD_MOTO} (supuesto, había 6)` })
  const sinCc = eleccionVersionMotoPorSimilitud(CATALOGO, sel({ modelo: 'OTRA', cilindradaCc: 1200 }))
  assert.equal(sinCc?.eleccion.codigo, 'C0')
})

test('0 o 1 opciones: no hay nada que elegir', () => {
  assert.equal(eleccionVersionMotoPorSimilitud(lista('GS 798C.C.'), sel({})), null)
  assert.equal(eleccionVersionMotoPorSimilitud([], sel({})), null)
})

test('el supuesto de versión y los antecedentes favorables van en UN aviso; la moto es la 0.7.0', () => {
  const f = { aniosAseguradoAnterior: null, siniestrosUltimos5Anios: 0 } as unknown as FormularioAuto
  assert.equal(supuestosMoto('versión elegida por similitud (supuesto, había 2)', f), `${PREFIJO_SUPUESTOS}versión elegida por similitud (supuesto, había 2), ${SUPUESTO_FAVORABLE_ANIOS}.`)
  assert.equal(supuestosMoto(null, { aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0 } as FormularioAuto), null)
  assert.equal(allianzMoto.version, '0.7.0')
})
