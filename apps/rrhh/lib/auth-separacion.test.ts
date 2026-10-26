// Escalada empleado → panel (05/10/2026): la cookie del empleado, el ticket de acceso por email y
// el token «pendiente» se firman con el MISMO JWT_SECRET que la sesión del responsable y no pueden
// valer como ella. `verificarSesion` es lista BLANCA: `typ:'responsable'` + jti (06/10/2026).
// Único sitio de los tests de separación de sesiones (no duplicarlos en acceso-email.test.ts).
import { describe, it, expect, vi } from 'vitest'
import { SignJWT, decodeJwt } from 'jose'
import { firmarSesion, firmarPendiente, verificarPendiente, verificarSesion } from './auth'
import { solicitarCodigoAcceso, verificarCodigoAcceso, type RepoAcceso, type EnviarCodigo } from './acceso-email'
import { solicitarCodigoResponsable, verificarCodigoResponsable, type RepoResponsable, type EnviarCodigoResponsable } from './acceso-responsable'
import { fakeOtp } from './otp-fake'
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

// ── Códigos de un solo uso: el de /e/entrar no abre /login ni al revés (26/10/2026) ──────────────
// Misma tabla `rrhh.acceso_otps` y mismo correo (Pilar puede ser empleada Y responsable): lo que los
// separa es el PROPÓSITO en el prefijo de los HMAC (email y código) de `acceso-email.ts`.
describe('OTP: separación empleado ↔ responsable', () => {
  const EMAIL = 'pilar@ejemplo.es'
  function repos() {
    const f = fakeOtp(new Date('2026-10-26T08:00:00Z'))
    const empleado: RepoAcceso = {
      ...f.repo, async reservarIntentoPin() { return true },
      async candidatosPorEmail(e) { return e === EMAIL ? [{ empleado_id: EMPLEADO, empresa_id: EMPRESA, empresa_nombre: 'X', nombre: 'Pilar', pin_hash: null, sesion_version: 0 }] : [] },
    }
    const responsable: RepoResponsable = {
      ...f.repo, async responsablePorEmail(e) { return e === EMAIL ? { usuario_id: 'u-pilar', nombre: 'Pilar', empresas: [{ id: EMPRESA, nombre: 'X' }] } : null },
    }
    return { empleado, responsable, ahora: f.ahora }
  }
  async function codigoEmpleado(r: ReturnType<typeof repos>) {
    const enviar = vi.fn<EnviarCodigo>(async () => true)
    const s = await solicitarCodigoAcceso(r.empleado, enviar, { email: EMAIL, ip: '1.1.1.1' }, r.ahora())
    if (s.ok && s.envio) await s.envio()
    return enviar.mock.calls[0][0].codigo
  }
  async function codigoResponsable(r: ReturnType<typeof repos>) {
    const enviar = vi.fn<EnviarCodigoResponsable>(async () => true)
    const s = await solicitarCodigoResponsable(r.responsable, enviar, { email: EMAIL, ip: '1.1.1.1', marcaAsegura: false, url: 'http://x/login' }, r.ahora())
    if (s.ok && s.envio) await s.envio()
    return enviar.mock.calls[0][0].codigo
  }

  it('el código pedido como EMPLEADO no abre sesión de responsable', async () => {
    const r = repos()
    const codigo = await codigoEmpleado(r)
    expect(await verificarCodigoResponsable(r.responsable, { email: EMAIL, codigo }, r.ahora())).toMatchObject({ ok: false })
    // …y sigue intacto para su uso legítimo (no se le ha gastado ni restado intento).
    expect(await verificarCodigoAcceso(r.empleado, { email: EMAIL, codigo }, r.ahora())).toMatchObject({ ok: true, paso: 'sesion' })
  })

  it('el código pedido como RESPONSABLE no abre el portal del empleado', async () => {
    const r = repos()
    const codigo = await codigoResponsable(r)
    expect(await verificarCodigoAcceso(r.empleado, { email: EMAIL, codigo }, r.ahora())).toMatchObject({ ok: false })
    expect(await verificarCodigoResponsable(r.responsable, { email: EMAIL, codigo }, r.ahora())).toMatchObject({ ok: true, paso: 'sesion' })
  })

  it('con los dos pedidos a la vez, cada uno solo vale en su puerta', async () => {
    const r = repos()
    const ce = await codigoEmpleado(r)
    const cr = await codigoResponsable(r)
    if (ce !== cr) {
      expect(await verificarCodigoResponsable(r.responsable, { email: EMAIL, codigo: ce }, r.ahora())).toMatchObject({ ok: false, error: 'incorrecto' })
      expect(await verificarCodigoAcceso(r.empleado, { email: EMAIL, codigo: cr }, r.ahora())).toMatchObject({ ok: false, error: 'incorrecto' })
    }
    expect(await verificarCodigoResponsable(r.responsable, { email: EMAIL, codigo: cr }, r.ahora())).toMatchObject({ ok: true })
    expect(await verificarCodigoAcceso(r.empleado, { email: EMAIL, codigo: ce }, r.ahora())).toMatchObject({ ok: true })
  })
})

describe('token «pendiente» del selector de empresa (tras el código de /login)', () => {
  it('el propio vale y lleva typ:responsable_pendiente', async () => {
    const t = await firmarPendiente('u-pilar')
    expect(await verificarPendiente(t)).toBe('u-pilar')
    expect(decodeJwt(t).typ).toBe('responsable_pendiente')
  })
  it('ni la sesión de empleado, ni el ticket de /e/entrar, ni un {pendiente:true} sin typ valen como pendiente', async () => {
    await expect(verificarPendiente(await firmarSesionEmpleado({ empleado_id: EMPLEADO, empresa_id: EMPRESA, v: 0 }))).rejects.toThrow()
    await expect(verificarPendiente(await firmarTicketAcceso({ otp_id: 'otp-1', empleados: [EMPLEADO] }))).rejects.toThrow()
    await expect(verificarPendiente(await firmarA_mano({ pendiente: true }))).rejects.toThrow()
  })
})
