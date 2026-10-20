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
  llegaAPrecio,
  BLOQUES_OBLIGATORIO,
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
const moto = () => ({
  ...coche(),
  ramo: 'moto',
  seleccionVehiculo: { marca: 'MARCA', modelo: 'MODELO', clase: 2, cilindradaCc: 250 },
  // Allianz moto 0.7.11: seguro anterior y fecha de adquisición (sintéticos).
  polizaAnteriorUltimos5: '00000',
  fotocopiaAnterior: 'proximo_anio',
  fechaAdquisicion: '2016-01-02',
})
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
      ['allianz', 'moto', ['seleccionVehiculo.clase', 'conductor.sexo', 'documentoTomador']],
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

  // Bot allianz/moto 0.7.5+: con tomador = conductor/propietario exige el NIF del tomador (sin él, `datos`): no puede salir «listo».
  it('Allianz moto: el NIF del tomador se exige si el tomador es conductor o propietario; origen ficha; no si ambos son otra persona', () => {
    const { documentoTomador: _d, ...sinNif } = moto()
    expect(faltanParaTarificar('allianz', 'moto', sinNif)!.map((f) => f.clave)).toEqual(['documentoTomador'])
    expect(faltanParaTarificar('allianz', 'moto', { ...sinNif, tomadorEsConductor: false })!.map((f) => f.clave), 'propietario sigue siendo el tomador').toEqual(['documentoTomador'])
    expect(faltanParaTarificar('allianz', 'moto', { ...sinNif, tomadorEsConductor: false, tomadorEsPropietario: false })).toEqual([])
    expect(faltanParaTarificar('allianz', 'moto', sinNif, { sinFicha: true }), 'es de la ficha: sin ficha no se mira').toEqual([])
    expect(faltanParaTarificar('allianz', 'moto', { ...sinNif, tomador: { documentoIdentidad: '00000000T' } })).toEqual([])
    expect(faltanParaTarificar('allianz', 'moto', { ...sinNif, fichaTomador: { documento: '00000000T' } })).toEqual([])
    expect(obligatoriosPara('allianz', 'moto')!.find((o) => o.clave === 'documentoTomador')).toMatchObject({ bloque: 'personas', origen: 'ficha' })
  })

  // 19/10/2026: el DNI/NIE y el nacimiento del tomador de HOGAR son de la ficha (no cruzan el puerto): sin ficha no se miran, con ella sí.
  it('Hogar: tomador.documentoIdentidad y tomador.fechaNacimiento son de origen ficha (sinFicha no los pide; con ficha, sí)', () => {
    const { tomador: _t, ...sinTomador } = hogar()
    expect(faltanParaTarificar('allianz', 'hogar', sinTomador, { sinFicha: true })).toEqual([])
    expect(faltanParaTarificar('allianz', 'hogar', sinTomador)!.map((f) => f.clave)).toEqual(['tomador.documentoIdentidad', 'tomador.fechaNacimiento'])
    expect(faltanParaTarificar('allianz', 'hogar', hogar())).toEqual([])
    // Lo que NO es de la ficha sigue faltando sin ficha: año, m², uso, régimen, tipo y madera.
    for (const clave of ['inmueble.anioConstruccion', 'inmueble.superficieM2', 'hogar.uso', 'hogar.regimen', 'hogar.tipoVivienda', 'hogar.conMadera']) {
      expect(faltanParaTarificar('allianz', 'hogar', sinRuta(sinTomador, clave), { sinFicha: true })!.map((f) => f.clave), clave).toEqual([clave])
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

  // 19/10/2026 (trabajo real 02fd821b): Allianz Turismos exige la compañía actual con cambio de seguro; sin ella, SIGUIENTE no se habilita.
  it('Allianz auto: cambio de seguro sin compañía actual falta; con ella, o vehículo nuevo, no', () => {
    const { companiaAnterior: _c, ...sinCompania } = coche()
    expect(faltanParaTarificar('allianz', 'auto', coche())).toEqual([])
    expect(faltanParaTarificar('allianz', 'auto', sinCompania)!.map((f) => f.clave)).toEqual(['companiaAnterior'])
    expect(faltanParaTarificar('allianz', 'auto', { ...sinCompania, companiaAnterior: '   ' })!.map((f) => f.clave)).toEqual(['companiaAnterior'])
    expect(faltanParaTarificar('allianz', 'auto', { ...sinCompania, companiaActual: 'OTRA COMPAÑÍA' })).toEqual([])
    // Relativo a hoy (sin fechas fijas): matriculado hace 30 días y sin póliza actual = nuevo → no se exige.
    const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    expect(faltanParaTarificar('allianz', 'auto', { ...sinCompania, fechaMatriculacion: hace30 })).toEqual([])
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

  it('Allianz moto 0.7.11: póliza, justificante y compañía anterior solo si estuvo asegurado; la fecha de adquisición, siempre', () => {
    const f = (x: Record<string, unknown>) => faltanParaTarificar('allianz', 'moto', x)!.map((q) => q.clave)
    const { polizaAnteriorUltimos5: _p, fotocopiaAnterior: _f, fechaAdquisicion: _a, companiaAnterior: _c, ...base } = moto()
    // Con años > 0 (o SIN dato: el supuesto favorable también dice «estuvo asegurado») se piden los cuatro.
    expect(f({ ...base, aniosAseguradoAnterior: 3 })).toEqual(['companiaAnterior', 'polizaAnteriorUltimos5', 'fotocopiaAnterior', 'fechaAdquisicion'])
    expect(f({ ...base, aniosAseguradoAnterior: null })).toEqual(['companiaAnterior', 'polizaAnteriorUltimos5', 'fotocopiaAnterior', 'fechaAdquisicion'])
    // Con 0 años: sin seguro anterior, solo la fecha de adquisición.
    expect(f({ ...base, aniosAseguradoAnterior: 0 })).toEqual(['fechaAdquisicion'])
    // Forma: 5 cifras exactas, justificante de la lista, fecha ISO; la compañía puede venir como `companiaActual`.
    expect(f({ ...moto(), polizaAnteriorUltimos5: '1234' })).toEqual(['polizaAnteriorUltimos5'])
    expect(f({ ...moto(), fotocopiaAnterior: 'no' })).toEqual(['fotocopiaAnterior'])
    expect(f({ ...moto(), fechaAdquisicion: '02/01/2016' })).toEqual(['fechaAdquisicion'])
    expect(f({ ...moto(), companiaAnterior: undefined, companiaActual: 'COMPAÑÍA DE PRUEBA' })).toEqual([])
    const bloque = (c: string) => obligatoriosPara('allianz', 'moto')!.find((o) => o.clave === c)?.bloque
    expect([bloque('companiaAnterior'), bloque('polizaAnteriorUltimos5'), bloque('fotocopiaAnterior'), bloque('fechaAdquisicion')]).toEqual(['poliza', 'poliza', 'poliza', 'riesgo'])
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

// F3b de la correduría (19/10/2026): desde un LEAD solo se lanzan bots que LLEGAN A PRECIO. Declaración explícita.
describe('llegaAPrecio (bots que dan precio de verdad)', () => {
  it('Generali auto se para antes del precio: en pruebas', () => {
    expect(llegaAPrecio('generali', 'auto')).toBe(false)
  })
  it('Allianz Turismos se para antes del precio: en pruebas', () => {
    expect(llegaAPrecio('allianz', 'auto')).toBe(false)
  })
  it('Mapfre auto, Allianz moto y comunidades llegan', () => {
    expect(llegaAPrecio('mapfre', 'auto')).toBe(true)
    expect(llegaAPrecio('Allianz', 'moto')).toBe(true)
    expect(llegaAPrecio('allianz', 'comunidades')).toBe(true)
  })
  it('sin declaración = no llega (no se sabe = no se lanza)', () => {
    expect(llegaAPrecio('axa', 'auto')).toBe(false)
    expect(llegaAPrecio('allianz', 'vida')).toBe(false)
  })
})

// 20/10/2026: el presupuesto de motor se pinta en tres bloques. Todo campo declarado (forma del ramo + propios de cada bot)
// debe llevar uno válido; si no, una pantalla lo perdería sin avisar.
describe('bloque de cada obligatorio (personas / riesgo / poliza)', () => {
  const todos = () => {
    const lista = capacidadesConObligatorios().flatMap((d) => (obligatoriosPara(d.compania, d.ramo) ?? []).map((c) => ({ ...c, donde: `${d.compania}/${d.ramo}` })))
    for (const ramo of ['auto', 'moto', 'hogar', 'comunidades']) for (const c of obligatoriosDeRamo(ramo) ?? []) lista.push({ ...c, donde: `ramo ${ramo}` })
    return lista
  }
  it('los tres bloques son exactamente personas, riesgo y poliza', () => {
    expect([...BLOQUES_OBLIGATORIO]).toEqual(['personas', 'riesgo', 'poliza'])
  })
  it('TODO campo declarado tiene un bloque válido', () => {
    const lista = todos()
    expect(lista.length).toBeGreaterThan(30)
    for (const c of lista) expect(BLOQUES_OBLIGATORIO as readonly string[], `${c.donde} · ${c.clave}`).toContain(c.bloque)
  })
  it('asignación de motor: vehículo → riesgo, conductor/tomador → personas, antecedentes y compañía anterior → poliza', () => {
    const b = (comp: string, ramo: string, clave: string) => obligatoriosPara(comp, ramo)!.find((c) => c.clave === clave)?.bloque
    expect(b('mapfre', 'auto', 'matricula')).toBe('riesgo')
    expect(b('mapfre', 'auto', 'codigoPostal')).toBe('riesgo')
    expect(b('mapfre', 'auto', 'conductor.fechaCarne')).toBe('personas')
    expect(b('mapfre', 'auto', 'documentoTomador')).toBe('personas')
    expect(b('mapfre', 'auto', 'companiaAnterior')).toBe('poliza')
    expect(b('mapfre', 'auto', 'siniestrosUltimos5Anios')).toBe('poliza')
    expect(b('allianz', 'moto', 'conductor.sexo')).toBe('personas')
    expect(b('allianz', 'moto', 'seleccionVehiculo.cilindradaCc')).toBe('riesgo')
  })
})
