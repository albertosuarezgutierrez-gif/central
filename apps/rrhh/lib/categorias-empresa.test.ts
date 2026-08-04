import { describe, it, expect } from 'vitest'
import {
  CATEGORIAS, MESES, categoriaDe, etiquetaCategoria, pideAnio, pideMes, sufijoPeriodo,
} from './categorias-empresa'

describe('categorías de documentación de empresa', () => {
  it('incluye Documentación mensual y no duplica ids', () => {
    expect(categoriaDe('mensual')?.label).toBe('Documentación mensual')
    expect(new Set(CATEGORIAS.map(c => c.id)).size).toBe(CATEGORIAS.length)
  })

  it('pide año y mes en las categorías mensuales', () => {
    for (const id of ['seguro_social', 'mensual']) {
      expect(pideAnio(id)).toBe(true)
      expect(pideMes(id)).toBe(true)
    }
  })

  it('la póliza pide año pero no mes', () => {
    expect(pideAnio('poliza')).toBe(true)
    expect(pideMes('poliza')).toBe(false)
  })

  it('las categorías sin periodicidad no piden fechas', () => {
    for (const id of ['cif', 'escritura', 'contrato', 'otro']) {
      expect(pideAnio(id)).toBe(false)
      expect(pideMes(id)).toBe(false)
    }
  })

  it('una categoría desconocida no rompe: no pide fechas y muestra su id', () => {
    expect(pideAnio('retirada_hace_anios')).toBe(false)
    expect(etiquetaCategoria('retirada_hace_anios')).toBe('retirada_hace_anios')
  })

  it('el sufijo de periodo distingue año, año/mes y sin fecha', () => {
    expect(sufijoPeriodo(2026, 3)).toBe('2026/03')
    expect(sufijoPeriodo(2026, null)).toBe('2026')
    expect(sufijoPeriodo(null, null)).toBe('')
  })

  it('los 12 meses en español', () => {
    expect(MESES).toHaveLength(12)
    expect(MESES[0]).toBe('Enero')
    expect(MESES[11]).toBe('Diciembre')
  })
})
