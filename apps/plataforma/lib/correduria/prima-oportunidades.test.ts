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

test('la prima de una póliza fraccionada YA es anual (EIAC): no se multiplica por su fraccionamiento', () => {
  // semestral: prima 255,22 anual y recibos de 128,56 (medido en seguros.polizas, 18/10/2026).
  const semestral = { clase: 'poliza', id: 'p', poliza: { id: 'p', prima: 255.22, fraccionamiento: 'semestral' } as PolizaFicha, oportunidad: null } as SeguroCliente
  const mensual = { clase: 'poliza', id: 'm', poliza: { id: 'm', prima: 600, fraccionamiento: 'mensual' } as PolizaFicha, oportunidad: null } as SeguroCliente
  assert.equal(primaDeOportunidad(semestral), 255.22)
  assert.equal(primaDeOportunidad(mensual), 600)
  assert.equal(subtituloOportunidades([semestral, mensual]), '2 abiertas · ~855,22€/año')
})

test('una prima de periodicidad desconocida o inservible no suma como dato: cuenta para «≥»', () => {
  const rara = [NaN, Infinity, '300', undefined] as unknown[]
  for (const v of rara) assert.equal(primaDeOportunidad(opo('x', v as number)), null)
  assert.equal(subtituloOportunidades([opo('a', 400), opo('b', NaN)]), '2 abiertas · ≥400,00€/año')
})

test('una prima anotada 0 o inválida en la oportunidad no tapa la de la póliza', () => {
  for (const mala of [0, -3, NaN]) {
    assert.equal(primaDeOportunidad(pol('p', 300, { id: 'o', prima: mala } as OportunidadDeCliente)), 300)
  }
  assert.equal(primaDeOportunidad(pol('p', 0, { id: 'o', prima: 0 } as OportunidadDeCliente)), null)
})
