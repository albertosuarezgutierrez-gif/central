import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { intentoQuizaEmitido, rastroSolicitudEmision, FRASE_SIN_CONFIRMACION } from './reintento-emision.ts'

const ERROR_500 =
  '500: {"error":"Internal Server Error","message":"Unknown error while waiting for the operation to complete.","path":"/insurances/40685793/policy-applications","status":500}'

test('intentoQuizaEmitido: un 5xx del Submit es «quizá emitido» (proyecto 40685793)', () => {
  assert.equal(intentoQuizaEmitido(ERROR_500), true)
  assert.equal(intentoQuizaEmitido('503: Service Unavailable'), true)
  // Un 5000 no es un 5xx.
  assert.equal(intentoQuizaEmitido('5000: raro'), false)
})

test('intentoQuizaEmitido: el corte de red sin respuesta también', () => {
  assert.equal(intentoQuizaEmitido(`fetch failed — ${FRASE_SIN_CONFIRMACION} con esta petición: antes de reintentar…`), true)
})

test('intentoQuizaEmitido: un 400/422 rechazado NO es quizá emitido, ni un fallo ANTES de enviar, ni sin mensaje', () => {
  assert.equal(intentoQuizaEmitido('400: {"message":"The e-mail of the holder is mandatory."}'), false)
  assert.equal(intentoQuizaEmitido('antes de enviar: el token devolvió 503 (el Submit NO ha salido)'), false)
  assert.equal(intentoQuizaEmitido(null), false)
  assert.equal(intentoQuizaEmitido(undefined), false)
})

// La misma regla vive en SQL dentro de `bloquearEnvio` (carrera entre dos
// peticiones). Si una de las dos formas cambia sin la otra, la lectura previa
// y el candado dirían cosas distintas sobre el mismo proyecto.
test('bloquearEnvio lleva en SQL la misma regla de «quizá emitido» que intentoQuizaEmitido (lee el fuente)', () => {
  const src = readFileSync(fileURLToPath(new URL('./emitir-envio.ts', import.meta.url)), 'utf8')
  assert.match(src, /error_mensaje ~ '\^5\[0-9\]\{2\}\(\[\^0-9\]\|\$\)'/)
  assert.match(src, /error_mensaje ilike \$\{'%' \+ FRASE_SIN_CONFIRMACION \+ '%'\}/)
  assert.match(src, /and codeoscopic_projects\.estado <> 'emitida'/)
  // El token se obtiene FUERA del try que marca «quizá emitido».
  assert.ok(src.indexOf('token = await obtenerToken(config)') < src.indexOf('const res = await fetch('))
})

test('rastroSolicitudEmision: encuentra policyApplication(s) con contenido, a cualquier nivel', () => {
  const crudo = {
    id: 40685793,
    holder: { name: 'X' },
    policyApplication: { id: 'PA-1', status: { id: 'Pending' } },
    offers: [{ id: 'O1', policyApplications: [{ id: 'PA-2' }] }],
  }
  const r = rastroSolicitudEmision(crudo)
  assert.deepEqual(
    r.map((x) => x.ruta),
    ['policyApplication', 'offers[0].policyApplications'],
  )
})

test('rastroSolicitudEmision: una clave vacía o un proyecto sin ella NO es rastro', () => {
  assert.deepEqual(rastroSolicitudEmision({ id: 1, policyApplications: [], policyApplication: null }), [])
  assert.deepEqual(rastroSolicitudEmision({ id: 1, holder: {}, mainQuote: { id: 'Q1' } }), [])
  assert.deepEqual(rastroSolicitudEmision(null), [])
  // `policyApplicationSupported: true` de un precio NO es una solicitud: es una capacidad.
  assert.deepEqual(rastroSolicitudEmision({ prices: [{ policyApplicationSupported: true }] }), [])
  // Contadores a cero, estados «ninguno», plazos y flags tampoco: un 409 sobre eso
  // dejaría el proyecto sin salida.
  assert.deepEqual(
    rastroSolicitudEmision({
      policyApplicationsCount: 0,
      policyApplicationStatus: 'NONE',
      policyApplicationRequired: true,
      policyApplicationDeadline: '2026-10-01',
      policyApplicationFields: ['iban'],
    }),
    [],
  )
  // Pero un estado con contenido SÍ es rastro.
  assert.equal(rastroSolicitudEmision({ policyApplicationStatus: 'Pending' }).length, 1)
})

// ── PolicyApplication_V1, la forma que el portal documenta (13/09/2026) ──
import { solicitudesEmision, solicitudViva, veredictoSolicitud, consejoTrasFallo, requestIdDe } from './reintento-emision.ts'

const PROYECTO_CON_SOLICITUD = {
  id: 40685793,
  effectiveDate: '2026-09-14',
  policyApplications: [
    { id: 'P63', creationDateTime: '2026-09-13T06:27:29Z', status: { id: 'Approved', name: 'Aprobada' }, policyNumber: '849651', quote: { id: 'Q1' }, payment: {} },
  ],
}

test('solicitudesEmision: lee policyApplications[] del proyecto con id, estado, nº de póliza y fecha', () => {
  const s = solicitudesEmision(PROYECTO_CON_SOLICITUD)
  assert.equal(s.length, 1)
  assert.deepEqual(s[0], {
    id: 'P63',
    creadaEn: '2026-09-13T06:27:29Z',
    estadoId: 'Approved',
    estadoNombre: 'Aprobada',
    numeroPoliza: '849651',
    veredicto: 'aprobada',
  })
  // La respuesta del Submit (array) y una solicitud suelta también.
  assert.equal(solicitudesEmision(PROYECTO_CON_SOLICITUD.policyApplications).length, 1)
  assert.equal(solicitudesEmision(PROYECTO_CON_SOLICITUD.policyApplications[0]).length, 1)
})

test('solicitudesEmision: sin policyApplications (o vacío) devuelve [], y un objeto sin señales no es una solicitud', () => {
  assert.deepEqual(solicitudesEmision({ id: 1, policyApplications: [] }), [])
  assert.deepEqual(solicitudesEmision({ id: 1 }), [])
  // El PROYECTO real del fixture (con `creationDateTime` y sin `policyApplications`)
  // NO es una solicitud: leerlo como tal pintaría una fila fantasma en la pantalla.
  const proyecto = JSON.parse(readFileSync(fileURLToPath(new URL('../../fixtures/codeoscopic/2026-06-10-sandbox-quote-response.json', import.meta.url)), 'utf8'))
  assert.deepEqual(solicitudesEmision(proyecto), [])
  assert.deepEqual(solicitudesEmision({ id: 1, creationDateTime: '2026-09-13T06:00:00Z', effectiveDate: '2026-09-14', status: { id: 'PendingReview' } }), [])
  assert.deepEqual(solicitudesEmision([{ id: 'x', creationDateTime: '2026-09-13T06:00:00Z' }]), [])
  assert.deepEqual(solicitudesEmision(null), [])
  assert.deepEqual(solicitudesEmision([{ premium: 12 }]), [])
})

test('veredictoSolicitud: solo Approved está documentado; lo raro es desconocido, nunca aprobada', () => {
  assert.equal(veredictoSolicitud('Approved'), 'aprobada')
  assert.equal(veredictoSolicitud('Rejected'), 'rechazada')
  assert.equal(veredictoSolicitud('PendingReview'), 'pendiente')
  assert.equal(veredictoSolicitud('ManualIntervention'), 'pendiente')
  assert.equal(veredictoSolicitud('Foo'), 'desconocido')
  assert.equal(veredictoSolicitud(null), 'desconocido')
})

test('solicitudViva: aprobada manda sobre pendiente; una rechazada sola no bloquea el reintento', () => {
  const mk = (estadoId: string) => solicitudesEmision([{ id: 'x', status: { id: estadoId } }])[0]
  assert.equal(solicitudViva([mk('Rejected'), mk('PendingReview'), mk('Approved')])?.estadoId, 'Approved')
  assert.equal(solicitudViva([mk('Rejected'), mk('PendingReview')])?.estadoId, 'PendingReview')
  assert.equal(solicitudViva([mk('Rejected')]), null)
  assert.equal(solicitudViva([]), null)
})

test('consejoTrasFallo: el 500 manda REPORTAR con el requestId; 502/503/504 «try again»; un 400 nada', () => {
  const con = consejoTrasFallo(ERROR_500.replace('"status":500', '"requestId":"0d65134e-161833","status":500'))
  assert.equal(con?.tipo, 'reportar')
  assert.match(con?.texto ?? '', /0d65134e-161833/)
  assert.match(con?.texto ?? '', /soporteapi@/)
  assert.equal(consejoTrasFallo('502: Bad Gateway')?.tipo, 'reintentar_en_minutos')
  assert.equal(consejoTrasFallo('504: Gateway Timeout')?.tipo, 'reintentar_en_minutos')
  // Un 505 no lleva la cita del 500: el portal no lo documenta.
  const raro = consejoTrasFallo('505: HTTP Version Not Supported')
  assert.equal(raro?.tipo, 'reportar')
  assert.doesNotMatch(raro?.texto ?? '', /unhandled exception/)
  assert.match(raro?.texto ?? '', /no documenta el 505/)
  assert.equal(consejoTrasFallo('400: {"message":"mandatory"}'), null)
  assert.equal(consejoTrasFallo(null), null)
  assert.equal(requestIdDe('sin json'), null)
})

// La regla «con una solicitud viva no hay reintento» vive en el SERVIDOR, no solo
// en un botón de plataforma: un cliente viejo o un POST directo al puerto no
// pueden colar `reintentoConfirmado` sobre una póliza que la compañía ya aprobó.
// Y el bloque de acuñar/guardas va ANTES de las puertas del IBAN y de los campos,
// que son del Submit y no del registro de una póliza ya emitida.
test('la ruta /emitir niega el reintento con una solicitud viva y acuña antes de las puertas del Submit (lee el fuente)', () => {
  const src = readFileSync(fileURLToPath(new URL('../../app/api/operador/codeoscopic/emitir/route.ts', import.meta.url)), 'utf8')
  assert.match(src, /if \(viva !== null \|\| \(\(rastro\.length > 0 \|\| quizaEmitidoAntes\) && cuerpo\.reintentoConfirmado !== true\)\)/)
  assert.ok(src.indexOf("cuerpo.acunarExistente === true") < src.indexOf('extraerIbanTecleado(camposCliente)'))
  assert.ok(src.indexOf('const crudoPrevio = await leerProyectoCrudo') < src.indexOf('camposDeEmision(r.config'))
})
