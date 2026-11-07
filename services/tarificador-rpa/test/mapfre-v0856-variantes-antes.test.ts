// Mapfre auto v0.8.56 · las variantes «BASICar» se leían DESPUÉS de «Generar Proyecto», cuando Coberturas ya no pinta los selectores
// («selector ausente o no visible»). Fixture SINTÉTICA (sin PII): el selector se oculta al generar el proyecto.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { mapfreAuto, tarificarVariantesComercialesMapfre, type ProductoVistoMapfre } from '../src/adapters/mapfre/auto.ts'

test('v0.8.56 · versión', () => assert.equal(mapfreAuto.version, '0.8.61'))

const OPC = ['TERCEROS', 'TERCEROS AMPLIADO', 'TODO RIESGO', 'BASICar TERCEROS AMPLIADO', 'BASICar TODO RIESGO']
const vistos = (): ProductoVistoMapfre[] => [
  { producto: 'TERCEROS', prima: 238.37, deshabilitado: false, texto: '', comercial: { opciones: OPC, seleccionada: 'TERCEROS' } },
  { producto: 'TERCEROS AMPLIADO', prima: 355.07, deshabilitado: false, texto: '', comercial: { opciones: OPC, seleccionada: 'TERCEROS AMPLIADO' } },
]

/** Simula el portal: con el proyecto generado el selector deja de verse (mismo mensaje que el guard). */
const portal = (proyectoGenerado: boolean) => async (_p: unknown, i: number, opcion: string) => {
  if (proyectoGenerado) throw new Error('selector ausente o no visible')
  return { valor: opcion, textoPrima: opcion.startsWith('BASICar') ? 'PRIMA TOTAL: 412,00 €' : i === 0 ? 'PRIMA TOTAL: 238,37 €' : 'PRIMA TOTAL: 355,07 €', textoTarjeta: 'ANUAL', bloqueada: false, recalculo: 'auto' as const }
}

test('antes del proyecto: cada variante BASICar sale como oferta con su prima', async () => {
  const r = await tarificarVariantesComercialesMapfre({} as never, vistos(), [{ producto: 'TERCEROS', periodicidad: 'anual', primaTotalEur: 238.37, requiereVerificacionVehiculo: false }, { producto: 'TERCEROS AMPLIADO', periodicidad: 'anual', primaTotalEur: 355.07, requiereVerificacionVehiculo: false }], portal(false))
  assert.deepEqual(r.primas.map((p) => p.producto).sort(), ['BASICar TERCEROS AMPLIADO', 'BASICar TODO RIESGO'])
})

// v0.8.59: el orden vuelve a ser proyecto → variantes (run c380133b); si tras el proyecto el selector no se ve, la variante sale «no leída» (aviso) y lo base ya está leído.
test('con el selector oculto (proyecto ya generado) las variantes salen «no leída», sin lanzar', async () => {
  const v = vistos()
  const r = await tarificarVariantesComercialesMapfre({} as never, v, [], portal(true))
  assert.equal(r.primas.length, 0)
  assert.ok(v.some((p) => (p.variantes ?? []).some((x) => /no visible/.test(x.motivo ?? ''))))
})
