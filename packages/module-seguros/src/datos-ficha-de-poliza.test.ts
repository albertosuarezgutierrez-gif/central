import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLAVES_EXTRACCION_GUARDABLES,
  CLAVES_PERSONALES_EXTRACCION,
  cifDeEmpresa,
  companiaLegible,
  companiaPorNombre,
  extraccionSinPii,
  contactoTomadorVacio,
  normalizarContactoTomador,
  notaConductorPrincipal,
  parcheFichaDesdePoliza,
  polizaFinanciada,
  telefonoEspanol,
  vencimientoUrgente,
  type ExtraccionFicha,
  type FichaActual,
} from './datos-ficha-de-poliza.ts'

const HOY = '2026-10-03'
const DNI = '12345678Z'

const fichaVacia = (): FichaActual => ({
  tieneDni: false,
  tieneFechaNacimiento: false,
  tieneDireccion: false,
  tieneCodigoPostal: false,
  tieneCiudad: false,
  tieneProvincia: false,
  telefonos: [],
  emails: [],
  carnets: 0,
})

// La clienta de las dos pólizas MAPFRE: todo legible.
const leida = (extra: Partial<ExtraccionFicha> = {}): ExtraccionFicha => ({
  ramo: 'auto',
  dni: DNI,
  fechaNacimiento: '1980-05-14',
  fechaCarnet: '1999-03-02',
  contacto: normalizarContactoTomador({
    telefono: '+34 612 34 56 78',
    email: 'Clienta.Ejemplo@Gmail.COM',
    domicilioVia: 'C/ Feria 12, 3ºB',
    domicilioCp: '41003',
    domicilioPoblacion: 'Sevilla',
    domicilioProvincia: 'Sevilla',
    claseCarnet: null,
    mediador: 'MAPFRE OFICINA DIRECTA',
    cesionDerechos: false,
    tomadorEsConductorHabitual: true,
  }),
  ...extra,
})

test('🪤 ficha vacía + póliza legible → rellena todos los huecos, normalizado', () => {
  const r = parcheFichaDesdePoliza(fichaVacia(), leida(), DNI, HOY)
  assert.equal(r.motivo, 'ok')
  assert.equal(r.parche.dni, DNI)
  assert.equal(r.parche.fechaNacimiento, '1980-05-14')
  assert.equal(r.parche.fechaNacimientoAConfirmar, false)
  assert.equal(r.parche.direccion, 'C/ Feria 12, 3ºB')
  assert.equal(r.parche.codigoPostal, '41003')
  assert.equal(r.parche.ciudad, 'Sevilla')
  assert.equal(r.parche.provincia, 'Sevilla')
  assert.equal(r.parche.telefono, '612345678')
  assert.equal(r.parche.email, 'clienta.ejemplo@gmail.com')
  assert.deepEqual(r.parche.carnet, { tipo: 'B', fecha: '1999-03-02' })
  assert.ok(r.rellenado.includes('teléfono') && r.rellenado.includes('carné B'))
})

test('🪤 NO PISA: lo que la ficha ya tiene se queda como está', () => {
  const llena: FichaActual = {
    tieneDni: true,
    tieneFechaNacimiento: true,
    tieneDireccion: true,
    tieneCodigoPostal: true,
    tieneCiudad: true,
    tieneProvincia: true,
    telefonos: ['612345678'],
    emails: ['clienta.ejemplo@gmail.com'],
    carnets: 1,
  }
  const r = parcheFichaDesdePoliza(llena, leida(), DNI, HOY)
  assert.equal(r.motivo, 'ok')
  for (const [k, v] of Object.entries(r.parche)) {
    if (k === 'fechaNacimientoAConfirmar' || k === 'esEmpresa') assert.equal(v, false, k)
    else assert.equal(v, null, `${k} no se pisa`)
  }
  assert.deepEqual(r.rellenado, [])
})

test('no pisa el domicilio a medias: con calle en la ficha, ni CP ni población del papel', () => {
  const f = { ...fichaVacia(), tieneDni: true, tieneDireccion: true }
  const r = parcheFichaDesdePoliza(f, leida(), DNI, HOY)
  assert.equal(r.parche.direccion, null)
  assert.equal(r.parche.codigoPostal, null)
  assert.equal(r.parche.ciudad, null)
  // …pero el resto de huecos sí.
  assert.equal(r.parche.telefono, '612345678')
})

test('un teléfono distinto se AÑADE (no sustituye); uno igual no se duplica', () => {
  const f = { ...fichaVacia(), telefonos: ['954000000'] }
  assert.equal(parcheFichaDesdePoliza(f, leida(), null, HOY).parche.telefono, '612345678')
  const g = { ...fichaVacia(), telefonos: ['612345678'], emails: ['CLIENTA.EJEMPLO@gmail.com'] }
  const r = parcheFichaDesdePoliza(g, leida(), null, HOY)
  assert.equal(r.parche.telefono, null)
  assert.equal(r.parche.email, null)
})

test('🪤 fecha de nacimiento 01/01 se escribe, pero marcada «a confirmar»', () => {
  const r = parcheFichaDesdePoliza(fichaVacia(), leida({ fechaNacimiento: '1975-01-01' }), null, HOY)
  assert.equal(r.parche.fechaNacimiento, '1975-01-01')
  assert.equal(r.parche.fechaNacimientoAConfirmar, true)
  assert.ok(r.rellenado.includes('fecha de nacimiento (01/01, a confirmar)'))
})

test('🪤 DNI distinto = otra persona: parche VACÍO aunque la ficha esté vacía', () => {
  const r = parcheFichaDesdePoliza(fichaVacia(), leida(), '87654321X', HOY)
  assert.equal(r.motivo, 'dni_distinto')
  assert.deepEqual(r.rellenado, [])
  assert.ok(Object.entries(r.parche).every(([k, v]) => (k === 'fechaNacimientoAConfirmar' || k === 'esEmpresa' ? v === false : v === null)))
})

test('sin DNI en el documento, o DNI de la ficha ilegible: no se toca nada', () => {
  assert.equal(parcheFichaDesdePoliza(fichaVacia(), leida({ dni: null }), null, HOY).motivo, 'sin_dni_documento')
  assert.equal(parcheFichaDesdePoliza(fichaVacia(), leida({ dni: '12345678A' }), null, HOY).motivo, 'sin_dni_documento')
  assert.equal(parcheFichaDesdePoliza(fichaVacia(), leida(), undefined, HOY).motivo, 'dni_ficha_ilegible')
  // La columna tiene algo pero no se ha podido descifrar: tampoco.
  assert.equal(parcheFichaDesdePoliza({ ...fichaVacia(), tieneDni: true }, leida(), null, HOY).motivo, 'dni_ficha_ilegible')
})

test('🪤 null ≠ \'\': un hueco del documento (o un valor de cajón) no escribe nada', () => {
  const c = normalizarContactoTomador({ telefono: '', email: 'N/A', domicilioVia: 'no consta', domicilioCp: '', domicilioPoblacion: '-', mediador: 'desconocido', cesionDerechos: '' })
  assert.deepEqual(c, contactoTomadorVacio())
  const r = parcheFichaDesdePoliza(fichaVacia(), leida({ fechaNacimiento: null, fechaCarnet: null, contacto: c }), null, HOY)
  assert.deepEqual(r.rellenado, ['DNI'])
  for (const k of ['direccion', 'codigoPostal', 'ciudad', 'provincia', 'telefono', 'email', 'fechaNacimiento', 'carnet'] as const) {
    assert.equal(r.parche[k], null, k)
  }
})

test('contactos que no se pudieron leer (null) = no se añade ninguno; carnés sin mirar, tampoco', () => {
  const f = { ...fichaVacia(), telefonos: null, emails: null, carnets: null }
  const r = parcheFichaDesdePoliza(f, leida(), null, HOY)
  assert.equal(r.parche.telefono, null)
  assert.equal(r.parche.email, null)
  assert.equal(r.parche.carnet, null)
})

test('carné: clase leída manda; de moto sin clase no se adivina', () => {
  const conClase = leida({ contacto: { ...leida().contacto, claseCarnet: 'A2' }, ramo: 'moto' })
  assert.deepEqual(parcheFichaDesdePoliza(fichaVacia(), conClase, null, HOY).parche.carnet, { tipo: 'A2', fecha: '1999-03-02' })
  assert.equal(parcheFichaDesdePoliza(fichaVacia(), leida({ ramo: 'moto' }), null, HOY).parche.carnet, null)
})

test('teléfono: solo español de 9 dígitos', () => {
  assert.equal(telefonoEspanol('0034 699 111 222'), '699111222')
  assert.equal(telefonoEspanol('+44 7700 900123'), null)
  assert.equal(telefonoEspanol('12345'), null)
  assert.equal(telefonoEspanol(''), null)
})

test('compañía: «P.P.» no es una compañía; se usa la del código DGS', () => {
  assert.equal(companiaLegible('MAPFRE ESPAÑA', null), 'MAPFRE ESPAÑA')
  assert.equal(companiaLegible('P.P.', 'Mapfre'), 'Mapfre')
  assert.equal(companiaLegible('S.A.', null), null)
  assert.equal(companiaLegible(null, null), null)
})

test('compañía por nombre: exacta tras normalizar, nunca subcadena; «P.P.» o ambigua = null', () => {
  const cat = [
    { codigoDgs: 'C0058', nombreComun: 'Mapfre', nombreCima: 'Mapfre' },
    { codigoDgs: 'C0072', nombreComun: 'Generali', nombreCima: 'GENERALI ESPAÑA, S.A. DE SEGUROS Y REASEGUROS' },
    { codigoDgs: 'C0009', nombreComun: 'P.P.', nombreCima: null },
    { codigoDgs: 'C0001', nombreComun: 'Allianz', nombreCima: null },
    { codigoDgs: 'C0002', nombreComun: 'Allianz', nombreCima: null },
  ]
  assert.deepEqual(companiaPorNombre('MAPFRE, S.A.', cat), { codigoDgs: 'C0058', nombre: 'Mapfre' })
  assert.deepEqual(companiaPorNombre('Generali España S.A. de Seguros y Reaseguros', cat), { codigoDgs: 'C0072', nombre: 'Generali' })
  assert.deepEqual(companiaPorNombre('MAPFRE ESPAÑA', cat), { codigoDgs: 'C0058', nombre: 'Mapfre' })
  assert.equal(companiaPorNombre('Mapfre Vida', cat), null) // subcadena: no casa
  assert.equal(companiaPorNombre('P.P.', cat), null)
  assert.equal(companiaPorNombre('Allianz', cat), null)
  assert.equal(companiaPorNombre(null, cat), null)
})

test('vencimiento ≤15 días = urgente; sin fecha no se inventa prisa', () => {
  assert.equal(vencimientoUrgente('2026-10-10', HOY), true)
  assert.equal(vencimientoUrgente('2026-10-18', HOY), true)
  assert.equal(vencimientoUrgente('2026-10-19', HOY), false)
  assert.equal(vencimientoUrgente(null, HOY), false)
})

test('póliza de concesionario/financiada: RCI, Mobilize, banco o cesión de derechos', () => {
  assert.equal(polizaFinanciada({ mediador: 'RCI BANQUE SA', cesionDerechos: null }).financiada, true)
  assert.equal(polizaFinanciada({ mediador: 'Mobilize Financial Services', cesionDerechos: null }).financiada, true)
  assert.equal(polizaFinanciada({ mediador: 'Oficina Mapfre', cesionDerechos: true }).financiada, true)
  assert.equal(polizaFinanciada({ mediador: 'Oficina Mapfre', cesionDerechos: false }).financiada, false)
  assert.equal(polizaFinanciada({ mediador: null, cesionDerechos: null }).financiada, null)
})

test('🪤 la extracción que se guarda es LISTA BLANCA: ni tomador, ni matrícula, ni CP, ni claves desconocidas', () => {
  const bruto = {
    compania: 'MAPFRE', numeroPoliza: '0123', primaAnual: 410.5, tomador: 'ANA RUIZ', dni: DNI, telefono: '612345678',
    email: 'a@b.es', fechaNacimiento: '1980-05-14', fechaCarnet: '1999-03-02', domicilioVia: 'C/ Feria 12',
    domicilioCp: '41003', domicilioPoblacion: 'Sevilla', domicilioProvincia: 'Sevilla', direccion: 'C/ Feria 12',
    cp: '41003', localidad: 'Sevilla', matricula: '1234BCD', mediador: 'Juan Agente', conductorHabitual: 'PEPE RUIZ',
    marca: { nombre: 'ANA RUIZ' },
  }
  const r = extraccionSinPii(bruto)
  assert.ok(r)
  for (const k of Object.keys(r.datos)) assert.ok((CLAVES_EXTRACCION_GUARDABLES as readonly string[]).includes(k), `${k} no está en la lista blanca`)
  const enTexto = JSON.stringify(r)
  for (const v of ['ANA RUIZ', 'PEPE RUIZ', DNI, '612345678', 'a@b.es', '1980-05-14', 'C/ Feria 12', '41003', 'Sevilla', '1234BCD', 'Juan Agente']) {
    assert.equal(enTexto.includes(v), false, `${v} no se guarda`)
  }
  assert.equal(r.datos.compania, 'MAPFRE')
  assert.equal(r.datos.primaAnual, 410.5)
  assert.equal(r.leidos.tomador, true)
  assert.equal(r.leidos.dni, true)
  assert.equal(Object.keys(r.leidos).length, CLAVES_PERSONALES_EXTRACCION.length)
  assert.equal(extraccionSinPii({ compania: 'X', email: 'N/A', telefono: null })?.leidos.email, false)
  assert.equal(extraccionSinPii(null), null)
})

test('🪤 carné: solo si el documento dice que el tomador ES el conductor habitual', () => {
  const noConsta = leida({ contacto: { ...leida().contacto, tomadorEsConductorHabitual: null } })
  assert.equal(parcheFichaDesdePoliza(fichaVacia(), noConsta, null, HOY).parche.carnet, null)
  const otro = leida({ contacto: { ...leida().contacto, tomadorEsConductorHabitual: false } })
  assert.equal(parcheFichaDesdePoliza(fichaVacia(), otro, null, HOY).parche.carnet, null)
  assert.deepEqual(parcheFichaDesdePoliza(fichaVacia(), leida(), null, HOY).parche.carnet, { tipo: 'B', fecha: '1999-03-02' })
})

test('extracción: cifCompania solo si tiene forma de CIF de sociedad; un DNI o NIE no se guarda', () => {
  assert.equal(extraccionSinPii({ cifCompania: '12345678Z' })?.datos.cifCompania, null)
  assert.equal(extraccionSinPii({ cifCompania: 'X1234567L' })?.datos.cifCompania, null)
  assert.equal(extraccionSinPii({ cifCompania: 12345678 })?.datos.cifCompania, null)
  assert.equal(extraccionSinPii({ cifCompania: 'A-28141935' })?.datos.cifCompania, 'A28141935')
  assert.equal(extraccionSinPii({ cifCompania: 'A28141935' })?.datos.cifCompania, 'A28141935')
})

// ─── Tomador EMPRESA (póliza Qover a nombre de una SL, 03/10/2026). Datos ficticios. ─────────────

const CIF = 'B12345674'
const leidaEmpresa = (extra: Record<string, unknown> = {}): ExtraccionFicha => ({
  ramo: 'auto',
  dni: null,
  // Lo que el modelo pueda haber puesto aquí es del CONDUCTOR, no de la empresa.
  fechaNacimiento: '1971-07-02',
  fechaCarnet: '1990-01-15',
  contacto: normalizarContactoTomador({
    tomador: 'Ejemplo Viajes SL',
    tomadorEsEmpresa: true,
    cifTomador: 'ES' + CIF,
    telefono: '+34600111222',
    email: 'contacto@ejemplo-viajes.es',
    domicilioVia: 'Calle Falsa 1',
    domicilioCp: '41001',
    domicilioPoblacion: 'Sevilla',
    tomadorEsConductorHabitual: true,
    conductorPrincipal: { nombre: 'Pedro Prueba Ficticio', fechaNacimiento: '2 de jul. de 1971', dni: null },
    ...extra,
  }),
})

test('🪤 CIF con prefijo «ES» (Número de IVA / NIF-IVA): se quita y se valida; un DNI no es CIF', () => {
  assert.equal(cifDeEmpresa('ES' + CIF), CIF)
  assert.equal(cifDeEmpresa('ES-B-12345674'), CIF)
  assert.equal(cifDeEmpresa(CIF), CIF)
  assert.equal(cifDeEmpresa('ES12345678Z'), null) // NIF-IVA de persona física: no es una empresa
  assert.equal(cifDeEmpresa('ESX1234567'), null)
  assert.equal(cifDeEmpresa('N/A'), null)
  const c = leidaEmpresa().contacto
  assert.equal(c.cifTomador, CIF)
  assert.equal(c.tomadorEsEmpresa, true)
  // El modelo dejó el NIF-IVA en `dni` y no dijo nada: también es empresa, con su CIF.
  const enDni = normalizarContactoTomador({ tomador: 'Algo Distinto', dni: 'ES' + CIF })
  assert.equal(enDni.cifTomador, CIF)
  assert.equal(enDni.tomadorEsEmpresa, true)
  // Forma societaria en el nombre, sin CIF: empresa, pero sin identidad.
  assert.equal(normalizarContactoTomador({ tomador: 'Ejemplo Viajes S.L.' }).tomadorEsEmpresa, true)
  assert.equal(normalizarContactoTomador({ tomador: 'Ana Ruiz', dni: DNI }).tomadorEsEmpresa, null)
})

test('🪤 conductor principal: fecha en texto español a ISO, DNI solo de persona física', () => {
  const cp = leidaEmpresa().contacto.conductorPrincipal
  assert.deepEqual(cp, { nombre: 'Pedro Prueba Ficticio', fechaNacimiento: '1971-07-02', dni: null })
  assert.equal(normalizarContactoTomador({ conductorPrincipal: { nombre: 'X Y', dni: CIF } }).conductorPrincipal?.dni, null)
  assert.equal(normalizarContactoTomador({ conductorPrincipal: { nombre: 'N/A' } }).conductorPrincipal, null)
})

test('🪤 empresa: rellena CIF, domicilio, teléfono y email; NUNCA fecha de nacimiento ni carné', () => {
  const r = parcheFichaDesdePoliza(fichaVacia(), leidaEmpresa(), null, HOY)
  assert.equal(r.motivo, 'ok')
  assert.equal(r.parche.esEmpresa, true)
  assert.equal(r.parche.dni, CIF)
  assert.equal(r.parche.direccion, 'Calle Falsa 1')
  assert.equal(r.parche.codigoPostal, '41001')
  assert.equal(r.parche.ciudad, 'Sevilla')
  assert.equal(r.parche.telefono, '600111222')
  assert.equal(r.parche.email, 'contacto@ejemplo-viajes.es')
  assert.equal(r.parche.fechaNacimiento, null)
  assert.equal(r.parche.carnet, null)
  assert.ok(r.rellenado.includes('CIF'))
  assert.ok(!r.rellenado.some((x) => x.startsWith('fecha') || x.startsWith('carné')))
})

test('🪤 empresa: no pisa lo que la ficha ya tiene (mismo CIF)', () => {
  const llena = { ...fichaVacia(), tieneDni: true, tieneDireccion: true, telefonos: ['600111222'], emails: ['contacto@ejemplo-viajes.es'] }
  const r = parcheFichaDesdePoliza(llena, leidaEmpresa(), CIF, HOY)
  assert.equal(r.motivo, 'ok')
  assert.equal(r.parche.dni, null)
  assert.equal(r.parche.direccion, null)
  assert.equal(r.parche.codigoPostal, null)
  assert.equal(r.parche.telefono, null)
  assert.equal(r.parche.email, null)
  assert.deepEqual(r.rellenado, [])
})

test('🪤 empresa: un CIF distinto en la ficha (o una persona) no toca NADA', () => {
  const r = parcheFichaDesdePoliza({ ...fichaVacia(), tieneDni: true }, leidaEmpresa(), 'B87654320', HOY)
  assert.equal(r.motivo, 'dni_distinto')
  assert.deepEqual(r.rellenado, [])
  assert.equal(r.parche.direccion, null)
  assert.equal(r.parche.telefono, null)
  assert.equal(parcheFichaDesdePoliza({ ...fichaVacia(), tieneDni: true }, leidaEmpresa(), DNI, HOY).motivo, 'dni_distinto')
  // Empresa sin CIF: el DNI que traiga es el de la persona de contacto, no la identifica.
  const sinCif = leidaEmpresa({ cifTomador: null })
  assert.equal(parcheFichaDesdePoliza(fichaVacia(), { ...sinCif, dni: DNI }, null, HOY).motivo, 'sin_dni_documento')
})

test('🪤 conductor principal ≠ tomador empresa: solo una nota con el NOMBRE (sin fecha, sin DNI)', () => {
  const c = leidaEmpresa().contacto
  const nota = notaConductorPrincipal(c, 'Ejemplo Viajes SL', CIF)
  assert.equal(nota, 'Conductor principal en la póliza: Pedro Prueba Ficticio. Crear/vincular su ficha a mano.')
  assert.equal(nota?.includes('1971'), false)
  // Persona física que es su propio conductor principal: nada que sugerir.
  const fisica = normalizarContactoTomador({ tomador: 'Pedro Prueba Ficticio', conductorPrincipal: { nombre: 'PRUEBA FICTICIO, PEDRO' } })
  assert.equal(notaConductorPrincipal(fisica, 'Pedro Prueba Ficticio', null), null)
  const otro = normalizarContactoTomador({ tomador: 'Ana Ruiz Gil', conductorPrincipal: { nombre: 'Pedro Prueba Ficticio' } })
  assert.ok(notaConductorPrincipal(otro, 'Ana Ruiz Gil', null))
  assert.equal(notaConductorPrincipal(leida().contacto, 'Ana Ruiz', DNI), null) // sin conductor leído
})

test('🪤 lista blanca: ni el conductor principal ni el CIF del tomador se guardan en claro', () => {
  const r = extraccionSinPii({
    compania: 'Qover', tomadorEsEmpresa: true, cifTomador: 'ES' + CIF, tomador: 'Ejemplo Viajes SL',
    conductorPrincipal: { nombre: 'Pedro Prueba Ficticio', fechaNacimiento: '1971-07-02', dni: DNI },
  })
  assert.ok(r)
  const enTexto = JSON.stringify(r)
  for (const v of ['Pedro', 'Ficticio', '1971', CIF, DNI, 'Ejemplo Viajes']) assert.equal(enTexto.includes(v), false, `${v} no se guarda`)
  assert.equal(r.datos.tomadorEsEmpresa, true)
  assert.equal(r.leidos.conductorPrincipal, true)
  assert.equal(r.leidos.cifTomador, true)
})

test('🪤 conductor con nombre contenido en el del tomador (o al revés) NO es otra persona', () => {
  const sola = normalizarContactoTomador({ tomador: 'Ana Ruiz Gil', conductorPrincipal: { nombre: 'Ana' } })
  assert.equal(notaConductorPrincipal(sola, 'Ana Ruiz Gil', null), null)
  const larga = normalizarContactoTomador({ tomador: 'Ana Ruiz', conductorPrincipal: { nombre: 'Ana Ruiz Gil' } })
  assert.equal(notaConductorPrincipal(larga, 'Ana Ruiz', null), null)
  const otra = normalizarContactoTomador({ tomador: 'Ana Ruiz Gil', conductorPrincipal: { nombre: 'Pedro' } })
  assert.ok(notaConductorPrincipal(otra, 'Ana Ruiz Gil', null))
})

test('🪤 un «SA» en el nombre con DNI físico válido no hace empresa al tomador (no se pierde el DNI)', () => {
  const c = normalizarContactoTomador({ tomador: 'Juan Pérez SA', dni: DNI })
  assert.notEqual(c.tomadorEsEmpresa, true)
  const r = parcheFichaDesdePoliza(fichaVacia(), { ...leida(), contacto: c }, null, HOY)
  assert.equal(r.parche.dni, DNI)
  assert.equal(r.parche.esEmpresa, false)
})
