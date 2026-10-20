import { describe, it, expect } from 'vitest'
import { textoAviso, basePortal, enlacePortal, estadoEmailPrevio, TIPOS_AVISO } from './avisos-reglas'

const D = { empleadoNombre: 'Ana', documento: 'Protocolo acoso', empresa: 'Mariscos González', resumen: null, dias: null, url: 'https://x.es/e' }

describe('textoAviso', () => {
  it('todos los tipos llevan el enlace al portal en el email', () => {
    for (const t of TIPOS_AVISO) expect(textoAviso(t, D).texto).toContain('https://x.es/e')
  })
  it('el recordatorio menciona los días solo si se saben', () => {
    expect(textoAviso('recordatorio_firma', { ...D, dias: 7 }).cuerpo).toContain('desde hace 7 días')
    expect(textoAviso('recordatorio_firma', { ...D, dias: null }).cuerpo).not.toContain('desde hace')
  })
  it('incluye el resumen para el empleado cuando lo hay', () => {
    expect(textoAviso('solicitud_firma', { ...D, resumen: 'Léelo con calma.' }).texto).toContain('Léelo con calma.')
  })
})

describe('basePortal / enlacePortal', () => {
  it('prioriza la env, luego el origen, sin barra final', () => {
    expect(basePortal('https://rrhh.ejemplo.es/', 'https://otro')).toBe('https://rrhh.ejemplo.es')
    expect(basePortal(undefined, 'https://otro/')).toBe('https://otro')
    expect(enlacePortal(basePortal(undefined, null))).toBe('https://central-rrhh.vercel.app/e')
  })
})

describe('estadoEmailPrevio', () => {
  it('sin email o sin transporte no se intenta, y se dice por qué', () => {
    expect(estadoEmailPrevio(null, true)).toBe('sin_email')
    expect(estadoEmailPrevio('nada', true)).toBe('sin_email')
    expect(estadoEmailPrevio('a@b.es', false)).toBe('sin_transporte')
    expect(estadoEmailPrevio('a@b.es', true)).toBeNull()
  })
})
