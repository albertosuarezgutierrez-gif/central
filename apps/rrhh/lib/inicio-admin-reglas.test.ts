import { describe, it, expect } from 'vitest'
import { tarjetasInicio, type DatosInicio } from './inicio-admin-reglas'

const base: DatosInicio = {
  solicitudes: { total: 0, recientes: [] }, firmas: { pendientes: 0, esperandoEmpresa: 0, sinAbrir: 0, masAntiguaDias: null },
  avisosFallidos: 0, correosFallidos: 0, fichajesAbiertos: undefined,
}

describe('Inicio de pendientes del responsable', () => {
  it('todo a cero → tarjetas «ok» y ninguna urgente', () => {
    const t = tarjetasInicio(base)
    expect(t.map(x => x.id)).toEqual(['solicitudes', 'firmas', 'correos'])
    expect(t.every(x => x.tono === 'ok' && !x.urgente)).toBe(true)
  })
  it('lo que pide acción va primero y con el singular/plural correcto', () => {
    const t = tarjetasInicio({ ...base,
      solicitudes: { total: 1, recientes: [{ id: '1', empleado: 'Ana', tipo: 'vacaciones' }] },
      firmas: { pendientes: 3, esperandoEmpresa: 2, sinAbrir: 1, masAntiguaDias: 5 }, correosFallidos: 2, avisosFallidos: 1 })
    expect(t[0].urgente).toBe(true)
    const sol = t.find(x => x.id === 'solicitudes')!
    expect(sol.texto).toBe('1 solicitud espera tu respuesta: Ana.')
    const fir = t.find(x => x.id === 'firmas')!
    expect(fir.texto).toContain('2 esperan tu firma')
    expect(fir.texto).toContain('3 esperan la firma del empleado (1 sin abrir)')
    expect(fir.texto).toContain('hace 5 días')
    expect(t.find(x => x.id === 'correos')!.texto).toContain('3 correos no han podido enviarse')
    expect(t.find(x => x.id === 'correos')!.tono).toBe('alerta')
  })
  it('null = «no se ha podido comprobar», NUNCA «sin pendientes»', () => {
    const t = tarjetasInicio({ ...base, solicitudes: null, firmas: null, avisosFallidos: null, correosFallidos: null, fichajesAbiertos: null })
    expect(t).toHaveLength(4)
    for (const x of t) { expect(x.tono).toBe('neutro'); expect(x.texto).toContain('No se ha podido comprobar'); expect(x.texto).not.toMatch(/No hay|Nadie|bien/) }
  })
  it('fichajes solo si la empresa los usa', () => {
    expect(tarjetasInicio({ ...base, fichajesAbiertos: 0 }).find(x => x.id === 'fichajes')?.texto).toBe('Nadie en jornada ahora mismo.')
    expect(tarjetasInicio(base).some(x => x.id === 'fichajes')).toBe(false)
  })
  it('tres estados: si falla UNA de las dos fuentes de correos, «no se ha podido comprobar», nunca el verde', () => {
    for (const d of [{ correosFallidos: null, avisosFallidos: 0 }, { correosFallidos: 0, avisosFallidos: null }, { correosFallidos: null, avisosFallidos: 3 }]) {
      const c = tarjetasInicio({ ...base, ...d }).find(x => x.id === 'correos')!
      expect(c.tono).toBe('neutro')
      expect(c.texto).toContain('No se ha podido comprobar')
      expect(c.texto).not.toContain('han salido bien')
    }
  })
})
