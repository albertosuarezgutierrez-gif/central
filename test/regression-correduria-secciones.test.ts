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

test('la ficha de póliza son ACCESOS: coberturas, recibos y siniestros se despliegan al pulsar', () => {
  // Alberto, 24/09/2026: «pincho en la póliza y me aparecen coberturas, recibos, siniestros,
  // y ya dentro de cada uno la información». Si alguien vuelve a apilar los bloques, la póliza
  // vuelve a ser una columna de quince tarjetas.
  const src = leer('poliza/[id]/page.tsx')
  assert.match(src, /<PanelAccesos inicial=\{v \?\? null\} accesos=\{accesosPoliza\(p, cancelada\)\} \/>/)
  for (const id of ['coberturas', 'recibos', 'siniestros', 'documentos', 'gestion']) {
    assert.match(src, new RegExp(`id: '${id}'`), `falta el acceso «${id}»`)
  }
  // Los bloques viven DENTRO de su acceso, no sueltos en la página.
  const cuerpo = src.slice(src.indexOf('export default async function PolizaPage'), src.indexOf('function accesosPoliza'))
  for (const bloque of ['<Recibos p={p} />', '<Coberturas', '<Siniestros']) {
    assert.ok(!cuerpo.includes(bloque), `«${bloque}» vuelve a pintarse suelto en la página`)
  }
})

test('el panel de accesos solo monta el abierto', () => {
  const src = leer('Accesos.tsx')
  assert.match(src, /\{actual && \(/, 'el contenido se monta solo para el acceso abierto')
  assert.ok(!/accesos\.map\(a => a\.contenido\)/.test(src), 'montar todos los contenidos crearía el DOM de las diez secciones')
})

test('la ficha del cliente enseña sus seguros en tres cubos y el seguimiento va dentro de la oportunidad', () => {
  const page = leer('cliente/[id]/page.tsx')
  assert.match(page, /repartirSegurosCliente\(/)
  assert.match(page, /\{tab === 'resumen' && \(\s*<SegurosCliente/)
  const seguros = leer('cliente/[id]/SegurosCliente.tsx')
  for (const cubo of ['Con nosotros', 'Oportunidades', 'Ya no existe']) assert.ok(seguros.includes(cubo), `falta el cubo «${cubo}»`)
  assert.match(seguros, /href = `\/correduria\/cliente\/\$\{ctx\.clienteId\}\?tab=oportunidades&op=\$\{o\.id\}`/, 'la tarjeta de oportunidad lleva a su seguimiento, desplegado en la ficha')
  // El seguimiento se gestiona DENTRO de la ficha (25/09/2026); la página suelta solo redirige.
  const ops = leer('cliente/[id]/OportunidadesCliente.tsx')
  assert.match(ops, /\{desplegada && <SeguimientoOportunidad /, 'la fila de la oportunidad despliega su seguimiento')
  assert.match(ops, /useSearchParams\(\)\.get\('op'\)/, '`?op=<id>` deja desplegada esa oportunidad')
  assert.match(leer('oportunidad/[id]/page.tsx'), /redirect\(`\/correduria\/cliente\/.*op=/, 'la ruta vieja lleva a la ficha')
  // Tres estados: un fallo al leer las oportunidades se dice, no se lee como «no tiene».
  assert.match(seguros, /!reparto\.oportunidadesLeidas/)
})
