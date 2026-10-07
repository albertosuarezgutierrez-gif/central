import { describe, expect, it } from 'vitest'
import { esCif, esDniNie, normalizarTelefono, validarTomador } from './tomador.ts'
import { validarFormularioComercio } from './formulario-comercio.ts'

const HOY = new Date('2026-10-08T00:00:00Z')
// Documentos SINTÉTICOS con la letra/control correctos (no son de personas reales).
const fisica = () => ({ tipo: 'fisica', nombre: 'Ana', apellido1: 'Prueba', apellido2: 'Ficticia', documentoIdentidad: '12345678Z', fechaNacimiento: '1980-05-17' })
const juridica = () => ({ tipo: 'juridica', razonSocial: 'Ejemplo Sintético SL', documentoIdentidad: 'B12345674' })

describe('documentos', () => {
  it('DNI/NIE con letra correcta', () => {
    expect(esDniNie('12345678Z')).toBe(true)
    expect(esDniNie('12.345.678-z')).toBe(true)
    expect(esDniNie('12345678A')).toBe(false)
    expect(esDniNie('X1234567L')).toBe(true)
    expect(esDniNie('X1234567A')).toBe(false)
  })
  it('CIF con control correcto', () => {
    expect(esCif('B12345674')).toBe(true)
    expect(esCif('B12345675')).toBe(false)
    expect(esCif('12345678Z')).toBe(false)
  })
  it('teléfono español', () => {
    expect(normalizarTelefono('+34 600 11 22 33')).toBe('600112233')
    expect(normalizarTelefono('12345')).toBeNull()
  })
})

describe('validarTomador', () => {
  it('física válida', () => {
    const v = validarTomador(fisica(), HOY)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.tomador).toMatchObject({ tipo: 'fisica', razonSocial: null, telefono: null, email: null, codigoPostal: null })
  })
  it('jurídica válida, con opcionales normalizados', () => {
    const v = validarTomador({ ...juridica(), codigoPostal: '41003', telefono: '600 112 233', email: 'Info@Ejemplo.test' }, HOY)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.tomador).toMatchObject({ nombre: null, fechaNacimiento: null, telefono: '600112233', email: 'info@ejemplo.test', codigoPostal: '41003' })
  })
  it('física: faltan nombre, apellido y fecha', () => {
    const v = validarTomador({ tipo: 'fisica', documentoIdentidad: '12345678Z' }, HOY)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.errores.join('|')).toMatch(/nombre.*obligatorio[\s\S]*apellido1[\s\S]*fechaNacimiento/)
  })
  it('física: documento con letra mala, razón social y menor de edad', () => {
    expect(validarTomador({ ...fisica(), documentoIdentidad: '12345678A' }, HOY).ok).toBe(false)
    expect(validarTomador({ ...fisica(), razonSocial: 'X' }, HOY).ok).toBe(false)
    expect(validarTomador({ ...fisica(), fechaNacimiento: '2015-01-01' }, HOY).ok).toBe(false)
    expect(validarTomador({ ...fisica(), fechaNacimiento: '1980-02-31' }, HOY).ok).toBe(false)
  })
  it('jurídica: sin fecha de nacimiento ni nombre; CIF válido', () => {
    expect(validarTomador({ ...juridica(), fechaNacimiento: '1980-05-17' }, HOY).ok).toBe(false)
    expect(validarTomador({ ...juridica(), nombre: 'Ana' }, HOY).ok).toBe(false)
    expect(validarTomador({ ...juridica(), documentoIdentidad: '12345678Z' }, HOY).ok).toBe(false)
    expect(validarTomador({ tipo: 'juridica', documentoIdentidad: 'B12345674' }, HOY).ok).toBe(false)
  })
  it('tipo ausente/ajeno, objeto inválido, CP, teléfono y email malos', () => {
    expect(validarTomador({ ...fisica(), tipo: undefined }, HOY).ok).toBe(false)
    expect(validarTomador({ ...fisica(), tipo: 'otra' }, HOY).ok).toBe(false)
    expect(validarTomador(null, HOY).ok).toBe(false)
    expect(validarTomador({ ...fisica(), codigoPostal: '99999' }, HOY).ok).toBe(false)
    expect(validarTomador({ ...fisica(), telefono: '123' }, HOY).ok).toBe(false)
    expect(validarTomador({ ...fisica(), email: 'no-es-correo' }, HOY).ok).toBe(false)
  })
})

describe('integración en el formulario de comercio (opcional, sin romper callers)', () => {
  const base = { cnae: '4711', regimen: 'alquiler', codigoPostal: '41003', superficieM2: 80, capitalContenidoEur: 20000, numEmpleados: 2 }
  it('sin tomador sigue siendo válido (tomador null)', () => {
    const v = validarFormularioComercio(base)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.formulario.tomador).toBeNull()
  })
  it('con tomador válido lo incluye; con tomador malo, error prefijado', () => {
    const ok = validarFormularioComercio({ ...base, tomador: fisica() }, HOY)
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.formulario.tomador?.documentoIdentidad).toBe('12345678Z')
    const mal = validarFormularioComercio({ ...base, tomador: { ...fisica(), documentoIdentidad: 'x' } }, HOY)
    expect(mal.ok).toBe(false)
    if (!mal.ok) expect(mal.errores[0]).toMatch(/^tomador\./)
  })
})
