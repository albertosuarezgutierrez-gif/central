// Formulario canónico de Hogar (14/10/2026): uso/régimen/tipo explícitos, año y m² obligatorios, errores sin valores.
import { describe, it, expect } from 'vitest'
import { fechaDdMmAaaaDeIso, validarFormularioHogar, validarFormularioHogarSinTomador } from './formulario-hogar.ts'

const HOY = new Date('2026-10-14T10:00:00Z')
// DNI SINTÉTICO con letra de control válida (00000000T): no es de nadie.
const base = () => ({
  ramo: 'hogar',
  tomador: { documentoIdentidad: '00000000-t', fechaNacimiento: '1980-01-15' },
  inmueble: { codigoPostal: '41001', municipio: 'SEVILLA', nombreVia: 'PRUEBA', numero: '1', planta: '2', anioConstruccion: 1990, superficieM2: 90 },
  hogar: { uso: 'habitual', regimen: 'propietario', tipoVivienda: 'piso', conMadera: false },
})
const errores = (x: unknown) => {
  const v = validarFormularioHogar(x, HOY)
  return v.ok ? [] : v.errores
}

describe('validarFormularioHogar', () => {
  it('acepta el mínimo y normaliza (documento, opcionales a null)', () => {
    const v = validarFormularioHogar(base(), HOY)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.formulario.tomador.documentoIdentidad).toBe('00000000T')
    expect(v.formulario.inmueble).toMatchObject({ bloque: null, escalera: null, puerta: null, anioReforma: null })
    expect(v.formulario.hogar).toMatchObject({ capitalContinenteEur: null, capitalContenidoEur: null })
  })

  it('uso, régimen y tipo de vivienda: obligatorios y de la lista cerrada (nunca un valor por defecto)', () => {
    for (const campo of ['uso', 'regimen', 'tipoVivienda'] as const) {
      const sin = base()
      delete (sin.hogar as Record<string, unknown>)[campo]
      expect(errores(sin).some((e) => e.startsWith(`hogar.${campo}: obligatorio`))).toBe(true)
      const raro = base()
      ;(raro.hogar as Record<string, unknown>)[campo] = 'MainResidence'
      expect(errores(raro).some((e) => e.startsWith(`hogar.${campo}: no es uno de`))).toBe(true)
    }
  })

  it('conMadera: booleano explícito ("no" ni null valen)', () => {
    for (const malo of [undefined, null, 'no', 0]) {
      const f = base()
      ;(f.hogar as Record<string, unknown>).conMadera = malo
      expect(errores(f)).toContain('hogar.conMadera: obligatorio (true o false, sin valor por defecto)')
    }
  })

  it('año de construcción y m²: obligatorios, enteros y en rango (no se inventan)', () => {
    const f = base()
    delete (f.inmueble as Record<string, unknown>).anioConstruccion
    expect(errores(f)).toContain('inmueble.anioConstruccion: obligatorio')
    expect(errores({ ...base(), inmueble: { ...base().inmueble, superficieM2: '90' } }).some((e) => e.startsWith('inmueble.superficieM2'))).toBe(true)
    expect(errores({ ...base(), inmueble: { ...base().inmueble, anioConstruccion: 2030 } }).some((e) => e.startsWith('inmueble.anioConstruccion'))).toBe(true)
    expect(errores({ ...base(), inmueble: { ...base().inmueble, anioReforma: 1980 } })).toContain('inmueble.anioReforma: anterior al año de construcción')
  })

  it('CP, vía y número obligatorios; CP español de 5 dígitos', () => {
    expect(errores({ ...base(), inmueble: { ...base().inmueble, codigoPostal: '99001' } })).toContain('inmueble.codigoPostal: no es un código postal español de 5 dígitos')
    expect(errores({ ...base(), inmueble: { ...base().inmueble, nombreVia: ' ' } })).toContain('inmueble.nombreVia: obligatorio')
    expect(errores({ ...base(), inmueble: { ...base().inmueble, numero: null } })).toContain('inmueble.numero: obligatorio')
  })

  it('tomador: DNI/NIE con letra válida y mayor de edad; los errores NO llevan el valor', () => {
    const doc = '12345678A' // letra incorrecta a propósito
    const e1 = errores({ ...base(), tomador: { documentoIdentidad: doc, fechaNacimiento: '1980-01-15' } })
    expect(e1).toContain('tomador.documentoIdentidad: no es un DNI/NIE válido')
    expect(e1.join(' ')).not.toContain(doc)
    const e2 = errores({ ...base(), tomador: { documentoIdentidad: '00000000T', fechaNacimiento: '2015-01-01' } })
    expect(e2.some((e) => e.startsWith('tomador.fechaNacimiento'))).toBe(true)
    expect(e2.join(' ')).not.toContain('2015')
    expect(errores({ ...base(), tomador: { documentoIdentidad: '00000000T', fechaNacimiento: '15/01/1980' } })).toContain('tomador.fechaNacimiento: no es una fecha AAAA-MM-DD')
  })

  it('ramo distinto u objeto no válido → error', () => {
    expect(errores({ ...base(), ramo: 'comunidades' })).toContain('ramo: tiene que ser «hogar»')
    expect(validarFormularioHogar(null, HOY).ok).toBe(false)
    expect(validarFormularioHogar([], HOY).ok).toBe(false)
  })

  it('capitales: importe positivo en número; null = no consta', () => {
    const v = validarFormularioHogar({ ...base(), hogar: { ...base().hogar, capitalContinenteEur: 120000.456 } }, HOY)
    expect(v.ok && v.formulario.hogar.capitalContinenteEur).toBe(120000.46)
    expect(errores({ ...base(), hogar: { ...base().hogar, capitalContenidoEur: 0 } }).some((e) => e.startsWith('hogar.capitalContenidoEur'))).toBe(true)
  })
})

describe('fechaDdMmAaaaDeIso', () => {
  it('ISO real → dd/mm/aaaa; otra cosa → null', () => {
    expect(fechaDdMmAaaaDeIso('1980-01-15')).toBe('15/01/1980')
    expect(fechaDdMmAaaaDeIso('1980-02-31')).toBeNull()
    expect(fechaDdMmAaaaDeIso('15/01/1980')).toBeNull()
  })
})

// 19/10/2026: el DNI y el nacimiento del tomador no cruzan el puerto; asegura los pone desde la ficha al entregar el trabajo.
describe('validarFormularioHogarSinTomador', () => {
  it('acepta el formulario SIN tomador y no devuelve ninguno (aunque venga uno: se descarta, no se guarda)', () => {
    const { tomador: _t, ...sin } = base()
    const v = validarFormularioHogarSinTomador(sin, HOY)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect('tomador' in v.formulario).toBe(false)
    expect(v.formulario.hogar.conMadera).toBe(false)
    const conTomador = validarFormularioHogarSinTomador(base(), HOY)
    expect(conTomador.ok && 'tomador' in conTomador.formulario).toBe(false)
    // Un tomador roto no hace fallar: ni se mira ni se nombra.
    const roto = validarFormularioHogarSinTomador({ ...sin, tomador: { documentoIdentidad: 'x' } }, HOY)
    expect(roto.ok).toBe(true)
  })

  it('lo demás se exige igual: uso, régimen, tipo, madera, año y m² (los errores no nombran al tomador)', () => {
    const { tomador: _t, ...sin } = base()
    for (const campo of ['uso', 'regimen', 'tipoVivienda', 'conMadera']) {
      const malo = structuredClone(sin)
      delete (malo.hogar as Record<string, unknown>)[campo]
      const v = validarFormularioHogarSinTomador(malo, HOY)
      expect(v.ok, campo).toBe(false)
      if (!v.ok) expect(v.errores.some((e) => e.startsWith(`hogar.${campo}`)), campo).toBe(true)
    }
    for (const campo of ['anioConstruccion', 'superficieM2']) {
      const malo = structuredClone(sin)
      delete (malo.inmueble as Record<string, unknown>)[campo]
      const v = validarFormularioHogarSinTomador(malo, HOY)
      expect(v.ok, campo).toBe(false)
      if (!v.ok) expect(v.errores.every((e) => !e.startsWith('tomador')), campo).toBe(true)
    }
  })

  it('el validador completo sigue exigiendo el tomador', () => {
    const { tomador: _t, ...sin } = base()
    expect(errores(sin).some((e) => e.startsWith('tomador: obligatorio'))).toBe(true)
  })
})
