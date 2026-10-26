import { describe, it, expect } from 'vitest'
import {
  diasSesion, opcionesCookieSesion, leerCookie, empresaDeEntrada, enmascararEmail, COOKIE_ULTIMA_EMPRESA,
  SESION_RECORDADA_DIAS, SESION_RESPONSABLE_DIAS,
} from './sesion-responsable-reglas'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'

describe('duración de la sesión del responsable', () => {
  it('sin casilla 30 días (como siempre); con casilla 90, en cookie y en JWT desde el mismo valor', () => {
    expect(diasSesion(false)).toBe(SESION_RESPONSABLE_DIAS)
    expect(diasSesion(undefined)).toBe(30)
    expect(diasSesion(true)).toBe(SESION_RECORDADA_DIAS)
    expect(opcionesCookieSesion(false).maxAge).toBe(30 * 86400)
    expect(opcionesCookieSesion(true).maxAge).toBe(90 * 86400)
  })
  it('solo `true` estricto alarga (un "true" en texto o un 1 no)', () => {
    expect(diasSesion('true' as never)).toBe(30)
    expect(diasSesion(1 as never)).toBe(30)
  })
})

describe('última empresa recordada', () => {
  const dos = [{ id: A }, { id: B }]
  it('una sola empresa → esa; varias + recordada autorizada → la recordada', () => {
    expect(empresaDeEntrada([{ id: A }], null)).toBe(A)
    expect(empresaDeEntrada(dos, B)).toBe(B)
    expect(empresaDeEntrada(dos, B.toUpperCase())).toBe(B)
  })
  it('varias sin cookie, cookie de una empresa que ya no es suya o basura → hay que elegir (null)', () => {
    expect(empresaDeEntrada(dos, null)).toBeNull()
    expect(empresaDeEntrada(dos, '')).toBeNull()
    expect(empresaDeEntrada(dos, '33333333-3333-3333-3333-333333333333')).toBeNull()
    expect(empresaDeEntrada(dos, "' OR 1=1 --")).toBeNull()
    expect(empresaDeEntrada([], A)).toBeNull()
  })
  it('lee la cookie de la cabecera', () => {
    const h = `a=1; ${COOKIE_ULTIMA_EMPRESA}=${A}; rrhh_session=xyz`
    expect(leerCookie(h, COOKIE_ULTIMA_EMPRESA)).toBe(A)
    expect(leerCookie(h, 'b')).toBeNull()
    expect(leerCookie(null, 'a')).toBeNull()
    expect(leerCookie('rrhh_ultima_empresa_x=1', COOKIE_ULTIMA_EMPRESA)).toBeNull()
  })
})

describe('enmascarar correos para logs', () => {
  it('nunca el correo entero', () => {
    expect(enmascararEmail('Pilar@Ejemplo.es')).toBe('p***@e***.es')
    expect(enmascararEmail('a@b.co.uk')).toBe('a***@b***.co.uk')
    expect(enmascararEmail('pilar@ejemplo.es')).not.toContain('pilar')
  })
  it('entradas raras no rompen', () => {
    for (const x of [null, undefined, 5, '', 'sin-arroba', '@x.es', 'a@']) expect(enmascararEmail(x)).toBe('(correo no válido)')
  })
})
