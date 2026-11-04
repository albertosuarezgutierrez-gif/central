// 0.3.46 · Permisos de navegación de BD: alcance por modo de lo que viaja al worker (asegura). La validación es la del módulo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { permisosNavegacionDe } from '@central/module-tarificacion'
import { entradasParaPermisos, permisosParaWorker } from './tarificador-permisos-navegacion-reglas.ts'

const E = 'pelayo:presupuestos:auto'
const ruta = { id: '00000000-0000-4000-8000-000000000001', entrada: E, tipo: 'ruta_tolerada', datos: { origen: 'https://acceso12.pelayo.com', ruta: '/oauth2/rest/authorize', pulsable: false }, activo: true }
const avance = { id: '00000000-0000-4000-8000-000000000002', entrada: E, tipo: 'avance_texto', datos: { texto: 'Aceptar', origen: 'https://mediadores.pelayo.com', rutaMarco: '/portalmediador-nuevo-presupuesto', tag: 'button', contenedor: 'pelayo-modal', maxUsos: 2 }, activo: true }
const emitir = { ...avance, id: '00000000-0000-4000-8000-000000000003', datos: { ...avance.datos, texto: 'Emitir' } }
const T = { compania: 'pelayo', ramo: 'auto' }

test('emisión y humo: ni se lee la BD ni viaja nada', () => {
  for (const modo of ['emision', 'humo'] as const) {
    assert.deepEqual(entradasParaPermisos(modo, 'pelayo', 'auto', E), [])
    assert.equal(permisosParaWorker(modo, { ...T, entrada: E }, [ruta, avance]).filas, null)
  }
})

test('exploración/pilotaje: las de SU entrada, canónicas; la del verbo final se queda en asegura', () => {
  for (const modo of ['exploracion', 'pilotaje'] as const) {
    assert.deepEqual(entradasParaPermisos(modo, 'pelayo', 'auto', E), [E])
    const r = permisosParaWorker(modo, { ...T, entrada: E }, [ruta, avance, emitir])
    assert.equal(r.filas?.length, 2)
    assert.deepEqual(r.ignorados.map((i) => i.motivo), ['texto_fuera_de_lista'])
    // Lo que llega al worker se revalida igual (mismo resultado, sin ignorados).
    const w = permisosNavegacionDe(E, r.filas)
    assert.deepEqual(w.ignorados, [])
    assert.equal(w.permisos.avances[0]?.texto, 'aceptar')
  }
  assert.equal(permisosParaWorker('exploracion', { ...T, entrada: 'x:y:z' }, [ruta]).filas, null)
  assert.deepEqual(entradasParaPermisos('exploracion', 'pelayo', 'auto', null), [])
})

test('tarificar: solo RUTAS de las entradas de su compañía/ramo; avances nunca', () => {
  assert.deepEqual(entradasParaPermisos('tarificar', 'pelayo', 'auto', null), [E])
  const r = permisosParaWorker('tarificar', { ...T, entrada: null }, [ruta, avance])
  assert.deepEqual(r.filas?.map((f) => f.tipo), ['ruta_tolerada'])
  assert.deepEqual(r.ignorados.map((i) => i.motivo), ['no_aplica_tarificar'])
  assert.equal(permisosParaWorker('tarificar', { compania: 'nadie', ramo: 'auto', entrada: null }, [ruta]).filas, null)
})

test('fail-closed: filas ilegibles o vacías → nada', () => {
  for (const f of [null, undefined, 'x', { filas: [] }, []]) assert.equal(permisosParaWorker('exploracion', { ...T, entrada: E }, f).filas, null)
})

test('(4) migración: TRUNCATE bloqueado por trigger en las dos tablas y revocado explícitamente a prisma_seguros', () => {
  const sql = readFileSync(new URL('../prisma/sql/2026-11-04d_tarificador_permisos_navegacion.sql', import.meta.url), 'utf8')
  const ejecutable = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
  for (const t of ['tarificador_permisos_navegacion', 'tarificador_permisos_navegacion_auditoria'])
    assert.match(ejecutable, new RegExp(`BEFORE TRUNCATE ON seguros\\.${t}\\s+FOR EACH STATEMENT`), t)
  assert.match(ejecutable, /REVOKE TRUNCATE ON seguros\.tarificador_permisos_navegacion, seguros\.tarificador_permisos_navegacion_auditoria FROM prisma_seguros/)
})
