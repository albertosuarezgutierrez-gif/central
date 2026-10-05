// Escalada empleado → panel (05/10/2026): la cookie del empleado y el token «pendiente» se firman
// con el MISMO JWT_SECRET que la sesión del responsable y no pueden valer como ella.
import { describe, it, expect } from 'vitest'
import { firmarSesion, firmarPendiente, verificarSesion } from './auth'
import { firmarSesionEmpleado } from './empleado-auth'

const EMPLEADO = '11111111-1111-1111-1111-111111111111'
const EMPRESA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('verificarSesion (responsable) solo acepta tokens de firmarSesion', () => {
  it('la sesión de responsable sigue valiendo', async () => {
    const { token, jti } = await firmarSesion({ usuario_id: EMPLEADO, empresa_id: EMPRESA })
    expect(await verificarSesion(token)).toEqual({ usuario_id: EMPLEADO, empresa_id: EMPRESA, jti })
  })

  it('la cookie de EMPLEADO (rrhh_empleado) no abre el panel', async () => {
    const tok = await firmarSesionEmpleado({ empleado_id: EMPLEADO, empresa_id: EMPRESA })
    await expect(verificarSesion(tok)).rejects.toThrow()
  })

  it('el token «pendiente» del selector de empresa tampoco', async () => {
    await expect(verificarSesion(await firmarPendiente(EMPLEADO))).rejects.toThrow()
  })
})
