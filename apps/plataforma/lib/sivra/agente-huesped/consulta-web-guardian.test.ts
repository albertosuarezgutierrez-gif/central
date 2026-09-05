import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { tipoHueco } from './reglas.ts'

// Estos dos invariantes viven dentro de `decidir.ts`, que no es importable desde `node --test`
// (arrastra `@/lib/...` y Prisma). Se vigilan leyendo el FUENTE, como `cols-subasta.test.ts`: ni
// `tsc` ni `next build` cazan que alguien quite un término de una expresión booleana.
const FUENTE = readFileSync(new URL('./decidir.ts', import.meta.url), 'utf8')

test('un borrador con datos de internet NUNCA se auto-envía', () => {
  const linea = FUENTE.split('\n').find(l => l.includes('const needs_human ='))
  assert.ok(linea, 'no se encuentra la expresión de needs_human en decidir.ts')
  assert.match(linea!, /webConsultada/, 'needs_human debe incluir webConsultada: lo consultado en internet lo revisa Alberto')
})

test('el texto consultado entra como fuente del guardrail', () => {
  // Si no, `importesNoRespaldados` marcaría como inventado justo el precio que se acaba de verificar
  // y el motivo del aviso diría lo contrario de lo que pasó.
  assert.match(FUENTE, /fuentesConWeb/, 'la 2ª pasada debe revisarse contra las fuentes ampliadas con lo consultado')
})

test('el asunto consultado sigue contando como hueco de guía (si no, no se aprende)', () => {
  const dec = {
    needs_human: true,
    apoyada_en_fuente: false,
    categoria: 'faq',
    sentimiento: 'neutro',
    motivo: 'esto no está en la guía del piso: lo he consultado en internet y he puesto los datos en el borrador — compruébalos en las fuentes antes de enviarlo',
  }
  assert.equal(tipoHueco(dec), 'guia')
  // Y si la búsqueda falló, el diagnóstico es el mismo: el hueco existe igual.
  assert.equal(tipoHueco({ ...dec, motivo: 'esto no está en la guía del piso y NO he podido consultarlo en internet (la búsqueda falló)' }), 'guia')
})

test('el aviso de Telegram declara la búsqueda fallida en vez de callarla', () => {
  const tg = readFileSync(new URL('./telegram-msg.ts', import.meta.url), 'utf8')
  assert.match(tg, /consulta_web === 'fallida'/)
  assert.match(tg, /no lo he podido mirar/)
})
