import { describe, it, expect } from 'vitest'
import {
  hashDocumento, nombreCoincide, cumpleArt26, verificarIntegridad, FirmaPropia,
  TEXTO_CONSENTIMIENTO, type EntradaFirma,
} from './index'

const enc = (s: string) => new TextEncoder().encode(s)

function entrada(over: Partial<EntradaFirma> = {}): EntradaFirma {
  return {
    firmante: { id: 'emp-1', nombre: 'Pilar Piña', email: 'pilar@x.com', dni: '12345678Z' },
    documento_id: 'doc-1',
    bytes: enc('contenido del contrato'),
    contexto: { fecha: '2026-06-16T00:00:00.000Z', ip: '1.2.3.4', user_agent: 'jest' },
    metodo: 'sesion_token',
    nombre_confirmado: 'Pilar Piña',
    ...over,
  }
}

describe('hashDocumento', () => {
  it('es determinista y SHA-256 (64 hex)', async () => {
    const a = await hashDocumento(enc('hola'))
    const b = await hashDocumento(enc('hola'))
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
  it('cambia si el contenido cambia', async () => {
    expect(await hashDocumento(enc('a'))).not.toBe(await hashDocumento(enc('b')))
  })
})

describe('nombreCoincide', () => {
  it('ignora mayúsculas, acentos y espacios', () => {
    expect(nombreCoincide('  pilar  pina ', 'Pilar Piña')).toBe(true)
  })
  it('rechaza nombre distinto o vacío', () => {
    expect(nombreCoincide('Otro Nombre', 'Pilar Piña')).toBe(false)
    expect(nombreCoincide('', 'Pilar Piña')).toBe(false)
  })
})

describe('FirmaPropia.firmar', () => {
  it('produce una evidencia que cumple los 4 requisitos del art. 26', async () => {
    const e = await new FirmaPropia().firmar(entrada())
    expect(e.proveedor).toBe('propia')
    expect(e.algoritmo).toBe('SHA-256')
    expect(e.consentimiento).toBe(TEXTO_CONSENTIMIENTO)
    expect(e.doc_hash).toBe(await hashDocumento(enc('contenido del contrato')))
    const art = cumpleArt26(e)
    expect(art.ok).toBe(true)
    expect(art.condiciones).toEqual({
      a_vinculada_al_firmante: true,
      b_identifica_al_firmante: true,
      c_control_exclusivo: true,
      d_integridad_detectable: true,
    })
  })

  it('rechaza si el nombre confirmado no coincide', async () => {
    await expect(new FirmaPropia().firmar(entrada({ nombre_confirmado: 'No Es' }))).rejects.toThrow()
  })

  it('art.26.b falla sin email ni dni', async () => {
    const e = await new FirmaPropia().firmar(entrada({ firmante: { id: 'x', nombre: 'Pilar Piña' } }))
    expect(cumpleArt26(e).condiciones.b_identifica_al_firmante).toBe(false)
  })
})

describe('verificarIntegridad (art. 26.d)', () => {
  it('íntegro si el hash coincide', async () => {
    const prov = new FirmaPropia()
    const e = await prov.firmar(entrada())
    const actual = await hashDocumento(enc('contenido del contrato'))
    expect(prov.verificar(e, actual)).toEqual({ integro: true })
  })
  it('detecta alteración si el documento cambió', async () => {
    const prov = new FirmaPropia()
    const e = await prov.firmar(entrada())
    const alterado = await hashDocumento(enc('contenido MODIFICADO'))
    const r = verificarIntegridad(e, alterado)
    expect(r.integro).toBe(false)
    expect(r.motivo).toMatch(/cambiado/)
  })
})
