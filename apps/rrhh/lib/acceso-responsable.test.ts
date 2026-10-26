// Acceso del RESPONSABLE por correo + código (26/10/2026). Repo en memoria; el correo se MOCKEA:
// ningún test envía nada. La separación empleado↔responsable vive en `auth-separacion.test.ts`.
import { describe, it, expect, vi } from 'vitest'
import {
  solicitarCodigoResponsable, verificarCodigoResponsable, correoCodigoResponsable, remitente,
  type RepoResponsable, type Responsable, type EnviarCodigoResponsable,
} from './acceso-responsable'
import { MAX_INTENTOS, MAX_POR_EMAIL_HORA, hashEmailAcceso } from './acceso-email'
import { fakeOtp } from './otp-fake'

const PILAR: Responsable & { email: string } = {
  email: 'pilar@ejemplo.es', usuario_id: 'u-pilar', nombre: 'Pilar',
  empresas: [{ id: 'emp-a', nombre: 'Global2' }, { id: 'emp-b', nombre: 'Mariscos González' }],
}
const LUIS: Responsable & { email: string } = { email: 'luis@ejemplo.es', usuario_id: 'u-luis', nombre: 'Luis', empresas: [{ id: 'emp-c', nombre: 'Uno' }] }

function fakeResponsables(lista: (Responsable & { email: string })[] = [PILAR, LUIS], inicio = new Date()) {
  const f = fakeOtp(inicio)
  const repo: RepoResponsable = {
    ...f.repo,
    async responsablePorEmail(email) {
      const r = lista.find(x => x.email === email)
      return r ? { usuario_id: r.usuario_id, nombre: r.nombre, empresas: r.empresas } : null
    },
  }
  return { ...f, repo }
}

async function pedir(repo: RepoResponsable, email: string, ahora: Date, ip = '1.1.1.1') {
  const enviar = vi.fn<EnviarCodigoResponsable>(async () => true)
  const r = await solicitarCodigoResponsable(repo, enviar, { email, ip, marcaAsegura: true, url: 'https://empleados.grupoasegura.es/login' }, ahora)
  if (r.ok && r.envio) await r.envio()
  return { r, enviar, codigo: enviar.mock.calls[0]?.[0].codigo }
}

describe('flujo OTP del responsable', () => {
  it('código correcto, una empresa → sesión en ESA empresa', async () => {
    const { repo, ahora } = fakeResponsables()
    const { codigo } = await pedir(repo, 'LUIS@ejemplo.es ', ahora())
    expect(codigo).toMatch(/^\d{6}$/)
    expect(await verificarCodigoResponsable(repo, { email: 'luis@ejemplo.es', codigo }, ahora()))
      .toEqual({ ok: true, paso: 'sesion', usuario_id: 'u-luis', empresa_id: 'emp-c' })
  })

  it('varias empresas (usuario_empresas) → selector con sus empresas', async () => {
    const { repo, ahora } = fakeResponsables()
    const { codigo } = await pedir(repo, PILAR.email, ahora())
    expect(await verificarCodigoResponsable(repo, { email: PILAR.email, codigo }, ahora()))
      .toEqual({ ok: true, paso: 'elegir', usuario_id: 'u-pilar', empresas: PILAR.empresas })
  })

  it('código incorrecto → incorrecto; el bueno sigue valiendo después', async () => {
    const { repo, ahora } = fakeResponsables()
    const { codigo } = await pedir(repo, LUIS.email, ahora())
    const malo = codigo === '000000' ? '000001' : '000000'
    expect(await verificarCodigoResponsable(repo, { email: LUIS.email, codigo: malo }, ahora())).toMatchObject({ ok: false, error: 'incorrecto', status: 401 })
    expect(await verificarCodigoResponsable(repo, { email: LUIS.email, codigo }, ahora())).toMatchObject({ ok: true })
  })

  it('caducado pasados 10 minutos', async () => {
    const { repo, ahora, avanzar } = fakeResponsables()
    const { codigo } = await pedir(repo, LUIS.email, ahora())
    avanzar(10 * 60_000 + 1000)
    expect(await verificarCodigoResponsable(repo, { email: LUIS.email, codigo }, ahora())).toMatchObject({ ok: false, error: 'caducado' })
  })

  it(`agotado: tras ${MAX_INTENTOS} fallos se bloquea aunque luego acierte`, async () => {
    const { repo, ahora } = fakeResponsables()
    const { codigo } = await pedir(repo, LUIS.email, ahora())
    const malo = codigo === '000000' ? '000001' : '000000'
    for (let i = 0; i < MAX_INTENTOS; i++) await verificarCodigoResponsable(repo, { email: LUIS.email, codigo: malo }, ahora())
    expect(await verificarCodigoResponsable(repo, { email: LUIS.email, codigo }, ahora())).toMatchObject({ ok: false, error: 'bloqueado' })
  })

  it('un código solo vale una vez', async () => {
    const { repo, ahora } = fakeResponsables()
    const { codigo } = await pedir(repo, LUIS.email, ahora())
    await verificarCodigoResponsable(repo, { email: LUIS.email, codigo }, ahora())
    expect(await verificarCodigoResponsable(repo, { email: LUIS.email, codigo }, ahora())).toMatchObject({ ok: false, error: 'ya_usado' })
  })

  it(`tope por correo: el ${MAX_POR_EMAIL_HORA + 1}.º en una hora es 429`, async () => {
    const { repo, ahora } = fakeResponsables()
    for (let i = 0; i < MAX_POR_EMAIL_HORA; i++) expect((await pedir(repo, LUIS.email, ahora(), `9.9.9.${i}`)).r.ok).toBe(true)
    expect((await pedir(repo, LUIS.email, ahora(), '9.9.9.99')).r).toMatchObject({ ok: false, status: 429 })
  })
})

describe('no enumeración', () => {
  it('correo que NO es responsable: misma respuesta, escribe fila, y NO se envía nada', async () => {
    const { repo, filas, ahora } = fakeResponsables()
    const a = await pedir(repo, LUIS.email, ahora())
    const b = await pedir(repo, 'nadie@ejemplo.es', ahora(), '1.1.1.2')
    expect(a.r.ok && b.r.ok).toBe(true)
    expect(a.enviar).toHaveBeenCalledTimes(1)
    expect(b.enviar).not.toHaveBeenCalled()
    expect(b.r).toEqual({ ok: true, envio: null })
    expect(filas.map(f => f.email_hash)).toContain(hashEmailAcceso('nadie@ejemplo.es', 'responsable'))
  })

  it('correo mal formado → 400 sin escribir fila', async () => {
    const { repo, filas, ahora } = fakeResponsables()
    expect((await pedir(repo, 'no-es-correo', ahora())).r).toMatchObject({ ok: false, status: 400 })
    expect(filas).toHaveLength(0)
  })

  it('código válido pero el responsable desapareció en esos 10 min → sin_acceso', async () => {
    const lista = [{ ...LUIS }]
    const { repo, ahora } = fakeResponsables(lista)
    const { codigo } = await pedir(repo, LUIS.email, ahora())
    lista.length = 0
    expect(await verificarCodigoResponsable(repo, { email: LUIS.email, codigo }, ahora())).toMatchObject({ ok: false, error: 'sin_acceso' })
  })
})

describe('correo del código', () => {
  const base = { to: 'pilar@ejemplo.es', nombre: 'Pilar <b>', codigo: '123456', url: 'https://empleados.grupoasegura.es/login' }
  it('con marca: «Grupo ASegura», el enlace y el código; sin el código en el asunto', () => {
    const c = correoCodigoResponsable({ ...base, marcaAsegura: true })
    expect(c.subject).toContain('Grupo ASegura'); expect(c.subject).not.toContain('123456')
    expect(c.text).toContain('123456'); expect(c.text).toContain(base.url)
    expect(c.html).toContain('#3364ee'); expect(c.html).not.toContain('<b>')
  })
  it('sin marca (host ajeno): neutro, sin Grupo ASegura', () => {
    const c = correoCodigoResponsable({ ...base, marcaAsegura: false })
    expect(c.subject + c.text + c.html).not.toContain('ASegura')
  })
  it('remitente: misma dirección; nombre visible de marca solo con marca', () => {
    expect(remitente('iarrhh <hola@iarest.es>', true)).toBe('Grupo ASegura <hola@iarest.es>')
    expect(remitente('iarrhh <hola@iarest.es>', false)).toBe('iarrhh <hola@iarest.es>')
  })
})
