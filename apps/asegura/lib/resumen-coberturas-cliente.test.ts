// Cepos del resumen de coberturas para el borrador al cliente (26/10/2026). Datos SINTÉTICOS.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararOfertas, type OfertaNormalizada } from '@central/module-seguros'
import { conResumenCoberturas, listaEs, resumenCoberturasCliente } from './resumen-coberturas-cliente.ts'

const v = (estado: 'incluida' | 'excluida' | null) => ({ estado, capital: null, limite: null, franquicia: null })
const oferta = (id: string, compania: string, prima: number | null, g: Record<string, ReturnType<typeof v>>): OfertaNormalizada =>
  ({ id, rol: 'oferta', compania, producto: null, primaTotal: prima, primaNeta: null, garantias: g })
const cmp = (os: OfertaNormalizada[]) => compararOfertas({ ramo: 'comunidades', ofertas: os, superficieM2: null })

test('la más barata no incluye X; la intermedia sí; la más cara añade Y', () => {
  const r = resumenCoberturasCliente(cmp([
    oferta('a', 'Alfa', 300, { defensa_juridica: v('excluida'), danos_agua: v('excluida') }),
    oferta('b', 'Beta', 400, { defensa_juridica: v('incluida'), danos_agua: v('excluida') }),
    oferta('c', 'Gama', 500, { defensa_juridica: v('incluida'), danos_agua: v('incluida') }),
  ]))!
  assert.equal(r.length, 3)
  assert.match(r[0], /^La más barata \(Alfa, 300,00€\) no incluye .*(defensa|daños)/i)
  assert.match(r[1], /^La intermedia \(Beta, 400,00€\) sí incluye/)
  assert.match(r[2], /^La más cara \(Gama, 500,00€\) añade/)
})

test('con dos ofertas: la más cara «sí incluye»', () => {
  const r = resumenCoberturasCliente(cmp([
    oferta('a', 'Alfa', 300, { defensa_juridica: v('excluida') }),
    oferta('c', 'Gama', 500, { defensa_juridica: v('incluida') }),
  ]))!
  assert.equal(r.length, 2)
  assert.match(r[1], /^La más cara \(Gama, 500,00€\) sí incluye/)
})

test('«no se sabe» no es «no incluye»: sin diferencias probadas se omite el resumen', () => {
  assert.equal(resumenCoberturasCliente(cmp([
    oferta('a', 'Alfa', 300, {}),
    oferta('c', 'Gama', 500, { defensa_juridica: v('incluida') }),
  ])), null)
})

test('sin 2 ofertas con prima anual, o sin coberturas, no inventa', () => {
  assert.equal(resumenCoberturasCliente(cmp([oferta('a', 'Alfa', 300, { defensa_juridica: v('excluida') })])), null)
  assert.equal(resumenCoberturasCliente(cmp([oferta('a', 'Alfa', null, { defensa_juridica: v('excluida') }), oferta('c', 'Gama', 500, { defensa_juridica: v('incluida') })])), null)
})

test('listaEs y conResumenCoberturas (no se repite, null no cambia nada)', () => {
  assert.equal(listaEs(['a', 'b', 'c', 'd', 'e']), 'a, b y c y 2 más')
  assert.equal(listaEs(['a', 'b']), 'a y b')
  assert.equal(conResumenCoberturas('Texto.', null), 'Texto.')
  const una = conResumenCoberturas('Texto.', ['L1', 'L2'])
  assert.equal(una, 'Texto.\n\nL1\nL2')
  assert.equal(conResumenCoberturas(una, ['L1', 'L2']), una)
})
