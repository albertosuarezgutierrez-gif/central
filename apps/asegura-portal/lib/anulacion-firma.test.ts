import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { interpretarCodigo, interpretarFirma, interpretarPendientes, interpretarSolicitud } from './anulacion-firma.ts'

test('🪤 solo un 200 con fecha es «firmada»: un 401, un 5xx o un corte NO', () => {
  assert.deepEqual(interpretarFirma(200, { estado: 'firmada', firmadaEl: '2026-09-23' }), { estado: 'firmada', firmadaEl: '2026-09-23' })
  assert.equal(interpretarFirma(401, { error: 'No autorizado' }).estado, 'error')
  assert.equal(interpretarFirma(503, { estado: 'error' }).estado, 'error')
  assert.equal(interpretarFirma(200, { estado: 'firmada' }).estado, 'error')
})

test('los rechazos de la firma dicen qué hacer', () => {
  assert.deepEqual(interpretarFirma(422, { estado: 'codigo_incorrecto', quedan: 2 }), { estado: 'reintentar', motivo: 'Código incorrecto. Te quedan 2 intentos.' })
  assert.equal(interpretarFirma(422, { estado: 'codigo_incorrecto', quedan: 0 }).estado, 'reintentar')
  assert.equal(interpretarFirma(422, { estado: 'nombre_no_coincide' }).estado, 'reintentar')
  assert.equal(interpretarFirma(410, { estado: 'codigo_caducado' }).estado, 'reintentar')
  assert.equal(interpretarFirma(404, { estado: 'no_encontrada' }).estado, 'no_disponible')
  assert.equal(interpretarFirma(409, { estado: 'carta_cambiada' }).estado, 'no_disponible')
})

test('🪤 el código: «enviado» exige correo; sin_correo_configurado no es culpa del cliente', () => {
  assert.equal(interpretarCodigo(200, { estado: 'codigo_enviado', email: 'a***@x.es', minutos: 10 }).estado, 'codigo_enviado')
  assert.equal(interpretarCodigo(200, { estado: 'codigo_enviado' }).estado, 'error')
  assert.equal(interpretarCodigo(503, { estado: 'sin_correo_configurado', motivo: 'x' }).estado, 'error')
  assert.equal(interpretarCodigo(422, { estado: 'sin_email', motivo: 'x' }).estado, 'no_disponible')
  assert.deepEqual(interpretarCodigo(429, { estado: 'espera', segundos: 40 }), { estado: 'espera', segundos: 40 })
})

test('🪤 pendientes: no poder leerlas (null) no es «no tienes nada» ([])', () => {
  assert.equal(interpretarPendientes(503, null), null)
  assert.equal(interpretarPendientes(200, { estado: 'ok', anulaciones: [] }), null, 'sin consentimiento no hay con qué firmar')
  assert.deepEqual(interpretarPendientes(409, { estado: 'sin_ficha' }), { anulaciones: [], consentimiento: '', firmadas: [], enRevision: [] })
  const r = interpretarPendientes(200, {
    estado: 'ok', consentimiento: 'Texto',
    anulaciones: [{ id: 'a1', tipo: 'no_renovacion', fechaEfecto: '2026-12-01', carta: 'Carta', cartaHash: 'a'.repeat(64), compania: 'Mapfre', numeroPoliza: '1' }, { id: 'a2' }],
  })
  assert.equal(r?.anulaciones.length, 1)
  assert.equal(r?.anulaciones[0].carta, 'Carta')
  assert.equal(r?.anulaciones[0].cartaHash, 'a'.repeat(64))
})

test('🪤 la vista de corredor no firma: el veto va ANTES de llamar al puente', () => {
  const fuente = readFileSync(new URL('../app/api/anulacion/route.ts', import.meta.url), 'utf8')
  const veto = fuente.indexOf('identidad.corredor')
  assert.ok(veto > 0, 'falta el veto de la vista de corredor')
  assert.ok(veto < fuente.indexOf('pedirCodigo(identidad.id'), 'el veto tiene que ir antes de pedir el código')
  assert.ok(veto < fuente.indexOf('firmar(identidad.id'), 'el veto tiene que ir antes de firmar')
  assert.doesNotMatch(fuente, /b\.identidadId|clienteId/, 'la identidad sale de la sesión, nunca del cuerpo')
})

test('🪤 el código vigente vuelve con la lectura: tras recargar se teclea el que ya llegó, no se pide otro', () => {
  const base = { id: 'a1', tipo: 'sustitucion', fechaEfecto: '2026-09-29', carta: 'Carta', cartaHash: 'a'.repeat(64) }
  const r = interpretarPendientes(200, { estado: 'ok', consentimiento: 'T', anulaciones: [{ ...base, codigoCaducaEn: '2026-09-28T08:27:22.000Z' }] })
  assert.equal(r?.anulaciones[0].codigoCaducaEn, '2026-09-28T08:27:22.000Z')
  const sin = interpretarPendientes(200, { estado: 'ok', consentimiento: 'T', anulaciones: [{ ...base, codigoCaducaEn: 'mañana' }] })
  assert.equal(sin?.anulaciones[0].codigoCaducaEn, null, 'una fecha ilegible no abre el campo del código')
})

test('las bajas ya firmadas se leen con su estado; sin el campo (asegura viejo) no se inventa ninguna', () => {
  const r = interpretarPendientes(200, {
    estado: 'ok', consentimiento: 'T', anulaciones: [],
    firmadas: [
      { id: 'f1', tipo: 'sustitucion', fechaEfecto: '2026-09-29', estado: 'comunicada', firmadaEl: '2026-09-28', comunicadaEl: '2026-09-28', compania: 'Mapfre', numeroPoliza: '0008', justificante: true },
      { id: 'f2', tipo: 'sustitucion', fechaEfecto: '2026-09-29', estado: 'solicitada', firmadaEl: '2026-09-28' },
      { id: 'f3', tipo: 'sustitucion', fechaEfecto: '2026-09-29', estado: 'firmada' },
    ],
  })
  assert.equal(r?.firmadas.length, 1, 'ni una «solicitada» ni una sin fecha de firma pasan por firmada')
  assert.equal(r?.firmadas[0].comunicadaEl, '2026-09-28')
  assert.equal(r?.firmadas[0].confirmadaEl, null)
  assert.equal(r?.firmadas[0].justificante, true)
  assert.deepEqual(interpretarPendientes(200, { estado: 'ok', consentimiento: 'T', anulaciones: [] })?.firmadas, [])
})

test('🪤 solicitar baja: solo un 201 «creada» es éxito; ya abierta, ajena y no vigente dicen qué pasa; un 5xx no es «recibida»', () => {
  const ok = interpretarSolicitud(201, { estado: 'creada', id: 'a1', liberada: false, liberaSolaAt: '2026-10-07T10:00:00.000Z', advertencia: null, motivo: 'precio', motivoTexto: 'competidor: AXA · precio_ofrecido: 99,00€', poliza: { id: 'p1', compania: 'Mapfre', numeroPoliza: '123456' } })
  assert.equal(ok.estado, 'ok')
  assert.equal(ok.estado === 'ok' && ok.poliza.numeroPoliza, '123456')
  assert.equal(ok.estado === 'ok' && ok.liberaSolaAt, '2026-10-07T10:00:00.000Z')
  assert.equal(interpretarSolicitud(200, { estado: 'creada', id: 'a1' }).estado, 'error', 'solo el 201')
  assert.equal(interpretarSolicitud(201, { estado: 'creada' }).estado, 'error')
  assert.equal(interpretarSolicitud(409, { estado: 'ya_abierta' }).estado, 'no_disponible')
  assert.equal(interpretarSolicitud(403, { estado: 'no_es_tuya' }).estado, 'no_disponible')
  assert.equal(interpretarSolicitud(422, { estado: 'no_vigente' }).estado, 'no_disponible')
  assert.equal(interpretarSolicitud(422, { estado: 'ofrecer_presupuesto', motivo: 'x' }).estado, 'ofrecer_presupuesto')
  assert.equal(interpretarSolicitud(422, { estado: 'invalida', motivo: 'Elige el motivo.' }).estado, 'invalido')
  assert.equal(interpretarSolicitud(401, { error: 'No autorizado' }).estado, 'error')
  assert.equal(interpretarSolicitud(503, { estado: 'error' }).estado, 'error')
})

test('enRevision: se lee con su hora; un asegura viejo (sin el campo) no inventa ninguna; sin fecha legible se descarta', () => {
  const base = { estado: 'ok', consentimiento: 'T', anulaciones: [] }
  assert.deepEqual(interpretarPendientes(200, base)?.enRevision, [])
  const r = interpretarPendientes(200, { ...base, enRevision: [{ id: 'r1', polizaId: 'p1', numeroPoliza: '9', compania: 'AXA', liberaSolaAt: '2026-10-07T10:00:00.000Z' }, { id: 'r2', liberaSolaAt: 'mañana' }] })
  assert.equal(r?.enRevision.length, 1)
  assert.equal(r?.enRevision[0]!.polizaId, 'p1')
})

test('🪤 /api/anulacion/solicitar: sin sesión 401, vista de corredor 403 ANTES de llamar al puente, y la identidad sale de la sesión', () => {
  const f = readFileSync(new URL('../app/api/anulacion/solicitar/route.ts', import.meta.url), 'utf8')
  const sesion = f.indexOf('requireIdentidad()')
  const veto = f.indexOf('identidad.corredor')
  assert.ok(sesion > 0 && /sin_sesion' \}, \{ status: 401/.test(f))
  assert.ok(veto > sesion && veto < f.indexOf('await solicitar('), 'el veto va antes del puente')
  assert.match(f, /solo_lectura' \}, \{ status: 403/)
  assert.match(f, /solicitar\(identidad\.id, cuerpo\)/)
  assert.doesNotMatch(f, /b\.identidadId|clienteId/)
  assert.match(f, /after\(async/, 'el aviso va tras contestar y no puede tumbar la respuesta')
})

import { MENSAJE_VARIAS_FICHAS as VARIAS, MENSAJE_SOLO_CONSULTA } from './mensajes-ficha.ts'

test('🪤 varias_fichas nunca se traduce a «No encontramos esta póliza entre las tuyas»', () => {
  for (const r of [interpretarSolicitud(409, { estado: 'varias_fichas' }), interpretarCodigo(409, { estado: 'varias_fichas' }), interpretarFirma(409, { estado: 'varias_fichas' })]) {
    assert.deepEqual(r, { estado: 'no_disponible', motivo: VARIAS })
  }
  const sf = interpretarSolicitud(404, { estado: 'no_es_tuya' })
  assert.match((sf as { motivo: string }).motivo, /No encontramos esta póliza/)
})

test('🪤 H2: sin_permiso (vinculada, solo consulta) tiene texto propio y NO se dice «no es tuya»', () => {
  const r = interpretarSolicitud(403, { estado: 'sin_permiso' })
  assert.equal(r.estado, 'no_disponible')
  assert.equal((r as { motivo: string }).motivo, MENSAJE_SOLO_CONSULTA)
  assert.match(MENSAJE_SOLO_CONSULTA, /solo consulta.*llámanos/)
  assert.doesNotMatch(MENSAJE_SOLO_CONSULTA, /tuyas|no es tuya/)
  // y no_es_tuya sigue siendo el genérico, sin rastro del texto de solo consulta
  assert.notEqual((interpretarSolicitud(403, { estado: 'no_es_tuya' }) as { motivo: string }).motivo, MENSAJE_SOLO_CONSULTA)
})
