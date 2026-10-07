// Guardián de los acuerdos con compañías (fase 1, 06/10/2026). `node --test`
// (gate en CI vía `pnpm test:guardia`). Spec:
// docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md
//
// Vigila cuatro cosas que, si se rompen, no dan ningún error:
//   1. Que las cifras de APROMES NO entren en el repo. Su PDF es de uso privado
//      para asociados y prohíbe divulgarlo; un JSON o un .sql con ellas
//      commiteado es una divulgación que no se puede deshacer (queda en la
//      historia de git).
//   2. Que lo cargado nazca SIN COTEJAR y que un % ausente siga siendo NULL.
//   3. Que la carga nunca PISE un acuerdo existente (ni su clave ni su cotejo).
//   4. Que la lectura del puerto filtre por correduría (con BYPASSRLS, olvidarlo
//      no falla: devuelve los acuerdos de otra).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { leerSeedAcuerdos } from '../packages/module-seguros/src/acuerdos.ts'
import {
  convertirExtraccionApromes,
  dentroDelRepo,
  lit,
  main,
  sqlCarga,
  RAIZ_REPO,
} from '../scripts/cargar-acuerdos.mts'

const ROOT = join(import.meta.dirname, '..')
const SEED_DIR = 'apps/asegura/prisma/seed'

/** Lo trackeado Y lo nuevo sin ignorar: lo que está a un `git add` de entrar en el repo. */
function trackeados(): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean)
}

/** Sin comentarios (un comentario que CITA el patrón prohibido no es código). Mismo criterio que regression-asegura-aislamiento. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
}

// ─── 1. Lo privado de APROMES no entra en el repo ────────────────────────────

test('ningún fichero del repo se llama como la extracción de APROMES', () => {
  const sospechosos = trackeados().filter((f) => /apromes/i.test(f) && /\.(json|sql|csv|xlsx?)$/i.test(f))
  assert.deepEqual(sospechosos, [], `ficheros con datos de APROMES en el repo: ${sospechosos.join(', ')}`)
})

test('el seed versionado no trae ningún acuerdo de APROMES', () => {
  const seeds = trackeados().filter((f) => f.startsWith(`${SEED_DIR}/`) && f.endsWith('.json'))
  assert.ok(seeds.length > 0, 'no se ha encontrado el seed: el cepo estaría mirando al vacío')
  for (const f of seeds) {
    const r = leerSeedAcuerdos(JSON.parse(readFileSync(join(ROOT, f), 'utf8')))
    assert.equal(r.estado, 'ok', `${f}: ${r.estado === 'invalido' ? r.errores.join('; ') : ''}`)
    if (r.estado !== 'ok') continue
    const deApromes = r.acuerdos.filter((a) => a.fuente === 'apromes')
    assert.equal(deApromes.length, 0, `${f} lleva ${deApromes.length} acuerdo(s) de APROMES: sus cifras son privadas`)
  }
})

test('el script se niega a escribir el SQL dentro del repo y a leer una extracción de dentro', () => {
  assert.equal(dentroDelRepo(join(RAIZ_REPO, 'apps/asegura/x.sql')), true)
  assert.equal(dentroDelRepo(RAIZ_REPO), true)
  assert.equal(dentroDelRepo(join(tmpdir(), 'x.sql')), false)
  assert.equal(dentroDelRepo(`${RAIZ_REPO}-otro/x.sql`), false, 'un hermano con el mismo prefijo no es el repo')
  const uuid = '00000000-0000-4000-8000-000000000001'
  assert.throws(
    () => main(['--correduria-id', uuid, '--salida', join(RAIZ_REPO, 'carga.sql'), '--seed', `${SEED_DIR}/acuerdos-2026-directo.json`]),
    /FUERA del repo/,
  )
  assert.throws(
    () => main(['--correduria-id', uuid, '--salida', join(tmpdir(), 'carga.sql'), '--apromes', join(RAIZ_REPO, 'apps/x.json'), '--vigencia-desde', '2026-01-01']),
    /DENTRO del repo/,
  )
})

// ─── El seed directo = lo que ya está en `comision_pactada` ──────────────────

test('las 7 líneas del seed directo coinciden con las de la migración de comision_pactada', () => {
  const sql = readFileSync(join(ROOT, 'apps/asegura/prisma/sql/2026-09-28c_comision_pactada.sql'), 'utf8')
  const filasSql = [...sql.matchAll(/\('C0109', '1434', 'RESPONSABILIDAD CIVIL PYME', '([^']+)',\s*'directo', ([\d.]+), ([\d.]+), '2026-10-28'/g)]
    .map((m) => `${m[1]}|${Number(m[2])}|${Number(m[3])}`).sort()
  assert.equal(filasSql.length, 7, 'el patrón no ha encontrado las 7 filas de la migración')
  const seed = leerSeedAcuerdos(JSON.parse(readFileSync(join(ROOT, SEED_DIR, 'acuerdos-2026-directo.json'), 'utf8')))
  assert.equal(seed.estado, 'ok')
  if (seed.estado !== 'ok') return
  const allianz = seed.acuerdos.find((a) => a.compania === 'C0109' && a.fuente === 'directo' && a.vigencia_desde === '2026-10-28')
  assert.ok(allianz, 'falta el acuerdo directo de Allianz en el seed')
  const filasSeed = allianz.comisiones.map((l) => `${l.modalidad}|${l.pct_np}|${l.pct_cartera}`).sort()
  assert.deepEqual(filasSeed, filasSql)
  assert.ok(allianz.comisiones.every((l) => l.producto === '1434'), 'el producto es el código que cruza con CIMA')
})

// ─── 2. Extracción → acuerdos: sin cotejar, NULL ≠ 0, probables señaladas ────

// Datos FICTICIOS: los reales son privados y no pueden aparecer aquí.
const EXTRACCION_FICTICIA = [
  { compania: 'Compañía Ficticia', ramo: 'Hogar', producto: null, comision_np_pct: 21, comision_cartera_pct: null, requisito_apertura: 'Requisito X', contacto: null, notas: 'nota A', pagina_pdf: 3, lectura: 'confirmada' },
  { compania: 'Compañía Ficticia', ramo: 'Transportes', producto: 'Producto Z', comision_np_pct: null, comision_cartera_pct: 0, requisito_apertura: 'Requisito X', contacto: 'Fulano · 600000000', notas: 'nota B', pagina_pdf: 4, lectura: 'probable', objetivos: [{ tipo: 'escalado', tramos: '>10 pólizas: +2', periodo: 'ejercicio 2026', condiciones: 'c' }] },
  { compania: 'APROMES', ramo: 'Condiciones generales', comision_np_pct: null, comision_cartera_pct: null, requisito_apertura: null, contacto: null, notas: 'x', pagina_pdf: 1, lectura: 'confirmada' },
]

test('extracción: un % ausente es NULL y un 0 explícito sigue siendo 0', () => {
  const c = convertirExtraccionApromes(EXTRACCION_FICTICIA, { vigenciaDesde: '2026-01-01', vigenciaHasta: null })
  assert.deepEqual(c.errores, [])
  assert.equal(c.acuerdos.length, 1)
  const [hogar, transportes] = c.acuerdos[0].acuerdo.comisiones
  assert.equal(hogar.pct_np, 21)
  assert.equal(hogar.pct_cartera, null)
  assert.equal(transportes.pct_np, null)
  assert.equal(transportes.pct_cartera, 0)
  assert.equal(hogar.ramo, 'hogar')
  assert.equal(transportes.ramo, null, '«Transportes» es dudoso: no se mapea')
})

test('extracción: lo «probable» queda señalado en la línea y en el acuerdo', () => {
  const c = convertirExtraccionApromes(EXTRACCION_FICTICIA, { vigenciaDesde: '2026-01-01', vigenciaHasta: null })
  const a = c.acuerdos[0].acuerdo
  assert.match(a.comisiones[1].notas ?? '', /LECTURA PROBABLE/)
  assert.doesNotMatch(a.comisiones[0].notas ?? '', /PROBABLE/)
  assert.match(a.letra_pequena ?? '', /1 línea\(s\) con lectura «probable»/)
  assert.match(a.letra_pequena ?? '', /SIN COTEJAR/)
  assert.deepEqual(c.probables, [{ compania: 'Compañía Ficticia', ramo: 'Transportes', pagina: 4 }])
})

test('extracción: objetivos en texto libre van a la letra pequeña, no se inventan como estructurados', () => {
  const c = convertirExtraccionApromes(EXTRACCION_FICTICIA, { vigenciaDesde: '2026-01-01', vigenciaHasta: null })
  const a = c.acuerdos[0].acuerdo
  assert.deepEqual(a.objetivos, [])
  assert.match(a.letra_pequena ?? '', />10 pólizas: \+2/)
  assert.match(a.letra_pequena ?? '', /Fulano/)
  assert.equal(a.clave, null, 'con qué clave se produce lo de APROMES está sin decidir')
  assert.equal(a.requisitos_apertura, 'Requisito X', 'requisitos repetidos se dicen una vez')
  assert.match(a.documento_fuente, /pp\. 3, 4$/)
  assert.deepEqual(c.omitidos.map((o) => o.compania), ['APROMES'])
})

test('extracción: un % con forma de texto es un error, no un 0 ni un null', () => {
  const mal = [{ ...EXTRACCION_FICTICIA[0], comision_np_pct: '21%' }]
  const c = convertirExtraccionApromes(mal, { vigenciaDesde: '2026-01-01', vigenciaHasta: null })
  assert.ok(c.errores.some((e) => /comision_np_pct/.test(e)), c.errores.join('; '))
})

// ─── 3. El SQL: explícito, sin cotejar y sin pisar ───────────────────────────

test('SQL: correduría explícita, revisado_at NULL, ON CONFLICT DO NOTHING y ningún UPDATE/DELETE de acuerdos', () => {
  const c = convertirExtraccionApromes(EXTRACCION_FICTICIA, { vigenciaDesde: '2026-01-01', vigenciaHasta: null })
  const sql = sqlCarga(c.acuerdos, { correduriaId: '00000000-0000-4000-8000-000000000001' })
  assert.match(sql, /'00000000-0000-4000-8000-000000000001'::uuid/)
  assert.match(sql, /raise exception 'La correduría/)
  assert.match(sql, /documento_fuente, revisado_at\)[\s\S]*?, null\n/)
  assert.match(sql, /on conflict \(correduria_id, compania_codigo_dgs, fuente, vigencia_desde\) do nothing/)
  assert.doesNotMatch(sql, /\b(update|delete from)\s+seguros\.(acuerdos_compania|acuerdo_comisiones|acuerdo_objetivos|claves_mediador)\b/i)
  assert.match(sql, /null::numeric, 0::numeric/, 'el NULL y el 0 viajan distintos al SQL')
  assert.throws(() => sqlCarga(c.acuerdos, { correduriaId: 'la-unica' }), /uuid/)
})

test('SQL: las comillas se escapan', () => {
  assert.equal(lit("O'Neill"), "'O''Neill'")
  assert.equal(lit(null), 'null')
  assert.throws(() => lit('a\u0000b'))
})

// ─── 4. La lectura del puerto filtra por correduría ──────────────────────────

test('lib/acuerdos.ts: toda lectura filtra por correduriaId y ningún % se rellena con 0', () => {
  const src = sinComentarios(readFileSync(join(ROOT, 'apps/asegura/lib/acuerdos.ts'), 'utf8'))
  const lecturas = src.match(/\.findMany\(\{/g) ?? []
  const filtradas = src.match(/\.findMany\(\{\s*where: \{ correduriaId \}/g) ?? []
  assert.ok(lecturas.length >= 2, 'el cepo no encuentra las lecturas: estaría mirando al sitio equivocado')
  assert.equal(filtradas.length, lecturas.length, 'hay una lectura de acuerdos/claves sin `where: { correduriaId }`')
  assert.doesNotMatch(src, /(\?\?|\|\|)\s*0\b/, 'un % ausente no se convierte en 0')
})

test('la ruta del puerto exige el Bearer del operador y resuelve la correduría', () => {
  const src = readFileSync(join(ROOT, 'apps/asegura/app/api/operador/companias/acuerdos/route.ts'), 'utf8')
  assert.match(src, /if \(!operadorAutorizado\(req\)\)/)
  assert.match(src, /correduriaUnica\(\)/)
  assert.match(src, /acuerdosCartera\(correduria\.id\)/)
  assert.match(src, /registrarErrorCartera\(/)
})
