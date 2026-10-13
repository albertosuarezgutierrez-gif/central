import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COLAS_AVISO, avisoDeCola, avisoDeIngesta, componerAvisos, ordenarAvisos, type Aviso } from './avisos.ts'

const HOY = '2026-10-13'
const ok = (n: number, plazo: string | null = null, urgentes = 0) => ({ estado: 'ok', n, plazo, urgentes })
const todasVacias = () => Object.fromEntries(COLAS_AVISO.map((c) => [c, ok(0)]))

test('cola comprobada y vacía: no ocupa sitio', () => {
  assert.equal(avisoDeCola('quejas', ok(0), HOY), null)
})

test('cola que no se pudo leer (o con forma rara): línea «No se han podido comprobar», nunca vacía', () => {
  for (const v of [{ estado: 'error' }, null, undefined, { estado: 'ok' }, { estado: 'ok', n: 1, urgentes: 0, plazo: 'mañana' }]) {
    const a = avisoDeCola('supresiones', v, HOY)
    assert.equal(a?.nivel, 'no_comprobado', JSON.stringify(v))
    assert.equal(a?.n, null)
    assert.match(a?.texto ?? '', /^No se han podido comprobar las supresiones RGPD/)
  }
})

test('con plazo: texto, días restantes, urgente si el puerto lo cuenta urgente', () => {
  const a = avisoDeCola('quejas', ok(2, '2026-10-18', 1), HOY)
  assert.deepEqual(a, {
    tipo: 'quejas', nivel: 'urgente', texto: '2 quejas abiertas · plazo 18/10/2026 (5 d)', n: 2, plazo: '2026-10-18', diasRestantes: 5,
    href: '/correduria?s=hoy',
  })
  assert.equal(avisoDeCola('partes', ok(1, '2026-10-10', 1), HOY)?.texto, '1 parte del portal sin mirar · plazo vencido el 10/10/2026')
  assert.equal(avisoDeCola('cambios_cuenta', ok(1), HOY)?.nivel, 'aviso')
})

test('ingesta: al día no sale; sin comprobar o con pérdida sí (mismo veredicto que su pantalla)', () => {
  assert.equal(avisoDeIngesta({ estado: 'error', motivo: 'red' })?.nivel, 'no_comprobado')
  assert.equal(avisoDeIngesta({ estado: 'sin_configurar' })?.nivel, 'no_comprobado')
  assert.equal(avisoDeIngesta(null)?.nivel, 'no_comprobado', 'en el servidor «no contestó» es «no se pudo comprobar»')
})

test('puerto caído: UNA línea lo dice (no nueve), y la ingesta se sigue diciendo aparte', () => {
  const r = componerAvisos(502, { estado: 'error', motivo: 'red' }, { estado: 'error', motivo: 'red' }, HOY)
  assert.deepEqual(r.avisos.map((a) => [a.tipo, a.nivel]), [['puerto', 'no_comprobado'], ['ingesta', 'no_comprobado']])
  assert.match(componerAvisos(503, { estado: 'sin_configurar' }, null, HOY).avisos[0].texto, /falta conectar/)
})

test('todo comprobado y vacío + ingesta sin leer → solo la línea de la ingesta', () => {
  const r = componerAvisos(200, { estado: 'ok', hoy: HOY, colas: todasVacias() }, { estado: 'error', motivo: 'red' }, HOY)
  assert.deepEqual(r.avisos.map((a) => a.tipo), ['ingesta'])
})

test('una cola que FALTA en la respuesta del puerto sale como no comprobada', () => {
  const colas = todasVacias()
  delete (colas as Record<string, unknown>).supresiones
  const r = componerAvisos(200, { estado: 'ok', hoy: HOY, colas }, null, HOY)
  assert.ok(r.avisos.some((a) => a.tipo === 'supresiones' && a.nivel === 'no_comprobado'))
})

test('orden: urgentes, luego no comprobadas, luego avisos; dentro, el plazo más cercano primero', () => {
  const av = (tipo: Aviso['tipo'], nivel: Aviso['nivel'], plazo: string | null): Aviso => ({ tipo, nivel, plazo, texto: '', n: 1, diasRestantes: null, href: '' })
  const r = ordenarAvisos([av('cambios_cuenta', 'aviso', null), av('quejas', 'urgente', '2026-10-20'), av('ingesta', 'no_comprobado', null), av('partes', 'urgente', '2026-10-15')])
  assert.deepEqual(r.map((a) => a.tipo), ['partes', 'quejas', 'ingesta', 'cambios_cuenta'])
})

test('las colas de plataforma y las de asegura son LAS MISMAS (una nueva en un lado no se pierde)', () => {
  const src = readFileSync(join(import.meta.dirname, '../../../asegura/lib/avisos-mesa-reglas.ts'), 'utf8')
  const bloque = src.slice(src.indexOf('export const COLAS_AVISO = ['), src.indexOf('] as const'))
  const deAsegura = [...bloque.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  assert.deepEqual(deAsegura, [...COLAS_AVISO])
})
