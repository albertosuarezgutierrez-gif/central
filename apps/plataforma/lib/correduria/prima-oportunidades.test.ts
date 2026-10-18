import test from 'node:test'
import assert from 'node:assert/strict'
import { primaDeOportunidad, subtituloOportunidades } from './prima-oportunidades.ts'
import type { SeguroCliente } from './seguros-cliente.ts'
import type { PolizaDeclaradaFicha, PolizaFicha } from '../ficha-asegura'
import type { OportunidadDeCliente } from '../seguimiento-asegura'

const pol = (id: string, prima: number | null, oportunidad: OportunidadDeCliente | null = null): SeguroCliente =>
  ({ clase: 'poliza', id, poliza: { id, prima } as PolizaFicha, oportunidad })
const opo = (id: string, prima: number | null): SeguroCliente =>
  ({ clase: 'oportunidad', id, oportunidad: { id, prima } as OportunidadDeCliente })
const dec = (id: string, primaAnual: number | null): SeguroCliente =>
  ({ clase: 'declarada', id, declarada: { id, primaAnual } as PolizaDeclaradaFicha })

test('sin leer las oportunidades no se dice nada; sin ninguna, «ninguna abierta»', () => {
  assert.equal(subtituloOportunidades(null), null)
  assert.equal(subtituloOportunidades([]), 'ninguna abierta')
})

test('ninguna con prima: solo «N abiertas», sin inventar 0', () => {
  assert.equal(subtituloOportunidades([opo('a', null)]), '1 abierta')
  assert.equal(subtituloOportunidades([opo('a', null), pol('b', null), dec('c', 0)]), '3 abiertas')
})

test('todas con prima: «~X€/año» con formato español (miles con punto, coma decimal)', () => {
  assert.equal(subtituloOportunidades([opo('a', 1500.5), pol('b', 662), dec('c', 0.0 + 0.01)]), '3 abiertas · ~2.162,51€/año')
})

test('algunas con prima y otras no: «≥X€/año» (suelo de lo conocido)', () => {
  assert.equal(subtituloOportunidades([opo('a', 300), pol('b', null), dec('c', 200)]), '3 abiertas · ≥500,00€/año')
})

test('la prima de la oportunidad anotada manda sobre la de la póliza; un 0 no es dato', () => {
  const o = { id: 'o', prima: 410 } as OportunidadDeCliente
  assert.equal(primaDeOportunidad(pol('p', 300, o)), 410)
  assert.equal(primaDeOportunidad(pol('p', 300, { id: 'o', prima: null } as OportunidadDeCliente)), 300)
  assert.equal(primaDeOportunidad(pol('p', 0)), null)
  assert.equal(primaDeOportunidad(opo('x', -5)), null)
})
