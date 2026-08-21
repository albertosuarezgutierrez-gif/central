import { test } from 'node:test'
import assert from 'node:assert/strict'
import { huecos, caidaIntradia, perfilHuecos, evaluarStop, tamanoPorRiesgo } from '../src/riesgo-hueco.ts'
import type { Vela } from '../src/types.ts'

/** Serie sintética tranquila: cierra plano y respira ~1% intradía, sin huecos. */
function serieTranquila(n: number, base = 100): Vela[] {
  return Array.from({ length: n }, (_, i) => ({
    fecha: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    apertura: base,
    alto: base * 1.005,
    bajo: base * 0.995,
    cierre: base,
    volumen: 1_000_000,
  }))
}

test('huecos: mide el salto cierre→apertura, no el recorrido del día', () => {
  const velas: Vela[] = [
    { fecha: '2026-08-18', apertura: 60, alto: 64, bajo: 59, cierre: 62.96, volumen: 1 },
    { fecha: '2026-08-19', apertura: 116.02, alto: 176.6, bajo: 114.48, cierre: 174.88, volumen: 1 },
  ]
  const h = huecos(velas)
  assert.equal(h.length, 1)
  // El caso real de Moderna: abrió +84,3% sobre el cierre anterior.
  assert.ok(Math.abs(h[0].pct - 84.28) < 0.05, `esperaba ~84,3%, salió ${h[0].pct}`)
})

test('caidaIntradia: recorrido desde la apertura hasta el mínimo, siempre ≤ 0', () => {
  const c = caidaIntradia({ fecha: 'x', apertura: 100, alto: 101, bajo: 97, cierre: 98, volumen: 1 })
  assert.ok(c !== null && Math.abs(c - -3) < 1e-9)
})

// 🚨 Tres estados: sin historia suficiente NO se estima el riesgo. Devolver 0 sería afirmar
// «no hay riesgo de hueco» sobre un valor que simplemente no hemos podido mirar.
test('sin historia suficiente devuelve null, no un cero tranquilizador', () => {
  assert.equal(perfilHuecos(serieTranquila(10)), null)
  assert.equal(evaluarStop(serieTranquila(10), 2), null)
})

test('perfilHuecos: una serie sin huecos da magnitudes 0 pero con n medido', () => {
  const p = perfilHuecos(serieTranquila(80))
  assert.ok(p)
  assert.equal(p.n, 79)
  assert.equal(p.peor, 0)
  assert.equal(p.fraccionSaltada(1), 0)
})

test('un stop DENTRO del ruido diario se declara decorativo', () => {
  // Serie que respira ±2,5% intradía: un stop al 1% salta casi todos los días.
  const velas: Vela[] = Array.from({ length: 80 }, (_, i) => ({
    fecha: `2026-02-${String((i % 28) + 1).padStart(2, '0')}`,
    apertura: 100, alto: 102.5, bajo: 97.5, cierre: 100, volumen: 1,
  }))
  const ev = evaluarStop(velas, 1)
  assert.ok(ev)
  assert.equal(ev.veredicto, 'decorativo')
  assert.ok(ev.saltaPorRuido > 90)
})

test('el mismo valor con el stop holgado deja de ser decorativo', () => {
  const velas: Vela[] = Array.from({ length: 80 }, () => ({
    fecha: '2026-02-01', apertura: 100, alto: 102.5, bajo: 97.5, cierre: 100, volumen: 1,
  }))
  const ev = evaluarStop(velas, 6)
  assert.ok(ev)
  assert.equal(ev.veredicto, 'razonable')
  assert.equal(ev.saltaPorRuido, 0)
})

// La lección de Moderna: un hueco no respeta el stop, lo atraviesa. El aviso debe decirlo aunque
// el stop sea holgado, porque el modo de fallo es distinto (no salta antes: ejecuta peor).
test('avisa del hueco que atraviesa el stop aunque la distancia sea holgada', () => {
  const velas: Vela[] = serieTranquila(80)
  // Una sesión abre un 12% por debajo del cierre anterior.
  velas[40] = { fecha: '2026-03-01', apertura: 88, alto: 90, bajo: 86, cierre: 89, volumen: 1 }
  velas[41] = { ...velas[41], apertura: 89, alto: 89.5, bajo: 88.5, cierre: 89 }
  const ev = evaluarStop(velas, 5)
  assert.ok(ev)
  assert.ok(ev.saltaPorHueco > 0, 'debería contar el hueco que lo atravesó')
  assert.match(ev.motivo, /no protege/)
})

test('si el stop es menor que el hueco típico, es decorativo por esa vía', () => {
  // Serie que abre CADA día un ~2% por debajo del cierre anterior (hueco típico 2%).
  const velas: Vela[] = []
  let precio = 100
  for (let i = 0; i < 80; i++) {
    const apertura = precio * 0.98
    velas.push({ fecha: `2026-04-${String((i % 28) + 1).padStart(2, '0')}`, apertura, alto: apertura * 1.001, bajo: apertura * 0.999, cierre: apertura, volumen: 1 })
    precio = apertura
  }
  const ev = evaluarStop(velas, 1)
  assert.ok(ev)
  assert.equal(ev.veredicto, 'decorativo')
  assert.match(ev.motivo, /hueco de apertura T[ÍI]PICO/)
})

test('tamanoPorRiesgo: comprar menos es la respuesta al stop corto, no acercarlo', () => {
  // 500€ de riesgo, precio 77,82$, stop al 8% → 8*0,7782 = 6,2256 por título → 80 títulos.
  assert.equal(tamanoPorRiesgo(77.82, 8, 500), 80)
  // Con el stop al 1,30% (la mediana real de 2026) caben 494 títulos: el mismo riesgo declarado
  // exige 6 veces más exposición, y por eso el ruido normal se lleva la posición entera.
  assert.equal(tamanoPorRiesgo(77.82, 1.3, 500), 494)
})

test('tamanoPorRiesgo: cualquier pata que falte da null, nunca un tamaño inventado', () => {
  assert.equal(tamanoPorRiesgo(0, 5, 500), null)
  assert.equal(tamanoPorRiesgo(100, 0, 500), null)
  assert.equal(tamanoPorRiesgo(100, 5, 0), null)
})
