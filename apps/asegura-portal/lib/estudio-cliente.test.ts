// 🪤 El estudio que pinta la página del presupuesto (21/10/2026). Para verlo en rojo: en `interpretarEstudio` deja pasar
// un estado de celda desconocido tal cual → falla «estado raro = no figura»; o trata 'sin_estudio' como error → falla.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarEstudio, opcionesSinColumna, ordenColumnas, type ColumnaEstudio } from './estudio-cliente.ts'

const col = (id: string, p: Partial<ColumnaEstudio> = {}) => ({ id, opcionId: `o-${id}`, rol: 'oferta', compania: 'Compañía', etiqueta: id, nivel: null, precio: '1,00€/año', primaAnual: 1, estimado: true, recomendada: false, ...p })
const vista = (celdas: unknown[]) => ({ estado: 'ok', vista: { columnas: [col('a')], filas: [{ clave: 'k', etiqueta: 'K', grupo: 'danos', celdas }], narrativa: { resumen: 'r', recomendacion: 'c', etiqueta: 'Resumen preparado con IA y revisado por tu corredor' }, textoFuente: 't', notas: ['n'], leyenda: 'l' } })

test('ok, sin_estudio y error son tres cosas distintas', () => {
  assert.equal(interpretarEstudio(200, vista([{ estado: 'si', texto: 'Incluida' }])).estado, 'ok')
  assert.equal(interpretarEstudio(200, { estado: 'sin_estudio' }).estado, 'sin_estudio')
  assert.equal(interpretarEstudio(502, null).estado, 'error')
  assert.equal(interpretarEstudio(200, { estado: 'ok', vista: { columnas: 'x' } }).estado, 'error')
})

test('🪤 un estado de celda raro se pinta como «no figura», nunca como incluida/excluida', () => {
  const r = interpretarEstudio(200, vista([{ estado: 'quizas', texto: 'Incluida' }]))
  assert.ok(r.estado === 'ok')
  assert.equal(r.vista.filas[0].celdas[0].estado, 'nose')
})

test('celdas que no cuadran con las columnas = error (no se pinta a medias)', () => {
  assert.equal(interpretarEstudio(200, vista([])).estado, 'error')
})

test('orden: la recomendada primero, la póliza actual al final', () => {
  const o = ordenColumnas([col('act', { rol: 'actual' }), col('b'), col('rec', { recomendada: true })] as ColumnaEstudio[])
  assert.deepEqual(o.map((x) => x.id), ['rec', 'b', 'act'])
})

test('🪤 ninguna opción en documento se queda sin forma de aceptarla: las que no caben en el cuadro se listan', () => {
  // Para verlo en rojo: en `opcionesSinColumna` devuelve [] → falla.
  const cols = [col('a', { opcionId: 'o1' }), col('act', { rol: 'actual', opcionId: null })] as ColumnaEstudio[]
  assert.deepEqual(opcionesSinColumna(cols, [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }]).map((o) => o.id), ['o2', 'o3'])
})
