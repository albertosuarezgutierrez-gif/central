import { describe, it, expect } from 'vitest'
import { diaMadrid, diasEntre, hitoVencido, tocaRecordatorioHoy } from './recordatorios-firma'

// Fechas RELATIVAS a un `hoy` inyectado (regla del monorepo: nada de reloj real en tests).
const HOY = new Date('2026-10-20T08:00:00Z') // 10:00 en Madrid
const haceDias = (n: number, h = 8) => new Date(Date.UTC(2026, 9, 20 - n, h, 0, 0))

describe('diaMadrid / diasEntre', () => {
  it('usa el día de Madrid, no el UTC', () => {
    // 23:30 UTC del 19/10 ya es 20/10 en Madrid (UTC+2 en octubre antes del cambio de hora)
    expect(diaMadrid(new Date('2026-10-19T23:30:00Z'))).toBe('2026-10-20')
  })
  it('cuenta días de calendario', () => {
    expect(diasEntre(haceDias(3, 21), HOY)).toBe(3)
    expect(diasEntre(HOY, HOY)).toBe(0)
  })
})

describe('hitoVencido', () => {
  it('3, 7 y luego semanal', () => {
    expect(hitoVencido(0)).toBeNull()
    expect(hitoVencido(2)).toBeNull()
    expect(hitoVencido(3)).toBe(3)
    expect(hitoVencido(6)).toBe(3)
    expect(hitoVencido(7)).toBe(7)
    expect(hitoVencido(13)).toBe(7)
    expect(hitoVencido(14)).toBe(14)
    expect(hitoVencido(22)).toBe(21)
  })
})

describe('tocaRecordatorioHoy', () => {
  it('sin fecha de solicitud (no se sabe) nunca reclama', () => {
    expect(tocaRecordatorioHoy({ solicitadaAt: null, ultimoContactoAt: null, hoy: HOY })).toBe(false)
  })
  it('antes del día 3 no toca', () => {
    expect(tocaRecordatorioHoy({ solicitadaAt: haceDias(2), ultimoContactoAt: haceDias(2), hoy: HOY })).toBe(false)
  })
  it('día 3: toca si el último contacto fue la solicitud', () => {
    expect(tocaRecordatorioHoy({ solicitadaAt: haceDias(3), ultimoContactoAt: haceDias(3), hoy: HOY })).toBe(true)
  })
  it('idempotente: ya se recordó hoy → no toca', () => {
    expect(tocaRecordatorioHoy({ solicitadaAt: haceDias(3), ultimoContactoAt: HOY, hoy: HOY })).toBe(false)
  })
  it('días 4-6 tras el recordatorio del día 3: no toca', () => {
    expect(tocaRecordatorioHoy({ solicitadaAt: haceDias(5), ultimoContactoAt: haceDias(2), hoy: HOY })).toBe(false)
  })
  it('día 7: toca aunque hubo recordatorio el día 3', () => {
    expect(tocaRecordatorioHoy({ solicitadaAt: haceDias(7), ultimoContactoAt: haceDias(4), hoy: HOY })).toBe(true)
  })
  it('semanal: día 14 toca, día 15 con contacto el 14 no', () => {
    expect(tocaRecordatorioHoy({ solicitadaAt: haceDias(14), ultimoContactoAt: haceDias(7), hoy: HOY })).toBe(true)
    expect(tocaRecordatorioHoy({ solicitadaAt: haceDias(15), ultimoContactoAt: haceDias(1), hoy: HOY })).toBe(false)
  })
  it('recupera un hito perdido (cron caído el día 7) al día siguiente', () => {
    expect(tocaRecordatorioHoy({ solicitadaAt: haceDias(8), ultimoContactoAt: haceDias(5), hoy: HOY })).toBe(true)
  })
  it('una reclamación manual el mismo día del hito lo cubre', () => {
    expect(tocaRecordatorioHoy({ solicitadaAt: haceDias(7), ultimoContactoAt: HOY, hoy: HOY })).toBe(false)
  })
  it('sin ningún contacto registrado y hito vencido: toca', () => {
    expect(tocaRecordatorioHoy({ solicitadaAt: haceDias(10), ultimoContactoAt: null, hoy: HOY })).toBe(true)
  })
})
