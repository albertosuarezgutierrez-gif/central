import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bloqueaDuplicado, decidirDuplicado, huellaCotizacion, jsonCanonico, VENTANA_DUPLICADO_MIN, type FilaPrevia } from './huella.ts'

const C = '11111111-1111-1111-1111-111111111111'
const AHORA = new Date('2026-10-08T12:00:00Z')
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000)
const fila = (estado: FilaPrevia['estado'], min: number, intentoId = 'i1'): FilaPrevia => ({ estado, creadoAt: hace(min), intentoId })

test('huella estable ante el orden de las claves (a cualquier profundidad)', () => {
  const a = { x: 1, y: { b: [1, { q: 1, p: 2 }], a: 'z' } }
  const b = { y: { a: 'z', b: [1, { p: 2, q: 1 }] }, x: 1 }
  assert.equal(jsonCanonico(a), jsonCanonico(b))
  assert.equal(huellaCotizacion({ cuerpo: a, ramo: 'auto', correduriaId: C }), huellaCotizacion({ cuerpo: b, ramo: 'auto', correduriaId: C }))
})

test('huella distinta ante cambio de dato, de ramo o de correduría; undefined no cuenta', () => {
  const base = huellaCotizacion({ cuerpo: { a: 1, b: 'x' }, ramo: 'auto', correduriaId: C })
  assert.notEqual(base, huellaCotizacion({ cuerpo: { a: 2, b: 'x' }, ramo: 'auto', correduriaId: C }))
  assert.notEqual(base, huellaCotizacion({ cuerpo: { a: 1, b: 'x' }, ramo: 'moto', correduriaId: C }))
  assert.notEqual(base, huellaCotizacion({ cuerpo: { a: 1, b: 'x' }, ramo: 'auto', correduriaId: C.replace('1', '2') }))
  assert.equal(base, huellaCotizacion({ cuerpo: { a: 1, b: 'x', c: undefined }, ramo: 'auto', correduriaId: C }))
  assert.match(base, /^[0-9a-f]{64}$/)
})

test('la huella distingue el contexto (oportunidad ?? póliza); sin contexto es la de siempre', () => {
  const cuerpo = { a: 1 }
  const sin = huellaCotizacion({ cuerpo, ramo: 'auto', correduriaId: C })
  const o1 = huellaCotizacion({ cuerpo, ramo: 'auto', correduriaId: C, oportunidadId: 'op-1' })
  const o2 = huellaCotizacion({ cuerpo, ramo: 'auto', correduriaId: C, oportunidadId: 'op-2' })
  const p1 = huellaCotizacion({ cuerpo, ramo: 'auto', correduriaId: C, polizaId: 'pol-1' })
  assert.notEqual(o1, o2)
  assert.notEqual(o1, sin)
  assert.notEqual(p1, sin)
  // la oportunidad manda sobre la póliza; null equivale a ausente
  assert.equal(huellaCotizacion({ cuerpo, ramo: 'auto', correduriaId: C, oportunidadId: 'op-1', polizaId: 'pol-9' }), o1)
  assert.equal(huellaCotizacion({ cuerpo, ramo: 'auto', correduriaId: C, oportunidadId: null, polizaId: null }), sin)
})

test('la huella no contiene el cuerpo ni datos personales', () => {
  const h = huellaCotizacion({ cuerpo: { nif: '12345678Z', nombre: 'Ana' }, ramo: 'auto', correduriaId: C })
  assert.doesNotMatch(h, /12345678Z|Ana/)
})

test('ventana de 15 min: dentro bloquea, fuera no; descartado nunca bloquea', () => {
  assert.equal(VENTANA_DUPLICADO_MIN, 15)
  assert.equal(bloqueaDuplicado(fila('facturable', 14), AHORA), true)
  assert.equal(bloqueaDuplicado(fila('facturable', 15), AHORA), true)
  assert.equal(bloqueaDuplicado(fila('facturable', 16), AHORA), false)
  assert.equal(bloqueaDuplicado(fila('reservado', 5), AHORA), true)
  assert.equal(bloqueaDuplicado(fila('descartado', 1), AHORA), false)
})

test('decisión: sin previas llama; descartada llama; vieja llama', () => {
  const d = (previas: FilaPrevia[], extra = {}) => decidirDuplicado({ previas, copias: new Set(), ahora: AHORA, ...extra })
  assert.deepEqual(d([]), { accion: 'llamar' })
  assert.deepEqual(d([fila('descartado', 1)]), { accion: 'llamar' })
  assert.deepEqual(d([fila('facturable', 40)]), { accion: 'llamar' })
})

test('decisión: facturable reciente con copia reutiliza; sin copia o en curso bloquea sin llamar', () => {
  const p = [fila('facturable', 3, 'f1')]
  assert.deepEqual(decidirDuplicado({ previas: p, copias: new Set(['f1']), ahora: AHORA }), { accion: 'reutilizar', intentoId: 'f1' })
  assert.deepEqual(decidirDuplicado({ previas: p, copias: new Set(), ahora: AHORA }), { accion: 'bloquear', intentoId: 'f1', estado: 'facturable' })
  const r = decidirDuplicado({ previas: [fila('reservado', 1, 'r1')], copias: new Set(['r1']), ahora: AHORA })
  assert.deepEqual(r, { accion: 'bloquear', intentoId: 'r1', estado: 'reservado' })
})

test('decisión: forzar salta la guarda; sin forzar (por defecto) no', () => {
  const previas = [fila('facturable', 1, 'f1')]
  assert.deepEqual(decidirDuplicado({ previas, copias: new Set(['f1']), ahora: AHORA, forzar: true }), { accion: 'llamar' })
  assert.notDeepEqual(decidirDuplicado({ previas, copias: new Set(['f1']), ahora: AHORA, forzar: false }), { accion: 'llamar' })
})

// ── Cepo de cableado: la guarda tiene que estar EN el embudo, no solo en el helper ──
import { readFileSync } from 'node:fs'
import { respuestaFalloCotizacion } from './fallo-cotizacion.ts'
const leer = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')

test('cotizar() reserva con la guarda anti-duplicado y con la huella del cuerpo', () => {
  const src = leer('./cotizar.ts')
  assert.match(src, /reservarSinDuplicado\(/)
  assert.doesNotMatch(src, /\breservar\(/, 'la reserva sin guarda reabre el doble cargo')
  assert.match(src, /huellaCotizacion\(/)
  assert.match(src, /forzar:\s*p\.forzar === true/)
})

test('la comprobación y la reserva comparten transacción bajo advisory lock', () => {
  const src = leer('./consumo.ts')
  const i = src.indexOf('export async function reservarSinDuplicado')
  const cuerpo = src.slice(i, src.indexOf('export async function consumoEmision'))
  assert.match(cuerpo, /\$transaction/)
  assert.match(cuerpo, /pg_advisory_xact_lock\(hashtext\(/)
  assert.ok(cuerpo.indexOf('pg_advisory_xact_lock') < cuerpo.search(/insert into \S*codeoscopic_consumo/))
})

test('el duplicado responde 409 sin cargo y con mensaje legible', () => {
  const r = respuestaFalloCotizacion({ ok: false, razon: 'duplicado', mensaje: 'idéntica', sinCargo: true })
  assert.equal(r.status, 409)
  assert.equal(r.cuerpo.gastado, '0,00€')
})
