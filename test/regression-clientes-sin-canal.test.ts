import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  interpretarSinCanal,
  derivarEstadoCanal,
} from '../apps/plataforma/lib/correduria-puerto.ts'

/**
 * Guardián de «Clientes sin canal de contacto» (/correduria).
 *
 * Vigila las dos formas de que esta pantalla mienta:
 *
 *   1. **Contar de más.** Si el recuento deja de restringirse a las pólizas que
 *      entran por CIMA (`polizas.import_ref IS NULL`), arrastra las ~28.700
 *      pólizas del volcado histórico de junio/2026 y la pantalla pasa de decir
 *      «26 clientes ilocalizables» a «32.520», que es falso: esas fichas son
 *      leads con vencimientos de 2013-2018, no clientes de hoy.
 *
 *   2. **Confundir «no tiene» con «no se ha mirado».** Un canal que asegura no
 *      informa NO es un canal que no existe. Pintarlo como «sin email» diría
 *      que a ese cliente no se le puede escribir cuando lo cierto es que nadie
 *      lo ha comprobado — y una lista corta de ilocalizables tranquiliza tanto
 *      como una larga alarma.
 *
 *   3. 🚨 **Mirar SOLO la ficha del tomador y con eso afirmar «no se le puede
 *      contactar».** Añadido el 04/09/2026, tras cazarlo Alberto en la pantalla:
 *      `Esquiansa` salía «ilocalizable» cuando su contacto de siempre es Juan
 *      Manuel López Benjumea, que está en su póliza como conductor habitual con
 *      ficha, email y teléfono. El contacto vive en TRES sitios (ficha · su
 *      propio dato colgado de la póliza · otra persona de la póliza) y de 19
 *      «sin canal» solo 15 eran ilocalizables de verdad.
 *
 *      ⚖️ Y el matiz que no se puede colapsar: tener a quién llamar NO es poder
 *      notificar. El preaviso del art. 22 LCS va al TOMADOR, así que un tercero
 *      localizable sirve para CONSEGUIR su correo, no para darlo por avisado.
 */

const RAIZ = new URL('..', import.meta.url).pathname
const SQL = readFileSync(`${RAIZ}apps/asegura/lib/clientes-sin-canal.ts`, 'utf8')
const RUTA = readFileSync(`${RAIZ}apps/asegura/app/api/operador/sin-canal/route.ts`, 'utf8')
const PANTALLA = readFileSync(`${RAIZ}apps/plataforma/app/(usuario)/correduria/SinCanal.tsx`, 'utf8')
const PUERTO = readFileSync(`${RAIZ}apps/plataforma/lib/correduria-puerto.ts`, 'utf8')
const CLIENTE = readFileSync(`${RAIZ}apps/plataforma/app/(usuario)/correduria/CorreduriaClient.tsx`, 'utf8')

// ── 1. El recuento es SOLO de la cartera viva ───────────────────────────────

test('🚨 la consulta se restringe a la CARTERA VIVA, con los dos brazos de la regla', () => {
  // Los dos brazos (`cartera-viva.ts` de `@central/module-seguros`): sin el
  // primero entrarían las ~32.500 fichas del volcado histórico; sin el segundo
  // se caerían las que CIMA mantiene al día conservando su `import_ref` viejo
  // —y con ellas, clientes enteros (medido 03/09/2026: uno de Reale)—.
  assert.match(
    SQL,
    /and\s+\(\s*p\.import_ref\s+is\s+null\s+or\s+p\.eiac_xml_hash\s+is\s+not\s+null\s*\)/i,
    'la lista tiene que filtrar por cartera viva con la regla de dos brazos',
  )
})

test('🚨 las pólizas y los clientes fusionados no cuentan dos veces', () => {
  assert.match(SQL, /p\.merged_into_poliza_id\s+is\s+null/i)
  assert.match(SQL, /c\.merged_into_cliente_id\s+is\s+null/i)
})

test('la lista se acota a la correduría, no a toda la base', () => {
  assert.match(SQL, /c\.correduria_id\s*=\s*\$\{correduriaId\}/)
})

test('una cadena vacía cuenta como «sin canal», no como dato', () => {
  // '' en la columna es tan incontactable como NULL; contarlo como email diría
  // que a ese cliente sí se le puede escribir.
  assert.match(SQL, /nullif\(btrim\(c\.email\), ''\)/)
  assert.match(SQL, /nullif\(btrim\(c\.telefono\), ''\)/)
})

test('se miran también las tablas de contactos secundarios', () => {
  // Un cliente con el email solo en `cliente_emails` SÍ es contactable: mirar
  // únicamente `clientes.email` lo pintaría como ilocalizable.
  assert.match(SQL, /from cliente_emails/i)
  assert.match(SQL, /from cliente_telefonos/i)
})

// ── 2. Minimización de PII ──────────────────────────────────────────────────

test('🚨 el puerto no manda emails ni teléfonos, solo si los hay', () => {
  // La pregunta de esta pantalla es «¿hay algo en esa columna?», no «¿qué
  // pone?»: descifrar aquí sería sacar PII por el puerto sin necesitarla.
  assert.doesNotMatch(SQL, /decryptField/, 'esta pantalla no descifra contactos')
  assert.doesNotMatch(RUTA, /decryptField/)
  assert.doesNotMatch(PANTALLA, /decryptField/)
})

test('la ruta del puerto está detrás del Bearer y no envía nada', () => {
  assert.match(RUTA, /operadorAutorizado\(req\)/)
  assert.doesNotMatch(RUTA, /export async function (POST|PUT|PATCH|DELETE)/)
})

// ── 3. «Sin canal» ≠ «no comprobado» ────────────────────────────────────────

test('🚨 un canal que asegura NO informa queda en «no comprobado», no en «no tiene»', () => {
  const r = interpretarSinCanal(200, {
    estado: 'ok',
    filas: [{ clienteId: 'c1', nombre: 'Jose Suarez Salas' }],
    resumen: {},
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.filas[0].tieneEmail, null, 'un campo ausente NO es «no tiene email»')
  assert.equal(r.filas[0].tieneTelefono, null)
  assert.equal(r.filas[0].estado, 'no_comprobado')
})

test('🚨 un recuento que no llega se queda en null, JAMÁS en 0', () => {
  // «0 clientes ilocalizables» es la frase tranquilizadora que aquí nadie ha
  // medido: es el fallo exacto que esta pantalla existe para no cometer.
  const r = interpretarSinCanal(200, { estado: 'ok', filas: [], resumen: {} })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.resumen, {
    vivos: null, conEmail: null, conTelefono: null, conAlguno: null, sinNinguno: null,
    ilocalizables: null, rescatables: null,
  })
})

test('los estados de canal se derivan de lo medido, no se guardan', () => {
  assert.equal(derivarEstadoCanal(false, false, 0, 0), 'sin_ninguno')
  assert.equal(derivarEstadoCanal(false, true, 0, 0), 'solo_telefono')
  assert.equal(derivarEstadoCanal(true, false, 0, 0), 'solo_email')
  assert.equal(derivarEstadoCanal(true, true, 0, 0), 'con_ambos')
  assert.equal(derivarEstadoCanal(null, true, 0, 0), 'no_comprobado', 'medio dato no es un dato')
  assert.equal(derivarEstadoCanal(true, null, 0, 0), 'no_comprobado')
})

// ── 3 bis. El contacto NO vive solo en la ficha del tomador ─────────────────

test('🚨 sin nada en la ficha pero con SU dato en la póliza NO es «ilocalizable»', () => {
  // El caso de `Juan Manuel Duran Ibañez` y `MORALES ISABEL MALDONADO`: CIMA
  // trajo su email en el interviniente y nadie lo copió a la ficha. El dato es
  // SUYO y está en la base; lo que falla es que el cron de avisos lee la ficha.
  assert.equal(derivarEstadoCanal(false, false, 1, 0), 'canal_en_poliza')
})

test('🚨 sin nada suyo pero con otra persona en la póliza tampoco es «ilocalizable»', () => {
  // El caso de `Esquiansa` → Juan Manuel López Benjumea. Hay a quién llamar.
  assert.equal(derivarEstadoCanal(false, false, 0, 1), 'contacto_via_tercero')
})

test('lo SUYO manda sobre lo de un tercero: son acciones distintas', () => {
  // Copiar un dato a la ficha ≠ llamar a alguien para pedirle el correo.
  assert.equal(derivarEstadoCanal(false, false, 1, 3), 'canal_en_poliza')
})

test('🚨 sin saber lo de la póliza NO se declara a nadie ilocalizable', () => {
  // Un puerto viejo no manda esos recuentos. Con el hueco, el estado conservador
  // es «no comprobado»: afirmar «no le llega NADA» es justo el fallo del 04/09.
  assert.equal(derivarEstadoCanal(false, false, null, 0), 'no_comprobado')
  assert.equal(derivarEstadoCanal(false, false, 0, null), 'no_comprobado')
  // …pero un cliente que SÍ tiene canal propio no necesita ese dato para nada.
  assert.equal(derivarEstadoCanal(true, true, null, null), 'con_ambos')
})

test('🚨 la consulta mira los intervinientes, no solo la ficha del tomador', () => {
  // Sin este join la pantalla vuelve a decir «19 con los que NO se puede
  // contactar» cuando son 15, y a llamar ilocalizable a `Esquiansa`.
  assert.match(SQL, /join poliza_intervinientes i on i\.poliza_id = p\.id/i)
  assert.match(SQL, /left join clientes ic on ic\.id = i\.cliente_id/i)
  // …y distingue su propio dato (`es_el_mismo`) del de un tercero.
  assert.match(SQL, /\(i\.cliente_id = b\.id\) as es_el_mismo/i)
})

test('la búsqueda por póliza respeta la cartera viva y los merges', () => {
  // Sin esto, un interviniente de una póliza de 2014 «rescataría» a un cliente
  // que hoy es ilocalizable.
  const lateral = SQL.slice(SQL.indexOf('left join lateral'))
  assert.match(lateral, /p\.import_ref is null or p\.eiac_xml_hash is not null/i)
  assert.match(lateral, /p\.merged_into_poliza_id is null/i)
  assert.match(lateral, /ic\.merged_into_cliente_id is null/i)
})

test('🚨 el nombre CIFRADO de un interviniente no se pinta ni se manda', () => {
  // `poliza_intervinientes.nombre` viene como `v1:iv:cipher:tag`. Mandarlo sería
  // sacar PII que además no se puede leer; pintarlo, enseñar basura.
  assert.match(SQL, /startsWith\('v1:'\)/, 'falta la guarda del blob cifrado en asegura')
  assert.match(PUERTO, /startsWith\('v1:'\)/, 'falta la guarda del blob cifrado en el puerto')
  const r = interpretarSinCanal(200, {
    estado: 'ok',
    filas: [{
      clienteId: 'c1', nombre: 'Esquiansa', tieneEmail: false, tieneTelefono: false,
      canalEnPoliza: 0, contactoDeOtros: 2,
      fichasContacto: [
        { clienteId: 'p1', nombre: 'Juan Manuel Lopez Benjumea' },
        { clienteId: 'p2', nombre: 'v1:TjaDV+QB:9mwrzk:qUYBLy8H' },
      ],
    }],
    resumen: {},
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.filas[0].fichasContacto, [{ clienteId: 'p1', nombre: 'Juan Manuel Lopez Benjumea' }])
  // La que no se puede nombrar sigue CONTADA: se declara el hueco, no se borra.
  assert.equal(r.filas[0].contactoDeOtros, 2)
  assert.equal(r.filas[0].estado, 'contacto_via_tercero')
})

test('🚨 el titular de la pantalla es «ilocalizables», no «sin canal en la ficha»', () => {
  // Este cambio de una palabra es el fallo entero: 19 → 15.
  assert.match(PANTALLA, /const ilocalizables = resumen\.ilocalizables/)
  assert.match(PANTALLA, /ilocalizables\} cliente\(s\) con los que NO se puede contactar/)
  assert.doesNotMatch(
    PANTALLA,
    /\$\{sinNinguno\} cliente\(s\) con los que NO se puede contactar/,
    'el titular no puede volver a contar los que solo miran la ficha',
  )
})

test('la pantalla dice que hay a quién llamar, y que eso NO es avisar', () => {
  assert.match(PANTALLA, /canal_en_poliza/)
  assert.match(PANTALLA, /contacto_via_tercero/)
  assert.match(PANTALLA, /art\. 22 LCS/, 'el aviso formal va al tomador, y hay que decirlo')
})

test('el estado NO se cree lo que venga en el JSON: se deriva', () => {
  // Si asegura mandara `estado: 'con_ambos'` con los canales a false, creerlo
  // escondería a un ilocalizable. Manda lo medido, no la etiqueta.
  const r = interpretarSinCanal(200, {
    estado: 'ok',
    filas: [{
      clienteId: 'c1', nombre: 'X', tieneEmail: false, tieneTelefono: false,
      canalEnPoliza: 0, contactoDeOtros: 0, estado: 'con_ambos',
    }],
    resumen: { vivos: 79, conEmail: 44, conTelefono: 52, conAlguno: 53, sinNinguno: 26 },
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.filas[0].estado, 'sin_ninguno')
  assert.equal(r.resumen.sinNinguno, 26)
})

test('🚨 una prima que nadie informa se queda en null, no en 0,00€', () => {
  const r = interpretarSinCanal(200, {
    estado: 'ok',
    filas: [{ clienteId: 'c1', nombre: 'X', tieneEmail: false, tieneTelefono: false, prima: null, polizasCima: 2 }],
    resumen: { vivos: 1, conEmail: 0, conTelefono: 0, conAlguno: 0, sinNinguno: 1 },
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.filas[0].prima, null)
  assert.equal(r.filas[0].polizasCima, 2)
})

test('una fila sin id o sin nombre invalida la respuesta, no se pinta a medias', () => {
  assert.deepEqual(interpretarSinCanal(200, { estado: 'ok', filas: [{ nombre: 'X' }] }), {
    estado: 'error', motivo: 'respuesta_ilegible',
  })
  assert.deepEqual(interpretarSinCanal(200, { estado: 'ok', filas: [{ clienteId: 'c1' }] }), {
    estado: 'error', motivo: 'respuesta_ilegible',
  })
})

test('el fallo del puerto propaga su motivo, no una lista vacía', () => {
  // Una lista vacía por error se leería como «todos son localizables».
  assert.deepEqual(interpretarSinCanal(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarSinCanal(200, { estado: 'error' }), { estado: 'error', motivo: 'asegura_error' })
  assert.deepEqual(interpretarSinCanal(200, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarSinCanal(500, null), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('una lista truncada NO se cuenta: los recuentos pasan a desconocidos', () => {
  assert.match(
    SQL,
    /truncado\s*$\s*\?\s*\{\s*$\s*vivos: null/m,
    'con la lista recortada el recuento saldría más bajo que la realidad',
  )
})

// ── 4. La pantalla dice las tres cosas ──────────────────────────────────────

test('🚨 la pantalla distingue «sin canal» de «no comprobado»', () => {
  assert.match(PANTALLA, /no_comprobado/, 'falta el estado «no comprobado» en la UI')
  assert.match(PANTALLA, /no comprobado/i)
  assert.match(PANTALLA, /sin comprobar/i)
  // El recuento nulo se pinta como hueco, no como cero.
  assert.match(PANTALLA, /valor === null/)
  assert.doesNotMatch(PANTALLA, /sinNinguno\s*\?\?\s*0/)
  assert.doesNotMatch(PANTALLA, /resumen\.\w+\s*\|\|\s*0/)
})

test('la pantalla declara que mide presencia, no validez', () => {
  assert.match(PANTALLA, /CIMA/, 'la pantalla tiene que decir de qué cartera habla')
  assert.match(PANTALLA, /rebote|rebota/, 'un correo viejo cuenta como canal aunque no sirva')
})

test('la pantalla está montada en /correduria', () => {
  assert.match(CLIENTE, /import SinCanal from '\.\/SinCanal'/)
  assert.match(CLIENTE, /<SinCanal \/>/)
})

test('el grid contenedor lleva plantilla: si no, arrastra la página en móvil', () => {
  // En plataforma el scroller horizontal es LayoutShell, no <body>: un grid sin
  // gridTemplateColumns dimensiona su pista con el contenido más ancho.
  assert.match(PANTALLA, /gridTemplateColumns: 'minmax\(0, 1fr\)'/)
})
