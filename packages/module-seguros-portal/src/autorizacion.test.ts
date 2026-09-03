import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALCANCES,
  ALCANCES_CONCEDIBLES,
  DIAS_VIGENCIA,
  alcanceConcedible,
  autorizacionVigente,
  caducidadPorDefecto,
  camposDeAlcance,
  camposDeAlcances,
  estadoAutorizacion,
  etiquetaNivelAlcances,
  puedeAutorizar,
} from './autorizacion.ts'
import { NIVELES, camposVisibles } from './acceso.ts'

const HOY = new Date('2026-09-03T10:00:00Z')
const MANANA = new Date('2026-09-04T10:00:00Z')
const AYER = new Date('2026-09-02T10:00:00Z')

test('una autorizacion nace pendiente: conceder no basta, hace falta que la acepten', () => {
  assert.equal(
    estadoAutorizacion({ aceptadoEn: null, caducaEn: MANANA, revocadoEn: null }, HOY),
    'pendiente',
  )
  assert.equal(
    autorizacionVigente({ aceptadoEn: null, caducaEn: MANANA, revocadoEn: null }, HOY),
    false,
  )
})

test('aceptada y en plazo es la UNICA combinacion que abre datos ajenos', () => {
  assert.equal(
    autorizacionVigente({ aceptadoEn: AYER, caducaEn: MANANA, revocadoEn: null }, HOY),
    true,
  )
})

test('revocar gana a todo, incluso a una aceptada y en plazo', () => {
  assert.equal(
    estadoAutorizacion({ aceptadoEn: AYER, caducaEn: MANANA, revocadoEn: HOY }, HOY),
    'revocada',
  )
})

test('caducada sin haberse aceptado se dice CADUCADA, no pendiente', () => {
  // Decir «pendiente» invitaria a esperar una aceptacion que ya no puede valer.
  assert.equal(
    estadoAutorizacion({ aceptadoEn: null, caducaEn: AYER, revocadoEn: null }, HOY),
    'caducada',
  )
})

test('caduca EN el instante exacto: el limite no es vigente', () => {
  assert.equal(
    estadoAutorizacion({ aceptadoEn: AYER, caducaEn: HOY, revocadoEn: null }, HOY),
    'caducada',
  )
})

test('la caducidad por defecto es un ano', () => {
  assert.equal(DIAS_VIGENCIA, 365)
  const hasta = caducidadPorDefecto(new Date('2026-09-03T00:00:00Z'))
  assert.equal(hasta.toISOString().slice(0, 10), '2027-09-03')
})

test('solo el dueno de la ficha concede: tarjeta y completo no autorizan a nadie', () => {
  assert.equal(puedeAutorizar('tarjeta'), false)
  assert.equal(puedeAutorizar('completo'), false)
  assert.equal(puedeAutorizar('gestionar'), true)
  assert.equal(puedeAutorizar('administrar'), true)
  // Y no se olvida ningun nivel: si manana hay uno nuevo, este test obliga a decidir.
  assert.equal(NIVELES.filter(puedeAutorizar).length, 2)
})

test('partes y documentos son apoderamiento: existen pero HOY no se conceden', () => {
  assert.deepEqual([...ALCANCES], ['ver', 'ver_economico', 'partes', 'documentos'])
  assert.deepEqual([...ALCANCES_CONCEDIBLES], ['ver', 'ver_economico'])
  assert.equal(alcanceConcedible('partes'), null)
  assert.equal(alcanceConcedible('documentos'), null)
  assert.equal(alcanceConcedible('ver'), 'ver')
  assert.equal(alcanceConcedible('  VER_ECONOMICO '), 'ver_economico')
  assert.equal(alcanceConcedible('administrar'), null)
  assert.equal(alcanceConcedible(null), null)
  assert.equal(alcanceConcedible(true), null)
})

test('NINGUN alcance ensena el IBAN ni el DNI del otorgante', () => {
  // El agujero que tenia el booleano del CRM: se leia como `completo`, y
  // `completo` trae iban y dniTomador. Un tercero ve la COSA, no la PERSONA.
  for (const a of ALCANCES) {
    const c = camposDeAlcance(a)
    assert.equal(c.iban, false, `${a} no puede ensenar el IBAN`)
    assert.equal(c.dniTomador, false, `${a} no puede ensenar el DNI`)
    assert.equal(c.documentos, false, `${a} no puede ensenar los documentos`)
  }
  // Y que el cepo muerde de verdad: el nivel del que parte SI los trae.
  assert.equal(camposVisibles('completo').iban, true)
  assert.equal(camposVisibles('completo').dniTomador, true)
})

test('ningun alcance deja ACTUAR en nombre de otro', () => {
  for (const a of ALCANCES) {
    const c = camposDeAlcance(a)
    assert.equal(c.abrirParte, false, `${a} no puede abrir un parte`)
    assert.equal(c.crearPeticiones, false, `${a} no puede crear peticiones`)
    assert.equal(c.autorizarTerceros, false, `${a} no puede reautorizar a un cuarto`)
  }
  // `tarjeta` deja abrir parte a quien es de la casa; a un tercero, no.
  assert.equal(camposVisibles('tarjeta').abrirParte, true)
})

test('ver ensena la tarjeta y calla lo economico; ver_economico lo abre', () => {
  const ver = camposDeAlcance('ver')
  assert.equal(ver.compania, true)
  assert.equal(ver.numeroPoliza, true)
  assert.equal(ver.coberturas, true)
  assert.equal(ver.prima, false)
  assert.equal(ver.recibos, false)

  const eco = camposDeAlcance('ver_economico')
  assert.equal(eco.prima, true)
  assert.equal(eco.recibos, true)
})

test('sin alcances vigentes no se ensena NADA, ni la tarjeta por cortesia', () => {
  assert.equal(camposDeAlcances([]), null)
})

test('varios alcances se unen campo a campo y siguen capados', () => {
  const u = camposDeAlcances(['ver', 'ver_economico'])
  assert.notEqual(u, null)
  assert.equal(u?.prima, true)
  assert.equal(u?.coberturas, true)
  assert.equal(u?.iban, false)
  assert.equal(u?.dniTomador, false)
})

test('la etiqueta de nivel es solo texto y no decide nada', () => {
  assert.equal(etiquetaNivelAlcances(['ver']), 'tarjeta')
  assert.equal(etiquetaNivelAlcances(['ver', 'ver_economico']), 'completo')
  // Aunque la etiqueta diga `completo`, lo servido sigue sin iban.
  assert.equal(camposDeAlcances(['ver_economico'])?.iban, false)
})
