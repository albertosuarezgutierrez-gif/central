import { describe, it, expect } from 'vitest'
import { validarAlta, salarioPropuesto, motivoDuplicado, existentesVacios, registrarClaves, validarAltaRapida, type EntradaAlta } from './alta-empleado'
import type { FilaTablaConvenio } from './convenio-tablas'

const hoy = '2026-11-07'
const tablas: FilaTablaConvenio[] = [
  { convenio: 'Hostelería Sevilla', anio: 2026, categoria: 'Camarero', salarioBaseCent: 135_000, plusConvenioCent: null, pagas: 14 },
  { convenio: 'Hostelería Sevilla', anio: 2025, categoria: 'Camarero', salarioBaseCent: 130_000, plusConvenioCent: null, pagas: 14 },
]
const ctx = { hoy, tablas, convenio: null }
const base: EntradaAlta = { nombre: 'Ana', apellidos: 'García López', email: 'Ana@Ejemplo.es', dni: '12345678z' }
const contrato: EntradaAlta = { tipo_contrato: 'indefinido', fecha_alta: '01/11/2026', grupo_cotizacion: '7', jornada_pct: '100', salario_base: '1.400,50' }

describe('validarAlta', () => {
  it('alta mínima sin contrato: campos vacíos quedan null (no se sabe)', () => {
    const r = validarAlta(base, ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.alta).toMatchObject({ nombre: 'Ana', email: 'ana@ejemplo.es', dni: '12345678Z', nss: null, iban: null, contrato: null, tipo_jornada: null })
  })

  it('con contrato: euros a número exacto, fechas ISO y duración del tipo', () => {
    const r = validarAlta({ ...base, ...contrato, iban: 'ES91 2100 0418 4502 0005 1332', nss: '281234567840' }, ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.alta.contrato).toMatchObject({ salarioBase: 1400.5, grupoCotizacion: 7, tipoContrato: 'indefinido', vigenteDesde: '2026-11-01', duracion: 'indefinido', irpfRetencionPct: 0 })
    expect(r.alta.iban).toBe('ES9121000418450200051332')
    expect(r.alta.tipo_jornada).toBe('Completa')
  })

  it('sin salario toma el de la tabla del convenio del AÑO de la fecha de alta, con aviso', () => {
    const r = validarAlta({ ...base, ...contrato, salario_base: '', categoria: ' camarero ', fecha_alta: '15/03/2025' }, ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.alta.contrato?.salarioBase).toBe(1300)
    expect(r.avisos).toContain('Salario tomado de la tabla del convenio')
  })

  it('sin salario ni tabla: error, nunca 0', () => {
    const r = validarAlta({ ...base, ...contrato, salario_base: '', categoria: 'Cocinero' }, ctx)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errores.map(e => e.campo)).toContain('salario_base')
    expect(validarAlta({ ...base, ...contrato, salario_base: '', categoria: 'Camarero' }, { ...ctx, tablas: null }).ok).toBe(false)
  })

  it('reúne TODOS los errores por campo y no repite datos personales', () => {
    const r = validarAlta({ nombre: '', apellidos: '', email: 'malo', dni: '12345678A', nss: '281234567841', iban: 'ES0000', jornada_pct: '50' }, ctx)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errores.map(e => e.campo).sort()).toEqual(['apellidos', 'dni', 'email', 'iban', 'nombre', 'nss', 'tipo_contrato'].sort())
    for (const e of r.errores) expect(e.mensaje).not.toMatch(/12345678|2812345|ES0000|malo/)
  })

  it('contrato: exige grupo, jornada y fecha; parcial < 100 %; indefinido sin fecha de fin', () => {
    const r = validarAlta({ ...base, tipo_contrato: 'parcial', jornada_pct: '100', salario_base: '900' }, ctx)
    expect(!r.ok && r.errores.map(e => e.campo).sort()).toEqual(['fecha_alta', 'grupo_cotizacion', 'jornada_pct'])
    const ind = validarAlta({ ...base, ...contrato, fecha_fin: '01/12/2026' }, ctx)
    expect(!ind.ok && ind.errores[0].campo).toBe('fecha_fin')
    const parcial = validarAlta({ ...base, ...contrato, tipo_contrato: 'parcial', jornada_pct: '50' }, ctx)
    expect(parcial.ok && parcial.alta.contrato?.duracion).toBeNull() // parcial sin fecha fin: no se sabe
  })

  it('salario anual por error: fuera de rango', () => {
    expect(validarAlta({ ...base, ...contrato, salario_base: '120.000.000' }, ctx).ok).toBe(false)
  })
})

describe('salarioPropuesto', () => {
  it('null si no hay tablas o no casa', () => {
    expect(salarioPropuesto({ ...ctx, tablas: null }, 'Camarero', '2026-01-01')).toBeNull()
    expect(salarioPropuesto(ctx, 'Cocinero', '2026-01-01')).toBeNull()
    expect(salarioPropuesto(ctx, 'Camarero', '2026-01-01')).toBe('1350.00')
  })
})

describe('duplicados por identidad', () => {
  it('choca por DNI, NAF o email con la plantilla y con filas anteriores', () => {
    const ya = existentesVacios()
    registrarClaves(ya, { dni: '12345678Z', nss: '281234567840', email: 'ana@ejemplo.es' })
    expect(motivoDuplicado({ dni: '12345678Z', nss: null, email: 'otra@x.es' }, ya)).toMatch(/DNI/)
    expect(motivoDuplicado({ dni: 'X1234567L', nss: '281234567840', email: 'otra@x.es' }, ya)).toMatch(/afiliación/)
    expect(motivoDuplicado({ dni: 'X1234567L', nss: null, email: 'ANA@ejemplo.es' }, ya)).toMatch(/email/)
    const previos = existentesVacios()
    registrarClaves(previos, { dni: 'X1234567L', nss: null, email: 'b@x.es' })
    expect(motivoDuplicado({ dni: 'X1234567L', nss: null, email: 'c@x.es' }, existentesVacios(), previos)).toMatch(/fichero/)
    expect(motivoDuplicado({ dni: 'Y0000000Z', nss: null, email: 'c@x.es' }, ya, previos)).toBeNull()
  })
})

describe('validarAltaRapida (POST /api/admin/empleados → darDeAltaLote)', () => {
  it('sin DNI: queda null («no se sabe») y no choca con otro empleado sin DNI', () => {
    const r = validarAltaRapida({ nombre: 'Luis', email: 'L@x.es' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.alta).toMatchObject({ dni: null, email: 'l@x.es', contrato: null, apellidos: null })
    const previos = existentesVacios()
    registrarClaves(previos, { dni: null, nss: null, email: 'otro@x.es' })
    expect(previos.dnis.size).toBe(0)
    expect(motivoDuplicado(r.alta, existentesVacios(), previos)).toBeNull()
  })
  it('DNI con letra mala → error sin repetir el valor; nombre/email obligatorios', () => {
    const r = validarAltaRapida({ nombre: 'Luis', email: 'l@x.es', dni: '12345678A' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).not.toContain('12345678')
    expect(validarAltaRapida({ email: 'l@x.es' })).toMatchObject({ ok: false, error: expect.stringMatching(/nombre/) })
    expect(validarAltaRapida({ nombre: 'Luis' })).toMatchObject({ ok: false, error: expect.stringMatching(/email/) })
  })
  it('DNI válido se normaliza y cuenta para duplicados', () => {
    const r = validarAltaRapida({ nombre: 'Luis', email: 'l@x.es', dni: ' 12345678z ' })
    expect(r.ok && r.alta.dni).toBe('12345678Z')
    const ya = existentesVacios(); ya.dnis.add('12345678Z')
    if (r.ok) expect(motivoDuplicado(r.alta, ya)).toMatch(/DNI/)
  })
})
