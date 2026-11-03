import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/storage', () => ({ subirObjeto: vi.fn() }))
vi.mock('@/lib/empresa', () => ({ actualizarBranding: vi.fn(), getEmpresa: vi.fn() }))
import { procesarLogo, guardarLogoEmpresa } from './logo-empresa'

async function logoConMargen() {
  const sharp = (await import('sharp')).default
  const interior = await sharp({ create: { width: 200, height: 60, channels: 3, background: { r: 27, g: 52, b: 97 } } }).png().toBuffer()
  return sharp({ create: { width: 1000, height: 400, channels: 3, background: '#ffffff' } })
    .composite([{ input: interior, left: 300, top: 150 }]).png().toBuffer()
}

describe('procesarLogo', () => {
  it('recorta el margen blanco, limita a 600 px y deriva el color', async () => {
    const sharp = (await import('sharp')).default
    const r = await procesarLogo(await logoConMargen(), 'image/png')
    const m = await sharp(r.bytes).metadata()
    expect(m.width!).toBeLessThan(260); expect(m.height!).toBeLessThan(100)
    expect(r.color).toBe('#1b3461'); expect(r.ext).toBe('png')
  })
  it('rechaza una imagen por encima del tope de píxeles (bomba de descompresión) sin decodificarla', async () => {
    const sharp = (await import('sharp')).default
    const enorme = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: '#ffffff' } }).png().toBuffer()
    expect(enorme.byteLength).toBeLessThan(2 * 1024 * 1024)
    await expect(procesarLogo(enorme, 'image/png')).rejects.toThrow()
  })
  it('SVG pasa tal cual', async () => {
    const r = await procesarLogo(Buffer.from('<svg/>'), 'image/svg+xml')
    expect(r.ext).toBe('svg'); expect(r.color).toBeNull()
  })
})

describe('guardarLogoEmpresa', () => {
  it('rechaza tipo no imagen, sobretamaño y basura', async () => {
    expect((await guardarLogoEmpresa('e', Buffer.from('x'), 'application/pdf')).ok).toBe(false)
    expect((await guardarLogoEmpresa('e', Buffer.alloc(2 * 1024 * 1024 + 1), 'image/png')).ok).toBe(false)
    expect((await guardarLogoEmpresa('e', Buffer.from('no soy png'), 'image/png')).ok).toBe(false)
  })
})
