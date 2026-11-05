// Cepo: a la IA que identifica al empleado de una página NO le llegan NSS, IBAN, DNI ni importes (estudio N0, riesgo 3).
import { vi, describe, it, expect } from 'vitest'

const { iaChat } = vi.hoisted(() => ({ iaChat: vi.fn(async (_m: unknown) => 'Ana Pérez Gómez') }))
vi.mock('@/lib/ai', () => ({ iaChat }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/storage', () => ({ subirObjeto: vi.fn() }))
vi.mock('@prisma/client', () => ({ Prisma: { sql: () => ({}) } }))

import { textoMinimoParaIA } from '@/lib/minimizar-ia'
import { identificarEmpleado } from '@/lib/distribuir-nominas'

const PAGINA = `RECIBO DE SALARIOS  Empresa: Mariscos SL  CIF B12345678  CCC 41/1234567/89
Trabajador: ANA PÉREZ GÓMEZ  DNI 12345678Z  NIE X1234567L  Nº afiliación 28/12345678/90 (281234567890)
IBAN ES91 2100 0418 4502 0005 1332  correo ana.perez@ejemplo.es  Tel 637 349 990
Salario base 1.800,00 €  Líquido a percibir 1.512,37 €  Periodo 01/06/2026 a 30/06/2026`

const SENSIBLES = ['12345678Z', 'X1234567L', '28/12345678/90', '281234567890', 'ES91', '2100 0418', '0005 1332',
  'ana.perez@ejemplo.es', '637 349 990', '1.800,00', '1.512,37', 'B12345678', '41/1234567/89', '12345678', '1234567']

describe('textoMinimoParaIA', () => {
  it('quita NSS, IBAN, DNI/NIE, correo, teléfono e importes; deja los nombres', () => {
    const t = textoMinimoParaIA(PAGINA)
    for (const s of SENSIBLES) expect(t, s).not.toContain(s)
    expect(t).not.toMatch(/\d/)
    expect(t).toContain('ANA PÉREZ GÓMEZ')
    expect(t).toContain('Mariscos SL')
  })
  it('respeta el tope de longitud', () => {
    expect(textoMinimoParaIA('Ana '.repeat(2000)).length).toBeLessThanOrEqual(2000)
  })
})

describe('identificarEmpleado envía solo texto minimizado', () => {
  it('ningún dato sensible sale en el mensaje a la IA', async () => {
    iaChat.mockClear()
    const r = await identificarEmpleado(PAGINA, ['Ana Pérez Gómez', 'Luis Ruiz'])
    expect(r).toBe('Ana Pérez Gómez')
    const enviado = JSON.stringify(iaChat.mock.calls[0][0])
    for (const s of SENSIBLES) expect(enviado, s).not.toContain(s)
    expect(enviado).toContain('ANA PÉREZ GÓMEZ')
  })
})
