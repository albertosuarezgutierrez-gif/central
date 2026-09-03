import test from 'node:test'
import assert from 'node:assert/strict'
import { DIAS_PREAVISO_TOMADOR, fechaAccionable } from './obligacion.ts'

test('el preaviso del tomador es de 30 dias', () => {
  assert.equal(DIAS_PREAVISO_TOMADOR, 30)
})

test('la fecha accionable es 30 dias antes del vencimiento', () => {
  // Vence el 15/03/2026 → el tomador tiene hasta el 13/02/2026.
  const vence = new Date(Date.UTC(2026, 2, 15))
  assert.equal(fechaAccionable(vence).toISOString().slice(0, 10), '2026-02-13')
})

test('el borde de mes NO desborda: 31 de marzo cae en febrero', () => {
  // 31/03/2026 − 30 días = 01/03/2026. Restar meses daría 31/02, que no existe.
  const vence = new Date(Date.UTC(2026, 2, 31))
  assert.equal(fechaAccionable(vence).toISOString().slice(0, 10), '2026-03-01')
})

test('cruzar un anyo bisiesto cuenta el 29 de febrero', () => {
  // 2028 es bisiesto. 20/03/2028 − 30 días = 19/02/2028.
  const vence = new Date(Date.UTC(2028, 2, 20))
  assert.equal(fechaAccionable(vence).toISOString().slice(0, 10), '2028-02-19')
})

test('cruzar el cambio de anyo no pierde el dia', () => {
  const vence = new Date(Date.UTC(2027, 0, 10))
  assert.equal(fechaAccionable(vence).toISOString().slice(0, 10), '2026-12-11')
})

test('la fecha accionable se calcula en UTC, no en la zona del servidor', () => {
  // Las columnas `date` llegan de Prisma como medianoche UTC. Si el cálculo
  // usara la hora local del servidor (Vercel corre en UTC, pero un portátil
  // en Madrid no), el resultado se iría un día en verano.
  const vence = new Date(Date.UTC(2026, 6, 1))
  const r = fechaAccionable(vence)
  assert.equal(r.getUTCHours(), 0)
  assert.equal(r.getUTCMinutes(), 0)
  assert.equal(r.toISOString().slice(0, 10), '2026-06-01')
})

import { DIAS_VENTANA_AVISO, entraEnVentana } from './obligacion.ts'

test('la ventana de aviso es de 7 dias', () => {
  assert.equal(DIAS_VENTANA_AVISO, 7)
})

test('avisa cuando faltan 7 dias o menos para la fecha accionable', () => {
  const hoy = new Date(Date.UTC(2026, 1, 10))
  assert.equal(entraEnVentana({ fechaAccionable: new Date(Date.UTC(2026, 1, 13)), hoy }), true)
  assert.equal(entraEnVentana({ fechaAccionable: new Date(Date.UTC(2026, 1, 17)), hoy }), true)
})

test('no avisa cuando faltan mas de 7 dias: es demasiado pronto', () => {
  const hoy = new Date(Date.UTC(2026, 1, 10))
  assert.equal(entraEnVentana({ fechaAccionable: new Date(Date.UTC(2026, 1, 18)), hoy }), false)
})

test('el propio dia de la fecha accionable SI avisa: aun esta a tiempo', () => {
  const hoy = new Date(Date.UTC(2026, 1, 10))
  assert.equal(entraEnVentana({ fechaAccionable: new Date(Date.UTC(2026, 1, 10)), hoy }), true)
})

test('una fecha accionable YA PASADA no avisa: el aviso llegaria tarde', () => {
  // Avisar de un plazo vencido no es un servicio: es decirle al cliente que
  // llega tarde por culpa nuestra. Se calla y se resuelve por otra vía.
  const hoy = new Date(Date.UTC(2026, 1, 10))
  assert.equal(entraEnVentana({ fechaAccionable: new Date(Date.UTC(2026, 1, 9)), hoy }), false)
})

test('la hora del dia no cambia el resultado: se compara por dias UTC', () => {
  const hoy = new Date(Date.UTC(2026, 1, 10, 23, 59, 59))
  assert.equal(entraEnVentana({ fechaAccionable: new Date(Date.UTC(2026, 1, 10)), hoy }), true)
})

import { polizaGeneraObligacion } from './obligacion.ts'

test('una poliza del volcado historico NO genera obligacion, aunque tenga fecha', () => {
  // 28.729 pólizas con `import_ref` y vencimientos de 2013-2018. Sin este
  // filtro, la primera pasada del cron manda miles de «se te venció el seguro»
  // sobre contratos muertos hace ocho años.
  assert.equal(
    polizaGeneraObligacion({ importRef: 'intranet:44012', eiacXmlHash: null, fechaVencimiento: new Date(Date.UTC(2015, 4, 10)) }),
    false,
  )
  assert.equal(
    polizaGeneraObligacion({ importRef: 'asegura_app:991', eiacXmlHash: null, fechaVencimiento: new Date(Date.UTC(2026, 4, 10)) }),
    false,
  )
})

test('una poliza de CIMA con vencimiento SI genera obligacion', () => {
  assert.equal(
    polizaGeneraObligacion({ importRef: null, eiacXmlHash: null, fechaVencimiento: new Date(Date.UTC(2026, 4, 10)) }),
    true,
  )
})

test('sin fecha de vencimiento no hay obligacion: NULL es «no se sabe»', () => {
  // No es «no vence». No se inventa una fecha ni se avisa; la pantalla lo dice.
  assert.equal(polizaGeneraObligacion({ importRef: null, eiacXmlHash: null, fechaVencimiento: null }), false)
})

test('una cadena vacia en importRef cuenta como volcado, no como CIMA', () => {
  // El valor de cajón que se cuela por toda guarda de NULL. `''` no es «vino
  // por CIMA»: es una fila del volcado a la que le falta la referencia.
  assert.equal(
    polizaGeneraObligacion({ importRef: '', eiacXmlHash: null, fechaVencimiento: new Date(Date.UTC(2026, 4, 10)) }),
    false,
  )
})

// ── El cepo de la vigencia ────────────────────────────────────────────────────
import { obligacionDerivable } from './obligacion.ts'

test('una poliza CANCELADA no deriva obligacion, aunque venza en el futuro', () => {
  // 42 de las 109 pólizas de CIMA están canceladas y 5 tienen vencimiento
  // futuro: sin este cepo llegarían a disparar un correo real diciéndole a un
  // cliente que decida sobre una póliza que ya no existe.
  assert.equal(
    obligacionDerivable({
      importRef: null,
      eiacXmlHash: null,
      fechaVencimiento: new Date(Date.UTC(2027, 3, 28)),
      vigencia: 'no_vigente',
    }),
    false,
  )
})

test('una poliza activa con el vencimiento YA PASADO no deriva obligacion', () => {
  // 18 pólizas `activa` de CIMA tienen vencimiento pasado; la más vieja es de
  // enero de 2013. `vigenciaPoliza()` ya las marca `no_vigente`. Pintarlas
  // sería decirle al cliente «tienes hasta el 13/02/2015 para renovar».
  assert.equal(
    obligacionDerivable({
      importRef: null,
      eiacXmlHash: null,
      fechaVencimiento: new Date(Date.UTC(2013, 0, 27)),
      vigencia: 'no_vigente',
    }),
    false,
  )
})

test('«pendiente» tampoco deriva: sin fecha no se sabe, y no se inventa', () => {
  assert.equal(
    obligacionDerivable({ importRef: null, eiacXmlHash: null, fechaVencimiento: null, vigencia: 'pendiente' }),
    false,
  )
})

test('una poliza vigente de CIMA con fecha SI deriva', () => {
  assert.equal(
    obligacionDerivable({
      importRef: null,
      eiacXmlHash: null,
      fechaVencimiento: new Date(Date.UTC(2027, 3, 28)),
      vigencia: 'vigente',
    }),
    true,
  )
})

test('el cepo del volcado historico manda sobre el de la vigencia', () => {
  // Una del volcado no deriva ni marcándola vigente: son 28.729 y el filtro de
  // `import_ref` es el que evita el desastre.
  assert.equal(
    obligacionDerivable({
      importRef: 'intranet:44012',
      eiacXmlHash: null,
      fechaVencimiento: new Date(Date.UTC(2027, 3, 28)),
      vigencia: 'vigente',
    }),
    false,
  )
})

// ── El agujero de la regla de un solo brazo (medido 03/09/2026) ──────────────

test('🚨 una póliza del volcado que CIMA mantiene al día SÍ genera obligación', () => {
  // `3021700291186` de Reale (C0613): entró en el volcado de junio con su
  // `import_ref`, y la ingesta de CIMA la actualiza (suplemento 133 del
  // 25/08/2026) sin quitárselo. Con la regla vieja no avisaba de su vencimiento
  // de 2027 — y con ella se caía el cliente entero de la cartera.
  assert.equal(
    polizaGeneraObligacion({
      importRef: 'asegura_app:pol2:15143',
      eiacXmlHash: 'a1b2c3',
      fechaVencimiento: new Date(Date.UTC(2027, 8, 19)),
    }),
    true,
  )
})

test('el volcado que CIMA nunca ha tocado sigue sin generar obligación', () => {
  assert.equal(
    polizaGeneraObligacion({
      importRef: 'intranet:44012',
      eiacXmlHash: null,
      fechaVencimiento: new Date(Date.UTC(2027, 8, 19)),
    }),
    false,
  )
})
