import { describe, it, expect } from 'vitest'
import { IDS_SOLICITUD, tipoEtiqueta, tiposPorGrupo, pistaTipo, TIPOS_SOLICITUD } from '@/lib/solicitudes-tipos'

describe('solicitudes-tipos', () => {
  it('incluye los permisos retribuidos y el grupo sábados', () => {
    for (const id of ['hospitalizacion', 'fallecimiento', 'enfermedad_grave', 'matrimonio', 'sabado_manana', 'sabado_tarde', 'sabado_completo']) {
      expect(IDS_SOLICITUD).toContain(id)
    }
  })

  it('mantiene los tipos base para no romper datos existentes', () => {
    for (const id of ['vacaciones', 'parte_medico', 'baja', 'otro']) {
      expect(IDS_SOLICITUD).toContain(id)
    }
  })

  it('da etiqueta legible y fallback al id desconocido', () => {
    expect(tipoEtiqueta('hospitalizacion')).toMatch(/hospitalizaci/i)
    expect(tipoEtiqueta('xxx')).toBe('xxx')
  })

  it('agrupa todos los tipos sin perder ninguno', () => {
    const enGrupos = tiposPorGrupo().flatMap(g => g.tipos)
    expect(enGrupos).toHaveLength(TIPOS_SOLICITUD.length)
  })

  it('ofrece pista orientativa en los permisos con días definidos', () => {
    expect(pistaTipo('hospitalizacion')).toMatch(/d[ií]as/i)
    expect(pistaTipo('vacaciones')).toBeUndefined()
  })
})
