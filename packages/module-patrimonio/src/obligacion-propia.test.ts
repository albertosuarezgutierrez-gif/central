// Obligaciones PROPIAS de un inmueble (25/10/2026): validación, «hecha» y cómo entran en el calendario. `hoy` inyectado.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CATALOGO_CATEGORIAS,
  CATEGORIAS_OBLIGACION_PROPIA,
  MAX_DESCRIPCION,
  calendarioPatrimonio,
  periodicidadDeMeses,
  puede,
  trasMarcarHecha,
  validarObligacionPropia,
  vencimientoDeObligacion,
  type ObligacionInmueble,
} from './index.ts'

const HOY = '2026-10-25'
const base = { categoria: 'ibi', vence: '2026-11-10', periodicidad: 'anual' }

test('el catálogo es cerrado y cada categoría tiene etiqueta y aviso', () => {
  assert.deepEqual([...CATEGORIAS_OBLIGACION_PROPIA], ['ibi', 'comunidad', 'caldera', 'ite', 'fin_seguro', 'basuras', 'hipoteca', 'otro'])
  for (const c of CATEGORIAS_OBLIGACION_PROPIA) assert.ok(CATALOGO_CATEGORIAS[c].etiqueta.length > 0 && CATALOGO_CATEGORIAS[c].avisoDias > 0)
})

test('validar: caso bueno, texto libre recortado y vacío = null', () => {
  const r = validarObligacionPropia({ ...base, descripcion: '  Recibo   segundo plazo \n' })
  assert.ok(r.ok)
  assert.equal(r.ok && r.valor.descripcion, 'Recibo   segundo plazo')
  const v = validarObligacionPropia({ ...base, descripcion: '   ' })
  assert.ok(v.ok && v.valor.descripcion === null)
})

test('validar: cada campo malo se rechaza con SU campo', () => {
  const casos: [unknown, string][] = [
    [null, 'categoria'],
    [{ ...base, categoria: 'prestamo' }, 'categoria'],
    [{ ...base, categoria: undefined }, 'categoria'],
    [{ ...base, vence: '2026-02-30' }, 'vence'],
    [{ ...base, vence: null }, 'vence'],
    [{ ...base, vence: '1999-12-31' }, 'vence'],
    [{ ...base, vence: '2101-01-01' }, 'vence'],
    [{ ...base, periodicidad: 'semanal' }, 'periodicidad'],
    [{ ...base, periodicidad: 12 }, 'periodicidad'],
    [{ ...base, descripcion: 5 }, 'descripcion'],
    [{ ...base, descripcion: 'x'.repeat(MAX_DESCRIPCION + 1) }, 'descripcion'],
    [{ ...base, categoria: 'otro' }, 'descripcion'],
    [{ ...base, categoria: 'otro', descripcion: '  ' }, 'descripcion'],
  ]
  for (const [c, campo] of casos) {
    const r = validarObligacionPropia(c)
    assert.ok(!r.ok && r.campo === campo, `${JSON.stringify(c)} debería fallar en ${campo}`)
  }
  assert.ok(validarObligacionPropia({ ...base, categoria: 'otro', descripcion: 'Renovar el DNI del portero' }).ok)
})

test('hipoteca (27/10/2026): categoría válida, sin texto obligatorio, mensual o única', () => {
  for (const periodicidad of ['mensual', 'unica'] as const) {
    const r = validarObligacionPropia({ ...base, categoria: 'hipoteca', periodicidad })
    assert.ok(r.ok && r.valor.categoria === 'hipoteca' && r.valor.descripcion === null, periodicidad)
  }
  assert.equal(CATALOGO_CATEGORIAS.hipoteca.descripcionObligatoria, false)
})

test('periodicidad guardada: 1/3/12/null se leen; otro número NO se adivina', () => {
  assert.equal(periodicidadDeMeses(null), 'unica')
  assert.equal(periodicidadDeMeses(1), 'mensual')
  assert.equal(periodicidadDeMeses(3), 'trimestral')
  assert.equal(periodicidadDeMeses(12), 'anual')
  assert.equal(periodicidadDeMeses(7), null)
})

test('«hecha»: única se archiva; recurrente salta al primer ciclo futuro desde la fecha ORIGINAL', () => {
  assert.deepEqual(trasMarcarHecha('2026-10-20', null, HOY), { accion: 'archivar' })
  assert.deepEqual(trasMarcarHecha('2026-10-20', 12, HOY), { accion: 'avanzar', vence: '2027-10-20' })
  // Llevaba meses sin marcar: no devuelve una fecha ya pasada.
  assert.deepEqual(trasMarcarHecha('2026-04-05', 1, HOY), { accion: 'avanzar', vence: '2026-11-05' })
  // Hoy mismo no cuenta como «futuro»: el siguiente ciclo.
  assert.deepEqual(trasMarcarHecha('2026-09-25', 1, HOY), { accion: 'avanzar', vence: '2026-11-25' })
  // Fin de mes sin deriva: 31/01 mensual → 28/02, pero 31/03 (no 28/03).
  assert.deepEqual(trasMarcarHecha('2026-01-31', 1, '2026-02-28'), { accion: 'avanzar', vence: '2026-03-31' })
  // Periodicidad que no entendemos: no se inventa.
  assert.equal(trasMarcarHecha('2026-10-20', 7, HOY), null)
})

const propia = (x: Partial<ObligacionInmueble> = {}): ObligacionInmueble => ({
  id: 'o1', inmuebleId: 'i1', tipo: 'otra', aplica: true, ultima: null, vence: '2026-11-10', periodicidadMeses: 12, categoria: 'ibi', descripcion: null, ...x,
})

test('en el calendario: etiqueta y aviso de SU categoría, mismo estado que una derivada', () => {
  const v = vencimientoDeObligacion(propia(), HOY)!
  assert.equal(v.etiqueta, CATALOGO_CATEGORIAS.ibi.etiqueta)
  assert.equal(v.vence, '2026-11-10')
  assert.equal(v.estado, 'avisar') // 16 días <= 30
  assert.equal(v.dias, 16)
  assert.equal(v.clave, 'o1:2026-11-10')
  assert.equal(vencimientoDeObligacion(propia({ vence: '2027-06-01' }), HOY)!.estado, 'al_dia')
  assert.equal(vencimientoDeObligacion(propia({ vence: '2026-10-01' }), HOY)!.estado, 'vencida')
  // La comunidad avisa 7 días antes, no 30.
  assert.equal(vencimientoDeObligacion(propia({ categoria: 'comunidad', vence: '2026-11-10' }), HOY)!.estado, 'al_dia')
  assert.equal(vencimientoDeObligacion(propia({ categoria: 'comunidad', vence: '2026-10-30' }), HOY)!.estado, 'avisar')
})

test('el texto libre llega como detalle y NO ensucia la etiqueta (campana/push)', () => {
  const v = vencimientoDeObligacion(propia({ categoria: 'otro', descripcion: 'Cambiar cerradura' }), HOY)!
  assert.equal(v.etiqueta, CATALOGO_CATEGORIAS.otro.etiqueta)
  assert.equal(v.detalle, 'Cambiar cerradura')
})

test('una propia sin fecha (no debería existir) es sin_dato, jamás al día', () => {
  const v = vencimientoDeObligacion(propia({ vence: null }), HOY)!
  assert.equal(v.estado, 'sin_dato')
  assert.equal(v.dias, null)
})

test('sin categoría sigue el camino de siempre (el tipo manda)', () => {
  const v = vencimientoDeObligacion({ ...propia({ categoria: null }), tipo: 'certificado_energetico', vence: null, periodicidadMeses: null, ultima: '2020-01-15' }, HOY)!
  assert.equal(v.vence, '2030-01-15')
  assert.equal(v.detalle, undefined)
})

test('entra en calendarioPatrimonio junto a las demás y ordena por estado', () => {
  const out = calendarioPatrimonio({ obligaciones: [propia({ id: 'a', vence: '2027-06-01' }), propia({ id: 'b', vence: '2026-10-01' })], contratos: [] }, HOY)
  assert.deepEqual(out.map((v) => v.clave), ['b:2026-10-01', 'a:2027-06-01'])
})

test('acción nueva: gestión y total pueden; nivel desconocido no', () => {
  assert.equal(puede('gestion', 'gestionar_obligaciones'), true)
  assert.equal(puede('total', 'gestionar_obligaciones'), true)
  assert.equal(puede('administrar' as never, 'gestionar_obligaciones'), false)
  assert.equal(puede(undefined, 'gestionar_obligaciones'), false)
})
