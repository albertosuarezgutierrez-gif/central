import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  esPreguntaPatrimonio, preguntaDe, fotoPatrimonioTg, contextoPatrimonioIA,
} from './patrimonio-chat.ts'
import type { ActivoPatrimonio, ResumenPatrimonio } from './patrimonio-resumen.ts'

const resumenBase: ResumenPatrimonio = {
  liquidez: 12345.67, broker: 40000, inmuebles: 1320000,
  pasivosConocidos: 195300, pasivoDesconocido: false,
  neto: 12345.67 + 40000 + 1320000 - 195300, parcial: false, faltan: [],
}

const activoValorado: ActivoPatrimonio = {
  id: 'act_duplex_center', nombre: 'Villasís — Dúplex Center', tipo: 'inmueble',
  tenencia: 'propiedad', uso: 'turistico', m2: 65.46, refCatastral: 'X',
  pctTitular: 100, pctConyuge: null, valorAdquisicion: 174650.9,
  hipotecaCapitalPendiente: null, hipotecaCuotaMensual: null,
  licenciaVut: true, licenciaVutNum: 'VFT/SE/01932',
  valoracion: { valor: 320000, enfoque: 'vut', fecha: '2026-08-20', fuente: 'alberto', metodo: null },
}

const activoSinValorar: ActivoPatrimonio = {
  ...activoValorado,
  id: 'act_monte_carmelo', nombre: 'Monte Carmelo 68', uso: 'vivienda_habitual',
  licenciaVut: null, licenciaVutNum: null, valoracion: null,
  hipotecaCuotaMensual: 772.86, hipotecaCapitalPendiente: null,
}

test('esPreguntaPatrimonio: comando y mención expresa sí; el resto del texto libre no', () => {
  assert.equal(esPreguntaPatrimonio('/patrimonio'), true)
  assert.equal(esPreguntaPatrimonio('/patrimonio ¿vendo el dúplex?'), true)
  assert.equal(esPreguntaPatrimonio('¿cómo va mi patrimonio?'), true)
  assert.equal(esPreguntaPatrimonio('hazme un análisis patrimonial'), true)
  // Lo que es del agente contable (o de otros comandos) NO se secuestra.
  assert.equal(esPreguntaPatrimonio('¿cuánto he gastado este mes en el súper?'), false)
  assert.equal(esPreguntaPatrimonio('/ig publica el reel'), false)
  assert.equal(esPreguntaPatrimonio('facturas pendientes'), false)
  // «patrimonial» dentro de otra palabra no dispara (\b).
  assert.equal(esPreguntaPatrimonio('expatrimoniote'), false)
})

test('preguntaDe: quita el comando y deja la pregunta ("" = foto)', () => {
  assert.equal(preguntaDe('/patrimonio'), '')
  assert.equal(preguntaDe('/patrimonio   ¿vendo?'), '¿vendo?')
  assert.equal(preguntaDe('¿cómo va mi patrimonio?'), '¿cómo va mi patrimonio?')
})

test('fotoPatrimonioTg: importes en formato español y activo sin valorar DECLARADO, no a 0', () => {
  const foto = fotoPatrimonioTg(resumenBase, [activoValorado, activoSinValorar], [], [])
  assert.ok(foto.includes('1.177.045,67€'), 'neto en formato español con miles')
  assert.ok(foto.includes('320.000,00€'))
  assert.ok(foto.includes('sin valorar todavía'))
  assert.ok(!foto.includes('0,00€\n· Monte Carmelo'), 'el sin-valorar jamás sale como 0')
})

test('fotoPatrimonioTg: pasivo sin cuantificar y recos=null (no leído ≠ no hay)', () => {
  const resumen = { ...resumenBase, pasivoDesconocido: true, parcial: true, faltan: ['Monte Carmelo 68: capital pendiente de la hipoteca sin dato'] }
  const foto = fotoPatrimonioTg(resumen, [activoSinValorar], null, ['dato pendiente'])
  assert.ok(foto.includes('deuda sin cuantificar'))
  assert.ok(foto.includes('No he podido leer las recomendaciones'))
  assert.ok(!foto.includes('pendientes de tu decisión'), 'con recos=null no se lista nada como si no hubiera')
  assert.ok(foto.includes('Faltan 1 dato(s)'))
})

test('fotoPatrimonioTg: recomendaciones vivas con su id (para decidir por botones)', () => {
  const foto = fotoPatrimonioTg(resumenBase, [activoValorado],
    [{ id: 7, fecha: '2026-08-24', titulo: 'Amortizar 10k de la hipoteca' }], [])
  assert.ok(foto.includes('#7 (2026-08-24) Amortizar 10k de la hipoteca'))
})

test('contextoPatrimonioIA: los NULL viajan como «sin dato», nunca como cifra', () => {
  const { system, user } = contextoPatrimonioIA(resumenBase, [activoSinValorar], [], '¿vendo?')
  assert.ok(system.includes('NUNCA lo inventes'))
  assert.ok(user.includes('capital pendiente sin dato'))
  assert.ok(user.includes('sin valoración de mercado'))
  assert.ok(user.includes('Pregunta de Alberto: ¿vendo?'))
  assert.ok(user.includes('Recomendaciones del CFO pendientes: ninguna registrada.'))
})

test('contextoPatrimonioIA: recos=null se declara como no-leído', () => {
  const { user } = contextoPatrimonioIA(resumenBase, [activoValorado], null, 'x')
  assert.ok(user.includes('no se han podido leer'))
})
