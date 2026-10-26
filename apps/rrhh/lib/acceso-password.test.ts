import { describe, it, expect, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { hashEmailAcceso, hashEmailFalloPassword } from './acceso-email'
import {
  verificarPasswordResponsable, normalizarEmail, correosConPassword, passwordHabilitada, HASH_SEÑUELO,
  MAX_FALLOS_EMAIL, VENTANA_FALLOS_MS, type RepoPassword,
} from './acceso-password'

const hashPilar = bcrypt.hashSync('secreta-123', 4).replace(/^\$2b\$/, '$2a$')   // el `$2a$` que conserva Pilar
// Repo fake: usuarios + tabla de fallos en memoria (como las filas de `rrhh.acceso_otps` con su prefijo).
const repo = (usuarios: Record<string, string | null>): RepoPassword & { consultas: string[]; fallos: { email: string; ip: string; at: Date }[] } => {
  const consultas: string[] = []
  const fallos: { email: string; ip: string; at: Date }[] = []
  return {
    consultas, fallos,
    async usuarioConHash(e) { consultas.push(e); return e in usuarios ? { usuario_id: `u-${e}`, pass_hash: usuarios[e] } : null },
    async contarFallosPorEmail(e, desde) { return fallos.filter(f => f.email === e && f.at >= desde).length },
    async contarFallosPorIp(ip, desde) { return fallos.filter(f => f.ip === ip && f.at >= desde).length },
    async registrarFallo(f) { fallos.push({ ...f, at: new Date() }) },
  }
}
const LISTA = correosConPassword('pilar@ejemplo.es')
const UNIFORME = { ok: false, error: 'credenciales_invalidas', status: 401 }
const ip = '1.2.3.4'

describe('lista blanca RRHH_LOGIN_PASSWORD_EMAILS', () => {
  it('se normaliza (lower/trim) y la ausencia o vacío = nadie', () => {
    expect([...correosConPassword(' Pilar@Ejemplo.es , ,otra@b.es ')]).toEqual(['pilar@ejemplo.es', 'otra@b.es'])
    expect(correosConPassword(undefined).size).toBe(0)
    expect(correosConPassword('  , ').size).toBe(0)
    expect(passwordHabilitada(undefined)).toBe(false)
    expect(passwordHabilitada('')).toBe(false)
    expect(passwordHabilitada('a@b.es')).toBe(true)
  })
  it('un pass_hash HEREDADO de un correo fuera de la lista NO entra, ni con la contraseña correcta', async () => {
    const rp = repo({ 'pilar@ejemplo.es': hashPilar, 'heredado@ejemplo.es': hashPilar })
    expect(await verificarPasswordResponsable(rp, { email: 'heredado@ejemplo.es', password: 'secreta-123', ip }, { permitidos: LISTA })).toEqual(UNIFORME)
    // y aunque el comparador dijera que sí
    expect(await verificarPasswordResponsable(rp, { email: 'heredado@ejemplo.es', password: 'x', ip }, { permitidos: LISTA, comparar: async () => true })).toEqual(UNIFORME)
  })
  it('fuera de la lista también pasa por UN bcrypt (contra el señuelo): el tiempo no lo delata', async () => {
    const comparar = vi.fn(async (_a: string, _b: string) => false)
    await verificarPasswordResponsable(repo({ 'heredado@ejemplo.es': hashPilar }), { email: 'heredado@ejemplo.es', password: 'secreta-123', ip }, { permitidos: LISTA, comparar })
    expect(comparar).toHaveBeenCalledTimes(1)
    expect(comparar.mock.calls[0][1]).toBe(HASH_SEÑUELO)
  })
  it('con la lista VACÍA nadie entra (ni Pilar con su contraseña correcta), y por defecto se lee la env', async () => {
    const rp = repo({ 'pilar@ejemplo.es': hashPilar })
    expect(await verificarPasswordResponsable(rp, { email: 'pilar@ejemplo.es', password: 'secreta-123', ip }, { permitidos: new Set() })).toEqual(UNIFORME)
    const antes = process.env.RRHH_LOGIN_PASSWORD_EMAILS
    delete process.env.RRHH_LOGIN_PASSWORD_EMAILS
    try {
      expect(await verificarPasswordResponsable(rp, { email: 'pilar@ejemplo.es', password: 'secreta-123', ip })).toEqual(UNIFORME)
      process.env.RRHH_LOGIN_PASSWORD_EMAILS = 'PILAR@ejemplo.es'
      expect((await verificarPasswordResponsable(rp, { email: 'pilar@ejemplo.es', password: 'secreta-123', ip })).ok).toBe(true)
    } finally { if (antes === undefined) delete process.env.RRHH_LOGIN_PASSWORD_EMAILS; else process.env.RRHH_LOGIN_PASSWORD_EMAILS = antes }
  })
})

describe('contraseña opcional del responsable', () => {
  it('el hash $2a$ de Pilar, en la lista, con su contraseña → entra con SU usuario_id', async () => {
    const r = await verificarPasswordResponsable(repo({ 'pilar@ejemplo.es': hashPilar }), { email: ' Pilar@Ejemplo.es ', password: 'secreta-123', ip }, { permitidos: LISTA })
    expect(r).toEqual({ ok: true, usuario_id: 'u-pilar@ejemplo.es' })
  })
  it('contraseña errónea, usuario inexistente, hash aleatorio y hash que no es bcrypt dan EXACTAMENTE lo mismo', async () => {
    const aleatorio = bcrypt.hashSync(crypto.randomUUID(), 4)
    const rp = repo({ 'pilar@ejemplo.es': hashPilar, 'nueva@ejemplo.es': aleatorio, 'rara@ejemplo.es': 'no-es-un-hash', 'vacia@ejemplo.es': null })
    const permitidos = correosConPassword('pilar@ejemplo.es,nueva@ejemplo.es,rara@ejemplo.es,vacia@ejemplo.es,nadie@ejemplo.es')
    const casos = [
      { email: 'pilar@ejemplo.es', password: 'otra' }, { email: 'nadie@ejemplo.es', password: 'secreta-123' },
      { email: 'nueva@ejemplo.es', password: 'secreta-123' }, { email: 'rara@ejemplo.es', password: 'no-es-un-hash' }, { email: 'vacia@ejemplo.es', password: 'x' },
    ]
    for (const c of casos) expect(await verificarPasswordResponsable(rp, { ...c, ip }, { permitidos })).toEqual(UNIFORME)
  })
  it('SIEMPRE hay una comparación bcrypt (mismo coste con y sin usuario / hash válido)', async () => {
    const comparar = vi.fn(async (_a: string, _b: string) => false)
    const permitidos = correosConPassword('nadie@ejemplo.es,a@b.es')
    await verificarPasswordResponsable(repo({}), { email: 'nadie@ejemplo.es', password: 'x', ip }, { permitidos, comparar })
    await verificarPasswordResponsable(repo({ 'a@b.es': 'basura' }), { email: 'a@b.es', password: 'x', ip }, { permitidos, comparar })
    await verificarPasswordResponsable(repo({ 'a@b.es': hashPilar }), { email: 'a@b.es', password: 'x', ip }, { permitidos, comparar })
    expect(comparar).toHaveBeenCalledTimes(3)
    expect(comparar.mock.calls.map(c => c[1])).toEqual([HASH_SEÑUELO, HASH_SEÑUELO, hashPilar])
  })
  it('entradas inválidas → 400 sin tocar la BD', async () => {
    const rp = repo({})
    for (const c of [{ email: 'no', password: 'x' }, { email: 'a@b.es', password: '' }, { email: 'a@b.es', password: 7 }, { email: null, password: 'x' }, { email: 'a@b.es', password: 'x'.repeat(201) }]) {
      expect(await verificarPasswordResponsable(rp, { ...c, ip }, { permitidos: LISTA })).toEqual({ ok: false, error: 'datos_invalidos', status: 400 })
    }
    expect(rp.consultas).toEqual([])
    expect(normalizarEmail(' A@B.ES ')).toBe('a@b.es')
  })
})

describe('tope de intentos PERSISTENTE (contado en el repo = BD)', () => {
  it('5 fallos por correo → bloqueada con la respuesta uniforme, aunque luego acierte; se anotan en el repo', async () => {
    const rp = repo({ 'pilar@ejemplo.es': hashPilar })
    for (let i = 0; i < MAX_FALLOS_EMAIL; i++) {
      expect(await verificarPasswordResponsable(rp, { email: 'pilar@ejemplo.es', password: 'mala', ip: `9.9.9.${i}` }, { permitidos: LISTA })).toEqual(UNIFORME)
    }
    expect(rp.fallos.filter(f => f.email === 'pilar@ejemplo.es')).toHaveLength(MAX_FALLOS_EMAIL)
    const comparar = vi.fn(async (_a: string, _b: string) => true)
    expect(await verificarPasswordResponsable(rp, { email: 'pilar@ejemplo.es', password: 'secreta-123', ip: '8.8.8.8' }, { permitidos: LISTA, comparar })).toEqual(UNIFORME)
    expect(comparar).toHaveBeenCalledTimes(1)                 // bloqueada también cuesta un bcrypt
    expect(comparar.mock.calls[0][1]).toBe(HASH_SEÑUELO)
    // pasada la ventana, vuelve a entrar
    const despues = new Date(Date.now() + VENTANA_FALLOS_MS + 1000)
    expect((await verificarPasswordResponsable(rp, { email: 'pilar@ejemplo.es', password: 'secreta-123', ip: '8.8.8.8' }, { permitidos: LISTA, ahora: despues })).ok).toBe(true)
  })
  it('tope por IP: 30 fallos desde una IP bloquean cualquier correo desde ella', async () => {
    const rp = repo({ 'pilar@ejemplo.es': hashPilar })
    for (let i = 0; i < 30; i++) await verificarPasswordResponsable(rp, { email: `x${i}@ejemplo.es`, password: 'mala', ip: '6.6.6.6' }, { permitidos: LISTA, comparar: async () => false })
    expect(await verificarPasswordResponsable(rp, { email: 'pilar@ejemplo.es', password: 'secreta-123', ip: '6.6.6.6' }, { permitidos: LISTA })).toEqual(UNIFORME)
    expect((await verificarPasswordResponsable(rp, { email: 'pilar@ejemplo.es', password: 'secreta-123', ip: '5.5.5.5' }, { permitidos: LISTA })).ok).toBe(true)
  })
})

describe('los fallos de contraseña no se mezclan con los códigos en rrhh.acceso_otps', () => {
  it('el email_hash de un fallo nunca casa con el de un código (empleado ni responsable)', () => {
    const e = 'pilar@ejemplo.es'
    expect(hashEmailFalloPassword(e)).not.toBe(hashEmailAcceso(e, 'empleado'))
    expect(hashEmailFalloPassword(e)).not.toBe(hashEmailAcceso(e, 'responsable'))
  })
})
