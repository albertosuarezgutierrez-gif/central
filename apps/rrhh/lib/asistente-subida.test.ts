import { describe, it, expect } from 'vitest'
import {
  nifValido, detectarNifs, parsearRespuestaIA, emparejarDestinatarios, carpetaSugerida,
  promptAnalisis, PROPUESTA_VACIA, type EmpleadoMatch,
} from './asistente-subida'

describe('NIF/NIE', () => {
  it('valida la letra de control', () => {
    expect(nifValido('12345678Z')).toBe(true)
    expect(nifValido('12.345.678-z')).toBe(true)
    expect(nifValido('12345678A')).toBe(false)
    expect(nifValido('X1234567L')).toBe(true)
    expect(nifValido('B12345678')).toBe(false) // CIF de empresa, no persona
  })
  it('detecta NIF válidos en el texto e ignora los de letra falsa', () => {
    const t = 'Trabajador: Juan, DNI 12.345.678-Z. Otro 12345678A. NIE X1234567L. CIF B12345678'
    expect(detectarNifs(t).sort()).toEqual(['12345678Z', 'X1234567L'])
  })
})

describe('parsearRespuestaIA', () => {
  it('respuesta vacía o sin JSON → todo null y ia_ok=false', () => {
    expect(parsearRespuestaIA(null)).toEqual(PROPUESTA_VACIA)
    expect(parsearRespuestaIA('No sé qué es esto')).toEqual(PROPUESTA_VACIA)
    expect(parsearRespuestaIA('{roto')).toEqual(PROPUESTA_VACIA)
  })
  it('acepta JSON con fence y prosa alrededor', () => {
    const r = parsearRespuestaIA('Aquí tienes:\n```json\n{"categoria":"Contrato","titulo":"Contrato indefinido","requiere_firma":true,"resumen":"Tu contrato.","personas":[{"nombre":"Juan Pérez","nif":"12345678Z"}]}\n```')
    expect(r.ia_ok).toBe(true)
    expect(r.categoria).toBe('contrato')
    expect(r.titulo).toBe('Contrato indefinido')
    expect(r.requiere_firma).toBe(true)
    expect(r.personas).toEqual([{ nombre: 'Juan Pérez', nif: '12345678Z' }])
  })
  it('categoría fuera de catálogo, requiere_firma no booleano y textos basura → null', () => {
    const r = parsearRespuestaIA('{"categoria":"finiquito","titulo":"  ","requiere_firma":"sí","resumen":"N/A","personas":"x"}')
    expect(r).toEqual({ categoria: null, titulo: null, requiere_firma: null, resumen: null, personas: [], ia_ok: true })
  })
  it('NIF con letra inválida se descarta (no se inventa identidad)', () => {
    const r = parsearRespuestaIA('{"personas":[{"nombre":null,"nif":"12345678A"},{"nombre":"Ana","nif":null}]}')
    expect(r.personas).toEqual([{ nombre: 'Ana', nif: null }])
  })
  it('recorta textos largos', () => {
    const r = parsearRespuestaIA(JSON.stringify({ titulo: 'x'.repeat(500) }))
    expect(r.titulo!.length).toBe(120)
  })
})

describe('carpetaSugerida', () => {
  it('mapea categoría a carpeta y null a null', () => {
    expect(carpetaSugerida('nomina')).toBe('nominas')
    expect(carpetaSugerida('prl_formacion')).toBe('prevencion_riesgos')
    expect(carpetaSugerida(null)).toBeNull()
  })
})

describe('promptAnalisis', () => {
  it('no manda datos de la plantilla, solo el texto (recortado)', () => {
    const p = promptAnalisis('a'.repeat(10_000))
    expect(p.user.length).toBeLessThan(6100)
    expect(p.system).toContain('null')
  })
})

describe('emparejarDestinatarios (identidad: NIF > nombre, nunca fundir)', () => {
  const E: EmpleadoMatch[] = [
    { id: 'e1', nombre: 'Juan', apellidos: 'Pérez García', dni: '12345678Z' },
    { id: 'e2', nombre: 'Ana', apellidos: 'López', dni: '87654321X' },
    { id: 'e3', nombre: 'María', apellidos: 'Ruiz', dni: null },
    { id: 'e4', nombre: 'María', apellidos: 'Ruiz', dni: null }, // homónima
    { id: 'e5', nombre: 'Luis', apellidos: null, dni: null },     // nombre de una palabra: nunca por nombre
  ]

  it('empareja por NIF del texto', () => {
    const r = emparejarDestinatarios('Trabajador con DNI 87654321-X', [], E)
    expect(r.destinatarios).toEqual([{ empleado_id: 'e2', motivo: 'nif' }])
  })
  it('empareja por nombre completo presente en el texto, también «Apellidos, Nombre»', () => {
    expect(emparejarDestinatarios('D. Juan Pérez García, con domicilio…', [], E).destinatarios)
      .toEqual([{ empleado_id: 'e1', motivo: 'nombre' }])
    expect(emparejarDestinatarios('PÉREZ GARCÍA, JUAN', [], E).destinatarios)
      .toEqual([{ empleado_id: 'e1', motivo: 'nombre' }])
  })
  it('NIF y nombre del mismo empleado → una sola entrada (por NIF)', () => {
    const r = emparejarDestinatarios('Juan Pérez García DNI 12345678Z', [{ nombre: 'Juan Pérez García', nif: '12345678Z' }], E)
    expect(r.destinatarios).toEqual([{ empleado_id: 'e1', motivo: 'nif' }])
  })
  it('homónimos → ambiguo, no se asigna a ninguno', () => {
    const r = emparejarDestinatarios('Doña María Ruiz', [], E)
    expect(r.destinatarios).toEqual([])
    expect(r.sin_emparejar[0].motivo).toBe('ambiguo')
  })
  it('nombre de una sola palabra nunca empareja', () => {
    expect(emparejarDestinatarios('Luis firma aquí', [], E).destinatarios).toEqual([])
  })
  it('la IA nombra a alguien que no está en el texto → no se asigna', () => {
    const r = emparejarDestinatarios('Documento sin nombres', [{ nombre: 'Ana López', nif: '87654321X' }], E)
    expect(r.destinatarios).toEqual([])
  })
  it('mismo nombre pero NIF distinto al de la ficha → dos identidades, no se funden', () => {
    // Otra «Ana López» con NIF 00000000T, que no es la de la ficha (87654321X)
    const r = emparejarDestinatarios('Ana López, DNI 00000000T', [{ nombre: 'Ana López', nif: '00000000T' }], E)
    expect(r.destinatarios).toEqual([])
    expect(r.sin_emparejar.map(s => s.motivo)).toContain('ambiguo')
  })
  it('un NIF compartido por dos fichas (dato sucio) → ambiguo', () => {
    const sucio = [...E, { id: 'e9', nombre: 'Pepe', apellidos: 'Gil', dni: '12345678Z' }]
    const r = emparejarDestinatarios('DNI 12345678Z', [], sucio)
    expect(r.destinatarios).toEqual([])
    expect(r.sin_emparejar).toEqual([{ nombre: null, nif: '12345678Z', motivo: 'ambiguo' }])
  })
  it('varios destinatarios distintos en el mismo documento', () => {
    const r = emparejarDestinatarios('12345678Z y 87654321X', [], E)
    expect(r.destinatarios.map(d => d.empleado_id).sort()).toEqual(['e1', 'e2'])
  })
  it('persona que da la IA y no está en la plantilla → sin_emparejar', () => {
    const r = emparejarDestinatarios('Pedro Sánchez Mora', [{ nombre: 'Pedro Sánchez Mora', nif: null }], E)
    expect(r.sin_emparejar).toEqual([{ nombre: 'Pedro Sánchez Mora', nif: null, motivo: 'no_en_plantilla' }])
  })
})
