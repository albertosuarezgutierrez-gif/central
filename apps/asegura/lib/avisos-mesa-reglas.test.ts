import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COLAS_AVISO, itemParte, recibosConRelojSinRescate, recibosSinConfirmar, resumirCola, type ReciboEnRiesgo,
} from './avisos-mesa-reglas.ts'

const HOY = '2026-10-13'

test('resumirCola: n, plazo MÁS cercano y urgentes (≤7 días, vencidos o urgentes por naturaleza)', () => {
  const r = resumirCola([{ plazo: '2026-11-30' }, { plazo: '2026-10-18' }, { plazo: '2026-10-01' }, { plazo: null, urgente: true }, { plazo: null }], HOY)
  assert.deepEqual(r, { estado: 'ok', n: 5, plazo: '2026-10-01', urgentes: 3 })
})

test('cola vacía comprobada = n 0 (y es lo ÚNICO que autoriza a callar)', () => {
  assert.deepEqual(resumirCola([], HOY), { estado: 'ok', n: 0, plazo: null, urgentes: 0 })
})

test('un plazo ilegible no se inventa, pero el elemento cuenta', () => {
  assert.deepEqual(resumirCola([{ plazo: '2026-02-31' }, { plazo: 'mañana' }], HOY), { estado: 'ok', n: 2, plazo: null, urgentes: 0 })
})

test('parte del portal: plazo = hecho + 7 días (art. 16 LCS) y siempre urgente', () => {
  assert.deepEqual(itemParte('2026-10-10'), { plazo: '2026-10-17', urgente: true })
  assert.deepEqual(itemParte(null), { plazo: null, urgente: true })
})

const rec = (o: Partial<ReciboEnRiesgo> = {}): ReciboEnRiesgo => ({ polizaId: 'p1', estado: 'en_plazo', fechaRecibo: '2026-10-01', dias: 12, ...o })

test('art. 15: devuelto SIN rescate visible sale con su plazo (suspensión a 30 d; extinción a 6 meses si ya está suspendida)', () => {
  assert.deepEqual(recibosConRelojSinRescate([rec()], new Set()), [{ plazo: '2026-10-31', urgente: false }])
  assert.deepEqual(recibosConRelojSinRescate([rec({ estado: 'suspendida', fechaRecibo: '2026-08-01' })], new Set()), [{ plazo: '2027-01-28', urgente: true }])
  assert.deepEqual(recibosConRelojSinRescate([rec({ estado: 'sin_fecha', fechaRecibo: null })], new Set()), [{ plazo: null, urgente: true }])
})

test('art. 15: con rescate VISIBLE (abierto y no aparcado) no se repite; extinguidos y sin confirmar no entran', () => {
  assert.deepEqual(recibosConRelojSinRescate([rec()], new Set(['p1'])), [])
  assert.deepEqual(recibosConRelojSinRescate([rec({ estado: 'extinguida' }), rec({ polizaId: 'p2', estado: 'sin_confirmar' })], new Set()), [])
  // Dos recibos de la misma póliza = una línea (una llamada).
  assert.equal(recibosConRelojSinRescate([rec(), rec({ fechaRecibo: '2026-09-01' })], new Set()).length, 1)
})

test('vencidos sin confirmar: solo los de un mes o más (antes es lo normal en un domiciliado)', () => {
  assert.equal(recibosSinConfirmar([rec({ estado: 'sin_confirmar', dias: 30 }), rec({ estado: 'sin_confirmar', dias: 10 }), rec({ estado: 'sin_confirmar', dias: null })]).length, 1)
})

// ── Cepos de la lectura ─────────────────────────────────────────────────────

const SRC = readFileSync(join(import.meta.dirname, 'avisos-mesa.ts'), 'utf8')
/** El código sin comentarios de línea (los comentarios pueden nombrar lo prohibido para explicarlo). */
const CODIGO = SRC.split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '')).join('\n')

test('cada cola de COLAS_AVISO se lee en su propio `leer()` (un fallo = «no se pudo comprobar», no tumba las demás)', () => {
  for (const c of COLAS_AVISO) assert.match(SRC, new RegExp(`leer\\('${c}'`), `falta leer('${c}')`)
})

test('la banda no ESCRIBE: no llama a aprobacionesPendientes() (retira y propone)', () => {
  assert.doesNotMatch(CODIGO, /aprobacionesPendientes/)
  assert.doesNotMatch(CODIGO, /\$executeRaw|\.create\(|\.update\(|\.delete\(/)
})

test('el rescate VISIBLE excluye los aparcados (un rescate aparcado con el reloj vivo tiene que sonar)', () => {
  assert.match(SRC, /o\.aparcada_hasta is null or o\.aparcada_hasta <= \$\{hoy\}::date/)
  assert.match(SRC, /o\.estado::text in \('competencia', 'en_negociacion', 'pendiente_cliente'\)/)
})
