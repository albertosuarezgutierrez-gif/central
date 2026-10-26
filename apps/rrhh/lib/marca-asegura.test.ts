import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MARCA_ASEGURA } from '@central/brand'
import { COBALTO_ASEGURA, PIE_ASEGURA, urlPortalAsegura, MANIFEST_PORTAL, MANIFEST_ASEGURA, WEB_ASEGURA } from './marca-asegura'
import * as marca from './marca-asegura'

const RAIZ = join(__dirname, '..')
const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8')
function fuentes(dir: string): { ruta: string; src: string }[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return fuentes(p)
    return /\.(tsx?|css)$/.test(n) && !/\.test\./.test(n) ? [{ ruta: p.replace(RAIZ + '/', ''), src: readFileSync(p, 'utf8') }] : []
  })
}

describe('marca ÚNICA Grupo ASegura (26/10/2026)', () => {
  it('el cobalto sale de @central/brand, no se escribe a mano', () => {
    expect(COBALTO_ASEGURA).toBe(MARCA_ASEGURA.paleta.primario)
    expect(COBALTO_ASEGURA).toBe('#3364ee')
  })
  it('el pie se escribe exactamente «Grupo ASegura»', () => {
    expect(PIE_ASEGURA).toBe('Herramienta gratuita de Grupo ASegura')
  })
  it('la marca ya no depende de la env, del host ni de ?m=: esas funciones no existen', () => {
    for (const k of ['empresaConMarcaAsegura', 'marcaAseguraDeEmpresa', 'marcaPorHost', 'marcaDePeticion', 'estiloMarcaEmpresa', 'paletaEmpresa', 'ENV_EMPRESAS_MARCA_ASEGURA']) {
      expect(k in marca).toBe(false)
    }
  })
  it('nada del código lee RRHH_EMPRESAS_MARCA_ASEGURA (la env, si sigue puesta, no hace nada)', () => {
    const lee = [...fuentes(join(RAIZ, 'app')), ...fuentes(join(RAIZ, 'components')), ...fuentes(join(RAIZ, 'lib'))]
      .filter(f => /RRHH_EMPRESAS_MARCA_ASEGURA/.test(f.src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))).map(f => f.ruta)
    expect(lee).toEqual([])
  })
  it('el layout raíz inyecta los tokens de @central/brand y no hay beige/teal/serif ni hex en el CSS', () => {
    const layout = leer('app', 'layout.tsx')
    expect(layout).toContain('emitirRootCss(MARCA_ASEGURA)')
    expect(layout).not.toMatch(/Newsreader|Inter_Tight/)
    const css = leer('app', 'globals.css')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/serif\)|Newsreader|\.marca-asegura/)
  })
  it('ninguna pantalla pinta hex propios (salvo el QR de verificación, que necesita negro puro)', () => {
    const malas = [...fuentes(join(RAIZ, 'app')), ...fuentes(join(RAIZ, 'components'))]
      .filter(f => !f.ruta.includes('api/admin/prl') && !f.ruta.includes('app/v/'))
      .filter(f => /#[0-9a-fA-F]{6}\b/.test(f.src)).map(f => f.ruta)
    expect(malas).toEqual([])
  })
})

describe('URL de «Seguros» (regla legal: solo email y origen)', () => {
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
  it('la cabecera común (la usan /e y /admin) enlaza a Seguros en pestaña nueva y marca Herramientas como activa', () => {
    const c = leer('components', 'CabeceraApp.tsx')
    expect(c).toContain('aria-current="page"')
    expect(c).toContain('target="_blank"')
    expect(c).toContain('rel="noopener noreferrer"')
    expect(leer('app', 'admin', 'layout.tsx')).toContain('urlPortalAsegura(usuario.email')
    expect(leer('app', 'e', 'page.tsx')).toContain('urlPortalAsegura(r[0]?.email')
  })
})

describe('app instalable con identidad Grupo ASegura', () => {
  const pub = (f: string) => join(RAIZ, 'public', f)
  it('los dos manifest son de Grupo ASegura, cobalto, con iconos PNG existentes y start_url dentro del scope', () => {
    for (const f of ['manifest.json', 'manifest-asegura.json']) {
      const m = JSON.parse(readFileSync(pub(f), 'utf8'))
      expect(m.name).toContain('Grupo ASegura')
      expect(m.short_name).toBe('Grupo ASegura')
      expect(m.theme_color).toBe(COBALTO_ASEGURA)
      expect(m.start_url.startsWith('/e/entrar')).toBe(true)
      expect(m.scope).toBe('/')
      expect(m.icons.some((i: { purpose: string; sizes: string; type: string }) => i.purpose === 'maskable' && i.sizes === '512x512' && i.type === 'image/png')).toBe(true)
      for (const i of m.icons) expect(existsSync(pub(i.src.slice(1)))).toBe(true)
    }
    expect(MANIFEST_PORTAL).toBe('/manifest.json')
    expect(MANIFEST_ASEGURA).toBe('/manifest-asegura.json')
  })
  it('el layout raíz enlaza el manifest y los iconos de la marca para TODAS las rutas', () => {
    const layout = leer('app', 'layout.tsx')
    expect(layout).toContain('manifest: MANIFEST_PORTAL')
    expect(layout).toContain('ICONO_APPLE_ASEGURA')
    expect(layout).toContain('themeColor: COBALTO_ASEGURA')
  })
  it('el pie enlaza a la web pública de Grupo ASegura', () => {
    expect(WEB_ASEGURA).toBe('https://grupoasegura.es')
    const pie = leer('components', 'MarcaAsegura.tsx')
    expect(pie).toContain('target="_blank"')
    expect(pie).toContain('rel="noopener noreferrer"')
  })
})
