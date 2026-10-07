// Retomar la última tarificación de un cliente NUEVO (28/09/2026): gratis, solo lee lo ya pagado.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { interpretarTarificacionNueva } from './retarificar-asegura.ts'

test('🪤 ok con precios → se puede retomar; sin cotizacionId → ilegible, nunca «ok» vacío', () => {
  const ok = interpretarTarificacionNueva(200, {
    estado: 'ok', cotizacionId: 't1', projectId: '40934801', creadaEn: '2026-09-28T11:13:00Z', fechaEfecto: '2026-09-29', caducada: false,
    precios: [{ compania: 'Reale', producto: 'Moto', categoria: 'Terceros', primaEur: 180.5, franquiciaEur: null, firmeza: 'estimado', avisos: [] }],
  })
  assert.equal(ok.estado, 'ok')
  if (ok.estado === 'ok') {
    assert.equal(ok.guardada.cotizacionId, 't1')
    assert.equal(ok.guardada.precios[0]?.primaEur, 180.5)
    assert.equal(ok.guardada.caducada, false)
  }
  assert.equal(interpretarTarificacionNueva(200, { estado: 'ok', precios: [] }).estado, 'error')
  assert.equal(interpretarTarificacionNueva(200, { estado: 'ninguna' }).estado, 'ninguna')
  assert.equal(interpretarTarificacionNueva(401, {}).estado, 'error')
  // Un fallo del otro lado NO es «no hay tarificación».
  assert.equal(interpretarTarificacionNueva(500, { estado: 'error', mensaje: 'x' }).estado, 'error')
})

test('la caducidad viaja: una tarificación con efecto pasado se marca y la pantalla no la ofrece', async () => {
  const r = interpretarTarificacionNueva(200, { estado: 'ok', cotizacionId: 't', projectId: 'p', caducada: true, precios: [] })
  assert.equal(r.estado === 'ok' && r.guardada.caducada, true)
  const { readFileSync } = await import('node:fs')
  const fuente = readFileSync(new URL('../app/(usuario)/correduria/cliente/[id]/moto-nuevo/CotizadorMoto.tsx', import.meta.url), 'utf8')
  assert.match(fuente, /!r\.guardada\.caducada/)
  assert.match(fuente, /guardado: \{ estado: 'guardada', cotizacionId: g\.cotizacionId \}/)
})

import { leerHistorialPrevio } from './retarificar-asegura.ts'

test('leerHistorialPrevio: completo o null (un historial a medias quitaría la bonificación sin avisar)', () => {
  const h = { companiaCodigo: 'M0133', poliza: 'P-1', aniosAsegurado: 6, aniosEnCompania: 3, aniosSinSiniestros: 6, matricula: '2121NST' }
  assert.deepEqual(leerHistorialPrevio(h), h)
  assert.equal(leerHistorialPrevio({ ...h, aniosSinSiniestros: -1 }), null)
  assert.equal(leerHistorialPrevio({ ...h, poliza: '' }), null)
  assert.equal(leerHistorialPrevio(null), null)
})
