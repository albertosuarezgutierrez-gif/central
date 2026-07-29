// Tests del emparejado PURO de devoluciones de adeudo SEPA. Runner: `node --test` (type-stripping).
// Caso real (21/07/2026): recibo de TotalEnergies en BBVA devuelto → cargo -3,98 + anulación +3,98
// con la misma referencia N 2026198000644355 → deben netear en el mismo negocio.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { refAdeudoSepa, esAnulacionAdeudoSepa, casarDevolucionSepa } from './devoluciones-sepa.ts'

test('refAdeudoSepa extrae la referencia "N <número>" del concepto', () => {
  assert.equal(
    refAdeudoSepa('ADEUDO A SU CARGO // PAGO DE ADEUDO DIRECTO SEPA // N 2026198000644355 TE ELECTRICIDAD Y GAS ESPANA SA'),
    '2026198000644355',
  )
  assert.equal(refAdeudoSepa('ANULACION ADEUDOS DIRECTOS // OTROS // N 2026198000644355'), '2026198000644355')
  // Sin referencia → null. Un número corto (fecha/importe) no cuenta.
  assert.equal(refAdeudoSepa('COMPRA EN COMERCIO N 12345'), null)
  assert.equal(refAdeudoSepa(null), null)
})

test('esAnulacionAdeudoSepa reconoce la anulación de un adeudo directo (y solo eso)', () => {
  assert.equal(esAnulacionAdeudoSepa('ANULACION ADEUDOS DIRECTOS // OTROS // N 2026198000644355'), true)
  assert.equal(esAnulacionAdeudoSepa('ANULACIÓN DE ADEUDO DIRECTO'), true)
  // NO es una anulación de adeudo SEPA: es la devolución de una póliza propia (otro flujo).
  assert.equal(esAnulacionAdeudoSepa('ANUL. RECIBO GENERALI SEGUROS VALIDEZ030426 SEGURO AUTO'), false)
  // El propio cargo NO es una anulación.
  assert.equal(esAnulacionAdeudoSepa('ADEUDO A SU CARGO // PAGO DE ADEUDO DIRECTO SEPA // N 2026198000644355'), false)
})

test('casarDevolucionSepa empareja el abono con su cargo por referencia + importe opuesto', () => {
  const cargos = [
    { id: 'cargo-te', importe: -3.98, ref: '2026198000644355', destino: 'turistico_duplex' },
    { id: 'otro', importe: -12.5, ref: '9999999999999999', destino: 'personal' },
  ]
  const m = casarDevolucionSepa({ importe: 3.98, ref: '2026198000644355' }, cargos)
  assert.deepEqual(m, { id: 'cargo-te', destino: 'turistico_duplex' })
})

test('casarDevolucionSepa NO empareja si la referencia difiere, el importe no cuadra o falta destino', () => {
  const base = { id: 'cargo-te', importe: -3.98, ref: '2026198000644355', destino: 'turistico_duplex' }
  // Referencia distinta.
  assert.equal(casarDevolucionSepa({ importe: 3.98, ref: '0000000000000000' }, [base]), null)
  // Importe que no cuadra.
  assert.equal(casarDevolucionSepa({ importe: 9.99, ref: '2026198000644355' }, [base]), null)
  // El cargo aún no tiene destino → nada útil que copiar.
  assert.equal(casarDevolucionSepa({ importe: 3.98, ref: '2026198000644355' }, [{ ...base, destino: null }]), null)
  // El abono no trae referencia.
  assert.equal(casarDevolucionSepa({ importe: 3.98, ref: null }, [base]), null)
})
