import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  LIMITE_LIQUIDACIONES,
  LIMITE_RECIBOS_COBRADOS,
  LIMITE_RECIBOS_IMPAGO,
  LIMITE_VENCIMIENTOS,
  cribaTruncada,
} from './cartera-techos.ts'

/**
 * Los fuentes se leen SIN comentarios, igual que en `avisos-presupuesto.test.ts`
 * y por el mismo motivo: un cepo que casa dentro de un comentario sigue verde
 * sobre el código que dejó de hacer lo que dice.
 */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const leer = (p: string) => sinComentarios(readFileSync(new URL(p, import.meta.url), 'utf8'))

const CARTERA = leer('./cartera.ts')
const IMPAGADOS = leer('./cartera-impagados.ts')
const COMISIONES = leer('./comisiones.ts')
const RUTA_VENCIMIENTOS = leer('../app/api/operador/vencimientos/route.ts')
const RUTA_IMPAGADOS = leer('../app/api/operador/impagados/route.ts')
const RUTA_COMISIONES = leer('../app/api/operador/comisiones/route.ts')

// ── El mecanismo ────────────────────────────────────────────────────────────

test('el techo se comprueba con el MISMO `cribaTruncada` del cron de avisos', () => {
  // Reusado, no reimplementado: dos formas de preguntar «¿tocó techo?»
  // divergen justo en el borde, que es el único sitio donde importa.
  const fuente = readFileSync(new URL('./cartera-techos.ts', import.meta.url), 'utf8')
  assert.match(
    fuente,
    /export \{ cribaTruncada \} from '\.\/avisos-presupuesto\.ts'/,
    'cartera-techos ya no reexporta cribaTruncada: alguien ha escrito un segundo mecanismo de techo',
  )
})

test('cribaTruncada con cada tope: por debajo NO, al tope SÍ', () => {
  for (const limite of [
    LIMITE_VENCIMIENTOS,
    LIMITE_RECIBOS_IMPAGO,
    LIMITE_RECIBOS_COBRADOS,
    LIMITE_LIQUIDACIONES,
  ]) {
    assert.equal(cribaTruncada(0, limite), false)
    assert.equal(cribaTruncada(limite - 1, limite), false)
    assert.equal(cribaTruncada(limite, limite), true)
  }
})

// ── Los números, contra lo MEDIDO el 20/09/2026 ─────────────────────────────

test('🚨 cada tope deja margen sobre lo medido contra la BD real (20/09/2026)', () => {
  // Si alguien BAJA un tope por debajo de la cartera de hoy, la lista se
  // recorta desde el primer día. Las cifras son las del comentario de cada
  // constante, y están aquí para que bajarlas exija mirar la medición.
  assert.ok(LIMITE_VENCIMIENTOS > 85, 'medido: 85 pólizas en la ventana más ancha de la ruta (?dias=365)')
  assert.ok(LIMITE_RECIBOS_IMPAGO > 372, 'medido: 372 recibos en TODA la cartera, sea cual sea su situación')
  assert.ok(LIMITE_RECIBOS_COBRADOS > 372, 'medido: 372 recibos en total; 52 cobrados desde 2026-01-01')
  assert.ok(LIMITE_LIQUIDACIONES > 12, 'medido: 9 cuentas de efectivo y 12 liquidaciones en toda la base')
})

// ── Las tres consultas llevan su `take` ─────────────────────────────────────

test('🚨 `vencimientosProximos` lleva techo, y no es un número suelto', () => {
  assert.match(CARTERA, /take: LIMITE_VENCIMIENTOS/, 'la criba de renovaciones volvió a quedarse sin techo')
  assert.match(
    CARTERA,
    /cribaTruncada\(filas\.length, LIMITE_VENCIMIENTOS\)/,
    'el techo no se comprueba: se recortaría en silencio',
  )
  assert.match(CARTERA, /return \{ polizas, truncado \}/, 'el techo no viaja con la lista')
})

test('🚨 `colaRetencion` lleva techo y lo declara en el resumen', () => {
  assert.match(IMPAGADOS, /take: LIMITE_RECIBOS_IMPAGO/, 'la criba de recibos volvió a quedarse sin techo')
  assert.match(
    IMPAGADOS,
    /cribaTruncada\(recibos\.length, LIMITE_RECIBOS_IMPAGO\)/,
    'el techo de la cola de retención no se comprueba',
  )
  assert.match(IMPAGADOS, /^\s*truncado,$/m, 'el techo no viaja en ColaRetencion')
})

test('🚨 `comisionesCartera` lleva techo en sus TRES lecturas', () => {
  assert.match(COMISIONES, /take: LIMITE_LIQUIDACIONES[\s\S]*take: LIMITE_LIQUIDACIONES/,
    'cuentas de efectivo o liquidaciones se quedaron sin techo')
  assert.match(COMISIONES, /take: LIMITE_RECIBOS_COBRADOS/, 'los recibos cobrados se quedaron sin techo')
  for (const [n, limite] of [
    ['cuentas', 'LIMITE_LIQUIDACIONES'],
    ['liqs', 'LIMITE_LIQUIDACIONES'],
    ['recibos', 'LIMITE_RECIBOS_COBRADOS'],
  ] as const) {
    assert.match(
      COMISIONES,
      new RegExp(`cribaTruncada\\(${n}\\.length, ${limite}\\)`),
      `la lectura \`${n}\` no comprueba su techo: el libro saldría corto sin decirlo`,
    )
  }
  assert.match(COMISIONES, /estado: 'ok', periodos, devengos, cobertura, truncado/, 'el techo no viaja')
})

// ── El techo VIAJA por el puerto ────────────────────────────────────────────
// Un techo que se queda en el servidor es el mismo recorte mudo: quien pinta
// la lista no tiene forma de saber si están todas.

test('🚨 la ruta de vencimientos manda `truncado`', () => {
  assert.match(RUTA_VENCIMIENTOS, /truncado: lista\.truncado/, 'el techo no sale por el puerto')
})

test('🚨 las rutas de impagados y comisiones propagan el resumen entero', () => {
  // Las dos hacen spread del objeto que ya trae `truncado`; si alguien pasa a
  // enumerar campos a mano, el techo es lo primero que se cae.
  assert.match(RUTA_IMPAGADOS, /\.\.\.\(await colaRetencion\(correduria\.id\)\)/,
    'la ruta de impagados dejó de propagar el resumen entero: comprueba que `truncado` sigue saliendo')
  assert.match(RUTA_COMISIONES, /comisiones: await comisionesCartera\(correduria\.id, desde\)/,
    'la ruta de comisiones dejó de propagar el objeto entero: comprueba que `truncado` sigue saliendo')
})

test('sin conexión NO se declara recorte: no se ha leído nada', () => {
  // `truncado: false` con la BD sin configurar es correcto y no es un «no se
  // sabe» disfrazado: quien dice «no hay cartera» es el `estado` de la ruta.
  assert.match(CARTERA, /return \{ polizas: \[\], truncado: false \}/)
  assert.match(IMPAGADOS, /truncado: false,/)
})
