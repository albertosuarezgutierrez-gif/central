import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MOTIVO_SIN_CUENTA, datosListosParaAceptar, interpretarCodigo, interpretarDatosCotizados, interpretarFirma, interpretarPreparar, leerEntradaCuenta,
} from './presupuesto-firma.ts'

test('🪤 solo un 200 con fecha es «aceptado»: un 401, un 5xx o un corte NO', () => {
  assert.deepEqual(interpretarFirma(200, { estado: 'aceptado', aceptadoEl: '2026-09-23' }), { estado: 'aceptado', aceptadoEl: '2026-09-23', aviso: null })
  assert.equal((interpretarFirma(200, { estado: 'aceptado', aceptadoEl: '2026-09-23', aviso: 'x' }) as { aviso: string | null }).aviso, 'x')
  assert.equal(interpretarFirma(401, { error: 'No autorizado' }).estado, 'error')
  assert.equal(interpretarFirma(503, { estado: 'error' }).estado, 'error')
  assert.equal(interpretarFirma(200, { estado: 'aceptado' }).estado, 'error')
})

test('los rechazos de la firma dicen qué hacer', () => {
  assert.deepEqual(interpretarFirma(422, { estado: 'codigo_incorrecto', quedan: 2 }), { estado: 'reintentar', motivo: 'Código incorrecto. Te quedan 2 intentos.' })
  assert.equal(interpretarFirma(422, { estado: 'codigo_incorrecto', quedan: 0 }).estado, 'reintentar')
  assert.equal(interpretarFirma(422, { estado: 'nombre_no_coincide' }).estado, 'reintentar')
  assert.equal(interpretarFirma(410, { estado: 'codigo_caducado' }).estado, 'reintentar')
  assert.equal(interpretarFirma(404, { estado: 'no_encontrado' }).estado, 'no_disponible')
  assert.equal(interpretarFirma(409, { estado: 'documento_cambiado' }).estado, 'no_disponible')
})

test('🪤 el código: «enviado» exige correo; sin_correo_configurado no es culpa del cliente', () => {
  assert.equal(interpretarCodigo(200, { estado: 'codigo_enviado', email: 'a***@x.es', minutos: 10 }).estado, 'codigo_enviado')
  assert.equal(interpretarCodigo(200, { estado: 'codigo_enviado' }).estado, 'error')
  assert.equal(interpretarCodigo(503, { estado: 'sin_correo_configurado', motivo: 'x' }).estado, 'error')
  assert.equal(interpretarCodigo(422, { estado: 'sin_email', motivo: 'x' }).estado, 'no_disponible')
  assert.deepEqual(interpretarCodigo(429, { estado: 'espera', segundos: 40 }), { estado: 'espera', segundos: 40 })
})

test('🪤 preparar: documentoHash válido y documento OK', () => {
  const r = interpretarPreparar(200, {
    estado: 'ok',
    consentimiento: 'Acepto', confirmacionDatos: 'He revisado mis datos',
    documento: 'Este es el documento',
    documentoHash: 'a'.repeat(64),
    anulacion: null,
    sinAnulacion: null,
    cuenta: { origen: 'nueva', mascara: '**** 1332' }, cuentaFicha: { mascara: null, aviso: null },
  })
  assert.equal(r?.estado, 'ok')
  assert.equal(r?.documentoHash, 'a'.repeat(64))
  assert.equal(r?.consentimiento, 'Acepto')
})

test('🪤 preparar con documentoHash inválido → null', () => {
  const r = interpretarPreparar(200, {
    estado: 'ok',
    consentimiento: 'Acepto', confirmacionDatos: 'He revisado mis datos',
    documento: 'Doc',
    documentoHash: 'invalid',
    anulacion: null,
    sinAnulacion: null,
  })
  assert.equal(r, null)
})

test('🪤 preparar: 500/401 → null, jamás aceptado', () => {
  assert.equal(interpretarPreparar(500, { estado: 'error' }), null)
  assert.equal(interpretarPreparar(401, { error: 'No autorizado' }), null)
  assert.equal(interpretarPreparar(0, {}), null)
})

test('🪤 la vista de corredor no firma: el veto va ANTES de llamar al puente', () => {
  const fuente = readFileSync(new URL('../app/api/presupuesto/firma/route.ts', import.meta.url), 'utf8')
  const veto = fuente.indexOf('identidad.corredor')
  assert.ok(veto > 0, 'falta el veto de la vista de corredor')
  assert.ok(veto < fuente.indexOf('pedirCodigoAceptacion(identidad.id'), 'el veto tiene que ir antes de pedir el código')
  assert.ok(veto < fuente.indexOf('firmarAceptacion(identidad.id'), 'el veto tiene que ir antes de firmar')
  assert.doesNotMatch(fuente, /b\.identidadId|clienteId/, 'la identidad sale de la sesión, nunca del cuerpo')
})

test('🪤 una carta de anulación a medias no se enseña para firmar', async () => {
  const { interpretarPreparar } = await import('./presupuesto-firma.ts')
  const ok = { estado: 'ok', consentimiento: 'c', confirmacionDatos: 'He revisado mis datos', documento: 'd', documentoHash: 'a'.repeat(64), anulacion: null, sinAnulacion: null, cuenta: { origen: 'nueva', mascara: '**** 1332' }, cuentaFicha: { mascara: null, aviso: null }, }
  assert.equal(interpretarPreparar(200, ok)?.estado, 'ok')
  assert.equal(interpretarPreparar(200, { ...ok, anulacion: { compania: 'Mapfre', numeroPoliza: '1', fechaEfecto: '2026-12-31', carta: '' } }), null)
  assert.equal(interpretarPreparar(200, { ...ok, anulacion: { compania: 'Mapfre', numeroPoliza: '1', fechaEfecto: 'mañana', carta: 'x' } }), null)
  assert.equal(interpretarPreparar(401, {}), null)
})

// ─── «Revisa tus datos» (28/09/2026) ──────────────────────────────────────────
const pagina = readFileSync(new URL('../app/(portal)/boveda/presupuesto/[id]/page.tsx', import.meta.url), 'utf8')
const rutaFirma = readFileSync(new URL('../app/api/presupuesto/firma/route.ts', import.meta.url), 'utf8')

test('🪤 datos ilegibles → no se ofrece aceptar (fail-closed), también ante un 5xx o una forma rara', () => {
  const ok = { estado: 'ok', datos: [{ titulo: 'Tomador', filas: [{ etiqueta: 'DNI/NIE', valor: '***78Z' }] }], confirmacionDatos: 'He revisado…', enRevision: false }
  assert.equal(datosListosParaAceptar(interpretarDatosCotizados(200, ok)), true)
  assert.equal(datosListosParaAceptar(interpretarDatosCotizados(503, ok)), false)
  assert.equal(datosListosParaAceptar(interpretarDatosCotizados(200, { estado: 'sin_datos', motivo: 'x' })), false)
  assert.equal(datosListosParaAceptar(interpretarDatosCotizados(200, { ...ok, datos: [] })), false)
  assert.equal(datosListosParaAceptar(interpretarDatosCotizados(200, { ...ok, enRevision: true })), false)
  assert.equal(datosListosParaAceptar(null), false)
  // La página se lo pasa a cada «Elegir esta opción».
  assert.match(pagina, /bloqueoDatos=\{bloqueoDatos\}/)
  assert.match(pagina, /const bloqueoDatos = datosListosParaAceptar\(cotizados\)\s*\? null/)
})

test('🪤 sin la casilla, el portal tampoco manda la firma, y el rechazo del servidor se traduce', () => {
  assert.match(rutaFirma, /if \(b\.datosConfirmados !== true\) \{\s*return NextResponse\.json\(\{ estado: 'reintentar', motivo: MOTIVO_SIN_CASILLA \}/)
  assert.equal(interpretarFirma(422, { estado: 'sin_confirmar_datos' }).estado, 'reintentar')
  assert.equal(interpretarFirma(409, { estado: 'sin_datos' }).estado, 'no_disponible')
  assert.equal(interpretarFirma(409, { estado: 'datos_en_revision' }).estado, 'no_disponible')
  // `preparar` sin el texto de la casilla no se enseña para firmar.
  const prep = { estado: 'ok', consentimiento: 'c', documento: 'd', documentoHash: 'a'.repeat(64), anulacion: null, cuenta: { origen: 'nueva', mascara: '**** 1332' }, cuentaFicha: { mascara: null, aviso: null }, }
  assert.equal(interpretarPreparar(200, prep), null)
  assert.equal(interpretarPreparar(200, { ...prep, confirmacionDatos: 'He revisado…' })?.estado, 'ok')
})

// ─── Cuenta de domiciliación e información previa (IPID) (28/09/2026) ─────────
const aceptar = readFileSync(new URL('../app/(portal)/boveda/presupuesto/[id]/AceptarOpcion.tsx', import.meta.url), 'utf8')
const comparativa = readFileSync(new URL('../app/(portal)/boveda/presupuesto/[id]/Comparativa.tsx', import.meta.url), 'utf8')

test('🪤 firma sin cuenta: el portal no la manda, y el rechazo del servidor (IBAN inválido) se traduce', () => {
  // La ruta corta ANTES de llamar al puente si no hay una elección de cuenta legible.
  const corte = rutaFirma.indexOf("if (!cuenta) return NextResponse.json({ estado: 'reintentar', motivo: MOTIVO_SIN_CUENTA }")
  assert.ok(corte > 0 && corte < rutaFirma.indexOf('firmarAceptacion(identidad.id'), 'sin cuenta no se llama a firmar')
  assert.equal(leerEntradaCuenta(undefined), null)
  assert.equal(leerEntradaCuenta({ eleccion: 'otra', iban: '   ' }), null)
  assert.equal(leerEntradaCuenta({ eleccion: 'sí' }), null)
  assert.deepEqual(leerEntradaCuenta({ eleccion: 'ficha', iban: 'ES91' }), { eleccion: 'ficha' })
  assert.deepEqual(leerEntradaCuenta({ eleccion: 'otra', iban: ' ES91 2100 ' }), { eleccion: 'otra', iban: 'ES91 2100' })
  // El servidor rechaza: se pide corregir, no se pinta «aceptada».
  const r = interpretarFirma(422, { estado: 'iban_invalido', motivo: 'Ese IBAN no es válido.' })
  assert.deepEqual(r, { estado: 'reintentar', motivo: 'Ese IBAN no es válido.' })
  assert.deepEqual(interpretarFirma(422, { estado: 'sin_cuenta' }), { estado: 'reintentar', motivo: MOTIVO_SIN_CUENTA })
  assert.equal(interpretarFirma(503, { estado: 'sin_cifrado' }).estado, 'no_disponible')
  // Y la pantalla manda la cuenta con la firma.
  assert.match(aceptar, /accion: 'firmar',[^)]*cuenta: paso\.eleccion/)
})

test('🪤 la cuenta de la ficha solo llega ENMASCARADA: una «máscara» que es el IBAN entero no se pinta', () => {
  const base = { estado: 'ok', consentimiento: 'c', confirmacionDatos: 'x', documento: 'd', documentoHash: 'a'.repeat(64), anulacion: null, sinAnulacion: null, cuentaFicha: { mascara: null, aviso: null } }
  assert.equal(interpretarPreparar(200, { ...base, cuenta: { origen: 'nueva', mascara: '**** 1332' } })?.estado, 'ok')
  assert.equal(interpretarPreparar(200, { ...base, cuenta: { origen: 'nueva', mascara: 'ES9121000418450200051332' } }), null)
  assert.equal(interpretarPreparar(200, { ...base, cuenta: null }), null)
  const elegir = interpretarPreparar(200, { estado: 'elegir_cuenta', cuentaFicha: { mascara: '**** 1332', aviso: null } })
  assert.deepEqual(elegir, { estado: 'elegir_cuenta', cuentaFicha: { mascara: '**** 1332', aviso: null }, motivo: undefined })
  assert.equal(interpretarPreparar(200, { estado: 'elegir_cuenta', cuentaFicha: { mascara: 'ES9121000418450200051332', aviso: null } }), null)
})

test('🪤 cada opción enlaza su IPID o dice que se enviará antes de emitir (sin bloquear)', () => {
  assert.match(comparativa, /href=\{`\/api\/ipid\/\$\{o\.ipidId\}`\}/)
  assert.match(comparativa, /Ficha informativa del producto \(IPID\)/)
  assert.match(comparativa, /TEXTO_SIN_IPID = 'La ficha informativa de este producto te la enviamos antes de emitir\.'/)
  // Y el IPID no entra en la decisión de poder aceptar.
  assert.doesNotMatch(pagina, /ipidId[^\n]*puedeAceptar|puedeAceptar[^\n]*ipidId/)
})
