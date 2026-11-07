import { describe, it, expect } from 'vitest'
import { armarRemesaNominas, eurosACentimos, idMensajeRemesa, textoSepa, type ArmarRemesaParams } from './remesa-nominas'

// IBAN de ejemplo públicos (checksum válido), no son cuentas reales.
const IBAN_EMPRESA = 'ES9121000418450200051332'
const IBAN_A = 'ES7921000813610123456789'
const IBAN_B = 'ES7620770024003102575766'
const EMP = '11111111-1111-1111-1111-111111111111'
const OTRA = '22222222-2222-2222-2222-222222222222'

function base(over: Partial<ArmarRemesaParams> = {}): ArmarRemesaParams {
  return {
    empresa: { id: EMP, nombre: 'Mariscos González SL', nif: 'B12345678', iban: IBAN_EMPRESA, bic: 'CAIXESBBXXX' },
    periodo: '2026-11',
    fechaEjecucion: '2026-11-28',
    hoy: '2026-11-07',
    creadoEn: new Date('2026-11-07T10:00:00Z'),
    empleados: [
      { id: 'e1', empresa_id: EMP, nombre: 'Ana', apellidos: 'Núñez', iban: IBAN_A },
      { id: 'e2', empresa_id: EMP, nombre: 'Luis', apellidos: null, iban: IBAN_B },
    ],
    nominas: [
      { id: 'aaaaaaaa-0000-0000-0000-000000000001', empresa_id: EMP, empleado_id: 'e1', periodo: '2026-11', estado: 'confirmada', liquido_centimos: 123456 },
      { id: 'aaaaaaaa-0000-0000-0000-000000000002', empresa_id: EMP, empleado_id: 'e2', periodo: '2026-11', estado: 'confirmada', liquido_centimos: 10 },
      { id: 'aaaaaaaa-0000-0000-0000-000000000003', empresa_id: EMP, empleado_id: 'e2', periodo: '2026-11', estado: 'borrador', liquido_centimos: 999 },
    ],
    ...over,
  }
}

function errores(r: ReturnType<typeof armarRemesaNominas>) {
  if (r.ok) throw new Error('se esperaba error')
  return r.errores
}

describe('armarRemesaNominas', () => {
  it('XML de referencia: SALA, ordenante con NIF+sufijo, nombres sin tildes, solo confirmadas', () => {
    const r = armarRemesaNominas(base())
    if (!r.ok) throw new Error(JSON.stringify(r.errores))
    expect(r.no_confirmadas).toBe(1)
    expect(r.num_transferencias).toBe(2)
    expect(r.nombreFichero).toBe('remesa-nominas-2026-11.xml')
    const xml = r.xml
    expect(xml).toContain(`<MsgId>${r.id_mensaje}</MsgId>`)
    expect(xml).toContain(`<PmtInfId>${r.id_mensaje}-001</PmtInfId>`)
    expect(r.id_mensaje).toMatch(/^NOM202611[0-9A-F]{22}$/)
    expect(`${r.id_mensaje}-001`.length).toBeLessThanOrEqual(35)
    expect(r.nomina_ids).toEqual(['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'])
    expect(xml).toContain('<CreDtTm>2026-11-07T10:00:00</CreDtTm>')
    expect(xml).toContain('<Nm>Mariscos Gonzalez SL</Nm>')
    expect(xml).toContain('<Id>B12345678000</Id>')
    expect(xml).toContain('<CtgyPurp>\n          <Cd>SALA</Cd>')
    expect(xml).toContain('<ReqdExctnDt>2026-11-28</ReqdExctnDt>')
    expect(xml).toContain('<BIC>CAIXESBBXXX</BIC>')
    expect(xml).toContain('<EndToEndId>NOMaaaaaaaa000000000000000000000001</EndToEndId>')
    expect(xml).toContain('<Nm>Ana Nunez</Nm>')
    expect(xml).toContain('<InstdAmt Ccy="EUR">1234.56</InstdAmt>')
    expect(xml).toContain('<InstdAmt Ccy="EUR">0.10</InstdAmt>')
    expect(xml).toContain('<Ustrd>NOMINA 2026-11</Ustrd>')
    expect(xml).not.toContain('9.99')
    expect((xml.match(/<Purp>/g) ?? []).length).toBe(2)
  })

  it('suma de la remesa = suma de líquidos (céntimos), también en CtrlSum', () => {
    const nominas = Array.from({ length: 37 }, (_, i) => ({
      id: `n${i}`, empresa_id: EMP, empleado_id: `x${i}`, periodo: '2026-11', estado: 'confirmada', liquido_centimos: 10 + i * 333,
    }))
    const empleados = nominas.map(n => ({ id: n.empleado_id, empresa_id: EMP, nombre: n.empleado_id, apellidos: null, iban: IBAN_A }))
    const r = armarRemesaNominas(base({ nominas, empleados }))
    if (!r.ok) throw new Error(JSON.stringify(r.errores))
    const esperado = nominas.reduce((s, n) => s + n.liquido_centimos, 0)
    expect(r.total_centimos).toBe(esperado)
    const importes = [...r.xml.matchAll(/<InstdAmt Ccy="EUR">([\d.]+)<\/InstdAmt>/g)].map(m => Math.round(Number(m[1]) * 100))
    expect(importes.reduce((s, c) => s + c, 0)).toBe(esperado)
    const ctrl = [...r.xml.matchAll(/<CtrlSum>([\d.]+)<\/CtrlSum>/g)].map(m => m[1])
    expect(ctrl).toEqual([(esperado / 100).toFixed(2), (esperado / 100).toFixed(2)])
  })

  it('empleado de otra empresa → rechazado (aunque venga en la lista)', () => {
    const r = armarRemesaNominas(base({
      empleados: [
        { id: 'e1', empresa_id: OTRA, nombre: 'Ana', apellidos: 'Núñez', iban: IBAN_A },
        { id: 'e2', empresa_id: EMP, nombre: 'Luis', apellidos: null, iban: IBAN_B },
      ],
    }))
    expect(errores(r).map(e => e.codigo)).toEqual(['empleado_otra_empresa'])
  })

  it('nómina de otra empresa o empleado ausente de la empresa → rechazado', () => {
    const b = base()
    const r = armarRemesaNominas(base({
      nominas: [{ ...b.nominas[0], empresa_id: OTRA }, { ...b.nominas[1], empleado_id: 'eX' }],
    }))
    expect(errores(r).map(e => e.codigo)).toEqual(['nomina_otra_empresa', 'empleado_no_encontrado'])
  })

  it('IBAN inválido o ausente → error con la lista de empleados, sin IBAN en el mensaje y sin XML', () => {
    const r = armarRemesaNominas(base({
      empleados: [
        { id: 'e1', empresa_id: EMP, nombre: 'Ana', apellidos: 'Núñez', iban: 'ES7921000813610123456780' },
        { id: 'e2', empresa_id: EMP, nombre: 'Luis', apellidos: null, iban: null },
      ],
    }))
    const errs = errores(r)
    expect(errs.map(e => [e.codigo, e.empleado_id, e.empleado_nombre])).toEqual([
      ['empleado_iban_invalido', 'e1', 'Ana Núñez'],
      ['empleado_sin_iban', 'e2', 'Luis'],
    ])
    expect(JSON.stringify(r)).not.toMatch(/ES79|ES91|ES76/)
    expect('xml' in r).toBe(false)
  })

  it('IBAN de la empresa ausente/inválido, sin NIF o BIC mal → error', () => {
    expect(errores(armarRemesaNominas(base({ empresa: { ...base().empresa, iban: null } }))).map(e => e.codigo)).toEqual(['empresa_sin_iban'])
    expect(errores(armarRemesaNominas(base({ empresa: { ...base().empresa, iban: 'ES0000000000000000000000' } }))).map(e => e.codigo)).toEqual(['empresa_iban_invalido'])
    expect(errores(armarRemesaNominas(base({ empresa: { ...base().empresa, nif: null } }))).map(e => e.codigo)).toEqual(['empresa_sin_nif'])
    expect(errores(armarRemesaNominas(base({ empresa: { ...base().empresa, bic: 'XX' } }))).map(e => e.codigo)).toEqual(['empresa_bic_invalido'])
  })

  it('líquido null = «no se sabe» (error, nunca 0); ≤0 y simulación también fallan', () => {
    const b = base()
    const r = armarRemesaNominas(base({
      nominas: [{ ...b.nominas[0], liquido_centimos: null }, { ...b.nominas[1], liquido_centimos: 0 }],
    }))
    expect(errores(r).map(e => e.codigo)).toEqual(['liquido_desconocido', 'liquido_no_positivo'])
    const s = armarRemesaNominas(base({ nominas: [{ ...b.nominas[0], modo: 'simulacion' }] }))
    expect(errores(s).map(e => e.codigo)).toEqual(['nomina_simulada'])
  })

  it('sin confirmadas, duplicada, otro periodo o fecha pasada → error', () => {
    const b = base()
    expect(errores(armarRemesaNominas(base({ nominas: [b.nominas[2]] }))).map(e => e.codigo)).toEqual(['sin_nominas_confirmadas'])
    expect(errores(armarRemesaNominas(base({ nominas: [b.nominas[0], { ...b.nominas[0], id: 'otra' }] }))).map(e => e.codigo)).toEqual(['empleado_duplicado'])
    expect(errores(armarRemesaNominas(base({ nominas: [{ ...b.nominas[0], periodo: '2026-10' }] }))).map(e => e.codigo)).toEqual(['nomina_otro_periodo'])
    expect(errores(armarRemesaNominas(base({ fechaEjecucion: '2026-11-06' }))).map(e => e.codigo)).toEqual(['fecha_invalida'])
    expect(errores(armarRemesaNominas(base({ fechaEjecucion: '2026-02-30' }))).map(e => e.codigo)).toEqual(['fecha_invalida'])
  })
})

describe('MsgId determinista (contra el doble pago)', () => {
  const id = (over: Partial<ArmarRemesaParams> = {}) => {
    const r = armarRemesaNominas(base(over))
    if (!r.ok) throw new Error(JSON.stringify(r.errores))
    return r.id_mensaje
  }
  it('mismo contenido → mismo MsgId, aunque cambien la hora de creación, la fecha de cargo o el orden', () => {
    const a = id()
    expect(id({ creadoEn: new Date('2026-11-08T18:30:00Z') })).toBe(a)
    expect(id({ fechaEjecucion: '2026-11-30' })).toBe(a)
    expect(id({ nominas: [...base().nominas].reverse() })).toBe(a)
  })
  it('contenido distinto → MsgId distinto (importe, IBAN, nómina de más, otra empresa u otro periodo)', () => {
    const a = id()
    const nominas = base().nominas
    expect(id({ nominas: nominas.map((n, i) => (i === 0 ? { ...n, liquido_centimos: 123457 } : n)) })).not.toBe(a)
    expect(id({ empleados: base().empleados.map((e, i) => (i === 1 ? { ...e, iban: IBAN_A } : e)) })).not.toBe(a)
    expect(id({ nominas: nominas.filter((_, i) => i !== 1) })).not.toBe(a)
    const t = [{ nominaId: 'n1', iban: IBAN_A, centimos: 100 }]
    const ref = idMensajeRemesa({ empresaId: EMP, periodo: '2026-11', ibanCargo: IBAN_EMPRESA, transferencias: t })
    expect(idMensajeRemesa({ empresaId: OTRA, periodo: '2026-11', ibanCargo: IBAN_EMPRESA, transferencias: t })).not.toBe(ref)
    expect(idMensajeRemesa({ empresaId: EMP, periodo: '2026-12', ibanCargo: IBAN_EMPRESA, transferencias: t })).not.toBe(ref)
  })
})

describe('eurosACentimos / textoSepa', () => {
  it('convierte sin inventar ceros', () => {
    expect(eurosACentimos(1234.56)).toBe(123456)
    expect(eurosACentimos(0.1 + 0.2)).toBe(30)
    expect(eurosACentimos('1234.5')).toBe(123450)
    expect(eurosACentimos(null)).toBeNull()
    expect(eurosACentimos(undefined)).toBeNull()
    expect(eurosACentimos('')).toBeNull()
    expect(eurosACentimos(1.234)).toBeNull()
    expect(eurosACentimos(NaN)).toBeNull()
  })
  it('limpia texto al juego SEPA', () => {
    expect(textoSepa('José Ñúñez & Cía', 70)).toBe('Jose Nunez Cia')
  })
})
