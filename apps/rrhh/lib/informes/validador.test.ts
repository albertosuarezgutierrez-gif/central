import { describe, expect, it } from 'vitest'
import { validarExportacion, validarPeticion } from './validador'

const UUID = '3f1c2b9e-8d7a-4c6b-9e5f-1a2b3c4d5e6f'
const ok = { entidad: 'fichajes', columnas: ['empleado', 'horas'], filtros: { fecha: { desde: '2026-01-01', hasta: '2026-01-31' }, empleado_id: UUID, estado: 'cerrado' }, agrupacion: 'empleado' }

const campos = (r: ReturnType<typeof validarPeticion>) => (r.ok ? [] : r.errores.map(e => e.campo))

describe('validador de informes (lista blanca del catálogo)', () => {
  it('acepta una petición del catálogo y limpia filtros vacíos', () => {
    const r = validarPeticion({ ...ok, filtros: { ...ok.filtros, obra_id: '' } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.peticion.filtros).toEqual(ok.filtros)
  })

  it('rechaza una entidad fuera del catálogo', () => {
    expect(campos(validarPeticion({ ...ok, entidad: 'usuarios_rrhh' }))).toContain('entidad')
  })

  it('rechaza una columna fuera del catálogo (p. ej. intentar leer pin_hash o SQL)', () => {
    expect(campos(validarPeticion({ ...ok, columnas: ['empleado', 'pin_hash'] }))).toContain('columnas.1')
    expect(validarPeticion({ ...ok, columnas: ['horas; DROP TABLE rrhh.fichajes'] }).ok).toBe(false)
  })

  it('rechaza un empresa_id inyectado en la raíz (no lo ignora en silencio)', () => {
    const r = validarPeticion({ ...ok, empresa_id: UUID })
    expect(r.ok).toBe(false)
  })

  it('rechaza un empresa_id inyectado como filtro', () => {
    expect(campos(validarPeticion({ ...ok, filtros: { empresa_id: UUID } }))).toContain('filtros.empresa_id')
  })

  it('rechaza agrupación, opción, uuid y rango no válidos', () => {
    expect(campos(validarPeticion({ ...ok, agrupacion: 'empresa' }))).toContain('agrupacion')
    expect(campos(validarPeticion({ ...ok, filtros: { estado: 'borrado' } }))).toContain('filtros.estado')
    expect(campos(validarPeticion({ ...ok, filtros: { empleado_id: "1' OR '1'='1" } }))).toContain('filtros.empleado_id')
    expect(campos(validarPeticion({ ...ok, filtros: { fecha: { desde: '2026-02-01', hasta: '2026-01-01' } } }))).toContain('filtros.fecha')
    expect(campos(validarPeticion({ ...ok, filtros: { fecha: { desde: '01/02/2026' } } }))).toContain('filtros.fecha')
  })

  it('rechaza un filtro que existe en otra entidad pero no en esta', () => {
    expect(campos(validarPeticion({ ...ok, filtros: { periodo: { desde: '2026-01' } } }))).toContain('filtros.periodo')
  })

  it('exportación: exige formato válido y sigue rechazando empresa_id', () => {
    expect(validarExportacion({ ...ok, formato: 'xlsx' }).ok).toBe(true)
    expect(validarExportacion({ ...ok, formato: 'docx' }).ok).toBe(false)
    expect(validarExportacion({ ...ok, formato: 'pdf', empresa_id: UUID }).ok).toBe(false)
  })

  it('cuerpo vacío o basura', () => {
    expect(validarPeticion(null).ok).toBe(false)
    expect(validarPeticion({ entidad: 'fichajes', columnas: [] }).ok).toBe(false)
  })
})
