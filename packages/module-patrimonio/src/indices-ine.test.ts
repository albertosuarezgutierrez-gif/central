// Índices del INE: parseo del JSON de Tempus (muestra embebida, sin red), validación y plan de inserción.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parsearSerieIne, validarIndice, periodoEsperado, periodoAtras, planificarInserciones,
} from './indices-ine.ts'

// Forma real de DATOS_SERIE (campos recortados). Fecha = medianoche Madrid → UTC del día anterior.
const muestra = {
  COD: 'IPC251852',
  Nombre: 'Total Nacional. Índice general. Variación anual.',
  Data: [
    { Fecha: 1756677600000, FK_TipoDato: 3, FK_Periodo: 9, Anyo: 2025, Valor: 3.0, Secreto: false },
    { Fecha: 1759269600000, FK_TipoDato: 3, FK_Periodo: 10, Anyo: 2025, Valor: 3.1, Secreto: false },
    { Fecha: 1761951600000, FK_TipoDato: 3, FK_Periodo: 11, Anyo: 2025, Valor: 3.0, Secreto: false },
  ],
}

test('parsea la muestra del INE a periodo YYYY-MM + pct, ordenado', () => {
  const rev = { ...muestra, Data: [...muestra.Data].reverse() }
  assert.deepEqual(parsearSerieIne(rev, 'IPC'), [
    { periodo: '2025-09', pct: 3.0 }, { periodo: '2025-10', pct: 3.1 }, { periodo: '2025-11', pct: 3.0 },
  ])
})

test('sin Anyo/FK_Periodo usa Fecha sin deslizarse un mes', () => {
  const r = parsearSerieIne({ Data: [{ Fecha: 1759269600000, Valor: 2.5 }] }, 'IRAV') // 2025-10-01 00:00 Madrid
  assert.deepEqual(r, [{ periodo: '2025-10', pct: 2.5 }])
})

test('formato roto lanza formato_ine (nunca devuelve parcial)', () => {
  assert.throws(() => parsearSerieIne(null, 'IPC'), /formato_ine/)
  assert.throws(() => parsearSerieIne({}, 'IPC'), /formato_ine/)
  assert.throws(() => parsearSerieIne({ Data: [] }, 'IPC'), /formato_ine/)
  assert.throws(() => parsearSerieIne({ Data: [{ Anyo: 2025, FK_Periodo: 3, Valor: null }] }, 'IPC'), /sin valor/)
  assert.throws(() => parsearSerieIne({ Data: [{ Valor: 1 }] }, 'IPC'), /sin periodo/)
  assert.throws(() => parsearSerieIne({ Data: [{ Anyo: 2025, FK_Periodo: 3, Valor: '3,1' }] }, 'IPC'), /sin valor/)
})

test('validarIndice: serie buena pasa', () => {
  assert.deepEqual(validarIndice(parsearSerieIne(muestra, 'IPC')), { ok: true })
})

test('validarIndice rechaza rango, NaN, periodo inválido, repetido y huecos', () => {
  const mal = (p: Array<{ periodo: string; pct: number }>) => {
    const r = validarIndice(p)
    assert.equal(r.ok, false)
    return r.ok ? '' : r.errores.join('|')
  }
  assert.match(mal([{ periodo: '2025-10', pct: 20.5 }]), /fuera de rango/)
  assert.match(mal([{ periodo: '2025-10', pct: -10.1 }]), /fuera de rango/)
  assert.match(mal([{ periodo: '2025-10', pct: Number.NaN }]), /no numérico/)
  assert.match(mal([{ periodo: '2025-13', pct: 1 }]), /periodo inválido/)
  assert.match(mal([{ periodo: '2025-10', pct: 1 }, { periodo: '2025-10', pct: 2 }]), /repetido/)
  assert.match(mal([{ periodo: '2025-08', pct: 1 }, { periodo: '2025-10', pct: 2 }]), /hueco/)
  assert.match(mal([]), /vacía/)
  assert.equal(validarIndice([{ periodo: '2025-10', pct: 20 }, { periodo: '2025-11', pct: -10 }]).ok, true)
  assert.equal(validarIndice([{ periodo: '2025-12', pct: 1 }, { periodo: '2026-01', pct: 1 }]).ok, true) // cruza año
})

test('periodoEsperado relativo a hoy inyectado (cruza de año)', () => {
  assert.equal(periodoEsperado('IPC', '2026-10-20'), '2026-09')
  assert.equal(periodoEsperado('IRAV', '2026-10-20'), '2026-09')
  assert.equal(periodoEsperado('IPC', '2026-01-20'), '2025-12')
  assert.equal(periodoEsperado('IRAV', '2026-01-20'), '2025-12')
  assert.equal(periodoAtras('2026-03-31', 12), '2025-03')
  assert.throws(() => periodoAtras('mañana', 1), /fecha_invalida/)
})

test('planificarInserciones: nuevo = original, valor cambiado = revisión, igual = nada', () => {
  const desc = [{ periodo: '2025-09', pct: 3.0 }, { periodo: '2025-10', pct: 3.2 }, { periodo: '2025-11', pct: 3.0 }]
  const guard = [{ periodo: '2025-09', pct: 3.0 }, { periodo: '2025-10', pct: 3.1 }]
  assert.deepEqual(planificarInserciones(desc, guard), [
    { periodo: '2025-10', pct: 3.2, revisado: true },
    { periodo: '2025-11', pct: 3.0, revisado: false },
  ])
  // segunda pasada con lo ya guardado: nada
  const guard2 = [...guard, { periodo: '2025-10', pct: 3.2 }, { periodo: '2025-11', pct: 3.0 }]
  assert.deepEqual(planificarInserciones(desc, guard2), [])
})
