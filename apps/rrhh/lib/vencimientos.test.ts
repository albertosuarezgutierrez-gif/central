import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { contratosQueVencen, diasEntreFechas, estadoFinContrato, hoyMadrid, lineaVencimiento } from './vencimientos'

// `hoy` inyectado y fechas RELATIVAS a él: sin bomba de tiempo (regla del monorepo).
const HOY = '2026-11-07'
const mas = (d: number) => new Date(Date.parse(`${HOY}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10)
const APP = join(__dirname, '..')

describe('contratosQueVencen (≤ 30 días, para el responsable)', () => {
  const c = (id: string, fechaFin: string | null, empleado = id) => ({ contratoId: id, empleadoId: `p-${id}`, empleado, fechaFin })
  it('entran hoy..30 días, del más próximo al más lejano; ni los pasados ni los de 31 ni los NULL («no se sabe»)', () => {
    const r = contratosQueVencen([c('a', mas(20)), c('b', mas(31)), c('c', null), c('d', mas(0)), c('e', mas(-1)), c('f', mas(30))], HOY)
    expect(r.map(x => [x.contratoId, x.dias])).toEqual([['d', 0], ['a', 20], ['f', 30]])
  })
  it('línea en español con dd/mm/aaaa', () => {
    expect(lineaVencimiento({ empleado: 'Ana Núñez', fechaFin: '2026-12-01', dias: 24 })).toBe('Ana Núñez — 01/12/2026 (dentro de 24 días)')
    expect(lineaVencimiento({ empleado: '', fechaFin: '2026-11-08', dias: 1 })).toBe('Empleado sin nombre — 08/11/2026 (mañana)')
  })
})

describe('estadoFinContrato: NULL = «no se sabe», no «indefinido»', () => {
  it('sin fecha de fin y sin duración explícita → no_se_sabe', () => {
    expect(estadoFinContrato({ duracion: null, fechaFin: null }, HOY)).toEqual({ tipo: 'no_se_sabe' })
    expect(estadoFinContrato({ duracion: 'temporal', fechaFin: null }, HOY)).toEqual({ tipo: 'no_se_sabe' })
  })
  it('indefinido solo con duración explícita', () => {
    expect(estadoFinContrato({ duracion: 'indefinido', fechaFin: null }, HOY)).toEqual({ tipo: 'indefinido' })
  })
  it('con fecha → días restantes', () => {
    expect(estadoFinContrato({ duracion: 'temporal', fechaFin: mas(10) }, HOY)).toEqual({ tipo: 'fecha', fechaFin: mas(10), dias: 10 })
  })
})

describe('utilidades', () => {
  it('días entre fechas y fecha de Madrid', () => {
    expect(diasEntreFechas('2026-12-31', '2027-01-01')).toBe(1)
    expect(diasEntreFechas('2026-03-28', '2026-03-30')).toBe(2) // cambio de hora: días naturales, no 47 h
    expect(hoyMadrid(new Date('2026-11-07T23:30:00Z'))).toBe('2026-11-08')
    expect(() => diasEntreFechas('07/11/2026', HOY)).toThrow()
  })
})

// 🚨 Cepo (07/11/2026): el vencimiento de contrato NO se avisa al TRABAJADOR. Un aviso automático en /e («tu contrato termina
// el…») podía leerse como el preaviso del art. 49.1.c ET; es una comunicación que decide y hace la empresa.
describe('el vencimiento de contrato nunca va al empleado', () => {
  function listar(dir: string): string[] {
    const out: string[] = []
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) out.push(...listar(p))
      else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p)
    }
    return out
  }
  it('no hay cron que escriba avisos de vencimiento, ni texto dirigido al trabajador', () => {
    const vercel = JSON.parse(readFileSync(join(APP, 'vercel.json'), 'utf8')) as { crons: { path: string }[] }
    expect(vercel.crons.map(c => c.path)).not.toContain('/api/cron/vencimiento-contratos')
    expect(existsSync(join(APP, 'app/api/cron/vencimiento-contratos'))).toBe(false)
    const fuentes = [...listar(join(APP, 'lib')), ...listar(join(APP, 'app'))]
    const malos = fuentes.filter(f => {
      const s = readFileSync(f, 'utf8')
      return /vencimiento_contrato/.test(s) || /Tu contrato (tiene fecha de fin|termina|vence)/i.test(s)
    })
    expect(malos.map(f => f.slice(APP.length + 1))).toEqual([])
  })
})
