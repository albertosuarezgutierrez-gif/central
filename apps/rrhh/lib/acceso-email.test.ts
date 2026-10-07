// Acceso del empleado por email + código (05/10/2026). Repo EN MEMORIA con la misma semántica
// atómica que el SQL (`acceso-email-repo.ts`); el correo se MOCKEA: ningún test envía nada.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import {
  solicitarCodigoAcceso, verificarCodigoAcceso, completarAcceso, correoCodigo,
  hashCodigoAcceso, hashEmailAcceso, MAX_INTENTOS, MAX_POR_EMAIL_HORA, MAX_POR_IP_HORA, MAX_INTENTOS_PIN,
  type RepoAcceso, type Candidato, type OtpFila, type EnviarCodigo,
} from './acceso-email'
import {
  firmarSesionEmpleado, verificarSesionEmpleado, sesionVigente, firmarTicketAcceso, verificarTicketAcceso,
} from './empleado-auth'

type Fila = OtpFila & { email_hash: string; ip: string; intentos_pin: number }

function fakeRepo(empleados: (Candidato & { email: string })[] = []) {
  const filas: Fila[] = []
  let n = 0
  let reloj = new Date('2026-10-05T07:00:00Z')
  const repo: RepoAcceso = {
    async contarRecientesPorEmail(h, desde) { return filas.filter(f => f.email_hash === h && f.creada_at >= desde).length },
    async contarRecientesPorIp(ip, desde) { return filas.filter(f => f.ip === ip && f.creada_at >= desde).length },
    async crearOtp(f) { filas.push({ id: `otp-${++n}`, ...f, creada_at: new Date(reloj), intentos: 0, intentos_pin: 0, usado_at: null }) },
    async ultimoOtp(h) {
      const f = filas.filter(x => x.email_hash === h).sort((a, b) => +b.creada_at - +a.creada_at || b.id.localeCompare(a.id))[0]
      return f ? { ...f } : null
    },
    async reservarIntento(id, max) {
      const f = filas.find(x => x.id === id && x.usado_at === null && x.intentos < max)
      if (!f) return false
      f.intentos++; return true
    },
    async gastarOtp(id) {
      const f = filas.find(x => x.id === id && x.usado_at === null)
      if (!f) return false
      f.usado_at = new Date(reloj); return true
    },
    async reservarIntentoPin(id, max) {
      const f = filas.find(x => x.id === id && x.usado_at !== null && x.intentos_pin < max)
      if (!f) return false
      f.intentos_pin++; return true
    },
    async candidatosPorEmail(email) {
      return empleados.filter(e => e.email.trim().toLowerCase() === email).map(({ email: _e, ...c }) => c)
    },
  }
  return { repo, filas, ahora: () => new Date(reloj), avanzar: (ms: number) => { reloj = new Date(+reloj + ms) } }
}

const ANA = { email: 'ana@ejemplo.es', empleado_id: '11111111-1111-1111-1111-111111111111', empresa_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', empresa_nombre: 'Mariscos González', nombre: 'Ana', pin_hash: null, sesion_version: 0 }
const ANA_B = { ...ANA, empleado_id: '22222222-2222-2222-2222-222222222222', empresa_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', empresa_nombre: 'Global2 Instalaciones Técnicas' }

/** Pide código y captura el que «llegaría» por correo (envío mockeado). */
async function pedir(repo: RepoAcceso, email: string, ip = '1.1.1.1', ahora?: Date) {
  const enviar = vi.fn<EnviarCodigo>(async () => true)
  const r = await solicitarCodigoAcceso(repo, enviar, { email, ip }, ahora)
  if (r.ok && r.envio) await r.envio()
  return { r, enviar, codigo: enviar.mock.calls[0]?.[0].codigo as string | undefined }
}

beforeEach(() => { vi.restoreAllMocks() })

describe('hash', () => {
  it('a la BD va un HMAC de 64 hex, nunca los 6 dígitos ni un SHA-256 pelado', async () => {
    const { repo, filas, ahora } = fakeRepo([ANA])
    const { codigo } = await pedir(repo, ANA.email, '1.1.1.1', ahora())
    expect(codigo).toMatch(/^\d{6}$/)
    const f = filas[0]
    expect(f.codigo_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(f.codigo_hash).not.toContain(codigo!)
    expect(f.codigo_hash).not.toBe(createHash('sha256').update(codigo!).digest('hex'))
    expect(f.codigo_hash).toBe(hashCodigoAcceso(codigo!))
    expect(f.email_hash).toBe(hashEmailAcceso('ana@ejemplo.es'))
    expect(JSON.stringify(f)).not.toContain('ana@ejemplo.es')
  })

  it('el código correcto entra y uno distinto no (la comparación es sobre el hash)', async () => {
    const { repo, ahora } = fakeRepo([ANA])
    const { codigo } = await pedir(repo, ANA.email, '1.1.1.1', ahora())
    const malo = codigo === '000000' ? '000001' : '000000'
    expect(await verificarCodigoAcceso(repo, { email: ANA.email, codigo: malo }, ahora())).toMatchObject({ ok: false, error: 'incorrecto' })
    expect(await verificarCodigoAcceso(repo, { email: ' ANA@Ejemplo.es ', codigo }, ahora())).toMatchObject({ ok: true, paso: 'sesion' })
  })
})

describe('caducidad', () => {
  it('vale a los 9:59 y caduca pasados 10 minutos', async () => {
    const a = fakeRepo([ANA])
    const c1 = (await pedir(a.repo, ANA.email, '1.1.1.1', a.ahora())).codigo
    a.avanzar(10 * 60_000 + 1)
    expect(await verificarCodigoAcceso(a.repo, { email: ANA.email, codigo: c1 }, a.ahora())).toMatchObject({ ok: false, error: 'caducado' })

    const b = fakeRepo([ANA])
    const c2 = (await pedir(b.repo, ANA.email, '1.1.1.1', b.ahora())).codigo
    b.avanzar(9 * 60_000 + 59_000)
    expect(await verificarCodigoAcceso(b.repo, { email: ANA.email, codigo: c2 }, b.ahora())).toMatchObject({ ok: true })
  })
})

describe('intentos', () => {
  it(`tras ${MAX_INTENTOS} fallos se bloquea aunque luego acierte`, async () => {
    const { repo, ahora } = fakeRepo([ANA])
    const { codigo } = await pedir(repo, ANA.email, '1.1.1.1', ahora())
    const malo = codigo === '000000' ? '000001' : '000000'
    for (let i = 0; i < MAX_INTENTOS; i++) {
      expect(await verificarCodigoAcceso(repo, { email: ANA.email, codigo: malo }, ahora())).toMatchObject({ error: 'incorrecto' })
    }
    expect(await verificarCodigoAcceso(repo, { email: ANA.email, codigo }, ahora())).toMatchObject({ ok: false, error: 'bloqueado' })
  })

  it('un código solo vale una vez', async () => {
    const { repo, ahora } = fakeRepo([ANA])
    const { codigo } = await pedir(repo, ANA.email, '1.1.1.1', ahora())
    expect(await verificarCodigoAcceso(repo, { email: ANA.email, codigo }, ahora())).toMatchObject({ ok: true })
    expect(await verificarCodigoAcceso(repo, { email: ANA.email, codigo }, ahora())).toMatchObject({ ok: false, error: 'ya_usado' })
  })

  it('ráfaga en paralelo: solo 5 intentos se comparan', async () => {
    const { repo, filas, ahora } = fakeRepo([ANA])
    const { codigo } = await pedir(repo, ANA.email, '1.1.1.1', ahora())
    const malo = codigo === '000000' ? '000001' : '000000'
    const rs = await Promise.all(Array.from({ length: 12 }, () => verificarCodigoAcceso(repo, { email: ANA.email, codigo: malo }, ahora())))
    expect(rs.filter(r => !r.ok && r.error === 'incorrecto')).toHaveLength(MAX_INTENTOS)
    expect(filas[0].intentos).toBe(MAX_INTENTOS)
  })
})

describe('rate-limit', () => {
  it(`por email: el ${MAX_POR_EMAIL_HORA + 1}.º en una hora es 429; pasada la hora, vuelve`, async () => {
    const { repo, ahora, avanzar } = fakeRepo([ANA])
    for (let i = 0; i < MAX_POR_EMAIL_HORA; i++) expect((await pedir(repo, ANA.email, `9.9.9.${i}`, ahora())).r.ok).toBe(true)
    const r = await pedir(repo, ANA.email, '8.8.8.8', ahora())
    expect(r.r).toMatchObject({ ok: false, status: 429 })
    expect(r.enviar).not.toHaveBeenCalled()
    avanzar(60 * 60_000 + 1)
    expect((await pedir(repo, ANA.email, '8.8.8.8', ahora())).r.ok).toBe(true)
  })

  it(`por IP: más de ${MAX_POR_IP_HORA} peticiones/h desde una IP es 429, con emails distintos`, async () => {
    const { repo, ahora } = fakeRepo([])
    for (let i = 0; i < MAX_POR_IP_HORA; i++) expect((await pedir(repo, `x${i}@ejemplo.es`, '5.5.5.5', ahora())).r.ok).toBe(true)
    expect((await pedir(repo, 'otro@ejemplo.es', '5.5.5.5', ahora())).r).toMatchObject({ ok: false, status: 429 })
    expect((await pedir(repo, 'otro@ejemplo.es', '6.6.6.6', ahora())).r.ok).toBe(true)
  })
})

describe('no enumeración', () => {
  it('email de empleado y email desconocido: mismo resultado, ambos escriben fila; solo uno envía', async () => {
    const { repo, filas, ahora } = fakeRepo([ANA])
    const si = await pedir(repo, ANA.email, '1.1.1.1', ahora())
    const no = await pedir(repo, 'nadie@ejemplo.es', '1.1.1.1', ahora())
    expect(si.r.ok && no.r.ok).toBe(true)
    expect(si.enviar).toHaveBeenCalledTimes(1)
    expect(no.enviar).not.toHaveBeenCalled()
    expect(filas).toHaveLength(2)
    // Y el canje del desconocido falla igual que un código mal tecleado (no «no existe»).
    expect(await verificarCodigoAcceso(repo, { email: 'nadie@ejemplo.es', codigo: '123456' }, ahora())).toMatchObject({ ok: false, error: 'incorrecto' })
  })

  it('el tope por email cuenta también los desconocidos (no es un oráculo)', async () => {
    const { repo, ahora } = fakeRepo([])
    for (let i = 0; i < MAX_POR_EMAIL_HORA; i++) await pedir(repo, 'nadie@ejemplo.es', `2.2.2.${i}`, ahora())
    expect((await pedir(repo, 'nadie@ejemplo.es', '3.3.3.3', ahora())).r).toMatchObject({ status: 429 })
  })

  it('email mal formado → 400 sin escribir fila', async () => {
    const { repo, filas } = fakeRepo([ANA])
    expect((await pedir(repo, 'no-es-un-email')).r).toMatchObject({ ok: false, status: 400 })
    expect(filas).toHaveLength(0)
  })
})

describe('multi-empresa y PIN', () => {
  const pinOk = async (pin: string, hash: string) => hash === `h:${pin}`

  it('un email en dos empresas → elegir; solo se puede elegir entre las del ticket', async () => {
    const { repo, ahora } = fakeRepo([ANA, ANA_B, { ...ANA, email: 'pepe@ejemplo.es', empleado_id: '33333333-3333-3333-3333-333333333333', nombre: 'Pepe' }])
    const { codigo, enviar } = await pedir(repo, ANA.email, '1.1.1.1', ahora())
    expect(enviar.mock.calls[0][0].empresas).toEqual(['Mariscos González', 'Global2 Instalaciones Técnicas'])
    const r = await verificarCodigoAcceso(repo, { email: ANA.email, codigo }, ahora())
    expect(r).toMatchObject({ ok: true, paso: 'elegir' })
    if (!r.ok || r.paso !== 'elegir') throw new Error()
    expect(r.opciones.map(o => o.empleado_id)).toEqual([ANA.empleado_id, ANA_B.empleado_id])
    const ticket = { otp_id: r.otp_id, empleados: r.opciones.map(o => o.empleado_id) }
    expect(await completarAcceso(repo, pinOk, ticket, { email: ANA.email, empleado_id: ANA_B.empleado_id, pin: '' }))
      .toMatchObject({ ok: true, candidato: { empresa_id: ANA_B.empresa_id } })
    // Pepe es de la misma empresa pero NO está en el ticket: no se entra como él.
    expect(await completarAcceso(repo, pinOk, ticket, { email: ANA.email, empleado_id: '33333333-3333-3333-3333-333333333333', pin: '' }))
      .toMatchObject({ ok: false, error: 'sin_acceso' })
  })

  it('con PIN: tras el código se pide el PIN, y 5 PIN fallidos bloquean', async () => {
    const { repo, ahora } = fakeRepo([{ ...ANA, pin_hash: 'h:4321' }])
    const { codigo } = await pedir(repo, ANA.email, '1.1.1.1', ahora())
    const r = await verificarCodigoAcceso(repo, { email: ANA.email, codigo }, ahora())
    if (!r.ok || r.paso !== 'elegir') throw new Error('debía pedir PIN')
    expect(r.opciones[0].necesita_pin).toBe(true)
    const ticket = { otp_id: r.otp_id, empleados: [ANA.empleado_id] }
    expect(await completarAcceso(repo, pinOk, ticket, { email: ANA.email, empleado_id: ANA.empleado_id, pin: '' })).toMatchObject({ error: 'pin_incorrecto', necesita_pin: true })
    for (let i = 0; i < MAX_INTENTOS_PIN; i++) {
      expect(await completarAcceso(repo, pinOk, ticket, { email: ANA.email, empleado_id: ANA.empleado_id, pin: '0000' })).toMatchObject({ error: 'pin_incorrecto' })
    }
    expect(await completarAcceso(repo, pinOk, ticket, { email: ANA.email, empleado_id: ANA.empleado_id, pin: '4321' })).toMatchObject({ ok: false, error: 'bloqueado' })
  })

  it('el ticket firmado viaja con sus empleados y no se confunde con una sesión', async () => {
    const t = await firmarTicketAcceso({ otp_id: 'otp-1', empleados: [ANA.empleado_id] })
    expect(await verificarTicketAcceso(t)).toEqual({ otp_id: 'otp-1', empleados: [ANA.empleado_id] })
    await expect(verificarSesionEmpleado(t)).rejects.toThrow()
  })
})

describe('revocación de la sesión del empleado', () => {
  it('la sesión lleva la versión; al subirla («Cerrar sesiones») deja de valer', async () => {
    const tok = await firmarSesionEmpleado({ empleado_id: ANA.empleado_id, empresa_id: ANA.empresa_id, v: 3 })
    const s = await verificarSesionEmpleado(tok)
    expect(s).toEqual({ empleado_id: ANA.empleado_id, empresa_id: ANA.empresa_id, v: 3 })
    expect(sesionVigente(s, { sesion_version: 3, estado: 'activo' })).toBe(true)
    expect(sesionVigente(s, { sesion_version: 4, estado: 'activo' })).toBe(false)
    expect(sesionVigente(s, { sesion_version: 3, estado: 'baja' })).toBe(false)
    expect(sesionVigente(s, null)).toBe(false)
  })
  // La separación responsable/empleado/ticket vive en auth-separacion.test.ts.
})

describe('correo', () => {
  it('asunto y cuerpo en español con el nombre de la empresa, sin el código en el asunto', () => {
    const c = correoCodigo({ to: 'ana@ejemplo.es', nombre: 'Ana', empresas: ['Mariscos González'], codigo: '123456' })
    expect(c.subject).toBe('Tu código de acceso al Portal del Empleado de Mariscos González')
    expect(c.text).toContain('123456')
    expect(c.text).toContain('Caduca en 10 minutos')
  })
})
