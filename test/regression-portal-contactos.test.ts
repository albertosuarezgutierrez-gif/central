// Cepos de «Contactos» (08/09/2026): la invitación con nombre y relación, y la
// que no comparte nada.
//
// Lo que protege, y por qué no lo protege nada más:
//
//   1. **La lista de relaciones de la BD y la de TypeScript son LA MISMA.** El
//      CHECK `portal_invitacion_relacion_vocabulario` repite `TIPOS_RELACION` a
//      mano. Si divergen, el formulario ofrece un valor que la BD rechaza y el
//      envío muere con un 23514 DESPUÉS de que José haya escrito el correo de
//      un tercero — sin que ningún test de tipos lo vea, porque un CHECK no
//      compila.
//   2. **La relación se guarda para la lista de José y NO viaja al correo.** Lo
//      vigila también `lib/invitaciones.test.ts` desde dentro de la app; aquí se
//      mira la PANTALLA, que es la otra puerta: el texto de ayuda promete «no
//      va en el correo», y esa promesa tiene que seguir siendo verdad.
//   3. **La pestaña se llama «Contactos» y su ruta NO cambió.** Renombrar la
//      etiqueta y de paso la ruta rompería los enlaces guardados a
//      `/autorizaciones` sin error y sin aviso.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { TIPOS_RELACION } from '../packages/module-seguros/src/relaciones.ts'
import { RELACIONES_INVITACION } from '../packages/module-seguros-portal/src/invitacion.ts'
import { pestanasPortal } from '../packages/module-seguros-portal/src/vista-portal.ts'

const ROOT = join(import.meta.dirname, '..')
const APP = 'apps/asegura-portal'
const leer = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const SQL = leer(`${APP}/prisma/sql/2026-09-08_portal_invitacion_contacto.sql`)
const SCHEMA = leer(`${APP}/prisma/schema.prisma`)
const PANTALLA = leer(`${APP}/app/(portal)/autorizaciones/Autorizaciones.tsx`)

/** Los valores del `IN (...)` del CHECK de la relación, tal y como están en el SQL. */
function relacionesDelCheck(sql: string): string[] {
  const m = sql.match(/portal_invitacion_relacion_vocabulario\s*\n?\s*CHECK \(relacion IS NULL OR relacion IN \(([\s\S]*?)\)\)/)
  assert.ok(m, 'no se encuentra el CHECK `portal_invitacion_relacion_vocabulario` en la migración')
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

test('el CHECK de la relación en la BD es EXACTAMENTE TIPOS_RELACION', () => {
  const enBd = relacionesDelCheck(SQL)
  assert.ok(enBd.length > 5, 'el cepo no está viendo la lista que cree')
  assert.deepEqual(
    [...enBd].sort(),
    [...TIPOS_RELACION].sort(),
    'La lista del CHECK y `TIPOS_RELACION` han divergido. Un valor que TypeScript ofrece y la BD ' +
      'rechaza mata el envío con un 23514 después de escribir el correo de un tercero; uno que la BD ' +
      'admite y TypeScript no, no se puede elegir nunca. Cambia las dos a la vez (y aplica la migración).',
  )
  // Y las que se OFRECEN en el portal, dentro de las dos.
  for (const r of RELACIONES_INVITACION) assert.ok(enBd.includes(r), `«${r}» se ofrece pero la BD no la admite`)
})

test('el modelo Prisma del portal declara las dos columnas nuevas', () => {
  const modelo = SCHEMA.slice(SCHEMA.indexOf('model PortalInvitacion {'))
  const fin = modelo.indexOf('\n}')
  const cuerpo = modelo.slice(0, fin)
  assert.ok(/invitadoNombre\s+String\?\s+@map\("invitado_nombre"\)/.test(cuerpo), 'falta `invitadoNombre`')
  assert.ok(/\n\s+relacion\s+String\?/.test(cuerpo), 'falta `relacion`')
})

test('la pantalla pide nombre y relación, los manda, y promete que la relación no va en el correo', () => {
  assert.ok(/invitadoNombre:\s*nombre\.trim\(\)/.test(PANTALLA), 'el POST manda `invitadoNombre`')
  assert.ok(/\n\s+relacion,\n/.test(PANTALLA), 'el POST manda `relacion`')
  assert.ok(/RELACIONES_INVITACION\.map/.test(PANTALLA), 'el desplegable sale del módulo puro, no de una copia')
  assert.ok(
    /No va en el correo\./.test(PANTALLA),
    'la ayuda del campo «Qué es de ti» tiene que decir que no va en el correo: es lo que hace que José lo rellene sin miedo',
  )
  // La opción «nada» existe y es la que no cede un solo dato.
  assert.ok(/value=\{SIN_COMPARTIR\}/.test(PANTALLA), 'el formulario ofrece «nada: solo le presento el portal»')
})

test('la pestaña se llama «Contactos» y sigue apuntando a /autorizaciones', () => {
  const p = pestanasPortal()
  const contactos = p.find((x) => x.href === '/autorizaciones')
  assert.ok(contactos, 'la barra tiene que seguir llevando a /autorizaciones')
  assert.equal(contactos.etiqueta, 'Contactos')
  assert.equal(contactos.vista, null)
})
