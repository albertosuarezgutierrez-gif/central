// Allianz MOTO v0.7.1/0.7.2 (19/10/2026): regla pura inequívoca → elige; ambigua → `ambigua` y el flujo aplica la EQUIVALENCIA (v0.7.2: equivalentes → elige sola y declara; materiales → ErrorEleccionVersion). Etiquetas con la FORMA del
// catálogo real (sin datos personales); códigos inventados.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allianzMoto, eleccionVersionMotoPorSimilitud, ErrorEleccionVersion, supuestosMoto, versionAutomaticaAllianz } from '../src/adapters/allianz/auto.ts'
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

test('el supuesto de versión y los antecedentes favorables van en UN aviso; la moto es la 0.7.6', () => {
  const f = { aniosAseguradoAnterior: null, siniestrosUltimos5Anios: 0 } as unknown as FormularioAuto
  assert.equal(supuestosMoto('versión elegida por similitud (supuesto, había 2)', f), `${PREFIJO_SUPUESTOS}versión elegida por similitud (supuesto, había 2), ${SUPUESTO_FAVORABLE_ANIOS}.`)
  assert.equal(supuestosMoto(null, { aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0 } as FormularioAuto), null)
  assert.equal(allianzMoto.version, '0.7.6')
})

test('v0.7.2 · ambigua con candidatas EQUIVALENTES (misma cilindrada) → se elige SOLA la primera y se declara en el aviso de supuestos', () => {
  const adv = eleccionVersionMotoPorSimilitud(CATALOGO, sel({ descripcion: 'F 800 GS ADVENTURE' }))
  assert.equal(adv?.tipo, 'ambigua')
  if (adv?.tipo !== 'ambigua') return
  const r = versionAutomaticaAllianz(adv.opciones, { seleccionVehiculo: sel({ descripcion: 'F 800 GS ADVENTURE' }) })
  assert.equal(r.indice, 0)
  assert.deepEqual(r.eleccion, { codigo: 'C1', etiqueta: 'GS 798C.C.' })
  assert.equal(r.supuesto, 'Versión elegida automáticamente: GS 798C.C. (había 2 equivalentes; revisar en la emisión)')
  const f = { aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0 } as FormularioAuto
  assert.ok(supuestosMoto(r.supuesto, f)!.startsWith(`${PREFIJO_SUPUESTOS}Versión elegida automáticamente: GS 798C.C. (había 2 equivalentes; revisar en la emisión)`))
})

test('v0.7.2 · cilindradas MATERIALMENTE distintas (798 y 895 cc) o ninguna compatible con la del riesgo → ErrorEleccionVersion con las candidatas', () => {
  const mixta = lista('GS 798C.C.', 'GS 895C.C.')
  assert.throws(() => versionAutomaticaAllianz(mixta, {}), (e: unknown) => e instanceof ErrorEleccionVersion && e.opciones.length === 2)
  assert.throws(() => versionAutomaticaAllianz(CATALOGO, { seleccionVehiculo: sel({ cilindradaCc: 1200 }) }), (e: unknown) => e instanceof ErrorEleccionVersion && e.opciones.length === 6)
  // Con la cilindrada del riesgo, solo cuenta la compatible: 895 → la de 895 cc.
  const r = versionAutomaticaAllianz(mixta, { seleccionVehiculo: sel({ cilindradaCc: 895 }) })
  assert.deepEqual(r.eleccion, { codigo: 'C1', etiqueta: 'GS 895C.C.' })
})

test('v0.7.2 · la elección de la bandeja se usa EXACTA y sin supuesto; si no casa con UNA, se vuelve a preguntar', () => {
  const r = versionAutomaticaAllianz(CATALOGO, { eleccionVersion: { codigo: 'C3', etiqueta: 'GS ADVENTURE 798C.C.' } })
  assert.equal(r.indice, 3)
  assert.equal(r.supuesto, null)
  assert.throws(() => versionAutomaticaAllianz(CATALOGO, { eleccionVersion: { codigo: 'NO', etiqueta: null } }), ErrorEleccionVersion)
})
