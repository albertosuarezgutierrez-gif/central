// Proyección pura de las estadísticas de los bots (15/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calcularMadurez, costeDeSegundos, COSTE_FLY_EUR_POR_MINUTO, proyectarEstadisticas, proyectarParejas, type FilaAgregada, type FilaClave, type FilaPareja } from './tarificador-estadisticas-reglas.ts'

const agg = (x: Partial<FilaAgregada> = {}): FilaAgregada => ({
  dias: 30, compania: 'allianz', ramo: 'comunidades', bot_version: '0.2.0',
  total: 10, ok: 6, atascado: 1, requiere_humano: 1, error_definitivo: 2, seg_medio: 95.4, ...x,
})
const cl = (clave: string, n: number, x: Partial<FilaClave> = {}): FilaClave =>
  ({ dias: 30, compania: 'allianz', ramo: 'comunidades', bot_version: '0.2.0', clave, n, ...x })

test('porcentajes, tiempo medio y ventanas 7/30 del mismo grupo', () => {
  const [f] = proyectarEstadisticas([agg(), agg({ dias: 7, total: 4, ok: 3, atascado: 1, requiere_humano: 0, error_definitivo: 0, seg_medio: 60 })], [])
  assert.equal(f!.d30!.pctOk, 60)
  assert.equal(f!.d30!.pctProblema, 40)
  assert.equal(f!.d30!.tiempoMedioSeg, 95)
  assert.equal(f!.d7!.pctOk, 75)
  assert.equal(f!.d7!.pctProblema, 25)
})

test('null es «sin datos», nunca 0: sin trabajos y sin ok medible', () => {
  const [f] = proyectarEstadisticas([agg({ total: 0, ok: 0, atascado: 0, requiere_humano: 0, error_definitivo: 0, seg_medio: null }), agg({ dias: 7, ok: 0, seg_medio: null })], [])
  assert.equal(f!.d30!.pctOk, null)
  assert.equal(f!.d30!.pctProblema, null)
  assert.equal(f!.d30!.tiempoMedioSeg, null)
  assert.equal(f!.d7!.pctOk, 0, 'con trabajos y ninguno ok, el 0 % es un valor real')
  assert.equal(f!.d7!.tiempoMedioSeg, null, 'sin ningún ok no hay tiempo hasta precio')
})

test('top 5 de claves de atasco: por veces, desempate por nombre, solo su grupo y ventana', () => {
  const claves = [cl('a', 1), cl('b', 5), cl('c', 3), cl('d', 3), cl('e', 2), cl('f', 4), cl('g', 9, { dias: 7 }), cl('h', 9, { bot_version: '0.1.0' }), cl('vacia', 0), cl('  ', 3)]
  const [f] = proyectarEstadisticas([agg()], claves)
  assert.deepEqual(f!.d30!.topAtascos.map((c) => c.clave), ['b', 'f', 'c', 'd', 'e'])
  assert.equal(f!.d7, null)
})

test('grupos por compañía × ramo × versión (null = sin versión), ordenados por volumen y con números de pg (bigint/string)', () => {
  const r = proyectarEstadisticas([
    agg({ bot_version: null, total: 3, ok: 1 }),
    agg({ compania: 'mapfre', ramo: 'auto', total: BigInt(40) as unknown as number, ok: '30' as unknown as number }),
    agg(),
  ], [])
  assert.deepEqual(r.map((x) => [x.compania, x.botVersion]), [['mapfre', '0.2.0'], ['allianz', '0.2.0'], ['allianz', null]])
  assert.equal(r[0]!.d30!.total, 40)
  assert.equal(r[0]!.d30!.pctOk, 75)
})

test('sin datos personales: solo agregados en la salida', () => {
  const s = JSON.stringify(proyectarEstadisticas([agg({ riesgo: { dni: '1' }, error: 'x' } as never)], []))
  assert.ok(!/riesgo|dni|error"/.test(s))
})

test('cepo de fuente: el SQL filtra por correduría, solo tarificar, y no toca riesgo ni error', () => {
  const src = readFileSync(join(import.meta.dirname, 'tarificador-estadisticas.ts'), 'utf8')
  assert.match(src, /t\.correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(src, /a\.correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(src, /= 'tarificar'/)
  assert.ok(!/t\.riesgo|t\.error\b/.test(src.replace(/\/\/.*$/gm, '')), 'el SQL no lee riesgo ni error')
})

test('madurez: estable con >=3 ok y 0 fallos en 7 días; en pruebas con algún precio; sin precio si nunca', () => {
  assert.equal(calcularMadurez({ ok7d: 3, fallos7d: 0, okSiempre: 3 }), 'estable')
  assert.equal(calcularMadurez({ ok7d: 2, fallos7d: 0, okSiempre: 9 }), 'en_pruebas')
  assert.equal(calcularMadurez({ ok7d: 10, fallos7d: 1, okSiempre: 10 }), 'en_pruebas', 'un solo fallo de portal quita lo estable')
  assert.equal(calcularMadurez({ ok7d: 0, fallos7d: 0, okSiempre: 1 }), 'en_pruebas', 'precio antiguo, fuera de los 7 días')
  assert.equal(calcularMadurez({ ok7d: 0, fallos7d: 5, okSiempre: 0 }), 'sin_precio')
})

const par = (x: Partial<FilaPareja> = {}): FilaPareja => ({
  compania: 'allianz', ramo: 'auto', ok_7d: 4, fallos_7d: 0, ok_siempre: 8, trabajos_30d: 10, medidos_30d: 4, seg_total_30d: 480, ...x,
})

test('coste estimado: media por trabajo medido y total de 30 días; sin medibles es null, no 0', () => {
  const [p] = proyectarParejas([par()])
  assert.equal(p!.madurez, 'estable')
  assert.equal(p!.segMedioPorTrabajo, 120)
  assert.equal(p!.sinMedir30d, 6)
  assert.equal(p!.costeMedioEur, costeDeSegundos(120))
  assert.equal(p!.costeTotal30dEur, costeDeSegundos(480))
  assert.ok(Math.abs(costeDeSegundos(60) - COSTE_FLY_EUR_POR_MINUTO) < 1e-12)
  const [q] = proyectarParejas([par({ medidos_30d: 0, seg_total_30d: 0 })])
  assert.equal(q!.costeMedioEur, null)
  assert.equal(q!.costeTotal30dEur, null)
  assert.equal(q!.segMedioPorTrabajo, null)
})

test('parejas: números de pg (bigint/string) y orden por volumen', () => {
  const r = proyectarParejas([par({ compania: 'b', trabajos_30d: '2' as never, medidos_30d: '1' as never }), par({ compania: 'a', ok_7d: BigInt(5) as never })])
  assert.deepEqual(r.map((x) => x.compania), ['a', 'b'])
  assert.equal(r[0]!.ok7d, 5)
})

test('cepo de fuente: el SQL de parejas filtra por correduría y tarificar, e histórico sin ventana en ok_siempre', () => {
  const src = readFileSync(join(import.meta.dirname, 'tarificador-estadisticas.ts'), 'utf8')
  assert.match(src, /count\(\*\) filter \(where t\.estado = 'ok'\)\)::int as ok_siempre/)
  assert.ok((src.match(/t\.correduria_id = \$\{correduriaId\}::uuid/g) ?? []).length >= 2)
})
