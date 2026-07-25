// Tests de clasificarDestino (a qué negocio pertenece cada movimiento). Runner: `node --test`
// (type-stripping). Reproduce el bug de la correduría: el banco rotula los ABONOS recibidos con
// el nombre del TITULAR como contraparte, así que NO se puede inferir "traspaso interno" por el
// nombre — las comisiones entrantes deben contar como ingreso de la correduría (seguros).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { clasificarDestino, clasificarDestinoDetalle } from './destino.ts'
import { claveComercio } from './correduria.ts'

const TITULAR = 'ALBERTO SUAREZ GUTIERREZ'

test('ABONO de comisiones rotulado con el titular → seguros (no traspaso interno)', () => {
  // Liquidación de comisiones (BBVA pone el nombre del titular como contraparte).
  assert.equal(clasificarDestino('BBVA', 'TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // LIQ.COMISIONES 202604', TITULAR, 302.06), 'seguros')
  assert.equal(clasificarDestino('BBVA', 'TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // G.65792 LIQ.00050 GENERALI SE', TITULAR, 32.96), 'seguros')
  assert.equal(clasificarDestino('BBVA', 'TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // -FRA-COMIS-20260331', `9000165676 ${TITULAR}`, 12.66), 'seguros')
})

test('ABONO con "LIQ. OP." en BBVA → turistico_duplex (cobro de Booking, no comisión)', () => {
  // Reconciliación 21/06/2026: las "TRANSFERENCIA RECIBIDA // LIQ. OP. Nº ..." de BBVA son
  // liquidaciones de reservas (Booking del dúplex), NO comisiones de la correduría (regla en destino.ts).
  // Es el marcador FIABLE del cobro de Booking (lo trae el feed PSD2): NO requiere revisión.
  assert.deepEqual(
    clasificarDestinoDetalle('BBVA', 'ABONO POR TRANSFERENCIA A SU FAVOR RECIBIDA EN EUROS // TRANSFERENCIA RECIBIDA // LIQ. OP. Nº 000492803640001', TITULAR, 856.77),
    { destino: 'turistico_duplex', revisar: false },
  )
})

test('ABONO de pensión / nómina / Bizum personal rotulado con el titular → personal', () => {
  assert.equal(clasificarDestino('BBVA', 'PENSION // INGRESO POR NÓMINA O PENSIÓN // 28823484E', TITULAR, 905.52), 'personal')
  assert.equal(clasificarDestino('BBVA', 'BIZUM // OTROS // RECIBIDO: bodega 25', 'ALBERTO;SUAREZ;GUTIERREZ', 30.0), 'personal')
})

test('Bizum es SIEMPRE personal (entre o salga, cualquier banco)', () => {
  // CARGO Bizum en BBVA: antes caía a 'seguros' por descarte; ahora personal.
  assert.equal(clasificarDestino('BBVA', 'BIZUM // ENVIADO: alquiler amigo', null, -30.0), 'personal')
  // CARGO Bizum en Kutxa → personal.
  assert.equal(clasificarDestino('Kutxabank', 'BIZUM A FAVOR DE JUAN', null, -15.0), 'personal')
  // ABONO Bizum → personal.
  assert.equal(clasificarDestino('BBVA', 'BIZUM // OTROS // RECIBIDO: cena', 'ALBERTO;SUAREZ;GUTIERREZ', 25.0), 'personal')
  // Para el cónyuge (Pilar) un Bizum entrante es cobro de cliente → actividad_pilar (no personal).
  assert.equal(clasificarDestinoDetalle('BBVA', 'BIZUM RECIBIDO', null, 40.0, 'conyuge').destino, 'actividad_pilar')
  // Bizum es determinista → se auto-confirma (NO aparece en la bandeja «Por revisar»).
  assert.equal(clasificarDestinoDetalle('Kutxabank', 'BIZUM A FAVOR DE JUAN', null, -15.0).confirmado, true)
})

test('ENERGIA XXI (luz vivienda habitual Monte Carmelo) → personal auto-confirmado, cualquier banco', () => {
  // Concepto real de Kutxa (screenshot 02/07/2026). Personal, no deducible, sin pasar por la bandeja.
  assert.deepEqual(
    clasificarDestinoDetalle('Kutxabank', 'RECIBO ENERGIA XXI COMER ENERGIA XXI FACTURA DE ELECTRICIDAD S26CON01680', null, -46),
    { destino: 'personal', revisar: false, confirmado: true },
  )
  // Aunque llegara por BBVA NO debe caer a 'seguros' por descarte.
  assert.deepEqual(
    clasificarDestinoDetalle('BBVA', 'ADEUDO ENERGIA XXI COMERCIALIZADORA', null, -60),
    { destino: 'personal', revisar: false, confirmado: true },
  )
  // Una devolución (abono) de Energía XXI también es personal.
  assert.equal(clasificarDestino('Kutxabank', 'ABONO ENERGIA XXI COMER', null, 12.5), 'personal')
  // La luz de los PISOS (Endesa mercado libre) NO se ve afectada: sigue en turistico_pisos.
  assert.equal(clasificarDestino('Kutxabank', 'RECIBO ENDESA ENERGIA            ENDESA ENERGIA S.A. FACTURA DE ELECTRICIDAD P26', null, -80), 'turistico_pisos')
})

test('TotalEnergies (luz/gas): BBVA → Dúplex, Kutxa → pisos, sin revisar (antes caía a seguros)', () => {
  // Caso REAL 21/07/2026: el recibo de TotalEnergies en BBVA caía a 'seguros' por descarte
  // (RE_DUPLEX no lo conocía) y se marcaba «por revisar». Ahora → turistico_duplex directo.
  assert.deepEqual(
    clasificarDestinoDetalle('BBVA', 'ADEUDO A SU CARGO // PAGO DE ADEUDO DIRECTO SEPA // N 2026198000644355 TE ELECTRICIDAD Y GAS ESPANA SA', null, -3.98),
    { destino: 'turistico_duplex', revisar: false },
  )
  // La misma comercializadora en Kutxa (pisos): "RECIBO Total Gas Y Elect ..." → turistico_pisos.
  assert.equal(clasificarDestino('Kutxabank', 'RECIBO Total Gas Y Elect         FACTURA VARIOS2600016685 - CUPS ES0031102227887014EY0F', null, -16.86), 'turistico_pisos')
  // Abono de TotalEnergies en Kutxa (devolución de un piso) → turistico_pisos.
  assert.equal(clasificarDestino('Kutxabank', 'ABONO TOTALENERGIES ELECTRICIDA', null, 152.94), 'turistico_pisos')
})

test('Software/infra profesional en BBVA (Vercel/Anthropic) → seguros deducible informatica, auto-confirmado', () => {
  // Casos REALES (jul-2026): la contraparte trae el proveedor; el concepto es genérico de tarjeta.
  assert.deepEqual(
    clasificarDestinoDetalle('BBVA', 'COMPRA EN COMERCIO EXTRANJERO-COMISIÓN 3 % INCLUÍDA // PAGO CON TARJETA', 'VERCEL INC.', -683.39),
    { destino: 'seguros', revisar: false, confirmado: true, subcategoria: 'informatica' },
  )
  assert.deepEqual(
    clasificarDestinoDetalle('BBVA', "PAGO CON TARJETA EN DISCOS, LIBROS, FOTOS Y PC'S // PAGO CON TARJETA", 'ANTHROPIC IRELAND', -38.25),
    { destino: 'seguros', revisar: false, confirmado: true, subcategoria: 'informatica' },
  )
  // El ocio NO entra aquí: una compra en Amazon a secas sigue su camino (no es infra profesional).
  assert.notEqual(clasificarDestinoDetalle('BBVA', 'COMPRA EN AMZN MKTP ES', null, -30).subcategoria, 'informatica')
})

test('CARGO por DESCARTE: BBVA → revisar (va a la bandeja); Kutxa personal → NO revisar', () => {
  // BBVA, cargo que no casa el Dúplex → seguros por descarte → revisar (se contaría como correduría).
  assert.deepEqual(clasificarDestinoDetalle('BBVA', 'COMPRA EN COMERCIO DESCONOCIDO', null, -50), { destino: 'seguros', revisar: true })
  // Kutxa, compra genérica → personal (caso normal del gasto diario), NO va a la bandeja.
  assert.deepEqual(clasificarDestinoDetalle('Kutxabank', 'COMPRA EN COMERCIO DESCONOCIDO', null, -50), { destino: 'personal', revisar: false })
})

test('CARGO con PATRÓN conocido → revisar:false (no va a la bandeja)', () => {
  assert.deepEqual(clasificarDestinoDetalle('BBVA', 'RECIBO COMUNIDAD PASAJE FRANCISCO', 'COMUNIDAD', -85), { destino: 'turistico_duplex', revisar: false })
  assert.deepEqual(clasificarDestinoDetalle('Kutxabank', 'PAGO STRIPE PAYMENTS', 'STRIPE', -20), { destino: 'turistico_pisos', revisar: false })
})

test('claveComercio extrae el comercio del concepto', () => {
  assert.equal(claveComercio('COMPRA EN PETROPRIX GINES'), 'PETROPRIX')
  assert.equal(claveComercio('COMPRA EN PAYPAL *IONOS CLOUD'), 'IONOS')
  assert.equal(claveComercio('COMPRA EN NETFLIX.COM'), 'NETFLIX')
  assert.equal(claveComercio('COMPRA EN PRIMAPRIX T88'), 'PRIMAPRIX')
  // El apellido del titular se descarta para no colisionar con sus traspasos.
  assert.equal(claveComercio('RECIBO GUTIERREZ ALCALA'), 'ALCALA')
})

test('Cuota autónomos (TGSS/SS) en BBVA → seguros deducible con subcategoria cuota_autonomos', () => {
  // Alberto es autónomo como corredor de seguros → su RETA en BBVA es gasto de la correduría.
  assert.deepEqual(
    clasificarDestinoDetalle('BBVA', 'ADEUDO DE CUOTA DE LA SEGURIDAD SOCIAL // PAGO DE IMPUESTO // N 2026177002786503', null, -300),
    { destino: 'seguros', revisar: false, subcategoria: 'cuota_autonomos' },
  )
  assert.deepEqual(
    clasificarDestinoDetalle('BBVA', 'CARGO TGSS CUOTA AUTONOMOS', null, -328.07),
    { destino: 'seguros', revisar: false, subcategoria: 'cuota_autonomos' },
  )
  // Pilar (cónyuge) sigue igual: su TGSS → actividad_pilar.
  assert.deepEqual(
    clasificarDestinoDetalle('Kutxabank', 'ADEUDO TGSS', null, -298, 'conyuge'),
    { destino: 'actividad_pilar', revisar: false, subcategoria: 'cuota_autonomos' },
  )
})

test('Póliza colectiva salud Kutxa → seguros deducible seguro_salud', () => {
  // Póliza de asistencia sanitaria colectiva sin nombre de aseguradora → deducible Art. 30.2.5ª LIRPF.
  assert.deepEqual(
    clasificarDestinoDetalle('Kutxabank', 'RECIBO PRIMAS POLIZAS CO ASISTENCIA SANITARIA POLIZAS COLECTIVAS', null, -181),
    { destino: 'seguros', revisar: false, subcategoria: 'seguro_salud' },
  )
  // Variante sin tilde.
  assert.deepEqual(
    clasificarDestinoDetalle('Kutxabank', 'RECIBO PRIMAS POLIZAS CO ASISTENCIA SANITARIA', null, -95),
    { destino: 'seguros', revisar: false, subcategoria: 'seguro_salud' },
  )
})

test('CARGO hacia una cuenta propia (titular como receptor) → traspaso interno', () => {
  assert.equal(clasificarDestino('BBVA', 'TRANSFERENCIAS // TRANSFERENCIA REALIZADA // ALBER', TITULAR, -76.75), 'traspaso_interno')
})

test('liquidación de tarjeta → traspaso interno (ambos signos)', () => {
  assert.equal(clasificarDestino('Kutxabank', 'TARJ.CRDTO 4662032019750300', '', -2482.47), 'traspaso_interno')
})

test('ingresos/gastos de pisos turísticos en Kutxa → turistico_pisos', () => {
  assert.equal(clasificarDestino('Kutxabank', 'ABONO BOOKING.COM', 'BOOKING.COM BV', 540.0), 'turistico_pisos')
  assert.equal(clasificarDestino('Kutxabank', 'PAGO STRIPE PAYMENTS', 'STRIPE', 120.0), 'turistico_pisos')
})

test('gasto propio del Dúplex en BBVA → turistico_duplex', () => {
  assert.equal(clasificarDestino('BBVA', 'RECIBO COMUNIDAD PASAJE FRANCISCO', 'COMUNIDAD DE PROPIETARIOS', -85.0), 'turistico_duplex')
})

test('La correduría (seguros) es SIEMPRE BBVA: un recibo de seguro propio en Kutxa → personal', () => {
  // Recibo del seguro del coche/hogar en Kutxa: NO es correduría (esa es solo BBVA) → personal.
  assert.equal(clasificarDestino('Kutxabank', 'RECIBO GENERALI SEGUROS', 'GENERALI SEG. Y REASEG S.A.U.', -444.71), 'personal')
  // Anulación de recibo (abono) del mismo seguro en Kutxa → también personal.
  assert.equal(clasificarDestino('Kutxabank', 'ANUL. RECIBO GENERALI SEGUROS VALIDEZ030426 SEGURO AUTO', null, 445.0), 'personal')
  // El MISMO recibo en BBVA sí es correduría (seguros).
  assert.equal(clasificarDestino('BBVA', 'RECIBO GENERALI SEGUROS', null, -444.71), 'seguros')
})

test('ABONO BBVA "Transferencia recibida" a secas (sin marcador) → personal + REVISAR', () => {
  // BBVA no guarda el ordenante real (devuelve el titular), así que un abono sin patrón conocido NO
  // se puede afirmar que sea Booking: el cobro real de Booking llega por PSD2 con "LIQ. OP. Nº"
  // (cubierto arriba). Antes caía a Dúplex por descarte (frágil); ahora se aísla para revisión.
  assert.deepEqual(clasificarDestinoDetalle('BBVA', 'Transferencia recibida', null, 439.64), { destino: 'personal', revisar: true })
  assert.deepEqual(clasificarDestinoDetalle('BBVA', 'Transferencia recibida', null, 856.77), { destino: 'personal', revisar: true })
})

test('ABONO BBVA con liquidación de agente (sin "comisión") → seguros', () => {
  assert.equal(clasificarDestino('BBVA', 'Pd005 saldo agente', null, 105.38), 'seguros')          // Caser
  assert.equal(clasificarDestino('BBVA', '2000071499 2remsaldo-27289 1.', null, 17.70), 'seguros') // Aegon
  assert.equal(clasificarDestino('BBVA', 'Liq. saldo cuenta asiento: 434671', null, 41.80), 'seguros') // AXA
  assert.equal(clasificarDestino('BBVA', 'Pago saldo cta. ag:41 3113599', null, 32.24), 'seguros') // Generali
  assert.equal(clasificarDestino('BBVA', 'Comisiones mayo       2026050', null, 76.30), 'seguros')
})

test('ABONO BBVA "Recibido: …" (Bizum de particular) → personal', () => {
  assert.equal(clasificarDestino('BBVA', 'Recibido: cerveza palacios', null, 20.0), 'personal')
  assert.equal(clasificarDestino('BBVA', 'Recibido: hato', null, 50.0), 'personal')
})

test('ABONO BBVA con código de agente (SALDO. M00171 / M1454 / 8/92361) → seguros (correduría)', () => {
  // Casos REALES de julio 2026 que caían a turistico_pisos por una regla aprendida venenosa; sin
  // la regla tampoco llegaban a seguros porque destino.ts no conocía el código de agente. Ahora sí.
  const TIT = 'ALBERTO SUAREZ GUTIERREZ'
  // Occident — código M00171 tras "SALDO." (279,68€ el 3-jul).
  assert.equal(clasificarDestino('BBVA', 'TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // SALDO. M00171', TIT, 279.68), 'seguros')
  // Asisa — código M1454 a secas (45,15€ el 1-jul).
  assert.equal(clasificarDestino('BBVA', 'TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // M1454', TIT, 45.15), 'seguros')
  // Occident — código 8/92361 tras "SALDO.".
  assert.equal(clasificarDestino('BBVA', 'TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // SALDO. 8/92361', TIT, 79.78), 'seguros')
  // Generali (9,15€) y Caser (-FRA-COMIS, 12,66€) ya casaban por nombre/COMIS — se re-verifican.
  assert.equal(clasificarDestino('BBVA', 'TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // G.65792 LIQ.00053 GENERALI SE', TIT, 9.15), 'seguros')
  assert.equal(clasificarDestino('BBVA', 'TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // -FRA-COMIS-20260630', TIT, 12.66), 'seguros')
  // El cobro de Booking del Dúplex ("LIQ. OP. Nº …") NO debe verse arrastrado a seguros por el código.
  assert.equal(clasificarDestino('BBVA', 'ABONO POR TRANSFERENCIA A SU FAVOR RECIBIDA EN EUROS // TRANSFERENCIA RECIBIDA // LIQ. OP. Nº 000492803640001', TIT, 856.77), 'turistico_duplex')
})
