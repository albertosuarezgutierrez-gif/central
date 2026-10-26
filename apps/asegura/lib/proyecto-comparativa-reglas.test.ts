// Cepos de lo que la comparativa sabe de cada precio de bot (26/10/2026). Datos SINTÉTICOS.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { infoOfertaBot } from './proyecto-comparativa-reglas.ts'

const bot = (extra: Record<string, unknown>) => ({ id: 'o1', compania: 'Allianz', datosExtra: { origen: 'rpa', rpaClave: 't1:0', referenciaPortal: 'P-123', ...extra } })

test('una oferta que no es del bot no tiene info de proyecto', () => {
  assert.equal(infoOfertaBot({ id: 'x', compania: 'Z', datosExtra: {} }, null, '2026-10-26'), null)
})

test('caducidad desconocida (Allianz sin dato), nº de proyecto y fecha de guardado', () => {
  const i = infoOfertaBot(bot({ avisos: [], supuestos: [] }), { guardadoEn: '2026-10-20', proyectoPdf: null }, '2026-10-26')!
  assert.equal(i.referencia, 'P-123')
  assert.equal(i.guardadoEn, '2026-10-20')
  assert.equal(i.caduca, null)
  assert.equal(i.estadoCaducidad, 'desconocida')
  assert.equal(i.verificacion, null)
  assert.equal(i.precio?.estado, 'limpio')
})

test('lo que dice el PDF manda sobre el portal; a 5 días caduca_pronto', () => {
  const i = infoOfertaBot(bot({ validezHasta: '2026-12-31', avisos: ['Precio con supuestos: uso diario.'] }), { guardadoEn: '2026-10-20', proyectoPdf: { validoHasta: '2026-10-30', verificacion: { estado: 'ok', campos: { prima: 'coincide', matricula: 'no_comprobado', fechaEfecto: 'no_comprobado' }, discrepancias: [] } } }, '2026-10-26')!
  assert.equal(i.caduca, '2026-10-30')
  assert.equal(i.origenCaducidad, 'pdf')
  assert.equal(i.estadoCaducidad, 'caduca_pronto')
  assert.equal(i.verificacion?.estado, 'ok')
  assert.equal(i.precio?.estado, 'con_supuestos')
})

test('sin avisos ni supuestos guardados, el precio NO es «limpio» (no se sabe)', () => {
  assert.equal(infoOfertaBot(bot({}), null, '2026-10-26')!.precio, null)
})
