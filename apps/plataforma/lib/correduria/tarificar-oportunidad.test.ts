import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RAMOS_RIESGO } from './registro-ramos.ts'
import { comoSeTarifica, destinoTarificar } from './tarificar-oportunidad.ts'
import { ramoTarificable } from '@central/module-seguros'
import { ramoVariante } from '../../app/(usuario)/correduria/oportunidad/[id]/variante.ts'

test('con seguimiento abierto, los seis ramos con Avant2: a la propia oportunidad, bloque «Pedir precio» (nunca cotiza)', () => {
  for (const ramo of ['auto', 'moto', 'hogar', 'decesos', 'salud', 'vida']) {
    const d = destinoTarificar({ ramo, tomadorId: 'c1', oportunidadId: 'op1', polizaId: 'p1' })
    assert.deepEqual(d, { tipo: 'enlace', href: '/correduria/oportunidad/op1#pedir-precio' }, ramo)
  }
})

test('13/10/2026: ya ningún ramo con Avant2 manda a su pantalla aparte …-nuevo?oportunidad= (todos embebidos)', () => {
  for (const ramo of ['vida', 'salud', 'decesos']) {
    const d = destinoTarificar({ ramo, tomadorId: 'c1', oportunidadId: 'op1', polizaId: 'p1' })
    assert.ok(d.tipo === 'enlace' && !d.href.includes('-nuevo?oportunidad='), ramo)
  }
})

test('póliza sin seguimiento: primero se abre (de-poliza) y luego se navega', () => {
  assert.deepEqual(destinoTarificar({ ramo: 'hogar', tomadorId: 'c1', oportunidadId: null, polizaId: 'p1' }), { tipo: 'abrir-y-enlazar', polizaId: 'p1', como: { tipo: 'avant2', ramo: 'hogar' } })
})

test('22/10/2026: comunidades (bot RPA de Allianz) SÍ se tarifica: a los presupuestos de compañías de la oportunidad', () => {
  assert.deepEqual(comoSeTarifica('comunidades'), { tipo: 'bots', companias: ['allianz'] })
  assert.deepEqual(destinoTarificar({ ramo: 'comunidades', tomadorId: 'c1', oportunidadId: 'op1', polizaId: null }), { tipo: 'enlace', href: '/correduria/oportunidad/op1#presupuestos' })
})

test('🪤 UNA sola regla: Avant2 ⇔ cotizador del ramo Y tarifa en la API (module-seguros); los seis y solo los seis', () => {
  const avant2 = RAMOS_RIESGO.filter((r) => comoSeTarifica(r).tipo === 'avant2')
  assert.deepEqual(avant2, ['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos'])
  for (const r of [...RAMOS_RIESGO, 'accidentes', 'responsabilidad_civil', 'empresas']) {
    assert.equal(comoSeTarifica(r).tipo === 'avant2', ramoVariante(r) !== null && ramoTarificable(r), r)
  }
})

test('ramo sin tarifa ni bot o sin ramo: no, con motivo (el botón no se pinta)', () => {
  for (const ramo of ['otros', 'comercio', 'rc', 'responsabilidad_civil', 'accidentes', null]) {
    const d = destinoTarificar({ ramo, tomadorId: 'c1', oportunidadId: 'op1', polizaId: 'p1' })
    assert.equal(d.tipo, 'no', String(ramo))
    if (d.tipo === 'no') assert.ok(d.motivo.length > 0)
  }
})

test('sin oportunidad ni póliza no hay nada que abrir', () => {
  assert.equal(destinoTarificar({ ramo: 'auto', tomadorId: 'c1', oportunidadId: null, polizaId: null }).tipo, 'no')
})

test('🪤 el botón «Tarificar» NO se pinta cuando no se tarifica (ni deshabilitado): la ficha da «Ver riesgo →»', async () => {
  const { readFileSync } = await import('node:fs')
  const raiz = new URL('../../app/(usuario)/correduria/cliente/[id]/', import.meta.url)
  const boton = readFileSync(new URL('TarificarOportunidad.tsx', raiz), 'utf8')
  assert.match(boton, /if \(destino\.tipo === 'no'\) return null/)
  assert.doesNotMatch(boton, /disabled aria-describedby/, 'nada de botón deshabilitado con motivo')
  const ficha = readFileSync(new URL('OportunidadesCliente.tsx', raiz), 'utf8')
  assert.match(ficha, /<TarificarOportunidad tomadorId=\{o\.clienteId\} destino=\{tarificar\} \/>/)
  assert.match(ficha, /btnStyle\(tarificar\.tipo === 'no' \? 'primario' : 'sutil', 'sm'\)[^\n]*Ver riesgo →/)
})
