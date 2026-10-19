// Allianz MOTO v0.7.1 (19/10/2026): sin «la primera». Regla pura: inequívoca → elige; ambigua → `ambigua` (el flujo lanza ErrorEleccionVersion). Etiquetas con la FORMA del
// catálogo real (sin datos personales); códigos inventados.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allianzMoto, eleccionVersionMotoPorSimilitud, supuestosMoto } from '../src/adapters/allianz/auto.ts'
import { PREFIJO_SUPUESTOS, SUPUESTO_FAVORABLE_ANIOS, type FormularioAuto } from '@central/module-tarificacion'

const lista = (...etiquetas: string[]) => etiquetas.map((etiqueta, i) => ({ etiqueta, codigo: `C${i}` }))
const CATALOGO = lista('GS 30 YEARS 798C.C.', 'GS 798C.C.', 'GS 798C.C. (0B02)', 'GS ADVENTURE 798C.C.', 'GS 895C.C.', 'GS ADVENTURE 895C.C.')
const sel = (x: Partial<{ marca: string; modelo: string; descripcion: string; cilindradaCc: number | null }>) => ({ marca: 'BMW', modelo: 'F 800', cilindradaCc: 798, ...x })

test('versión casa con el riesgo y la cilindrada → UNA, sin supuesto; si casan varias → PREGUNTA con ESAS (nunca la primera)', () => {
  const r = eleccionVersionMotoPorSimilitud(CATALOGO, sel({ descripcion: 'F 800 GS' }))
  assert.deepEqual(r, { tipo: 'unica', eleccion: { codigo: 'C1', etiqueta: 'GS 798C.C.' } })
  const adv = eleccionVersionMotoPorSimilitud(CATALOGO, sel({ descripcion: 'F 800 GS ADVENTURE' }))
  assert.equal(adv?.tipo, 'ambigua', 'GS y GS ADVENTURE casan: no se elige')
  assert.deepEqual(adv?.tipo === 'ambigua' ? adv.opciones.map((o) => o.etiqueta) : null, ['GS 798C.C.', 'GS ADVENTURE 798C.C.'])
})

test('la cilindrada desempata entre versiones que casan por texto', () => {
  const r = eleccionVersionMotoPorSimilitud(CATALOGO, sel({ descripcion: 'F 850 GS', cilindradaCc: 895 }))
  assert.deepEqual(r, { tipo: 'unica', eleccion: { codigo: 'C4', etiqueta: 'GS 895C.C.' } })
})

test('ninguna casa por texto → la cilindrada solo vale si deja UNA; si no, PREGUNTA con todas (nunca la primera)', () => {
  const r = eleccionVersionMotoPorSimilitud(CATALOGO, sel({ modelo: 'OTRA' }))
  assert.equal(r?.tipo, 'ambigua')
  assert.equal(r?.tipo === 'ambigua' ? r.opciones.length : 0, 6)
  const sinCc = eleccionVersionMotoPorSimilitud(CATALOGO, sel({ modelo: 'OTRA', cilindradaCc: 1200 }))
  assert.equal(sinCc?.tipo, 'ambigua')
  const unaCc = eleccionVersionMotoPorSimilitud(lista('X 650C.C.', 'X 125C.C.', 'Y 900C.C.'), sel({ modelo: 'OTRA', cilindradaCc: 125 }))
  assert.deepEqual(unaCc, { tipo: 'unica', eleccion: { codigo: 'C1', etiqueta: 'X 125C.C.' } })
})

test('0 o 1 opciones: no hay nada que elegir', () => {
  assert.equal(eleccionVersionMotoPorSimilitud(lista('GS 798C.C.'), sel({})), null)
  assert.equal(eleccionVersionMotoPorSimilitud([], sel({})), null)
})

test('el supuesto de versión y los antecedentes favorables van en UN aviso; la moto es la 0.7.1', () => {
  const f = { aniosAseguradoAnterior: null, siniestrosUltimos5Anios: 0 } as unknown as FormularioAuto
  assert.equal(supuestosMoto('versión elegida por similitud (supuesto, había 2)', f), `${PREFIJO_SUPUESTOS}versión elegida por similitud (supuesto, había 2), ${SUPUESTO_FAVORABLE_ANIOS}.`)
  assert.equal(supuestosMoto(null, { aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0 } as FormularioAuto), null)
  assert.equal(allianzMoto.version, '0.7.1')
})
