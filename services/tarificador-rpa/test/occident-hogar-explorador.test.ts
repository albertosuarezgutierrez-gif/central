// Occident Hogar conectado al explorador (14/10/2026): entrada en la lista cerrada, portal con credencial propia y
// el trabajo de una compañía/ramo que no casa se rechaza. Puro: sin navegador.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ENTRADAS_EXPLORACION, esEntradaExploracion } from '@central/module-tarificacion'
import { PORTALES_EXPLORACION, problemaTrabajoExploracion } from '../src/explorador.ts'
import { HOSTS_PERMITIDOS } from '../src/adapters/occident/guarda.ts'
import { comprobarSrcIframeHogar } from '../src/adapters/occident/mapa.ts'
import type { Trabajo } from '../src/api.ts'

const trabajo = (compania: string, ramo: string, entrada: string) => ({ id: 't', compania, ramo, exploracion: { entrada, conDatosReales: false } }) as unknown as Trabajo

test('occident:productos:hogar está en la lista cerrada y sin avances autorizados', () => {
  assert.ok(esEntradaExploracion('occident:productos:hogar'))
  const e = ENTRADAS_EXPLORACION['occident:productos:hogar']!
  assert.equal(e.compania, 'occident')
  assert.equal(e.ramo, 'hogar')
  assert.deepEqual([...e.avancesAutorizados], [])
})

test('portal de exploración de Occident: credencial OCCIDENT_PORTAL; el trabajo casa; otra compañía/ramo no', () => {
  assert.equal(PORTALES_EXPLORACION.occident?.credencial, 'OCCIDENT_PORTAL')
  assert.equal(problemaTrabajoExploracion(trabajo('occident', 'hogar', 'occident:productos:hogar')), null)
  assert.match(problemaTrabajoExploracion(trabajo('occident', 'auto', 'occident:productos:hogar')) ?? '', /no casa/)
  assert.match(problemaTrabajoExploracion(trabajo('occident', 'hogar', 'occident:productos:comunidades')) ?? '', /desconocida/)
})

test('host fuera de la lista blanca falla cerrado y la lista de Occident no se ha ampliado', () => {
  assert.throws(() => comprobarSrcIframeHogar('https://otro-host.example.com/form', 'https://portaloccident.gco.global/'), /lista blanca/)
  assert.equal(HOSTS_PERMITIDOS.length, 3)
})
