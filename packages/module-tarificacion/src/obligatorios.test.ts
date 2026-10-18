// Cepo de la fuente ÚNICA de «datos obligatorios para llegar a precio» (15/10/2026). Datos SINTÉTICOS.
// Ata la lista a los validadores de cada ramo en los DOS sentidos (todo lo declarado lo exige el validador; con solo lo
// declarado, el validador pasa) y comprueba los obligatorios propios de cada portal. Lo que lee cada adaptador lo ata el
// cepo del worker (services/tarificador-rpa/test/obligatorios-adaptadores.test.ts).
import { describe, it, expect } from 'vitest'
import { validarFormularioAuto } from './formulario-auto.ts'
import { validarFormularioHogar } from './formulario-hogar.ts'
import { validarFormularioComunidad } from './capacidades.ts'
import {
  capacidadesConObligatorios,
  faltanParaTarificar,
  supuestosFavorablesPara,
  mensajeFaltan,
  obligatoriosDeRamo,
  obligatoriosPara,
  valorEnRuta,
} from './obligatorios.ts'

const HOY = new Date('2026-10-15T10:00:00Z')

const coche = () => ({
  ramo: 'auto',
  matricula: '1234BCD',
  codigoPostal: '41003',
  conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01', sexo: 'mujer' },
  tomadorEsConductor: true,
  tomadorEsPropietario: true,
  aniosAseguradoAnterior: 3,
  siniestrosUltimos5Anios: 0,
  garajeNoche: false,
  companiaAnterior: 'COMPAÑÍA DE PRUEBA',
  documentoTomador: '00000000T',
  datosTomador: { tipo: 'fisica', nombre: 'NOMBRE', apellido1: 'APELLIDO', apellido2: null, fechaNacimiento: '1985-03-10' },
  seleccionVehiculo: { marca: 'MARCA', modelo: 'MODELO', descripcion: 'VERSION 1.0' } as Record<string, unknown>,
})
const moto = () => ({ ...coche(), ramo: 'moto', seleccionVehiculo: { marca: 'MARCA', modelo: 'MODELO', clase: 2, cilindradaCc: 250 } })
const hogar = () => ({
  ramo: 'hogar',
  tomador: { documentoIdentidad: '00000000T', fechaNacimiento: '1980-01-15' },
  inmueble: { codigoPostal: '41001', municipio: 'SEVILLA', nombreVia: 'PRUEBA', numero: '1', planta: '2', anioConstruccion: 1990, superficieM2: 90, referenciaCatastral: '1234567AB1234C0001DF' },
  hogar: { uso: 'habitual', regimen: 'propietario', tipoVivienda: 'piso', conMadera: false },
  datosTomador: { nombre: 'NOMBRE', apellido1: 'APELLIDO' },
})
const comunidad = () => ({
  ramo: 'comunidades',
  direccion: { via: 'Calle Prueba', numero: '10', codigoPostal: '41003', municipio: 'Sevilla', provincia: 'Sevilla' },
  fechaEfecto: '2026-10-20',
  fechaTermino: '2027-10-20',
  m2Construidos: 1200,
  anioConstruccion: 1975,
  plantas: 5,
  numEdificios: 1,
  numViviendasYLocales: 20,
  capitalContinente: 1_500_000,
  tipoVivienda: 'Viviendas Pisos en Alto',
  uso: 'Habitual',
  listaPropietarios: '> 50%',
})

const COMPLETO: Record<string, () => Record<string, unknown>> = { auto: coche, moto, hogar, comunidades: comunidad }
const VALIDA: Record<string, (x: unknown) => boolean> = {
  auto: (x) => validarFormularioAuto(x, HOY).ok,
  moto: (x) => validarFormularioAuto(x, HOY).ok,
  hogar: (x) => validarFormularioHogar(x, HOY).ok,
  comunidades: (x) => validarFormularioComunidad(x, HOY).ok,
}

function sinRuta(o: Record<string, unknown>, ruta: string): Record<string, unknown> {
  const copia = structuredClone(o)
  const partes = ruta.split('.')
  let cur: Record<string, unknown> = copia
  for (const p of partes.slice(0, -1)) cur = cur[p] as Record<string, unknown>
  delete cur[partes[partes.length - 1]]
  return copia
}
function conRuta(o: Record<string, unknown>, ruta: string, v: unknown): void {
  const partes = ruta.split('.')
  let cur = o
  for (const p of partes.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>
  cur[partes[partes.length - 1]] = v
}

describe('obligatorios · declaraciones', () => {
  it('los 9 bots (registrados o en construcción) tienen declaración; lo desconocido es null («no se sabe»), nunca []', () => {
    const esperados = ['allianz::comunidades', 'allianz::moto', 'allianz::auto', 'allianz::hogar', 'mapfre::auto', 'mapfre::moto', 'mapfre::hogar', 'occident::hogar', 'generali::auto']
    expect(capacidadesConObligatorios().map((c) => `${c.compania}::${c.ramo}`).sort()).toEqual([...esperados].sort())
    for (const k of esperados) {
      const [c, r] = k.split('::')
      expect(obligatoriosPara(c, r), k).not.toBeNull()
    }
    expect(obligatoriosPara('reale', 'auto')).toBeNull()
    expect(faltanParaTarificar('reale', 'auto', coche())).toBeNull()
    expect(obligatoriosPara('generali', 'moto'), 'Generali solo turismos por ahora').toBeNull()
    expect(faltanParaTarificar('allianz', 'decesos', {})).toBeNull()
    expect(obligatoriosDeRamo('decesos')).toBeNull()
    // Compañía en forma no canónica: misma declaración.
    expect(obligatoriosPara(' Mapfre ', 'AUTO')).toEqual(obligatoriosPara('mapfre', 'auto'))
  })

  it('claves únicas y etiquetas humanas (sin claves técnicas ni puntos)', () => {
    for (const { compania, ramo } of capacidadesConObligatorios()) {
      const l = obligatoriosPara(compania, ramo)!
      expect(new Set(l.map((c) => c.clave)).size, `${compania}/${ramo}`).toBe(l.length)
      for (const c of l) expect(c.etiqueta, c.clave).toMatch(/^[a-záéíóúñ(][^.]*$/i)
    }
  })

  it('Allianz Comunidades deriva sus desplegables de los extras obligatorios de su capacidad', () => {
    const claves = obligatoriosPara('allianz', 'comunidades')!.map((c) => c.clave)
    expect(claves).toEqual(expect.arrayContaining(['tipoVivienda', 'uso', 'listaPropietarios']))
    expect(claves).not.toContain('modalidad')
  })
})

describe('obligatorios · forma del ramo ⇔ validador del ramo', () => {
  for (const ramo of ['auto', 'moto', 'hogar', 'comunidades']) {
    it(`${ramo}: el formulario completo pasa el validador`, () => {
      expect(VALIDA[ramo](COMPLETO[ramo]())).toBe(true)
    })
    it(`${ramo}: quitar CUALQUIER obligatorio de forma lo rechaza el validador y lo señala faltanParaTarificar`, () => {
      for (const c of obligatoriosDeRamo(ramo)!) {
        const sin = sinRuta(COMPLETO[ramo](), c.clave)
        expect(VALIDA[ramo](sin), `${ramo}: el validador no exige ${c.clave} (declarado de más)`).toBe(false)
        const cualquiera = capacidadesConObligatorios().find((x) => x.ramo === ramo)!
        expect(faltanParaTarificar(cualquiera.compania, ramo, sin)!.map((f) => f.clave), c.clave).toContain(c.clave)
      }
    })
    it(`${ramo}: con SOLO los obligatorios de forma, el validador pasa (no falta ninguno por declarar)`, () => {
      const completo = COMPLETO[ramo]()
      const minimo: Record<string, unknown> = { ramo }
      for (const c of obligatoriosDeRamo(ramo)!) conRuta(minimo, c.clave, valorEnRuta(completo, c.clave))
      expect(VALIDA[ramo](minimo), `${ramo}: el validador exige algo no declarado en obligatorios.ts`).toBe(true)
    })
  }

  it('comunidades: viviendas + locales cuentan como «número de viviendas y locales» (como el validador)', () => {
    const sin = sinRuta(comunidad(), 'numViviendasYLocales')
    expect(faltanParaTarificar('allianz', 'comunidades', { ...sin, numViviendas: 18, numLocales: 2 })).toEqual([])
    expect(faltanParaTarificar('allianz', 'comunidades', { ...sin, numViviendas: 18 })!.map((f) => f.clave)).toEqual(['numViviendasYLocales'])
  })
})

describe('obligatorios · propios de cada portal', () => {
  it('con el formulario completo no falta nada en ningún bot de su ramo', () => {
    for (const { compania, ramo } of capacidadesConObligatorios()) expect(faltanParaTarificar(compania, ramo, COMPLETO[ramo]()), `${compania}/${ramo}`).toEqual([])
  })

  it('quitar cada obligatorio propio lo señala (Allianz moto, Mapfre auto/moto/hogar, Allianz comunidades)', () => {
    const casos: [string, string, string[]][] = [
      ['allianz', 'moto', ['seleccionVehiculo.clase', 'conductor.sexo']],
      ['mapfre', 'auto', ['companiaAnterior', 'documentoTomador', 'datosTomador.nombre', 'datosTomador.apellido1']],
      ['mapfre', 'moto', ['companiaAnterior', 'documentoTomador', 'datosTomador.nombre', 'datosTomador.apellido1']],
      ['mapfre', 'hogar', ['inmueble.referenciaCatastral', 'datosTomador.nombre', 'datosTomador.apellido1']],
      ['allianz', 'comunidades', ['tipoVivienda', 'uso', 'listaPropietarios']],
    ]
    for (const [c, r, claves] of casos) {
      for (const clave of claves) {
        const f = faltanParaTarificar(c, r, sinRuta(COMPLETO[r](), clave))!
        expect(f.map((x) => x.clave), `${c}/${r} sin ${clave}`).toContain(clave)
      }
    }
  })

  // 18/10/2026 (Alberto): Generali no saca el vehículo por matrícula; lo pone asegura desde el ok de Allianz/Mapfre de la oportunidad.
  it('Generali auto: sin vehículo confirmado falta (salvo en espera); vale seleccionVehiculo o la denominación de Mapfre', () => {
    const { seleccionVehiculo: _sv, ...sinVehiculo } = coche()
    expect(faltanParaTarificar('generali', 'auto', sinVehiculo)!.map((f) => f.clave)).toEqual(['seleccionVehiculo'])
    expect(faltanParaTarificar('generali', 'auto', sinVehiculo, { sinFicha: true }), 'lo pone asegura: el formulario no lo pide').toEqual([])
    expect(faltanParaTarificar('generali', 'auto', { ...sinVehiculo, esperaVehiculo: true }), 'en espera no bloquea el encolado').toEqual([])
    expect(faltanParaTarificar('generali', 'auto', { ...sinVehiculo, vehiculoConfirmado: { origen: 'mapfre', denominacion: 'MARCA MODELO 1.0' } })).toEqual([])
    expect(faltanParaTarificar('generali', 'auto', { ...sinVehiculo, seleccionVehiculo: { marca: 'MARCA', modelo: '' } })!.map((f) => f.clave)).toEqual(['seleccionVehiculo'])
    expect(faltanParaTarificar('generali', 'auto', coche())).toEqual([])
  })

  it('tres estados: 0 siniestros y false son DATOS; null es «no consta» y falta', () => {
    expect(faltanParaTarificar('mapfre', 'auto', { ...coche(), siniestrosUltimos5Anios: 0, aniosAseguradoAnterior: 0, companiaAnterior: null })).toEqual([])
    expect(faltanParaTarificar('allianz', 'moto', { ...moto(), conductor: { ...moto().conductor, sexo: null } })!.map((f) => f.clave)).toEqual(['conductor.sexo'])
  })

  // 18/10/2026, decisión de Alberto «supuesto favorable en todo»: los antecedentes que faltan NO bloquean ningún bot de vehículo.
  it('supuesto favorable: sin años asegurado ni siniestros no falta nada (Allianz moto); se dicen como SUPUESTOS, no como dato', () => {
    const sinAnt = { ...moto(), aniosAseguradoAnterior: null, siniestrosUltimos5Anios: undefined }
    expect(faltanParaTarificar('allianz', 'moto', sinAnt)).toEqual([])
    expect(supuestosFavorablesPara('allianz', 'moto', sinAnt)).toEqual(['aniosAseguradoAnterior', 'siniestrosUltimos5Anios'])
    expect(supuestosFavorablesPara('allianz', 'moto', moto()), '0 siniestros y 3 años son DATOS').toEqual([])
    expect(supuestosFavorablesPara('allianz', 'hogar', hogar())).toEqual([])
    expect(supuestosFavorablesPara('reale', 'moto', sinAnt), 'sin declaración: no se sabe').toBeNull()
    // Allianz Turismos no declara los antecedentes como obligatorios (los resuelve el propio bot): no se rotulan aquí.
    expect(supuestosFavorablesPara('allianz', 'auto', { ...coche(), aniosAseguradoAnterior: null })).toEqual([])
  })

  it('supuesto favorable en Mapfre auto: 5 años o más ⇒ tuvo seguro ⇒ su nombre SÍ hace falta (no se inventa la compañía)', () => {
    expect(faltanParaTarificar('mapfre', 'auto', { ...coche(), siniestrosUltimos5Anios: null })).toEqual([])
    expect(faltanParaTarificar('mapfre', 'auto', { ...coche(), aniosAseguradoAnterior: null })).toEqual([])
    expect(faltanParaTarificar('mapfre', 'auto', { ...coche(), aniosAseguradoAnterior: null, companiaAnterior: null })!.map((f) => f.clave)).toEqual(['companiaAnterior'])
  })

  it('sexo del conductor (Allianz moto): lo pone asegura desde el Sr./Sra. de la ficha → `sinFicha` no lo pide; sin ficha que lo tenga, falta', () => {
    const sinSexo = { ...moto(), conductor: { ...moto().conductor, sexo: null } }
    expect(faltanParaTarificar('allianz', 'moto', sinSexo, { sinFicha: true })).toEqual([])
    expect(faltanParaTarificar('allianz', 'moto', sinSexo)!.map((f) => f.etiqueta)).toEqual(['sexo del conductor (ni en el formulario ni en el tratamiento Sr/Sra de la ficha)'])
  })

  it('Mapfre auto: la compañía anterior solo con años > 0, y con más de 80 caracteres cuenta como falta (no viaja)', () => {
    expect(faltanParaTarificar('mapfre', 'auto', { ...coche(), aniosAseguradoAnterior: 0, companiaAnterior: undefined })).toEqual([])
    expect(faltanParaTarificar('mapfre', 'auto', { ...coche(), companiaAnterior: 'x'.repeat(81) })!.map((f) => f.clave)).toEqual(['companiaAnterior'])
  })

  it('Mapfre auto: «tomador es conductor» sin dato vale si el tomador nació el mismo día que el conductor (regla del adaptador)', () => {
    expect(faltanParaTarificar('mapfre', 'auto', { ...coche(), tomadorEsConductor: null })).toEqual([])
    const otro = { ...coche(), tomadorEsConductor: null, datosTomador: { ...coche().datosTomador, fechaNacimiento: '1970-01-01' } }
    expect(faltanParaTarificar('mapfre', 'auto', otro)!.map((f) => f.clave)).toEqual(['tomadorEsConductor'])
    expect(faltanParaTarificar('mapfre', 'auto', { ...coche(), tomadorEsConductor: false }), 'false es un dato (hueco de mapa, no de datos)').toEqual([])
  })

  it('Mapfre: empresa → razón social (no nombre/apellidos ni «tomador es conductor»)', () => {
    const empresa = { ...coche(), documentoTomador: 'B00000000', tomadorEsConductor: null, datosTomador: { tipo: 'juridica', razonSocial: 'EMPRESA DE PRUEBA' } }
    expect(faltanParaTarificar('mapfre', 'auto', empresa)).toEqual([])
    expect(faltanParaTarificar('mapfre', 'auto', { ...empresa, datosTomador: { tipo: 'juridica' } })!.map((f) => f.clave)).toEqual(['datosTomador.razonSocial'])
  })

  it('Mapfre: el bloque `tomador` del riesgo sustituye a lo de la ficha (NIF y alta)', () => {
    const { documentoTomador: _d, datosTomador: _t, ...sinFicha } = coche()
    const conBloque = { ...sinFicha, tomador: { tipo: 'fisica', documentoIdentidad: '00000000T', nombre: 'NOMBRE', apellido1: 'APELLIDO', fechaNacimiento: '1985-03-10' } }
    expect(faltanParaTarificar('mapfre', 'auto', conBloque)).toEqual([])
  })

  it('`sinFicha`: no mira lo que pone asegura desde la ficha (NIF, datos del tomador)', () => {
    const { documentoTomador: _d, datosTomador: _t, ...sinFicha } = coche()
    expect(faltanParaTarificar('mapfre', 'auto', sinFicha)!.map((f) => f.clave)).toEqual(['documentoTomador', 'datosTomador.nombre', 'datosTomador.apellido1', 'datosTomador.fechaNacimiento'])
    expect(faltanParaTarificar('mapfre', 'auto', sinFicha, { sinFicha: true })).toEqual([])
  })

  it('Mapfre hogar: la referencia catastral de PARCELA (14) no basta; la del bien (20) sí', () => {
    const h = hogar()
    expect(faltanParaTarificar('mapfre', 'hogar', { ...h, inmueble: { ...h.inmueble, referenciaCatastral: '1234567AB1234C' } })!.map((f) => f.clave)).toEqual(['inmueble.referenciaCatastral'])
    expect(faltanParaTarificar('allianz', 'hogar', { ...h, inmueble: { ...h.inmueble, referenciaCatastral: undefined } })).toEqual([])
  })

  it('nunca devuelve valores del riesgo (solo claves y etiquetas)', () => {
    const vacio = faltanParaTarificar('mapfre', 'auto', { ramo: 'auto', matricula: '1234BCD' })!
    expect(vacio.length).toBeGreaterThan(5)
    expect(JSON.stringify(vacio)).not.toContain('1234BCD')
    expect(faltanParaTarificar('mapfre', 'auto', null)!.length).toBeGreaterThan(5)
  })
})

describe('mensajeFaltan', () => {
  it('legible y sin valores', () => {
    expect(mensajeFaltan([])).toBe('')
    expect(mensajeFaltan([{ clave: 'codigoPostal', etiqueta: 'CP de circulación' }])).toBe('Falta: CP de circulación.')
    expect(mensajeFaltan([{ clave: 'codigoPostal', etiqueta: 'CP de circulación' }, { clave: 'conductor.fechaCarne', etiqueta: 'fecha del carné' }])).toBe('Faltan: CP de circulación, fecha del carné.')
  })
})
