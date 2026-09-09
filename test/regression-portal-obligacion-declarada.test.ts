// Guardián de la pieza que abre la intranet a quien NO es cliente.
//
// 🚨 Hasta el 07/09/2026 `sincronizarObligacionesDeIdentidad()` abría con
// `if (!c.vinculada) return` y solo recorría las pólizas de la CARTERA. Quien
// no era cliente podía subir su póliza, verla guardada en la bóveda… y no
// tener ningún vencimiento en su calendario. Sin obligación no hay calendario,
// y sin calendario no puede haber aviso: la intranet le enseñaba su póliza
// «controlada» sin que nadie mirase cuándo vence.
//
// Las tres formas de volver a romperlo son MUDAS — ni build, ni typecheck, ni
// excepción — y las tres dejan la pantalla con el mismo aspecto:
//   · mover la llamada DEBAJO del `return` (vuelve a no hacerse nada),
//   · tocar `avisadaAt` en el `update` (se reenvía el aviso en cada visita),
//   · escribir la condición a mano en vez de usar `reparoDeclarada()`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FUENTE = readFileSync(join(import.meta.dirname, '..', 'apps/asegura-portal/lib/obligaciones.ts'), 'utf8')

/**
 * Sin comentarios. Este fichero EXPLICA en prosa que `avisadaAt` no se toca, así
 * que buscar el nombre a pelo casa con la explicación y el cepo pasa siempre —
 * mirando al sitio equivocado, que es la única forma de fallo que no se ve.
 */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** El cuerpo de la función de sincronización, para poder medir el ORDEN. */
function cuerpoSincronizar(): string {
  const i = FUENTE.indexOf('export async function sincronizarObligacionesDeIdentidad')
  assert.notEqual(i, -1, 'ya no existe sincronizarObligacionesDeIdentidad')
  const j = FUENTE.indexOf('\n}', i)
  assert.notEqual(j, -1, 'no se encuentra el final de la función')
  return FUENTE.slice(i, j)
}

test('las pólizas SUBIDAS se sincronizan ANTES del corte por vínculo', () => {
  // No basta con que la llamada exista: tiene que ejecutarse antes del
  // `return`. Debajo, el código sigue estando y no hace nada — que es
  // exactamente el estado del que se viene.
  const cuerpo = cuerpoSincronizar()
  const declaradas = cuerpo.indexOf('opsDeDeclaradas(identidadId)')
  const corte = cuerpo.indexOf('if (!c.vinculada) return')
  assert.notEqual(declaradas, -1, 'la sincronización ya no mira las pólizas declaradas')
  assert.notEqual(corte, -1, 'ya no existe el corte por vínculo: revisa este guardián')
  assert.ok(
    declaradas < corte,
    'las pólizas declaradas se sincronizan DESPUÉS del `if (!c.vinculada) return`: quien no es cliente vuelve a quedarse sin calendario',
  )
})

/** El cuerpo entero de `opsDeDeclaradas`, para acotar los dos upserts que trae. */
function cuerpoOpsDeDeclaradas(): string {
  const i = FUENTE.indexOf('async function opsDeDeclaradas')
  assert.notEqual(i, -1, 'ya no existe opsDeDeclaradas')
  const j = FUENTE.indexOf('\n}', FUENTE.indexOf('return ops', i))
  return FUENTE.slice(i, j)
}

test('el upsert de la obligación «poliza» de una declarada NO toca avisadaAt', () => {
  // `avisadaAt` es el sello del envío y esta función corre en CADA carga de la
  // bóveda. Ponerlo en el `update` de la RENOVACIÓN —aunque sea a `null`— haría
  // que cada visita volviera a mandar el mismo correo: a diferencia del recibo
  // (ver el test de abajo), esta fecha no avanza sola en cada sincronización.
  const cuerpo = cuerpoOpsDeDeclaradas()
  const iPoliza = cuerpo.indexOf("tipo: 'poliza'")
  const iRecibo = cuerpo.indexOf("tipo: 'recibo'")
  assert.notEqual(iPoliza, -1, 'ya no se genera la obligación de tipo poliza')
  assert.notEqual(iRecibo, -1, 'ya no se genera la obligación de tipo recibo: revisa este guardián')
  const bloque = sinComentarios(cuerpo.slice(iPoliza, iRecibo))
  assert.ok(!/avisadaAt/.test(bloque), 'el upsert de «poliza» escribe avisadaAt: el aviso de renovación se reenviaría en cada visita a la bóveda')
})

test('el upsert de «recibo» SOLO resetea avisadaAt cuando el cobro cambia de ciclo, nunca sin condición', () => {
  // Al revés que la renovación, esta fecha SÍ avanza sola: en cuanto el cobro
  // de hoy queda atrás, `proximoCobroDeclarado()` ya apunta al siguiente. Sin
  // soltar el sello del ciclo viejo, el del ciclo nuevo nunca se avisaría — el
  // mismo silencio que el test de arriba prohíbe, pero en la dirección
  // contraria. Por eso aquí SÍ tiene que aparecer, y condicionado.
  const cuerpo = cuerpoOpsDeDeclaradas()
  const iRecibo = cuerpo.indexOf("tipo: 'recibo'")
  assert.notEqual(iRecibo, -1, 'ya no se genera la obligación de tipo recibo')
  const bloque = sinComentarios(cuerpo.slice(iRecibo))
  assert.match(
    bloque,
    /esCicloNuevo\s*\?\s*\{\s*avisadaAt:\s*null\s*\}\s*:\s*\{\}/,
    'el reseteo de avisadaAt en el recibo ya no está condicionado al cambio de ciclo (o ha desaparecido)',
  )
})

test('quién avisa lo decide reparoDeclarada(), no una condición escrita aquí', () => {
  const i = FUENTE.indexOf('async function opsDeDeclaradas')
  const j = FUENTE.indexOf('\n}', FUENTE.indexOf('return ops', i))
  const bloque = FUENTE.slice(i, j)
  assert.match(bloque, /reparoDeclarada\(p\)/, 'opsDeDeclaradas ya no usa reparoDeclarada(): la regla se ha duplicado')
  assert.ok(
    !/confirmadaPorUsuario\s*(===|!==|\?|&&|\|\|)/.test(bloque),
    'hay una condición sobre confirmadaPorUsuario escrita a mano: la regla vive en @central/module-seguros-portal, con su test',
  )
})

test('la poda de declaradas no puede llevarse por delante las de la cartera', () => {
  // Un `deleteMany` sin `polizaDeclaradaId: { not: null }` borraría también las
  // obligaciones que vienen de la cartera del cliente — y en la misma llamada
  // que las acaba de crear.
  assert.match(
    FUENTE,
    /deleteMany\(\{\s*where:\s*\{\s*identidadId,\s*polizaDeclaradaId:\s*\{\s*not:\s*null,\s*notIn:\s*avisables\s*\}/,
    'la poda de las declaradas cambió de forma: comprueba que sigue acotada a `polizaDeclaradaId` no nulo',
  )
})

test('el recuento honesto existe y sale de la misma regla', () => {
  // Sin esto, las pólizas que NO generan obligación desaparecen sin dejar
  // rastro y la persona cree que las estamos vigilando.
  assert.match(FUENTE, /export async function reparosDeclaradasDeIdentidad/, 'no hay forma de saber de cuántas pólizas no se puede avisar')
  const i = FUENTE.indexOf('export async function reparosDeclaradasDeIdentidad')
  const bloque = FUENTE.slice(i, FUENTE.indexOf('\n}', i))
  assert.match(bloque, /reparoDeclarada\(p\)/, 'el recuento no usa reparoDeclarada(): diría algo distinto de lo que hace la sincronización')
})

test('toda consulta de este fichero filtra por identidadId', () => {
  // El rol del portal NO tiene RLS: el aislamiento es cosa del código. Una
  // consulta sin `identidadId` no falla, devuelve lo de todo el mundo.
  for (const m of FUENTE.matchAll(/prisma\.portal\w+\.(findMany|deleteMany|upsert)\(\{([\s\S]{0,220})/g)) {
    assert.match(m[2], /identidadId/, `hay un ${m[1]} sin filtrar por identidadId`)
  }
})
