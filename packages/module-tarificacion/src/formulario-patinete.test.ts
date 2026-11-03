// Cepo de `validarFormularioPatinete` (03/11/2026). Datos SINTÉTICOS (DNI de prueba 00000000T).
import { describe, it, expect } from 'vitest'
import { validarFormularioPatinete } from './formulario-patinete.ts'

const HOY = new Date('2026-11-03T10:00:00Z')
const base = () => ({
  ramo: 'patinete',
  vmp: { marca: 'MARCA', modelo: 'MODELO 1', usoProfesional: false, homologado: true, velocidadLimitada25: true } as Record<string, unknown>,
  codigoPostal: '41001',
  poblacion: 'SEVILLA',
  conductor: { fechaNacimiento: '1985-03-10' },
  tomador: { documentoIdentidad: '0000-0000-t' },
})
const con = (cambio: (o: ReturnType<typeof base> & Record<string, unknown>) => void) => {
  const o = base() as ReturnType<typeof base> & Record<string, unknown>
  cambio(o)
  return validarFormularioPatinete(o, HOY)
}

describe('validarFormularioPatinete', () => {
  it('riesgo completo → formulario con el documento normalizado', () => {
    const v = validarFormularioPatinete(base(), HOY)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.formulario.tomador.documentoIdentidad).toBe('00000000T')
      expect(v.formulario.efecto).toBeNull()
    }
  })
  it('uso profesional, no homologado y velocidad no confirmada NO se tarifican solos', () => {
    for (const [campo, valor] of [['usoProfesional', true], ['homologado', false], ['velocidadLimitada25', false]] as const) {
      const v = con((o) => { o.vmp[campo] = valor })
      expect(v.ok, campo).toBe(false)
      if (!v.ok) expect(v.errores.join(' ')).toContain(`vmp.${campo}`)
    }
  })
  it('las tres declaraciones son explícitas: ausentes o en texto = error (sin valor por defecto)', () => {
    for (const campo of ['usoProfesional', 'homologado', 'velocidadLimitada25']) {
      expect(con((o) => { delete o.vmp[campo] }).ok, `${campo} ausente`).toBe(false)
      expect(con((o) => { o.vmp[campo] = 'Sí' }).ok, `${campo} texto`).toBe(false)
    }
  })
  it('CP, nacimiento, documento y efecto se validan; los errores nombran el campo y nunca el valor', () => {
    expect(con((o) => { o.codigoPostal = '99999' }).ok).toBe(false)
    expect(con((o) => { o.conductor.fechaNacimiento = '2015-01-01' }).ok).toBe(false)
    const mal = con((o) => { o.tomador.documentoIdentidad = '12345678Z-MAL' })
    expect(mal.ok).toBe(false)
    if (!mal.ok) expect(mal.errores.join(' ')).not.toContain('12345678')
    expect(con((o) => { o.efecto = '2026-02-30' }).ok).toBe(false)
    expect(validarFormularioPatinete({ ...base(), efecto: '2026-11-04' }, HOY).ok).toBe(true)
  })
  it('otro ramo o un no-objeto no pasan', () => {
    expect(validarFormularioPatinete({ ...base(), ramo: 'moto' }, HOY).ok).toBe(false)
    expect(validarFormularioPatinete(null, HOY).ok).toBe(false)
  })
})
