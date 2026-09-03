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
 */

const RAIZ = new URL('..', import.meta.url).pathname
const SQL = readFileSync(`${RAIZ}apps/asegura/lib/clientes-sin-canal.ts`, 'utf8')
const RUTA = readFileSync(`${RAIZ}apps/asegura/app/api/operador/sin-canal/route.ts`, 'utf8')
const PANTALLA = readFileSync(`${RAIZ}apps/plataforma/app/(usuario)/correduria/SinCanal.tsx`, 'utf8')
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
  })
})

test('los cuatro estados de canal se derivan de los dos booleanos', () => {
  assert.equal(derivarEstadoCanal(false, false), 'sin_ninguno')
  assert.equal(derivarEstadoCanal(false, true), 'solo_telefono')
  assert.equal(derivarEstadoCanal(true, false), 'solo_email')
  assert.equal(derivarEstadoCanal(true, true), 'con_ambos')
  assert.equal(derivarEstadoCanal(null, true), 'no_comprobado', 'medio dato no es un dato')
  assert.equal(derivarEstadoCanal(true, null), 'no_comprobado')
})

test('el estado NO se cree lo que venga en el JSON: se deriva', () => {
  // Si asegura mandara `estado: 'con_ambos'` con los canales a false, creerlo
  // escondería a un ilocalizable. Manda lo medido, no la etiqueta.
  const r = interpretarSinCanal(200, {
    estado: 'ok',
    filas: [{ clienteId: 'c1', nombre: 'X', tieneEmail: false, tieneTelefono: false, estado: 'con_ambos' }],
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
    /truncado\s*\?\s*\{ vivos: null/,
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
  // Se monta con props desde el rediseño del 03/09/2026 (`onContador`, que sube
  // el recuento a la barra de secciones para que la pestaña «Datos» no esconda
  // trabajo). Lo que este test vigila es que SIGA MONTADO, no su firma.
  assert.match(CLIENTE, /<SinCanal[\s/>]/)
})

test('el grid contenedor lleva plantilla: si no, arrastra la página en móvil', () => {
  // En plataforma el scroller horizontal es LayoutShell, no <body>: un grid sin
  // gridTemplateColumns dimensiona su pista con el contenido más ancho.
  assert.match(PANTALLA, /gridTemplateColumns: 'minmax\(0, 1fr\)'/)
})
