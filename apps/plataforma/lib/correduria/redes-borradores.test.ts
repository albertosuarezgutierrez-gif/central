// Guardián de los borradores de redes.
//
// 🚨 Por qué este cepo importa más que el de la web: **una página se corrige y
// un post publicado no**. Un texto que promete precio en `grupoasegura.es` se
// arregla en un commit; en LinkedIn ya lo ha visto quien lo iba a ver, se ha
// repartido y puede estar citado. Así que la revisión pasa ANTES, aquí.
//
// La lista de lo prohibido NO se reescribe en este fichero: sale de
// `revisarCopy` de `@central/module-seguros`, la misma que barre el copy de la
// web. Dos copias divergen, y el día que divergen una de las dos deja de
// vigilar sin que nada falle.
import test from 'node:test'
import assert from 'node:assert/strict'
import { MEDIADOR } from '@central/module-seguros'
import {
  BORRADORES,
  MAX_LINKEDIN,
  revisarBorrador,
  revisarBorradores,
  explicarRevision,
} from './redes-borradores.ts'

test('hay borradores y ninguno está vacío', () => {
  assert.ok(BORRADORES.length >= 1, 'sin borradores el cepo estaría en verde mirando al vacío')
  for (const b of BORRADORES) {
    assert.ok(b.texto.trim().length > 200, `${b.id}: el texto es demasiado corto para ser un post`)
    assert.ok(b.titulo.trim().length > 0, `${b.id}: sin título interno`)
    assert.ok(b.porQue.trim().length > 0, `${b.id}: sin motivo — publicar sin saber a quién va es publicar a ciegas`)
  }
})

// 🚨 EL cepo. Mismo criterio que la web: nada que convierta el post en
// asesoramiento (RDL 3/2020) ni que acote la oferta a una provincia.
test('ningún borrador promete precio, superlativos ni acota el ámbito', () => {
  for (const r of revisarBorradores()) {
    assert.deepEqual(r.infracciones, [], `${r.id}: ${explicarRevision(r)}`)
  }
})

test('ningún borrador pasa del tope de LinkedIn', () => {
  for (const r of revisarBorradores()) {
    assert.ok(r.largo <= MAX_LINKEDIN, `${r.id}: ${r.largo} caracteres (máx ${MAX_LINKEDIN})`)
  }
})

test('los ids no se repiten', () => {
  const vistos = new Set<string>()
  for (const b of BORRADORES) {
    assert.ok(!vistos.has(b.id), `id duplicado: ${b.id}`)
    vistos.add(b.id)
  }
})

// Un calendario que repite tema dos semanas seguidas cansa al mismo lector.
// No se exige que TODOS los temas sean distintos —seis posts de comunidades
// serían legítimos si esa fuera la apuesta— pero sí que haya variedad real.
test('la tanda cubre varios temas, no uno repetido seis veces', () => {
  const temas = new Set(BORRADORES.map((b) => b.tema))
  assert.ok(temas.size >= 4, `solo ${temas.size} temas distintos en ${BORRADORES.length} borradores`)
})

// 🚨 La clave DGSFP NO se teclea: sale de `MEDIADOR`, igual que en la web y en
// el pie de los correos. Dos copias de una clave registral es una copia de más,
// y esta va publicada con el nombre de Alberto detrás.
test('si un borrador cita la clave DGSFP, es la de MEDIADOR', () => {
  const clave = MEDIADOR.identidad.claveDgsfp
  for (const b of BORRADORES) {
    const claves = b.texto.match(/\bC[SA]-[A-Z]\/\d{3,}/g) ?? []
    for (const c of claves) {
      assert.equal(c, clave, `${b.id}: cita la clave ${c} y la del mediador es ${clave}`)
    }
  }
})

// Una cita legal inventada cuesta más que no citar, y en un post no se puede
// corregir. Si el texto nombra una ley, el borrador tiene que declarar CUÁL en
// `base`, para que se pueda verificar antes de publicar.
test('todo borrador que cita una norma declara su base verificable', () => {
  const NOMBRA_NORMA = /\b(art[íi]culo\s+\d+|Ley\s+\d+\/\d{4}|Real\s+Decreto-ley\s+\d+\/\d{4})/i
  for (const b of BORRADORES) {
    if (NOMBRA_NORMA.test(b.texto)) {
      assert.ok(
        b.base && b.base.trim().length > 0,
        `${b.id}: el texto cita una norma y no declara \`base\`. Sin eso nadie puede comprobarla antes de publicar`,
      )
    }
  }
})

// El enlace propio, si lo hay, apunta a la web de la correduría. Un post que
// manda tráfico al CRM de Manuel o a la landing vieja de plataforma reparte la
// señal de marca justo al revés de lo que se pretende.
test('los enlaces propios van al dominio canónico', () => {
  for (const b of BORRADORES) {
    if (!b.enlace) continue
    const u = new URL(b.enlace)
    assert.equal(u.protocol, 'https:', `${b.id}: enlace sin https`)
    assert.equal(u.hostname, 'grupoasegura.es', `${b.id}: enlace fuera del dominio canónico (${u.hostname})`)
  }
})

test('revisarBorrador marca limpio lo limpio y sucio lo sucio', () => {
  const limpio = revisarBorrador(BORRADORES[0])
  assert.equal(limpio.limpio, true)
  assert.equal(explicarRevision(limpio), '')

  const sucio = revisarBorrador({
    ...BORRADORES[0],
    id: 'inventado',
    texto: 'Te ahorramos hasta un 40 % y garantizamos el mejor precio.',
  })
  assert.equal(sucio.limpio, false)
  assert.match(explicarRevision(sucio), /ahorro|precio/i)
})
