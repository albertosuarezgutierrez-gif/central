// Formulario auto/moto: ciclomotor en ramo auto (13/10/2026). Fixtures SINTÉTICAS.
import { describe, it, expect } from 'vitest'
import { validarFormularioAuto } from './index.ts'

const base = { ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003', conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01' } }
const hoy = new Date('2026-10-13T00:00:00Z')
const con = (ramo: string, sv?: Record<string, unknown>) => validarFormularioAuto({ ...base, ramo, ...(sv ? { seleccionVehiculo: { marca: 'MARCA PRUEBA', modelo: 'MODELO X', ...sv } } : {}) }, hoy)
const errs = (r: ReturnType<typeof con>) => (r.ok ? '' : r.errores.join(' | '))

describe('ramo auto: ciclomotor (≤50 cc) no soportado', () => {
  it('auto con cilindrada ≤50 → mismo rechazo que moto', () => {
    for (const cc of [1, 49, 50]) {
      expect(errs(con('auto', { cilindradaCc: cc }))).toMatch(/ciclomotor \(≤50 cc\)/)
      expect(errs(con('auto', { cilindradaCc: cc }))).toBe(errs(con('moto', { clase: 1, cilindradaCc: cc })))
    }
  })
  it('auto con cilindrada >50 o sin cilindrada → válido (no es obligatoria en coche)', () => {
    expect(con('auto', { cilindradaCc: 51 }).ok).toBe(true)
    expect(con('auto', { cilindradaCc: 1598 }).ok).toBe(true)
    expect(con('auto', { clase: null, cilindradaCc: null }).ok).toBe(true)
    expect(con('auto', {}).ok).toBe(true)
    expect(con('auto').ok).toBe(true)
  })
})

describe('documentoTomador (Mapfre paso 1, 14/10/2026)', () => {
  it('opcional; si viene, DNI/NIE/CIF válido y normalizado', async () => {
    const { documentoTomadorDe } = await import('./index.ts')
    const r = validarFormularioAuto({ ...base, documentoTomador: ' 00000000-t ' }, hoy)
    expect(r.ok && r.formulario.documentoTomador).toBe('00000000T')
    expect(r.ok && documentoTomadorDe(r.formulario)).toBe('00000000T')
    const sin = validarFormularioAuto(base, hoy)
    expect(sin.ok && 'documentoTomador' in sin.formulario).toBe(false)
    expect(sin.ok && documentoTomadorDe(sin.formulario)).toBe(null)
  })
  it('inválido → error SIN repetir el valor', () => {
    const r = validarFormularioAuto({ ...base, documentoTomador: '12345678A' }, hoy)
    expect(r.ok).toBe(false)
    expect(errs(r as ReturnType<typeof con>)).toMatch(/documentoTomador: no es un DNI\/NIE\/CIF válido/)
    expect(errs(r as ReturnType<typeof con>)).not.toContain('12345678')
  })
  it('secretosDelRiesgo: el documento y sus variantes con separador; nada si no hay', async () => {
    const { secretosDelRiesgo } = await import('./index.ts')
    expect(secretosDelRiesgo({ documentoTomador: '00000000T' })).toEqual(expect.arrayContaining(['00000000T', '00000000-T', '00000000 T']))
    expect(secretosDelRiesgo({ tomador: { documentoIdentidad: 'X0000000T' } })).toEqual(expect.arrayContaining(['X0000000T', 'X-0000000-T']))
    expect(secretosDelRiesgo({ ramo: 'moto' })).toEqual([])
    expect(secretosDelRiesgo(null)).toEqual([])
  })
})

describe('mat-select de Mapfre: uso, ámbito, clase del permiso y compañía anterior (14/10/2026)', () => {
  it('auto sin ellos → defectos particular / espana / b; compañía anterior ausente', () => {
    const r = validarFormularioAuto(base, hoy)
    expect(r.ok && r.formulario.usoVehiculo).toBe('particular')
    expect(r.ok && r.formulario.ambitoCirculacion).toBe('espana')
    expect(r.ok && r.formulario.clasePermiso).toBe('b')
    expect(r.ok && 'companiaAnterior' in r.formulario).toBe(false)
  })
  it('moto sin ellos → ausentes (no consta; sin defecto)', () => {
    const r = validarFormularioAuto({ ...base, ramo: 'moto', seleccionVehiculo: { marca: 'MARCA PRUEBA', modelo: 'MODELO X', clase: 1, cilindradaCc: 125 } }, hoy)
    expect(r.ok).toBe(true)
    expect(r.ok && ['usoVehiculo', 'ambitoCirculacion', 'clasePermiso'].some((k) => k in r.formulario)).toBe(false)
  })
  it('valores válidos (mayúsculas y espacios se normalizan) y compañía anterior recortada', () => {
    const r = validarFormularioAuto({ ...base, usoVehiculo: ' Particular ', ambitoCirculacion: 'ESPANA', clasePermiso: 'A2', companiaAnterior: '  Compañía  Ejemplo ' }, hoy)
    expect(r.ok && [r.formulario.usoVehiculo, r.formulario.ambitoCirculacion, r.formulario.clasePermiso, r.formulario.companiaAnterior]).toEqual(['particular', 'espana', 'a2', 'Compañía Ejemplo'])
  })
  it('null / vacío = el defecto en auto', () => {
    const r = validarFormularioAuto({ ...base, usoVehiculo: null, clasePermiso: '' }, hoy)
    expect(r.ok && [r.formulario.usoVehiculo, r.formulario.clasePermiso]).toEqual(['particular', 'b'])
  })
  it('valores fuera de la lista cerrada se rechazan sin repetir el valor', () => {
    for (const [campo, v] of [['usoVehiculo', 'taxi-zzz'], ['ambitoCirculacion', 'marte-zzz'], ['clasePermiso', 'Z9zzz'], ['usoVehiculo', 7]] as const) {
      const r = validarFormularioAuto({ ...base, [campo]: v }, hoy)
      expect(r.ok).toBe(false)
      const t = r.ok ? '' : r.errores.join(' | ')
      expect(t).toContain(campo)
      expect(t).not.toMatch(/zzz/)
    }
  })
  it('compañía anterior: >80 o con caracteres prohibidos o no texto → error', () => {
    for (const v of ['x'.repeat(81), 'Cía <script>', 5]) expect(validarFormularioAuto({ ...base, companiaAnterior: v }, hoy).ok).toBe(false)
  })
  it('últimos 5 dígitos de la póliza actual: 5 cifras exactas se conservan; ausente/vacío → ausente; otra cosa → error sin repetir el valor', () => {
    const r = validarFormularioAuto({ ...base, polizaAnteriorUltimos5: ' 90817 ' }, hoy)
    expect(r.ok && r.formulario.polizaAnteriorUltimos5).toBe('90817')
    for (const v of [undefined, null, '']) {
      const q = validarFormularioAuto({ ...base, polizaAnteriorUltimos5: v }, hoy)
      expect(q.ok && 'polizaAnteriorUltimos5' in q.formulario).toBe(false)
    }
    for (const v of ['9081', '908171', '9081a', 'abcde', 90817, '90 817']) {
      const q = validarFormularioAuto({ ...base, polizaAnteriorUltimos5: v }, hoy)
      expect(q.ok).toBe(false)
      expect(JSON.stringify(q)).not.toMatch(/9081|abcde/)
    }
  })
  it('los valores del validador casan con las claves de MAPEO_MAPFRE_AUTO del bot (mismo contrato)', async () => {
    const { USOS_VEHICULO, AMBITOS_CIRCULACION, CLASES_PERMISO } = await import('./index.ts')
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../../../services/tarificador-rpa/src/adapters/mapfre/auto.ts', import.meta.url), 'utf8')
    const tabla = src.slice(src.indexOf('export const MAPEO_MAPFRE_AUTO'), src.indexOf('export function textosMapfreDe'))
    const claves = (campo: string) => {
      const m = new RegExp(`${campo}:\\s*Object\\.freeze\\(\\{([^}]*)\\}\\)`).exec(tabla)
      return [...(m?.[1] ?? '').matchAll(/(\w+):\s*Object\.freeze/g)].map((x) => x[1]!)
    }
    // Todo valor aceptado por el validador tiene texto en el mapeo del bot (si no, el campo quedaría pendiente en silencio).
    for (const [campo, lista] of [['uso', USOS_VEHICULO], ['ambito', AMBITOS_CIRCULACION], ['clasePermiso', CLASES_PERMISO]] as const) {
      const ks = claves(campo)
      expect(ks.length).toBeGreaterThan(0)
      for (const v of lista) expect(ks).toContain(v)
    }
  })
})

describe('datosTomador (alta del tomador en Mapfre; lo pone asegura al entregar, 14/10/2026)', () => {
  const dt = { tipo: 'fisica', nombre: 'NOMBRE PRUEBA', apellido1: 'APELLIDOUNO', apellido2: 'APELLIDODOS', fechaNacimiento: '1980-01-02' }
  it('opcional; si viene válido pasa al formulario; empresa con razón social', () => {
    const r = validarFormularioAuto({ ...base, datosTomador: dt }, hoy)
    expect(r.ok && r.formulario.datosTomador).toEqual(dt)
    const e = validarFormularioAuto({ ...base, datosTomador: { tipo: 'juridica', razonSocial: 'EMPRESA PRUEBA SL' } }, hoy)
    expect(e.ok && e.formulario.datosTomador).toEqual({ tipo: 'juridica', razonSocial: 'EMPRESA PRUEBA SL' })
    const sin = validarFormularioAuto(base, hoy)
    expect(sin.ok && 'datosTomador' in sin.formulario).toBe(false)
  })
  it('incompleto o fecha no real → error por CAMPO, sin repetir valores', () => {
    const r = validarFormularioAuto({ ...base, datosTomador: { ...dt, nombre: '', fechaNacimiento: '1980-02-31' } }, hoy)
    expect(r.ok).toBe(false)
    const t = errs(r as ReturnType<typeof con>)
    expect(t).toMatch(/datosTomador\.nombre/)
    expect(t).toMatch(/datosTomador\.fechaNacimiento/)
    expect(t).not.toContain('1980')
    expect(t).not.toContain('APELLIDOUNO')
  })
  it('secretosDelRiesgo: nombre, apellidos (sueltos, juntos y en mayúsculas), razón social y la fecha en sus formatos', async () => {
    const { secretosDelRiesgo } = await import('./index.ts')
    const s = secretosDelRiesgo({ documentoTomador: '00000000T', datosTomador: { ...dt, nombre: 'Nombre Prueba' } })
    expect(s).toEqual(expect.arrayContaining(['00000000T', 'Nombre Prueba', 'NOMBRE PRUEBA', 'APELLIDOUNO', 'APELLIDODOS', 'APELLIDOUNO APELLIDODOS', 'NOMBRE PRUEBA APELLIDOUNO APELLIDODOS', '1980-01-02', '02/01/1980', '02-01-1980']))
    expect(secretosDelRiesgo({ datosTomador: { tipo: 'juridica', razonSocial: 'EMPRESA PRUEBA SL' } })).toEqual(expect.arrayContaining(['EMPRESA PRUEBA SL']))
    expect(secretosDelRiesgo({ tomador: { documentoIdentidad: 'X0000000T', nombre: 'OTRO NOMBRE', fechaNacimiento: '1970-03-04' } })).toEqual(expect.arrayContaining(['OTRO NOMBRE', '04/03/1970']))
  })
})

describe('faltaCompaniaAnterior (Mapfre auto pide el nombre con años > 0)', () => {
  it('Mapfre auto con años y sin nombre → falta; con nombre, sin años o sin dato → nada', async () => {
    const { faltaCompaniaAnterior } = await import('./index.ts')
    expect(faltaCompaniaAnterior('mapfre', 'auto', 3, null)).toMatch(/compañía anterior/)
    expect(faltaCompaniaAnterior(' Mapfre ', 'auto', 3, '   ')).toMatch(/compañía anterior/)
    expect(faltaCompaniaAnterior('mapfre', 'auto', 3, 'Línea Directa')).toBeNull()
    expect(faltaCompaniaAnterior('mapfre', 'auto', 0, null)).toBeNull()
    expect(faltaCompaniaAnterior('mapfre', 'auto', null, null)).toBeNull()
  })
  it('otra compañía u otro ramo no lo piden; un nombre de más de 80 cuenta como falta', async () => {
    const { faltaCompaniaAnterior } = await import('./index.ts')
    expect(faltaCompaniaAnterior('allianz', 'auto', 3, null)).toBeNull()
    expect(faltaCompaniaAnterior('mapfre', 'moto', 3, null)).toBeNull()
    expect(faltaCompaniaAnterior('mapfre', 'auto', 3, 'x'.repeat(81))).toMatch(/80/)
  })
})

describe('fichaTomador (Allianz Turismos; lo pone asegura al entregar, 17/10/2026). Fixtures FICTICIAS', () => {
  const ft = {
    tipo: 'fisica', documento: '00000000T', codigoPostal: '28999', localidad: 'POBLACION PRUEBA',
    direccion: { provincia: 'PROVINCIA PRUEBA', tipoVia: 'Calle', nombreVia: 'INVENTADA', numero: '12', planta: '3', puerta: 'IZQ' },
    fechaNacimiento: '1980-01-02', fechaCarnet: '1999-03-04', tipoCarnet: 'B',
  }
  it('opcional; si viene válido, el formulario lo conserva y los lectores lo usan', async () => {
    const { documentoTomadorDe, codigoPostalTomadorDe, localidadTomadorDe } = await import('./index.ts')
    const r = validarFormularioAuto({ ...base, fichaTomador: ft }, hoy)
    expect(r.ok && r.formulario.fichaTomador).toEqual(ft)
    expect(r.ok && documentoTomadorDe(r.formulario)).toBe('00000000T')
    expect(r.ok && codigoPostalTomadorDe(r.formulario)).toBe('28999')
    expect(r.ok && localidadTomadorDe(r.formulario)).toBe('POBLACION PRUEBA')
    const sin = validarFormularioAuto(base, hoy)
    expect(sin.ok && 'fichaTomador' in sin.formulario).toBe(false)
    expect(sin.ok && codigoPostalTomadorDe(sin.formulario)).toBe(null)
  })
  it('tres estados: todo null es válido (no consta) y se conserva como null, nunca como vacío', () => {
    const nulos = { tipo: null, documento: null, codigoPostal: null, localidad: null, direccion: null, fechaNacimiento: null, fechaCarnet: null, tipoCarnet: null }
    const r = validarFormularioAuto({ ...base, fichaTomador: nulos }, hoy)
    expect(r.ok && r.formulario.fichaTomador).toEqual(nulos)
  })
  it('valor presente e inválido → error SIN repetir el valor (no se convierte en null en silencio)', () => {
    const r = validarFormularioAuto({ ...base, fichaTomador: { ...ft, documento: '12345678A', codigoPostal: '99999', fechaNacimiento: '2099-01-01', tipo: 'otro' } }, hoy)
    const t = errs(r as ReturnType<typeof con>)
    expect(r.ok).toBe(false)
    expect(t).toMatch(/fichaTomador\.documento/)
    expect(t).toMatch(/fichaTomador\.codigoPostal/)
    expect(t).toMatch(/fichaTomador\.fechaNacimiento/)
    expect(t).toMatch(/fichaTomador\.tipo/)
    expect(t).not.toContain('12345678')
    const emp = validarFormularioAuto({ ...base, fichaTomador: { ...ft, tipo: 'juridica', documento: 'B00000000' } }, hoy)
    expect(errs(emp as ReturnType<typeof con>)).toMatch(/una empresa no tiene fecha de nacimiento ni carné/)
  })
  it('sus datos personales son SECRETOS del trabajo (documento, fechas y calle); CP y localidad no', async () => {
    const { secretosDelRiesgo } = await import('./index.ts')
    const s = secretosDelRiesgo({ ...base, fichaTomador: ft })
    for (const x of ['00000000T', '00000000-T', '02/01/1980', '04/03/1999', 'INVENTADA']) expect(s).toContain(x)
    expect(s).not.toContain('28999')
    expect(s).not.toContain('POBLACION PRUEBA')
  })
})
