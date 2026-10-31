// Allianz Turismos 0.6.29 (26/10/2026): tras «Guardar presupuesto» el portal ofrece «Descargar propuesta» y la lista blanca de la descarga del PDF solo
// conocía proyecto/presupuesto/oferta. «propuesta» vale SOLO junto a descargar/imprimir/pdf; la lista negra (emitir/contratar/grabar/pagar/firmar/
// formalizar/enviar…) sigue mandando. Textos sintéticos.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decidirBotonDescargaProyecto, esBotonDescargaProyecto, rechazoOcultoDescargaProyecto } from '../src/guard.ts'
import { allianzAuto } from '../src/adapters/allianz/auto.ts'

test('Allianz 0.6.35 · versión', () => assert.equal(allianzAuto.version, '0.6.37'))

test('«Descargar propuesta» (y variantes con verbo de descarga) se acepta, con y sin proyecto guardado', () => {
  for (const t of ['Descargar propuesta', 'DESCARGAR PROPUESTA', 'Imprimir propuesta', 'Descargar PDF de la propuesta', 'Ver propuesta en PDF']) {
    for (const g of [true, false]) assert.equal(esBotonDescargaProyecto([t], 'allianz', g), true, `${t} guardado=${g}`)
  }
})

test('«propuesta» sin verbo de descarga, con «documento» suelto o junto a emitir/contratar/enviar/firmar/pagar NO se acepta', () => {
  for (const t of ['Propuesta', 'Nueva propuesta', 'Documento propuesta', 'Contratar propuesta', 'Descargar y contratar propuesta', 'Enviar propuesta', 'Enviar propuesta por email', 'Emitir propuesta', 'Firmar propuesta', 'Pagar propuesta', 'Formalizar propuesta', 'Grabar propuesta', 'Imprimir propuesta al cliente']) {
    for (const g of [true, false]) assert.equal(esBotonDescargaProyecto([t], 'allianz', g), false, `${t} guardado=${g}`)
  }
  // Un atributo interno de emisión tumba un rótulo bueno, y el motivo nombra SOLO la palabra que casó (nunca el valor).
  assert.equal(esBotonDescargaProyecto(['Descargar propuesta', null, null, null, 'btnEmitirPropuesta'], 'allianz', true), false)
  assert.equal(esBotonDescargaProyecto(['Descargar propuesta', null, null, null, 'descargar_propuesta'], 'allianz', true), true)
  assert.equal(rechazoOcultoDescargaProyecto(['Descargar propuesta', null, null, null, 'btnEmitirPropuesta'], 'allianz', true), 'emit')
  assert.equal(rechazoOcultoDescargaProyecto(['Descargar propuesta'], 'allianz', true), null)
})

test('decidir: entre «GUARDAR PRESUPUESTO», «Descargar propuesta» y «ePac» elige la propuesta; si un atributo la bloquea, el motivo lo dice', () => {
  const c = (t: string, ...ocultos: (string | null)[]) => ({ desc: [t, null, null, null, ...ocultos], visible: true, habilitado: true })
  const d = decidirBotonDescargaProyecto([c('GUARDAR PRESUPUESTO'), c('Descargar propuesta'), c('ePac')], 'allianz', true)
  assert.deepEqual(d, { indice: 1 })
  const bloqueado = decidirBotonDescargaProyecto([c('GUARDAR PRESUPUESTO'), c('Descargar propuesta', 'btnEmitir'), c('ePac')], 'allianz', true)
  assert.ok('motivo' in bloqueado && /atributo interno casa con la lista negra: «emit»/.test(bloqueado.motivo), JSON.stringify(bloqueado))
})
