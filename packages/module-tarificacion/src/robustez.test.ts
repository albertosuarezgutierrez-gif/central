// F2 del plan de robustez (14/10/2026): aprendido con confianza, corte por compañía/ramo y atasco. Un brazo por regla.
import { describe, it, expect } from 'vitest'
import {
  MAX_CANDIDATOS_ATASCO,
  MAX_RONDAS_ATASCO,
  UMBRAL_CONSOLIDAR_APRENDIDO,
  UMBRAL_DESCARTAR_APRENDIDO,
  atascoActivo,
  cabeCapturaEnRespuesta,
  MAX_BYTES_CAPTURAS_RESPUESTA,
  atascoCaducado,
  candidatosVisibles,
  debeCortarBot,
  decidirAtasco,
  elegirCandidatoAtasco,
  estadoAprendido,
  horasAtasco,
  leerAtascoWorker,
  puedeTransitar,
  trasExitoAprendido,
  trasFalloAprendido,
  ESTADOS_TERMINALES,
  ESTADOS_PURGA_RIESGO,
} from './index.ts'

describe('aprendido con confianza', () => {
  it('se consolida al TERCER éxito, no antes', () => {
    expect(UMBRAL_CONSOLIDAR_APRENDIDO).toBe(3)
    expect(trasExitoAprendido({ confirmaciones: 1, consolidado: false }, 'ia').consolidar).toBe(false)
    expect(trasExitoAprendido({ confirmaciones: 2, consolidado: false }, 'ia')).toEqual({ confirmaciones: 3, fallos: 0, consolidar: true })
  })
  it('lo que eligió Alberto (origen humano) se consolida al momento', () => {
    expect(trasExitoAprendido({ confirmaciones: 0, consolidado: false }, 'humano').consolidar).toBe(true)
  })
  it('se descarta al SEGUNDO fallo seguido; uno solo no', () => {
    expect(UMBRAL_DESCARTAR_APRENDIDO).toBe(2)
    expect(trasFalloAprendido({ fallos: 0 })).toEqual({ fallos: 1, descartar: false })
    expect(trasFalloAprendido({ fallos: 1 })).toEqual({ fallos: 2, descartar: true })
  })
  it('estado: descartado manda sobre consolidado; sin marcas = provisional (null no es «0»)', () => {
    expect(estadoAprendido({ consolidadoAt: null, descartadoAt: null })).toBe('provisional')
    expect(estadoAprendido({ consolidadoAt: new Date(), descartadoAt: null })).toBe('consolidado')
    expect(estadoAprendido({ consolidadoAt: new Date(), descartadoAt: new Date() })).toBe('descartado')
  })
})

describe('corte por compañía/ramo', () => {
  const f = (tipoError: string | null) => ({ estado: 'error_definitivo', tipoError })
  it('tres fallos SEGUIDOS del bot (portal/infra) cortan', () => {
    expect(debeCortarBot([f('portal'), f('infra'), f('portal')])).toBe(true)
  })
  it('dos no bastan', () => {
    expect(debeCortarBot([f('portal'), f('portal')])).toBe(false)
  })
  it('un ok entre medias rompe la racha', () => {
    expect(debeCortarBot([f('portal'), { estado: 'ok', tipoError: null }, f('portal'), f('portal')])).toBe(false)
  })
  it('datos/credenciales/captcha o tipo desconocido (null) NO son fallo del bot: no cortan', () => {
    expect(debeCortarBot([f('portal'), f('datos'), f('portal')])).toBe(false)
    expect(debeCortarBot([f('portal'), f(null), f('portal')])).toBe(false)
  })
})

const cand = (extra: Record<string, unknown> = {}) => ({ tag: 'input', type: 'text', id: 'superficie', name: 'sup', role: null, texto: null, etiqueta: 'Superficie m2', marco: 'appArea', selector: '#superficie', ...extra })
const atasco = (candidatos: unknown[], extra: Record<string, unknown> = {}) => ({ clave: 'superficie_m2', tipo: 'campo', descripcion: 'Campo «Superficie m2»', etiqueta: 'Superficie m2', candidatos, ...extra })

describe('atasco: lectura del checkpoint del worker', () => {
  it('forma buena → lista numerada 1..N', () => {
    const a = leerAtascoWorker(atasco([cand(), cand({ id: 'otro', selector: '#otro' })]))
    expect(a?.candidatos.map((c) => c.n)).toEqual([1, 2])
    expect(a?.textoEsperado).toBeNull()
  })
  it('quita candidatos con palabras de emisión/pago y RENUMERA', () => {
    const a = leerAtascoWorker(atasco([cand({ tag: 'button', type: null, texto: 'Emitir póliza', selector: '#e' }), cand({ id: 'pagar_ya', selector: '#p' }), cand()]))
    expect(a?.candidatos.map((c) => [c.n, c.selector])).toEqual([[1, '#superficie']])
  })
  it('sin candidatos válidos, contraseñas fuera, más del tope o clave rara → null', () => {
    expect(leerAtascoWorker(atasco([cand({ type: 'password' })]))).toBeNull()
    expect(leerAtascoWorker(atasco(Array.from({ length: MAX_CANDIDATOS_ATASCO + 1 }, () => cand())))).toBeNull()
    expect(leerAtascoWorker(atasco([cand()], { clave: 'Mal Clave' }))).toBeNull()
    expect(leerAtascoWorker(atasco([cand({ selector: '' })]))).toBeNull()
  })
  it('redacta datos personales en textos y etiquetas (aunque el worker ya lo hizo)', () => {
    const a = leerAtascoWorker(atasco([cand({ etiqueta: 'NIF 12345678Z del tomador' })]))
    expect(a?.candidatos[0].etiqueta).not.toContain('12345678Z')
  })
  it('lo visible no lleva selector, name ni marco', () => {
    const a = leerAtascoWorker(atasco([cand()]))!
    const v = candidatosVisibles(a)[0] as Record<string, unknown>
    expect(v.selector).toBeUndefined()
    expect(v.name).toBeUndefined()
    expect(v.marco).toBeUndefined()
  })
})

describe('atasco: elección y decisión', () => {
  const a = leerAtascoWorker(atasco([cand(), cand({ id: 'b', selector: '#b' })]))!
  it('elige por número exacto; fuera de rango o no entero → no', () => {
    expect(elegirCandidatoAtasco(a.candidatos, 2)).toMatchObject({ ok: true, c: { selector: '#b' } })
    expect(elegirCandidatoAtasco(a.candidatos, 3).ok).toBe(false)
    expect(elegirCandidatoAtasco(a.candidatos, '1').ok).toBe(false)
  })
  it('decidirAtasco: solo tarificar, solo portal, con el interruptor y bajo el tope de rondas', () => {
    const base = { activo: true, modo: null, tipoError: 'portal', rondasPrevias: 0, atasco: a }
    expect(decidirAtasco(base).atascar).toBe(true)
    expect(decidirAtasco({ ...base, activo: false }).atascar).toBe(false)
    expect(decidirAtasco({ ...base, modo: 'emision' }).atascar).toBe(false)
    expect(decidirAtasco({ ...base, tipoError: 'datos' }).atascar).toBe(false)
    expect(decidirAtasco({ ...base, rondasPrevias: MAX_RONDAS_ATASCO }).atascar).toBe(false)
    expect(decidirAtasco({ ...base, atasco: null }).atascar).toBe(false)
  })
  it('interruptor y horas: opt-in; horas 1..72 (basura → 24)', () => {
    expect(atascoActivo({})).toBe(false)
    expect(atascoActivo({ TARIFICADOR_ATASCO_ACTIVO: '1' })).toBe(true)
    expect(horasAtasco({ TARIFICADOR_ATASCO_HORAS: '6' })).toBe(6)
    expect(horasAtasco({ TARIFICADOR_ATASCO_HORAS: '500' })).toBe(24)
  })
  it('caducado solo con fecha y pasada', () => {
    const ahora = new Date('2026-10-14T10:00:00Z')
    expect(atascoCaducado(null, ahora)).toBe(false)
    expect(atascoCaducado(new Date('2026-10-14T09:59:00Z'), ahora)).toBe(true)
    expect(atascoCaducado(new Date('2026-10-14T10:01:00Z'), ahora)).toBe(false)
  })
})

describe('estado atascado en la máquina', () => {
  it('en_curso → atascado → pendiente | error_definitivo | cancelado; nada más', () => {
    expect(puedeTransitar('en_curso', 'atascado')).toBe(true)
    for (const a of ['pendiente', 'error_definitivo', 'cancelado']) expect(puedeTransitar('atascado', a)).toBe(true)
    expect(puedeTransitar('atascado', 'ok')).toBe(false)
    expect(puedeTransitar('pendiente', 'atascado')).toBe(false)
  })
  it('no es terminal y NO purga el riesgo (hace falta entero para repetir el camino)', () => {
    expect(ESTADOS_TERMINALES).not.toContain('atascado')
    expect(ESTADOS_PURGA_RIESGO as readonly string[]).not.toContain('atascado')
  })
})

describe('tope total de capturas por respuesta', () => {
  it('acumula: las que caben llevan foto y las que exceden salen sin ella', () => {
    const MB = 1024 * 1024
    let usado = 0
    const llevan: boolean[] = []
    for (const b of [MB, MB, MB, MB, 10]) {
      const cabe = cabeCapturaEnRespuesta(usado, b)
      llevan.push(cabe)
      if (cabe) usado += b
    }
    expect(llevan).toEqual([true, true, true, false, false])
    expect(usado).toBeLessThanOrEqual(MAX_BYTES_CAPTURAS_RESPUESTA)
  })
  it('justo en el tope cabe; un byte más, no; valores raros, no', () => {
    expect(cabeCapturaEnRespuesta(MAX_BYTES_CAPTURAS_RESPUESTA - 5, 5)).toBe(true)
    expect(cabeCapturaEnRespuesta(MAX_BYTES_CAPTURAS_RESPUESTA - 5, 6)).toBe(false)
    expect(cabeCapturaEnRespuesta(0, Number.NaN)).toBe(false)
    expect(cabeCapturaEnRespuesta(0, -1)).toBe(false)
  })
})
