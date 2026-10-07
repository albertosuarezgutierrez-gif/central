// Recomendador explicable (08/10/2026): datos inventados.
import { describe, it, expect } from 'vitest'
import { compararOfertas, pesosParaPerfil, recomendar, type CondicionGarantia, type FichaComparable, type OfertaComparable, type TablaComparador } from './index.ts'

const G = (p: Partial<CondicionGarantia>): CondicionGarantia => ({ literal: null, estado: null, limite: null, sublimites: null, franquicia: null, notas: null, cita: null, pagina: null, origen: 'ia', ...p })
const ficha = (compania: string, garantias: Record<string, CondicionGarantia>, estado: 'validada' | 'pendiente' = 'validada'): FichaComparable =>
  ({ id: `f-${compania}`, compania, ramo: 'comunidades', producto: 'Comunidades', version: null, estado, condiciones: { garantias, extras: [] } })
const oferta = (id: string, compania: string, prima: number | null, capitales: Record<string, number> = {}): OfertaComparable => ({
  id, compania, ramo: 'comunidades', producto: 'Comunidades', version: null,
  presupuesto: {
    primaTotalEur: prima === null ? null : { valor: prima, cita: 'x', pagina: 1 }, primaNetaEur: null,
    capitales: Object.fromEntries(Object.entries(capitales).map(([k, v]) => [k, { valor: v, cita: 'x', pagina: 1 }])), franquiciaGeneral: null,
  },
})
const inc = (extra: Partial<CondicionGarantia> = {}) => G({ estado: 'incluida', ...extra })

const BASE_A = { incendio: inc(), danos_agua: inc({ franquicia: { tipo: 'importe', eur: 300 } }), rc_general: inc({ limite: { tipo: 'importe', eur: 300000 } }) }
const BASE_B = { incendio: inc(), danos_agua: inc({ franquicia: { tipo: 'importe', eur: 150 } }), rc_general: inc({ limite: { tipo: 'importe', eur: 600000 } }) }
const tabla = (fichas: FichaComparable[], ofertas: OfertaComparable[]): TablaComparador => compararOfertas(fichas, ofertas)

describe('recomendador', () => {
  it('pesos por perfil: piscina sube la RC; override manda; ramo desconocido = {}', () => {
    const base = pesosParaPerfil('comunidades')
    const p = pesosParaPerfil('comunidades', { piscina: true, ascensor: true, antiguedadAnios: 45 })
    expect(p.rc_general).toBe(base.rc_general + 3)
    expect(p.danos_agua).toBe(base.danos_agua + 2)
    expect(pesosParaPerfil('comunidades', {}, { rc_general: 9 }).rc_general).toBe(9)
    expect(pesosParaPerfil('comercio', { escaparates: true }).rotura_cristales).toBe(6)
    expect(pesosParaPerfil('rc', { empleados: 4 }).rc_patronal).toBe(5)
    expect(pesosParaPerfil('otro')).toEqual({})
  })

  it('mejor cobertura gana aunque cueste algo más; motivos legibles', () => {
    const t = tabla([ficha('A', BASE_A), ficha('B', BASE_B)], [oferta('a', 'A', 1000), oferta('b', 'B', 1030)])
    const r = recomendar(t, { piscina: true })
    expect(r.ranking.map((x) => x.ofertaId)).toEqual(['b', 'a'])
    const b = r.ranking[0]
    expect(b.motivos.some((m) => m.startsWith('Mayor rc general'))).toBe(true)
    expect(b.motivos.some((m) => m.startsWith('Franquicia menor en daños por agua'))).toBe(true)
    expect(r.ranking[1].motivos[0]).toBe('Precio anual más bajo (1.000,00€)')
  })

  it('«no consta» penaliza menos que «excluida» y nunca suma', () => {
    const sinDato = { incendio: inc(), rc_general: inc() } // danos_agua ausente: no consta
    const excl = { incendio: inc(), rc_general: inc(), danos_agua: G({ estado: 'excluida' }) }
    const completa = { incendio: inc(), rc_general: inc(), danos_agua: inc() }
    const r = recomendar(tabla([ficha('N', sinDato), ficha('X', excl), ficha('C', completa)], [oferta('n', 'N', 1000), oferta('x', 'X', 1000), oferta('c', 'C', 1000)]))
    const p = Object.fromEntries(r.ranking.map((x) => [x.ofertaId, x.coberturaPct]))
    expect(p.c).toBeGreaterThan(p.n)
    expect(p.n).toBeGreaterThan(p.x)
    const n = r.ranking.find((x) => x.ofertaId === 'n')!
    expect(n.reservas).toContain('No consta daños por agua: verificar')
    expect(n.flags.some((f) => f.tipo === 'garantia_clave_no_consta' && f.garantia === 'danos_agua')).toBe(true)
    expect(r.ranking.find((x) => x.ofertaId === 'x')!.flags.some((f) => f.tipo === 'garantia_clave_ausente')).toBe(true)
  })

  it('«no consta» aporta exactamente 0 puntos de cobertura (nunca suma)', () => {
    const r = recomendar(tabla([ficha('N', {})], [oferta('n', 'N', 1000)]))
    expect(r.ranking[0].coberturaPct).toBe(0)
  })

  it('null no es 0: franquicia desconocida no gana a franquicia 0 ni se trata como sin franquicia', () => {
    const f0 = { danos_agua: inc({ franquicia: { tipo: 'sin_franquicia' } }) }
    const fNull = { danos_agua: inc() }
    const r = recomendar(tabla([ficha('Z', f0), ficha('U', fNull)], [oferta('z', 'Z', 1000), oferta('u', 'U', 1000)]), {}, { pesos: { incendio: 0 } })
    expect(r.ranking[0].ofertaId).toBe('z')
  })

  it('oferta sin precio anual: nunca recomendada', () => {
    const t = tabla([ficha('A', BASE_B), ficha('B', BASE_A)], [oferta('a', 'A', null), oferta('b', 'B', 900)])
    const r = recomendar(t)
    expect(r.ranking.map((x) => x.ofertaId)).toEqual(['b'])
    expect(r.descartadas).toHaveLength(1)
    expect(r.descartadas[0]).toMatchObject({ ofertaId: 'a' })
    // El precio de la oferta puede venir de fuera (anual de OfertaNormalizada) y 0 sigue sin valer
    expect(recomendar(t, {}, { preciosAnualesEur: { a: 0, b: 900 } }).ranking).toHaveLength(1)
    expect(recomendar(t, {}, { preciosAnualesEur: { a: 800 } }).ranking).toHaveLength(2)
    expect(recomendar(tabla([], [oferta('a', 'A', null)])).avisos).toContain('Ninguna oferta con precio anual: no hay recomendación.')
  })

  it('empate: mismas coberturas y precio → misma posición y aviso; desempata por precio si no', () => {
    const t = tabla([ficha('A', BASE_A), ficha('B', BASE_A)], [oferta('a', 'A', 1000), oferta('b', 'B', 1000)])
    const r = recomendar(t)
    expect(r.ranking.map((x) => x.posicion)).toEqual([1, 1])
    expect(r.ranking.every((x) => x.empate)).toBe(true)
    expect(r.ranking[0].reservas).toContain('Empata en puntos con otra oferta: decide el corredor')
    // mismo precio pesoPrecio=0 y mismas coberturas pero distinto precio: el barato va primero
    const t2 = tabla([ficha('A', BASE_A), ficha('B', BASE_A)], [oferta('a', 'A', 1200), oferta('b', 'B', 1000)])
    expect(recomendar(t2, {}, { pesoPrecio: 0 }).ranking.map((x) => x.ofertaId)).toEqual(['b', 'a'])
  })

  it('infraseguro: capital ofertado < 90% del pedido → flag y reserva', () => {
    const cont = { continente: inc() }
    const t = tabla([ficha('A', cont), ficha('B', cont)], [oferta('a', 'A', 1000, { continente: 800000 }), oferta('b', 'B', 1000, { continente: 1000000 })])
    const r = recomendar(t, { capitalesPedidos: { continente: 1000000 } })
    const a = r.ranking.find((x) => x.ofertaId === 'a')!
    expect(a.flags.some((f) => f.tipo === 'infraseguro' && f.garantia === 'continente')).toBe(true)
    expect(r.ranking.find((x) => x.ofertaId === 'b')!.flags.some((f) => f.tipo === 'infraseguro')).toBe(false)
    expect(r.ranking[0].ofertaId).toBe('b')
  })

  it('ficha pendiente o ausente: flag; la tabla no se altera', () => {
    const t = tabla([ficha('A', BASE_A, 'pendiente')], [oferta('a', 'A', 1000), oferta('b', 'B', 1100)])
    const r = recomendar(t)
    expect(r.ranking.find((x) => x.ofertaId === 'a')!.flags.map((f) => f.tipo)).toContain('ficha_sin_validar')
    expect(r.ranking.find((x) => x.ofertaId === 'b')!.flags.map((f) => f.tipo)).toContain('sin_ficha')
  })

  it('determinista', () => {
    const t = tabla([ficha('A', BASE_A), ficha('B', BASE_B)], [oferta('a', 'A', 1000), oferta('b', 'B', 1100)])
    expect(JSON.stringify(recomendar(t, { piscina: true }))).toBe(JSON.stringify(recomendar(t, { piscina: true })))
  })
})
