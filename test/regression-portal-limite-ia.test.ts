// Las dos rutas del portal que GASTAN (IA propia y consultas al Catastro con
// nuestra IP) tienen tope por IDENTIDAD.
//
// Hasta la auditoría del 20/09/2026 solo exigían sesión — y la sesión NO es un
// tope: entrar al portal es pedir un código a un correo cualquiera, así que
// cualquiera con un buzón consigue una. El docblock de `catastro/sugerir` decía
// literalmente que la sesión estaba ahí para no «gastar IA de nuestra cuenta».
//
// 🪤 Mide el ORDEN, no la presencia: un tope DEBAJO de la llamada a la IA se
// pone verde en un test de palabras y no evita ni un céntimo. Es el mismo cepo
// que `regression-portal-limite-acceso.test.ts` para el amplificador de correo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const POLIZAS = 'apps/asegura-portal/app/api/polizas/route.ts'
const SUGERIR = 'apps/asegura-portal/app/api/catastro/sugerir/route.ts'
// Patrimonio, paso 7 (22/10/2026): facturas leídas con IA. Dos topes: en memoria por identidad en la ruta (antes de
// leer el cuerpo) y DIARIO contado en BD en la lógica pura (antes de `leer`, que es la IA).
const FACTURAS = 'apps/asegura-portal/app/api/patrimonio/facturas/route.ts'
const FACTURAS_API = 'apps/asegura-portal/lib/patrimonio/facturas-api.ts'
const FACTURAS_BD = 'apps/asegura-portal/lib/patrimonio/facturas-bd.ts'
// Patrimonio, paso 8 (22/10/2026): subida de documentos (ficheros de hasta 10 MB en BD). Mismo orden: tope en memoria
// por identidad y content-length (411/413) ANTES de leer el cuerpo; tope DIARIO contado en BD dentro de una transacción.
const DOCUMENTOS = 'apps/asegura-portal/app/api/patrimonio/documentos/route.ts'
const DOCUMENTOS_BD = 'apps/asegura-portal/lib/patrimonio/documentos-bd.ts'

const leer = (p: string) => readFileSync(join(RAIZ, p), 'utf8')
const sinComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** El cuerpo del `POST`: por encima están los `import` y las constantes, que
 *  falsearían cualquier comparación por posición. */
function cuerpoDelPost(ruta: string): string {
  const fuente = sinComentarios(leer(ruta))
  const i = fuente.indexOf('export async function POST')
  assert.ok(i > 0, `no se encontró el handler POST en ${ruta}`)
  return fuente.slice(i)
}

function pos(cuerpo: string, aguja: string): number {
  const i = cuerpo.indexOf(aguja)
  assert.ok(i >= 0, `no aparece en el cuerpo del POST: ${aguja}`)
  return i
}

test('POST /api/polizas topa por identidad ANTES de leer el fichero y de llamar a la IA', () => {
  const cuerpo = cuerpoDelPost(POLIZAS)
  const tope = pos(cuerpo, 'rateLimit(')
  assert.ok(tope < pos(cuerpo, 'altaConDocumento('), 'el tope va antes de procesar el documento')
  assert.ok(tope < pos(cuerpo, 'altaAMano('), 'el tope cubre también el alta a mano: también escribe filas')
  const entero = sinComentarios(leer(POLIZAS))
  assert.ok(pos(entero, 'rateLimit(') < pos(entero, 'extraerPoliza('), 'la IA se llama después del tope')
})

test('POST /api/catastro/sugerir topa ANTES de la IA y del Catastro', () => {
  const cuerpo = cuerpoDelPost(SUGERIR)
  assert.ok(pos(cuerpo, 'rateLimit(') < pos(cuerpo, 'sugerirDirecciones('), 'hasta 9 consultas + 1 de IA por llamada')
})

test('POST /api/patrimonio/facturas topa por identidad ANTES de leer el cuerpo y de la IA', () => {
  const cuerpo = cuerpoDelPost(FACTURAS)
  const tope = pos(cuerpo, 'rateLimit(')
  assert.ok(tope < pos(cuerpo, 'req.formData('), 'el tope va antes de leer el fichero')
  assert.ok(tope < pos(cuerpo, 'responderSubidaFactura('), 'el tope va antes de la lógica que llama a la IA')
})

test('facturas: el tope DIARIO se RESERVA (cuenta + inserta) ANTES de leer con IA, y la fila se completa después', () => {
  const fuente = sinComentarios(leer(FACTURAS_API))
  const i = fuente.indexOf('export async function responderSubidaFactura')
  assert.ok(i > 0, 'no se encontró responderSubidaFactura')
  const cuerpo = fuente.slice(i, fuente.indexOf('export function validarConfirmacion'))
  assert.ok(pos(cuerpo, 'p.reservarPropuesta(') < pos(cuerpo, 'p.leer('), 'reservar después de leer no ahorra ni un céntimo')
  assert.ok(pos(cuerpo, 'p.leer(') < pos(cuerpo, 'p.completarPropuesta('), 'la fila reservada se rellena con lo leído')
  assert.match(cuerpo.slice(pos(cuerpo, 'p.reservarPropuesta('), pos(cuerpo, 'p.leer(')), /motivo === 'tope'[\s\S]*status:\s*429/, 'sin hueco, 429 antes de la IA')
  // Los bytes del fichero se comprueban ANTES de reservar cupo (un fichero basura no gasta el tope).
  assert.ok(pos(cuerpo, 'tipoRealFactura(') < pos(cuerpo, 'p.reservarPropuesta('), 'el tipo se mira por los bytes antes de reservar')
  assert.match(cuerpo, /status:\s*415/)
  assert.doesNotMatch(cuerpo, /c\.fichero\.mime/, 'el MIME del navegador no decide nada')
})

test('facturas: contar + insertar es UNA transacción con bloqueo por identidad, y el día es el de Madrid', () => {
  const fuente = sinComentarios(leer(FACTURAS_BD))
  const i = fuente.indexOf('async reservarPropuesta')
  assert.ok(i > 0, 'no se encontró reservarPropuesta')
  const cuerpo = fuente.slice(i, fuente.indexOf('leer:', i))
  const tx = pos(cuerpo, '$transaction(')
  const lock = pos(cuerpo, 'pg_advisory_xact_lock')
  const cuenta = pos(cuerpo, '.count(')
  const crea = pos(cuerpo, '.create(')
  assert.ok(tx < lock && lock < cuenta && cuenta < crea, 'orden: transacción → bloqueo → recuento → inserción (sin bloqueo, N subidas simultáneas pasan el tope)')
  assert.match(cuerpo, /\$executeRaw`[^`]*\$\{/, 'el bloqueo va parametrizado con $executeRaw, nunca concatenado')
  assert.match(cuerpo, /identidadId/, 'el bloqueo es por identidad')
  assert.match(cuerpo, /inicioDiaMadrid\(/, 'el día del tope es el de Europe/Madrid')
  assert.doesNotMatch(fuente, /toISOString\(\)\.slice\(0,\s*10\)\}T00/, 'el día en UTC reinicia el tope a las 02:00 de Madrid')
  assert.doesNotMatch(fuente, /\$queryRawUnsafe|\$executeRawUnsafe/)
})

test('POST /api/patrimonio/facturas exige content-length numérico (411) y acotado (413) ANTES de leer el cuerpo', () => {
  const cuerpo = cuerpoDelPost(FACTURAS)
  const lectura = pos(cuerpo, 'req.formData(')
  const cabecera = pos(cuerpo, "headers.get('content-length')")
  assert.ok(cabecera < lectura, 'sin content-length (chunked) el tope de tamaño no se aplicaría antes de leer')
  const antes = cuerpo.slice(cabecera, lectura)
  assert.match(antes, /status:\s*411/, 'ausente o no numérico: 411')
  assert.match(antes, /MAX_BYTES_FACTURA[\s\S]*status:\s*413/, 'mayor que el máximo: 413')
  assert.doesNotMatch(cuerpo.slice(cabecera, cabecera + 40), /\?\?\s*0/, 'un content-length ausente no vale 0')
})

test('el tope es por IDENTIDAD, nunca por IP', () => {
  // Varios clientes comparten IP (una oficina, el CGNAT del móvil) y el mismo
  // cliente cambia de red: por IP se castiga al vecino y se le escapa el abuso.
  for (const ruta of [POLIZAS, SUGERIR, FACTURAS]) {
    const cuerpo = cuerpoDelPost(ruta)
    const i = pos(cuerpo, 'rateLimit(')
    const llamada = cuerpo.slice(i, i + 160)
    assert.match(llamada, /identidad\.id/, `${ruta}: la clave del tope tiene que ser la identidad`)
    assert.doesNotMatch(llamada, /getIp\(/, `${ruta}: por IP no vale aquí`)
  }
})

test('el tope agotado es 429 con retry-after, no un 400 ni un 500', () => {
  for (const ruta of [POLIZAS, SUGERIR, FACTURAS]) {
    const fuente = sinComentarios(leer(ruta))
    assert.match(fuente, /demasiadas_peticiones/, `${ruta}: el error tiene nombre propio`)
    assert.match(fuente, /status:\s*429/, `${ruta}: un tope agotado es 429`)
    assert.match(fuente, /retry-after/i, `${ruta}: sin retry-after el cliente no sabe cuándo volver`)
  }
})

test('las constantes del tope tienen NOMBRE, como en /api/acceso/solicitar', () => {
  for (const ruta of [POLIZAS, SUGERIR, FACTURAS]) {
    const fuente = sinComentarios(leer(ruta))
    assert.match(fuente, /const MAX_POR_IDENTIDAD = \d+/, `${ruta}: un número suelto en la llamada no se puede leer`)
    assert.match(fuente, /const VENTANA_MS = /, `${ruta}: la ventana también`)
  }
})

test('se reutiliza el limitador de la app, no se escribe otro', () => {
  for (const ruta of [POLIZAS, SUGERIR, FACTURAS]) {
    assert.match(
      sinComentarios(leer(ruta)),
      /import\s*\{[^}]*rateLimit[^}]*\}\s*from\s*'@\/lib\/rate-limit'/,
      `${ruta}: el tope sale de lib/rate-limit`,
    )
  }
})

test('la sesión sigue exigiéndose: el tope se suma, no sustituye', () => {
  for (const ruta of [POLIZAS, SUGERIR, FACTURAS]) {
    const cuerpo = cuerpoDelPost(ruta)
    assert.ok(pos(cuerpo, 'requireIdentidad()') < pos(cuerpo, 'rateLimit('), `${ruta}: sin identidad no hay clave que topar`)
    assert.match(cuerpo, /sin_sesion/, `${ruta}: sin sesión, 401`)
  }
})

test('POST /api/patrimonio/documentos topa por identidad y exige content-length (411) acotado (413) ANTES de leer el cuerpo', () => {
  const cuerpo = cuerpoDelPost(DOCUMENTOS)
  const tope = pos(cuerpo, 'rateLimit(')
  const cabecera = pos(cuerpo, "headers.get('content-length')")
  const lectura = pos(cuerpo, 'req.formData(')
  assert.ok(tope < cabecera && cabecera < lectura, 'orden: tope → content-length → lectura del cuerpo')
  assert.ok(lectura < pos(cuerpo, 'responderSubidaDocumento('), 'la lógica recibe el fichero ya leído y acotado')
  const antes = cuerpo.slice(cabecera, lectura)
  assert.match(antes, /status:\s*411/, 'ausente o no numérico: 411')
  assert.match(antes, /MAX_BYTES_DOCUMENTO[\s\S]*status:\s*413/, 'mayor que el máximo: 413')
  assert.doesNotMatch(cuerpo.slice(cabecera, cabecera + 40), /\?\?\s*0/, 'un content-length ausente no vale 0')
  assert.match(cuerpo.slice(tope, tope + 160), /identidad\.id/, 'el tope es por identidad, nunca por IP')
  assert.doesNotMatch(cuerpo, /getIp\(/)
})

test('documentos: contar + insertar es UNA transacción con bloqueo por identidad y el día es el de Madrid', () => {
  const fuente = sinComentarios(leer(DOCUMENTOS_BD))
  const i = fuente.indexOf('async guardar(')
  assert.ok(i > 0, 'no se encontró guardar')
  const cuerpo = fuente.slice(i, fuente.indexOf('async listar(', i))
  const tx = pos(cuerpo, '$transaction(')
  const lock = pos(cuerpo, 'pg_advisory_xact_lock')
  const cuenta = pos(cuerpo, '.count(')
  const crea = pos(cuerpo, 'crearDocumentoTx(')
  assert.ok(tx < lock && lock < cuenta && cuenta < crea, 'orden: transacción → bloqueo → recuento → inserción')
  assert.match(cuerpo, /\$executeRaw`[^`]*\$\{/, 'el bloqueo va parametrizado, nunca concatenado')
  assert.match(cuerpo, /creadoPorIdentidadId: identidadId/, 'se cuenta por identidad (también los borrados)')
  assert.doesNotMatch(cuerpo.slice(cuenta, crea), /borradoEn/, 'subir-borrar-subir en bucle no puede esquivar el tope')
  assert.match(cuerpo, /inicioDiaMadrid\(/)
})

test('facturas: el fichero se guarda como documento en la MISMA transacción que la reserva, y el gasto lo enlaza', () => {
  const fuente = sinComentarios(leer(FACTURAS_BD))
  const i = fuente.indexOf('async reservarPropuesta')
  const cuerpo = fuente.slice(i, fuente.indexOf('leer:', i))
  const lock = pos(cuerpo, 'pg_advisory_xact_lock')
  const doc = pos(cuerpo, 'crearDocumentoTx(tx,')
  assert.ok(lock < pos(cuerpo, '.count(') && pos(cuerpo, '.count(') < doc, 'el documento entra después del tope, dentro de la transacción')
  assert.match(cuerpo.slice(doc), /portalPatrimonioGasto\.updateMany\([\s\S]*documentoId/, 'el gasto lleva el documentoId')
  assert.match(cuerpo, /CARPETA_FACTURAS/, 'carpeta Facturas del inmueble')
})
