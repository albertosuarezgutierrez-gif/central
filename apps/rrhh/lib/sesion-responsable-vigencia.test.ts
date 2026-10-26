// Revocación de la sesión del responsable: «Salir» rota el jti en el servidor, un jti NULL no vale y retirar la empresa
// de `usuario_empresas` corta el acceso en la petición siguiente. Repo fake = las dos tablas en memoria.
import { describe, it, expect } from 'vitest'
import { firmarSesion, verificarSesion } from './auth'
import { motivoRechazoSesion, revocarSesionResponsable, type RepoSesionResponsable } from './sesion-responsable-vigencia'

const U = '11111111-1111-4111-8111-111111111111'
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function bd(jti: string | null, empresas: string[]) {
  const t = { jti, ue: new Set(empresas.map(e => `${U}:${e}`)) }
  const repo: RepoSesionResponsable = {
    async estadoSesion(u, e) { return u === U ? { session_jti: t.jti, empresa_autorizada: t.ue.has(`${u}:${e}`) } : null },
    async rotarJti(u, actual, nuevo) { if (u === U && t.jti === actual) t.jti = nuevo },
  }
  return { t, repo }
}
const vigente = async (repo: RepoSesionResponsable, token: string) => {
  const s = await verificarSesion(token)
  return motivoRechazoSesion(s, await repo.estadoSesion(s.usuario_id, s.empresa_id))
}

describe('vigencia de la sesión del responsable', () => {
  it('tras «Salir», el token antiguo es rechazado (jti rotado a otro valor, NO a NULL)', async () => {
    const { token, jti } = await firmarSesion({ usuario_id: U, empresa_id: A, recordar: true })
    const { t, repo } = bd(jti, [A])
    expect(await vigente(repo, token)).toBeNull()
    await revocarSesionResponsable(repo, await verificarSesion(token))
    expect(t.jti).not.toBe(jti)
    expect(t.jti).toBeTruthy()
    expect(await vigente(repo, token)).toBe('sesion_cerrada')
  })
  it('«Salir» con un token viejo no tumba la sesión más nueva de otro dispositivo', async () => {
    const viejo = await firmarSesion({ usuario_id: U, empresa_id: A })
    const nuevo = await firmarSesion({ usuario_id: U, empresa_id: A })
    const { t, repo } = bd(nuevo.jti, [A])
    await revocarSesionResponsable(repo, await verificarSesion(viejo.token))
    expect(t.jti).toBe(nuevo.jti)
    expect(await vigente(repo, nuevo.token)).toBeNull()
  })
  it('session_jti NULL (tokens antiguos) → se rechaza y hay que volver a entrar', async () => {
    const { token } = await firmarSesion({ usuario_id: U, empresa_id: A })
    expect(await vigente(bd(null, [A]).repo, token)).toBe('jti_nulo')
  })
  it('una empresa retirada de usuario_empresas deja de dar acceso; las demás siguen', async () => {
    const { token, jti } = await firmarSesion({ usuario_id: U, empresa_id: A })
    const { t, repo } = bd(jti, [A, B])
    expect(await vigente(repo, token)).toBeNull()
    t.ue.delete(`${U}:${A}`)
    expect(await vigente(repo, token)).toBe('empresa_retirada')
  })
  it('usuario borrado → rechazado', () => {
    expect(motivoRechazoSesion({ jti: 'x' }, null)).toBe('usuario_inexistente')
  })
})
