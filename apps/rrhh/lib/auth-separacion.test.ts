// Escalada empleado → panel (05/10/2026): la cookie del empleado, el ticket de acceso por email y
// el token «pendiente» se firman con el MISMO JWT_SECRET que la sesión del responsable y no pueden
// valer como ella. `verificarSesion` es lista BLANCA: `typ:'responsable'` + jti (06/10/2026).
// Único sitio de los tests de separación de sesiones (no duplicarlos en acceso-email.test.ts).
import { describe, it, expect } from 'vitest'
import { SignJWT, decodeJwt } from 'jose'
import { firmarSesion, firmarPendiente, verificarSesion } from './auth'
import { firmarSesionEmpleado, verificarSesionEmpleado, firmarTicketAcceso } from './empleado-auth'

const EMPLEADO = '11111111-1111-1111-1111-111111111111'
const EMPRESA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SECRETO_DEV = new TextEncoder().encode('rrhh-dev-secret-change-in-prod')
const firmarA_mano = (claims: Record<string, unknown>, jti?: string) => {
  const j = new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setSubject(EMPLEADO).setExpirationTime('1h')
  return (jti ? j.setJti(jti) : j).sign(SECRETO_DEV)
}

describe('verificarSesion (responsable) solo acepta tokens de firmarSesion', () => {
  it('la sesión de responsable sigue valiendo y lleva typ:responsable', async () => {
    const { token, jti } = await firmarSesion({ usuario_id: EMPLEADO, empresa_id: EMPRESA })
    expect(await verificarSesion(token)).toEqual({ usuario_id: EMPLEADO, empresa_id: EMPRESA, jti })
    expect(decodeJwt(token).typ).toBe('responsable')
  })

  it('la cookie de EMPLEADO (rrhh_empleado) no abre el panel', async () => {
    const tok = await firmarSesionEmpleado({ empleado_id: EMPLEADO, empresa_id: EMPRESA, v: 0 })
    await expect(verificarSesion(tok)).rejects.toThrow()
  })

  it('el token «pendiente» del selector de empresa tampoco', async () => {
    await expect(verificarSesion(await firmarPendiente(EMPLEADO))).rejects.toThrow()
  })

  it('el ticket del acceso por email tampoco', async () => {
    await expect(verificarSesion(await firmarTicketAcceso({ otp_id: 'otp-1', empleados: [EMPLEADO] }))).rejects.toThrow()
  })

  it('con jti pero SIN typ (sesión de responsable anterior al 06/10) ya no vale', async () => {
    await expect(verificarSesion(await firmarA_mano({ empresa_id: EMPRESA }, 'jti-1'))).rejects.toThrow()
  })

  it('typ:responsable SIN jti no vale', async () => {
    await expect(verificarSesion(await firmarA_mano({ typ: 'responsable', empresa_id: EMPRESA }))).rejects.toThrow()
  })

  it('el token de empleado ANTIGUO (7 días, sin typ ni jti) no vale en ninguno de los dos', async () => {
    const viejo = await firmarA_mano({ empresa_id: EMPRESA })
    await expect(verificarSesion(viejo)).rejects.toThrow()
    await expect(verificarSesionEmpleado(viejo)).rejects.toThrow()
  })
})

describe('verificarSesionEmpleado no acepta la sesión del responsable', () => {
  it('el token de responsable NO vale como sesión de empleado', async () => {
    const { token } = await firmarSesion({ usuario_id: EMPLEADO, empresa_id: EMPRESA })
    await expect(verificarSesionEmpleado(token)).rejects.toThrow()
  })
})
