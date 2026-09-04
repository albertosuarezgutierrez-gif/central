// Guardián del DESCARTE de una ficha de cliente de la correduría (04/09/2026).
//
// Alberto pidió «poder eliminar» una ficha desde `/correduria`. Lo que se
// implementó NO es un borrado: es un descarte reversible (`clientes.activo =
// false` en el schema `seguros`). Tres razones, y las tres son de este negocio:
// la ingesta de CIMA recrearía la ficha borrada sin que nadie se entere; de la
// ficha cuelgan historial, relaciones, pólizas, recibos, siniestros y
// documentos; y son 32.600 fichas detrás de un clic.
//
// Este fichero fija las DOS mitades de la funcionalidad, porque cada una se
// rompe por su lado:
//
//   1. **La lectura de la respuesta** (pura, en plataforma): que
//      «no se ha podido comprobar» no se confunda con «adelante», y que
//      `tiene_polizas_vivas` llegue con su número — o con `null` si el puerto no
//      lo manda, nunca con un 0 tranquilizador.
//   2. **Que la ficha descartada DESAPAREZCA de donde se mira** (estático,
//      sobre el fuente de `apps/asegura/lib`). Esta es la mitad que se olvida:
//      una ficha «descartada» que sigue saliendo en el buscador es la
//      funcionalidad sin hacer, y no la caza ni tsc ni ningún test de unidad.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { interpretarDescarte } from '../apps/plataforma/lib/cliente-edicion-asegura.ts'

const RAIZ = join(import.meta.dirname, '..')

// ─── 1. Leer la respuesta del puerto ─────────────────────────────────────────

test('un descarte OK dice si la ficha ya estaba descartada (no es un error)', () => {
  assert.deepEqual(interpretarDescarte(200, { estado: 'ok', activo: false, yaEstaba: true }), {
    estado: 'ok',
    activo: false,
    yaEstaba: true,
  })
})

test('🚨 «tiene pólizas vivas» llega con CUÁNTAS, y sin el dato es null (jamás 0)', () => {
  assert.deepEqual(interpretarDescarte(422, { estado: 'invalido', motivo: 'tiene_polizas_vivas', polizasVivas: 3 }), {
    estado: 'tiene_polizas_vivas',
    polizasVivas: 3,
  })
  assert.deepEqual(interpretarDescarte(422, { estado: 'invalido', motivo: 'tiene_polizas_vivas' }), {
    estado: 'tiene_polizas_vivas',
    polizasVivas: null,
  })
})

test('🚨 «no se pudo comprobar si tiene pólizas» es un ERROR, no una vía libre', () => {
  const r = interpretarDescarte(500, { estado: 'error', motivo: 'no_se_pudo_comprobar_polizas' })
  assert.equal(r.estado, 'error')
  assert.equal(r.estado === 'error' && r.motivo, 'no_se_pudo_comprobar_polizas')
})

test('el puerto sin conectar NO se lee como «esa ficha no existe»', () => {
  assert.deepEqual(interpretarDescarte(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarDescarte(404, { estado: 'no_encontrado' }), { estado: 'no_encontrado' })
  assert.equal(interpretarDescarte(401, null).estado, 'error')
})

test('una respuesta sin forma no se toma por un ok', () => {
  assert.equal(interpretarDescarte(200, null).estado, 'error')
  assert.equal(interpretarDescarte(200, { estado: 'raro' }).estado, 'error')
})

// ─── 2. La ficha descartada no sale en ninguna lista ─────────────────────────

function fuente(rel: string): string {
  return readFileSync(join(RAIZ, rel), 'utf8')
}

/**
 * Cada entrada es una consulta que LISTA, BUSCA o CUENTA clientes, con el
 * fragmento que prueba que filtra por `activo`. Si una de estas consultas se
 * reescribe y se pierde el filtro, la ficha descartada vuelve a aparecer donde
 * se mira — y eso, desde fuera, se ve exactamente igual que no haber hecho nada.
 */
const CONSULTAS: { fichero: string; debeContener: string[] }[] = [
  {
    fichero: 'apps/asegura/lib/cartera-busqueda.ts',
    debeContener: [
      // Prisma: nombre, ciudad, CP, índices ciegos y sus tablas hijas
      'const base = { correduriaId, mergedIntoClienteId: null, activo: true }',
      "where: { correduriaId, mergedIntoClienteId: null, activo: true, codigoPostal: c.valor },",
      "where: { correduriaId, mergedIntoClienteId: null, activo: true, [campo]: hash },",
      "cliente: { mergedIntoClienteId: null, activo: true }",
      // SQL crudo: matrícula, riesgo (con y sin `unaccent`) y dirección
      'and cl.activo',
      // Hermanas: no se ofrece saltar a una ficha descartada
      'and o.activo',
    ],
  },
  { fichero: 'apps/asegura/lib/cartera-ficha.ts', debeContener: ['activo: true,'] },
  { fichero: 'apps/asegura/lib/cartera-filtro.ts', debeContener: ['Prisma.sql`c.activo`'] },
  { fichero: 'apps/asegura/lib/cartera.ts', debeContener: ["activo: true, tipo: 'cliente'", "activo: true, tipo: 'lead'"] },
  { fichero: 'apps/asegura/lib/clientes-sin-canal.ts', debeContener: ['and c.activo'] },
  { fichero: 'apps/asegura/lib/cartera-impagados.ts', debeContener: ['activo: true'] },
  { fichero: 'apps/asegura/lib/cartera-historial.ts', debeContener: ['cliente: { activo: true }'] },
  { fichero: 'apps/asegura/lib/cartera-relaciones.ts', debeContener: ['if (!o.activo) return null'] },
]

for (const { fichero, debeContener } of CONSULTAS) {
  test(`«${fichero}» no enseña las fichas descartadas`, () => {
    const src = fuente(fichero)
    for (const trozo of debeContener) {
      assert.ok(
        src.includes(trozo),
        `${fichero} ha perdido el filtro de fichas descartadas (falta «${trozo}»). ` +
          `Una ficha descartada que sigue saliendo en el buscador o en la lista es la funcionalidad sin hacer.`,
      )
    }
  })
}

test('🚨 la FICHA de un cliente descartado sí se abre (si no, no habría cómo restaurarla)', () => {
  const src = fuente('apps/asegura/lib/cartera-ficha.ts')
  assert.match(
    src,
    /const c = await db\.cliente\.findFirst\(\{\s*\n\s*where: \{ id: clienteId, correduriaId, mergedIntoClienteId: null \},/,
    'fichaCliente() no debe filtrar por `activo`: una ficha descartada tiene que poder abrirse para restaurarla',
  )
  assert.match(src, /activo: c\.activo,/, 'la ficha debe mandar `activo` a plataforma para poder decir que está descartada')
})

test('🚨 la búsqueda de duplicados NO filtra las descartadas (el índice único sigue vivo)', () => {
  const src = fuente('apps/asegura/lib/cartera-edicion.ts')
  const bloque = src.slice(src.indexOf('export async function coincidencias'), src.indexOf('// ─── Contactos'))
  assert.ok(bloque.length > 200, 'no se encontró el cuerpo de coincidencias()')
  assert.ok(
    !bloque.includes('activo: true'),
    'coincidencias() no debe excluir las fichas descartadas: el índice único por hash de teléfono/email ' +
      'sigue existiendo, y filtrarlas diría «ese teléfono está libre» para luego morir en un P2002.',
  )
})

// ─── 3. La guarda de las pólizas vivas ───────────────────────────────────────

test('descartar exige contar las pólizas vivas con la fuente única, y no descarta si no puede', () => {
  const src = fuente('apps/asegura/lib/cartera-edicion.ts')
  assert.match(src, /WHERE_CARTERA_VIVA/, 'la guarda debe usar WHERE_CARTERA_VIVA de @central/module-seguros, no un criterio propio')
  assert.match(src, /tiene_polizas_vivas/)
  assert.match(
    src,
    /if \(vivas === null\)/,
    'si no se han podido contar las pólizas vivas NO se descarta: «no se ha podido comprobar» no es «no tiene»',
  )
  assert.ok(
    !/vivas \?\? 0|polizasVivas.*\?\? 0/.test(src),
    'un `?? 0` sobre el recuento de pólizas vivas convertiría un fallo de lectura en vía libre para descartar',
  )
})

test('el puerto de asegura sirve el descarte y su vuelta', () => {
  const src = fuente('apps/asegura/app/api/operador/cliente/route.ts')
  assert.match(src, /export async function DELETE\(/, 'falta el DELETE del puerto')
  assert.match(src, /restaurar/, 'falta el camino de vuelta (POST ?restaurar)')
  assert.match(src, /operadorAutorizado\(req\)/, 'el puerto sigue exigiendo el Bearer')
})

test('plataforma reenvía el descarte con el actor de la SESIÓN, nunca del body', () => {
  const src = fuente('apps/plataforma/app/api/correduria/cliente/route.ts')
  assert.match(src, /export async function DELETE\(/)
  assert.match(src, /actor: session\.email/)
})
