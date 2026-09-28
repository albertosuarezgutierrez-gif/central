// Cepos de la cuenta de domiciliación y la casilla de autorización del presupuesto (28/09/2026).
// Puro: corre sin prisma generate. Los dos últimos leen el FUENTE de la firma, porque lo que
// vigilan (qué viaja al historial, al evento y al Telegram) vive dentro de SQL y de plantillas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  MOTIVO_IBAN_INVALIDO, TEXTO_CONFIRMACION_CON_IPID, lineaCuentaAviso, lineaCuentaDocumento, lineaCuentaHistorial,
  mascaraCuenta, resolverCuentaFirma, textoAutorizacion,
} from './presupuesto-cuenta.ts'
import { TEXTO_CONFIRMACION_DATOS, avisoAceptacion, enlaceFichaCliente, leerDatosCotizados } from './datos-cotizados.ts'

// IBAN de ejemplo válido (módulo 97) y el mismo con un dígito cambiado.
const BUENO = 'ES91 2100 0418 4502 0005 1332'
const BUENO_NORMAL = 'ES9121000418450200051332'
const MALO = 'ES91 2100 0418 4502 0005 1333'

test('🪤 un IBAN que no pasa el módulo 97 se RECHAZA en servidor (y uno sin forma, también)', () => {
  const r = resolverCuentaFirma({ fichaIban: null, eleccion: 'otra', ibanNuevo: MALO })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.estado, 'iban_invalido')
    assert.equal(r.motivo, MOTIVO_IBAN_INVALIDO)
  }
  for (const basura of ['ES00', '12345678901234567890', 'XX'.repeat(20), 'ES91-2100-0418']) {
    const b = resolverCuentaFirma({ fichaIban: null, eleccion: 'otra', ibanNuevo: basura })
    assert.equal(b.ok, false, basura)
  }
  const ok = resolverCuentaFirma({ fichaIban: null, eleccion: 'otra', ibanNuevo: BUENO })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.deepEqual(ok.cuenta, { iban: BUENO_NORMAL, origen: 'nueva', mascara: '**** 1332' })
})

test('🪤 sin cuenta NO se firma: ni sin elegir, ni «la de mi ficha» cuando la ficha no tiene', () => {
  for (const entrada of [
    { fichaIban: null, eleccion: undefined, ibanNuevo: undefined },
    { fichaIban: null, eleccion: null, ibanNuevo: null },
    { fichaIban: null, eleccion: 'ficha', ibanNuevo: null },
    { fichaIban: 'ES00INVALIDA', eleccion: 'ficha', ibanNuevo: null },
    { fichaIban: BUENO_NORMAL, eleccion: 'otra', ibanNuevo: '   ' },
    { fichaIban: BUENO_NORMAL, eleccion: 'sí', ibanNuevo: BUENO },
    { fichaIban: BUENO_NORMAL, eleccion: true, ibanNuevo: BUENO },
  ]) {
    const r = resolverCuentaFirma(entrada)
    assert.equal(r.ok, false, JSON.stringify(entrada))
    if (!r.ok) assert.equal(r.estado, 'sin_cuenta', JSON.stringify(entrada))
  }
  // Con la de la ficha elegida explícitamente, sí; y la misma tecleada otra vez no cuenta como nueva.
  const ficha = resolverCuentaFirma({ fichaIban: BUENO_NORMAL, eleccion: 'ficha', ibanNuevo: null })
  assert.equal(ficha.ok && ficha.cuenta.origen, 'ficha')
  const misma = resolverCuentaFirma({ fichaIban: BUENO_NORMAL, eleccion: 'otra', ibanNuevo: BUENO })
  assert.equal(misma.ok && misma.cuenta.origen, 'ficha')
})

test('🪤 el IBAN NUNCA sale completo en el documento, el historial ni el Telegram: solo «**** 1234»', () => {
  const r = resolverCuentaFirma({ fichaIban: null, eleccion: 'otra', ibanNuevo: BUENO })
  assert.ok(r.ok)
  if (!r.ok) return
  const d = leerDatosCotizados({ insuranceLine: { id: 'Car' }, holder: { name: 'Pilar', surname: 'Franco', identificationDocument: { id: '12345678Z' } } }, 'auto')
  assert.equal(d.estado, 'ok')
  if (d.estado !== 'ok') return
  const tg = avisoAceptacion({
    tomador: 'Pilar Franco', ramo: 'auto', compania: 'Allianz', producto: null, primaEur: 300, franquiciaEur: null, datos: d,
    anulacionCompania: null, sinAnulacion: null, enlaceFicha: enlaceFichaCliente('c1'),
    confirmacion: textoAutorizacion(true), cuenta: lineaCuentaAviso(r.cuenta), ipidMostrado: true,
  })
  const textos = [lineaCuentaDocumento(r.cuenta), lineaCuentaHistorial(r.cuenta), lineaCuentaAviso(r.cuenta), tg]
  for (const t of textos) {
    assert.doesNotMatch(t.replace(/\s/g, ''), /21000418|45020005|ES912100/, t)
    assert.match(t, /\*\*\*\* 1332/, t)
  }
  assert.match(tg, /cuenta: \*\*\*\* 1332 \(nueva, la ha dado el cliente\)/)
  const deFicha = resolverCuentaFirma({ fichaIban: BUENO_NORMAL, eleccion: 'ficha', ibanNuevo: null })
  assert.ok(deFicha.ok)
  if (deFicha.ok) assert.equal(lineaCuentaAviso(deFicha.cuenta), 'cuenta: **** 1332 (la de su ficha)')
  assert.equal(mascaraCuenta('ES12'), null)
})

test('🪤 la casilla solo dice «he recibido la información previa» si había IPID de la opción', () => {
  assert.equal(textoAutorizacion(false), TEXTO_CONFIRMACION_DATOS)
  assert.doesNotMatch(textoAutorizacion(false), /información previa/)
  assert.equal(textoAutorizacion(true), TEXTO_CONFIRMACION_CON_IPID)
  assert.match(textoAutorizacion(true), /autorizo la emisión de la póliza y he recibido la información previa del producto\.$/)
})

const fuente = readFileSync(fileURLToPath(new URL('./presupuesto-aceptacion.ts', import.meta.url)), 'utf8')

test('🪤 en la firma el IBAN en claro solo va a encryptField: ni al evento, ni al historial, ni a un log', () => {
  // `cuenta.iban` (la cuenta resuelta, en claro) aparece UNA vez: dentro de `encryptField(...)`.
  const usos = fuente.match(/(?<![.\w])cuenta\.iban\b/g) ?? []
  assert.equal(usos.length, 1, `usos de cuenta.iban: ${usos.length}`)
  assert.match(fuente, /encryptField\(cuenta\.iban\)/)
  // Y lo cifrado solo se escribe si ES cifrado: sin clave, `encryptField` devuelve el texto tal cual.
  assert.match(fuente, /startsWith\('v1:'\)\) return \{ estado: 'sin_cifrado' \}/)
  // El evento guarda `c.cuenta` (origen + máscara), nunca el objeto con el IBAN.
  assert.match(fuente, /cuenta: c\.cuenta,/)
  assert.doesNotMatch(fuente, /console\.[a-z]+\([^)]*iban/i)
})

test('🪤 firmar sin cuenta válida corta ANTES de gastar un intento del código', () => {
  const corte = fuente.indexOf("if (!rc.ok) return { estado: rc.estado, motivo: rc.motivo }")
  const intento = fuente.indexOf('firma_otp_intentos = firma_otp_intentos + 1')
  assert.ok(corte > 0 && intento > 0 && corte < intento, 'el corte por cuenta tiene que ir antes de gastar el código')
})

test('🪤 al emitir, una cuenta NUEVA firmada en el portal va antes que la de la póliza vieja', async () => {
  const { polizaParaCuenta } = await import('./presupuesto-cuenta.ts')
  assert.equal(polizaParaCuenta('pol-vieja', 'nueva'), null)
  assert.equal(polizaParaCuenta('pol-vieja', 'ficha'), 'pol-vieja')
  assert.equal(polizaParaCuenta('pol-vieja', null), 'pol-vieja')
  const emitir = readFileSync(fileURLToPath(new URL('../app/api/operador/codeoscopic/emitir/route.ts', import.meta.url)), 'utf8')
  assert.match(emitir, /cuentaDeFicha\(correduria\.id, polizaParaCuenta\(ctx\.polizaOrigenId, aceptada\?\.origen \?\? null\)/)
})

test('🪤 al emitir NO se ofrece una cuenta cuya máscara no es la firmada', async () => {
  const { cuentaDistintaDeLaFirmada } = await import('./presupuesto-cuenta.ts')
  assert.equal(cuentaDistintaDeLaFirmada(BUENO_NORMAL, '**** 1332'), false)
  assert.equal(cuentaDistintaDeLaFirmada(BUENO_NORMAL, '**** 1111'), true)
  assert.equal(cuentaDistintaDeLaFirmada(null, '**** 1111'), false)
  assert.equal(cuentaDistintaDeLaFirmada(BUENO_NORMAL, null), false)
  const emitir = readFileSync(fileURLToPath(new URL('../app/api/operador/codeoscopic/emitir/route.ts', import.meta.url)), 'utf8')
  const corte = emitir.indexOf('cuentaDistintaDeLaFirmada(cuentaAEnviar')
  assert.match(emitir, /const cuentaAEnviar = ibanHumano \?\? ficha\.iban/)
  const decision = emitir.indexOf('decidirCuentaEnvio({')
  assert.ok(corte > 0 && corte < decision, 'la comprobación va antes de decidir qué cuenta se manda')
})
