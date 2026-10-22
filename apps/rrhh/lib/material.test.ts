import { describe, it, expect } from 'vitest'
import {
  detectarImagen, validarFoto, validarAltaMaterial, validarCambioEstado, empleadoPuedeBorrar,
  pathMaterial, esPathMaterialDe, leerFiltrosMaterial, decidirSubida, MAX_BYTES_FOTO, MAX_BYTES_ORIGINAL_CLIENTE,
} from './material'

const bytes = (...xs: (number | string)[]) => new Uint8Array(xs.flatMap(x => typeof x === 'string' ? [...x].map(c => c.charCodeAt(0)) : [x]))
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)
const WEBP = bytes('RIFF', 0, 0, 0, 0, 'WEBP', 'VP8 ')
const HEIC = bytes(0, 0, 0, 0x18, 'ftyp', 'heic', 0, 0, 0, 0)
const PDF = bytes('%PDF-1.7')
const AVIF = bytes(0, 0, 0, 0x18, 'ftyp', 'avif')

const EMPRESA = '11111111-1111-4111-8111-111111111111'
const EMPLEADO = '22222222-2222-4222-8222-222222222222'
const OTRO = '33333333-3333-4333-8333-333333333333'
const UUID = '44444444-4444-4444-8444-444444444444'

describe('detectarImagen (magic bytes)', () => {
  it('reconoce los cuatro formatos admitidos', () => {
    expect(detectarImagen(JPG)).toBe('image/jpeg')
    expect(detectarImagen(PNG)).toBe('image/png')
    expect(detectarImagen(WEBP)).toBe('image/webp')
    expect(detectarImagen(HEIC)).toBe('image/heic')
  })
  it('rechaza lo que no es imagen admitida o viene truncado', () => {
    expect(detectarImagen(PDF)).toBeNull()
    expect(detectarImagen(AVIF)).toBeNull()
    expect(detectarImagen(bytes(0xff, 0xd8))).toBeNull()
    expect(detectarImagen(new Uint8Array())).toBeNull()
  })
})

describe('validarFoto', () => {
  it('acepta una imagen cuyo content-type coincide con sus bytes', () => {
    expect(validarFoto('image/jpeg', 1000, JPG)).toEqual({ ok: true, mime: 'image/jpeg', ext: 'jpg' })
    expect(validarFoto('image/heic', 1000, HEIC)).toEqual({ ok: true, mime: 'image/heic', ext: 'heic' })
  })
  it('rechaza un PDF disfrazado de JPG (content-type mentiroso)', () => {
    const r = validarFoto('image/jpeg', 1000, PDF)
    expect(r.ok).toBe(false)
  })
  it('rechaza un PNG declarado como JPG (no coinciden)', () => {
    expect(validarFoto('image/jpeg', 1000, PNG).ok).toBe(false)
  })
  it('rechaza content-types fuera de la lista aunque los bytes sean de imagen', () => {
    expect(validarFoto('image/gif', 1000, JPG)).toMatchObject({ ok: false, status: 415 })
    expect(validarFoto('', 1000, JPG)).toMatchObject({ ok: false, status: 415 })
  })
  it('límite de 8 MB: justo en el límite pasa, un byte más no', () => {
    expect(validarFoto('image/jpeg', MAX_BYTES_FOTO, JPG).ok).toBe(true)
    expect(validarFoto('image/jpeg', MAX_BYTES_FOTO + 1, JPG)).toMatchObject({ ok: false, status: 413 })
  })
  it('rechaza un archivo vacío', () => {
    expect(validarFoto('image/jpeg', 0, JPG)).toMatchObject({ ok: false, status: 400 })
  })
})

describe('validarAltaMaterial', () => {
  it('normaliza y deja la nota vacía en NULL', () => {
    expect(validarAltaMaterial({ tipo: 'epi', nombre: '  Casco   blanco ', nota: '   ' }))
      .toEqual({ ok: true, datos: { tipo: 'epi', nombre: 'Casco blanco', nota: null } })
  })
  it('tipo fuera de catálogo → error (no se convierte en «otro»)', () => {
    expect(validarAltaMaterial({ tipo: 'coche', nombre: 'x' }).ok).toBe(false)
    expect(validarAltaMaterial({ nombre: 'x' }).ok).toBe(false)
  })
  it('nombre obligatorio y ≤ 80', () => {
    expect(validarAltaMaterial({ tipo: 'otro', nombre: '   ' }).ok).toBe(false)
    expect(validarAltaMaterial({ tipo: 'otro', nombre: 'a'.repeat(80) }).ok).toBe(true)
    expect(validarAltaMaterial({ tipo: 'otro', nombre: 'a'.repeat(81) }).ok).toBe(false)
  })
  it('nota ≤ 500', () => {
    expect(validarAltaMaterial({ tipo: 'otro', nombre: 'x', nota: 'n'.repeat(500) }).ok).toBe(true)
    expect(validarAltaMaterial({ tipo: 'otro', nombre: 'x', nota: 'n'.repeat(501) }).ok).toBe(false)
  })
})

describe('validarCambioEstado / borrado', () => {
  it('solo estados de revisión', () => {
    expect(validarCambioEstado({ estado: 'revisado' })).toEqual({ ok: true, estado: 'revisado', nota: null })
    expect(validarCambioEstado({ estado: 'falta_roto', nota: ' sin guantes ' })).toEqual({ ok: true, estado: 'falta_roto', nota: 'sin guantes' })
    expect(validarCambioEstado({ estado: 'pendiente' }).ok).toBe(false)
    expect(validarCambioEstado({ estado: 'otro' }).ok).toBe(false)
    expect(validarCambioEstado({ estado: 'devuelto', nota: 'n'.repeat(501) }).ok).toBe(false)
  })
  it('el empleado solo borra lo pendiente', () => {
    expect(empleadoPuedeBorrar('pendiente')).toBe(true)
    for (const e of ['revisado', 'falta_roto', 'devuelto']) expect(empleadoPuedeBorrar(e)).toBe(false)
  })
})

describe('path de la foto (aislamiento)', () => {
  it('construye material/<empresa>/<empleado>/<uuid>.<ext>', () => {
    expect(pathMaterial(EMPRESA, EMPLEADO, UUID, 'jpg')).toBe(`material/${EMPRESA}/${EMPLEADO}/${UUID}.jpg`)
  })
  it('no admite ids que no sean uuid ni extensiones raras (no se cuela «../»)', () => {
    expect(() => pathMaterial('../x', EMPLEADO, UUID, 'jpg')).toThrow()
    expect(() => pathMaterial(EMPRESA, EMPLEADO, UUID, 'php')).toThrow()
  })
  it('esPathMaterialDe solo acepta el path de ESA empresa y ESE empleado', () => {
    const p = pathMaterial(EMPRESA, EMPLEADO, UUID, 'png')
    expect(esPathMaterialDe(EMPRESA, EMPLEADO, p)).toBe(true)
    expect(esPathMaterialDe(EMPRESA, OTRO, p)).toBe(false)
    expect(esPathMaterialDe(OTRO, EMPLEADO, p)).toBe(false)
    expect(esPathMaterialDe(EMPRESA, EMPLEADO, `staging/${EMPRESA}/${UUID}.png`)).toBe(false)
    expect(esPathMaterialDe(EMPRESA, EMPLEADO, `${p}/../../otro.png`)).toBe(false)
    expect(esPathMaterialDe(EMPRESA, EMPLEADO, null)).toBe(false)
  })
})

describe('leerFiltrosMaterial', () => {
  it('ignora valores fuera de catálogo y acota la paginación', () => {
    const f = leerFiltrosMaterial(new URLSearchParams({ empleado_id: 'x', tipo: 'coche', estado: 'roto', offset: '-5', limit: '9999' }))
    expect(f).toEqual({ empleado_id: null, tipo: null, estado: null, offset: 0, limit: 100 })
    const g = leerFiltrosMaterial(new URLSearchParams({ empleado_id: EMPLEADO, tipo: 'epi', estado: 'falta_roto', offset: '50' }))
    expect(g).toEqual({ empleado_id: EMPLEADO, tipo: 'epi', estado: 'falta_roto', offset: 50, limit: 50 })
  })
})

describe('decidirSubida (cliente)', () => {
  it('prefiere la comprimida', () => {
    expect(decidirSubida({ type: 'image/heic', size: 6e6 }, { size: 400_000 })).toEqual({ usar: 'comprimida' })
  })
  it('sin compresión sube el original si es admitido y cabe', () => {
    expect(decidirSubida({ type: 'image/heic', size: 2e6 }, null)).toEqual({ usar: 'original' })
  })
  it('sin compresión y demasiado grande o de tipo raro → error', () => {
    expect('error' in decidirSubida({ type: 'image/heic', size: MAX_BYTES_ORIGINAL_CLIENTE + 1 }, null)).toBe(true)
    expect('error' in decidirSubida({ type: 'image/gif', size: 1000 }, null)).toBe(true)
  })
})
