import { describe, it, expect, vi } from 'vitest'
import {
  CONSENTIMIENTO_LEAD_VERSION, ErrorSeguroConvenio, cuerpoLead, eurCentimos, fraseObligacion, interpretarRespuestaLead,
  parsearCobertura, parsearObligacion, resumenLead, situacionCobertura, textoAfectados, vigenteEn, type ObligacionConCobertura,
} from './seguro-convenio'
import { tarjetaSeguroConvenio } from './inicio-admin-reglas'
import { enviarLeadCorreduria, urlLeadPlataforma, PLATAFORMA_URL_DEFECTO } from './lead-correduria'

const base = {
  convenio: 'Hostelería de Sevilla', tipo: 'accidentes', contingencias: ['muerte', 'ip_absoluta'], capital: '30.000',
  ambito: 'todas', articulo: 'Art. 42', fuenteUrl: 'https://www.boe.es/diario_boe/txt.php?id=BOE-X', vigenteDesde: '2025-01-01', vigenteHasta: '',
}
const hoy = '2026-11-07'
const ob = (over: Partial<ObligacionConCobertura> = {}): ObligacionConCobertura => ({
  ...parsearObligacion(base), id: '00000000-0000-0000-0000-000000000001',
  cobertura: { estado: null, aseguradora: null, poliza: null, vencimiento: null }, ...over,
})

describe('parsearObligacion', () => {
  it('normaliza y pasa euros a céntimos', () => {
    const o = parsearObligacion(base)
    expect(o.capitalCent).toBe(3_000_000)
    expect(o.contingencias).toEqual(['muerte', 'ip_absoluta'])
    expect(o.categorias).toBeNull()
    expect(o.vigenteHasta).toBeNull()
  })
  it('exige fuente https, artículo y al menos una contingencia', () => {
    expect(() => parsearObligacion({ ...base, fuenteUrl: 'http://boe.es/x' })).toThrow(ErrorSeguroConvenio)
    expect(() => parsearObligacion({ ...base, fuenteUrl: '' })).toThrow(/enlace/)
    expect(() => parsearObligacion({ ...base, articulo: ' ' })).toThrow(/artículo/)
    expect(() => parsearObligacion({ ...base, contingencias: [] })).toThrow(/contingencia/)
    expect(() => parsearObligacion({ ...base, contingencias: ['muerte', 'lo_que_sea'] })).toThrow(/contingencia/)
    expect(() => parsearObligacion({ ...base, capital: '0' })).toThrow(/Capital/)
  })
  it('ámbito «algunas» exige categorías (sin duplicados por mayúsculas)', () => {
    expect(() => parsearObligacion({ ...base, ambito: 'algunas', categorias: '' })).toThrow(/categorías/)
    expect(parsearObligacion({ ...base, ambito: 'algunas', categorias: 'Camarero\ncamarero\nCocinero' }).categorias).toEqual(['Camarero', 'Cocinero'])
  })
  it('vigencia: fechas reales y fin ≥ inicio', () => {
    expect(() => parsearObligacion({ ...base, vigenteDesde: '2025-02-30' })).toThrow(/inicio/)
    expect(() => parsearObligacion({ ...base, vigenteHasta: '2024-12-31' })).toThrow(/antes/)
  })
})

describe('cobertura: tres estados', () => {
  it('vacío = no se sabe (null), nunca «no cubierto»', () => {
    expect(parsearCobertura({ estado: '' }).estado).toBeNull()
    expect(situacionCobertura(parsearCobertura({}), hoy)).toBe('no_se_sabe')
  })
  it('«no» no arrastra datos de póliza; «sí» exige aseguradora', () => {
    expect(parsearCobertura({ estado: 'no_cubierto', aseguradora: 'X', poliza: '1' })).toEqual({ estado: 'no_cubierto', aseguradora: null, poliza: null, vencimiento: null })
    expect(() => parsearCobertura({ estado: 'cubierto', aseguradora: '' })).toThrow(/aseguradora/)
    expect(parsearCobertura({ estado: 'cubierto', aseguradora: 'Mapfre' })).toEqual({ estado: 'cubierto', aseguradora: 'Mapfre', poliza: null, vencimiento: null })
    expect(() => parsearCobertura({ estado: 'quizas' })).toThrow()
  })
  it('una póliza vencida no cuenta como cubierta; sin vencimiento conocido, sí', () => {
    expect(situacionCobertura({ estado: 'cubierto', aseguradora: 'M', poliza: null, vencimiento: '2026-11-06' }, hoy)).toBe('cubierto_vencido')
    expect(situacionCobertura({ estado: 'cubierto', aseguradora: 'M', poliza: null, vencimiento: hoy }, hoy)).toBe('cubierto')
    expect(situacionCobertura({ estado: 'cubierto', aseguradora: 'M', poliza: null, vencimiento: null }, hoy)).toBe('cubierto')
  })
  it('vigencia con hoy inyectado', () => {
    expect(vigenteEn({ vigenteDesde: '2025-01-01', vigenteHasta: null }, hoy)).toBe(true)
    expect(vigenteEn({ vigenteDesde: '2027-01-01', vigenteHasta: null }, hoy)).toBe(false)
    expect(vigenteEn({ vigenteDesde: '2020-01-01', vigenteHasta: '2026-11-06' }, hoy)).toBe(false)
  })
})

describe('textos', () => {
  it('dinero en formato español con miles también en 4 cifras', () => {
    expect(eurCentimos(3_000_000)).toBe('30.000,00€')
    expect(eurCentimos(216_249)).toBe('2.162,49€')
  })
  it('frase de la obligación con «y/e»', () => {
    expect(fraseObligacion(ob())).toBe('un seguro de accidentes por 30.000,00€ (muerte e incapacidad permanente absoluta)')
    expect(fraseObligacion({ tipo: 'vida', capitalCent: 100, contingencias: ['ip_total', 'muerte'] })).toBe('un seguro de vida por 1,00€ (incapacidad permanente total y muerte)')
  })
  it('afectados: null = no se ha podido contar (nunca 0)', () => {
    expect(textoAfectados(null)).toMatch(/no se ha podido contar/)
    expect(textoAfectados({ afectados: 3, sinCategoria: 2 })).toBe('3 trabajadores afectados (+2 sin categoría registrada: no se sabe)')
  })
})

describe('lead a la correduría', () => {
  const resumen = resumenLead({ empresa: 'Bar Pepe SL', nif: 'B12345678', o: ob(), afectados: { afectados: 7, sinCategoria: 0 } })
  it('resumen sin datos personales: empresa, convenio, capital, afectados y fuente', () => {
    expect(resumen).toContain('Bar Pepe SL (NIF B12345678)')
    expect(resumen).toContain('Hostelería de Sevilla, Art. 42')
    expect(resumen).toContain('30.000,00€')
    expect(resumen).toContain('7 trabajadores afectados')
    expect(resumen.length).toBeLessThanOrEqual(1000)
  })
  it('cuerpo con el contrato de revisarLeadWeb; sin versión de la política de la web ni comerciales (no preguntados)', () => {
    const c = cuerpoLead({ nombre: 'Pilar', email: 'pilar@ejemplo.es', telefono: null }, 'accidentes', resumen)
    expect(c).toMatchObject({ nombre: 'Pilar', email: 'pilar@ejemplo.es', telefono: '', tipoSeguro: 'comercio', consentimiento: true })
    expect(c).not.toHaveProperty('consentimiento_version')
    expect(c).not.toHaveProperty('comunicaciones_comerciales')
    expect(String(c.comentario)).toContain(CONSENTIMIENTO_LEAD_VERSION)
    expect(String(c.comentario).length).toBeLessThanOrEqual(1000)
    expect(cuerpoLead({ nombre: 'P', email: 'p@e.es', telefono: null }, 'vida', 'x').tipoSeguro).toBe('vida')
  })
  it('respuesta: solo 2xx con ok:true es «enviado»; 422 rechazado; el resto, error', () => {
    expect(interpretarRespuestaLead(200, { ok: true }).estado).toBe('enviado')
    expect(interpretarRespuestaLead(200, { ok: false }).estado).toBe('error')
    expect(interpretarRespuestaLead(422, { ok: false, motivo: 'Email no válido' })).toMatchObject({ estado: 'rechazado', mensaje: 'Email no válido' })
    expect(interpretarRespuestaLead(502, null).estado).toBe('error')
    expect(interpretarRespuestaLead(0, null).estado).toBe('error')
  })
  it('envía al puerto de leads de plataforma reenviando la IP del responsable; nunca lanza', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const r = await enviarLeadCorreduria({ a: 1 }, '203.0.113.9', f as unknown as typeof fetch, 'https://p.example/api/publico/correduria/lead')
    expect(r.estado).toBe('enviado')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://p.example/api/publico/correduria/lead')
    expect((init.headers as Record<string, string>)['x-forwarded-for']).toBe('203.0.113.9')
    const caida = vi.fn(async () => { throw new Error('red') })
    expect((await enviarLeadCorreduria({}, null, caida as unknown as typeof fetch)).estado).toBe('error')
  })
  it('URL: PLATAFORMA_URL opcional con defecto al origen real', () => {
    expect(urlLeadPlataforma(undefined)).toBe(`${PLATAFORMA_URL_DEFECTO}/api/publico/correduria/lead`)
    expect(urlLeadPlataforma('https://preview.example/')).toBe('https://preview.example/api/publico/correduria/lead')
  })
})

describe('tarjeta del Inicio', () => {
  it('null = no se ha podido comprobar (neutra, nunca verde)', () => {
    expect(tarjetaSeguroConvenio(null)).toMatchObject({ tono: 'neutro', urgente: false })
  })
  it('sin obligaciones y sin revisar: lo pide (no afirma que no obligue); revisado sin obligación: no se pinta', () => {
    const t = tarjetaSeguroConvenio({ obligaciones: [], sinObligacionAt: null, hoy })
    expect(t).toMatchObject({ tono: 'neutro' })
    expect(t?.texto).toMatch(/¿Tu convenio obliga/)
    expect(tarjetaSeguroConvenio({ obligaciones: [], sinObligacionAt: '2026-11-01', hoy })).toBeNull()
  })
  it('sin contestar → «¿lo tienes?» urgente', () => {
    const t = tarjetaSeguroConvenio({ obligaciones: [ob()], sinObligacionAt: null, hoy })
    expect(t).toMatchObject({ tono: 'aviso', urgente: true })
    expect(t?.texto).toBe('Tu convenio obliga a tener un seguro de accidentes por 30.000,00€ (muerte e incapacidad permanente absoluta) — ¿lo tienes?')
  })
  it('«no» o vencida → alerta; todo cubierto → ok', () => {
    expect(tarjetaSeguroConvenio({ obligaciones: [ob({ cobertura: { estado: 'no_cubierto', aseguradora: null, poliza: null, vencimiento: null } })], sinObligacionAt: null, hoy }))
      .toMatchObject({ tono: 'alerta', urgente: true })
    expect(tarjetaSeguroConvenio({ obligaciones: [ob({ cobertura: { estado: 'cubierto', aseguradora: 'M', poliza: null, vencimiento: '2026-01-01' } })], sinObligacionAt: null, hoy }))
      .toMatchObject({ tono: 'alerta' })
    expect(tarjetaSeguroConvenio({ obligaciones: [ob({ cobertura: { estado: 'cubierto', aseguradora: 'M', poliza: null, vencimiento: null } })], sinObligacionAt: null, hoy }))
      .toMatchObject({ tono: 'ok', urgente: false })
  })
  it('una obligación no vigente no cuenta como cubierta ni pendiente', () => {
    const t = tarjetaSeguroConvenio({ obligaciones: [ob({ vigenteDesde: '2020-01-01', vigenteHasta: '2024-12-31' })], sinObligacionAt: null, hoy })
    expect(t).toMatchObject({ tono: 'neutro', urgente: false })
  })
})
