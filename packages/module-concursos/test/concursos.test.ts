// Tests de la lógica PURA del módulo de concursos.
// Se ejecutan con el runner integrado de Node (type-stripping): `node --test`.
// Importan los módulos puros con extensión .ts explícita; ninguno tiene imports
// de runtime (sólo `import type`, que se borra), por eso no requieren bundler.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { construirPromptPliego, MAX_PLIEGO_CHARS } from '../src/prompts.ts'
import { limpiarJSON, parseFichaConcurso } from '../src/parsing.ts'
import { derivarChecklist } from '../src/checklist.ts'
import {
  calcularGarantias,
  umbralBajaTemeraria,
  calcularPuntuacionEconomica,
  totalPuntos,
  round2,
} from '../src/scoring.ts'
import { evaluarGoNoGo } from '../src/redflags.ts'
import type { FichaConcurso } from '../src/types.ts'

// ── Helper: una ficha base válida ──────────────────────────────────────────
function fichaBase(over: Partial<FichaConcurso> = {}): FichaConcurso {
  return {
    objeto: 'Servicio de limpieza de un colegio',
    tipo_contrato: 'servicios',
    procedimiento: 'abierto',
    lotes: 0,
    plazos: {},
    solvencia: [],
    garantias: {},
    criterios: [],
    documentos: [],
    ...over,
  }
}

// ── prompts ─────────────────────────────────────────────────────────────────
test('construirPromptPliego: produce system y user no vacíos e incluye el texto', () => {
  const { system, user } = construirPromptPliego('PCAP del expediente 2026/01')
  assert.ok(system.length > 0)
  assert.ok(user.includes('PCAP del expediente 2026/01'))
  assert.ok(user.includes('JSON'))
})

test('construirPromptPliego: recorta el pliego a MAX_PLIEGO_CHARS', () => {
  const { user } = construirPromptPliego('x'.repeat(MAX_PLIEGO_CHARS + 5000))
  // El user lleva el esquema + el texto recortado; el texto nunca supera el tope.
  assert.ok(user.length < MAX_PLIEGO_CHARS + 2000)
})

// ── parsing: limpiarJSON ──────────────────────────────────────────────────────
test('limpiarJSON: quita las vallas de markdown', () => {
  assert.equal(limpiarJSON('```json\n{"a":1}\n```'), '{"a":1}')
  assert.equal(limpiarJSON('```\n{"a":1}\n```'), '{"a":1}')
})

test('limpiarJSON: recorta texto suelto alrededor del objeto', () => {
  assert.equal(limpiarJSON('Aquí tienes: {"a":1} ¡listo!'), '{"a":1}')
})

// ── parsing: parseFichaConcurso ──────────────────────────────────────────────
test('parseFichaConcurso: parsea un JSON limpio y normaliza enums', () => {
  const raw = JSON.stringify({
    objeto: 'Limpieza CEIP',
    tipo_contrato: 'SERVICIOS',
    procedimiento: 'abierto',
    presupuesto_base: '120.000,50 €',
    lotes: 2,
    plazos: { fin_presentacion: '2026-07-01', ejecucion_meses: 12 },
    criterios: [
      { nombre: 'Precio', puntos: 51, tipo: 'automatico', sobre: 'economico', formula: 'mayor baja' },
      { nombre: 'Memoria', puntos: 49, tipo: 'juicio_valor', sobre: 'tecnico' },
    ],
    documentos: [{ nombre: 'DEUC', sobre: 'administrativo', obligatorio: true }],
  })
  const f = parseFichaConcurso(raw)
  assert.equal(f.objeto, 'Limpieza CEIP')
  assert.equal(f.tipo_contrato, 'servicios')
  assert.equal(f.presupuesto_base, 120000.5)
  assert.equal(f.lotes, 2)
  assert.equal(f.criterios.length, 2)
  assert.equal(totalPuntos(f), 100)
})

test('parseFichaConcurso: enum desconocido cae al fallback', () => {
  const f = parseFichaConcurso('{"objeto":"x","tipo_contrato":"banana","procedimiento":"raro","lotes":1}')
  assert.equal(f.tipo_contrato, 'otro')
  assert.equal(f.procedimiento, 'otro')
})

test('parseFichaConcurso: JSON inválido lanza error', () => {
  assert.throws(() => parseFichaConcurso('no soy json'), /JSON válido/)
})

test('parseFichaConcurso: descarta criterios/documentos sin nombre', () => {
  const f = parseFichaConcurso(JSON.stringify({
    objeto: 'x', tipo_contrato: 'obras', procedimiento: 'abierto', lotes: 0,
    criterios: [{ puntos: 10 }, { nombre: 'Plazo', puntos: 5, tipo: 'automatico' }],
    documentos: [{ sobre: 'tecnico' }],
  }))
  assert.equal(f.criterios.length, 1)
  assert.equal(f.documentos.length, 0)
})

// ── checklist ─────────────────────────────────────────────────────────────────
test('derivarChecklist: añade los administrativos base si faltan', () => {
  const items = derivarChecklist(fichaBase())
  const admin = items.filter(i => i.sobre === 'administrativo')
  assert.ok(admin.some(i => /DEUC/i.test(i.documento)))
  assert.ok(admin.some(i => /AEAT/i.test(i.documento)))
  assert.ok(admin.some(i => /Seguridad Social/i.test(i.documento)))
})

test('derivarChecklist: no duplica un documento ya presente en el pliego', () => {
  const f = fichaBase({ documentos: [{ nombre: 'Declaración responsable (DEUC o modelo del pliego)', sobre: 'administrativo', obligatorio: true, modelo: 'DEUC' }] })
  const items = derivarChecklist(f)
  const deuc = items.filter(i => /declaración responsable/i.test(i.documento))
  assert.equal(deuc.length, 1)
})

test('derivarChecklist: con criterios de juicio de valor añade la memoria técnica', () => {
  const f = fichaBase({ criterios: [{ nombre: 'Calidad', puntos: 40, tipo: 'juicio_valor', sobre: 'tecnico' }] })
  const items = derivarChecklist(f)
  assert.ok(items.some(i => i.sobre === 'tecnico' && /memoria técnica/i.test(i.documento)))
})

test('derivarChecklist: ordena por sobre (administrativo→técnico→económico) e inicializa hecho=false', () => {
  const f = fichaBase({ criterios: [{ nombre: 'Precio', puntos: 100, tipo: 'automatico', sobre: 'economico' }] })
  const items = derivarChecklist(f)
  const orden = items.map(i => i.sobre)
  const idxAdmin = orden.indexOf('administrativo')
  const idxEco = orden.lastIndexOf('economico')
  assert.ok(idxAdmin < idxEco)
  assert.ok(items.every(i => i.hecho === false))
})

// ── scoring: garantías ────────────────────────────────────────────────────────
test('calcularGarantias: definitiva 5% por defecto sobre el presupuesto', () => {
  const g = calcularGarantias(fichaBase({ presupuesto_base: 100000 }))
  assert.equal(g.definitiva, 5000)
  assert.equal(g.provisional, undefined)
})

test('calcularGarantias: usa el importe de adjudicación y el % del pliego', () => {
  const f = fichaBase({ presupuesto_base: 100000, garantias: { definitiva_pct: 3, provisional_pct: 2 } })
  const g = calcularGarantias(f, 80000)
  assert.equal(g.definitiva, 2400)   // 3% de 80.000
  assert.equal(g.provisional, 2000)  // 2% de 100.000 (presupuesto)
})

// ── scoring: baja temeraria ───────────────────────────────────────────────────
test('umbralBajaTemeraria: 1 licitador = presupuesto − 25%', () => {
  assert.equal(umbralBajaTemeraria([90000], 100000).umbral, 75000)
})

test('umbralBajaTemeraria: 1 licitador sin presupuesto = null', () => {
  assert.equal(umbralBajaTemeraria([90000]).umbral, null)
})

test('umbralBajaTemeraria: 2 licitadores = 20% bajo la mayor', () => {
  assert.equal(umbralBajaTemeraria([90000, 100000]).umbral, 80000)
})

test('umbralBajaTemeraria: 3+ licitadores = 10% bajo la media (descartando altas)', () => {
  // ofertas 80,90,100 → media 90; la de 100 supera media+10% (99) → se descarta
  // → media de [80,90] = 85 → umbral 85 − 10% = 76.500 (art. 85.4 RGLCAP)
  assert.equal(umbralBajaTemeraria([80000, 90000, 100000]).umbral, 76500)
  // Sin ofertas altas que descartar: 80,85,90 → media 85 → umbral 76.500
  assert.equal(umbralBajaTemeraria([80000, 85000, 90000]).umbral, 76500)
})

test('umbralBajaTemeraria: sin ofertas = null', () => {
  assert.equal(umbralBajaTemeraria([]).umbral, null)
})

// ── scoring: puntuación económica ─────────────────────────────────────────────
test('calcularPuntuacionEconomica: proporcional inversa premia a la más barata', () => {
  const ofertas = [80000, 100000]
  assert.equal(calcularPuntuacionEconomica(80000, ofertas, 50), 50)            // la mínima → máximo
  assert.equal(calcularPuntuacionEconomica(100000, ofertas, 50), 40)           // 50 * 80/100
})

test('calcularPuntuacionEconomica: lineal a la baja entre presupuesto y oferta mínima', () => {
  const ofertas = [80000, 90000]
  const p = calcularPuntuacionEconomica(90000, ofertas, 50, { formula: 'lineal_baja', presupuestoBase: 100000 })
  // (100-90)/(100-80) * 50 = 25
  assert.equal(p, 25)
})

test('calcularPuntuacionEconomica: oferta inválida = 0', () => {
  assert.equal(calcularPuntuacionEconomica(0, [80000], 50), 0)
})

// ── redflags: Go / No-Go ──────────────────────────────────────────────────────
const HOY = new Date('2026-06-10')

test('evaluarGoNoGo: sin banderas → verde', () => {
  const r = evaluarGoNoGo(fichaBase({ plazos: { fin_presentacion: '2026-07-01' } }), {}, HOY)
  assert.equal(r.semaforo, 'verde')
  assert.equal(r.banderas.length, 0)
})

test('evaluarGoNoGo: solvencia económica insuficiente → rojo (bloqueante)', () => {
  const f = fichaBase({ solvencia: [{ ambito: 'economica', descripcion: 'volumen', importe_minimo: 500000 }] })
  const r = evaluarGoNoGo(f, { volumen_negocio_anual: 100000 }, HOY)
  assert.equal(r.semaforo, 'rojo')
  assert.ok(r.banderas.some(b => b.severidad === 'bloqueante'))
})

test('evaluarGoNoGo: plazo ya vencido → rojo', () => {
  const r = evaluarGoNoGo(fichaBase({ plazos: { fin_presentacion: '2026-06-01' } }), {}, HOY)
  assert.equal(r.semaforo, 'rojo')
})

test('evaluarGoNoGo: plazo muy próximo → ámbar (aviso)', () => {
  const r = evaluarGoNoGo(fichaBase({ plazos: { fin_presentacion: '2026-06-11' } }), {}, HOY)
  assert.equal(r.semaforo, 'ambar')
})

test('evaluarGoNoGo: no puede avalar y se exige garantía → rojo', () => {
  const f = fichaBase({ garantias: { definitiva_pct: 5 }, plazos: { fin_presentacion: '2026-07-01' } })
  const r = evaluarGoNoGo(f, { puede_avalar: false }, HOY)
  assert.equal(r.semaforo, 'rojo')
})

// ── util ──────────────────────────────────────────────────────────────────────
test('round2: redondea a 2 decimales', () => {
  assert.equal(round2(5.005), 5.01)
  assert.equal(round2(2400), 2400)
})
