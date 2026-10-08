// Formador/acompañante (06/10/2026): redacción de avisos, coherencia del precio y contador del modo acompañado.
import { describe, it, expect } from 'vitest'
import { MARCA_DATO_PERSONAL, acompanamientoInicial, coherenciaPrecio, crearRedactor, limpiarTextoAviso, redactarDatosPersonales, siguienteAcompanamiento } from './index.ts'

describe('limpiarTextoAviso / redactarDatosPersonales', () => {
  it('tapa DNI, NIE, CIF, correo, teléfono, IBAN y matrícula', () => {
    const t = redactarDatosPersonales(
      'Tomador 12345678Z, NIE X1234567L, CIF B12345678, mail ana.p@correo.es, tlf +34 612 345 678, IBAN ES91 2100 0418 4502 0005 1332, coche 1234 BCD',
    )
    for (const crudo of ['12345678Z', 'X1234567L', 'B12345678', 'ana.p@correo.es', '612 345 678', 'ES91', '1234 BCD']) expect(t).not.toContain(crudo)
    expect(t).toContain(MARCA_DATO_PERSONAL)
  })
  it('deja el texto del aviso legible', () => {
    expect(limpiarTextoAviso('  La fecha de efecto\n no puede ser anterior a hoy  ')).toBe('La fecha de efecto no puede ser anterior a hoy')
  })
  it('pasa además por el redactor de credenciales del worker', () => {
    const redactar = crearRedactor(['superSecreta99'])
    const t = limpiarTextoAviso('Usuario bloqueado: clave superSecreta99 incorrecta', redactar)!
    expect(t).not.toContain('superSecreta99')
  })
  it('vacío o no-string → null; recorta a max', () => {
    expect(limpiarTextoAviso('   ')).toBeNull()
    expect(limpiarTextoAviso(42)).toBeNull()
    expect(limpiarTextoAviso('a'.repeat(500), undefined, 50)!.length).toBe(50)
  })
})

describe('coherenciaPrecio', () => {
  it('cuadra: neta + impuestos = total, misma modalidad → sin incidencias', () => {
    expect(coherenciaPrecio({ primaNetaEur: 296.71, impuestosEur: 47.03, primaTotalEur: 343.74, modalidad: 'estandar' }, 'estandar')).toEqual([])
  })
  it('tolera el redondeo del portal (≤ 0,05 €)', () => {
    expect(coherenciaPrecio({ primaNetaEur: 296.71, impuestosEur: 47.0, primaTotalEur: 343.74 }, null)).toEqual([])
  })
  it('descuadre → bloqueante con importes en formato español', () => {
    const r = coherenciaPrecio({ primaNetaEur: 1000, impuestosEur: 80, primaTotalEur: 1200 }, null)
    const d = r.find((i) => i.codigo === 'descuadre')!
    expect(d.bloqueante).toBe(true)
    expect(d.mensaje).toContain('1.080,00€')
    expect(d.mensaje).toContain('1.200,00€')
  })
  it('sin total o total ≤ 0 → bloqueante', () => {
    expect(coherenciaPrecio({ primaNetaEur: 10, impuestosEur: 1 }, null).some((i) => i.codigo === 'sin_total' && i.bloqueante)).toBe(true)
    expect(coherenciaPrecio({ primaNetaEur: 0, impuestosEur: 0, primaTotalEur: 0 }, null).some((i) => i.codigo === 'total_no_positivo')).toBe(true)
  })
  it('otra modalidad → bloqueante; sin desglose → solo aviso', () => {
    const r = coherenciaPrecio({ primaTotalEur: 300, modalidad: 'personalizado' }, 'estandar')
    expect(r.find((i) => i.codigo === 'modalidad_distinta')?.bloqueante).toBe(true)
    expect(r.find((i) => i.codigo === 'sin_desglose')?.bloqueante).toBe(false)
  })
  it('impuestos desproporcionados → aviso no bloqueante', () => {
    const r = coherenciaPrecio({ primaNetaEur: 100, impuestosEur: 50, primaTotalEur: 150 }, null)
    expect(r).toEqual([expect.objectContaining({ codigo: 'impuestos_altos', bloqueante: false })])
  })
})

describe('siguienteAcompanamiento', () => {
  it('se desactiva al llegar al umbral de éxitos seguidos sin IA', () => {
    let e = acompanamientoInicial(3)
    e = siguienteAcompanamiento(e, 'exito_sin_ia')
    e = siguienteAcompanamiento(e, 'exito_sin_ia')
    expect(e).toEqual({ activo: true, exitosSeguidos: 2, umbral: 3 })
    e = siguienteAcompanamiento(e, 'exito_sin_ia')
    expect(e.activo).toBe(false)
  })
  it('un éxito CON IA pone el contador a cero sin cambiar el modo', () => {
    expect(siguienteAcompanamiento({ activo: true, exitosSeguidos: 2, umbral: 3 }, 'exito_con_ia')).toEqual({ activo: true, exitosSeguidos: 0, umbral: 3 })
    expect(siguienteAcompanamiento({ activo: false, exitosSeguidos: 7, umbral: 3 }, 'exito_con_ia').activo).toBe(false)
  })
  it('un fallo lo REACTIVA y pone el contador a cero', () => {
    expect(siguienteAcompanamiento({ activo: false, exitosSeguidos: 40, umbral: 10 }, 'fallo')).toEqual({ activo: true, exitosSeguidos: 0, umbral: 10 })
  })
  it('apagado sigue apagado con más éxitos; umbral inválido → por defecto', () => {
    expect(siguienteAcompanamiento({ activo: false, exitosSeguidos: 10, umbral: 10 }, 'exito_sin_ia').activo).toBe(false)
    expect(siguienteAcompanamiento({ activo: true, exitosSeguidos: 0, umbral: 0 }, 'exito_sin_ia').umbral).toBe(10)
  })
})
