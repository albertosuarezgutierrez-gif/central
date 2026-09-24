// Guardián del BORRADO en `apps/asegura-portal`. `node --test` (gate en CI vía
// `pnpm test:guardia`).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// En «Mis seguros» conviven dos listas que para quien mira son la misma cosa:
// las pólizas de la CARTERA (entran por CIMA, son el registro de la correduría)
// y las que APORTA el propio cliente. Desde el 07/09/2026 las segundas se pueden
// quitar; las primeras NO, y esa línea es de Alberto: «las nuestras de CIMA no
// se pueden eliminar, pero las que no son nuestras el cliente sí, que se puede
// confundir».
//
// Lo que vigila esto no es un permiso: es que no exista la ruta. Tres brazos,
// cada uno por un modo de fallo distinto y silencioso:
//
//   1. Ninguna ruta del portal ESCRIBE sobre un modelo de cartera. El rol
//      `prisma_asegura_portal` no tiene BYPASSRLS pero sí grants de escritura en
//      alguna tabla; el día que alguien añada un `prisma.poliza.deleteMany` el
//      fallo no se vería en la pantalla, se vería en la cartera de Alberto.
//   2. Ningún borrado de tabla del portal usa `.delete({ where: { id } })`. Con
//      el uuid de otra persona —que viaja en la URL— eso borra la póliza de un
//      tercero y responde 200. La forma correcta es `deleteMany` con
//      `identidadId` dentro del `where`, igual que el PATCH.
//   3. La ficha de una póliza de la CARTERA no monta el botón de quitar, y la de
//      una aportada sí. Es lo único de los tres que el usuario ve.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const APP = 'apps/asegura-portal'

function ficheros(): string[] {
  return execFileSync('git', ['ls-files', `${APP}/app`, `${APP}/lib`], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
}

const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')

/**
 * Los modelos de la CARTERA. El portal los LEE (`findMany`, `count`) y nada más.
 * `prisma.portalPoliza…` no cae aquí: después del punto viene `portal`.
 */
const ESCRIBE_CARTERA =
  /prisma\s*\.\s*(cliente|clienteEmail|clienteRelacion|poliza|polizaCobertura|polizaRecibo|polizaInterviniente|siniestro|correduria)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/

test('ninguna ruta del portal escribe sobre la cartera (las pólizas de CIMA no se tocan)', () => {
  const culpables = ficheros().filter((f) => ESCRIBE_CARTERA.test(leer(f)))
  assert.deepEqual(
    culpables,
    [],
    `Escritura sobre un modelo de CARTERA desde el portal: ${culpables.join(', ')}. ` +
      'El portal lee la cartera; quien la escribe es la correduría.',
  )
})

/** `prisma.portalX.delete(` — el borrado por id a secas, sin filtrar por identidad. */
const BORRADO_SIN_FILTRO = /prisma\s*\.\s*portal[A-Za-z]*\s*\.\s*delete\s*\(/
/** Lo mismo dentro de una transacción (`tx.portalX.delete(`). */
const BORRADO_SIN_FILTRO_TX = /\btx\s*\.\s*portal[A-Za-z]*\s*\.\s*delete\s*\(/

test('los borrados del portal van por deleteMany con identidadId, nunca por delete({ id })', () => {
  const culpables = ficheros().filter((f) => {
    const src = leer(f)
    return BORRADO_SIN_FILTRO.test(src) || BORRADO_SIN_FILTRO_TX.test(src)
  })
  assert.deepEqual(
    culpables,
    [],
    `Borrado por id sin filtrar por identidad en: ${culpables.join(', ')}. ` +
      'Con el uuid de otra persona eso borra su fila y responde 200.',
  )
})

test('el DELETE de pólizas filtra por identidadId y consulta el ESTADO de los partes', () => {
  const src = leer(`${APP}/app/api/polizas/[id]/route.ts`)
  const delete_ = src.slice(src.indexOf('export async function DELETE'))
  assert.notEqual(delete_, '', 'No hay handler DELETE de pólizas aportadas')
  assert.match(delete_, /deleteMany\(\{\s*\n?\s*where:\s*\{\s*id,\s*identidadId:\s*identidad\.id\s*\}/)
  assert.match(delete_, /puedeBorrarDeclarada/)
  // `count` NO basta: lo que bloquea no es tener partes, es tener uno que la
  // compañía ya tramita. Con un contador esa distinción no se puede hacer.
  assert.match(delete_, /portalParteSiniestro\.findMany/)
  assert.match(delete_, /estado:\s*true/)
  assert.match(delete_, /siniestroId:\s*true/)
})

test('🚨 el DELETE CONGELA la póliza en sus partes ANTES de borrarla', () => {
  // El modo de fallo que esto persigue no rompe nada: la FK es
  // `ON DELETE SET NULL`, así que borrar primero pone el vínculo a NULL solo y
  // el parte queda sin poder decir de qué póliza hablaba. Nadie se entera.
  const src = leer(`${APP}/app/api/polizas/[id]/route.ts`)
  const delete_ = src.slice(src.indexOf('export async function DELETE'))

  const congelar = delete_.indexOf('polizaDesligadaAt')
  const borrar = delete_.indexOf('portalPolizaDeclarada.deleteMany')
  assert.notEqual(congelar, -1, 'El DELETE no congela la póliza en los partes')
  assert.notEqual(borrar, -1, 'El DELETE no borra la póliza')
  assert.ok(congelar < borrar, 'La congelación tiene que ir ANTES del borrado, no después')

  // Y el vínculo se corta a mano: si se dejara al `ON DELETE SET NULL`, el CHECK
  // `portal_parte_desligada_coherente` de la BD rechazaría la fila igualmente.
  assert.match(delete_, /polizaDeclaradaId:\s*null/)
  // Los tres campos de la foto viajan juntos: uno suelto es media verdad.
  for (const campo of ['polizaDesligadaCompania', 'polizaDesligadaNumero', 'polizaDesligadaRamo']) {
    assert.match(delete_, new RegExp(campo), `Falta ${campo} en la foto congelada`)
  }
  // La lectura de la póliza pide los tres campos ANTES del borrado: después ya
  // no existirían.
  assert.match(delete_, /select:\s*\{[^}]*compania:\s*true[^}]*\}/)
})

test('la migración de la foto existe y la BD exige que sea coherente', () => {
  const sql = leer(`${APP}/prisma/sql/2026-09-07_portal_parte_poliza_desligada.sql`)
  assert.match(sql, /poliza_desligada_at/)
  // Sin el CHECK, una fila podría decir a la vez «apunta a esta póliza» y
  // «la póliza se borró», y la pantalla elegiría una de las dos al azar.
  assert.match(sql, /portal_parte_desligada_coherente/)
  assert.match(sql, /poliza_desligada_at IS NOT NULL AND poliza_declarada_id IS NULL/)
})

test('los dos schemas de Prisma declaran la foto: el del portal ESCRIBE y el de asegura LEE', () => {
  // Si solo lo tuviera uno, el otro seguiría compilando y la mitad del circuito
  // no vería el dato — que es justo el fallo silencioso que esto evita.
  for (const schema of [`${APP}/prisma/schema.prisma`, 'apps/asegura/prisma/asegura.prisma']) {
    const src = leer(schema)
    assert.match(src, /polizaDesligadaAt/, `${schema} no declara la foto`)
    assert.match(src, /poliza_desligada_compania/, `${schema} no mapea la columna`)
  }
})

test('quitar una póliza solo está en la ficha de las APORTADAS, no en la de la cartera', () => {
  const aportada = leer(`${APP}/app/(portal)/boveda/anadida/[id]/page.tsx`)
  const cartera = leer(`${APP}/app/(portal)/boveda/poliza/[id]/page.tsx`)
  assert.match(aportada, /EliminarPoliza/, 'La ficha de una póliza aportada tiene que poder quitarla')
  assert.ok(
    !/EliminarPoliza/.test(cartera),
    'La ficha de una póliza de la CARTERA no puede ofrecer quitarla: es el registro de la correduría',
  )
})

/**
 * 🚨 Quitarla tiene que verse DESDE LA LISTA, no solo al final de la ficha.
 * Alberto (08/09/2026), con el botón ya en producción debajo del formulario de
 * corregir: «no puedo eliminar “Póliza sin compañía identificada”». Una acción
 * que hay que ir a buscar es una acción que no existe. Y la fila de la CARTERA
 * sigue sin ofrecerla: lo que entra por CIMA no lo borra el cliente.
 */
test('la fila de una póliza APORTADA ofrece quitarla en la lista; la de la cartera, no', () => {
  const aportada = leer(`${APP}/app/(portal)/boveda/FilaDeclarada.tsx`)
  const cartera = leer(`${APP}/app/(portal)/boveda/FilaPoliza.tsx`)
  assert.match(aportada, /<EliminarPoliza\b/, 'FilaDeclarada tiene que montar EliminarPoliza en la propia fila')
  assert.ok(
    !/EliminarPoliza/.test(cartera),
    'FilaPoliza (cartera) no puede ofrecer quitar: es el registro de la correduría',
  )
})
