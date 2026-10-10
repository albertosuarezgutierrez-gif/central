// Cepos de la EMISIÓN autorizada (10/10/2026). Cada uno se ha visto FALLAR rompiendo lo que protege.
// Sin datos personales: ids y NIF inventados con forma válida.
import { describe, it, expect } from 'vitest'
import {
  EmisionBloqueadaError,
  MaquinaFases,
  botonEmisionDe,
  comprobarBoton,
  crearPermisoEmision,
  decidirAccionBandeja,
  decidirAutorizacion,
  decidirCanje,
  emisionActiva,
  eurosACentimos,
  firmarAutorizacionEmision,
  generarTokenEmision,
  hashCortoEmision,
  verificarFirmaAutorizacionEmision,
  hashDatosEmision,
  hashTokenEmision,
  pareceEmision,
  precondicionesEmision,
  primaCoincide,
  puedeTransitar,
  sinTokens,
  usarPermisoEmision,
  type DatosEmision,
  type PresupuestoParaEmitir,
} from './index.ts'

const T1 = '11111111-1111-4111-8111-111111111111'
const T2 = '22222222-2222-4222-8222-222222222222'
const P1 = '33333333-3333-4333-8333-333333333333'
const O1 = '44444444-4444-4444-8444-444444444444'
const BOTON = botonEmisionDe('Allianz', 'comunidades')!
const H1 = 'a'.repeat(64)
const H2 = 'b'.repeat(64)
// Descripciones en el orden de `pulsar()`: texto, aria-label, title, value, id, name, href, onclick, formaction.
const DESC_BOTON = ['Aceptar', null, null, null, 'aceptar', null, null, 'btnAceptar();', null]

describe('emisión · interruptor y lista blanca', () => {
  it('solo TARIFICADOR_EMISION_ACTIVA=1 enciende', () => {
    expect(emisionActiva({ TARIFICADOR_EMISION_ACTIVA: '1' })).toBe(true)
    for (const v of [undefined, '', '0', 'true', 'si', ' 1']) expect(emisionActiva({ TARIFICADOR_EMISION_ACTIVA: v })).toBe(false)
  })
  it('solo Allianz Comunidades emite', () => {
    expect(BOTON).toEqual({ id: 'aceptar', texto: 'Aceptar' })
    expect(botonEmisionDe('allianz', 'rc_pyme')).toBeNull()
    expect(botonEmisionDe('occident', 'comunidades')).toBeNull()
    expect(botonEmisionDe('generali', 'comunidades')).toBeNull()
  })
})

describe('emisión · el guard sigue cerrado por defecto', () => {
  it('sin permiso, el «Aceptar» de Tarificar sigue bloqueado por el guard de siempre', () => {
    expect(() => comprobarBoton(DESC_BOTON)).toThrow(EmisionBloqueadaError)
    expect(pareceEmision('Aceptar')).toBe(true)
  })
})

describe('emisión · permiso de UN botón UNA vez', () => {
  const permiso = () => crearPermisoEmision({ trabajoId: T1, hashDatos: H1, boton: BOTON })

  it('sin permiso → bloqueado', () => {
    expect(() => usarPermisoEmision(null, { trabajoId: T1, hashDatos: H1 }, DESC_BOTON)).toThrow(EmisionBloqueadaError)
    // Un literal con la misma forma NO es un permiso.
    const falso = { trabajoId: T1, hashDatos: H1, boton: BOTON, __permiso: true as const }
    expect(() => usarPermisoEmision(falso, { trabajoId: T1, hashDatos: H1 }, DESC_BOTON)).toThrow(/sin permiso/)
  })
  it('con permiso correcto abre ese botón; usado dos veces → bloqueado', () => {
    const p = permiso()
    expect(() => usarPermisoEmision(p, { trabajoId: T1, hashDatos: H1 }, DESC_BOTON)).not.toThrow()
    expect(() => usarPermisoEmision(p, { trabajoId: T1, hashDatos: H1 }, DESC_BOTON)).toThrow(/ya usado/)
  })
  it('permiso de otro trabajo o con otro hash (precio) → bloqueado', () => {
    expect(() => usarPermisoEmision(permiso(), { trabajoId: T2, hashDatos: H1 }, DESC_BOTON)).toThrow(/otro trabajo/)
    expect(() => usarPermisoEmision(permiso(), { trabajoId: T1, hashDatos: H2 }, DESC_BOTON)).toThrow(/otro trabajo/)
  })
  it('botón distinto → bloqueado (otro id, otro texto, o algo prohibido aunque el id case)', () => {
    const otros: (string | null)[][] = [
      ['Emitir', null, null, null, 'contract', null, null, 'validar_aceptar()', null],
      ['Aceptar', null, null, null, 'btnAccept', null, null, 'emision_ipid()', null],
      ['Calcular', null, null, null, 'calcular', null, null, null, null],
      ['Aceptar todo', null, null, null, 'aceptar', null, null, null, null],
      ['Sí', null, null, null, 'rgpd_si', null, null, null, null],
      ['Aceptar', null, null, null, 'aceptar', null, null, 'pagoFraccionado();', null],
      ['Aceptar', null, 'Consentimiento RGPD', null, 'aceptar', null, null, null, null],
      ['Aceptar', null, null, null, 'aceptar', null, null, 'enviarSMS()', null],
    ]
    for (const d of otros) expect(() => usarPermisoEmision(permiso(), { trabajoId: T1, hashDatos: H1 }, d), String(d)).toThrow(EmisionBloqueadaError)
  })
  it('un intento fallido con otro botón NO quema el permiso del bueno, pero el bueno sigue siendo una sola vez', () => {
    const p = permiso()
    expect(() => usarPermisoEmision(p, { trabajoId: T1, hashDatos: H1 }, ['Calcular', null, null, null, 'calcular'])).toThrow()
    expect(() => usarPermisoEmision(p, { trabajoId: T1, hashDatos: H1 }, DESC_BOTON)).not.toThrow()
    expect(() => usarPermisoEmision(p, { trabajoId: T1, hashDatos: H1 }, DESC_BOTON)).toThrow()
  })
  it('permiso mal formado, o para un botón fuera de la lista blanca, no se crea', () => {
    expect(() => crearPermisoEmision({ trabajoId: 'x', hashDatos: H1, boton: BOTON })).toThrow()
    expect(() => crearPermisoEmision({ trabajoId: T1, hashDatos: 'corto', boton: BOTON })).toThrow()
    expect(() => crearPermisoEmision({ trabajoId: T1, hashDatos: H1, boton: { id: 'calcular', texto: 'Calcular' } })).toThrow()
    expect(() => crearPermisoEmision({ trabajoId: T1, hashDatos: H1, boton: { id: 'contract', texto: 'Emitir' } })).toThrow()
  })
})

describe('emisión · máquina de fases', () => {
  it('solo desde Tarificar, con la pestaña verificada, una vez', () => {
    const m = new MaquinaFases()
    expect(() => m.autorizarEmision('datos_basicos')).toThrow(EmisionBloqueadaError)
    m.autorizarOpcion('datos_basicos')
    m.autorizarAceptar('datos_basicos')
    m.confirmarTarificar('tarificar')
    expect(() => m.autorizarEmision(null)).toThrow(EmisionBloqueadaError)
    expect(() => m.autorizarEmision('tarificar')).not.toThrow()
    expect(() => m.autorizarEmision('tarificar')).toThrow(/una vez/)
  })
  it('tras «Proyecto» ya no', () => {
    const m = new MaquinaFases()
    m.autorizarOpcion('datos_basicos')
    m.autorizarAceptar('datos_basicos')
    m.confirmarTarificar('tarificar')
    m.autorizarProyecto('tarificar')
    expect(() => m.autorizarEmision('tarificar')).toThrow(EmisionBloqueadaError)
  })
})

describe('emisión · token y canje', () => {
  const ahora = new Date('2026-10-10T10:00:00Z')
  const token = generarTokenEmision()
  const fila = { trabajoId: T1, tokenHash: hashTokenEmision(token), hashDatos: H1, expiraAt: new Date(ahora.getTime() + 60_000), consumidoAt: null }

  it('el token es de 32 bytes y en BD solo va su SHA-256', () => {
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(hashTokenEmision(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashTokenEmision(token)).not.toContain(token)
    expect(generarTokenEmision()).not.toBe(token)
  })
  it('canje correcto', () => expect(decidirCanje(fila, { trabajoId: T1, token, hashDatos: H1, ahora })).toEqual({ ok: true }))
  it('sin token → bloqueado', () => {
    expect(decidirCanje(fila, { trabajoId: T1, token: null, hashDatos: H1, ahora }).ok).toBe(false)
    expect(decidirCanje(null, { trabajoId: T1, token, hashDatos: H1, ahora }).ok).toBe(false)
    expect(decidirCanje({ ...fila, tokenHash: null }, { trabajoId: T1, token, hashDatos: H1, ahora }).ok).toBe(false)
  })
  it('token usado dos veces → bloqueado', () => {
    expect(decidirCanje({ ...fila, consumidoAt: ahora }, { trabajoId: T1, token, hashDatos: H1, ahora })).toEqual({ ok: false, motivo: 'ya_usado' })
  })
  it('token de otro trabajo / otro token / otro precio → bloqueado', () => {
    expect(decidirCanje(fila, { trabajoId: T2, token, hashDatos: H1, ahora })).toEqual({ ok: false, motivo: 'otro_trabajo' })
    expect(decidirCanje(fila, { trabajoId: T1, token: generarTokenEmision(), hashDatos: H1, ahora })).toEqual({ ok: false, motivo: 'token_distinto' })
    expect(decidirCanje(fila, { trabajoId: T1, token, hashDatos: H2, ahora })).toEqual({ ok: false, motivo: 'hash_distinto' })
  })
  it('caducado → bloqueado', () => {
    expect(decidirCanje(fila, { trabajoId: T1, token, hashDatos: H1, ahora: fila.expiraAt })).toEqual({ ok: false, motivo: 'caducado' })
  })
  it('sinTokens quita el token de cualquier texto que vaya a salir', () => {
    const t = sinTokens(`fallo con ${token} en canje`, [token])
    expect(t).not.toContain(token)
    expect(sinTokens(`x ${token} y`)).not.toContain(token)
  })
})

describe('emisión · autorización por Telegram', () => {
  const pedidaAt = new Date('2026-10-10T10:00:00Z')
  const base = { autorizadoPor: '1234567', autorizador: '1234567', estado: 'pendiente_autorizacion_emision', pedidaAt }
  it('Alberto, a tiempo → ok', () => expect(decidirAutorizacion({ ...base, ahora: new Date(pedidaAt.getTime() + 23 * 3_600_000) }).ok).toBe(true))
  it('callback de otro from.id → rechazado', () => {
    expect(decidirAutorizacion({ ...base, autorizadoPor: '7654321', ahora: pedidaAt })).toEqual({ ok: false, motivo: 'no autorizado' })
    expect(decidirAutorizacion({ ...base, autorizadoPor: '', ahora: pedidaAt }).ok).toBe(false)
  })
  it('sin autorizador configurado → nadie', () => {
    expect(decidirAutorizacion({ ...base, autorizador: '', ahora: pedidaAt }).ok).toBe(false)
    expect(decidirAutorizacion({ ...base, autorizador: undefined, autorizadoPor: '', ahora: pedidaAt }).ok).toBe(false)
  })
  it('caducidad 24 h', () => {
    expect(decidirAutorizacion({ ...base, ahora: new Date(pedidaAt.getTime() + 24 * 3_600_000 - 1) }).ok).toBe(true)
    expect(decidirAutorizacion({ ...base, ahora: new Date(pedidaAt.getTime() + 24 * 3_600_000) })).toEqual({ ok: false, motivo: 'solicitud caducada (24 h)' })
    expect(decidirAutorizacion({ ...base, pedidaAt: null, ahora: pedidaAt }).ok).toBe(false)
  })
  it('un trabajo que no espera autorización → no', () => {
    for (const estado of ['pendiente', 'en_curso', 'autorizado_emision', 'emitido', 'cancelado']) expect(decidirAutorizacion({ ...base, estado, ahora: pedidaAt }).ok).toBe(false)
  })
})

describe('emisión · precio (tolerancia 0 €) y hash', () => {
  it('céntimos', () => {
    expect(eurosACentimos('347.55')).toBe(34755)
    expect(eurosACentimos(347.55)).toBe(34755)
    expect(eurosACentimos(0)).toBeNull()
    expect(eurosACentimos(null)).toBeNull()
  })
  it('un céntimo de diferencia ya no coincide; null nunca coincide', () => {
    expect(primaCoincide(34755, 34755)).toBe(true)
    expect(primaCoincide(34756, 34755)).toBe(false)
    expect(primaCoincide(34754, 34755)).toBe(false)
    expect(primaCoincide(null, 34755)).toBe(false)
  })
  const d: DatosEmision = { compania: 'Allianz', ramo: 'comunidades', presupuestoId: P1, opcionId: O1, primaCents: 34755, tomadorDocumento: 'H00000000', riesgo: { m2Construidos: 1000 }, boton: BOTON }
  it('cualquier cambio (prima +0,01, otro NIF, otra opción, otro riesgo, otro botón) cambia el hash', () => {
    const h = hashDatosEmision(d)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashDatosEmision({ ...d, compania: ' allianz ' })).toBe(h)
    expect(hashDatosEmision({ ...d, primaCents: 34756 })).not.toBe(h)
    expect(hashDatosEmision({ ...d, tomadorDocumento: 'H00000001' })).not.toBe(h)
    expect(hashDatosEmision({ ...d, opcionId: T2 })).not.toBe(h)
    expect(hashDatosEmision({ ...d, riesgo: { m2Construidos: 1001 } })).not.toBe(h)
    expect(hashDatosEmision({ ...d, boton: { id: 'aceptar2', texto: 'Aceptar' } })).not.toBe(h)
  })
})

describe('emisión · precondiciones del presupuesto', () => {
  const ahora = new Date('2026-10-10T10:00:00Z')
  const ok: PresupuestoParaEmitir = {
    origen: 'ofertas', aceptadoAt: ahora, firmaId: T2, opcionElegidaId: O1, ipidHuella: 'f'.repeat(64),
    venceEl: new Date(ahora.getTime() + 86_400_000), retiradoAt: null, emitidoAt: null,
  }
  const o = { id: O1, compania: 'Allianz', primaEur: '347.55' }
  it('aceptado, firmado, con IPID, vigente → ok con la prima en céntimos', () => {
    expect(precondicionesEmision(ok, o, 'comunidades', ahora)).toEqual({ ok: true, primaCents: 34755 })
  })
  it.each([
    ['sin aceptar', { aceptadoAt: null }],
    ['sin firma', { firmaId: null }],
    ['otra opción', { opcionElegidaId: T1 }],
    ['sin IPID', { ipidHuella: null }],
    ['IPID vacío', { ipidHuella: '  ' }],
    ['caducado', { venceEl: ahora }],
    ['retirado', { retiradoAt: ahora }],
    ['ya emitido', { emitidoAt: ahora }],
    ['de Codeoscopic', { origen: 'codeoscopic' }],
  ] as const)('%s → no', (_, cambio) => {
    expect(precondicionesEmision({ ...ok, ...cambio }, o, 'comunidades', ahora).ok).toBe(false)
  })
  it('sin IPID se dice «no consta»', () => {
    const r = precondicionesEmision({ ...ok, ipidHuella: null }, o, 'comunidades', ahora)
    expect(r.ok === false && r.motivo).toMatch(/IPID no consta/)
  })
  it('otra compañía u otro ramo → no; prima ilegible → no', () => {
    expect(precondicionesEmision(ok, { ...o, compania: 'Occident' }, 'comunidades', ahora).ok).toBe(false)
    expect(precondicionesEmision(ok, o, 'rc_pyme', ahora).ok).toBe(false)
    expect(precondicionesEmision(ok, { ...o, primaEur: null }, 'comunidades', ahora).ok).toBe(false)
  })
})

describe('emisión · estados y bandeja', () => {
  it('transiciones nuevas', () => {
    expect(puedeTransitar('en_curso', 'pendiente_autorizacion_emision')).toBe(true)
    expect(puedeTransitar('pendiente_autorizacion_emision', 'autorizado_emision')).toBe(true)
    expect(puedeTransitar('pendiente_autorizacion_emision', 'cancelado')).toBe(true)
    expect(puedeTransitar('autorizado_emision', 'en_curso')).toBe(true)
    expect(puedeTransitar('en_curso', 'emitido')).toBe(true)
    expect(puedeTransitar('pendiente_autorizacion_emision', 'en_curso')).toBe(false)
    expect(puedeTransitar('pendiente', 'autorizado_emision')).toBe(false)
    expect(puedeTransitar('emitido', 'cancelado')).toBe(false)
  })
  it('un trabajo de emisión no se reintenta desde la bandeja', () => {
    expect(decidirAccionBandeja('reintentar', 'requiere_humano', 'infra', 'emision').ok).toBe(false)
    expect(decidirAccionBandeja('reintentar', 'requiere_humano', 'infra', 'tarificar').ok).toBe(true)
    expect(decidirAccionBandeja('cancelar', 'requiere_humano', 'infra', 'emision').ok).toBe(true)
  })
})

describe('emisión · firma del botón (factor independiente del Bearer de operador)', () => {
  const S = 'k'.repeat(40)
  const AHORA = 1_760_000_000_000
  const campos = { trabajoId: T1, decision: 'ok' as const, hashCorto: hashCortoEmision(H1), autorizadoPor: '123456789', ts: Math.floor(AHORA / 1000) }
  const firmado = { ...campos, firma: firmarAutorizacionEmision(S, campos) }

  it('firma correcta y reciente → ok', () => {
    expect(verificarFirmaAutorizacionEmision(S, firmado, AHORA)).toEqual({ ok: true, campos })
  })
  it('sin firma, firma de otro secreto o mal formada → no', () => {
    expect(verificarFirmaAutorizacionEmision(S, campos, AHORA)).toMatchObject({ ok: false, motivo: 'sin_firma' })
    expect(verificarFirmaAutorizacionEmision(S, { ...campos, firma: firmarAutorizacionEmision('z'.repeat(40), campos) }, AHORA)).toMatchObject({ ok: false, motivo: 'firma_distinta' })
    expect(verificarFirmaAutorizacionEmision(S, { ...firmado, firma: 'x' }, AHORA)).toMatchObject({ ok: false, motivo: 'sin_firma' })
  })
  it('cualquier campo cambiado tras firmar → firma_distinta (trabajo, decisión, hash, from.id, ts)', () => {
    for (const cambio of [{ trabajoId: T2 }, { decision: 'no' }, { hashCorto: hashCortoEmision(H2) }, { autorizadoPor: '987654321' }, { ts: campos.ts - 1 }]) {
      expect(verificarFirmaAutorizacionEmision(S, { ...firmado, ...cambio }, AHORA), JSON.stringify(cambio)).toMatchObject({ ok: false, motivo: 'firma_distinta' })
    }
  })
  it('timestamp corto: viejo (> 90 s) o futuro (> 30 s) → no', () => {
    expect(verificarFirmaAutorizacionEmision(S, firmado, AHORA + 91_000)).toMatchObject({ ok: false, motivo: 'caducada' })
    expect(verificarFirmaAutorizacionEmision(S, firmado, AHORA + 89_000).ok).toBe(true)
    expect(verificarFirmaAutorizacionEmision(S, firmado, AHORA - 31_000)).toMatchObject({ ok: false, motivo: 'futura' })
  })
  it('sin secreto o secreto corto → nadie (y no se puede firmar)', () => {
    expect(verificarFirmaAutorizacionEmision(undefined, firmado, AHORA)).toMatchObject({ ok: false, motivo: 'sin_secreto' })
    expect(verificarFirmaAutorizacionEmision('', firmado, AHORA)).toMatchObject({ ok: false, motivo: 'sin_secreto' })
    expect(verificarFirmaAutorizacionEmision('corto', firmado, AHORA)).toMatchObject({ ok: false, motivo: 'sin_secreto' })
    expect(() => firmarAutorizacionEmision('corto', campos)).toThrow()
  })
  it('campos mal formados → no se firma ni se verifica', () => {
    expect(verificarFirmaAutorizacionEmision(S, { ...firmado, autorizadoPor: 'alberto' }, AHORA)).toMatchObject({ ok: false, motivo: 'campos' })
    expect(verificarFirmaAutorizacionEmision(S, { ...firmado, hashCorto: H1 }, AHORA)).toMatchObject({ ok: false, motivo: 'campos' })
    expect(() => firmarAutorizacionEmision(S, { ...campos, trabajoId: 'x' })).toThrow()
  })
})
