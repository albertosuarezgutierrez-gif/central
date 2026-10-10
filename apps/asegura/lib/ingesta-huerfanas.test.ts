import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 🪤 Cepos del SQL del vigía de la ingesta.
 *
 * Leen el FUENTE con `readFileSync`, igual que `cartera-filtro.test.ts`, y por
 * las mismas dos razones: lo que vigilan vive dentro de un `$queryRawUnsafe`,
 * donde ni `tsc` ni `next build` miran, e importar `lib/ingesta.ts`
 * arrastraría `./asegura-db` → el cliente de Prisma generado, que tumbaría el
 * job `Tests (packages + guardián)` (corre sin `prisma generate`).
 *
 * Las consultas de este fichero se ejecutaron contra la BD real el 20/09/2026
 * antes de mergear: 88 eventos de huérfana → 7 pólizas pendientes y 7.565,23€
 * (52 ya estaban colgadas), 6 ficheros confirmados con 46 objetos sin guardar,
 * y 563 rutas de cobertura / 457 nunca leídas / 3 entidades.
 */
const FUENTE = readFileSync(join(import.meta.dirname, 'ingesta.ts'), 'utf8')
const RUTA_HUERFANAS = readFileSync(
  join(import.meta.dirname, '..', 'app', 'api', 'operador', 'huerfanas', 'route.ts'),
  'utf8',
)

test('🚨 las huérfanas se cuentan sobre las PENDIENTES, no sobre todo el histórico', () => {
  // Sin esto es un contador monótono: de 88 eventos, 52 correspondían a
  // recibos y siniestros que YA están colgados en la cartera, y el panel
  // llevaba `degradada` permanente por una pérdida en gran parte cerrada.
  const consulta = FUENTE.slice(FUENTE.indexOf('const huerfanasRaw'))
    .slice(0, FUENTE.slice(FUENTE.indexOf('const huerfanasRaw')).indexOf('`)'))
  assert.match(consulta, /sqlHuerfanasPendientes\(\)/)
  assert.match(consulta, /FROM pendientes/)
})

test('las RESOLUBLES se cuentan sobre el mismo conjunto que el total', () => {
  // Con criterios distintos saldría «7 huérfanas, 20 de ellas ya en cartera»,
  // que además de imposible manda a reprocesar cosas ya hechas.
  const consulta = FUENTE.slice(FUENTE.indexOf('const resolublesRaw'))
    .slice(0, FUENTE.slice(FUENTE.indexOf('const resolublesRaw')).indexOf('`)'))
  assert.match(consulta, /sqlHuerfanasPendientes\(\)/)
  assert.match(consulta, /FROM pendientes/)
})

test('🚨 el descarte es por OBJETO concreto, no por «la póliza tiene recibos»', () => {
  // Una póliza con cuatro recibos de los que uno se perdió sigue teniendo un
  // recibo perdido: mirar solo si la póliza tiene recibos lo taparía.
  assert.match(FUENTE, /r\.id_recibo = c\.id_recibo/)
  assert.match(FUENTE, /s\.id_siniestro_entidad = c\.id_siniestro/)
})

test('la LISTA del puerto usa el MISMO criterio que el recuento', () => {
  // Si divergen, el aviso dice «7 pólizas» y enseña 24 — o pide a la compañía
  // pólizas cuyos recibos ya están dentro.
  assert.match(RUTA_HUERFANAS, /sqlHuerfanasPendientes\('AND e\.correduria_id = \$1::uuid'\)/)
  assert.match(RUTA_HUERFANAS, /FROM pendientes c/)
})

test('🚨 los ficheros parciales se leen del EVENTO, no de `cima_ficheros`', () => {
  // `polizas_count`/`polizas_persisted` acaban reescritas a 44/44 en el mismo
  // fichero cuyo parte dice 40 de 44: un vigía montado sobre esas columnas
  // sale verde el 100% de las veces.
  const bloque = FUENTE.slice(FUENTE.indexOf('const parciales = await leerONull'))
  assert.match(bloque, /FROM operational_events/)
  assert.doesNotMatch(bloque.slice(0, bloque.indexOf('`)')), /polizas_persisted/)
})

test('🚨 se queda el ÚLTIMO parte de cada fichero, y la identidad es el NOMBRE EIAC', () => {
  // El mismo fichero re-leído emite otro `xmlHash` (medido: `13489fbf…` el
  // 15/09 y `17022c62…` el 17/09 para `C0468_M00171_POL_199_…`), así que
  // agrupar por hash lo contaba dos veces; y sumar eventos sin agrupar contaba
  // las mismas 4 pólizas en cada pasada.
  const bloque = FUENTE.slice(FUENTE.indexOf('const parciales = await leerONull'))
  assert.match(bloque, /DISTINCT ON \(e\.payload->>'nombreFichero'\)/)
  assert.match(bloque, /ORDER BY e\.payload->>'nombreFichero', e\.occurred_at DESC/)
})

test('🚨 un cierre manual POSTERIOR al último parte apaga el fichero', () => {
  // El rescate del 24/09/2026 (`ingerir-manual` / `cima-rescate-lote`) metió
  // los 46 objetos sin emitir parte nuevo, y el aviso los siguió cantando como
  // pérdida irreversible. El cierre es un `cima_residuo_resuelto_manual` con
  // el `ficheroId`, y solo cuenta si es POSTERIOR: uno viejo no tapa un parte
  // nuevo que vuelva a dejar objetos en revisión.
  const bloque = FUENTE.slice(FUENTE.indexOf('const parciales = await leerONull'))
  const consulta = bloque.slice(0, bloque.indexOf('`)'))
  assert.match(consulta, /NOT EXISTS[\s\S]*event_name = 'cima_residuo_resuelto_manual'/)
  assert.match(consulta, /cf\.id::text = r\.payload->>'ficheroId'/)
  assert.match(consulta, /r\.occurred_at > u\.occurred_at/)
})

test('las claves de recuento se suman por SUFIJO, y `zipEntryCount` queda fuera', () => {
  // Las claves son por tipo de objeto (`polizasReview`, `recibosReview`…): con
  // una lista cerrada, un tipo nuevo se perdería en silencio. Y `zipEntryCount`
  // también acaba en `Count` sin ser un objeto EIAC.
  const bloque = FUENTE.slice(FUENTE.indexOf('const parciales = await leerONull'))
  assert.match(bloque, /p\.key LIKE '%Review'/)
  assert.match(bloque, /p\.key <> 'zipEntryCount'/)
})

test('🚨 la cobertura cuenta RUTAS distintas, no filas', () => {
  // 755 filas para 563 rutas: la tabla es única por (correduria, tipo,
  // entidad, ruta), así que contar filas multiplica el campo por el número de
  // compañías que lo mandan.
  const bloque = FUENTE.slice(FUENTE.indexOf('const cobertura = await leerONull'))
  assert.match(bloque, /GROUP BY tipo_objeto, ruta/)
  assert.match(bloque, /bool_or\(ultima_vez_leido IS NOT NULL\)/)
})

test('y viaja de cuántas compañías sale la cifra', () => {
  const bloque = FUENTE.slice(FUENTE.indexOf('const cobertura = await leerONull'))
  assert.match(bloque, /COUNT\(DISTINCT codigo_entidad\)/)
  assert.match(bloque, /entidadesObservadas:/)
})

test('📭 emisiones sin aviso: emitidas, fuera de las 24 h y SIN ningún evento del webhook', () => {
  // Caso del 28/09/2026: cuatro emitidas, cero eventos (el receptor daba 401).
  // Sin el NOT EXISTS la señal cantaría todas las emisiones; sin la ventana de
  // 30 días, una emisión vieja sin aviso alarmaría para siempre.
  const bloque = FUENTE.slice(FUENTE.indexOf('const emisionesSinAviso = await leerONull'))
  const consulta = bloque.slice(0, bloque.indexOf('`, String(HORAS_EMISION_SIN_AVISO))'))
  assert.match(consulta, /p\.estado = 'emitida'/)
  assert.match(consulta, /NOT EXISTS[\s\S]*codeoscopic_webhook_events w[\s\S]*w\.project_id_codeoscopic = p\.project_id_codeoscopic/)
  assert.match(consulta, /p\.updated_at > now\(\) - interval '30 days'/)
})

test('🔁 duplicadas vivas: solo NO fusionadas, con DGS, por correduría, y sin los pares marcados', () => {
  // 04/10/2026: tras fusionar 13 pares de Allianz quedaban grupos vivos con el
  // mismo número y DGS. Sin `merged_into_poliza_id IS NULL` contaría las lápidas
  // recién fusionadas; sin `correduria_id` en el grupo fundiría dos corredurías;
  // sin leer las marcas, el par ya decidido volvería a salir cada mañana.
  const bloque = FUENTE.slice(FUENTE.indexOf('const polizasDuplicadas = await leerONull'))
  const tramo = bloque.slice(0, bloque.indexOf('const fila = huerfanasRaw[0]'))
  assert.match(tramo, /leerParesNoDuplicado\(\)/)
  assert.match(tramo, /if \(noDuplicados === null\) throw/)
  assert.match(tramo, /gruposVivosDuplicados\(await leerFichasCandidatasDuplicadas\(\), noDuplicados\)/)
  // La consulta es la COMPARTIDA con la pantalla (un solo criterio).
  const ch = readFileSync(join(import.meta.dirname, 'cartera-historial.ts'), 'utf8')
  const lec = ch.slice(ch.indexOf('export async function leerFichasCandidatasDuplicadas'))
  const where = lec.slice(lec.indexOf('where: {'), lec.indexOf('select: {'))
  assert.match(where, /mergedIntoPolizaId: null,/)
  assert.match(where, /codigoEntidadDgs: \{ not: null \},/)
  // 🚨 Fichas de cliente descartadas fuera, en pantalla Y vigía (la misma consulta).
  assert.match(where, /cliente: \{ activo: true \},/)
  assert.match(where, /\.\.\.\(correduriaId \? \{ correduriaId \} : \{\}\)/)
  // Y viaja en la respuesta (si no, plataforma lo leería como «no se pide»).
  assert.match(FUENTE, /return \{\s*polizasDuplicadas,/)
})

test('🔁 pantalla «Duplicadas» = vigía: misma consulta y mismo criterio', () => {
  const ch = readFileSync(new URL('./cartera-historial.ts', import.meta.url), 'utf8')
  const tramo = ch.slice(ch.indexOf('export async function duplicadasCartera'))
  assert.match(FUENTE, /import \{ leerFichasCandidatasDuplicadas \} from '\.\/cartera-historial'/)
  assert.match(tramo, /polizasDuplicadas\(await leerFichasCandidatasDuplicadas\(correduriaId\), noDuplicados\)/)
  assert.match(tramo, /if \(noDuplicados === null\) return null/)
  // Nada de filtros propios de la pantalla (cartera viva…): eso eran dos criterios.
  assert.doesNotMatch(tramo, /findMany|WHERE_CARTERA_VIVA/)
})

test('🧯 el parcial se apaga si la cuarentena se reprocesó con sello fiable (>= asegura#877)', () => {
  const ini = FUENTE.indexOf("e.event_name = 'cima_fichero_persistido_parcial'")
  const consulta = FUENTE.slice(ini, FUENTE.indexOf('ORDER BY en_revision DESC', ini))
  assert.match(consulta, /FROM cima_cuarentena_crudo q/)
  assert.match(consulta, /q\.nombre_fichero = u\.fichero/)
  assert.match(consulta, /q\.reprocesado_at > u\.occurred_at/)
  assert.match(consulta, /q\.reprocesado_at >= \$1::timestamptz/)
  // La fecha de corte es la del merge de #877 y viaja como parámetro.
  assert.match(FUENTE, /CUARENTENA_SELLO_FIABLE_DESDE = '2026-10-03T15:59:56Z'/)
  assert.match(FUENTE, /, CUARENTENA_SELLO_FIABLE_DESDE\)\n/)
})
