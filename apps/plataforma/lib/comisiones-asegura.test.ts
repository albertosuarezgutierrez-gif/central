import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarComisiones, nombreCompania } from './comisiones-asegura.ts'

test('401 es secreto rechazado, no «sin comisiones»', () => {
  assert.deepEqual(interpretarComisiones(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarComisiones(403, null), { estado: 'error', motivo: 'secreto_rechazado' })
})

test('sin_configurar se propaga tal cual: el puerto no está conectado', () => {
  assert.deepEqual(
    interpretarComisiones(200, { comisiones: { estado: 'sin_configurar' } }),
    { estado: 'sin_configurar' },
  )
})

test('un error de la BD de asegura llega con su motivo', () => {
  assert.deepEqual(
    interpretarComisiones(200, { comisiones: { estado: 'error' } }),
    { estado: 'error', motivo: 'asegura_error' },
  )
})

// 🚨 02/09/2026: `asegura_error` a secas era un callejón sin salida — decía que
// falló, no dónde, y la causa real (`credenciales`: la contraseña de
// prisma_seguros en el DATABASE_URL de Vercel ya no valía) solo estaba en los
// logs del pooler. La causa que clasifica asegura tiene que llegar hasta el aviso.
test('la causa de asegura viaja hasta el motivo (credenciales, permisos, esquema…)', () => {
  const r = interpretarComisiones(200, { comisiones: { estado: 'error', causa: 'credenciales' } })
  assert.deepEqual(r, { estado: 'error', motivo: 'asegura_error', causa: 'credenciales' })
})

test('sin causa NO se inventa una: el campo sencillamente no está', () => {
  const r = interpretarComisiones(200, { comisiones: { estado: 'error' } })
  assert.deepEqual(r, { estado: 'error', motivo: 'asegura_error' })
})

test('una causa que no es texto se ignora, no se pega tal cual', () => {
  const r = interpretarComisiones(200, { comisiones: { estado: 'error', causa: { url: 'postgres://u:p@h' } } })
  assert.deepEqual(r, { estado: 'error', motivo: 'asegura_error' })
})

test('una causa kilométrica se recorta: acaba en un Telegram', () => {
  const r = interpretarComisiones(200, { comisiones: { estado: 'error', causa: 'x'.repeat(500) } })
  assert.ok((r.estado === 'error' ? (r.causa ?? '') : '').length <= 40)
})

test('un devengo con mes mal formado se descarta en vez de contaminar el libro', () => {
  const r = interpretarComisiones(200, {
    comisiones: {
      estado: 'ok', periodos: [],
      devengos: [
        { companiaCodigo: 'C0109', mes: '2026-04', bruto: 120.88, recibos: 4 },
        { companiaCodigo: 'C0109', mes: 'abril', bruto: 999, recibos: 1 },
      ],
      cobertura: [],
    },
  })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') {
    assert.equal(r.devengos.length, 1)
    assert.equal(r.devengos[0].bruto, 120.88)
  }
})

// 🚨 20/09/2026. `comisionesCartera` sumaba `importeEiac(r.comisionBruta) ?? 0`:
// un recibo cobrado cuya comisión no se puede leer entraba como 0 € y bajaba el
// devengado SIN dejar hueco. Es la cifra contra la que se decide si reclamar a
// una compañía, así que los ilegibles se cuentan aparte — y «asegura todavía no
// me lo dice» (null) no puede leerse como «los he mirado y se leen todos» (0).
test('los recibos con comisión ilegible se cuentan aparte, y su ausencia NO es 0', () => {
  const con = interpretarComisiones(200, {
    comisiones: {
      estado: 'ok', periodos: [], cobertura: [],
      devengos: [{ companiaCodigo: 'C0109', mes: '2026-04', bruto: 120.88, recibos: 4, ilegibles: 2 }],
    },
  })
  assert.equal(con.estado === 'ok' && con.devengos[0].ilegibles, 2)

  // Una versión desplegada más vieja de asegura no manda el campo.
  const sin = interpretarComisiones(200, {
    comisiones: {
      estado: 'ok', periodos: [], cobertura: [],
      devengos: [{ companiaCodigo: 'C0109', mes: '2026-04', bruto: 120.88, recibos: 4 }],
    },
  })
  assert.equal(sin.estado === 'ok' && sin.devengos[0].ilegibles, null)

  // Y 0 SÍ es una afirmación: se miraron y todas se leyeron.
  const cero = interpretarComisiones(200, {
    comisiones: {
      estado: 'ok', periodos: [], cobertura: [],
      devengos: [{ companiaCodigo: 'C0109', mes: '2026-04', bruto: 120.88, recibos: 4, ilegibles: 0 }],
    },
  })
  assert.equal(cero.estado === 'ok' && cero.devengos[0].ilegibles, 0)
})

test('los códigos DGS reales son C0058/C0109, no los numéricos del cima.ts retirado', () => {
  assert.equal(nombreCompania('C0058'), 'Mapfre')
  assert.equal(nombreCompania('C0109'), 'Allianz')
  assert.equal(nombreCompania('C0468'), 'Occident')
  // Un código desconocido devuelve el propio código: inventar un nombre sería
  // peor que decir que no se sabe cuál es.
  assert.equal(nombreCompania('C9999'), 'C9999')
})

// ── El techo del LIBRO de comisiones ────────────────────────────────────────

test('🚨 comisiones: `truncado` ausente es null, no false (mismo criterio que `ilegibles`)', () => {
  // Contra este total se decide si se reclama a una compañía. Un `false`
  // inventado daría por completo un libro que nadie ha comprobado.
  const viejo = interpretarComisiones(200, {
    comisiones: { estado: 'ok', periodos: [], cobertura: [], devengos: [] },
  })
  assert.equal(viejo.estado === 'ok' && viejo.truncado, null)

  const raro = interpretarComisiones(200, {
    comisiones: { estado: 'ok', periodos: [], cobertura: [], devengos: [], truncado: 1 },
  })
  assert.equal(raro.estado === 'ok' && raro.truncado, null)
})

test('comisiones: `false` y `true` se propagan tal cual', () => {
  const completo = interpretarComisiones(200, {
    comisiones: { estado: 'ok', periodos: [], cobertura: [], devengos: [], truncado: false },
  })
  assert.equal(completo.estado === 'ok' && completo.truncado, false)
  const corto = interpretarComisiones(200, {
    comisiones: { estado: 'ok', periodos: [], cobertura: [], devengos: [], truncado: true },
  })
  assert.equal(corto.estado === 'ok' && corto.truncado, true)
})
