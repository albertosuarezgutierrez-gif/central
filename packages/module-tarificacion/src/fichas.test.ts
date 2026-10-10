// Fichas de producto (07/10/2026): catálogo, validador anti-alucinación, huella del condicionado y comparador.
import { describe, it, expect } from 'vitest'
import {
  CATALOGO_FICHAS,
  RAMOS_FICHA,
  aplicarEdicion,
  claveDeLiteral,
  compararOfertas,
  comprobarCondicionado,
  condicionesDeJson,
  garantiasFicha,
  huellaCondicionado,
  importeEnTexto,
  normalizarLiteral,
  paginaDeCita,
  porcentajeEnTexto,
  validarEdicionGarantia,
  validarExtraccion,
  validarValoresPresupuesto,
  type FichaComparable,
  type OfertaComparable,
} from './index.ts'

const TEXTO = `[[Página 1]]
PROYECTO DE SEGURO ALLIANZ COMUNIDADES
Condicionado general mod. CG-COM 01/2020
Edificación Valor Reposición 1.250.000,00 €
Prima total anual 1.234,56 €
Franquicia general 150,00 €
[[Página 2]]
Daños por agua: incluida. Límite 3.000 € por siniestro. Franquicia 10 % del siniestro, mínimo 150 €
Localización y reparación de la avería: incluida hasta 600 €
Responsabilidad civil general: límite 600.000 €; sublímite por víctima 150.000 €
Rotura de cristales: incluida a primer riesgo 1.500 €
Impago de cuotas: opcional
Asistencia: incluida sin franquicia
Cobertura de jardinería exótica: incluida`

const garantia = (o: Record<string, unknown>) => o

describe('catálogo de fichas', () => {
  it('claves únicas por ramo y sinónimos ya normalizados', () => {
    for (const ramo of RAMOS_FICHA) {
      const claves = CATALOGO_FICHAS[ramo].map((g) => g.clave)
      expect(new Set(claves).size).toBe(claves.length)
      for (const g of CATALOGO_FICHAS[ramo]) for (const s of g.sinonimos) expect(normalizarLiteral(s)).toBe(s)
    }
  })
  it('cubre las garantías de comunidades que pide la correduría', () => {
    const claves = garantiasFicha('comunidades').map((g) => g.clave)
    for (const c of ['continente', 'contenido', 'danos_agua', 'danos_agua_localizacion', 'danos_agua_sin_localizacion', 'fenomenos_atmosfericos',
      'incendio', 'rc_general', 'rc_agua', 'rotura_cristales', 'rotura_maquinaria', 'robo', 'control_plagas', 'defensa_juridica',
      'asesoramiento_juridico', 'impago_cuotas', 'ite', 'desatascos', 'valor_estetico']) expect(claves).toContain(c)
  })
  it('el literal de la compañía cae en la clave por el sinónimo más largo', () => {
    expect(claveDeLiteral('comunidades', 'Daños por agua')).toBe('danos_agua')
    expect(claveDeLiteral('comunidades', 'Daños por agua: localización y reparación')).toBe('danos_agua_localizacion')
    expect(claveDeLiteral('comunidades', 'RC por daños por agua')).toBe('rc_agua')
    expect(claveDeLiteral('comunidades', 'Responsabilidad Civil General')).toBe('rc_general')
    expect(claveDeLiteral('comunidades', 'Cobertura de jardinería exótica')).toBeNull()
  })
  it('un ramo sin catálogo no inventa claves', () => {
    expect(garantiasFicha('auto')).toEqual([])
    expect(claveDeLiteral('auto', 'Daños por agua')).toBeNull()
  })
})

describe('importes y porcentajes literales', () => {
  it('reconoce las formas españolas y no un trozo de otra cifra', () => {
    expect(importeEnTexto(3000, 'Límite 3.000 €')).toBe(true)
    expect(importeEnTexto(1234.56, 'total 1.234,56 €')).toBe(true)
    expect(importeEnTexto(1000, 'hasta 1 000 euros')).toBe(true)
    expect(importeEnTexto(200, 'Límite 1.200 €')).toBe(false)
    expect(importeEnTexto(3000, 'Límite 30.000 €')).toBe(false)
    expect(importeEnTexto(3000, 'Límite 3.000,50 €')).toBe(false)
  })
  it('porcentajes', () => {
    expect(porcentajeEnTexto(10, 'Franquicia 10 % del siniestro')).toBe(true)
    expect(porcentajeEnTexto(12.5, 'un 12,5% del daño')).toBe(true)
    expect(porcentajeEnTexto(10, 'Franquicia 110 %')).toBe(false)
  })
  it('página de la cita calculada por código', () => {
    expect(paginaDeCita('Rotura de cristales: incluida', TEXTO)).toBe(2)
    expect(paginaDeCita('Prima total anual', TEXTO)).toBe(1)
  })
})

describe('validarExtraccion — anti-alucinación', () => {
  const bruto = {
    producto: 'Allianz Comunidades',
    version: { valor: 'CG-COM 01/2020', cita: 'Condicionado general mod. CG-COM 01/2020' },
    garantias: [
      garantia({ clave: 'danos_agua', literal: 'Daños por agua', estado: 'incluida', limite: { tipo: 'importe', eur: 3000 },
        franquicia: { tipo: 'porcentaje', pct: 10, minimoEur: 150, maximoEur: null },
        cita: 'Daños por agua: incluida. Límite 3.000 € por siniestro. Franquicia 10 % del siniestro, mínimo 150 €' }),
      garantia({ clave: 'rc_general', literal: 'Responsabilidad civil general', estado: 'incluida', limite: { tipo: 'importe', eur: 600000 },
        sublimites: [{ concepto: 'por víctima', limite: { tipo: 'importe', eur: 150000 }, cita: 'sublímite por víctima 150.000 €' }],
        cita: 'Responsabilidad civil general: límite 600.000 €' }),
      garantia({ clave: 'rotura_cristales', literal: 'Rotura de cristales', estado: 'incluida', limite: { tipo: 'primer_riesgo', eur: 1500 },
        cita: 'Rotura de cristales: incluida a primer riesgo 1.500 €' }),
      garantia({ clave: 'impago_cuotas', literal: 'Impago de cuotas', estado: 'opcional', cita: 'Impago de cuotas: opcional' }),
      garantia({ clave: 'asistencia', literal: 'Asistencia', estado: 'incluida', franquicia: { tipo: 'sin_franquicia' }, cita: 'Asistencia: incluida sin franquicia' }),
      garantia({ clave: 'otra', literal: 'Cobertura de jardinería exótica', estado: 'incluida', cita: 'Cobertura de jardinería exótica: incluida' }),
    ],
    presupuesto: {
      primaTotal: { valor: 1234.56, cita: 'Prima total anual 1.234,56 €' },
      capitales: [{ clave: 'continente', valor: 1250000, cita: 'Edificación Valor Reposición 1.250.000,00 €' }],
      franquiciaGeneral: { franquicia: { tipo: 'importe', eur: 150 }, cita: 'Franquicia general 150,00 €' },
    },
  }

  it('acepta lo que está escrito en el PDF, con su cita y su página', () => {
    const r = validarExtraccion(bruto, 'comunidades', TEXTO)
    expect(r.avisos).toEqual([])
    expect(r.version).toBe('CG-COM 01/2020')
    const agua = r.condiciones.garantias.danos_agua
    expect(agua.limite).toEqual({ tipo: 'importe', eur: 3000 })
    expect(agua.franquicia).toEqual({ tipo: 'porcentaje', pct: 10, minimoEur: 150, maximoEur: null })
    expect(agua.pagina).toBe(2)
    expect(r.condiciones.garantias.rc_general.sublimites).toEqual([{ concepto: 'por víctima', limite: { tipo: 'importe', eur: 150000 }, cita: 'sublímite por víctima 150.000 €' }])
    expect(r.condiciones.garantias.rotura_cristales.limite).toEqual({ tipo: 'primer_riesgo', eur: 1500 })
    expect(r.condiciones.garantias.impago_cuotas.estado).toBe('opcional')
    expect(r.condiciones.garantias.asistencia.franquicia).toEqual({ tipo: 'sin_franquicia' })
    expect(r.condiciones.extras.map((e) => e.literal)).toEqual(['Cobertura de jardinería exótica'])
    expect(r.presupuesto.primaTotalEur?.valor).toBe(1234.56)
    expect(r.presupuesto.capitales.continente?.valor).toBe(1250000)
    expect(r.presupuesto.franquiciaGeneral?.franquicia).toEqual({ tipo: 'importe', eur: 150 })
  })

  it('🚨 un importe que NO está en el texto se anula (null) y deja aviso', () => {
    const malo = structuredClone(bruto)
    ;(malo.garantias[0] as { limite: unknown }).limite = { tipo: 'importe', eur: 6000 }
    malo.presupuesto.primaTotal.valor = 999.99
    const r = validarExtraccion(malo, 'comunidades', TEXTO)
    expect(r.condiciones.garantias.danos_agua.limite).toBeNull()
    expect(r.condiciones.garantias.danos_agua.estado).toBe('incluida')
    expect(r.presupuesto.primaTotalEur).toBeNull()
    expect(r.avisos.map((a) => a.motivo)).toEqual(['importe_no_literal', 'importe_no_literal'])
  })

  it('🚨 una cita que no está en el PDF tumba la garantía entera (queda «no leída», no «excluida»)', () => {
    const malo = structuredClone(bruto)
    ;(malo.garantias[3] as { cita: string }).cita = 'Impago de cuotas: excluida expresamente'
    ;(malo.garantias[3] as { estado: string }).estado = 'excluida'
    const r = validarExtraccion(malo, 'comunidades', TEXTO)
    expect('impago_cuotas' in r.condiciones.garantias).toBe(false)
    expect(r.avisos.some((a) => a.motivo === 'cita_no_encontrada')).toBe(true)
  })

  it('el importe tiene que estar en SU cita, no en cualquier parte del PDF', () => {
    const malo = structuredClone(bruto)
    // 150.000 está en el PDF, pero no en la cita de la RC general.
    ;(malo.garantias[1] as { limite: unknown }).limite = { tipo: 'importe', eur: 150000 }
    const r = validarExtraccion(malo, 'comunidades', TEXTO)
    expect(r.condiciones.garantias.rc_general.limite).toBeNull()
  })

  it('primer riesgo sin la expresión en la cita queda como importe; «sin franquicia» sin texto, null', () => {
    const malo = structuredClone(bruto)
    ;(malo.garantias[0] as { limite: unknown }).limite = { tipo: 'primer_riesgo', eur: 3000 }
    ;(malo.garantias[3] as { franquicia: unknown }).franquicia = { tipo: 'sin_franquicia' }
    const r = validarExtraccion(malo, 'comunidades', TEXTO)
    expect(r.condiciones.garantias.danos_agua.limite).toEqual({ tipo: 'importe', eur: 3000 })
    expect(r.condiciones.garantias.impago_cuotas.franquicia).toBeNull()
  })

  it('tres estados: 0, "N/A" y nada son null; nunca «excluida» por defecto', () => {
    const r = validarExtraccion({ garantias: [{ clave: 'impago_cuotas', literal: 'Impago de cuotas', estado: 'N/A', limite: { tipo: 'importe', eur: 0 }, cita: 'Impago de cuotas: opcional' }] }, 'comunidades', TEXTO)
    const g = r.condiciones.garantias.impago_cuotas
    expect(g.estado).toBeNull()
    expect(g.limite).toBeNull()
    expect(g.sublimites).toBeNull()
    expect(r.presupuesto).toEqual({ primaTotalEur: null, primaNetaEur: null, capitales: {}, franquiciaGeneral: null })
  })

  it('basura de la IA no lanza', () => {
    expect(() => validarExtraccion('hola', 'comunidades', TEXTO)).not.toThrow()
    expect(validarExtraccion(null, 'comunidades', '').condiciones.garantias).toEqual({})
  })

  it('solo valores del presupuesto (ficha ya validada)', () => {
    const r = validarValoresPresupuesto({ primaTotal: { valor: 1234.56, cita: 'Prima total anual 1.234,56 €' }, capitales: [{ clave: 'Edificación', valor: 1250000, cita: 'Edificación Valor Reposición 1.250.000,00 €' }] }, 'comunidades', TEXTO)
    expect(r.presupuesto.primaTotalEur?.valor).toBe(1234.56)
    expect(r.presupuesto.capitales.continente?.valor).toBe(1250000)
  })
})

describe('huella del condicionado', () => {
  const base = validarExtraccion({
    garantias: [
      { clave: 'danos_agua', estado: 'incluida', limite: { tipo: 'importe', eur: 3000 }, cita: 'Límite 3.000 € por siniestro' },
      { clave: 'impago_cuotas', estado: 'opcional', cita: 'Impago de cuotas: opcional' },
    ],
  }, 'comunidades', TEXTO).condiciones

  it('es estable y cambia si cambia una cita', () => {
    expect(huellaCondicionado(base)).toBe(huellaCondicionado(structuredClone(base)))
    const otra = structuredClone(base)
    otra.garantias.danos_agua.cita = 'Límite 6.000 € por siniestro'
    expect(huellaCondicionado(otra)).not.toBe(huellaCondicionado(base))
  })
  it('un PDF nuevo con el mismo condicionado no avisa; con otro, dice qué cita falta', () => {
    expect(comprobarCondicionado(base, TEXTO)).toEqual({ cambiado: false, citasAusentes: [] })
    const nuevo = TEXTO.replace('Límite 3.000 €', 'Límite 6.000 €')
    expect(comprobarCondicionado(base, nuevo)).toEqual({ cambiado: true, citasAusentes: ['danos_agua'] })
  })
})

describe('edición humana', () => {
  it('valida y marca el origen', () => {
    const v = validarEdicionGarantia('comunidades', 'danos_agua', { estado: 'incluida', limite: { tipo: 'importe', eur: '3.500' }, franquicia: null, notas: '' })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    const c = aplicarEdicion({ garantias: {}, extras: [] }, v.clave, v.edicion)
    expect(c.garantias.danos_agua).toMatchObject({ estado: 'incluida', limite: { tipo: 'importe', eur: 3500 }, franquicia: null, notas: null, origen: 'humano' })
    expect(condicionesDeJson(JSON.parse(JSON.stringify(c)))).toEqual(c)
  })
  it('rechaza claves fuera del catálogo y valores sin forma', () => {
    expect(validarEdicionGarantia('comunidades', 'inventada', {}).ok).toBe(false)
    expect(validarEdicionGarantia('comunidades', 'danos_agua', { estado: 'quizá' }).ok).toBe(false)
    expect(validarEdicionGarantia('comunidades', 'danos_agua', { limite: { tipo: 'importe', eur: 0 } }).ok).toBe(false)
  })
})

describe('compararOfertas', () => {
  const cond = (o: Record<string, unknown>) => condicionesDeJson({ garantias: o })
  const fichas: FichaComparable[] = [
    { id: 'f1', compania: 'Allianz', ramo: 'comunidades', producto: 'Comunidades', version: '2020', estado: 'validada',
      condiciones: cond({ danos_agua: { estado: 'incluida', limite: { tipo: 'importe', eur: 3000 }, franquicia: { tipo: 'importe', eur: 150 }, cita: 'x', origen: 'ia' },
        impago_cuotas: { estado: 'opcional', cita: 'x', origen: 'ia' } }) },
    { id: 'f2', compania: 'Mapfre', ramo: 'comunidades', producto: 'Comunidad Plus', version: null, estado: 'pendiente',
      condiciones: cond({ danos_agua: { estado: 'incluida', limite: { tipo: 'importe', eur: 6000 }, franquicia: { tipo: 'sin_franquicia' }, cita: 'x', origen: 'ia' },
        impago_cuotas: { estado: 'incluida', cita: 'x', origen: 'ia' } }) },
  ]
  const pres = (prima: number | null, continente: number | null): OfertaComparable['presupuesto'] => ({
    primaTotalEur: prima === null ? null : { valor: prima, cita: 'x', pagina: null },
    primaNetaEur: null,
    capitales: continente === null ? {} as Record<string, { valor: number; cita: string; pagina: null }> : { continente: { valor: continente, cita: 'x', pagina: null } },
    franquiciaGeneral: null,
  })
  const ofertas: OfertaComparable[] = [
    { id: 'o1', compania: 'ALLIANZ', ramo: 'comunidades', producto: 'comunidades', version: '2020', presupuesto: pres(1200, 1000000) },
    { id: 'o2', compania: 'Mapfre', ramo: 'comunidades', producto: 'Comunidad Plus', version: null, presupuesto: pres(1100, 900000) },
    { id: 'o3', compania: 'Reale', ramo: 'comunidades', producto: 'Comunidades', version: null, presupuesto: pres(null, null) },
  ]
  const t = compararOfertas(fichas, ofertas)
  const fila = (c: string) => t.filas.find((f) => f.clave === c)!

  it('una columna por oferta con su ficha', () => {
    expect(t.columnas.map((c) => [c.ofertaId, c.fichaId, c.fichaEstado, c.primaTotalEur])).toEqual([
      ['o1', 'f1', 'validada', 1200], ['o2', 'f2', 'pendiente', 1100], ['o3', null, null, null],
    ])
    expect(t.avisos.length).toBe(2)
  })
  it('diferencias como hechos: límite máximo, franquicia mínima, huecos', () => {
    const agua = fila('danos_agua')
    expect(agua.diferencias).toMatchObject({ distintas: true, limiteMaxEur: 6000, ofertasLimiteMax: ['o2'], franquiciaMinEur: 0, ofertasFranquiciaMin: ['o2'], huecos: ['o3'] })
    expect(agua.celdas[1].sinValidar).toBe(true)
    expect(agua.celdas[0].sinValidar).toBe(false)
  })
  it('🚨 sin ficha = no consta, nunca «excluida» ni 0', () => {
    const c = fila('impago_cuotas').celdas[2]
    expect(c).toMatchObject({ consta: false, estado: null, limiteEur: null, franquiciaEur: null })
    expect(fila('impago_cuotas').diferencias.ofertasSinIncluir).toEqual(['o1'])
  })
  it('los capitales salen del presupuesto', () => {
    expect(fila('continente').celdas.map((c) => c.capitalEur)).toEqual([1000000, 900000, null])
    expect(fila('continente').diferencias.ofertasLimiteMax).toEqual(['o1'])
  })
  it('oferta sin versión y varias versiones de la ficha: no adivina', () => {
    const dos = [...fichas, { ...fichas[0], id: 'f3', version: '2024' }]
    const r = compararOfertas(dos, [{ ...ofertas[0], version: null }])
    expect(r.columnas[0].fichaId).toBeNull()
  })
})
