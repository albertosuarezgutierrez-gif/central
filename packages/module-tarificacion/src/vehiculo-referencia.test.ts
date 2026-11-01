// Vehículo de referencia de la oportunidad (01/11/2026). Fixtures SINTÉTICAS: solo nombres de catálogo, ninguna matrícula real.
// Cada brazo se ha visto FALLAR rompiendo lo que protege (y restaurado).
import { describe, it, expect } from 'vitest'
import {
  avisoEsSupuesto,
  elegirOpcionPorVehiculoReferencia,
  firmezaPrecioRpa,
  validarFormularioAuto,
  validarVehiculoReferencia,
  vehiculoReferenciaDesdeConfirmado,
  vehiculoReferenciaDesdeSeleccion,
  vehiculoReferenciaEfectivo,
  type VehiculoReferencia,
} from './index.ts'

const vr = (o: Partial<VehiculoReferencia>): VehiculoReferencia => ({
  origen: 'mapfre', marca: null, modelo: null, version: null, carroceria: null, puertas: null, cc: null, cv: null, combustible: null, anio: null, ...o,
})

describe('validarVehiculoReferencia', () => {
  it('rechaza claves extra (matrícula) y textos con forma de dato personal', () => {
    expect(validarVehiculoReferencia({ ...vr({ modelo: 'FORFOUR' }), matricula: 'X' }).ok).toBe(false)
    expect(validarVehiculoReferencia(vr({ modelo: 'FORFOUR', version: 'PURE 1234BCD' })).ok).toBe(false)
    expect(validarVehiculoReferencia(vr({})).ok).toBe(false)
    expect(validarVehiculoReferencia({ ...vr({ modelo: 'FORFOUR' }), origen: 'ia' }).ok).toBe(false)
    expect(validarVehiculoReferencia(vr({ marca: 'SMART', modelo: 'FORFOUR' })).ok).toBe(true)
  })
})

describe('vehiculoReferenciaEfectivo · prioridad de orígenes', () => {
  const humano = vr({ origen: 'humano', modelo: 'FORTWO' })
  const mapfre = vr({ origen: 'mapfre', version: 'SMART FORFOUR 5P 75CV 1124CC' })
  const poliza = vr({ origen: 'poliza', marca: 'SMART', modelo: 'FORFOUR', version: 'PURE 1.1' })
  const allianz = vr({ origen: 'allianz', marca: 'SMART', modelo: 'FORTWO' })
  it('humano gana a todos, sea cual sea el orden', () => {
    expect(vehiculoReferenciaEfectivo([allianz, poliza, mapfre, humano])?.origen).toBe('humano')
  })
  it('mapfre > póliza > allianz', () => {
    expect(vehiculoReferenciaEfectivo([allianz, poliza, mapfre])?.origen).toBe('mapfre')
    expect(vehiculoReferenciaEfectivo([allianz, poliza])?.origen).toBe('poliza')
    expect(vehiculoReferenciaEfectivo([allianz, null, undefined])?.origen).toBe('allianz')
  })
  it('lo inválido no cuenta', () => {
    expect(vehiculoReferenciaEfectivo([{ origen: 'humano' }, allianz])?.origen).toBe('allianz')
    expect(vehiculoReferenciaEfectivo([])).toBeNull()
  })
  it('constructores desde Mapfre y desde catálogo separado', () => {
    const m = vehiculoReferenciaDesdeConfirmado({ origen: 'mapfre', denominacion: 'SMART FORFOUR 5P', cv: 75, cc: 1124, puertas: 5, fechaInicio: '2016-01-01' })
    expect(m).toMatchObject({ origen: 'mapfre', version: 'SMART FORFOUR 5P', cv: 75, cc: 1124, puertas: 5, anio: 2016 })
    expect(vehiculoReferenciaDesdeSeleccion({ marca: 'SMART', modelo: 'FORFOUR', descripcion: 'PURE 1.1' }, 'poliza')).toMatchObject({ origen: 'poliza', modelo: 'FORFOUR', version: 'PURE 1.1' })
    expect(vehiculoReferenciaDesdeSeleccion({ marca: 'SMART' }, 'poliza')).toBeNull()
  })
})

describe('elegirOpcionPorVehiculoReferencia', () => {
  const ref = vr({ origen: 'mapfre', marca: 'SMART', modelo: 'FORFOUR', version: 'PURE 1.1', puertas: 5, cv: 75, cc: 1124 })

  it('casa única: el modelo de Generali con la referencia de Mapfre → coincidencia, supuesto con el origen', () => {
    const r = elegirOpcionPorVehiculoReferencia(['FORTWO CABRIO', 'FORFOUR', 'FORTWO COUPE'], ref, { nivel: 'modelo' })
    expect(r).toMatchObject({ tipo: 'coincidencia', indice: 1, etiqueta: 'FORFOUR' })
    if (r.tipo !== 'coincidencia') throw new Error('no')
    expect(r.supuesto).toContain('vehículo según Mapfre')
    expect(r.supuesto).toContain('supuesto')
  })

  it('ninguna casa: elige por aproximación (palabras de la versión), nunca para', () => {
    const r = elegirOpcionPorVehiculoReferencia(['FORTWO PASSION 52', 'FORTWO PULSE 52', 'FORTWO PURE 52'], ref)
    expect(r).toMatchObject({ tipo: 'aproximacion', indice: 2 })
    if (r.tipo !== 'aproximacion') throw new Error('no')
    expect(r.supuesto).toContain('por aproximación al vehículo de referencia')
  })

  it('varias casan: gana la más cercana en potencia/cilindrada', () => {
    const r = elegirOpcionPorVehiculoReferencia(['FORFOUR 1.0 61CV 999CC', 'FORFOUR 1.1 75CV 1124CC', 'FORFOUR 1.3 95CV 1332CC'], ref)
    expect(r).toMatchObject({ indice: 1 })
  })

  it('kW se compara como CV (52 kW ≈ 71 CV más cerca de 75 que 45 kW)', () => {
    const r = elegirOpcionPorVehiculoReferencia(['FORFOUR 45KW', 'FORFOUR 52KW'], vr({ modelo: 'FORFOUR', cv: 72 }))
    expect(r).toMatchObject({ indice: 1 })
  })

  it('carrocería/puertas contradichas pierden aunque compartan palabras', () => {
    const r = elegirOpcionPorVehiculoReferencia(['FORFOUR PURE 3P', 'FORFOUR PURE 5P'], ref)
    expect(r).toMatchObject({ indice: 1 })
    const c = elegirOpcionPorVehiculoReferencia(['FORTWO CABRIO', 'FORTWO COUPE'], vr({ modelo: 'FORTWO', carroceria: 'COUPE' }))
    expect(c).toMatchObject({ indice: 1 })
  })

  it('normaliza tildes, mayúsculas y relleno (marca, «versión», gasolina)', () => {
    const r = elegirOpcionPorVehiculoReferencia(['Versión Pássion', 'versión pure gasolina'], vr({ marca: 'Smart', modelo: 'Forfour', version: 'PURE' }))
    expect(r).toMatchObject({ indice: 1 })
  })

  it('el relleno («modelo», «versión») no puntúa como palabra en común', () => {
    const r = elegirOpcionPorVehiculoReferencia(['MODELO VERSION PASSION', 'PURE'], vr({ modelo: 'X1', version: 'MODELO VERSION PURE' }))
    expect(r).toMatchObject({ indice: 1 })
  })

  it('el modelo de la referencia pesa por encima del parecido de palabras', () => {
    const r = elegirOpcionPorVehiculoReferencia(['FORTWO PASSION', 'FORFOUR PURE'], vr({ modelo: 'FORFOUR', version: 'PASSION' }))
    expect(r).toMatchObject({ indice: 1 })
  })

  it('el aviso no lleva comas (los bots unen supuestos con «, »)', () => {
    const r = elegirOpcionPorVehiculoReferencia(['FORFOUR PURE, 5P'], ref)
    if (r.tipo !== 'coincidencia' && r.tipo !== 'aproximacion') throw new Error('no')
    expect(r.supuesto).not.toContain(',')
  })

  it('empate total → la primera del portal', () => {
    const r = elegirOpcionPorVehiculoReferencia(['ALFA', 'BETA', 'GAMMA'], vr({ modelo: 'ZETA' }))
    expect(r).toMatchObject({ tipo: 'aproximacion', indice: 0 })
  })

  it('vacías y «Otros…» nunca se eligen; sin opciones → sin_opciones', () => {
    expect(elegirOpcionPorVehiculoReferencia(['-- Seleccione --', 'OTROS MODELOS', 'FORFOUR'], ref)).toMatchObject({ indice: 2 })
    expect(elegirOpcionPorVehiculoReferencia(['-- Seleccione --', 'Otros'], ref)).toEqual({ tipo: 'sin_opciones' })
  })

  it('solo para si la lista es de OTRA marca, o no hay referencia', () => {
    expect(elegirOpcionPorVehiculoReferencia(['IBIZA', 'LEON'], ref, { marcaLista: 'SEAT' })).toEqual({ tipo: 'sin_marca' })
    expect(elegirOpcionPorVehiculoReferencia(['FORFOUR'], ref, { marcaLista: 'smart' })).toMatchObject({ indice: 0 })
    expect(elegirOpcionPorVehiculoReferencia(['FORFOUR'], null)).toEqual({ tipo: 'sin_referencia' })
  })

  it('si unas opciones nombran la marca de la referencia, solo cuentan esas', () => {
    const r = elegirOpcionPorVehiculoReferencia(['SEAT IBIZA FORFOUR', 'SMART FORTWO'], vr({ marca: 'SMART', modelo: 'FORFOUR' }))
    expect(r).toMatchObject({ indice: 1 })
  })

  it('humano gana: con la referencia efectiva humana se elige lo que dijo la persona', () => {
    const efectiva = vehiculoReferenciaEfectivo([ref, vr({ origen: 'humano', modelo: 'FORTWO', carroceria: 'COUPE' })])
    const r = elegirOpcionPorVehiculoReferencia(['FORTWO CABRIO', 'FORFOUR', 'FORTWO COUPE'], efectiva, { nivel: 'modelo' })
    expect(r).toMatchObject({ indice: 2 })
    if (r.tipo === 'sin_referencia' || r.tipo === 'sin_opciones' || r.tipo === 'sin_marca') throw new Error('no')
    expect(r.supuesto).toContain('vehículo según elección en la bandeja')
  })

  it('el aviso cuenta como supuesto → precio estimado aunque SINCO hable', () => {
    const r = elegirOpcionPorVehiculoReferencia(['FORFOUR'], ref)
    if (r.tipo !== 'coincidencia' && r.tipo !== 'aproximacion') throw new Error('no')
    expect(avisoEsSupuesto(r.supuesto)).toBe(true)
    expect(firmezaPrecioRpa({ compania: 'allianz', ramo: 'auto', riesgo: { polizaAnteriorUltimos5: '12345' }, oferta: { polizaAnteriorTecleada: true, avisos: [r.supuesto] } })).toBe('estimado')
    expect(r.supuesto).not.toContain(',')
  })
})

describe('formulario de auto: vehiculoReferencia', () => {
  const BASE = {
    ramo: 'auto', matricula: '0000BBB', codigoPostal: '41003',
    conductor: { fechaNacimiento: '1980-01-01', fechaCarne: '2000-01-01' },
  }
  it('se conserva si es válido y se descarta (sin tumbar el formulario) si no', () => {
    const ok = validarFormularioAuto({ ...BASE, vehiculoReferencia: vr({ modelo: 'FORFOUR' }) }, new Date('2026-11-01T10:00:00Z'))
    const malo = validarFormularioAuto({ ...BASE, vehiculoReferencia: { origen: 'mapfre', modelo: 'X', matricula: 'Y' } }, new Date('2026-11-01T10:00:00Z'))
    if (!ok.ok) throw new Error(ok.errores.join('; '))
    expect(ok.formulario.vehiculoReferencia?.modelo).toBe('FORFOUR')
    if (!malo.ok) throw new Error(malo.errores.join('; '))
    expect(malo.formulario.vehiculoReferencia).toBeUndefined()
  })
})
