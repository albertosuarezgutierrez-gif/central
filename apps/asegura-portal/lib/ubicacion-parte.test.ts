import assert from 'node:assert/strict'
import { test } from 'node:test'

import { coordenadasRedondeadas, normalizarUbicacion, textoCoordenadas } from './ubicacion-parte.ts'

test('redondea a 4 decimales', () => {
  assert.deepEqual(coordenadasRedondeadas(37.389123456, -5.984098765), { lat: 37.3891, lng: -5.9841 })
})
test('rechaza no numéricos, NaN, Infinity y fuera de rango', () => {
  for (const [a, b] of [['37', -5], [NaN, 1], [1, Infinity], [91, 0], [0, 181], [-91, 0], [0, -181], [null, null]] as const) {
    assert.equal(coordenadasRedondeadas(a, b), null)
  }
})
test('(0,0) válido pero solo si lo manda el cliente; ausente nunca es (0,0)', () => {
  assert.equal(normalizarUbicacion(undefined), null)
  assert.equal(normalizarUbicacion({}), null)
  assert.equal(normalizarUbicacion({ lat: 37.38 }), null)
  assert.equal(normalizarUbicacion('x'), null)
  assert.deepEqual(normalizarUbicacion({ lat: 37.38999, lng: -5.98001 }), { lat: 37.39, lng: -5.98 })
})
test('texto con y sin precisión', () => {
  assert.equal(textoCoordenadas({ lat: 37.39, lng: -5.98 }), 'Ubicación GPS: 37.3900, -5.9800')
  assert.equal(textoCoordenadas({ lat: 37.39, lng: -5.98 }, 12.4), 'Ubicación GPS: 37.3900, -5.9800 (±12 m)')
  assert.equal(textoCoordenadas({ lat: 37.39, lng: -5.98 }, NaN), 'Ubicación GPS: 37.3900, -5.9800')
})

// Cepo de contrato: el permiso de ubicación SOLO se pide dentro del clic de «Usar mi ubicación».
import { readFileSync } from 'node:fs'
test('geolocation solo se llama desde usarMiUbicacion, nunca al cargar', () => {
  const f = readFileSync(new URL('../app/(portal)/boveda/ParteSiniestro.tsx', import.meta.url), 'utf8')
  assert.equal((f.match(/getCurrentPosition|watchPosition/g) ?? []).length, 1, 'una sola llamada y sin watchPosition')
  const ini = f.indexOf('function usarMiUbicacion()')
  const fin = f.indexOf('function cerrar()')
  const llamada = f.indexOf('getCurrentPosition')
  assert.ok(ini > 0 && llamada > ini && llamada < fin, 'getCurrentPosition vive dentro de usarMiUbicacion')
  assert.match(f, /onClick=\{usarMiUbicacion\}/)
  assert.match(f, /Solo para indicar dónde ha ocurrido; no seguimos tu ubicación/)
  const ruta = readFileSync(new URL('../app/api/siniestros/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /normalizarUbicacion\(/, 'el servidor re-redondea')
})

test('🪤 tocar «Dónde» tras usar la ubicación retira las coordenadas (no viaja un GPS que la persona ya corrigió)', () => {
  const f = readFileSync(new URL('../app/(portal)/boveda/ParteSiniestro.tsx', import.meta.url), 'utf8')
  const ini = f.indexOf('function escribir(campo: Campo')
  const cuerpo = f.slice(ini, f.indexOf('\n  }\n', ini))
  assert.ok(ini > 0, 'sin escribir()')
  assert.match(cuerpo, /campo === 'lugar' && ubic !== null\) \{\s*setUbic\(null\)/)
  // El input de «Dónde» pasa por escribir() (si se cambia a un setForm directo, el cepo de arriba no sirve).
  assert.match(f, /onChange=\{\(e\) => escribir\('lugar', e\.target\.value\)\}/)
  // Los mensajes de ubicación se anuncian (role="status").
  assert.equal((f.match(/geo === '(ok|retirada|error)' && \(\s*<p className="editor-ayuda" role="status">/g) ?? []).length, 3)
})
