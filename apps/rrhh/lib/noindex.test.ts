import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import robots from '../app/robots'
import nextConfig from '../next.config'

// Portal del Empleado (datos personales): nunca indexable. Guardián de las tres capas.
const raiz = path.resolve(__dirname, '..')

describe('noindex del Portal del Empleado', () => {
  it('robots.ts bloquea todo para todos los user agents', () => {
    const r = robots()
    const reglas = Array.isArray(r.rules) ? r.rules : [r.rules]
    expect(reglas.some(x => x.userAgent === '*' && x.disallow === '/')).toBe(true)
  })

  it('next.config añade X-Robots-Tag: noindex, nofollow a todas las rutas', async () => {
    expect(typeof nextConfig.headers).toBe('function')
    const cabeceras = await nextConfig.headers!()
    const todas = cabeceras.find(h => h.source === '/:path*')
    expect(todas).toBeDefined()
    expect(todas!.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex, nofollow' })
  })

  it('el layout raíz declara robots index:false follow:false', () => {
    const layout = readFileSync(path.join(raiz, 'app/layout.tsx'), 'utf8')
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/)
  })
})
