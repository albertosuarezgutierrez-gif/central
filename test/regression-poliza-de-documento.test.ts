import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * Guardián de «subir la póliza que me manda el interesado».
 *
 * Lo que vigila es UNA decisión, y es la que no se ve en pantalla: esa póliza
 * **no la ha mediado la casa**, así que no puede entrar en `seguros.polizas`.
 *
 * Si algún día alguien la escribe ahí, no fallará nada. Pasarán dos cosas, las
 * dos en silencio:
 *
 *   1. Una fila en `polizas` con `import_ref` a NULL **es cartera viva** para
 *      `esCarteraViva()`. Los 80 clientes / 110 pólizas dejarían de significar
 *      lo que significan, y con ellos el libro de comisiones y el recuento de
 *      «clientes sin canal».
 *   2. La ingesta de CIMA empareja por número de póliza + nombre de compañía y
 *      **pisa**. Esa póliza lleva su número REAL, así que es exactamente la
 *      fila con la que colisiona un pull futuro — y la compañía del documento
 *      no dice nada, porque el corredor trabaja con varias y recoloca donde le
 *      conviene.
 *
 * Se lee el FUENTE con `readFileSync` a propósito: lo que se vigila es a qué
 * tabla se escribe, y `tsc` da por bueno cualquier modelo de Prisma que exista.
 */

const BD = readFileSync(new URL('../apps/asegura/lib/poliza-de-documento.ts', import.meta.url), 'utf8')
const RUTA = readFileSync(
  new URL('../apps/asegura/app/api/operador/poliza-documento/route.ts', import.meta.url),
  'utf8',
)

/** El fuente SIN comentarios: lo que se vigila es lo que se EJECUTA. El propio
 *  comentario de la ruta nombra a Avant2 para explicar por qué no lo llama. */
function codigo(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

test('NO escribe en seguros.polizas: esa póliza no la ha mediado la casa', () => {
  assert.ok(!/\.poliza\.(create|createMany|upsert|update)/.test(BD), 'escribe en la tabla de pólizas')
})

test('la póliza va a portal_poliza_declarada, que es donde vive lo que no es nuestro', () => {
  assert.match(BD, /portalPolizaDeclarada\.create/)
})

test('queda marcada con procedencia «documento»', () => {
  assert.match(BD, /procedencia:\s*'documento'/)
})

test('nace SIN confirmar: la leyó una máquina y nadie la ha revisado', () => {
  // `true` diría que el dato está verificado, y sobre esa fecha se decide a
  // quién se llama.
  assert.match(BD, /confirmadaPorUsuario:\s*false/)
})

test('la identidad del portal se crea SIN canal: es una carpeta, no una cuenta', () => {
  // Al portal se entra con un código de un solo uso enviado a un canal
  // verificado. Crear aquí un `portalCanal` le abriría la puerta a alguien que
  // no la ha pedido.
  assert.ok(!/portalCanal\.(create|upsert)/.test(BD), 'crea un canal de acceso al portal')
})

test('reutiliza la carpeta que ya tenga la ficha en vez de abrir otra', () => {
  // Con una carpeta nueva, la póliza no le aparecería al cliente que ya entra.
  assert.match(BD, /portalVinculo\.findFirst/)
})

test('el documento se guarda como subido por el CORREDOR', () => {
  // Es la única señal que distingue «lo declaró el cliente» (señal comercial
  // fuerte) de «lo subí yo» (que Alberto ya sabe).
  assert.match(BD, /subidoPor:\s*'corredor'/)
})

test('un documento repetido no crea una segunda póliza', () => {
  // Dos filas iguales serían dos vencimientos y dos avisos por lo mismo.
  assert.match(BD, /doc\.repetido/)
})

test('deja rastro en el historial de la ficha', () => {
  assert.match(BD, /anotarHistorialCliente/)
})

test('el alta reutiliza el antiduplicado del puerto, no abre ficha a ciegas', () => {
  assert.match(BD, /altaCliente\(/)
})

// ─── La ruta ────────────────────────────────────────────────────────────────

test('la ruta exige operador autorizado antes de nada', () => {
  assert.match(RUTA, /operadorAutorizado\(req\)/)
})

test('la ruta revisa el fichero antes de guardarlo', () => {
  assert.match(RUTA, /revisarFichero\(/)
})

test('la ruta NO tarifica: Avant2 cuesta 0,50€ y no es idempotente', () => {
  assert.ok(!/codeoscopic|avant2|retarific/i.test(codigo(RUTA)), 'la ruta toca el tarificador')
})
