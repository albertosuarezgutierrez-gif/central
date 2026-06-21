import { describe, it, expect } from 'vitest'
import { construirSystemPrompt, type ContextoEmpleado } from '@/lib/asistente-prompt'

const base: ContextoEmpleado = {
  nombre: 'Pilar Piña',
  puesto: 'Encargada',
  fecha_alta: '2024-01-15',
  documentos: [
    { nombre: 'Nomina_2026_05.pdf', carpeta: 'nominas', estado_firma: 'pendiente', fecha: '2026-06-01T10:00:00Z' },
    { nombre: 'Contrato.pdf', carpeta: 'contratos', estado_firma: 'firmado', fecha: '2024-01-15T09:00:00Z' },
  ],
  solicitudes: [
    { tipo: 'Vacaciones', fecha_inicio: '2026-08-01', fecha_fin: '2026-08-10', estado: 'aprobada' },
  ],
}

describe('construirSystemPrompt', () => {
  it('incluye el nombre, los documentos y las solicitudes del contexto', () => {
    const p = construirSystemPrompt(base)
    expect(p).toContain('Pilar Piña')
    expect(p).toContain('Nomina_2026_05.pdf')
    expect(p).toContain('carpeta: nominas')
    expect(p).toContain('firma: pendiente')
    expect(p).toContain('Vacaciones')
    expect(p).toContain('estado: aprobada')
  })

  it('exige responder en el idioma del trabajador (multi-idioma)', () => {
    expect(construirSystemPrompt(base)).toMatch(/mismo idioma en que te escribe/i)
  })

  it('prohíbe inventar importes de nómina y saldos de vacaciones', () => {
    const p = construirSystemPrompt(base)
    expect(p).toMatch(/no inventes importes de nómina/i)
    expect(p).toMatch(/días de vacaciones que quedan/i)
  })

  it('gestiona el caso sin documentos ni solicitudes', () => {
    const p = construirSystemPrompt({ ...base, documentos: [], solicitudes: [] })
    expect(p).toContain('(sin documentos)')
    expect(p).toContain('(sin solicitudes)')
  })
})
