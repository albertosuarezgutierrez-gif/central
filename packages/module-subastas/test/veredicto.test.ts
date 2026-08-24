import { test } from 'node:test'
import assert from 'node:assert/strict'
import { veredicto } from '../src/veredicto.ts'
import type { SubastaInmueble } from '../src/types.ts'

// Fixture con los números REALES de SUB-JA-2026-263989 (Siero, Asturias):
// unifamiliar, tipo 280.783€, deuda 124.242,92€, sin tasación ni valor de
// referencia ni superficie — la subasta con la que Alberto pidió el veredicto.
const siero: SubastaInmueble = {
  dedupeKey: 'SUB-JA-2026-263989',
  fuente: 'boe',
  tipo: 'judicial',
  provincia: 'Asturias',
  valorSubasta: 280783,
  pujaMinima: 0,
  cantidadReclamada: 124242.92,
  cargasConocidas: true,
}

const cargasLimpias = { cargas: 0, cargasConocidas: true }
const cargasSinLeer = { cargas: null, cargasConocidas: false, documentos: null, muro: 'total' as const }

test('cerrada gana a todo', () => {
  const v = veredicto({ s: siero, valorMercado: 500000, cargas: cargasLimpias, cerrada: true })
  assert.equal(v.nivel, 'cerrada')
})

test('sin valor de mercado ni m² → faltan_datos, y dice QUÉ falta', () => {
  const v = veredicto({ s: siero, valorMercado: null, cargas: cargasSinLeer, precioM2Zona: 1119 })
  assert.equal(v.nivel, 'faltan_datos')
  assert.match(v.faltan[0], /VALOR DE MERCADO/)
  assert.ok(v.faltan.some((f) => /m² del inmueble/.test(f) && /1\.119/.test(f)))
  assert.ok(v.faltan.some((f) => /CARGAS/.test(f)))
  assert.equal(v.hastaPuja, null)
})

test('valor alto + cargas resueltas → interesa, con el techo de puja', () => {
  const v = veredicto({ s: siero, valorMercado: 500000, cargas: cargasLimpias })
  assert.equal(v.nivel, 'interesa')
  assert.ok(v.hastaPuja != null && v.hastaPuja > 0)
  assert.match(v.titular, /Interesa pujando hasta/)
})

test('cargas que subsisten mayores que el valor → no interesa', () => {
  const conCargas: SubastaInmueble = { ...siero, cargas: 100000, cargasConocidas: true }
  const v = veredicto({ s: conCargas, valorMercado: 90000, cargas: { cargas: 100000, cargasConocidas: true } })
  assert.equal(v.nivel, 'no_interesa')
  assert.equal(v.hastaPuja, null)
})

test('el 🔴 es afirmable con cargas SIN leer: lo que falta solo empeora', () => {
  // El valor de referencia del Catastro fija la base del ITP aunque se puje
  // 0€: con la finca valiendo 15.000€, solo el impuesto se come el descuento.
  const conRef: SubastaInmueble = { ...siero, valorReferencia: 200000 }
  const v = veredicto({ s: conRef, valorMercado: 15000, cargas: cargasSinLeer })
  assert.equal(v.nivel, 'no_interesa')
})

test('números buenos con cargas sin confirmar → faltan_datos, no 🟢', () => {
  const v = veredicto({ s: siero, valorMercado: 500000, cargas: cargasSinLeer })
  assert.equal(v.nivel, 'faltan_datos')
  assert.ok(v.hastaPuja != null, 'el techo se enseña igualmente')
  assert.match(v.titular, /cargas están sin confirmar/)
})

test('valor ESTIMADO por m²×zona nunca sentencia: ni 🟢 ni 🔴', () => {
  // 200 m² × 1.119 €/m² ≈ 223.800€ — números que no llegan al 25%…
  const corto = veredicto({ s: siero, valorMercado: null, superficie: 200, precioM2Zona: 1119, cargas: cargasLimpias })
  assert.equal(corto.nivel, 'faltan_datos')
  assert.equal(corto.valorEstimado, true)
  // …y 400 m² que sí llegarían: tampoco es un 🟢, es un 🟠 con el techo.
  const largo = veredicto({ s: siero, valorMercado: null, superficie: 400, precioM2Zona: 1119, cargas: cargasLimpias })
  assert.equal(largo.nivel, 'faltan_datos')
  assert.ok(largo.hastaPuja != null)
  assert.match(largo.titular, /estimación/)
})

test('el techo se contrasta con la deuda reclamada: hasta ahí el banco puja gratis', () => {
  const v = veredicto({ s: siero, valorMercado: 500000, cargas: cargasLimpias })
  // Con valor 500.000€ el techo del 25% supera de largo la deuda (124.242,92€).
  assert.ok(v.razones.some((r) => /supera la deuda reclamada/.test(r) && /124\.242,92€/.test(r)))
  const corto = veredicto({ s: siero, valorMercado: 160000, cargas: cargasLimpias })
  if (corto.hastaPuja != null && corto.hastaPuja < 124242.92) {
    assert.ok(corto.razones.some((r) => /por debajo de la deuda reclamada/.test(r)))
  }
})

test('la calibración convierte el techo en probabilidad — y el agregado nunca se disfraza de provincial', () => {
  // Los números REALES del corpus (20/08/2026): Sevilla 1,42× · global 0,64×.
  const calibracion = [
    { provincia: '(todas)', muestra: 13, adjudicadas: 8, desiertas: 5, ratioMediano: 0.64, muestraRatio: 8 },
    { provincia: 'Sevilla', muestra: 2, adjudicadas: 2, desiertas: 0, ratioMediano: 1.42, muestraRatio: 2 },
  ]
  // Asturias no tiene muestra propia → habla el agregado, DECLARADO como tal.
  const v = veredicto({ s: siero, valorMercado: 500000, cargas: cargasLimpias, calibracion })
  const linea = v.razones.find((r) => /📊/.test(r))
  assert.ok(linea, 'debe haber lectura de probabilidad')
  assert.match(linea!, /sin muestra de Asturias/i)
  assert.match(linea!, /0,64×/)
  // En Sevilla habla SU mediana (1,42×), no la global.
  const sevilla = veredicto({ s: { ...siero, provincia: 'Sevilla' }, valorMercado: 500000, cargas: cargasLimpias, calibracion })
  const lineaSev = sevilla.razones.find((r) => /📊/.test(r))
  assert.match(lineaSev!, /en Sevilla/i)
  assert.match(lineaSev!, /1,42×/)
  // Sin calibración, la razón simplemente no aparece: nada de inventar.
  const sinCal = veredicto({ s: siero, valorMercado: 500000, cargas: cargasLimpias })
  assert.equal(sinCal.razones.some((r) => /📊/.test(r)), false)
})

test('ocupada añade el aviso de lanzamiento', () => {
  const v = veredicto({ s: { ...siero, situacionPosesoria: 'ocupada' }, valorMercado: 500000, cargas: cargasLimpias })
  assert.ok(v.razones.some((r) => /OCUPADA/.test(r)))
})

test('el techo por debajo de la puja mínima publicada → no interesa', () => {
  const conMinimo: SubastaInmueble = { ...siero, pujaMinima: 250000 }
  // Valor 320.000€: el techo del 25% queda muy por debajo de 250.000€.
  const v = veredicto({ s: conMinimo, valorMercado: 320000, cargas: cargasLimpias })
  assert.equal(v.nivel, 'no_interesa')
  assert.match(v.titular, /puja mínima/)
})
