// Pistas aprendidas del localizador (15/10/2026). Un brazo por regla: forma cerrada, ids dinámicos, datos personales,
// frontera bancaria y emisión, etiqueta con la que se aprendió, al GUARDAR (asegura) y al USAR (worker).
import { describe, it, expect } from 'vitest'
import { clavePista, elegirCandidatoAtasco, esClavePista, esIdDinamico, leerAtascoWorker, normalizarEtiquetaPista, pistaDeDescripcion, textoBancarioOPago, validarPista, type CandidatoAtasco } from './index.ts'

/** Sufijo de etiqueta que toda pista lleva. */
const E = (e = 'matricula') => ` @etiqueta="${e}"`

describe('clavePista', () => {
  it('paso + etiqueta en slug, con prefijo y dentro del CHECK de la tabla', () => {
    expect(clavePista('Datos del vehículo', 'Matrícula *')).toBe('_l_datos_del_vehiculo__matricula')
    const larga = clavePista('x'.repeat(80), 'y'.repeat(80))
    expect(larga).toMatch(/^[a-z0-9_]{1,60}$/)
    expect(esClavePista(larga)).toBe(true)
    expect(esClavePista('matricula')).toBe(false)
  })
  it('una clave del formador nunca es de pista (claveCampo quita los «_» del principio: «L. Conductor» → l_conductor)', () => {
    // Misma regla que `claveCampo` del worker (services/tarificador-rpa/src/formador.ts).
    const claveCampo = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'campo'
    expect(claveCampo('L. Conductor')).toBe('l_conductor')
    expect(esClavePista(claveCampo('L. Conductor'))).toBe(false)
    expect(esClavePista(claveCampo('_L_ p__x'))).toBe(false)
  })
})

describe('esIdDinamico', () => {
  it('marca los generados', () => {
    for (const v of ['mat-input-12', 'nx-input-3', 'cdk-overlay-0', 'ng-tns-c12-3', ':r1:', 'radix-:r1:', 'downshift-0-input', 'input12', 'mat-input-3', 'ember123', 'form:j_idt45:mat', 'a1b2c3d4e5', '123e4567-e89b-12d3-a456-426614174000', 'deadbeef00', 'campo123x', 'fila_7', '']) expect(esIdDinamico(v), v).toBe(true)
  })
  it('deja los estables', () => {
    for (const v of ['matricula', 'txtMatricula', 'codigoPostal', 'fechaNacimientoConductor']) expect(esIdDinamico(v), v).toBe(false)
  })
})

describe('textoBancarioOPago (solo datos bancarios de verdad)', () => {
  it('veta cuenta, IBAN y tarjeta, también en camelCase/kebab/snake', () => {
    for (const t of ['IBAN', 'numCCC', 'Titular de la cuenta', 'numeroTarjeta', 'Titular de la tarjeta', 'cardNumber', 'creditCard', 'creditcard', 'cvv2', 'CVC', 'card-expiry', 'card_holder', 'cc-number']) expect(textoBancarioOPago(t), t).toBe(true)
  })
  it('NO veta campos legítimos al tarificar (recibo, cobro, forma de pago, caducidad)', () => {
    for (const t of ['Primer Recibo', 'Forma de pago', 'Fraccionamiento de pago', 'Cobro', 'Fecha de caducidad', 'periodicidadRecibo', 'Matrícula']) expect(textoBancarioOPago(t), t).toBe(false)
  })
})

describe('validarPista', () => {
  it('admite atributo estable y rol + nombre, con o sin ámbito, y siempre con su etiqueta', () => {
    expect(validarPista(`main >> input[name="matricula"]${E()}`).ok).toBe(true)
    expect(validarPista(`select[formcontrolname="matricula"]${E()}`).ok).toBe(true)
    expect(validarPista(`#formulario >> role=textbox[name="Matrícula"]${E()}`).ok).toBe(true)
    expect(validarPista(`div.form > section [role=main] >> input[name="matricula"]${E()}`).ok).toBe(true)
    expect(validarPista(`input[name="primerRecibo"]${E('primer recibo')}`).ok).toBe(true)
  })
  it('sin etiqueta o con etiqueta sin normalizar no vale', () => {
    expect(validarPista('main >> input[name="matricula"]').ok).toBe(false)
    expect(validarPista(`input[name="matricula"]${E('Matrícula')}`).ok).toBe(false)
  })
  it('una etiqueta con palabra de emisión no vale', () => {
    expect(validarPista(`input[name="importe"]${E('emitir poliza')}`).ok).toBe(false)
    expect(validarPista(`input[name="importe"]${E('contratar ahora')}`).ok).toBe(false)
  })
  it('rechaza XPath y CSS libre', () => {
    expect(validarPista(`xpath=/html/body/input[1]${E()}`).ok).toBe(false)
    expect(validarPista(`main input.foo${E()}`).ok).toBe(false)
    expect(validarPista(`input[onclick="x"]${E()}`).ok).toBe(false)
    expect(validarPista(`a >> b >> input[name="x"]${E()}`).ok).toBe(false)
  })
  it('exige un control EDITABLE (input/select/textarea o rol de campo)', () => {
    expect(validarPista(`button[name="matricula"]${E()}`).ok).toBe(false)
    expect(validarPista(`a[name="matricula"]${E()}`).ok).toBe(false)
    expect(validarPista(`[name="matricula"]${E()}`).ok).toBe(false)
    expect(validarPista(`role=button[name="Calcular"]${E()}`).ok).toBe(false)
  })
  it('ámbito CSS cerrado: nada de pseudo-clases, funciones, listas, comodín ni motores de Playwright', () => {
    for (const a of ['main:has(input)', 'main, nav', 'main *', 'text=Matrícula', 'internal:role=main', 'main >> nth=0', 'div:nth-child(2)', 'xpath=//main']) {
      expect(validarPista(`${a} >> input[name="matricula"]${E()}`).ok, a).toBe(false)
    }
  })
  it('ámbito con palabra de emisión o bancaria: rechazado', () => {
    expect(validarPista(`#emitirPoliza >> input[name="matricula"]${E()}`).ok).toBe(false)
    expect(validarPista(`#datosBancarios >> input[name="matricula"]${E()}`).ok).toBe(false)
  })
  it('rechaza ids dinámicos (en la base y en el ámbito)', () => {
    expect(validarPista(`input[id="mat-input-12"]${E()}`).ok).toBe(false)
    expect(validarPista(`#mat-tab-3 >> input[name="matricula"]${E()}`).ok).toBe(false)
  })
  it('rechaza datos personales', () => {
    expect(validarPista(`role=textbox[name="12345678Z"]${E()}`).ok).toBe(false)
  })
  it('rechaza bancario (en la base y en la etiqueta)', () => {
    for (const s of ['input[name="iban"]', 'input[name="numCCC"]', 'role=textbox[name="Titular de la cuenta"]', 'input[name="numeroTarjeta"]', 'input[name="cardNumber"]', 'input[name="cvv2"]']) {
      expect(validarPista(`${s}${E()}`).ok, s).toBe(false)
    }
    expect(validarPista(`input[name="campoUno"]${E('iban')}`).ok).toBe(false)
  })
  it('rechaza emisión', () => {
    expect(validarPista(`input[name="emitirPoliza"]${E()}`).ok).toBe(false)
  })
})

describe('pistaDeDescripcion', () => {
  it('prefiere formcontrolname/name, nunca el id dinámico, y lleva la etiqueta normalizada', () => {
    expect(pistaDeDescripcion({ tag: 'input', id: 'mat-input-3', name: 'matricula', rol: 'textbox', nombre: 'Matrícula *' }, 'main')).toBe(`main >> input[name="matricula"]${E()}`)
    expect(pistaDeDescripcion({ tag: 'input', id: 'mat-input-3', name: null, rol: 'textbox', nombre: 'Matrícula' }, 'main')).toBe(`main >> role=textbox[name="Matrícula"]${E()}`)
  })
  it('sin nada estable o sin etiqueta → null', () => {
    expect(pistaDeDescripcion({ tag: 'input', id: 'mat-input-3', name: null, rol: null, nombre: null }, null)).toBeNull()
    expect(pistaDeDescripcion({ tag: 'input', id: null, name: 'matricula', rol: 'textbox', nombre: null }, null)).toBeNull()
  })
  it('normalizarEtiquetaPista: exacta y recortada', () => {
    expect(normalizarEtiquetaPista('  Matrícula: * ')).toBe('matricula')
    expect(normalizarEtiquetaPista('x'.repeat(300))!.length).toBe(100)
    expect(normalizarEtiquetaPista(' * ')).toBeNull()
  })
})

const cand = (x: Partial<CandidatoAtasco>): CandidatoAtasco => ({ n: 1, tag: 'input', id: null, name: null, type: 'text', role: 'textbox', texto: null, etiqueta: 'Matrícula', marco: 'principal', selector: `main >> input[name="matricula"]${E()}`, ...x })

describe('al GUARDAR (asegura): elegirCandidatoAtasco y leerAtascoWorker', () => {
  it('con clave de pista, un candidato bancario no se aprende nunca', () => {
    expect(elegirCandidatoAtasco([cand({ etiqueta: 'IBAN' })], 1, '_l_p__iban').ok).toBe(false)
    expect(elegirCandidatoAtasco([cand({ selector: `main >> input[name="iban"]${E('cuenta')}`, etiqueta: 'Cuenta' })], 1, '_l_p__cuenta').ok).toBe(false)
  })
  it('con clave de pista, el selector tiene que ser una pista válida', () => {
    expect(elegirCandidatoAtasco([cand({ selector: 'xpath=/html/body/input[1]' })], 1, '_l_p__matricula').ok).toBe(false)
    expect(elegirCandidatoAtasco([cand({})], 1, '_l_p__matricula').ok).toBe(true)
    expect(elegirCandidatoAtasco([cand({ etiqueta: 'Primer Recibo', selector: `main >> input[name="primerRecibo"]${E('primer recibo')}` })], 1, '_l_p__primer_recibo').ok).toBe(true)
  })
  it('una clave del formador (no de pista) conserva el comportamiento anterior (tampoco se filtra por las palabras bancarias nuevas)', () => {
    expect(elegirCandidatoAtasco([cand({ selector: 'xpath=/html/body/input[1]' })], 1, 'matricula').ok).toBe(true)
    expect(elegirCandidatoAtasco([cand({ etiqueta: 'Número de tarjeta', selector: '#t' })], 1, 'l_conductor').ok).toBe(true)
    const a = leerAtascoWorker({ clave: 'l_conductor', tipo: 'campo', descripcion: 'd', candidatos: [cand({ etiqueta: 'Número de tarjeta', selector: '#t' })] })
    expect(a?.candidatos.length).toBe(1)
  })
  it('leerAtascoWorker (clave de pista) quita los candidatos bancarios y renumera; «Primer Recibo» se queda', () => {
    const a = leerAtascoWorker({ clave: '_l_p__x', tipo: 'campo', descripcion: 'd', candidatos: [cand({ etiqueta: 'IBAN' }), cand({ n: 2, etiqueta: 'Primer Recibo' })] })
    expect(a?.candidatos.map((c) => [c.n, c.etiqueta])).toEqual([[1, 'Primer Recibo']])
  })
})
