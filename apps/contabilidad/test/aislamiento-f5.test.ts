// Aislamiento por empresa en las CONSULTAS de la fase 5 (segunda capa, además de RLS): cada SQL de `repoF5Sql` lleva el filtro explícito de la
// empresa con la que se construyó, enlazado como parámetro. Y la fase 5 no emite DELETE ni UPDATE de asientos/apuntes (solo `estado` del ejercicio y la baja).
// Cepo visto fallar el 05/11/2026: quitando `WHERE empresa_id = ${e}::uuid AND ref = ${ref}` de `activoPorRef` → rojo; restaurado → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { repoF5Sql } from '../lib/repo-f5.ts'
import type { TxSql } from '../lib/rls.ts'

const E = '00000000-0000-4000-8000-00000000000a'
type Llamada = { sql: string; valores: unknown[] }

function tx(): { tx: TxSql; llamadas: Llamada[] } {
  const llamadas: Llamada[] = []
  const fila = {
    id: '00000000-0000-4000-8000-000000000001', anio: 2026, inicio: '2026-01-01', fin: '2026-12-31', estado: 'abierto', cuenta: '572', debe: 1, haber: 1, numero: 1, ejercicio: 2026,
    fecha: '2026-01-02', concepto: 'x', origen_tipo: null, origen_ref: null, asiento_id: '00000000-0000-4000-8000-000000000002', orden: 1, documento: null,
    resultado_cent: 0, asiento_regularizacion_id: null, asiento_cierre_id: null, asiento_apertura_id: null, cerrado_en: new Date('2026-01-01'),
    ref: 'A-1', origen: 'manual', ref_externa: 'X', descripcion: 'd', categoria: 'mobiliario', cuenta_activo: '216', cuenta_amort_acum: '281', cuenta_gasto: '681', fecha_alta: '2026-01-01',
    valor_cent: 100, residual_cent: 0, porcentaje_pb: 1000, metodo: 'lineal', ya_contabilizado: true, asiento_alta_id: null, fecha_baja: null, precio_venta_cent: null,
    resultado_baja_cent: null, asiento_baja_id: null, version: 1, porcentaje_max_pb: 1000, periodo_max_anios: 10, tipo: 'gasto', cuenta_origen: '625', importe_cent: 100,
    inicio_: '2026-01-01', siguiente: 1,
  }
  const t: TxSql = {
    async $queryRaw<T>(q: TemplateStringsArray, ...valores: unknown[]) { llamadas.push({ sql: q.join('?'), valores }); return [fila] as unknown as T },
    async $executeRaw(q: TemplateStringsArray, ...valores: unknown[]) { llamadas.push({ sql: q.join('?'), valores }); return 1 },
  }
  return { tx: t, llamadas }
}

test('cada método de RepoF5 filtra por empresa_id y enlaza la empresa como parámetro', async () => {
  const { tx: t, llamadas } = tx()
  const r = repoF5Sql(t, E)
  const ficha = { ref: 'A-1', origen: 'manual', refExterna: 'X', descripcion: 'd', categoria: 'mobiliario', cuentaActivo: '216', cuentaAmortizacionAcumulada: '281', cuentaGasto: '681', fechaAlta: '2026-01-01', valorAdquisicion: 100, valorResidual: 0, porcentajePb: 1000, metodo: 'lineal' as const, yaContabilizado: true }
  const llamar: [string, () => Promise<unknown>][] = [
    ['ejercicioBloqueado', () => r.ejercicioBloqueado(2026)],
    ['cerrarEjercicio', () => r.cerrarEjercicio(2026)],
    ['saldosEjercicio(sinCierre)', () => r.saldosEjercicio(2026, { sinCierre: true })],
    ['saldosEjercicio(todo)', () => r.saldosEjercicio(2026, { sinCierre: false })],
    ['asientosEjercicio', () => r.asientosEjercicio(2026, 10)],
    ['asientoPorOrigen', () => r.asientoPorOrigen('amortizacion', 'amortizacion:2026')],
    ['cierre', () => r.cierre(2026)],
    ['cierres', () => r.cierres()],
    ['insertarCierre', () => r.insertarCierre({ anio: 2026, resultado: 0, asientoRegularizacionId: null, asientoCierreId: null, asientoAperturaId: null, usuarioId: null })],
    ['activos', () => r.activos()],
    ['activoPorRef', () => r.activoPorRef('A-1')],
    ['activoPorOrigen', () => r.activoPorOrigen('manual', 'X')],
    ['insertarActivo', () => r.insertarActivo({ ficha, usuarioId: null, asientoAltaId: null })],
    ['darDeBajaActivo', () => r.darDeBajaActivo('A-1', { fecha: '2026-06-01', precioVenta: null, resultado: 0, asientoId: E })],
    ['tablaAmortizacion', () => r.tablaAmortizacion()],
    ['guardarTablaAmortizacion', () => r.guardarTablaAmortizacion([{ categoria: 'x', descripcion: 'x', cuentaActivo: '216', cuentaAmortizacionAcumulada: '281', cuentaGasto: '681', porcentajeMaximoPb: 1, periodoMaximoAnios: 1, certeza: 'media' }], null)],
    ['periodificaciones', () => r.periodificaciones()],
    ['insertarPeriodificacion', () => r.insertarPeriodificacion({ ref: 'P', tipo: 'gasto', descripcion: 'd', cuentaOrigen: '625', importe: 1, inicio: '2026-01-01', fin: '2026-02-01' }, null)],
  ]
  for (const [nombre, fn] of llamar) {
    llamadas.length = 0
    await fn()
    assert.ok(llamadas.length > 0, nombre)
    for (const l of llamadas) {
      assert.match(l.sql, /empresa_id\s*=\s*\?::uuid|VALUES \(\?::uuid/, `${nombre}: filtra por empresa_id`)
      assert.ok(l.valores.includes(E), `${nombre}: la empresa va enlazada como parámetro`)
    }
  }
})

test('la fase 5 no emite DELETE ni UPDATE de asientos/apuntes/auditoría/reglas; sus UPDATE solo tocan estado del ejercicio y la baja del activo', () => {
  const src = ['repo-f5.ts', 'cierre.ts', 'cierre-carga.ts'].map((f) => readFileSync(join(import.meta.dirname, '..', 'lib', f), 'utf8')).join('\n')
  assert.doesNotMatch(src, /DELETE\s+FROM|TRUNCATE/i)
  const updates = [...src.matchAll(/UPDATE\s+contabilidad\.(\w+)/gi)].map((m) => m[1])
  assert.deepEqual([...new Set(updates)].sort(), ['activos_fijos', 'ejercicios'])
  assert.match(src, /UPDATE contabilidad\.ejercicios SET estado = 'cerrado'/)
})
