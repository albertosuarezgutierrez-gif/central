import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { COBALTO_ASEGURA, PIE_ASEGURA, empresaConMarcaAsegura, estiloMarcaEmpresa, paletaEmpresa, urlPortalAsegura,
  ENV_EMPRESAS_MARCA_ASEGURA, MANIFEST_ASEGURA, MANIFEST_BASE, WEB_ASEGURA, marcaAseguraDeEmpresa, manifestParaMarca, metadataMarcaAsegura, themeColorMarca } from './marca-asegura'
import { estiloMarca } from './branding'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'

describe('marca Grupo ASegura', () => {
  it('solo las empresas de la lista llevan la marca', () => {
    const lista = ` ${A.toUpperCase()} , 33333333-3333-3333-3333-333333333333`
    expect(empresaConMarcaAsegura(A, lista)).toBe(true)
    expect(empresaConMarcaAsegura(B, lista)).toBe(false)
    expect(empresaConMarcaAsegura(A, '')).toBe(false)
    expect(empresaConMarcaAsegura(A, undefined)).toBe(false)
    expect(empresaConMarcaAsegura('', lista)).toBe(false)
  })
  it('con marca → paleta cobalto ASegura (ignora el color de la empresa)', () => {
    expect(paletaEmpresa(true, '#1B3461')?.accent).toBe(COBALTO_ASEGURA)
    expect(estiloMarcaEmpresa(true, null)['--accent']).toBe('#3364ee')
  })
  it('sin marca → la de siempre', () => {
    expect(estiloMarcaEmpresa(false, '#1B3461')).toEqual(estiloMarca('#1B3461'))
    expect(estiloMarcaEmpresa(false, null)).toEqual({})
  })
  it('el pie se escribe exactamente «Grupo ASegura»', () => {
    expect(PIE_ASEGURA).toBe('Herramienta gratuita de Grupo ASegura')
  })
})

describe('URL de la tarjeta «Mis seguros» (regla legal)', () => {
  it('solo lleva email y origen', () => {
    const u = new URL(urlPortalAsegura('ana+prueba@ejemplo.es', 'https://clientes.grupoasegura.es/'))
    expect([...u.searchParams.keys()].sort()).toEqual(['email', 'origen'])
    expect(u.searchParams.get('email')).toBe('ana+prueba@ejemplo.es')
    expect(u.searchParams.get('origen')).toBe('rrhh')
    expect(u.origin).toBe('https://clientes.grupoasegura.es')
  })
  it('sin email solo lleva origen y respeta la base de la env', () => {
    const u = new URL(urlPortalAsegura(null, 'https://otro.example'))
    expect([...u.searchParams.keys()]).toEqual(['origen'])
    expect(u.origin).toBe('https://otro.example')
  })
})

describe('app instalable con identidad Grupo ASegura', () => {
  const prev = process.env[ENV_EMPRESAS_MARCA_ASEGURA]
  afterEach(() => { if (prev === undefined) delete process.env[ENV_EMPRESAS_MARCA_ASEGURA]; else process.env[ENV_EMPRESAS_MARCA_ASEGURA] = prev })
  const pub = (f: string) => join(__dirname, '..', 'public', f)

  it('el manifest depende de la marca: con marca el de Grupo ASegura, sin marca el de siempre', () => {
    expect(manifestParaMarca(true)).toBe(MANIFEST_ASEGURA)
    expect(manifestParaMarca(false)).toBe(MANIFEST_BASE)
    expect(metadataMarcaAsegura(true).manifest).toBe('/manifest-asegura.json')
    expect(metadataMarcaAsegura(false)).toEqual({})   // sin marca: ningún metadato propio, queda lo del layout
    expect(themeColorMarca(true)).toBe('#3364ee')
    expect(themeColorMarca(false)).toBeUndefined()
  })
  it('/e/[token] y /e usan la marca solo si la empresa está en la env', () => {
    process.env[ENV_EMPRESAS_MARCA_ASEGURA] = `${A}`
    expect(marcaAseguraDeEmpresa(A)).toBe(true)
    expect(marcaAseguraDeEmpresa(B)).toBe(false)
    expect(marcaAseguraDeEmpresa(null)).toBe(false)   // token inválido: nunca marca (no delata nada)
    delete process.env[ENV_EMPRESAS_MARCA_ASEGURA]
    expect(marcaAseguraDeEmpresa(A)).toBe(false)
    const tokenPage = readFileSync(join(__dirname, '..', 'app', 'e', '[token]', 'page.tsx'), 'utf8')
    expect(tokenPage).toContain('marcaAseguraDeEmpresa(empresaId)')
    expect(tokenPage).toContain('generateMetadata')
  })
  it('manifest-asegura.json: Grupo ASegura, cobalto, iconos PNG existentes y start_url dentro del scope', () => {
    const m = JSON.parse(readFileSync(pub('manifest-asegura.json'), 'utf8'))
    expect(m.name).toContain('Grupo ASegura')
    expect(m.short_name).toBe('Grupo ASegura')
    expect(m.theme_color).toBe('#3364ee')
    expect(m.start_url.startsWith('/e/entrar')).toBe(true)
    expect(m.scope).toBe('/')
    expect(m.icons.some((i: { purpose: string; sizes: string; type: string }) => i.purpose === 'maskable' && i.sizes === '512x512' && i.type === 'image/png')).toBe(true)
    for (const i of m.icons) expect(existsSync(pub(i.src.slice(1)))).toBe(true)
  })
  it('el manifest de las demás empresas no cambia', () => {
    const m = JSON.parse(readFileSync(pub('manifest.json'), 'utf8'))
    expect(m.short_name).toBe('RR.HH.')
    expect(m.theme_color).toBe('#0f766e')
  })
  it('el pie enlaza a la web pública de Grupo ASegura', () => {
    expect(WEB_ASEGURA).toBe('https://grupoasegura.es')
    const pie = readFileSync(join(__dirname, '..', 'components', 'MarcaAsegura.tsx'), 'utf8')
    expect(pie).toContain('target="_blank"')
    expect(pie).toContain('rel="noopener noreferrer"')
  })
})
