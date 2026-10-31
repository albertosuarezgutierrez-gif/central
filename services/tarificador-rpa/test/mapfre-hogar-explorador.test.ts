// Mapfre Hogar conectado al explorador (31/10/2026, «un bot por compañía»): entrada en la lista cerrada, recorrido de entrada
// por ramo EXPLÍCITO (hogar ya no cae por defecto en Turismos y Motos) y el trabajo de otro ramo se rechaza. Puro: sin navegador.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ENTRADAS_EXPLORACION, esEntradaExploracion } from '@central/module-tarificacion'
import { destinoEntradaMapfre, problemaTrabajoExploracion } from '../src/explorador.ts'
import { ErrorTarificador } from '../src/errores.ts'
import { ENLACES_ENTRADA_AUTORIZADOS } from '../src/guard.ts'
import { ENLACE_TARIFICACION_RAPIDA } from '../src/adapters/mapfre/entrada.ts'
import { OPCION_PATRIMONIALES, PESTANA_NUEVA_PRODUCCION } from '../src/adapters/mapfre/hogar.ts'
import type { Trabajo } from '../src/api.ts'

const E = 'mapfre:patrimoniales:hogar'
const trabajo = (compania: string, ramo: string, entrada: string) => ({ id: 't', compania, ramo, exploracion: { entrada, conDatosReales: false } }) as unknown as Trabajo

test('mapfre:patrimoniales:hogar: en la lista cerrada, ramo hogar, menú = el del borrador mapfre/hogar.ts, sin avances ni tolerancias', () => {
  assert.ok(esEntradaExploracion(E))
  const e = ENTRADAS_EXPLORACION[E]!
  assert.equal(e.compania, 'mapfre')
  assert.equal(e.ramo, 'hogar')
  assert.equal(e.pestana, PESTANA_NUEVA_PRODUCCION)
  assert.equal(e.productoMenu, OPCION_PATRIMONIALES)
  assert.deepEqual([...e.avancesAutorizados], [])
  assert.equal(e.tomadorMediador, undefined)
  assert.equal(e.rutasAppTolerables, undefined)
  assert.equal(e.neutralizacionesOnclick, undefined)
})

test('el enlace «Tarificación y emisión rápida» de Hogar pasa por la puerta exacta del guard de Mapfre', () => {
  assert.ok(ENLACES_ENTRADA_AUTORIZADOS.mapfre!.includes(ENLACE_TARIFICACION_RAPIDA))
})

test('destinoEntradaMapfre: hogar → hogar (no Turismos y Motos); auto/moto → auto; patinete → patinete; otro ramo LANZA', () => {
  assert.equal(destinoEntradaMapfre('hogar'), 'hogar')
  assert.equal(destinoEntradaMapfre('auto'), 'auto')
  assert.equal(destinoEntradaMapfre('moto'), 'auto')
  assert.equal(destinoEntradaMapfre('patinete'), 'patinete')
  for (const r of ['comunidades', 'comercio', '', 'Hogar']) assert.throws(() => destinoEntradaMapfre(r), ErrorTarificador, r)
  // Toda entrada de Mapfre de la lista cerrada tiene recorrido.
  for (const [k, e] of Object.entries(ENTRADAS_EXPLORACION)) if (e.compania === 'mapfre') assert.doesNotThrow(() => destinoEntradaMapfre(e.ramo), k)
})

test('trabajo de exploración Mapfre Hogar: casa con mapfre/hogar; con otro ramo no', () => {
  assert.equal(problemaTrabajoExploracion(trabajo('mapfre', 'hogar', E)), null)
  assert.match(problemaTrabajoExploracion(trabajo('mapfre', 'auto', E)) ?? '', /no casa/)
})
