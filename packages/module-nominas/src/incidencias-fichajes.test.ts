/**
 * N2 + guardián `regression-fichajes-nomina` (parte pura): solo fichajes APROBADOS, del MISMO empresa_id/empleado, de un MES CERRADO.
 * Madrid en marzo de 2026 (antes del cambio de hora del día 29) = UTC+1: las horas locales de abajo llevan «+01:00».
 */
import { describe, it, expect } from 'vitest'
import {
  incidenciasDesdeFichajes, parseConvenioHorario, diasPrevistosDelMes, MesNoCerradoError, FichajeAjenoError,
  type ConvenioHorario, type ContratoHorario, type FichajeNomina, type OpcionesFichajes,
} from './incidencias-fichajes'

const E = 'e0000000-0000-4000-8000-000000000001'
const EMP = 'a0000000-0000-4000-8000-000000000001'
const contrato: ContratoHorario = { empresaId: E, empleadoId: EMP, tipoContrato: 'indefinido', jornadaPct: 100 }
const convenio: ConvenioHorario = { horasDiariasOrdinarias: 8, horaEntradaPrevista: null, toleranciaRetrasoMin: 0, festivos: [], compensacionExtras: 'pago', topeExtraAnual: null, diasSemana: null }
const opts: OpcionesFichajes = { periodo: '2026-03', hoy: '2026-04-02', diasPrevistos: null, horasExtraAnioPrevias: 0 }
let n = 0
const fich = (dia: string, desde: string, hasta: string, p: Partial<FichajeNomina> = {}): FichajeNomina => {
  const finDia = Number(hasta.slice(0, 2)) <= Number(desde.slice(0, 2)) ? `2026-03-${String(Number(dia) + 1).padStart(2, '0')}` : `2026-03-${dia}`
  return { id: `f${++n}`, empresaId: E, empleadoId: EMP, entradaAt: `2026-03-${dia}T${desde}:00+01:00`, salidaAt: `${finDia}T${hasta}:00+01:00`, aprobado: true, ...p }
}

describe('horas extra desde fichajes', () => {
  it('diurnas: 08-18 con jornada de 8 h = 2 h extra, imputadas al final del turno', () => {
    const f = fich('10', '08:00', '18:00')
    const r = incidenciasDesdeFichajes([f], contrato, convenio, opts)
    expect(r.propuestas).toHaveLength(1)
    expect(r.propuestas[0]).toMatchObject({ tipo: 'horas_extra', subtipo: 'diurna', horas: 2, fichajeIds: [f.id], clave: 'fichajes:2026-03-10:diurna' })
    expect(r.propuestas[0].incidencia).toEqual({ tipo: 'horas_extra', concepto: 'Horas extra diurnas 10/03 (fichajes)', horas: 2 })
    expect(r.horasExtraPagoMes).toBe(2)
  })
  it('nocturnas: 14-00 (10 h) → las 2 h de después de las 22:00 son nocturnas', () => {
    const r = incidenciasDesdeFichajes([fich('10', '14:00', '00:00')], contrato, convenio, opts)
    expect(r.propuestas.map(p => [p.subtipo, p.horas])).toEqual([['nocturna', 2]])
  })
  it('mixto: 15:00-01:00 con 8 h → exceso de 2 h = 23:00-01:00, todo nocturno; 12:00-22:30 → 2,5 h: 0,5 nocturna y 2 diurnas', () => {
    expect(incidenciasDesdeFichajes([fich('10', '15:00', '01:00')], contrato, convenio, opts).propuestas.map(p => [p.subtipo, p.horas])).toEqual([['nocturna', 2]])
    const r = incidenciasDesdeFichajes([fich('11', '12:00', '22:30')], contrato, convenio, opts)
    expect(r.propuestas.map(p => [p.subtipo, p.horas]).sort()).toEqual([['diurna', 2], ['nocturna', 0.5]])
  })
  it('festivas: el día festivo del convenio manda sobre diurna/nocturna', () => {
    const r = incidenciasDesdeFichajes([fich('12', '08:00', '18:00')], contrato, { ...convenio, festivos: ['2026-03-12'] }, opts)
    expect(r.propuestas.map(p => [p.subtipo, p.horas])).toEqual([['festiva', 2]])
  })
  it('varios fichajes el mismo día suman; jornada exacta = sin extras', () => {
    const r = incidenciasDesdeFichajes([fich('10', '08:00', '12:00'), fich('10', '13:00', '18:00')], contrato, convenio, opts)
    expect(r.propuestas[0].horas).toBe(1)
    expect(r.propuestas[0].fichajeIds).toHaveLength(1) // solo el turno de tarde contiene las horas de más
    expect(incidenciasDesdeFichajes([fich('10', '08:00', '16:00')], contrato, convenio, opts).propuestas).toEqual([])
  })
  it('compensadas por descanso: se proponen como tales, no entran en la nómina y NO cuentan para el tope', () => {
    const r = incidenciasDesdeFichajes([fich('10', '08:00', '18:00')], contrato, { ...convenio, compensacionExtras: 'descanso' }, { ...opts, horasExtraAnioPrevias: 79 })
    expect(r.propuestas[0]).toMatchObject({ tipo: 'horas_extra_compensada', horas: 2, incidencia: null, superaTope: false })
    expect(r.horasExtraPagoMes).toBe(0)
    expect(r.horasExtraCompensadasMes).toBe(2)
    expect(r.superaTope).toBe(false)
  })
  it('convenio sin jornada diaria = no se sabe: NO se propone ninguna extra', () => {
    const r = incidenciasDesdeFichajes([fich('10', '08:00', '20:00')], contrato, { ...convenio, horasDiariasOrdinarias: null }, opts)
    expect(r.propuestas).toEqual([])
    expect(r.avisos.join(' ')).toMatch(/no indica la jornada diaria/)
  })
  it('contrato a tiempo parcial: lo que excede son horas complementarias, solo aviso', () => {
    const r = incidenciasDesdeFichajes([fich('10', '08:00', '14:00')], { ...contrato, tipoContrato: 'parcial', jornadaPct: 50 }, convenio, opts)
    expect(r.propuestas).toEqual([])
    expect(r.avisos.join(' ')).toMatch(/complementarias/)
  })
})

describe('tope anual de 80 h (art. 35.2 ET)', () => {
  it('supera el tope: marca la propuesta y avisa', () => {
    const r = incidenciasDesdeFichajes([fich('10', '08:00', '18:00')], contrato, convenio, { ...opts, horasExtraAnioPrevias: 79 })
    expect(r.horasExtraAnio).toBe(81)
    expect(r.superaTope).toBe(true)
    expect(r.propuestas[0].superaTope).toBe(true)
    expect(r.avisos.join(' ')).toMatch(/tope anual de 80 h/)
  })
  it('justo en el tope no avisa; el convenio nunca puede subirlo por encima de 80', () => {
    expect(incidenciasDesdeFichajes([fich('10', '08:00', '18:00')], contrato, convenio, { ...opts, horasExtraAnioPrevias: 78 }).superaTope).toBe(false)
    expect(incidenciasDesdeFichajes([], contrato, { ...convenio, topeExtraAnual: 200 }, opts).topeAnual).toBe(80)
    expect(incidenciasDesdeFichajes([], contrato, { ...convenio, topeExtraAnual: 40 }, opts).topeAnual).toBe(40)
  })
  it('acumulado previo desconocido (null) = «no comprobado», nunca 0', () => {
    const r = incidenciasDesdeFichajes([fich('10', '08:00', '18:00')], contrato, convenio, { ...opts, horasExtraAnioPrevias: null })
    expect(r.superaTope).toBeNull()
    expect(r.horasExtraAnio).toBeNull()
    expect(r.avisos.join(' ')).toMatch(/NO está verificado/)
  })
})

describe('GUARDIÁN regression-fichajes-nomina (parte pura)', () => {
  it('solo fichajes APROBADOS: un fichaje sin aprobar no genera propuesta y se avisa', () => {
    const r = incidenciasDesdeFichajes([fich('10', '08:00', '18:00', { aprobado: false })], contrato, convenio, opts)
    expect(r.propuestas).toEqual([])
    expect(r.fichajesSinAprobar).toBe(1)
    expect(r.avisos.join(' ')).toMatch(/sin aprobar/)
  })
  it('mismo empresa_id: un fichaje de otra empresa (o de otro empleado) ABORTA, no se descarta en silencio', () => {
    expect(() => incidenciasDesdeFichajes([fich('10', '08:00', '18:00', { empresaId: 'e9999999-0000-4000-8000-000000000009' })], contrato, convenio, opts)).toThrow(FichajeAjenoError)
    expect(() => incidenciasDesdeFichajes([fich('10', '08:00', '18:00', { empleadoId: 'a9999999-0000-4000-8000-000000000009' })], contrato, convenio, opts)).toThrow(FichajeAjenoError)
  })
  it('mes cerrado: el mes en curso (y el futuro) lanza; el anterior vale', () => {
    expect(() => incidenciasDesdeFichajes([], contrato, convenio, { ...opts, hoy: '2026-03-31' })).toThrow(MesNoCerradoError)
    expect(() => incidenciasDesdeFichajes([], contrato, convenio, { ...opts, periodo: '2026-05' })).toThrow(MesNoCerradoError)
    expect(() => incidenciasDesdeFichajes([], contrato, convenio, { ...opts, hoy: '2026-04-01' })).not.toThrow()
  })
  it('fichajes abiertos y de otro mes no se computan; la clave es estable', () => {
    const abierto = fich('10', '08:00', '18:00', { salidaAt: null })
    const otroMes = { ...fich('10', '08:00', '18:00'), entradaAt: '2026-02-10T08:00:00+01:00', salidaAt: '2026-02-10T18:00:00+01:00' }
    const r = incidenciasDesdeFichajes([abierto, otroMes], contrato, convenio, opts)
    expect(r.propuestas).toEqual([])
    expect(r.fichajesAbiertos).toBe(1)
    const a = incidenciasDesdeFichajes([fich('10', '08:00', '18:00')], contrato, convenio, opts).propuestas[0].clave
    const b = incidenciasDesdeFichajes([fich('10', '08:00', '18:00')], contrato, convenio, opts).propuestas[0].clave
    expect(a).toBe(b)
  })
})

describe('ausencias y retrasos', () => {
  it('ausencia = día previsto sin fichaje y sin justificar; con fichaje sin aprobar no se propone', () => {
    const r = incidenciasDesdeFichajes([fich('10', '08:00', '16:00'), fich('12', '08:00', '16:00', { aprobado: false })], contrato, convenio,
      { ...opts, diasPrevistos: ['2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13'], diasJustificados: ['2026-03-13'] })
    expect(r.propuestas.filter(p => p.tipo === 'ausencia').map(p => p.fecha)).toEqual(['2026-03-11'])
    expect(r.propuestas[0].incidencia).toMatchObject({ tipo: 'ausencia_injustificada', dias: 1 })
  })
  it('sin calendario previsto no se inventan ausencias', () => {
    const r = incidenciasDesdeFichajes([], contrato, convenio, opts)
    expect(r.propuestas).toEqual([])
    expect(r.avisos.join(' ')).toMatch(/Sin calendario/)
  })
  it('retraso: sobre la tolerancia, informativo (no entra en la nómina)', () => {
    const r = incidenciasDesdeFichajes([fich('10', '08:20', '16:20'), fich('11', '08:05', '16:05')], contrato, { ...convenio, horaEntradaPrevista: '08:00', toleranciaRetrasoMin: 10 }, opts)
    expect(r.propuestas).toHaveLength(1)
    expect(r.propuestas[0]).toMatchObject({ tipo: 'retraso', minutos: 20, incidencia: null })
  })
})

describe('parseConvenioHorario', () => {
  it('lee solo la estructura explícita; todo lo demás es null/vacío', () => {
    expect(parseConvenioHorario(null)).toEqual({ horasDiariasOrdinarias: null, horaEntradaPrevista: null, toleranciaRetrasoMin: 0, festivos: [], compensacionExtras: null, topeExtraAnual: null, diasSemana: null })
    expect(parseConvenioHorario({ jornada: '40 horas semanales' }).horasDiariasOrdinarias).toBeNull()
    const c = parseConvenioHorario({ horario: { horas_diarias: 8, hora_entrada: '08:00', tolerancia_retraso_min: 5, festivos: ['2026-03-19', 'x'], compensacion_extras: 'descanso', tope_extra_anual: 60, dias_semana: [5, 1, 1, 2] } })
    expect(c).toEqual({ horasDiariasOrdinarias: 8, horaEntradaPrevista: '08:00', toleranciaRetrasoMin: 5, festivos: ['2026-03-19'], compensacionExtras: 'descanso', topeExtraAnual: 60, diasSemana: [1, 2, 5] })
    expect(parseConvenioHorario({ horario: { horas_diarias: 30, hora_entrada: '25:00', compensacion_extras: 'otro' } })).toMatchObject({ horasDiariasOrdinarias: null, horaEntradaPrevista: null, compensacionExtras: null })
  })
})

describe('diasPrevistosDelMes', () => {
  it('lunes a viernes de marzo de 2026 menos festivos; sin diasSemana = null (no se sabe)', () => {
    const d = diasPrevistosDelMes('2026-03', { diasSemana: [1, 2, 3, 4, 5], festivos: ['2026-03-19'] })!
    expect(d).toHaveLength(21)
    expect(d).not.toContain('2026-03-19')
    expect(d).not.toContain('2026-03-07') // sábado
    expect(diasPrevistosDelMes('2026-03', { diasSemana: null, festivos: [] })).toBeNull()
  })
})
