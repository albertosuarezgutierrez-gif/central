// Carné de moto de la `fichaTomador` (19/10/2026): la MISMA regla que plataforma — el más antiguo de A/A1/A2. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichaTomadorAutoDeFicha } from './tarificador-ficha-tomador.ts'

const fila = (carnets: { tipo: string; fechaCarnet: string }[]) => ({
  dni: null, direccion: null, codigoPostal: null, ciudad: null, provincia: null, fechaNacimiento: '1980-01-02', tipoPersona: 'fisica' as const, carnets,
})
const HOY = new Date('2026-10-19T00:00:00Z')

test('fichaTomador moto: elige el carné MÁS ANTIGUO de A/A1/A2, no el primero por rango', () => {
  const r = fichaTomadorAutoDeFicha(fila([{ tipo: 'A', fechaCarnet: '2010-06-30' }, { tipo: 'A2', fechaCarnet: '2005-05-05' }, { tipo: 'B', fechaCarnet: '1999-03-04' }]), (v) => v, 'moto', HOY)
  assert.equal(r?.tipoCarnet, 'A2')
  assert.equal(r?.fechaCarnet, '2005-05-05')
})

// ─── Mapfre: SOLO el contacto del tomador (26/10/2026, autorizado por Alberto) ───
import { aplicarFichaTomador, necesitaFichaTomador } from './tarificador-ficha-tomador.ts'

const filaMapfre = (extra: { telefonos?: string[]; emails?: string[] }) => ({
  dni: 'DNI-SINTETICO', direccion: 'Calle Falsa 1', codigoPostal: '41001', ciudad: 'Sevilla', provincia: 'Sevilla', fechaNacimiento: '1980-01-02', tipoPersona: 'fisica' as const, carnets: [], ...extra,
})

test('fichaTomador Mapfre auto y moto: recibe móvil y correo, y NADA más de la ficha', () => {
  for (const ramo of ['auto', 'moto']) {
    assert.equal(necesitaFichaTomador('mapfre', ramo), true)
    const r = fichaTomadorAutoDeFicha(filaMapfre({ telefonos: ['911 22 33 44', '+34 600 11 22 33'], emails: ['Prueba.Sintetica@Example.com'] }), (v) => v, ramo, HOY, 'mapfre')
    assert.equal(r?.telefono, '600112233') // el fijo se salta: Mapfre pide MÓVIL
    assert.equal(r?.email, 'prueba.sintetica@example.com')
    assert.equal(r?.documento, null)
    assert.equal(r?.codigoPostal, null)
    assert.equal(r?.direccion, null)
    assert.equal(r?.fechaNacimiento, null)
  }
  assert.equal(necesitaFichaTomador('mapfre', 'hogar'), false)
})

test('fichaTomador Mapfre: sin móvil ni correo legibles → sin ficha (tres estados, nunca relleno); cifrado ilegible no se manda', () => {
  assert.equal(fichaTomadorAutoDeFicha(filaMapfre({ telefonos: ['911223344'], emails: ['no-es-correo'] }), (v) => v, 'auto', HOY, 'mapfre'), null)
  assert.equal(fichaTomadorAutoDeFicha(filaMapfre({ telefonos: ['v1:xxxx'], emails: ['v1:yyyy'] }), () => { throw new Error('sin clave') }, 'auto', HOY, 'mapfre'), null)
  const solo = fichaTomadorAutoDeFicha(filaMapfre({ emails: ['a@example.com'] }), (v) => v, 'auto', HOY, 'mapfre')
  assert.equal(solo?.email, 'a@example.com')
  assert.equal(solo?.telefono ?? null, null)
})

test('fichaTomador: Allianz sigue SIN contacto (solo Mapfre lo recibe)', () => {
  const r = fichaTomadorAutoDeFicha(filaMapfre({ telefonos: ['600112233'], emails: ['a@example.com'] }), (v) => v, 'auto', HOY)
  assert.equal(r?.email ?? null, null)
  assert.equal(r?.telefono ?? null, null)
})

test('aplicarFichaTomador Mapfre: el riesgo lleva fichaTomador.email/telefono (los nombres que lee el bot) y datosTomador sigue aparte', () => {
  const f = fichaTomadorAutoDeFicha(filaMapfre({ telefonos: ['600112233'], emails: ['a@example.com'] }), (v) => v, 'auto', HOY, 'mapfre')
  const r = aplicarFichaTomador('mapfre', 'auto', { datosTomador: { tipo: 'fisica', nombre: 'Ana' } }, () => f) as { fichaTomador: { email: string; telefono: string }; datosTomador: { nombre: string } }
  assert.equal(r.fichaTomador.email, 'a@example.com')
  assert.equal(r.fichaTomador.telefono, '600112233')
  assert.equal(r.datosTomador.nombre, 'Ana')
})
