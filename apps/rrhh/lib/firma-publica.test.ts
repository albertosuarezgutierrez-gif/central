import { describe, it, expect } from 'vitest'
import { aFirmaPublica, etiquetaMetodo } from '@/lib/firma-publica'

describe('aFirmaPublica', () => {
  const rowConSensibles = {
    firmante_nombre: 'Eligio González Franco',
    sello_tiempo: '2026-06-16T09:30:00.000Z',
    doc_hash: 'a'.repeat(64),
    algoritmo: 'SHA-256',
    metodo: 'otp_email',
    documento_nombre: 'Contrato.pdf',
    // campos sensibles que NUNCA deben salir:
    ip: '203.0.113.7',
    user_agent: 'Mozilla/5.0',
    firmante_email: 'egf@mariscosgonzalez.com',
    firmante_dni: '12345678Z',
    empleado_id: 'uuid-emp',
    empresa_id: 'uuid-emp2',
    evidencia: { secreto: true },
  }

  it('incluye SOLO los campos públicos', () => {
    const pub = aFirmaPublica(rowConSensibles)
    expect(Object.keys(pub).sort()).toEqual(
      ['algoritmo', 'doc_hash', 'documento_nombre', 'firmante_nombre', 'metodo', 'sello_tiempo'].sort(),
    )
    expect(pub.firmante_nombre).toBe('Eligio González Franco')
    expect(pub.doc_hash).toHaveLength(64)
  })

  it('NUNCA expone datos sensibles (ip, user_agent, email, dni, ids, evidencia)', () => {
    const pub = aFirmaPublica(rowConSensibles) as Record<string, unknown>
    for (const k of ['ip', 'user_agent', 'firmante_email', 'firmante_dni', 'empleado_id', 'empresa_id', 'evidencia']) {
      expect(pub[k]).toBeUndefined()
    }
  })

  it('etiqueta el método de forma legible', () => {
    expect(etiquetaMetodo('otp_email')).toMatch(/OTP/i)
    expect(etiquetaMetodo('sesion_token')).toMatch(/sesión/i)
    expect(etiquetaMetodo('desconocido')).toBe('desconocido')
  })
})
