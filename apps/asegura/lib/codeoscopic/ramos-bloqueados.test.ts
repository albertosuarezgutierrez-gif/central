import { test } from 'node:test'
import assert from 'node:assert/strict'
import { motivoRamoBloqueado } from './ramos-bloqueados.ts'
import { readFileSync } from 'node:fs'

test('motivoRamoBloqueado: vida, salud y decesos se cortan por el ramo del contexto', () => {
  for (const ramo of ['vida', 'salud', 'decesos']) {
    const m = motivoRamoBloqueado(ramo, {})
    assert.ok(m, ramo)
    assert.match(m!, /0,00€/)
  }
})

test('motivoRamoBloqueado: también por la línea del cuerpo, aunque falte el contexto', () => {
  for (const id of ['TermLife', 'Health', 'Burial']) {
    assert.ok(motivoRamoBloqueado(undefined, { insuranceLine: { id } }), id)
  }
})

test('motivoRamoBloqueado: auto, moto y hogar siguen pasando', () => {
  assert.equal(motivoRamoBloqueado('auto', { insuranceLine: { id: 'Car' } }), null)
  assert.equal(motivoRamoBloqueado('moto', { insuranceLine: { id: 'Motorcycle' } }), null)
  assert.equal(motivoRamoBloqueado('hogar', { insuranceLine: { id: 'Home' } }), null)
  assert.equal(motivoRamoBloqueado(undefined, null), null)
})

// `cotizar.ts` arrastra la BD y no se importa en `node --test`: se lee el
// fuente. El cerrojo tiene que ir DESPUÉS de la simulación (gratis) y ANTES
// de la config, el libro y la reserva, que es donde empieza el camino al cargo.
test('cotizar: el cerrojo está entre la simulación y el primer paso que puede cobrar', () => {
  const fuente = readFileSync(new URL('./cotizar.ts', import.meta.url), 'utf8')
  const cuerpo = fuente.slice(fuente.indexOf('export async function cotizar('))
  const simulacion = cuerpo.indexOf('if (simulacionActiva(env))')
  const cerrojo = cuerpo.indexOf('motivoRamoBloqueado(p.contexto?.ramo, p.cuerpo)')
  const config = cuerpo.indexOf('resolverConfig(env)')
  assert.ok(simulacion >= 0 && cerrojo >= 0 && config >= 0, 'faltan los marcadores en cotizar.ts')
  assert.ok(simulacion < cerrojo && cerrojo < config, 'el cerrojo no está entre la simulación y la config')
  assert.match(cuerpo.slice(cerrojo, config), /return \{ ok: false, razon: 'ramo-bloqueado'/)
})
