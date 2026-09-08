import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * La «vista de corredor» (08/09/2026): Alberto abre el portal como lo ve un
 * cliente. Es un atajo con DOS filos, y este cepo vigila los dos:
 *
 *  1. La identidad del corredor recibe un vínculo REAL con la ficha. Si asegura
 *     lo contara, la ficha diría «Ya entra al portal» de alguien que nunca ha
 *     entrado — y ese titular decide si se le invita.
 *  2. La sesión del corredor no puede ESCRIBIR como el cliente: un parte de
 *     siniestro o una autorización firmados desde ahí serían declaraciones del
 *     cliente que el cliente no hizo. El veto vive en UN sitio (middleware) y
 *     tiene que cubrir todo `/api/*` menos salir y entrar.
 */
const RAIZ = join(import.meta.dirname, '..')
const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8')
const sinComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const ASEGURA = sinComentarios(leer('apps', 'asegura', 'lib', 'invitacion-portal.ts'))
const MIDDLEWARE = sinComentarios(leer('apps', 'asegura-portal', 'middleware.ts'))
const SQL = leer('apps', 'asegura-portal', 'prisma', 'sql', '2026-09-08_portal_vista_corredor.sql')
const MODULO = leer('packages', 'module-seguros-portal', 'src', 'vista-corredor.ts')

test('🚨 asegura EXCLUYE el vínculo del corredor al contar quién entra al portal', () => {
  const lectura = ASEGURA.match(/db\.portalVinculo\.findMany\(\{[\s\S]*?\}\)/)?.[0] ?? ''
  assert.notEqual(lectura, '', 'no se encuentra la lectura de vínculos de accesoDe()')
  assert.match(
    lectura,
    /origen:\s*\{\s*not:\s*ORIGEN_VINCULO_CORREDOR\s*\}/,
    'accesoDe() tiene que filtrar `origen: { not: ORIGEN_VINCULO_CORREDOR }`: si no, mirar una ficha la convierte en «ya entra»',
  )
})

test('🚨 el veto a escribir cubre todo /api/* salvo salir y acceso, y deja pasar GET', () => {
  assert.match(MIDDLEWARE, /matcher:\s*'\/api\/:path\*'/, 'el matcher tiene que ser todo /api/*')
  assert.match(MIDDLEWARE, /'\/api\/salir'/, 'salir tiene que estar exento: es como se suelta la vista')
  assert.match(MIDDLEWARE, /'\/api\/acceso\/'/, 'acceso tiene que estar exento: Alberto entra como él mismo con la cookie puesta')
  const exentas = MIDDLEWARE.match(/const EXENTAS = \[([^\]]*)\]/)?.[1] ?? ''
  const lista = [...exentas.matchAll(/'([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(lista.sort(), ['/api/acceso/', '/api/salir'], 'ninguna otra ruta puede estar exenta del veto')
  assert.match(MIDDLEWARE, /status:\s*403/, 'el veto responde 403')
  assert.match(MIDDLEWARE, /'modo_corredor'/, 'con el código `modo_corredor`, para que la pantalla pueda explicarlo')
})

test('el middleware no importa nada con node:crypto (corre en edge)', () => {
  const imports = [...MIDDLEWARE.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
  assert.ok(!imports.includes('@/lib/auth'), 'lib/auth.ts importa node:crypto: en edge no arranca y el veto desaparece sin error')
  assert.ok(imports.includes('@/lib/auth-cookie'), 'el nombre de la cookie sale de lib/auth-cookie.ts, que no tiene deps')
})

test('la identidad del corredor de la migración es la del módulo, y el CHECK admite «corredor»', () => {
  const id = MODULO.match(/IDENTIDAD_CORREDOR_ID = '([^']+)'/)?.[1]
  assert.ok(id, 'falta IDENTIDAD_CORREDOR_ID en el módulo')
  assert.ok(SQL.includes(`'${id}'`), 'la migración siembra OTRO id: las dos apps dejarían de coincidir en silencio')
  assert.match(SQL, /'corredor'::text/, 'el CHECK de portal_vinculo.origen tiene que admitir corredor')
  assert.match(SQL, /GRANT SELECT ON seguros\.portal_vista_corredor TO prisma_asegura_portal/, 'el portal tiene que poder leer el enlace')
  assert.ok(
    !/GRANT[^;]*INSERT[^;]*TO prisma_asegura_portal/.test(SQL.replace(/portal_vista_corredor_\w+/g, '')),
    'el portal NO crea enlaces: eso es de asegura',
  )
})
