// Control de calidad previo a enseñar/enviar (08/10/2026): datos inventados.
import { describe, it, expect } from 'vitest'
import { controlarCalidad, type ControlOferta, type ControlSolicitud } from './index.ts'

const HOY = '2026-10-08'
const oferta = (p: Partial<ControlOferta> = {}): ControlOferta => ({
  primaAnualEur: 1234.56, primaNetaEur: 1100, impuestosEur: 134.56, primaTotalEur: 1234.56, validaHasta: '2026-11-08',
  capitales: { continente: 500000 }, fichaEstado: 'validada', datosUsados: { codigoPostal: '41003', viviendas: 24 }, ...p,
})
const solicitud = (p: Partial<ControlSolicitud> = {}): ControlSolicitud => ({
  fechaEfecto: '2026-10-20', capitalesPedidos: { continente: 500000 }, datos: { codigoPostal: '41003', viviendas: 24 }, ...p,
})
const codigos = (l: { codigo: string }[]) => l.map((x) => x.codigo)

describe('controlarCalidad', () => {
  it('caso limpio: ok sin errores ni avisos', () => {
    const r = controlarCalidad(oferta(), solicitud(), HOY)
    expect(r).toEqual({ ok: true, errores: [], avisos: [] })
  })

  it('precio ausente, 0 o negativo bloquea', () => {
    for (const p of [null, 0, -5, NaN]) {
      const r = controlarCalidad(oferta({ primaAnualEur: p, primaTotalEur: null }), solicitud(), HOY)
      expect(r.ok).toBe(false)
      expect(codigos(r.errores)).toContain('precio_ausente')
    }
  })

  it('neta+impuestos≈total: céntimos toleran, más no', () => {
    expect(controlarCalidad(oferta({ impuestosEur: 134.57 }), solicitud(), HOY).ok).toBe(true)
    const r = controlarCalidad(oferta({ impuestosEur: 140 }), solicitud(), HOY)
    expect(codigos(r.errores)).toContain('desglose_incoherente')
  })

  it('precio = primer recibo prorrateado en vez de la anual: error', () => {
    const desglose = {
      anual: { primaNetaEur: 300, impuestosEur: 30, primaTotalEur: 330 },
      sucesivos: { primaNetaEur: 1100, impuestosEur: 134.56, primaTotalEur: 1234.56 },
    }
    expect(controlarCalidad(oferta({ desglose }), solicitud(), HOY).ok).toBe(true)
    const r = controlarCalidad(oferta({ primaAnualEur: 330, primaTotalEur: 330, primaNetaEur: 300, impuestosEur: 30, desglose }), solicitud(), HOY)
    expect(codigos(r.errores)).toEqual(['precio_es_primer_recibo'])
  })

  it('fecha de efecto: hoy vale, pasada o inválida bloquea', () => {
    expect(controlarCalidad(oferta(), solicitud({ fechaEfecto: HOY }), HOY).ok).toBe(true)
    expect(codigos(controlarCalidad(oferta(), solicitud({ fechaEfecto: '2026-10-07' }), HOY).errores)).toEqual(['fecha_efecto_pasada'])
    expect(codigos(controlarCalidad(oferta(), solicitud({ fechaEfecto: '2026-02-31' }), HOY).errores)).toEqual(['fecha_efecto_invalida'])
    expect(codigos(controlarCalidad(oferta(), solicitud({ fechaEfecto: null }), HOY).errores)).toEqual(['fecha_efecto_invalida'])
  })

  it('oferta caducada bloquea; validez desconocida solo avisa; hoy aún vale', () => {
    expect(codigos(controlarCalidad(oferta({ validaHasta: '2026-10-07' }), solicitud(), HOY).errores)).toEqual(['oferta_caducada'])
    expect(controlarCalidad(oferta({ validaHasta: HOY }), solicitud(), HOY).ok).toBe(true)
    const r = controlarCalidad(oferta({ validaHasta: null }), solicitud(), HOY)
    expect(r.ok).toBe(true)
    expect(codigos(r.avisos)).toEqual(['validez_desconocida'])
  })

  it('capitales: distinto, sin dato (null) y no pedido son avisos, no errores', () => {
    const d = controlarCalidad(oferta({ capitales: { continente: 450000 } }), solicitud(), HOY)
    expect(d.ok).toBe(true)
    expect(codigos(d.avisos)).toEqual(['capital_distinto'])
    expect(codigos(controlarCalidad(oferta({ capitales: { continente: null } }), solicitud(), HOY).avisos)).toEqual(['capital_sin_dato'])
    expect(codigos(controlarCalidad(oferta({ capitales: {} }), solicitud(), HOY).avisos)).toEqual(['capital_sin_dato'])
    expect(codigos(controlarCalidad(oferta({ capitales: { continente: 500000, contenido: 20000 } }), solicitud(), HOY).avisos)).toEqual(['capital_no_pedido'])
  })

  it('ficha pendiente → «coberturas sin validar»; sin ficha → aviso', () => {
    const p = controlarCalidad(oferta({ fichaEstado: 'pendiente' }), solicitud(), HOY)
    expect(p.ok).toBe(true)
    expect(p.avisos[0].mensaje).toMatch(/Coberturas sin validar/)
    expect(codigos(controlarCalidad(oferta({ fichaEstado: null }), solicitud(), HOY).avisos)).toEqual(['sin_ficha'])
  })

  it('datos usados ≠ solicitud: error; dato no leído: aviso; 0 no es null', () => {
    const r = controlarCalidad(oferta({ datosUsados: { codigoPostal: '41003', viviendas: 20 } }), solicitud(), HOY)
    expect(codigos(r.errores)).toEqual(['dato_distinto'])
    expect(r.errores[0].campo).toBe('viviendas')
    expect(codigos(controlarCalidad(oferta({ datosUsados: { codigoPostal: '41003' } }), solicitud(), HOY).avisos)).toEqual(['dato_no_usado'])
    const cero = controlarCalidad(oferta({ datosUsados: { x: null } }), solicitud({ datos: { x: 0 } }), HOY)
    expect(codigos(cero.errores)).toEqual(['dato_distinto'])
  })
})
