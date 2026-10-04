import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarContactoTomador } from './datos-ficha-de-poliza.ts'
import {
  MAX_FIGURAS,
  NOTA_CONDUCTOR_JOVEN_NOVEL,
  conductoresDelPlan,
  detalleRelacionFigura,
  esOtraPersona,
  contactoSoloDelTomador,
  esPersonaDeContacto,
  faltaDniOCarne,
  figurasSinNombre,
  hayConductorJovenONovel,
  leadSinDniReutilizable,
  normalizarFigurasLeidas,
  notaFiguraSinNombre,
  accionFiguraSinNombre,
  parcheFigura,
  planFiguras,
  tareaPedirDniYCarne,
  type CandidatoLeadSinDni,
  type LecturaFiguras,
  type TomadorFiguras,
} from './figuras-poliza.ts'

const HOY = '2026-10-03'
const DNI_TOMADOR = '12345678Z'
const DNI_A = '87654321X'
const DNI_B = '11111111H'
const CIF = 'B12345674'

const lectura = (figuras: unknown[], extra: Partial<LecturaFiguras> = {}): LecturaFiguras => ({
  figuras: normalizarFigurasLeidas({ figuras }),
  fechaNacimiento: null,
  fechaCarnet: null,
  claseCarnet: null,
  tomadorEsConductorHabitual: null,
  ...extra,
})
const persona: TomadorFiguras = { nombre: 'Ana Ruiz Gil', dni: DNI_TOMADOR, empresa: false }
const empresa: TomadorFiguras = { nombre: 'Ejemplo Viajes SL', dni: CIF, empresa: true }

// ─── Normalizador ────────────────────────────────────────────────────────────

test('🪤 normalizador: DNI con letra mala → null, sin nombre fuera, nada de cadenas vacías', () => {
  const f = normalizarFigurasLeidas({
    figuras: [
      { rol: 'propietario', nombre: 'Pedro Prueba Ficticio', dni: '87654321A', fechaNacimiento: '', fechaCarnet: 'N/A', claseCarnet: '', esTomador: 'no' },
      { rol: 'conductor_habitual', nombre: '', dni: DNI_A },
      { rol: 'conductor_ocasional', nombre: 'N/A' },
      { rol: 'cuñado', nombre: 'Rol Desconocido' },
    ],
  })
  assert.equal(f.length, 1)
  assert.deepEqual(f[0], {
    rol: 'propietario',
    nombre: 'Pedro Prueba Ficticio',
    dni: null,
    fechaNacimiento: null,
    fechaNacimientoAConfirmar: false,
    fechaCarnet: null,
    claseCarnet: null,
    esTomador: false,
    cif: null,
    domicilioVia: null,
    domicilioCp: null,
    domicilioPoblacion: null,
    domicilioProvincia: null,
  })
  // Un CIF no es el DNI de una persona: se guarda aparte (`cif`) para descartarla en el plan.
  const conCif = normalizarFigurasLeidas({ figuras: [{ rol: 'propietario', nombre: 'X Y', dni: 'ES' + CIF }] })[0]
  assert.equal(conCif.dni, null)
  assert.equal(conCif.cif, CIF)
  assert.equal(normalizarFigurasLeidas({ figuras: [{ rol: 'propietario', nombre: 'X Y', dni: DNI_A.toLowerCase() }] })[0].dni, DNI_A)
})

test('🪤 normalizador: nacimiento 01/01 se guarda y se marca «a confirmar»; fechas en texto a ISO', () => {
  const [f, g] = normalizarFigurasLeidas({
    figuras: [
      { rol: 'conductor_habitual', nombre: 'Pedro Prueba', fechaNacimiento: '2001-01-01', fechaCarnet: '2 de jul. de 2020', claseCarnet: 'b' },
      { rol: 'conductor_ocasional', nombre: 'Lucía Prueba', fechaNacimiento: '1990-13-40' },
    ],
  })
  assert.equal(f.fechaNacimiento, '2001-01-01')
  assert.equal(f.fechaNacimientoAConfirmar, true)
  assert.equal(f.fechaCarnet, '2020-07-02')
  assert.equal(f.claseCarnet, 'B')
  assert.equal(g.fechaNacimiento, null)
  assert.equal(g.fechaNacimientoAConfirmar, false)
})

test('🪤 normalizador: como mucho 6 figuras', () => {
  const muchas = Array.from({ length: 10 }, (_, i) => ({ rol: 'conductor_ocasional', nombre: `Persona Numero${i}` }))
  assert.equal(normalizarFigurasLeidas({ figuras: muchas }).length, MAX_FIGURAS)
})

test('normalizador: sin `figuras`, el conductorPrincipal de siempre es el conductor habitual', () => {
  const f = normalizarFigurasLeidas({ conductorPrincipal: { nombre: 'Pedro Prueba Ficticio', fechaNacimiento: '2 de jul. de 1971', dni: null } })
  assert.equal(f.length, 1)
  assert.equal(f[0].rol, 'conductor_habitual')
  assert.equal(f[0].fechaNacimiento, '1971-07-02')
  assert.deepEqual(normalizarFigurasLeidas(null), [])
  assert.deepEqual(normalizarFigurasLeidas({ figuras: 'basura' }), [])
})

test('compatibilidad: `conductorPrincipal` del contacto sale de `figuras` si no viene suelto', () => {
  const c = normalizarContactoTomador({ figuras: [{ rol: 'conductor_habitual', nombre: 'Pedro Prueba Ficticio', dni: DNI_A }] })
  assert.deepEqual(c.conductorPrincipal, { nombre: 'Pedro Prueba Ficticio', fechaNacimiento: null, dni: DNI_A })
  const tomador = normalizarContactoTomador({ figuras: [{ rol: 'conductor_habitual', nombre: 'Ana Ruiz', esTomador: true }] })
  assert.equal(tomador.conductorPrincipal, null)
})

// ─── ¿Es el tomador? (antes `conductorEsOtraPersona`) ────────────────────────

test('🪤 esOtraPersona: empresa siempre; DNI manda; nombre contenido = la misma persona', () => {
  assert.equal(esOtraPersona({ nombre: 'Ejemplo Viajes SL', dni: null }, empresa), true)
  assert.equal(esOtraPersona({ nombre: 'Ana Ruiz Gil', dni: DNI_A }, persona), true) // mismo nombre, otro DNI
  assert.equal(esOtraPersona({ nombre: 'Pedro', dni: DNI_TOMADOR }, persona), false) // mismo DNI
  assert.equal(esOtraPersona({ nombre: 'Ana', dni: null }, persona), false)
  assert.equal(esOtraPersona({ nombre: 'RUIZ GIL, ANA', dni: null }, persona), false)
  assert.equal(esOtraPersona({ nombre: 'Ana Ruiz Gil Segunda', dni: null }, { ...persona, nombre: 'Ana Ruiz' }), false)
  assert.equal(esOtraPersona({ nombre: 'Pedro', dni: null }, persona), true)
  assert.equal(esOtraPersona({ nombre: 'Pedro', dni: null }, { ...persona, nombre: null }), false) // sin tomador: no se sabe
})

// ─── El plan ─────────────────────────────────────────────────────────────────

test('🪤 plan: la misma persona en dos roles (mismo DNI, o sin DNI y mismo nombre) es UNA', () => {
  const p = planFiguras(lectura([
    { rol: 'propietario', nombre: 'Pedro Prueba Ficticio', dni: DNI_A },
    { rol: 'conductor_habitual', nombre: 'PRUEBA FICTICIO, PEDRO', dni: DNI_A },
    { rol: 'conductor_ocasional', nombre: 'Lucía Otra', dni: null },
    { rol: 'conductor_ocasional', nombre: 'lucía  otra' },
  ]), persona, 'auto')
  assert.equal(p.personas.length, 2)
  assert.deepEqual(p.personas[0].roles, ['propietario', 'conductor_habitual'])
  assert.deepEqual(p.personas[1].roles, ['conductor_ocasional'])
  assert.equal(p.personas[1].extra, false)
})

test('🪤 plan: dos DNI distintos con el mismo nombre (padre e hijo) NO se funden', () => {
  const p = planFiguras(lectura([
    { rol: 'propietario', nombre: 'Juan Pérez Gómez', dni: DNI_A },
    { rol: 'conductor_habitual', nombre: 'Juan Pérez Gómez', dni: DNI_B },
  ]), persona, 'auto')
  assert.equal(p.personas.length, 2)
  assert.deepEqual(p.personas.map((x) => x.dni), [DNI_A, DNI_B])
})

test('🪤 plan: el tomador se descarta (por DNI, por «esTomador», por nombre, o «conductor habitual: el tomador»)', () => {
  const p = planFiguras(lectura([
    { rol: 'propietario', nombre: 'Otro Nombre Cualquiera', dni: DNI_TOMADOR },
    { rol: 'conductor_ocasional', nombre: 'Ana Ruiz Gil' },
    { rol: 'conductor_ocasional', nombre: 'Alguien Distinto', esTomador: true },
  ]), persona, 'auto')
  assert.equal(p.personas.length, 0)
  const q = planFiguras(lectura([{ rol: 'conductor_habitual', nombre: 'Nombre Mal Leído' }], { tomadorEsConductorHabitual: true }), persona, 'auto')
  assert.equal(q.personas.length, 0)
  assert.equal(q.tomadorConduce, true)
})

test('🪤 plan: la SL tomadora puesta de propietaria NO se duplica como lead (por CIF o por razón social)', () => {
  const porNombre = planFiguras(lectura([
    { rol: 'propietario', nombre: 'EJEMPLO VIAJES, S.L.' },
    { rol: 'conductor_habitual', nombre: 'Pedro Prueba Ficticio' },
  ]), empresa, 'auto')
  assert.deepEqual(porNombre.personas.map((x) => x.nombre), ['Pedro Prueba Ficticio'])
  const porCif = planFiguras(lectura([{ rol: 'propietario', nombre: 'Otro Rótulo Comercial', dni: 'ES' + CIF }]), empresa, 'auto')
  assert.equal(porCif.personas.length, 0)
  // Otra empresa (la financiera) con CIF tampoco es una persona: fuera, y el rol queda ocupado.
  const financiera = planFiguras(lectura([
    { rol: 'propietario', nombre: 'Financiera Ejemplo SA', dni: 'A28141935' },
    { rol: 'propietario', nombre: 'Juan Segundo Propietario' },
  ]), persona, 'auto')
  assert.equal(financiera.personas.length, 1)
  assert.deepEqual(financiera.personas[0].roles, [])
  // Una persona física sigue siendo figura aunque el modelo diga «esTomador» de una empresa.
  const p = planFiguras(lectura([{ rol: 'conductor_habitual', nombre: 'Pedro Prueba Ficticio', esTomador: true }]), empresa, 'auto')
  assert.equal(p.personas.length, 1)
  assert.deepEqual(p.personas[0].roles, ['conductor_habitual'])
})

test('🪤 plan: una persona por rol; los ocasionales de más quedan sin rol y marcados «extra»', () => {
  const p = planFiguras(lectura([
    { rol: 'conductor_ocasional', nombre: 'Primera Ocasional' },
    { rol: 'conductor_ocasional', nombre: 'Segunda Ocasional' },
  ]), persona, 'auto')
  assert.deepEqual(p.personas.map((x) => [x.roles, x.extra]), [[['conductor_ocasional'], false], [[], true]])
})

test('🪤 plan: moto no tiene conductor ocasional (la persona queda, sin rol)', () => {
  const p = planFiguras(lectura([
    { rol: 'conductor_habitual', nombre: 'Pedro Prueba' },
    { rol: 'conductor_ocasional', nombre: 'Lucía Prueba' },
  ]), persona, 'moto')
  assert.deepEqual(p.personas[0].roles, ['conductor_habitual'])
  assert.deepEqual(p.personas[1].roles, [])
  assert.equal(p.personas[1].extra, true)
})

test('🪤 plan: el rol que lleva el tomador está ocupado (el siguiente con ese rol queda extra)', () => {
  const p = planFiguras(lectura([
    { rol: 'propietario', nombre: 'Ana Ruiz Gil', dni: DNI_TOMADOR },
    { rol: 'propietario', nombre: 'Cotitular Del Coche' },
  ]), persona, 'auto')
  assert.deepEqual(p.personas[0].roles, [])
  assert.equal(p.personas[0].extra, true)
})

test('🪤 plan: tomador empresa → nacimiento y carné de arriba son del CONDUCTOR HABITUAL (ya no se tiran)', () => {
  const p = planFiguras(
    lectura([{ rol: 'conductor_habitual', nombre: 'Pedro Prueba Ficticio' }], { fechaNacimiento: '1971-07-02', fechaCarnet: '1990-01-15', claseCarnet: 'B' }),
    empresa,
    'auto',
  )
  assert.equal(p.personas[0].fechaNacimiento, '1971-07-02')
  assert.equal(p.personas[0].fechaCarnet, '1990-01-15')
  assert.equal(p.personas[0].claseCarnet, 'B')
  // Persona física que NO conduce: el carné es del habitual; su nacimiento sigue siendo del tomador.
  const q = planFiguras(
    lectura([{ rol: 'conductor_habitual', nombre: 'Pedro Prueba Ficticio' }], { fechaNacimiento: '1960-02-02', fechaCarnet: '2025-06-01', tomadorEsConductorHabitual: false }),
    persona,
    'auto',
  )
  assert.equal(q.personas[0].fechaCarnet, '2025-06-01')
  assert.equal(q.personas[0].fechaNacimiento, null)
})

test('plan: otro ramo → vacío', () => {
  assert.deepEqual(planFiguras(lectura([{ rol: 'propietario', nombre: 'Pedro Prueba' }]), persona, 'hogar').personas, [])
})

test('detalle de la relación: roles y nº de póliza', () => {
  assert.equal(detalleRelacionFigura(['propietario'], '123'), 'Propietario del vehículo (póliza 123)')
  assert.equal(detalleRelacionFigura(['propietario', 'conductor_habitual'], null), 'Propietario del vehículo y conductor habitual')
  assert.equal(detalleRelacionFigura(['conductor_ocasional'], ''), 'Conductor ocasional')
})

// ─── Reutilizar un lead sin DNI ─────────────────────────────────────────────

test('🪤 lead sin DNI: solo se reutiliza un lead sin DNI, mismo nombre exacto Y ya relacionado con ESTE tomador', () => {
  const base: CandidatoLeadSinDni = { id: 'l1', nombre: 'Lucía', apellidos: 'Otra Persona', tipo: 'lead', tieneDni: false, relacionadoConTomador: true }
  assert.equal(leadSinDniReutilizable([base], 'OTRA PERSONA, LUCÍA'), 'l1')
  assert.equal(leadSinDniReutilizable([{ ...base, relacionadoConTomador: false }], 'Lucía Otra Persona'), null)
  assert.equal(leadSinDniReutilizable([{ ...base, tieneDni: true }], 'Lucía Otra Persona'), null)
  assert.equal(leadSinDniReutilizable([{ ...base, tipo: 'cliente' }], 'Lucía Otra Persona'), null)
  assert.equal(leadSinDniReutilizable([base], 'Lucía Otra'), null) // no exacto
  // Una sola palabra: vale si es EXACTAMENTE la misma (el universo ya es lo vinculado a este tomador).
  assert.equal(leadSinDniReutilizable([{ ...base, nombre: 'Lucía', apellidos: '' }], 'LUCIA'), 'l1')
  assert.equal(leadSinDniReutilizable([{ ...base, nombre: 'Lucía', apellidos: '' }], 'Lucía Otra'), null)
  assert.equal(leadSinDniReutilizable([base], ''), null)
})

// ─── Lo que va a la ficha de la figura ───────────────────────────────────────

test('🪤 parche de la figura: solo huecos; 01/01 a confirmar; carné solo sin ninguno; moto sin clase no se adivina', () => {
  const p = parcheFigura({ tieneFechaNacimiento: false, carnets: 0 }, { fechaNacimiento: '1990-01-01', fechaCarnet: '2010-05-05', claseCarnet: null }, 'auto', HOY)
  assert.equal(p.fechaNacimiento, '1990-01-01')
  assert.equal(p.fechaNacimientoAConfirmar, true)
  assert.deepEqual(p.carnet, { tipo: 'B', fecha: '2010-05-05' })
  const llena = parcheFigura({ tieneFechaNacimiento: true, carnets: 1 }, { fechaNacimiento: '1990-03-03', fechaCarnet: '2010-05-05', claseCarnet: 'B' }, 'auto', HOY)
  assert.deepEqual(llena.rellenado, [])
  assert.equal(parcheFigura({ tieneFechaNacimiento: true, carnets: null }, { fechaNacimiento: null, fechaCarnet: '2010-05-05', claseCarnet: 'B' }, 'auto', HOY).carnet, null)
  assert.equal(parcheFigura({ tieneFechaNacimiento: true, carnets: 0 }, { fechaNacimiento: null, fechaCarnet: '2010-05-05', claseCarnet: null }, 'moto', HOY).carnet, null)
})

// ─── Conductor joven o novel ─────────────────────────────────────────────────

test('🪤 conductor joven/novel: <25 años o <2 de carné; sin fechas no se afirma nada', () => {
  assert.equal(hayConductorJovenONovel([{ fechaNacimiento: '2002-10-04', fechaCarnet: null }], HOY), true) // 23 años
  assert.equal(hayConductorJovenONovel([{ fechaNacimiento: '2001-10-03', fechaCarnet: null }], HOY), false) // 25 hoy
  assert.equal(hayConductorJovenONovel([{ fechaNacimiento: '1980-01-01', fechaCarnet: '2025-01-01' }], HOY), true) // novel
  assert.equal(hayConductorJovenONovel([{ fechaNacimiento: '1980-01-01', fechaCarnet: '2024-10-03' }], HOY), false) // 2 años justos
  assert.equal(hayConductorJovenONovel([{ fechaNacimiento: null, fechaCarnet: null }], HOY), false)
  assert.equal(hayConductorJovenONovel([], HOY), false)
  assert.doesNotMatch(NOTA_CONDUCTOR_JOVEN_NOVEL, /\d/)
})

test('🪤 conductor joven/novel: cuenta el tomador si conduce, y los ocasionales; no el propietario', () => {
  const tomadorJoven = planFiguras(lectura([], { tomadorEsConductorHabitual: true, fechaNacimiento: '2005-05-05' }), persona, 'auto')
  assert.equal(hayConductorJovenONovel(conductoresDelPlan(tomadorJoven), HOY), true)
  const propietarioJoven = planFiguras(lectura([{ rol: 'propietario', nombre: 'Hijo Joven Prueba', fechaNacimiento: '2005-05-05' }]), persona, 'auto')
  assert.equal(hayConductorJovenONovel(conductoresDelPlan(propietarioJoven), HOY), false)
  const ocasional = planFiguras(lectura([{ rol: 'conductor_ocasional', nombre: 'Hijo Joven Prueba', fechaNacimiento: '2005-05-05' }]), persona, 'moto')
  assert.equal(hayConductorJovenONovel(conductoresDelPlan(ocasional), HOY), true)
  // El tomador sin decir que conduce: no se le cuenta (no se sabe).
  const noSeSabe = planFiguras(lectura([], { fechaNacimiento: '2005-05-05' }), persona, 'auto')
  assert.equal(hayConductorJovenONovel(conductoresDelPlan(noSeSabe), HOY), false)
})

// ─── Caso Qover (03/10/2026): tomador SL, persona de contacto = conductor principal, adicional sin nombre ──

const QOVER = {
  tomador: 'Ejemplo Viajes SL',
  tomadorEsEmpresa: true,
  personaContactoTomador: 'Fermin Prueba Ficticio',
  figuras: [
    { rol: 'conductor_habitual', nombre: 'Fermin Prueba Ficticio', fechaNacimiento: '2 de jul. de 1971', domicilioVia: 'Calle Inventada 17', domicilioCp: '41003', domicilioPoblacion: 'Sevilla', domicilioProvincia: null, dni: null },
    { rol: 'conductor_adicional', nombre: null, fechaNacimiento: '1974-05-04' },
  ],
}

test('🪤 Qover: el domicilio de la figura se lee (CP normalizado) y el adicional sin nombre no es persona', () => {
  const [f, ...resto] = normalizarFigurasLeidas(QOVER)
  assert.equal(resto.length, 0)
  assert.equal(f.domicilioVia, 'Calle Inventada 17')
  assert.equal(f.domicilioCp, '41003')
  assert.equal(f.domicilioPoblacion, 'Sevilla')
  assert.equal(f.domicilioProvincia, null)
  assert.equal(normalizarFigurasLeidas({ figuras: [{ rol: 'propietario', nombre: 'X Y', domicilioCp: '99999' }] })[0].domicilioCp, null)
  assert.deepEqual(figurasSinNombre(QOVER), [{ rol: 'conductor_ocasional', fechaNacimiento: '1974-05-04', fechaCarnet: null }])
  // Un rol suelto sin ningún dato es ruido; el que dice ser el tomador, tampoco.
  assert.deepEqual(figurasSinNombre({ figuras: [{ rol: 'conductor_ocasional', nombre: null }, { rol: 'conductor_ocasional', fechaNacimiento: '1974-05-04', esTomador: true }] }), [])
  assert.deepEqual(figurasSinNombre(null), [])
})

test('🪤 Qover: la persona de contacto es UNA figura (2+ palabras); el adicional sin nombre cuenta para joven/novel', () => {
  const c = normalizarContactoTomador(QOVER)
  assert.equal(c.personaContacto, 'Fermin Prueba Ficticio')
  // Con un tomador persona física no hay «persona de contacto».
  assert.equal(normalizarContactoTomador({ ...QOVER, tomadorEsEmpresa: false, tomador: 'Ana Ruiz', dni: DNI_TOMADOR }).personaContacto, null)
  const p = planFiguras(
    { ...lectura(QOVER.figuras), sinNombre: figurasSinNombre(QOVER) },
    { ...empresa, personaContacto: c.personaContacto },
    'auto',
  )
  assert.equal(p.personas.length, 1)
  assert.equal(p.personas[0].personaContacto, true)
  // Caso Qover real: «Fermin Bueno» contra «Fermin Bueno Rodriguez» (2 palabras) ya NO casa: sin contacto copiado.
  assert.equal(planFiguras(lectura(QOVER.figuras), { ...empresa, personaContacto: 'Fermin Prueba' }, 'auto').personas[0].personaContacto, false)
  assert.equal(p.personas[0].domicilioCp, '41003')
  assert.equal(detalleRelacionFigura(p.personas[0].rolesLeidos, 'Q-1', p.personas[0].personaContacto), 'Persona de contacto · Conductor habitual (póliza Q-1)')
  assert.deepEqual(p.sinNombre, [{ rol: 'conductor_ocasional', fechaNacimiento: '1974-05-04', fechaCarnet: null }])
  assert.equal(notaFiguraSinNombre('conductor_ocasional'), 'Hay un conductor adicional sin nombre en la póliza: complétalo a mano.')
  assert.doesNotMatch(notaFiguraSinNombre('conductor_ocasional'), /\d/)
  assert.deepEqual(['propietario', 'conductor_habitual', 'conductor_ocasional'].map((r) => accionFiguraSinNombre(r as 'propietario')), ['propietario_sin_nombre', 'conductor_habitual_sin_nombre', 'conductor_adicional_sin_nombre'])
  // El adicional sin nombre joven SÍ cuenta (y uno de 1974 no).
  assert.equal(hayConductorJovenONovel(conductoresDelPlan(p), HOY), false)
  const joven = planFiguras({ ...lectura([]), sinNombre: [{ rol: 'conductor_ocasional', fechaNacimiento: '2005-05-05', fechaCarnet: null }] }, empresa, 'auto')
  assert.equal(hayConductorJovenONovel(conductoresDelPlan(joven), HOY), true)
  // Otro ramo: ni sin nombre.
  assert.deepEqual(planFiguras({ ...lectura([]), sinNombre: figurasSinNombre(QOVER) }, empresa, 'hogar').sinNombre, [])
  // Sin persona de contacto, o con una que casa con dos personas, no se marca a nadie.
  assert.equal(planFiguras(lectura(QOVER.figuras), empresa, 'auto').personas[0].personaContacto, false)
  const dos = planFiguras(lectura([
    { rol: 'conductor_habitual', nombre: 'Fermin Prueba Ficticio Uno', dni: DNI_A },
    { rol: 'conductor_ocasional', nombre: 'Fermin Prueba Ficticio Dos', dni: DNI_B },
  ]), { ...empresa, personaContacto: 'Fermin Prueba Ficticio' }, 'auto')
  assert.deepEqual(dos.personas.map((x) => x.personaContacto), [false, false])
})

test('🪤 persona de contacto: mismo nombre exacto; uno dentro del otro solo si el corto tiene 3+ palabras', () => {
  assert.equal(esPersonaDeContacto('Fermin Prueba', 'Fermín Prueba Ficticio'), false) // 2 palabras: podría ser otro
  assert.equal(esPersonaDeContacto('Fermin Prueba', 'FERMÍN PRUEBA'), true)
  assert.equal(esPersonaDeContacto('Fermin Prueba Ficticio', 'Fermín Prueba Ficticio Segundo'), true)
  assert.equal(esPersonaDeContacto('PRUEBA FICTICIO, FERMÍN', 'Fermín Prueba Ficticio'), true)
  assert.equal(esPersonaDeContacto('Fermin', 'Fermín Prueba Ficticio'), false) // una palabra no basta
  assert.equal(esPersonaDeContacto('Fermin Otro', 'Fermín Prueba Ficticio'), false)
  assert.equal(esPersonaDeContacto(null, 'Fermín Prueba'), false)
})

test('🪤 contacto del tomador a la persona de contacto: solo se pasa por encima si la otra ficha es SOLO el tomador', () => {
  assert.equal(contactoSoloDelTomador(['t1'], 't1'), true)
  assert.equal(contactoSoloDelTomador(['t1', 'otro'], 't1'), false)
  assert.equal(contactoSoloDelTomador([], 't1'), false) // nadie lo tiene: no hace falta
  assert.equal(contactoSoloDelTomador(null, 't1'), false) // no se pudo mirar
})

test('🪤 parche de la figura: domicilio en BLOQUE, solo si la ficha no tiene calle', () => {
  const dom = { domicilioVia: 'Calle Inventada 17', domicilioCp: '41003', domicilioPoblacion: 'Sevilla', domicilioProvincia: null }
  const base = { fechaNacimiento: null, fechaCarnet: null, claseCarnet: null, ...dom }
  const vacia = { tieneFechaNacimiento: true, carnets: 1, tieneDireccion: false, tieneCodigoPostal: false, tieneCiudad: false, tieneProvincia: false }
  const p = parcheFigura(vacia, base, 'auto', HOY)
  assert.equal(p.direccion, 'Calle Inventada 17')
  assert.equal(p.codigoPostal, '41003')
  assert.equal(p.ciudad, 'Sevilla')
  assert.equal(p.provincia, null)
  assert.deepEqual(p.rellenado, ['domicilio', 'código postal', 'población'])
  // Con calle en la ficha, ni CP ni población del papel.
  const conCalle = parcheFigura({ ...vacia, tieneDireccion: true }, base, 'auto', HOY)
  assert.deepEqual([conCalle.direccion, conCalle.codigoPostal, conCalle.ciudad], [null, null, null])
  // Sin saber qué tiene la ficha (ausente), no se escribe.
  assert.equal(parcheFigura({ tieneFechaNacimiento: true, carnets: 1 }, base, 'auto', HOY).direccion, null)
})

test('🪤 tarea «Pedir DNI y carné»: sin nombre, solo de conductores, y solo si SE SABE que falta', () => {
  assert.equal(tareaPedirDniYCarne({ rolesLeidos: ['propietario', 'conductor_habitual'] }), 'Pedir DNI y carné del conductor habitual')
  assert.equal(tareaPedirDniYCarne({ rolesLeidos: ['conductor_ocasional'] }), 'Pedir DNI y carné del conductor ocasional')
  assert.equal(tareaPedirDniYCarne({ rolesLeidos: ['propietario'] }), null)
  assert.equal(faltaDniOCarne({ tieneDni: false, carnets: 1 }), true)
  assert.equal(faltaDniOCarne({ tieneDni: true, carnets: 0 }), true)
  assert.equal(faltaDniOCarne({ tieneDni: true, carnets: 1 }), false)
  assert.equal(faltaDniOCarne({ tieneDni: null, carnets: null }), false) // no se pudo mirar ≠ falta
})

test('🪤 lead sin DNI: el lead ANTIGUO con el nombre entero en `nombre` y el nuevo partido casan igual', () => {
  const viejo: CandidatoLeadSinDni = { id: 'viejo', nombre: 'Fermin Prueba Ficticio', apellidos: '', tipo: 'lead', tieneDni: false, relacionadoConTomador: true }
  const nuevo: CandidatoLeadSinDni = { ...viejo, id: 'nuevo', nombre: 'Fermín', apellidos: 'Prueba Ficticio' }
  assert.equal(leadSinDniReutilizable([viejo], 'Fermín Prueba Ficticio'), 'viejo')
  assert.equal(leadSinDniReutilizable([nuevo], 'FERMIN PRUEBA FICTICIO'), 'nuevo')
  assert.equal(leadSinDniReutilizable([{ ...viejo, apellidos: null }], 'Fermín Prueba Ficticio'), 'viejo')
})
