import test from 'node:test'
import assert from 'node:assert/strict'
import {
  alcancePedible,
  alcancePeticionResoluble,
  ALCANCES,
  ALCANCES_CONCEDIBLES,
  DIAS_REVISION,
  alcanceConcedible,
  autorizacionVigente,
  pideRevision,
  camposDeAlcance,
  camposDeAlcances,
  estadoAutorizacion,
  etiquetaNivelAlcances,
  puedeDarParte,
  puedeAutorizar,
  alcancesConcedibles,
  TITULOS_REPRESENTACION,
  tituloRepresentacion,
} from './autorizacion.ts'
import { NIVELES, camposVisibles } from './acceso.ts'

const HOY = new Date('2026-09-03T10:00:00Z')
const MANANA = new Date('2026-09-04T10:00:00Z')
const AYER = new Date('2026-09-02T10:00:00Z')

test('una autorizacion nace pendiente: conceder no basta, hace falta que la acepten', () => {
  assert.equal(
    estadoAutorizacion({ aceptadoEn: null, caducaEn: MANANA, revocadoEn: null }, HOY),
    'pendiente',
  )
  assert.equal(
    autorizacionVigente({ aceptadoEn: null, caducaEn: MANANA, revocadoEn: null }, HOY),
    false,
  )
})

test('aceptada y en plazo es la UNICA combinacion que abre datos ajenos', () => {
  assert.equal(
    autorizacionVigente({ aceptadoEn: AYER, caducaEn: MANANA, revocadoEn: null }, HOY),
    true,
  )
})

test('revocar gana a todo, incluso a una aceptada y en plazo', () => {
  assert.equal(
    estadoAutorizacion({ aceptadoEn: AYER, caducaEn: MANANA, revocadoEn: HOY }, HOY),
    'revocada',
  )
})

test('caducada sin haberse aceptado se dice CADUCADA, no pendiente', () => {
  // Decir «pendiente» invitaria a esperar una aceptacion que ya no puede valer.
  assert.equal(
    estadoAutorizacion({ aceptadoEn: null, caducaEn: AYER, revocadoEn: null }, HOY),
    'caducada',
  )
})

test('caduca EN el instante exacto: el limite no es vigente', () => {
  assert.equal(
    estadoAutorizacion({ aceptadoEn: AYER, caducaEn: HOY, revocadoEn: null }, HOY),
    'caducada',
  )
})

test('sin fecha de caducidad (NULL) no caduca nunca: ni pendiente ni aceptada', () => {
  const dentroDeDiezAnios = new Date('2036-09-03T10:00:00Z')
  assert.equal(estadoAutorizacion({ aceptadoEn: null, caducaEn: null, revocadoEn: null }, dentroDeDiezAnios), 'pendiente')
  assert.equal(estadoAutorizacion({ aceptadoEn: AYER, caducaEn: null, revocadoEn: null }, dentroDeDiezAnios), 'vigente')
  // Revocar sigue ganando, con o sin caducidad.
  assert.equal(estadoAutorizacion({ aceptadoEn: AYER, caducaEn: null, revocadoEn: HOY }, HOY), 'revocada')
})

test('la revision anual se pide al año de OFRECERLA o de la ultima revision, y no corta nada', () => {
  assert.equal(DIAS_REVISION, 365)
  const ofrecida = new Date('2026-09-03T10:00:00Z')
  const casiUnAnio = new Date('2027-09-02T10:00:00Z')
  const unAnio = new Date('2027-09-03T10:00:00Z')
  // Aceptada tarde: la cuenta NO arranca en la aceptación.
  const base = { otorgadoEn: ofrecida, aceptadoEn: new Date('2027-06-01T10:00:00Z'), caducaEn: null, revocadoEn: null, revisadoEn: null }
  assert.equal(pideRevision(base, casiUnAnio), false)
  assert.equal(pideRevision(base, unAnio), true)
  // Revisar reinicia la cuenta.
  assert.equal(pideRevision({ ...base, revisadoEn: new Date('2027-09-03T10:00:00Z') }, new Date('2028-01-01T00:00:00Z')), false)
  // Una PENDIENTE tampoco caduca, así que también se revisa: es la oferta olvidada.
  assert.equal(pideRevision({ ...base, aceptadoEn: null }, casiUnAnio), false)
  assert.equal(pideRevision({ ...base, aceptadoEn: null }, unAnio), true)
  // Una revocada no: ya no da nada que revisar.
  assert.equal(pideRevision({ ...base, revocadoEn: casiUnAnio }, unAnio), false)
  // Y pedir revision NO la invalida: sigue vigente mientras nadie la revoque.
  assert.equal(autorizacionVigente(base, new Date('2030-01-01T00:00:00Z')), true)
})

test('solo el dueno de la ficha concede: tarjeta y completo no autorizan a nadie', () => {
  assert.equal(puedeAutorizar('tarjeta'), false)
  assert.equal(puedeAutorizar('completo'), false)
  assert.equal(puedeAutorizar('gestionar'), true)
  assert.equal(puedeAutorizar('administrar'), true)
  // Y no se olvida ningun nivel: si manana hay uno nuevo, este test obliga a decidir.
  assert.equal(NIVELES.filter(puedeAutorizar).length, 2)
})

test('se conceden DOS permisos: Solo ver (ver_economico) y Acceso total (total)', () => {
  assert.deepEqual([...ALCANCES], ['ver', 'ver_economico', 'partes', 'documentos', 'total'])
  assert.deepEqual([...ALCANCES_CONCEDIBLES], ['ver_economico', 'total'])
  // Los antiguos se siguen LEYENDO (hay filas con ellos) pero ya no se ofrecen.
  assert.equal(alcanceConcedible('partes'), null)
  assert.equal(alcanceConcedible('documentos'), null)
  assert.equal(alcanceConcedible('ver'), null)
  assert.equal(alcanceConcedible('  VER_ECONOMICO '), 'ver_economico')
  assert.equal(alcanceConcedible('total'), 'total')
  assert.equal(alcanceConcedible('administrar'), null)
  assert.equal(alcanceConcedible(null), null)
  assert.equal(alcanceConcedible(true), null)
})

test('solo Acceso total ensena el IBAN y el DNI del otorgante; ningun otro alcance', () => {
  // El agujero que tenia el booleano del CRM: se leia como `completo`, y
  // `completo` trae iban y dniTomador. Un tercero ve la COSA, no la PERSONA —
  // salvo que el titular le haya dado expresamente acceso TOTAL (25/09/2026).
  for (const a of ALCANCES.filter((x) => x !== 'total')) {
    const c = camposDeAlcance(a)
    assert.equal(c.iban, false, `${a} no puede ensenar el IBAN`)
    assert.equal(c.dniTomador, false, `${a} no puede ensenar el DNI`)
    assert.equal(c.documentos, false, `${a} no puede ensenar los documentos`)
  }
  // Y que el cepo muerde de verdad: el nivel del que parte SI los trae.
  assert.equal(camposVisibles('completo').iban, true)
  assert.equal(camposVisibles('completo').dniTomador, true)
  const total = camposDeAlcance('total', 'fisica')
  assert.equal(total.iban, true)
  assert.equal(total.dniTomador, true)
  assert.equal(total.documentos, true)
  // La union con otros alcances no vuelve a tapar lo que `total` abrio.
  assert.equal(camposDeAlcances(['ver_economico', 'total'], 'fisica')?.iban, true)
})

test('solo Acceso total deja ACTUAR en nombre de otro, y nunca reautorizar', () => {
  for (const a of ALCANCES.filter((x) => x !== 'total')) {
    const c = camposDeAlcance(a)
    assert.equal(c.abrirParte, false, `${a} no puede abrir un parte`)
    assert.equal(c.crearPeticiones, false, `${a} no puede crear peticiones`)
    assert.equal(c.autorizarTerceros, false, `${a} no puede reautorizar a un cuarto`)
  }
  // `tarjeta` deja abrir parte a quien es de la casa; a un tercero, no.
  assert.equal(camposVisibles('tarjeta').abrirParte, true)
  for (const tipo of ['fisica', 'juridica'] as const) {
    const t = camposDeAlcance('total', tipo)
    assert.equal(t.abrirParte, true, `total (${tipo}) abre partes`)
    assert.equal(t.crearPeticiones, true, `total (${tipo}) crea peticiones`)
    assert.equal(t.autorizarTerceros, false, `total (${tipo}) NO reautoriza a un cuarto`)
  }
})

test('ver ensena la tarjeta y calla lo economico; ver_economico lo abre', () => {
  const ver = camposDeAlcance('ver')
  assert.equal(ver.compania, true)
  assert.equal(ver.numeroPoliza, true)
  assert.equal(ver.coberturas, true)
  assert.equal(ver.prima, false)
  assert.equal(ver.recibos, false)

  const eco = camposDeAlcance('ver_economico')
  assert.equal(eco.prima, true)
  assert.equal(eco.recibos, true)
})

test('sin alcances vigentes no se ensena NADA, ni la tarjeta por cortesia', () => {
  assert.equal(camposDeAlcances([]), null)
})

test('varios alcances se unen campo a campo y siguen capados', () => {
  const u = camposDeAlcances(['ver', 'ver_economico'])
  assert.notEqual(u, null)
  assert.equal(u?.prima, true)
  assert.equal(u?.coberturas, true)
  assert.equal(u?.iban, false)
  assert.equal(u?.dniTomador, false)
})

test('la etiqueta de nivel es solo texto y no decide nada', () => {
  assert.equal(etiquetaNivelAlcances(['ver']), 'tarjeta')
  assert.equal(etiquetaNivelAlcances(['ver', 'ver_economico']), 'completo')
  // Aunque la etiqueta diga `completo`, lo servido sigue sin iban.
  assert.equal(camposDeAlcances(['ver_economico'])?.iban, false)
})

// ─── Persona jurídica: representación, no consentimiento (03/09/2026) ────────
// Caso real: Pilar Piña Franco gestiona las pólizas de GLOBAL 2 INSTALACIONES
// TÉCNICAS, `tipo_persona = 'juridica'`. El RGPD protege a las personas
// FÍSICAS: una sociedad no tiene datos personales, así que ahí no hay
// consentimiento que dar — hay representación mercantil.

test('personas y sociedades conceden los mismos dos permisos', () => {
  assert.deepEqual([...alcancesConcedibles('fisica')], ['ver_economico', 'total'])
  assert.deepEqual([...alcancesConcedibles('juridica')], ['ver_economico', 'total'])
  assert.equal(alcanceConcedible('total', 'juridica'), 'total')
  assert.equal(alcanceConcedible('total', 'fisica'), 'total')
  assert.equal(alcanceConcedible('partes', 'juridica'), null)
})

test('quien no dice de que tipo es, se trata como PERSONA', () => {
  // El default tiene que caer al lado restrictivo: uno permisivo aqui abriria
  // apoderamientos por omision, que es el fallo que no se ve.
  assert.equal(alcanceConcedible('partes'), null)
  assert.equal(camposDeAlcance('partes').abrirParte, false)
  assert.equal(camposDeAlcance('ver_economico').iban, false)
})

test('representar a una sociedad SI da su IBAN y su CIF', () => {
  // Son datos de la empresa, no de una persona, y quien la representa los
  // necesita para su trabajo. Esto es lo que el tope de la fisica prohibe.
  const eco = camposDeAlcance('ver_economico', 'juridica')
  assert.equal(eco.iban, true)
  assert.equal(eco.dniTomador, true)
  assert.equal(camposDeAlcance('ver_economico', 'fisica').iban, false)
})

test('los alcances de una sociedad se abren de uno en uno, no en bloque', () => {
  const eco = camposDeAlcance('ver_economico', 'juridica')
  assert.equal(eco.abrirParte, false, 'ver lo economico no da para dar partes')
  assert.equal(eco.documentos, false, 'ver lo economico no da los documentos')

  const partes = camposDeAlcance('partes', 'juridica')
  assert.equal(partes.abrirParte, true)
  assert.equal(partes.crearPeticiones, true)

  const docs = camposDeAlcance('documentos', 'juridica')
  assert.equal(docs.documentos, true)
  assert.equal(docs.abrirParte, false, 'subir documentacion no da para dar partes')
})

test('ni representando se puede reautorizar a un cuarto', () => {
  // Ampliar el circulo es decision de la sociedad y pasa por su propio camino
  // de representacion; no se hereda de una autorizacion.
  for (const a of ALCANCES) {
    assert.equal(camposDeAlcance(a, 'juridica').autorizarTerceros, false, `${a} reautoriza`)
  }
  assert.equal(camposDeAlcances(ALCANCES, 'juridica')?.autorizarTerceros, false)
})

test('el titulo con el que se representa a la sociedad se valida y se guarda', () => {
  // Si Pilar da un parte, la que queda obligada es GLOBAL 2: tiene que constar
  // por que podia hacerlo.
  assert.deepEqual([...TITULOS_REPRESENTACION], ['administrador', 'apoderado', 'empleado_autorizado'])
  assert.equal(tituloRepresentacion('  Administrador '), 'administrador')
  assert.equal(tituloRepresentacion('jefe'), null)
  assert.equal(tituloRepresentacion(null), null)
})

test('la etiqueta de nivel sube a gestionar cuando hay partes o acceso total', () => {
  assert.equal(etiquetaNivelAlcances(['partes']), 'gestionar')
  assert.equal(etiquetaNivelAlcances(['total']), 'gestionar')
  assert.equal(etiquetaNivelAlcances(['documentos']), 'completo')
  assert.equal(etiquetaNivelAlcances(['ver']), 'tarjeta')
})

test('ver una póliza NO basta para dar un parte: hace falta `partes` y que conceda una sociedad', () => {
  assert.equal(puedeDarParte(['ver'], 'juridica'), false)
  assert.equal(puedeDarParte(['ver', 'ver_economico', 'documentos'], 'juridica'), false)
  assert.equal(puedeDarParte(['ver', 'partes'], 'juridica'), true)
  // Una fila `partes` de una física escrita por otro camino no abre nada...
  assert.equal(puedeDarParte(['ver', 'partes'], 'fisica'), false)
  // ...pero el acceso TOTAL sí deja dar partes, sea quien sea quien cede.
  assert.equal(puedeDarParte(['total'], 'fisica'), true)
  assert.equal(puedeDarParte(['total'], 'juridica'), true)
  assert.equal(puedeDarParte(['ver_economico'], 'fisica'), false)
  assert.equal(puedeDarParte([], 'juridica'), false)
})

test('una peticion solo pide «Solo ver»; al resolver acepta tambien el `ver` de las antiguas', () => {
  assert.equal(alcancePedible('ver_economico'), 'ver_economico')
  assert.equal(alcancePedible('total'), null)
  assert.equal(alcancePedible('ver'), null)
  assert.equal(alcancePeticionResoluble('ver'), 'ver')
  assert.equal(alcancePeticionResoluble('ver_economico'), 'ver_economico')
  assert.equal(alcancePeticionResoluble('total'), null)
})
