// Guardián de la lectura del PR del blog.
//
// Lo que se vigila aquí es que la pantalla de aprobación no pueda decir tres
// cosas que serían falsas: que hay un texto cuando no lo hay, que un PR está
// bloqueado cuando GitHub aún no lo ha mirado, y que un fallo de merge es
// «algo ha ido mal» cuando GitHub ha dicho exactamente qué.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extraerArticuloDePr, estadoPr, explicarEstadoPr, motivoMerge, decidirBlogPr, MARCA_INI, MARCA_FIN,
} from './blog-pr.ts'

test('el texto del artículo se extrae de entre las marcas', () => {
  const cuerpo = `Cabecera del PR\n\n${MARCA_INI}\nTitular\n\nUn párrafo.\n${MARCA_FIN}\n\nPie`
  assert.equal(extraerArticuloDePr(cuerpo), 'Titular\n\nUn párrafo.')
})

// 🚨 EL cepo. Sin marcas NO hay texto, y eso no es un texto vacío: es que no se
// puede enseñar. Un recuadro en blanco junto a un botón «Publicar» invita a
// aprobar a ciegas, que es justo lo que esta pantalla existe para impedir.
test('sin marcas (o vacío entre ellas) devuelve null, nunca cadena vacía', () => {
  assert.equal(extraerArticuloDePr('Un PR normal sin marcas'), null)
  assert.equal(extraerArticuloDePr(null), null)
  assert.equal(extraerArticuloDePr(undefined), null)
  assert.equal(extraerArticuloDePr(''), null)
  assert.equal(extraerArticuloDePr(`${MARCA_INI}\n   \n${MARCA_FIN}`), null)
  // Marcas en orden inverso = cuerpo manipulado: tampoco se inventa nada.
  assert.equal(extraerArticuloDePr(`${MARCA_FIN}texto${MARCA_INI}`), null)
})

test('los estados de merge que GitHub SÍ ha calculado se traducen', () => {
  assert.equal(estadoPr({ mergeable: true, mergeable_state: 'clean' }), 'listo')
  assert.equal(estadoPr({ mergeable: false, mergeable_state: 'dirty' }), 'conflicto')
  assert.equal(estadoPr({ mergeable: true, mergeable_state: 'blocked' }), 'checks')
  assert.equal(estadoPr({ mergeable: true, mergeable_state: 'unstable' }), 'checks')
  assert.equal(estadoPr({ mergeable: true, mergeable_state: 'behind' }), 'desactualizada')
  assert.equal(estadoPr({ mergeable: true, mergeable_state: 'clean', draft: true }), 'borrador')
})

// 🚨 El segundo cepo. `mergeable: null` es «GitHub aún lo está calculando», y es
// lo que devuelve SIEMPRE la lista de PRs recién abiertos. Colapsarlo con
// «bloqueado» escondería un artículo listo detrás de un aviso falso.
test('lo que GitHub no ha calculado es «no comprobado», no un bloqueo', () => {
  assert.equal(estadoPr({ mergeable: null, mergeable_state: 'unknown' }), 'no_comprobado')
  assert.equal(estadoPr({}), 'no_comprobado')
  assert.equal(estadoPr({ mergeable: null }), 'no_comprobado')
  // Y su frase no puede decir que no se puede publicar.
  const frase = explicarEstadoPr('no_comprobado').toLowerCase()
  assert.ok(!frase.includes('no se puede'), `la frase desanima a intentarlo: «${frase}»`)
  assert.ok(frase.includes('prueba') || frase.includes('intenta'), 'no invita a intentarlo')
})

test('cada estado tiene una frase propia', () => {
  const estados = ['listo', 'checks', 'conflicto', 'desactualizada', 'borrador', 'no_comprobado'] as const
  const frases = estados.map(explicarEstadoPr)
  assert.equal(new Set(frases).size, estados.length, 'dos estados dicen lo mismo')
  for (const f of frases) assert.ok(f.trim().length > 15, `frase demasiado corta: «${f}»`)
})

// Los tres fallos de merge se arreglan en tres sitios distintos (esperar, tocar
// GitHub, tocar Vercel). Un mensaje único obligaría a abrir GitHub para saber cuál.
test('el rechazo de GitHub dice DÓNDE mirar', () => {
  assert.match(motivoMerge(405, 'Pull Request has merge conflicts'), /conflicto/i)
  assert.match(motivoMerge(405, '12 of 12 required status checks are expected'), /check/i)
  assert.match(motivoMerge(403, 'Resource not accessible by integration'), /permiso/i)
  assert.match(motivoMerge(404, 'Not Found'), /ya no existe/i)
  assert.match(motivoMerge(500, 'boom'), /500/)
  const todos = [
    motivoMerge(405, 'Pull Request has merge conflicts'),
    motivoMerge(405, 'required status checks'),
    motivoMerge(403, 'x'),
  ]
  assert.equal(new Set(todos).size, 3, 'dos rechazos distintos dicen lo mismo')
})

// 🚨 `decidirBlogPr` es la única puerta de mezcla/cierre, la comparten /correduria
// y el botón de Telegram. Su guarda (¿es un PR DE `claude/blog-asegura`?) es lo
// que impide que este endpoint compartido mezcle cualquier PR abierto del repo
// por número — se comprueba que de verdad frena, no solo que exista la rama del
// código feliz.
function conFetchSimulado<T>(respuestas: Record<string, () => { ok: boolean; status: number; json?: unknown; text?: string }>, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch
  // @ts-expect-error — stub deliberado para el test
  globalThis.fetch = async (url: string, init?: { method?: string }) => {
    const metodo = init?.method || 'GET'
    const clave = `${metodo} ${url}`
    const entrada = Object.entries(respuestas).find(([k]) => clave.includes(k))
    if (!entrada) throw new Error(`fetch no simulado: ${clave}`)
    const r = entrada[1]()
    return {
      ok: r.ok,
      status: r.status,
      json: async () => r.json,
      text: async () => r.text ?? '',
    } as Response
  }
  return fn().finally(() => { globalThis.fetch = original })
}

test('decidirBlogPr RECHAZA un PR que no es de la rama del agente (no lo mezcla ni lo cierra)', async () => {
  let tocoMerge = false
  const r = await conFetchSimulado(
    {
      'GET https://api.github.com/repos/albertosuarezgutierrez-gif/central/pulls/999': () => ({
        ok: true, status: 200, json: { head: { ref: 'otra-rama-cualquiera' }, title: 'PR ajeno' },
      }),
      'PUT https://api.github.com/repos/albertosuarezgutierrez-gif/central/pulls/999/merge': () => {
        tocoMerge = true
        return { ok: true, status: 200, json: {} }
      },
    },
    () => decidirBlogPr(999, 'publicar', 'token-falso'),
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.motivo, /no es del agente del blog/i)
  assert.equal(tocoMerge, false, 'la guarda no frenó: llegó a intentar mezclar un PR ajeno')
})

test('decidirBlogPr PUBLICA con squash cuando el PR sí es de la rama del agente', async () => {
  const r = await conFetchSimulado(
    {
      'GET https://api.github.com/repos/albertosuarezgutierrez-gif/central/pulls/123': () => ({
        ok: true, status: 200, json: { head: { ref: 'claude/blog-asegura' }, title: 'blog: artículo' },
      }),
      'PUT https://api.github.com/repos/albertosuarezgutierrez-gif/central/pulls/123/merge': () => ({
        ok: true, status: 200, json: { merged: true },
      }),
    },
    () => decidirBlogPr(123, 'publicar', 'token-falso'),
  )
  assert.deepEqual(r, { ok: true, accion: 'publicar' })
})

test('decidirBlogPr DESCARTA cerrando el PR, sin tocar el endpoint de merge', async () => {
  let tocoMerge = false
  const r = await conFetchSimulado(
    {
      'GET https://api.github.com/repos/albertosuarezgutierrez-gif/central/pulls/123': () => ({
        ok: true, status: 200, json: { head: { ref: 'claude/blog-asegura' }, title: 'blog: artículo' },
      }),
      'PATCH https://api.github.com/repos/albertosuarezgutierrez-gif/central/pulls/123': () => ({
        ok: true, status: 200, json: { state: 'closed' },
      }),
      'PUT https://api.github.com/repos/albertosuarezgutierrez-gif/central/pulls/123/merge': () => {
        tocoMerge = true
        return { ok: true, status: 200, json: {} }
      },
    },
    () => decidirBlogPr(123, 'descartar', 'token-falso'),
  )
  assert.deepEqual(r, { ok: true, accion: 'descartar' })
  assert.equal(tocoMerge, false)
})
