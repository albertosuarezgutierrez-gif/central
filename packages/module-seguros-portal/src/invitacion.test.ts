// Cepos de la invitación por correo. Lee `invitacion.ts` antes: aquí solo se
// comprueba que lo que dice su cabecera siga siendo verdad dentro de tres meses.
//
// Los tres que de verdad importan y que no se ven a simple vista:
//   · `sin_enlace` NO escribe la fila y `envio_fallido` SÍ. Colapsarlos hace que
//     la pantalla invite a reintentar algo que chocará con el índice único, o
//     que diga «no se ha invitado» de una invitación que existe.
//   · la caducidad se suma en DÍAS. Con meses, un 31 de marzo se convierte en un
//     3 de marzo sin que nada falle.
//   · lo RESUELTO gana a la caducidad. Al revés, las invitaciones que sirvieron
//     para algo desaparecen del historial al pasar el mes.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BYTES_TOKEN_INVITACION,
  CAMPOS_PROHIBIDOS_EN_INVITACION,
  DIAS_VIGENCIA_INVITACION,
  ESTADOS_INVITACION,
  MAX_INVITACIONES_DIA,
  MAX_MENSAJE_INVITACION,
  RESULTADOS_INVITACION,
  caducidadInvitacion,
  estadoInvitacion,
  invitacionEscrita,
  invitacionResoluble,
  invitacionRevelaSiEsCliente,
  normalizarMensajeInvitacion,
  normalizarTokenInvitacion,
  type InvitacionFechas,
} from './invitacion.ts'

const VIVA: InvitacionFechas = {
  caducaEn: new Date('2026-10-04T00:00:00Z'),
  aceptadaEn: null,
  rechazadaEn: null,
  retiradaEn: null,
}
const ANTES = new Date('2026-09-04T00:00:00Z')
const DESPUES = new Date('2026-11-04T00:00:00Z')

test('el portal NUNCA contesta si ese correo es de un cliente', () => {
  // No es que la respuesta se colapse: es que no se calcula. Si algún día
  // alguien añade un resultado que lo nombre, esto deja de compilar en cuanto
  // se le pida a esta función que lo trate.
  for (const r of RESULTADOS_INVITACION) {
    assert.equal(
      invitacionRevelaSiEsCliente(r),
      false,
      `«${r}» no puede decir nada del destinatario: con 32.600 fichas, un resultado que distinga ` +
        'convierte la pantalla en un bucle de enumeración de la cartera.',
    )
  }
})

test('`sin_enlace` NO escribe la fila; `envio_fallido` SÍ', () => {
  assert.equal(invitacionEscrita('enviada'), true)
  assert.equal(
    invitacionEscrita('envio_fallido'),
    true,
    'La invitación existe y lo que falló fue avisar. Decir «no se ha invitado» es mentir, y el ' +
      'segundo intento chocaría con el índice único.',
  )
  assert.equal(
    invitacionEscrita('sin_enlace'),
    false,
    'Sin PORTAL_PUBLIC_URL el enlace no es un adorno: es el mecanismo. Una fila cuyo correo no ' +
      'puede salir ocupa el sitio del índice único y nadie podría aceptarla nunca.',
  )
  // Los tres que dependen solo de quien invita tampoco escriben.
  for (const r of ['ya_invitado', 'ya_autorizado', 'a_si_mismo', 'limite_diario'] as const) {
    assert.equal(invitacionEscrita(r), false, `«${r}» no crea ninguna fila`)
  }
})

test('la caducidad se suma en DÍAS, no en meses', () => {
  // El caso que revienta `setUTCMonth`: 31 de marzo + 1 mes = 31 de abril, que
  // JavaScript normaliza a un 1 de mayo sin avisar. Con días no hay sorpresa.
  const desde = new Date('2026-03-31T12:00:00Z')
  const hasta = caducidadInvitacion(desde)
  assert.equal(
    hasta.getTime() - desde.getTime(),
    DIAS_VIGENCIA_INVITACION * 24 * 60 * 60 * 1000,
    'La diferencia tiene que ser exactamente los días de vigencia, en milisegundos.',
  )
  assert.equal(hasta.toISOString(), '2026-04-30T12:00:00.000Z')
  assert.ok(hasta.getTime() > desde.getTime(), 'Caduca DESPUÉS de crearse: lo repite un CHECK de la BD.')
})

test('lo RESUELTO gana a la caducidad', () => {
  const aceptada = { ...VIVA, aceptadaEn: new Date('2026-09-10T00:00:00Z') }
  assert.equal(
    estadoInvitacion(aceptada, DESPUES),
    'aceptada',
    'Una aceptada no se vuelve «caducada» al pasar el mes: lo que caduca es la autorización que ' +
      'salió de ella, que tiene su propia fecha. Preguntar por la caducidad primero borraría del ' +
      'historial justo las que sirvieron para algo.',
  )
  assert.equal(estadoInvitacion({ ...VIVA, rechazadaEn: DESPUES }, DESPUES), 'rechazada')
  assert.equal(estadoInvitacion({ ...VIVA, retiradaEn: DESPUES }, DESPUES), 'retirada')
})

test('rechazar y retirar son estados distintos, y los dos existen', () => {
  // Uno dice «no quiero» (lo hace el invitado) y el otro «me he arrepentido de
  // ofrecértelo» (lo hace quien invitó). Colapsarlos borra quién decidió qué.
  assert.ok(ESTADOS_INVITACION.includes('rechazada'))
  assert.ok(ESTADOS_INVITACION.includes('retirada'))
  assert.notEqual(
    estadoInvitacion({ ...VIVA, rechazadaEn: ANTES }, ANTES),
    estadoInvitacion({ ...VIVA, retiradaEn: ANTES }, ANTES),
  )
})

test('viva antes de la fecha, caducada después, y solo la viva se puede resolver', () => {
  assert.equal(estadoInvitacion(VIVA, ANTES), 'enviada')
  assert.equal(estadoInvitacion(VIVA, DESPUES), 'caducada')
  assert.equal(invitacionResoluble(VIVA, ANTES), true)
  assert.equal(invitacionResoluble(VIVA, DESPUES), false)
  assert.equal(
    invitacionResoluble({ ...VIVA, aceptadaEn: ANTES }, ANTES),
    false,
    'Una ya aceptada no se vuelve a aceptar: el desenlace es uno solo, y lo repite un CHECK.',
  )
  // El borde exacto: el instante de caducar YA no vale. Un `<` en vez de un
  // `<=` dejaría una invitación viva un milisegundo de más — irrelevante en la
  // práctica, pero es la clase de borde que luego se copia a un sitio donde sí
  // importa.
  assert.equal(estadoInvitacion(VIVA, VIVA.caducaEn), 'caducada')
})

test('el token: 64 hex y nada más', () => {
  const bueno = 'a'.repeat(64)
  assert.equal(normalizarTokenInvitacion(bueno), bueno)
  assert.equal(normalizarTokenInvitacion(`  ${bueno.toUpperCase()}  `), bueno, 'Se normaliza caja y espacios.')
  // Todo lo demás es `null` ANTES de tocar la BD: un valor cualquiera metido en
  // la URL no tiene por qué llegar a una consulta.
  for (const malo of [null, undefined, 42, {}, [], '', 'a'.repeat(63), 'a'.repeat(65), `${'a'.repeat(63)}z`]) {
    assert.equal(normalizarTokenInvitacion(malo), null, `«${String(malo)}» no es un token`)
  }
  assert.equal(BYTES_TOKEN_INVITACION * 2, 64, 'Los bytes del token y los caracteres hex tienen que casar.')
  assert.ok(BYTES_TOKEN_INVITACION >= 32, 'Adivinar un token es entrar en la invitación de otro: no se baja de 256 bits.')
})

test('el mensaje: vacío es `null`, nunca cadena vacía', () => {
  assert.equal(normalizarMensajeInvitacion('  hola  '), 'hola')
  assert.equal(
    normalizarMensajeInvitacion('   '),
    null,
    'Una cadena vacía guardada es un valor de cajón: se cuela por las guardas de NULL y se pinta ' +
      'como un mensaje que nadie escribió.',
  )
  assert.equal(normalizarMensajeInvitacion(''), null)
  assert.equal(normalizarMensajeInvitacion(123), null)
  assert.equal(normalizarMensajeInvitacion('x'.repeat(500))?.length, MAX_MENSAJE_INVITACION)
})

test('la lista de lo que el correo NO puede llevar sigue en pie', () => {
  // Existe para que la plantilla no vaya creciendo «un dato más» cada vez que
  // alguien quiera que se entienda mejor. Quien recibe el correo todavía es un
  // desconocido.
  for (const campo of ['compania', 'numeroPoliza', 'matricula', 'prima', 'iban', 'dni']) {
    assert.ok(
      (CAMPOS_PROHIBIDOS_EN_INVITACION as readonly string[]).includes(campo),
      `«${campo}» tiene que seguir prohibido en el correo de invitación`,
    )
  }
})

test('el cupo diario es un freno de abuso, no una cuota comercial', () => {
  assert.ok(MAX_INVITACIONES_DIA > 0)
  assert.ok(
    MAX_INVITACIONES_DIA <= 50,
    'Un cupo alto convierte esto en una herramienta de envío masivo a terceros que no han ' +
      'consentido nada.',
  )
})
