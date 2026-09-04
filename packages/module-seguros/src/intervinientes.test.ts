import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contactoEfectivo, etiquetaRol, filasIntervinientes, personasDePolizas, type IntervinienteFicha } from './intervinientes.ts'

const base = (x: Partial<IntervinienteFicha>): IntervinienteFicha => ({
  polizaId: 'p1', rol: 'propietario', nombre: null, nombreIlegible: false,
  telefono: null, email: null, telefonoIlegible: false, emailIlegible: false,
  fichaId: null, esTomador: false, origen: 'cima', personaClave: null, ...x,
})

test('el tomador manda: si tiene teléfono, no se mira a nadie más', () => {
  const c = contactoEfectivo({ telefono: '600', email: 'a@b' }, [base({ telefono: '700' })])
  assert.equal(c.telefono, '600')
  assert.equal(c.viaTelefono, 'tomador')
  assert.equal(c.quien, null)
})

test('Esquiansa: la empresa no tiene teléfono, su conductor habitual sí', () => {
  const c = contactoEfectivo({ telefono: null, email: null }, [
    base({ rol: 'conductor_habitual', nombre: 'Juan Manuel Lopez Benjumea', telefono: '600', email: 'jm@x', fichaId: 'f2' }),
  ])
  assert.equal(c.telefono, '600')
  assert.equal(c.viaTelefono, 'interviniente')
  assert.equal(c.quien?.nombre, 'Juan Manuel Lopez Benjumea')
  assert.equal(c.quien?.rol, 'conductor_habitual')
  assert.equal(c.quien?.fichaId, 'f2')
})

test('la persona de contacto va antes que el conductor si las dos tienen teléfono', () => {
  const c = contactoEfectivo({ telefono: null, email: null }, [
    base({ rol: 'conductor_habitual', nombre: 'C', telefono: '1' }),
    base({ rol: 'contacto', nombre: 'K', telefono: '2' }),
  ])
  assert.equal(c.quien?.nombre, 'K')
})

test('🚨 el contacto del PROPIO tomador colgado de la póliza SÍ cuenta', () => {
  // Corregido el 04/09/2026: este test afirmaba lo contrario («no aporta
  // contacto nuevo») dando por hecho que el dato del tomador ya venía en su
  // ficha. Medido contra la base, es falso: CIMA trae el email en la fila del
  // interviniente y nadie lo copia. `MORALES ISABEL MALDONADO` (propietario,
  // origen CIMA) y `Juan Manuel Duran Ibañez` salían «sin email» teniéndolo.
  const c = contactoEfectivo({ telefono: null, email: null }, [base({ telefono: '600', esTomador: true })])
  assert.equal(c.telefono, '600')
  // Ni «tomador» (no está en su ficha, y el aviso de vencimiento lee la ficha)
  // ni «interviniente» (no es de un tercero): es su propio dato, mal guardado.
  assert.equal(c.viaTelefono, 'tomador_en_poliza')
  // No se le atribuye a nadie: es él.
  assert.equal(c.quien, null)
})

test('lo SUYO manda sobre lo de un tercero, aunque el tercero tenga mejor rol', () => {
  // Copiar un dato a la ficha ≠ llamar a otra persona para pedirle el suyo.
  const c = contactoEfectivo({ telefono: null, email: null }, [
    base({ rol: 'contacto', nombre: 'K', telefono: '2' }),
    base({ rol: 'propietario', telefono: '1', esTomador: true }),
  ])
  assert.equal(c.telefono, '1')
  assert.equal(c.viaTelefono, 'tomador_en_poliza')
  assert.equal(c.quien, null)
})

test('🚨 intervinientes sin mirar ≠ sin intervinientes', () => {
  const sinMirar = contactoEfectivo({ telefono: null, email: null }, null)
  assert.equal(sinMirar.intervinientesSinMirar, true)
  const ninguno = contactoEfectivo({ telefono: null, email: null }, [])
  assert.equal(ninguno.intervinientesSinMirar, false)
  assert.equal(ninguno.telefono, null)
})

test('el email puede venir de otra persona que el teléfono', () => {
  const c = contactoEfectivo({ telefono: '600', email: null }, [base({ rol: 'contacto', nombre: 'K', email: 'k@x' })])
  assert.equal(c.viaTelefono, 'tomador')
  assert.equal(c.viaEmail, 'interviniente')
  assert.equal(c.quien?.nombre, 'K')
})

test('etiquetas de rol en castellano, sin guiones bajos', () => {
  assert.equal(etiquetaRol('conductor_habitual'), 'conductor habitual')
  assert.equal(etiquetaRol('lo_que_sea'), 'lo que sea')
})

// ── El tomador, que NO es un interviniente ───────────────────────────────────

const TITULAR = { polizaId: 'p1', fichaId: 'c1', nombre: 'GLOBAL 2 INSTALACIONES TECNICAS' }

test('6930FBP: con un solo conductor habitual, el titular SÍ sale, y el primero', () => {
  const r = filasIntervinientes(TITULAR, [base({ rol: 'conductor_habitual', nombre: 'X', fichaId: 'c9' })])
  assert.equal(r.filas.length, 2)
  assert.equal(r.filas[0].rol, 'tomador')
  assert.equal(r.filas[0].nombre, 'GLOBAL 2 INSTALACIONES TECNICAS')
  assert.equal(r.filas[0].fichaId, 'c1')
  assert.equal(r.filas[0].origen, 'poliza')
  assert.equal(r.aviso, null)
})

test('cepo 6930FBP: el titular no puede faltar en la tarjeta', () => {
  // Este es el fallo que vio Alberto: la empresa titular no aparecía por
  // ningún lado porque CIMA solo manda al conductor.
  const r = filasIntervinientes(TITULAR, [base({ rol: 'conductor_habitual' })])
  assert.ok(r.filas.some(f => f.esTomador), 'la tarjeta se ha quedado otra vez sin el tomador')
})

test('si la compañía ya manda al tomador como propietario, no se duplica', () => {
  const r = filasIntervinientes(TITULAR, [base({ rol: 'propietario', fichaId: 'c1', esTomador: true })])
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].rol, 'propietario')
  assert.equal(r.aviso, null)
})

test('sin intervinientes de CIMA: sale el tomador y se dice que no hay nadie más', () => {
  const r = filasIntervinientes(TITULAR, [])
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].rol, 'tomador')
  assert.equal(r.aviso, 'solo_tomador')
})

test('no se pudo mirar la tabla: el tomador sale igual, pero el aviso NO se colapsa', () => {
  const r = filasIntervinientes(TITULAR, null)
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].rol, 'tomador')
  // «no se pudo mirar» nunca se pinta como «no hay nadie más».
  assert.equal(r.aviso, 'sin_mirar')
})

test('el rol sintetizado tiene etiqueta propia', () => {
  assert.equal(etiquetaRol('tomador'), 'tomador')
})

test('GLOBAL 2: con tres conductores distintos, se dice de QUÉ póliza sale el teléfono', () => {
  // La empresa no tiene teléfono propio; cada furgoneta lleva su conductor
  // habitual, y son tres personas diferentes. El número que se pinta es el de
  // UNO, y hay que poder decir cuál.
  const c = contactoEfectivo({ telefono: null, email: null }, [
    base({ polizaId: 'pA', rol: 'conductor_habitual', nombre: 'A' }),
    base({ polizaId: 'pB', rol: 'conductor_habitual', nombre: 'B', telefono: '615', email: 'b@x' }),
    base({ polizaId: 'pC', rol: 'conductor_habitual', nombre: 'C', telefono: '699' }),
  ])
  assert.equal(c.telefono, '615')
  assert.equal(c.quien?.nombre, 'B')
  assert.equal(c.quien?.polizaId, 'pB')
})

// ── Las personas de las pólizas, agrupadas por persona ───────────────────────

const POLIZAS = [
  { id: 'pA', etiqueta: '6930FBP' },
  { id: 'pB', etiqueta: '8148DGP' },
  { id: 'pC', etiqueta: '2922BNJ' },
]

test('GLOBAL 2: tres furgonetas, tres conductores, cada uno con su matrícula', () => {
  const r = personasDePolizas([
    base({ polizaId: 'pA', rol: 'conductor_habitual', nombre: 'A', fichaId: 'f1', telefono: '600' }),
    base({ polizaId: 'pB', rol: 'conductor_habitual', nombre: 'B' }),
    base({ polizaId: 'pC', rol: 'conductor_habitual', nombre: 'C', telefono: '615', email: 'c@x' }),
  ], POLIZAS, [])
  assert.equal(r?.length, 3)
  assert.deepEqual(r?.map(p => p.nombre), ['A', 'B', 'C'])
  assert.deepEqual(r?.[0].papeles, [{ rol: 'conductor_habitual', polizas: ['6930FBP'] }])
  assert.equal(r?.[2].email, 'c@x')
})

test('la misma persona en dos pólizas es UNA fila con las dos matrículas', () => {
  const r = personasDePolizas([
    base({ polizaId: 'pA', rol: 'conductor_habitual', nombre: 'A', fichaId: 'f1' }),
    base({ polizaId: 'pB', rol: 'conductor_habitual', nombre: 'A', fichaId: 'f1', telefono: '600' }),
  ], POLIZAS, [])
  assert.equal(r?.length, 1)
  assert.deepEqual(r?.[0].papeles, [{ rol: 'conductor_habitual', polizas: ['6930FBP', '8148DGP'] }])
  // El teléfono aparece en la segunda fila y no se pierde.
  assert.equal(r?.[0].telefono, '600')
})

test('sin ficha enlazada se agrupa por nombre, que es lo único que hay', () => {
  const r = personasDePolizas([
    base({ polizaId: 'pA', rol: 'propietario', nombre: 'Juan Perez' }),
    base({ polizaId: 'pB', rol: 'conductor_habitual', nombre: '  juan perez ' }),
  ], POLIZAS, [])
  assert.equal(r?.length, 1)
  // Primero el papel de mayor prioridad de contacto.
  assert.deepEqual(r?.[0].papeles.map(x => x.rol), ['conductor_habitual', 'propietario'])
})

test('el TOMADOR no sale: es la ficha que se está mirando', () => {
  const r = personasDePolizas([
    base({ polizaId: 'pA', rol: 'propietario', nombre: 'La empresa', esTomador: true }),
    base({ polizaId: 'pA', rol: 'conductor_habitual', nombre: 'A' }),
  ], POLIZAS, [])
  assert.deepEqual(r?.map(p => p.nombre), ['A'])
})

test('si tiene relación declarada se dice cuál; si no, null (no «no tiene familia»)', () => {
  const r = personasDePolizas(
    [base({ polizaId: 'pA', rol: 'conductor_habitual', nombre: 'A', fichaId: 'f1' }),
     base({ polizaId: 'pB', rol: 'conductor_habitual', nombre: 'B', fichaId: 'f2' })],
    POLIZAS,
    [{ relacionadoId: 'f1', tipo: 'Cónyuge/Pareja de Hecho' }],
  )
  assert.equal(r?.find(p => p.nombre === 'A')?.relacionDeclarada, 'Cónyuge/Pareja de Hecho')
  assert.equal(r?.find(p => p.nombre === 'B')?.relacionDeclarada, null)
})

test('cepo: «no se pudo leer» se propaga, nunca se convierte en lista vacía', () => {
  assert.equal(personasDePolizas(null, POLIZAS, []), null)
  assert.deepEqual(personasDePolizas([], POLIZAS, []), [])
})

test('una póliza que no está en la lista no inventa etiqueta', () => {
  const r = personasDePolizas([base({ polizaId: 'pZ', rol: 'contacto', nombre: 'A' })], POLIZAS, [])
  assert.deepEqual(r?.[0].papeles, [{ rol: 'contacto', polizas: [] }])
})

// ── «Ojo con duplicar» (Alberto, 02/09/2026) ─────────────────────────────────

test('dos homónimos con NIF distinto NO se funden: son dos personas', () => {
  // Padre e hijo con el mismo nombre en dos coches de la misma ficha. Fundirlos
  // mezclaría sus teléfonos y sería peor que duplicarlos.
  const r = personasDePolizas([
    base({ polizaId: 'pA', rol: 'conductor_habitual', nombre: 'Juan Perez', personaClave: 'p1', telefono: '600' }),
    base({ polizaId: 'pB', rol: 'conductor_habitual', nombre: 'Juan Perez', personaClave: 'p2', telefono: '699' }),
  ], POLIZAS, [])
  assert.equal(r?.length, 2)
  assert.deepEqual(r?.map(x => x.telefono).sort(), ['600', '699'])
})

test('la misma persona con y sin NIF no se parte en dos filas', () => {
  const r = personasDePolizas([
    base({ polizaId: 'pA', rol: 'conductor_habitual', nombre: 'A', personaClave: 'p1', fichaId: 'f1' }),
    base({ polizaId: 'pB', rol: 'conductor_habitual', nombre: 'A', fichaId: 'f1', telefono: '600' }),
  ], POLIZAS, [])
  assert.equal(r?.length, 1)
  assert.equal(r?.[0].telefono, '600')
  assert.deepEqual(r?.[0].papeles[0].polizas, ['6930FBP', '8148DGP'])
})

test('el NIF manda sobre el nombre: mismo NIF con el nombre escrito distinto es UNA', () => {
  const r = personasDePolizas([
    base({ polizaId: 'pA', rol: 'propietario', nombre: 'JUAN PEREZ LOPEZ', personaClave: 'p1' }),
    base({ polizaId: 'pB', rol: 'conductor_habitual', nombre: 'Juan Perez', personaClave: 'p1' }),
  ], POLIZAS, [])
  assert.equal(r?.length, 1)
})

test('dos NIF sobre la misma ficha: dato contradictorio, no se elige uno', () => {
  const r = personasDePolizas([
    base({ polizaId: 'pA', rol: 'conductor_habitual', personaClave: 'p1', fichaId: 'f1' }),
    base({ polizaId: 'pB', rol: 'conductor_habitual', personaClave: 'p2', fichaId: 'f1' }),
    base({ polizaId: 'pC', rol: 'conductor_habitual', nombre: 'C', fichaId: 'f1' }),
  ], POLIZAS, [])
  // Los dos con NIF siguen separados; el tercero no se cuelga de ninguno.
  assert.equal(r?.length, 3)
})

test('sin NIF en ninguna fila se comporta como antes (409 de 504 filas hoy)', () => {
  const r = personasDePolizas([
    base({ polizaId: 'pA', rol: 'propietario', nombre: 'Juan Perez' }),
    base({ polizaId: 'pB', rol: 'conductor_habitual', nombre: 'juan perez' }),
  ], POLIZAS, [])
  assert.equal(r?.length, 1)
})

// ── Homonimia: se dice, no se funde ni se calla (03/09/2026) ─────────────────

test('José Suárez Salas: la misma persona en DOS fichas se marca «sin_distinguir»', () => {
  // Medido en la cartera: «María Antonia Gutiérrez Alcalá» sale dos veces con
  // las mismas tres matrículas porque hay dos fichas suyas (una del volcado
  // `intranet:cli:48` con DNI, otra de `asegura_app:cli2:48` sin él). No se
  // funden —una no trae NIF— pero la pantalla tiene que poder decirlo.
  const r = personasDePolizas([
    base({ polizaId: 'pA', rol: 'propietario', nombre: 'Maria Antonia Gutierrez Alcala', personaClave: 'p1', fichaId: 'f-cima' }),
    base({ polizaId: 'pB', rol: 'propietario', nombre: 'María Antonia Gutiérrez Alcalá', fichaId: 'f-volcado' }),
  ], POLIZAS, [])
  assert.equal(r?.length, 2)
  assert.deepEqual(r?.map(p => p.homonimia), ['sin_distinguir', 'sin_distinguir'])
})

test('dos homónimos con NIF distinto se marcan «distinta_persona», no «duplicada»', () => {
  const r = personasDePolizas([
    base({ polizaId: 'pA', rol: 'conductor_habitual', nombre: 'Juan Perez', personaClave: 'p1' }),
    base({ polizaId: 'pB', rol: 'conductor_habitual', nombre: 'Juan Perez', personaClave: 'p2' }),
  ], POLIZAS, [])
  assert.deepEqual(r?.map(p => p.homonimia), ['distinta_persona', 'distinta_persona'])
})

test('sin homónima, `homonimia` es null (no se avisa de nada)', () => {
  const r = personasDePolizas([
    base({ polizaId: 'pA', rol: 'conductor_habitual', nombre: 'A', fichaId: 'f1' }),
    base({ polizaId: 'pB', rol: 'conductor_habitual', nombre: 'B', fichaId: 'f2' }),
  ], POLIZAS, [])
  assert.deepEqual(r?.map(p => p.homonimia), [null, null])
})

test('las tildes no parten a una persona en dos cuando el nombre es lo único que hay', () => {
  const r = personasDePolizas([
    base({ polizaId: 'pA', rol: 'propietario', nombre: 'María Antonia' }),
    base({ polizaId: 'pB', rol: 'propietario', nombre: 'MARIA  ANTONIA' }),
  ], POLIZAS, [])
  assert.equal(r?.length, 1)
  assert.equal(r?.[0].homonimia, null)
})
