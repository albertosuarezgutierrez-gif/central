import test from 'node:test'
import assert from 'node:assert/strict'
import { bloqueoCompania, textoBloqueoCliente, textoBloqueoCorredor, emisionEscalonadaRecomendada, textoEmisionEscalonada, esAllianz } from './bloqueo-compania.ts'
import { revisarCopy } from './copy-regulado.ts'

// Literal de la tarificación real de Allianz Motos (29/09/2026).
const REAL = 'Observaciones de la compañía: ESTA POLIZA QUEDARÁ BLOQUEADA POR LA SIGUIENTE RAZÓN: INCENDIO-ROBO SIN DAÑOS, Prima calculada con fecha de efecto : 30/09/2026 y fecha de término : 01/09/2027'

test('saca el motivo del aviso real de Allianz', () => {
  assert.equal(bloqueoCompania(['Avisos sobre la prima: Prima anual real: 391.37€', REAL]), 'INCENDIO-ROBO SIN DAÑOS')
})

test('sin bloqueo → null; bloqueo sin motivo → cadena vacía (se avisa igual)', () => {
  assert.equal(bloqueoCompania(['Avisos sobre la prima: Prima anual real: 391.37€']), null)
  assert.equal(bloqueoCompania(null), null)
  assert.equal(bloqueoCompania(['La póliza quedará bloqueada']), '')
})

test('los textos recomiendan emitir la básica y ampliar; el del cliente pasa el copy regulado', () => {
  assert.match(textoBloqueoCorredor('INCENDIO-ROBO SIN DAÑOS'), /BLOQUEADA.*\(INCENDIO-ROBO SIN DAÑOS\).*básica.*suplemento/)
  assert.deepEqual(revisarCopy(textoBloqueoCliente()), [])
})

test('Allianz añade el aviso de la intranet; otra compañía o sin compañía, el texto de siempre', () => {
  const base = textoBloqueoCorredor('X')
  assert.equal(textoBloqueoCorredor('X', null), base)
  assert.equal(textoBloqueoCorredor('X', 'Reale'), base)
  const a = textoBloqueoCorredor('X', 'ALLIANZ Seguros')
  assert.ok(a.startsWith(base))
  assert.match(a, /SOLO en su intranet \(no por correo\): tienes que entrar tú/)
  assert.match(a, /no admite robo ni daños: pide la básica/)
  assert.equal(esAllianz('Allianz'), true)
  assert.equal(esAllianz(null), false)
})

test('emisión escalonada: todo riesgo (con/sin franquicia) o robo → true', () => {
  for (const t of ['Todo Riesgo con Franquicia', 'TODO RIESGO - Franquicia 450€', 'Seguro Todo Riesgo con Franquicia 300', 'Todo Riesgo', 'Seguro a Terceros + Robo', 'Terceros Completo (Asistencia, Robo e In…']) {
    assert.equal(emisionEscalonadaRecomendada({ modalidad: t }), true, t)
    assert.equal(emisionEscalonadaRecomendada({ categoria: t }), true, t)
  }
})

test('emisión escalonada: terceros básico/ampliado sin robo, null y vacío → false', () => {
  assert.equal(emisionEscalonadaRecomendada({ categoria: 'Terceros básico', modalidad: 'Terceros ampliado' }), false)
  assert.equal(emisionEscalonadaRecomendada({ categoria: 'Terceros Completo (Asistencia, Lunas)' }), false)
  assert.equal(emisionEscalonadaRecomendada({}), false)
  assert.equal(emisionEscalonadaRecomendada({ categoria: null, modalidad: undefined }), false)
  assert.match(textoEmisionEscalonada(), /emitir primero la BÁSICA.*suplemento/)
})
