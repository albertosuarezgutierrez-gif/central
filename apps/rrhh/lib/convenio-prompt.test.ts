import { describe, it, expect } from 'vitest'
import { construirPromptConvenio, parsearConvenio } from '@/lib/convenio-prompt'

describe('convenio-prompt', () => {
  it('el prompt incluye el código y (si hay) el nombre', () => {
    const { system, user } = construirPromptConvenio('41000105011982', 'Hostelería Sevilla')
    expect(user).toContain('41000105011982')
    expect(user).toContain('Hostelería Sevilla')
    expect(system).toMatch(/especialista en convenios/i)
    expect(system).toMatch(/JSON/)
  })

  it('parsea JSON limpio', () => {
    const out = parsearConvenio('{"resumen":"X","dias_permisos":{"mudanza":1},"vacaciones":"30 días","fuente":"BOP"}')
    expect(out.resumen).toBe('X')
    expect(out.dias_permisos?.mudanza).toBe(1)
    expect(out.vacaciones).toBe('30 días')
    expect(out.fuente).toBe('BOP')
  })

  it('parsea JSON envuelto en ```json (cleanJSON)', () => {
    const out = parsearConvenio('```json\n{"resumen":"Y"}\n```')
    expect(out.resumen).toBe('Y')
  })

  it('si no es JSON, usa el texto como resumen (no rompe)', () => {
    const out = parsearConvenio('No he encontrado el convenio.')
    expect(out.resumen).toContain('No he encontrado')
    expect(out.dias_permisos).toBeUndefined()
  })
})
