import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * La pantalla de la correduría y la ficha de póliza con el criterio de la ficha
 * del cliente (24/09/2026): cinco pestañas, «Hoy» sin bloques vacíos, las
 * renovaciones paginadas, y UN solo estilo de panel.
 *
 * Lee el fuente: lo que se vigila es estructura, no datos.
 */
const DIR = join(import.meta.dirname, '..', 'apps', 'plataforma', 'app', '(usuario)', 'correduria')
const leer = (rel: string) => readFileSync(join(DIR, rel), 'utf8')

test('las pestañas antiguas no tienen panel propio: viven como bloques con ancla en «Más»', () => {
  const src = leer('CorreduriaClient.tsx')
  for (const viejo of ['Actividad', 'Datos', 'Ingesta', 'Redes']) {
    assert.ok(!src.includes(`aria-label="${viejo}"`), `sigue existiendo el panel «${viejo}»: la barra volvería a tener ocho pestañas`)
  }
  assert.match(src, /aria-label="Más"/)
  for (const b of ['ingesta', 'redes', 'datos', 'actividad']) {
    assert.match(src, new RegExp(`<SubMas id="${b}"`), `falta el ancla del bloque «${b}»: ?s=${b} abriría «Más» sin bajar a nada`)
  }
})

test('el badge de «Más» suma la ingesta, el blog y la calidad del dato', () => {
  const src = leer('CorreduriaClient.tsx')
  // Si se cae uno de los tres, una avería de CIMA o un artículo esperando tu OK
  // dejarían de verse desde las otras pestañas.
  assert.match(src, /combinarContadores\(\[cIngesta, cDatos, [^\]]*nBlog/)
})

test('las colas de «Hoy» que se leen y están vacías no ocupan sitio', () => {
  const sus = leer('Sustituciones.tsx')
  assert.ok(!sus.includes('Sin sustituciones pendientes'), 'Sustituciones vuelve a pintar un bloque para decir que no hay nada')
  assert.match(sus, /if \(filas\.length === 0\) return null/)
  // Las declaradas solo se callan si TAMPOCO hay pólizas sin vincular: esas
  // son trabajo (identificar a la persona) aunque la lista de llamadas esté vacía.
  assert.match(leer('DeclaradasVencer.tsx'), /if \(!hayTrabajo && sinVincular === 0\) return null/)
})

test('las renovaciones de la ventana entera se pintan paginadas y apiladas en móvil', () => {
  const src = leer('Renovaciones.tsx')
  assert.match(src, /ordenadas\.slice\(0, ver\)\.map/, 'la lista de 90 días vuelve a montar todas las filas de golpe')
  assert.match(src, /className="tabla-polizas"/)
})

test('la ficha de póliza usa el panel de la ficha del cliente, no uno propio', () => {
  const src = leer('poliza/[id]/page.tsx')
  assert.ok(!/const tarjeta\s*[:=]/.test(src), 'la póliza vuelve a definir su propio estilo de tarjeta')
  assert.ok(!/function Tarjeta\(/.test(src), 'la póliza vuelve a definir su propia Tarjeta')
  assert.match(src, /from '\.\.\/\.\.\/cliente\/\[id\]\/piezas'/)
  // Recibos: los antiguos plegados (sin montar) y la tabla apilada en móvil.
  assert.match(src, /RECIBOS_VISIBLES/)
  assert.match(src, /className="tabla-polizas"/)
})

test('la ficha de póliza pone arriba lo que se consulta y pliega lo ocasional', () => {
  const src = leer('poliza/[id]/page.tsx')
  const pos = (s: string) => {
    const i = src.indexOf(s)
    assert.ok(i >= 0, `no está «${s}»`)
    return i
  }
  assert.ok(pos('<Recibos p={p} />') < pos('<Siniestros'), 'recibos van antes que siniestros')
  assert.ok(pos('<Siniestros') < pos('<Coberturas'), 'siniestros van antes que coberturas')
  assert.ok(pos('<Coberturas') < pos('<Plegable titulo="Intervinientes"'), 'lo plegado va al final')
  for (const t of ['Evolución de la prima', 'Historial del riesgo', 'Lo que dice la compañía por CIMA']) {
    assert.match(src, new RegExp(`<Plegable titulo="${t}"`), `«${t}» ya no va plegado`)
  }
})
