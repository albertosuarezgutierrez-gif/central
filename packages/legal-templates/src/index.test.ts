import { describe, it, expect } from 'vitest'
import { PLANTILLAS, listarPlantillas, getPlantilla, type DatosPlantilla } from './index'

const datos: DatosPlantilla = { empresa: 'Mariscos González', trabajador: 'Eligio <b>González</b>', dni: '12345678Z', fecha: '16/06/2026' }

describe('legal-templates', () => {
  it('lista las plantillas con id/título/versión', () => {
    const l = listarPlantillas()
    expect(l.length).toBe(PLANTILLAS.length)
    expect(l.every(p => p.id && p.titulo && p.version)).toBe(true)
  })

  it('cada plantilla renderiza HTML con empresa, trabajador y su versión', () => {
    for (const p of PLANTILLAS) {
      const html = p.render(datos)
      expect(html).toContain('<!doctype html>')
      expect(html).toContain('Mariscos González')
      expect(html).toContain(`versión ${p.version}`)
    }
  })

  it('escapa el HTML de los datos (no inyección)', () => {
    const html = getPlantilla('confidencialidad')!.render(datos)
    expect(html).toContain('Eligio &lt;b&gt;González&lt;/b&gt;')
    expect(html).not.toContain('Eligio <b>González</b>')
  })

  it('getPlantilla devuelve undefined si no existe', () => {
    expect(getPlantilla('xxx')).toBeUndefined()
  })
})
