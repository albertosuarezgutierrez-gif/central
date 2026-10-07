// Guardián de «Datos del vehículo» de la oportunidad (07/10/2026). `node --test`.
//
// 1) El garaje de MOTO es otro catálogo (`garajes-moto`). DatosVehiculo leía `garajes` (coche) también para moto, y la
//    pantalla de precio de moto (que usa `garajes-moto`) descartaba el garaje guardado sin avisar.
// 2) La versión del catálogo se elige EN ese bloque y se guarda con los 7 campos juntos (si no, asegura borra los ids).
// 3) «Pedir precio →» solo NAVEGA a la pantalla de precio: nunca dispara la cotización de pago (0,50€).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const DIR = 'apps/plataforma/app/(usuario)/correduria/oportunidad/[id]/'
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const activas = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

test('DatosVehiculo no vuelve a pedir `garajes` a pelo para moto: el tipo sale de tipoGaraje(ramo)', () => {
  const src = leer(DIR + 'DatosVehiculo.tsx')
  assert.doesNotMatch(src, /tipo:\s*'garajes'/)
  assert.match(src, /pedirCatalogo\(\{ tipo: tipoGaraje\(riesgo\.oportunidad\.ramo\) \}\)/)
  const h = leer(DIR + 'catalogo-vehiculo.ts')
  assert.match(h, /ramo === 'moto' \? 'garajes-moto' : 'garajes'/)
})

test('elegir versión guarda los 7 campos juntos y el selector pide el catálogo con sufijo -moto', () => {
  const src = leer(DIR + 'DatosVehiculo.tsx')
  assert.match(src, /void guardar\(payloadVersion\(s\), false\)/)
  assert.match(src, /soloLoQueCambia\(d as unknown as Record<string, unknown>, form\)/)
  const sel = leer(DIR + 'SelectorCatalogoVehiculo.tsx')
  assert.equal((sel.match(/<SelectorBuscable\b/g) ?? []).length, 4)
  assert.match(sel, /planPrecargaVehiculo\(datos, false\)/)
  assert.doesNotMatch(sel, /tipo:\s*'(marcas|modelos|versiones)(-moto)?'/, 'los tipos salen de tiposCatalogo(ramo)')
})

test('DatosVehiculo no pide precio: el botón vive en el bloque único de RiesgoPantalla (solo navega, nunca cotiza)', () => {
  const src = activas(leer(DIR + 'DatosVehiculo.tsx'))
  assert.doesNotMatch(src, /Pedir precio →|rutaVariante|retarificar|pedirCotizacion|cotizar/i)
  const pant = leer(DIR + 'RiesgoPantalla.tsx')
  assert.match(pant, /href=\{acciones\.principal\.href\}/)
  assert.doesNotMatch(pant, /pedirCotizacion|cotizar\(/)
  const sel = leer(DIR + 'SelectorCatalogoVehiculo.tsx')
  assert.doesNotMatch(sel, /pedirCotizacion|cotizar/i)
})

test('MotoNuevo: la moto de la última tarificación no manda si el riesgo trae otra', () => {
  const src = leer('apps/plataforma/app/(usuario)/correduria/cliente/[id]/moto-nuevo/MotoNuevo.tsx')
  assert.match(src, /previoPuedeMandar\(datosRiesgo, v\.codigoVehiculo, retomada\)/)
  assert.match(src, /planPrecargaVehiculo\(datosRiesgo, retomada\)/)
})

test('AutoNuevo: el coche de la última tarificación tampoco manda si el riesgo trae otro', () => {
  const src = leer('apps/plataforma/app/(usuario)/correduria/cliente/[id]/auto-nuevo/AutoNuevo.tsx')
  assert.match(src, /previoPuedeMandar\(datosRiesgo, v\.codigoVehiculo, retomada\)/)
})

test('SelectorCatalogoVehiculo: una respuesta tardía de modelos/versiones (otro combustible) no pisa la lista vigente', () => {
  const sel = leer(DIR + 'SelectorCatalogoVehiculo.tsx')
  assert.match(sel, /if \(n !== peticionVersiones\.current\) return/)
  assert.match(sel, /if \(n !== peticionModelos\.current\) return/)
})
