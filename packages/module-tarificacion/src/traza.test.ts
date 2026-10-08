import { describe, it, expect } from 'vitest'
import { crearTraza, validarTraza, esVersionBot, MAX_PASOS_TRAZA } from './index.ts'

const paso = (extra: Record<string, unknown> = {}) => ({ paso: 'login', inicio: '2026-10-08T10:00:00.000Z', duracionMs: 1200, ok: true, errorCodigo: null, ...extra })

describe('traza · validación', () => {
  it('acepta una traza limpia y la normaliza', () => {
    const v = validarTraza([paso(), paso({ paso: 'formulario', ok: false, errorCodigo: 'portal' })])
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.pasos).toHaveLength(2)
  })
  it('sin traza = vacía y ok', () => {
    expect(validarTraza(undefined)).toEqual({ ok: true, pasos: [] })
    expect(validarTraza(null)).toEqual({ ok: true, pasos: [] })
  })
  it.each(['nombre', 'dni', 'email', 'telefono', 'valor', 'direccion', 'url', 'mensaje'])('rechaza la clave con datos personales «%s»', (k) => {
    const v = validarTraza([paso({ [k]: 'Juan Pérez 12345678Z' })])
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.errores.join(' ')).toContain(k)
      // el VALOR nunca se repite en los errores
      expect(v.errores.join(' ')).not.toContain('12345678Z')
    }
  })
  it('rechaza un paso fuera de la lista cerrada, aunque parezca inocente', () => {
    expect(validarTraza([paso({ paso: 'rellenar_nombre_Juan' })]).ok).toBe(false)
  })
  it('rechaza códigos desconocidos, duraciones absurdas, fechas inválidas y pasos ok con error', () => {
    expect(validarTraza([paso({ ok: false, errorCodigo: 'Falló el DNI 12345678Z' })]).ok).toBe(false)
    expect(validarTraza([paso({ duracionMs: -1 })]).ok).toBe(false)
    expect(validarTraza([paso({ duracionMs: 1.5 })]).ok).toBe(false)
    expect(validarTraza([paso({ inicio: 'mañana' })]).ok).toBe(false)
    expect(validarTraza([paso({ errorCodigo: 'portal' })]).ok).toBe(false)
  })
  it('rechaza más de MAX_PASOS_TRAZA y lo que no es lista', () => {
    expect(validarTraza(Array.from({ length: MAX_PASOS_TRAZA + 1 }, () => paso())).ok).toBe(false)
    expect(validarTraza({ paso: 'login' }).ok).toBe(false)
    expect(validarTraza(['login']).ok).toBe(false)
  })
})

describe('traza · registrador del worker', () => {
  it('mide el paso, devuelve su valor y registra ok', async () => {
    let t = 1000
    const tr = crearTraza(() => 'portal', () => (t += 250))
    expect(await tr.paso('login', async () => 7)).toBe(7)
    const [p] = tr.pasos()
    expect(p).toMatchObject({ paso: 'login', ok: true, errorCodigo: null, duracionMs: 250 })
    expect(validarTraza(tr.pasos()).ok).toBe(true)
  })
  it('un fallo se registra con su código y el error se relanza intacto (no cambia el flujo)', async () => {
    const tr = crearTraza(() => 'datos')
    const boom = new Error('el DNI 12345678Z no vale')
    await expect(tr.paso('formulario', async () => { throw boom })).rejects.toBe(boom)
    const [p] = tr.pasos()
    expect(p).toMatchObject({ paso: 'formulario', ok: false, errorCodigo: 'datos' })
    // el mensaje del error NO entra en la traza
    expect(JSON.stringify(tr.pasos())).not.toContain('12345678Z')
  })
  it('un código fuera de la lista (o un clasificador que lanza) cae a «desconocido»', async () => {
    const a = crearTraza(() => 'cualquier cosa libre con datos')
    await a.paso('tarificar', async () => { throw new Error('x') }).catch(() => undefined)
    expect(a.pasos()[0].errorCodigo).toBe('desconocido')
    const b = crearTraza(() => { throw new Error('clasificador roto') })
    await b.paso('tarificar', async () => { throw new Error('x') }).catch(() => undefined)
    expect(b.pasos()[0].errorCodigo).toBe('desconocido')
  })
  it('no registra más de MAX_PASOS_TRAZA pero sigue ejecutando', async () => {
    const tr = crearTraza(() => 'portal')
    for (let i = 0; i < MAX_PASOS_TRAZA + 5; i++) await tr.paso('navegacion', async () => i)
    expect(tr.pasos()).toHaveLength(MAX_PASOS_TRAZA)
  })
})

describe('versión del bot', () => {
  it.each(['0.1.0', '1.12.3'])('«%s» es válida', (v) => expect(esVersionBot(v)).toBe(true))
  it.each(['0.1', 'v0.1.0', '0.1.0-beta', '', null, 1])('«%s» no lo es', (v) => expect(esVersionBot(v)).toBe(false))
})
