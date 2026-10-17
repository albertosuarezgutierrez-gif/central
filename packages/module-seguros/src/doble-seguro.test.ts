import test from 'node:test'
import assert from 'node:assert/strict'
import { avisoDobleSeguro, type ViejaParaDobleSeguro } from './doble-seguro.ts'

const GPAFS: ViejaParaDobleSeguro = { aseguradora: 'C0468', numeroPoliza: 'GPAFS0900547', estado: 'activa', fechaVencimiento: '2027-09-09', fechaEfectoUltimoRecibo: null }

test('caso real: GPAFS0900547 (vence 09/09/2027) → 61048939 con efecto 17/09/2026 avisa, sin PII', () => {
  const a = avisoDobleSeguro(GPAFS, { fechaEfecto: '2026-09-17', estado: 'en_vigor' })
  assert.deepEqual(a?.motivos, ['vencimiento_posterior'])
  assert.equal(a?.texto, 'posible doble seguro: pedir anulación de GPAFS0900547 a C0468')
})

test('recibo posterior al efecto de la nueva también avisa (aunque no conste vencimiento)', () => {
  const a = avisoDobleSeguro({ ...GPAFS, fechaVencimiento: null, fechaEfectoUltimoRecibo: '2026-12-01' }, { fechaEfecto: '2026-09-17', estado: 'en_vigor' })
  assert.deepEqual(a?.motivos, ['recibo_posterior'])
})

test('cambio a vencimiento (≤30 días) NO avisa: es lo normal', () => {
  assert.equal(avisoDobleSeguro({ ...GPAFS, fechaVencimiento: '2026-09-24' }, { fechaEfecto: '2026-09-22', estado: 'en_vigor' }), null)
})

test('vieja ya no vigente → sin aviso', () => {
  assert.equal(avisoDobleSeguro({ ...GPAFS, estado: 'anulada' }, { fechaEfecto: '2026-09-17', estado: 'en_vigor' }), null)
})

test('sin fecha de efecto de la nueva = no se sabe → sin aviso (no se inventa)', () => {
  assert.equal(avisoDobleSeguro(GPAFS, { fechaEfecto: null, estado: 'en_vigor' }), null)
  assert.equal(avisoDobleSeguro(GPAFS, { fechaEfecto: 'basura', estado: 'en_vigor' }), null)
})

test('sin número de la vieja el texto no inventa uno', () => {
  const a = avisoDobleSeguro({ ...GPAFS, numeroPoliza: null }, { fechaEfecto: '2026-09-17', estado: 'en_vigor' })
  assert.match(a!.texto, /anulación de la póliza sustituida a C0468/)
})

test('la NUEVA anulada/no vigente → sin aviso (no hay dos seguros vivos)', () => {
  assert.equal(avisoDobleSeguro(GPAFS, { fechaEfecto: '2026-09-17', estado: 'anulada' }), null)
})

// ── Seguimiento de sustituciones (17/10/2026): misma comparación, sin duplicarla ─────────────────
import { solapeViejaNueva, viejaPendienteDeAnular } from './doble-seguro.ts'

test('caso Victor: vieja vence 01/11/2026 y la nueva empieza 01/11/2026 → no solapa, también con tolerancia 0', () => {
  assert.equal(solapeViejaNueva({ fechaVencimiento: '2026-11-01', fechaEfectoUltimoRecibo: null }, '2026-11-01', 0).solape, 'no_solapa')
})

test('tolerancia 0: nueva 17/10, vieja vence 01/11 → SOLAPA (con la de 30 días no: avisoDobleSeguro no cambia)', () => {
  const vieja = { fechaVencimiento: '2026-11-01', fechaEfectoUltimoRecibo: null }
  assert.equal(solapeViejaNueva(vieja, '2026-10-17', 0).solape, 'solapa')
  assert.equal(solapeViejaNueva(vieja, '2026-10-17').solape, 'no_solapa')
  assert.equal(avisoDobleSeguro({ ...GPAFS, fechaVencimiento: '2026-11-01' }, { fechaEfecto: '2026-10-17', estado: 'en_vigor' }), null)
})

test('solape: vencimiento muy posterior → solapa; recibo posterior también', () => {
  assert.deepEqual(solapeViejaNueva({ fechaVencimiento: '2027-09-09', fechaEfectoUltimoRecibo: null }, '2026-09-17', 0).motivos, ['vencimiento_posterior'])
  assert.equal(solapeViejaNueva({ fechaVencimiento: '2026-11-01', fechaEfectoUltimoRecibo: '2027-01-01' }, '2026-11-01', 0).solape, 'solapa')
})

test('solape: sin efecto de la nueva o sin vencimiento de la vieja = no se sabe (nunca «no solapa»)', () => {
  assert.equal(solapeViejaNueva({ fechaVencimiento: '2026-11-01', fechaEfectoUltimoRecibo: null }, null, 0).solape, 'no_se_sabe')
  assert.equal(solapeViejaNueva({ fechaVencimiento: null, fechaEfectoUltimoRecibo: '2026-10-01' }, '2026-11-01', 0).solape, 'no_se_sabe')
})

test('la FECHA no cierra el caso: vence cuando empieza la nueva → sigue pendiente, como «no renueva»', () => {
  assert.deepEqual(viejaPendienteDeAnular({ enVigorCima: true, anulacionConfirmada: false, solape: 'no_solapa' }), { pendiente: true, cierre: null, aviso: 'no_renovacion' })
})

test('pendiente: solapa o no se sabe → doble seguro', () => {
  assert.equal(viejaPendienteDeAnular({ enVigorCima: true, anulacionConfirmada: false, solape: 'solapa' }).aviso, 'doble_seguro')
  assert.equal(viejaPendienteDeAnular({ enVigorCima: true, anulacionConfirmada: false, solape: 'no_se_sabe' }).aviso, 'doble_seguro')
  assert.equal(viejaPendienteDeAnular({ enVigorCima: true, anulacionConfirmada: false, solape: null }).aviso, 'doble_seguro')
})

test('solo cierran la anulación confirmada o la baja en CIMA; estado ilegible = no se sabe', () => {
  assert.deepEqual(viejaPendienteDeAnular({ enVigorCima: true, anulacionConfirmada: true, solape: 'solapa' }), { pendiente: false, cierre: 'anulacion_confirmada', aviso: null })
  assert.deepEqual(viejaPendienteDeAnular({ enVigorCima: false, anulacionConfirmada: false, solape: 'solapa' }), { pendiente: false, cierre: null, aviso: null })
  assert.equal(viejaPendienteDeAnular({ enVigorCima: null, anulacionConfirmada: false, solape: 'no_solapa' }).pendiente, null)
})
