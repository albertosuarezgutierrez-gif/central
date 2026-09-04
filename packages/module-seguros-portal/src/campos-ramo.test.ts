import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CAMPOS_POR_RAMO,
  MAX_TEXTO_RAMO,
  RAMOS_CON_CATALOGO,
  camposDeRamo,
  normalizarDatosRamo,
  type CampoRamo,
} from './campos-ramo.ts'
import { RAMOS_POLIZA, type RamoPoliza } from './poliza-leida.ts'

/** Todos los campos del catálogo, con su ramo al lado, para los barridos. */
const TODOS: readonly { ramo: RamoPoliza; campo: CampoRamo }[] = RAMOS_POLIZA.flatMap((ramo) =>
  CAMPOS_POR_RAMO[ramo].map((campo) => ({ ramo, campo })),
)

// ── Exhaustividad ────────────────────────────────────────────────────────────

test('todo ramo del enum tiene entrada en el catálogo, y ninguna clave sobra', () => {
  assert.deepEqual(Object.keys(CAMPOS_POR_RAMO).sort(), [...RAMOS_POLIZA].sort())
  assert.deepEqual([...RAMOS_CON_CATALOGO].sort(), [...RAMOS_POLIZA].sort())
})

test('ningún ramo se queda con la pantalla muda: todos tienen al menos un campo', () => {
  for (const ramo of RAMOS_POLIZA) {
    assert.ok(CAMPOS_POR_RAMO[ramo].length > 0, `${ramo} no tiene campos`)
  }
})

test('`camposDeRamo` devuelve lo mismo que el catálogo, y [] ante basura', () => {
  assert.equal(camposDeRamo('hogar'), CAMPOS_POR_RAMO.hogar)
  for (const malo of [null, undefined, '', 'HOGAR', 'coche', 42 as unknown as string]) {
    assert.deepEqual(camposDeRamo(malo as string), [], `ramo=${JSON.stringify(malo)}`)
  }
})

// ── Forma de cada campo ──────────────────────────────────────────────────────

test('los `id` son únicos DENTRO de cada ramo', () => {
  for (const ramo of RAMOS_POLIZA) {
    const ids = CAMPOS_POR_RAMO[ramo].map((c) => c.id)
    assert.deepEqual([...new Set(ids)], ids, `ids repetidos en ${ramo}`)
  }
})

test('los `id` son camelCase ASCII: sin acentos, espacios, guiones ni mayúscula inicial', () => {
  // Son claves de un `jsonb` y son PARA SIEMPRE: renombrar una huérfana los
  // datos ya guardados. Por eso la forma se cierra aquí y no en la pantalla.
  for (const { ramo, campo } of TODOS) {
    assert.match(campo.id, /^[a-z][a-zA-Z0-9]*$/, `${ramo}.${campo.id}`)
  }
})

test('toda etiqueta tiene texto: un campo sin nombre no se puede pintar', () => {
  for (const { ramo, campo } of TODOS) {
    assert.ok(campo.etiqueta.trim().length > 0, `${ramo}.${campo.id} sin etiqueta`)
    assert.ok(campo.etiqueta.length <= 80, `${ramo}.${campo.id}: etiqueta demasiado larga`)
  }
})

test('toda `ayuda` ofrece la salida honesta («déjalo en blanco»)', () => {
  // Ningún campo es obligatorio, y la ayuda es donde se le dice a la persona.
  // Una ayuda que solo explica empuja a inventarse el dato.
  for (const { ramo, campo } of TODOS) {
    if (campo.ayuda === undefined) continue
    assert.ok(campo.ayuda.trim().length > 0, `${ramo}.${campo.id}: ayuda vacía`)
    assert.match(campo.ayuda, /en blanco/, `${ramo}.${campo.id}: ayuda sin salida honesta`)
  }
})

test('solo `opcion` trae `opciones`, y nunca vacías ni con valores repetidos', () => {
  for (const { ramo, campo } of TODOS) {
    if (campo.tipo === 'opcion') {
      const opciones = campo.opciones ?? []
      assert.ok(opciones.length > 0, `${ramo}.${campo.id}: opción sin opciones`)
      const valores = opciones.map((o) => o.valor)
      assert.deepEqual([...new Set(valores)], valores, `${ramo}.${campo.id}: valores repetidos`)
      for (const o of opciones) {
        assert.match(o.valor, /^[a-z][a-z0-9_]*$/, `${ramo}.${campo.id}: valor «${o.valor}»`)
        assert.ok(o.etiqueta.trim().length > 0, `${ramo}.${campo.id}: opción sin etiqueta`)
      }
    } else {
      assert.equal(campo.opciones, undefined, `${ramo}.${campo.id} no es opción y trae opciones`)
    }
  }
})

test('todo `numero`/`dinero` trae `min` y `max`, con `min < max`; ningún otro tipo los trae', () => {
  for (const { ramo, campo } of TODOS) {
    const numerico = campo.tipo === 'numero' || campo.tipo === 'dinero'
    if (numerico) {
      assert.equal(typeof campo.min, 'number', `${ramo}.${campo.id} sin min`)
      assert.equal(typeof campo.max, 'number', `${ramo}.${campo.id} sin max`)
      assert.ok((campo.min as number) < (campo.max as number), `${ramo}.${campo.id}: min >= max`)
    } else {
      assert.equal(campo.min, undefined, `${ramo}.${campo.id} no es numérico y trae min`)
      assert.equal(campo.max, undefined, `${ramo}.${campo.id} no es numérico y trae max`)
    }
  }
})

test('todo booleano se declara `triestado`: no hay opciones sí/no disfrazadas', () => {
  // El tri-estado existe para que «no lo sé» no colapse a «no». Una `opcion`
  // con exactamente sí y no obliga a contestar algo que nadie ha mirado.
  for (const { ramo, campo } of TODOS) {
    if (campo.tipo !== 'opcion') continue
    const valores = (campo.opciones ?? []).map((o) => o.valor).sort()
    assert.notDeepEqual(valores, ['no', 'si'], `${ramo}.${campo.id} debería ser triestado`)
  }
})

// ── 🚨 Cepos ─────────────────────────────────────────────────────────────────

test('🚨 CEPO RGPD: ni un solo campo pregunta por categorías especiales del art. 9', () => {
  // Un cuestionario de vida pregunta si fumas y qué has tenido; este portal no
  // puede recogerlo sin consentimiento explícito y separado, y aquí no lo hay.
  // Si alguien mete uno, este test se pone rojo antes de que llegue a producción.
  const PROHIBIDO = /fumador|tabaco|enfermedad|salud|patolog|embaraz|peso|altura|discapacid/i
  for (const { ramo, campo } of TODOS) {
    const textos = [campo.id, campo.etiqueta, campo.ayuda ?? '', ...(campo.opciones ?? []).flatMap((o) => [o.valor, o.etiqueta])]
    for (const t of textos) {
      assert.doesNotMatch(t, PROHIBIDO, `${ramo}.${campo.id}: «${t}» es dato de categoría especial`)
    }
  }
})

test('🚨 CEPO de solapamiento: matrícula, bastidor y fecha de matriculación son COLUMNAS, no jsonb', () => {
  // Duplicarlas aquí crearía dos sitios donde vive el mismo dato, y el día que
  // discrepen nadie sabría cuál manda.
  const COLUMNAS = new Set(['matricula', 'bastidor', 'fechaMatriculacion'])
  for (const { ramo, campo } of TODOS) {
    assert.ok(!COLUMNAS.has(campo.id), `${ramo}.${campo.id} ya es una columna de portal_poliza_declarada`)
  }
})

test('ningún campo es obligatorio: el catálogo no tiene por dónde declararlo', () => {
  for (const { ramo, campo } of TODOS) {
    assert.ok(!('obligatorio' in campo), `${ramo}.${campo.id} declara obligatoriedad`)
  }
})

test('`desdeCatastro` solo en lo que el Catastro sabe de verdad, y solo en inmuebles', () => {
  const DA_EL_CATASTRO = new Set(['codigoPostal', 'metrosCuadrados', 'anioConstruccion'])
  const RAMOS_INMUEBLE = new Set<RamoPoliza>(['hogar', 'comercio', 'comunidades'])
  for (const { ramo, campo } of TODOS) {
    if (campo.desdeCatastro !== true) continue
    assert.ok(DA_EL_CATASTRO.has(campo.id), `${ramo}.${campo.id} no lo da el Catastro`)
    assert.ok(RAMOS_INMUEBLE.has(ramo), `${ramo} no es un ramo de inmueble`)
  }
  // Y al revés: en hogar los tres están marcados, o la pantalla no ofrecerá rellenarlos.
  for (const id of DA_EL_CATASTRO) {
    const campo = CAMPOS_POR_RAMO.hogar.find((c) => c.id === id)
    assert.ok(campo?.desdeCatastro, `hogar.${id} debería venir del Catastro`)
  }
})

test('el año de construcción admite el año que viene (obra nueva) pero no más', () => {
  const campo = CAMPOS_POR_RAMO.hogar.find((c) => c.id === 'anioConstruccion')
  assert.equal(campo?.min, 1800)
  assert.equal(campo?.max, new Date().getUTCFullYear() + 1)
})

// ── normalizarDatosRamo sobre el catálogo real ───────────────────────────────

test('lo que está en el catálogo se guarda, con el número ya convertido', () => {
  const r = normalizarDatosRamo('hogar', {
    direccion: '  Calle Socorro 24  ',
    codigoPostal: '41003',
    metrosCuadrados: '290',
    tipoVivienda: 'piso',
    alarmaConectada: 'sí',
  })
  assert.equal(r.ok, true)
  assert.deepEqual(r.ok === true && r.datos, {
    direccion: 'Calle Socorro 24',
    codigoPostal: '41003',
    metrosCuadrados: 290,
    tipoVivienda: 'piso',
    alarmaConectada: true,
  })
})

test('el código postal es TEXTO: un 01001 de Álava no puede perder el cero', () => {
  const r = normalizarDatosRamo('hogar', { codigoPostal: '01001' })
  assert.equal(r.ok === true && r.datos?.codigoPostal, '01001')
})

test('una clave que no está en el catálogo del ramo se descarta en silencio', () => {
  // Si se guardara, un cambio de ramo dejaría los campos del anterior
  // enterrados en el JSON, invisibles y sin pantalla que los enseñe.
  const r = normalizarDatosRamo('auto', { marca: 'Seat', capitalContinente: 300000, loQueSea: 'x' })
  assert.deepEqual(r.ok === true && r.datos, { marca: 'Seat' })
})

test('los campos de otro ramo no viajan: hogar enviado a moto no escribe nada', () => {
  const r = normalizarDatosRamo('moto', { metrosCuadrados: 90, tipoVivienda: 'piso' })
  assert.deepEqual(r.ok === true && r.datos, null)
})

test('`\'\'` y los valores de cajón NO se escriben: ausente es el «no lo sé» honesto', () => {
  for (const cajon of ['', '   ', 'n/a', 'N/A', 'desconocido', 'no consta', '-', '?']) {
    const r = normalizarDatosRamo('comercio', { actividad: cajon })
    assert.equal(r.ok, true, `actividad=${JSON.stringify(cajon)}`)
    assert.deepEqual(r.ok === true && r.datos, null, `actividad=${JSON.stringify(cajon)}`)
  }
})

test('un objeto ENTERO de cajón deja la columna vacía (`null`), no un `{}`', () => {
  const r = normalizarDatosRamo('hogar', {
    direccion: '',
    codigoPostal: '   ',
    metrosCuadrados: 'desconocido',
    capitalContinente: 'n/a',
    alarmaConectada: 'no lo sé',
  })
  assert.equal(r.ok, true)
  assert.equal(r.ok === true && r.datos, null)
})

test('un número fuera de rango es error CON NOMBRE del campo, no un 0 silencioso', () => {
  const cero = normalizarDatosRamo('hogar', { metrosCuadrados: 0 })
  assert.equal(cero.ok, false)
  assert.equal(cero.ok === false && cero.error, 'campo_invalido:metrosCuadrados')

  const enorme = normalizarDatosRamo('hogar', { metrosCuadrados: 10001 })
  assert.equal(enorme.ok === false && enorme.error, 'campo_invalido:metrosCuadrados')

  const anio = normalizarDatosRamo('comunidades', { anioConstruccion: 1799 })
  assert.equal(anio.ok === false && anio.error, 'campo_invalido:anioConstruccion')

  const cc = normalizarDatosRamo('moto', { cilindrada: 3001 })
  assert.equal(cc.ok === false && cc.error, 'campo_invalido:cilindrada')
})

test('los bordes del rango SÍ entran: 1 m² y 10.000 m² son datos, no tecleos', () => {
  assert.equal(normalizarDatosRamo('hogar', { metrosCuadrados: 1 }).ok, true)
  assert.equal(normalizarDatosRamo('hogar', { metrosCuadrados: 10000 }).ok, true)
  assert.equal(normalizarDatosRamo('responsabilidad_civil', { numeroEmpleados: 0 }).ok, true)
})

test('un importe en formato español (2.162,49) entra como número', () => {
  const r = normalizarDatosRamo('comunidades', { capitalContinente: '2.162,49' })
  assert.equal(r.ok === true && r.datos?.capitalContinente, 2162.49)
})

test('🚨 «no lo sé» en un triestado NO escribe la clave, y desde luego no un `false`', () => {
  // Un tri-estado colapsado a `false` le dice al corredor «ha contestado que
  // no» sobre algo que nadie ha preguntado.
  for (const duda of ['no lo sé', 'no lo se', 'ni idea', 'quizá', '']) {
    const r = normalizarDatosRamo('salud', { copago: duda })
    assert.equal(r.ok, true, `copago=${JSON.stringify(duda)}`)
    assert.equal(r.ok === true && r.datos, null, `copago=${JSON.stringify(duda)}`)
  }
  const no = normalizarDatosRamo('salud', { copago: 'no' })
  assert.equal(no.ok === true && no.datos?.copago, false)
  const si = normalizarDatosRamo('salud', { copago: true })
  assert.equal(si.ok === true && si.datos?.copago, true)
})

test('una opción que no está en la lista es error, no se guarda «tal cual»', () => {
  const r = normalizarDatosRamo('vida', { modalidad: 'lo que sea' })
  assert.equal(r.ok === false && r.error, 'campo_invalido:modalidad')
  assert.equal(normalizarDatosRamo('vida', { modalidad: 'ambas' }).ok, true)
})

test('la fecha de nacimiento se valida de verdad: el 31 de febrero no existe', () => {
  const buena = normalizarDatosRamo('vida', { fechaNacimiento: '1975-03-14' })
  assert.equal(buena.ok === true && buena.datos?.fechaNacimiento, '1975-03-14')
  for (const mala of ['14/03/1975', '1975-02-31', '1975-13-01', 'ayer']) {
    const r = normalizarDatosRamo('vida', { fechaNacimiento: mala })
    assert.equal(r.ok === false && r.error, 'campo_invalido:fechaNacimiento', `fecha=${mala}`)
  }
})

test('un texto pegado por encima del tope es error, no se recorta a escondidas', () => {
  const justo = normalizarDatosRamo('otros', { descripcion: 'a'.repeat(MAX_TEXTO_RAMO) })
  assert.equal(justo.ok, true)
  const pasado = normalizarDatosRamo('otros', { descripcion: 'a'.repeat(MAX_TEXTO_RAMO + 1) })
  assert.equal(pasado.ok === false && pasado.error, 'campo_invalido:descripcion')
})

test('`null`/`undefined` en una clave se saltan; entrada que no es objeto es error', () => {
  const r = normalizarDatosRamo('decesos', { numeroAsegurados: null, capitalAsegurado: undefined })
  assert.equal(r.ok === true && r.datos, null)
  assert.equal(normalizarDatosRamo('decesos', null).ok, true)
  assert.equal(normalizarDatosRamo('decesos', 'texto').ok, false)
  assert.equal(normalizarDatosRamo('decesos', [1, 2]).ok, false)
})

test('un ramo desconocido no guarda nada, pero tampoco revienta', () => {
  const r = normalizarDatosRamo('naves_espaciales', { loQueSea: 1 })
  assert.equal(r.ok, true)
  assert.equal(r.ok === true && r.datos, null)
})

test('todas las opciones declaradas se aceptan de vuelta: el catálogo no ofrece valores que rechaza', () => {
  for (const { ramo, campo } of TODOS) {
    if (campo.tipo !== 'opcion') continue
    for (const o of campo.opciones ?? []) {
      const r = normalizarDatosRamo(ramo, { [campo.id]: o.valor })
      assert.equal(r.ok, true, `${ramo}.${campo.id}=${o.valor}`)
      assert.equal(r.ok === true && r.datos?.[campo.id], o.valor, `${ramo}.${campo.id}=${o.valor}`)
    }
  }
})
