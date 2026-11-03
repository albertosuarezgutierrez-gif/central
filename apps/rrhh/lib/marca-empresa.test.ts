import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { contraste, paletaEmpresa, marcaCabecera } from './marca-empresa'

describe('marca de la empresa en la cabecera', () => {
  it('con logo o color válido manda la empresa; sin ninguno, vuelve a Grupo ASegura', () => {
    expect(marcaCabecera({ nombre: 'Global2', logoUrl: 'https://x/logo.png', color: '#b46b27' }).modo).toBe('empresa')
    expect(marcaCabecera({ nombre: 'Global2', logoUrl: 'https://x/logo.png', color: null }).modo).toBe('empresa')
    expect(marcaCabecera({ nombre: 'Global2', logoUrl: null, color: '#1B3461' }).modo).toBe('empresa')
    expect(marcaCabecera({ nombre: 'Global2', logoUrl: null, color: null }).modo).toBe('asegura')
    expect(marcaCabecera({ nombre: 'Global2', logoUrl: '  ', color: 'rojo' }).modo).toBe('asegura')
    expect(marcaCabecera(null).modo).toBe('asegura')
  })
  it('sin color válido no toca las variables (queda el cobalto); con color las pone', () => {
    expect(marcaCabecera({ logoUrl: 'https://x/l.png', color: 'zzz' }).estilo).toEqual({})
    const s = marcaCabecera({ logoUrl: null, color: '#1B3461' }).estilo
    expect(Object.keys(s).sort()).toEqual(['--brand', '--brand-ink', '--brand-soft'])
  })
  it('texto blanco sobre el acento y acento sobre fondo suave cumplen AA (4,5:1), también con colores claros', () => {
    for (const c of ['#b46b27', '#1B3461', '#ffd400', '#ffffff', '#f4f4a0', '#00ff00', '#000000', '#3364ee']) {
      const p = paletaEmpresa(c)!
      expect(contraste(p.brand, '#ffffff'), c).toBeGreaterThanOrEqual(4.5)
      expect(contraste(p.brand, p.brandSoft), c).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('un color ya oscuro se respeta tal cual', () => {
    expect(paletaEmpresa('#1B3461')!.brand).toBe('#1b3461')
    expect(paletaEmpresa('no-es-color')).toBeNull()
  })
})

describe('páginas internas pintan con la marca de la empresa', () => {
  const leer = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')
  it('el marco del panel, /e y /e/[token] aplican marcaCabecera', () => {
    for (const f of [['components', 'AdminShell.tsx'], ['app', 'e', 'ExpedienteEmpleado.tsx'], ['app', 'e', '[token]', 'LoginEmpleado.tsx']]) {
      expect(leer(...f), f.join('/')).toContain('marcaCabecera')
    }
  })
})

describe('página pública de privacidad', () => {
  const leer = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')
  it('existe, no pide sesión y no afirma lo que no es cierto', () => {
    const src = leer('app', 'privacidad-seguridad', 'page.tsx')
    expect(src).not.toMatch(/getSesion|redirect\(/)
    expect(src.replace(/\/\/.*$/gm, '')).not.toMatch(/\bRLS\b|auditor[ií]a|certificad|ISO ?27001|cifrado/i)
    expect(src).toContain('Irlanda')
    expect(src).toContain('1 hora')
  })
  it('el pie enlaza a ella y el middleware no la toca', () => {
    expect(leer('components', 'MarcaAsegura.tsx')).toContain('RUTA_PRIVACIDAD')
    expect(leer('lib', 'marca-asegura.ts')).toContain("RUTA_PRIVACIDAD = '/privacidad-seguridad'")
    expect(leer('middleware.ts')).not.toContain('privacidad')
  })
})
