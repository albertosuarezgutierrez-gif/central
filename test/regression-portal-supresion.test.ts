import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * Bloque legal 0.5 — el derecho de SUPRESIÓN (art. 17 RGPD).
 *
 * 🚨 Lo que se protege aquí no es que compile: son cuatro decisiones que, si se
 * deshacen, producen una pantalla que PARECE correcta y miente.
 *
 * 1. Que el portal **no borre**. El art. 17.3.b y el 17.3.e excluyen la
 *    supresión cuando hay deber legal de conservar o hace falta defender
 *    reclamaciones. Un botón que borrase de verdad destruiría documentación que
 *    la ley obliga a guardar, y encima de forma irreversible.
 * 2. Que la pantalla enseñe **lo que NO se va a borrar** antes de pulsar, no un
 *    mes después.
 * 3. Que resolver EXIJA texto (art. 12.4).
 * 4. Que la solicitud llegue a una pantalla que Alberto abre. Una solicitud que
 *    solo vive en la BD del portal es un plazo legal incumpliéndose en silencio.
 */

const MODULO = 'packages/module-seguros-portal/src/supresion.ts'
const LIB_PORTAL = 'apps/asegura-portal/lib/supresion.ts'
const RUTA_PORTAL = 'apps/asegura-portal/app/api/supresion/route.ts'
const PANTALLA = 'apps/asegura-portal/app/(portal)/boveda/TusDatos.tsx'
const LIB_ASEGURA = 'apps/asegura/lib/supresiones.ts'
const RUTA_OPERADOR = 'apps/asegura/app/api/operador/supresiones/route.ts'
const DDL = 'apps/asegura-portal/prisma/sql/2026-09-05_portal_supresion.sql'

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
/** Sin comentarios: si no, el cepo se muerde a sí mismo (las cabeceras explican
 *  justo lo que está prohibido hacer). */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('🚨 el portal NO borra: ni un delete de datos personales en todo el camino', () => {
  // Es el corazón del bloque. `deleteMany` sobre las tablas del portal aquí
  // sería un borrado real disparado por una pantalla pública, sin que nadie
  // haya comprobado qué se puede conservar por obligación legal.
  for (const f of [LIB_PORTAL, RUTA_PORTAL, PANTALLA]) {
    const src = sinComentarios(leer(f))
    assert.ok(!/prisma\.\w+\.delete/.test(src), `${f} borra filas: el art. 17.3 no lo permite aquí`)
    assert.ok(!/\bDELETE\b/.test(src), `${f} declara un DELETE`)
  }
})

test('🚨 la pantalla enseña lo que NO se borra, y lo CALCULA', () => {
  // Una lista escrita a mano en el JSX se desincroniza en cuanto se añade una
  // categoría — y entonces la pantalla promete un borrado que no va a pasar.
  const src = leer(PANTALLA)
  assert.match(src, /loQueSeConserva\(\)/, 'la pantalla no enseña lo que se conserva')
  assert.match(src, /loQueSeSuprime\(\)/)
  assert.match(src, /@central\/module-seguros-portal/, 'las listas no salen del módulo puro')
})

test('la pantalla NO promete un borrado ni dice «borrado» a secas', () => {
  const src = sinComentarios(leer(PANTALLA))
  for (const frase of [/hemos borrado/i, /borrado con éxito/i, /tus datos han sido eliminados/i]) {
    assert.ok(!frase.test(src), `la pantalla afirma un borrado que no se produce: ${frase}`)
  }
})

test('el plazo del art. 12.3 se dice con una FECHA, no con un «pronto»', () => {
  // «Te contestaremos pronto» no es el art. 12.3: el plazo es un mes y la
  // persona tiene derecho a saber cuándo se cumple.
  const src = leer(PANTALLA)
  assert.match(src, /fechaLimite/, 'la pantalla no enseña la fecha comprometida')
  assert.match(src, /art\. 12\.3/, 'no se cita el plazo legal del que sale esa fecha')
})

test('🚨 resolver EXIGE respuesta escrita (art. 12.4)', () => {
  // La negativa parcial hay que motivarla, y la parcial es el caso normal aquí.
  const src = leer(LIB_ASEGURA)
  assert.match(src, /sin_respuesta/, 'se puede marcar resuelta sin decir qué se contestó')
  assert.match(src, /respuesta === ''\s*\)\s*return[\s\S]{0,80}sin_respuesta/)
})

test('🚨 y prorrogar exige motivo: una prórroga en silencio incumple igual', () => {
  assert.match(leer(LIB_ASEGURA), /sin_motivo_prorroga/)
  assert.match(leer(DDL), /portal_supresion_prorroga_motivada/)
})

test('la BD repite los dos cepos: uno solo en el código no protege a un UPDATE a mano', () => {
  const ddl = leer(DDL)
  assert.match(ddl, /portal_supresion_resuelta_con_prueba/)
  assert.match(ddl, /portal_supresion_sello_coherente/)
  // El índice parcial es lo que impide dos relojes legales sobre el mismo caso.
  assert.match(ddl, /idx_portal_supresion_pendiente/)
  // Y el GRANT, que en este schema se concede tabla por tabla: sin él el modelo
  // Prisma compila y la primera consulta muere en la BD.
  assert.match(ddl, /GRANT[\s\S]{0,80}portal_supresion TO prisma_asegura_portal/)
})

test('🚨 el portal NO tiene DELETE sobre la tabla: una retirada se MARCA', () => {
  const ddl = leer(DDL)
  const grant = ddl.match(/GRANT[^;]*TO prisma_asegura_portal;/)?.[0] ?? ''
  assert.ok(grant.length > 0, 'no hay GRANT para el rol del portal')
  assert.ok(!/DELETE/.test(grant), 'el portal puede borrar la solicitud: se perdería la prueba de que existió')
})

test('🚨 la solicitud llega a una pantalla que Alberto abre: hay puerto de operador', () => {
  // Sin esto la solicitud vive solo en la BD del portal, y el plazo de un mes se
  // incumple en silencio. Es la regla de la casa aplicada a un reloj legal.
  const src = leer(RUTA_OPERADOR)
  assert.match(src, /operadorAutorizado\(req\)/, 'el puerto no comprueba la autorización')
  assert.match(src, /status: 401/)
})

test('la cola la ordena el RELOJ, no el orden de llegada', () => {
  const src = leer(LIB_ASEGURA)
  assert.match(src, /ORDEN: Record<EstadoPlazo, number>[\s\S]{0,120}vencido: 0/)
  // `vencidas` va aparte: es el único número que autoriza a decir que hay un
  // plazo incumplido.
  assert.match(src, /vencidas:/)
})

test('la identidad sale de la cookie y toda consulta filtra por ella', () => {
  // Mismo aislamiento por código que el resto del portal: no hay RLS que rescate
  // un olvido, y una consulta sin `where` respondería 200 con las solicitudes de
  // todo el mundo.
  const src = leer(LIB_PORTAL)
  for (const m of src.matchAll(/prisma\.portalSupresion\.(findMany|findFirst|updateMany)\(\{[\s\S]{0,200}?\}/g)) {
    assert.match(m[0], /identidadId/, `consulta sin filtrar por identidad: ${m[0].slice(0, 80)}`)
  }
  assert.match(leer(RUTA_PORTAL), /requireIdentidad\(\)/)
})

test('la solicitud se sella con la versión de los textos que se le enseñó', () => {
  // Sin ella no se puede reconstruir QUÉ se le dijo que se iba a conservar.
  const src = leer(LIB_PORTAL)
  assert.match(src, /versionTextos: VERSION_TEXTOS_LEGALES/)
  assert.ok(!/versionTextos: '20\d\d/.test(src), 'la versión está escrita a mano en vez de importada')
})

test('el motivo es OPCIONAL: el art. 17 no obliga a justificar la solicitud', () => {
  // Exigirlo pondría un peaje al ejercicio de un derecho.
  assert.match(leer(RUTA_PORTAL), /motivo: z\.string\(\)[\s\S]{0,60}\.optional\(\)/)
})

test('cada apartado conservado del módulo cita su artículo', () => {
  const src = leer(MODULO)
  assert.match(src, /art\. 17\.3\.b/)
  assert.match(src, /art\. 17\.3\.e/)
})
