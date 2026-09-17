import { test } from 'node:test'
import assert from 'node:assert/strict'
import { candidatosRamo, slugDeRuta } from './agente-decidir.ts'
import type { ConsultaSerp } from './tipos.ts'

test('slugDeRuta extrae el slug de /seguros/<slug>, null en cualquier otra forma', () => {
  assert.equal(slugDeRuta('/seguros/hogar'), 'hogar')
  assert.equal(slugDeRuta('/'), null)
  assert.equal(slugDeRuta('/quienes-somos'), null)
  assert.equal(slugDeRuta(null), null)
})

const RAMOS_EDITABLES = ['hogar', 'auto', 'comunidades'] as const

function consulta(pagina: string | null, propia: number | null): ConsultaSerp {
  return { consulta: 'x', pagina, top: [], propia }
}

test('candidatosRamo elige ramos sin página en el top-10, en orden de aparición', () => {
  const consultas = [
    consulta('/', null), // no es un ramo editable (home)
    consulta('/seguros/hogar', null), // candidato
    consulta('/seguros/auto', 3), // ya está en el top-10: se descarta
    consulta('/seguros/comunidades', null), // candidato
  ]
  const out = candidatosRamo(consultas, RAMOS_EDITABLES, [], new Date('2026-09-15'), 5)
  assert.deepEqual(out.map((c) => c.slug), ['hogar', 'comunidades'])
})

test('candidatosRamo respeta el máximo por pasada', () => {
  const consultas = [consulta('/seguros/hogar', null), consulta('/seguros/comunidades', null)]
  const out = candidatosRamo(consultas, RAMOS_EDITABLES, [], new Date('2026-09-15'), 1)
  assert.equal(out.length, 1)
})

test('candidatosRamo excluye un slug en cooldown', () => {
  const consultas = [consulta('/seguros/hogar', null)]
  const recientes = [{ ruta: 'hogar', creadoEn: '2026-09-14T00:00:00Z' }]
  const out = candidatosRamo(consultas, RAMOS_EDITABLES, recientes, new Date('2026-09-15'), 5)
  assert.deepEqual(out, [])
})

test('candidatosRamo no repite el mismo slug dos veces (dos consultas → misma página)', () => {
  const consultas = [consulta('/seguros/hogar', null), consulta('/seguros/hogar', null)]
  const out = candidatosRamo(consultas, RAMOS_EDITABLES, [], new Date('2026-09-15'), 5)
  assert.equal(out.length, 1)
})
