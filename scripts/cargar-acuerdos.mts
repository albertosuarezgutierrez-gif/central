#!/usr/bin/env node
// Genera el SQL que carga acuerdos con compañías en `seguros.acuerdos_compania`
// + `seguros.acuerdo_comisiones` (+ `acuerdo_objetivos`). NO toca la BD: escribe
// un .sql que se revisa y se ejecuta a mano (MCP `execute_sql` o psql) DESPUÉS de
// aplicar apps/asegura/prisma/sql/2026-10-06_seguros_acuerdos_companias.sql.
// Spec: docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md §5.
//
// Dos entradas:
//   --seed <json>     el seed versionado del repo (apps/asegura/prisma/seed/*.json,
//                     formato `leerSeedAcuerdos`). Hoy: las 7 líneas directas de Allianz.
//   --apromes <json>  la extracción del PDF de APROMES (218 registros
//                     {compania, ramo, producto?, comision_np_pct, comision_cartera_pct,
//                     objetivos?, requisito_apertura, contacto, notas, pagina_pdf, lectura}).
//
// 🔒 El PDF de APROMES es de uso PRIVADO para asociados y prohíbe divulgarlo: sus
// cifras NO pueden acabar en el repo. Por eso con `--apromes` la ENTRADA y la
// SALIDA tienen que estar FUERA del repo, y el script se niega si no lo están.
// (Con `--seed` la salida también va fuera: el .sql generado es un artefacto, no
// fuente.)
//
// Reglas que aplica (las de la casa, no opciones):
//   · Todo nace SIN COTEJAR (`revisado_at` NULL). Lo `lectura: "probable"` queda
//     señalado en las `notas` de su línea Y en la letra pequeña del acuerdo.
//   · NULL ≠ 0: un % que la extracción no trae va NULL, jamás 0.
//   · El ramo literal se mapea a `tipo_seguro` solo por coincidencia exacta
//     (`ramoDesdeTexto`); lo dudoso va NULL (se pinta, no calcula).
//   · Los objetivos de la extracción son TEXTO libre (tramos «>10 pólizas: hasta
//     30%», periodo «ejercicio 2026»): no se inventan tipo/ámbito/base/fechas para
//     meterlos en `acuerdo_objetivos`. Van a la letra pequeña, y se estructuran
//     después desde la pantalla. Lo mismo el contacto (texto sin estructurar).
//   · `clave_id` NULL: con qué clave produce Alberto lo de APROMES está sin
//     decidir (decisión 06/10/2026) → productividad «pendiente».
//   · La compañía se resuelve EN LA BD contra `seguros.companias_dgs` por nombre
//     normalizado (o por `--mapa`). La que no está en el catálogo NO se carga y
//     sale en el informe final; no se da de alta una compañía con un código DGS
//     supuesto.
//   · Idempotente y conservador: si el acuerdo (correduría, compañía, fuente,
//     vigencia_desde) ya existe, NO se pisa — ni sus líneas, ni su clave, ni su
//     cotejo. Para recargar uno, se borra a mano antes.
//   · `correduria_id` EXPLÍCITO por argumento (y el SQL comprueba que existe): el
//     aislamiento multi-tenant no se deja a «la única que hay».
//
// Vive en `scripts/` y no en `apps/asegura/` a propósito: no es código de la app
// ni consulta la BD (no pasa por `lib/tenant`), solo emite texto SQL con la
// correduría que se le da.
//
// Uso:
//   node scripts/cargar-acuerdos.ts --correduria-id <uuid> --salida /tmp/x.sql \
//     --seed apps/asegura/prisma/seed/acuerdos-2026-directo.json
//   node scripts/cargar-acuerdos.ts --correduria-id <uuid> --salida /tmp/y.sql \
//     --apromes /ruta/fuera/del/repo/acuerdos-apromes-2026.extraccion.json \
//     --vigencia-desde 2026-01-01 [--vigencia-hasta 2026-12-31] [--mapa mapa.json]
//   (`--mapa` = {"Nombre en la extracción": "C0157", …} para lo que no casa por nombre.)

import { readFileSync, writeFileSync, realpathSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  leerSeedAcuerdos,
  ramoDesdeTexto,
  type SeedAcuerdo,
  type SeedComision,
} from '../packages/module-seguros/src/acuerdos.ts'

export const RAIZ_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const DOCUMENTO_APROMES = 'Condiciones_2026_Aseguradoras_mayo.pdf (APROMES, uso privado de asociados)'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

// ─── Rutas: lo privado no entra en el repo ───────────────────────────────────

/** ¿`ruta` cae dentro del repo? Resuelve symlinks del directorio existente más cercano. */
export function dentroDelRepo(ruta: string, raiz: string = RAIZ_REPO): boolean {
  let abs = resolve(ruta)
  // Resolver symlinks de la parte que exista (la salida aún no existe).
  let base = abs
  const resto: string[] = []
  while (!existsSync(base) && dirname(base) !== base) {
    resto.unshift(base.slice(dirname(base).length + 1))
    base = dirname(base)
  }
  try { abs = join(realpathSync(base), ...resto) } catch { /* se queda como estaba */ }
  let r = raiz
  try { r = realpathSync(raiz) } catch { /* idem */ }
  const rel = relative(r, abs)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

// ─── Extracción de APROMES → SeedAcuerdo[] ───────────────────────────────────

export type RegistroExtraccion = {
  compania: string
  ramo: string
  producto?: string | null
  comision_np_pct: number | null
  comision_cartera_pct: number | null
  objetivos?: Array<Record<string, unknown>> | null
  requisito_apertura: string | null
  contacto: string | null
  notas: string | null
  pagina_pdf: number
  paginas_pdf_adicionales?: number[]
  lectura: string
}

export type Omitido = { compania: string; ramo: string; motivo: string }

/**
 * Un acuerdo listo para cargar + cómo se llama su compañía. En el seed del repo
 * `nombre` es el propio código DGS; en la extracción de APROMES es el nombre tal
 * cual lo escribe el PDF, y el código se resuelve EN LA BD (ver `sqlCarga`).
 */
export type AcuerdoACargar = { acuerdo: SeedAcuerdo; nombre: string }

export type ConversionApromes = {
  acuerdos: AcuerdoACargar[]
  omitidos: Omitido[]
  /** Registros con `lectura` distinta de «confirmada» (señalados, no descartados). */
  probables: Array<{ compania: string; ramo: string; pagina: number }>
  errores: string[]
}

/** Registros que NO son de una compañía (la propia asociación). */
const NO_COMPANIA = new Set(['apromes'])

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

function numeroPctOError(v: unknown, donde: string, errores: string[]): number | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    errores.push(`${donde}: no es un número (${JSON.stringify(v)})`)
    return null
  }
  return v
}

function describirObjetivo(o: Record<string, unknown>): string {
  return Object.entries(o)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' · ')
}

export function convertirExtraccionApromes(
  json: unknown,
  opciones: { vigenciaDesde: string; vigenciaHasta: string | null; documento?: string },
): ConversionApromes {
  const errores: string[] = []
  const omitidos: Omitido[] = []
  const probables: ConversionApromes['probables'] = []
  if (!Array.isArray(json)) return { acuerdos: [], omitidos, probables, errores: ['la extracción no es una lista'] }

  const porCompania = new Map<string, RegistroExtraccion[]>()
  json.forEach((r, i) => {
    if (typeof r !== 'object' || r === null) { errores.push(`registro ${i}: no es un objeto`); return }
    const reg = r as RegistroExtraccion
    const compania = texto(reg.compania)
    const ramo = texto(reg.ramo)
    if (!compania || !ramo) { errores.push(`registro ${i}: sin compañía o sin ramo`); return }
    if (typeof reg.pagina_pdf !== 'number') errores.push(`registro ${i} (${compania}): sin pagina_pdf`)
    if (NO_COMPANIA.has(compania.toLowerCase())) {
      omitidos.push({ compania, ramo, motivo: 'registro de la propia asociación, no de una compañía' })
      return
    }
    if (reg.lectura !== 'confirmada') probables.push({ compania, ramo, pagina: reg.pagina_pdf })
    const lista = porCompania.get(compania) ?? []
    lista.push(reg)
    porCompania.set(compania, lista)
  })

  const documento = opciones.documento ?? DOCUMENTO_APROMES
  const acuerdos: AcuerdoACargar[] = []
  for (const [compania, regs] of porCompania) {
    const paginas = [...new Set(regs.flatMap((r) => [r.pagina_pdf, ...(r.paginas_pdf_adicionales ?? [])]))]
      .filter((p) => typeof p === 'number').sort((a, b) => a - b)

    const comisiones: SeedComision[] = regs.map((r, j) => {
      const donde = `${compania} · ${r.ramo}`
      const probable = r.lectura !== 'confirmada'
      const notas = [
        probable ? `⚠️ LECTURA ${String(r.lectura).toUpperCase()} — no confirmada en el PDF.` : null,
        `[p. ${r.pagina_pdf}]`,
        texto(r.notas),
      ].filter(Boolean).join(' ')
      return {
        ramo: ramoDesdeTexto(r.ramo),
        ramo_texto: r.ramo.trim(),
        producto: texto(r.producto),
        modalidad: null,
        pct_np: numeroPctOError(r.comision_np_pct, `${donde} [${j}] comision_np_pct`, errores),
        pct_cartera: numeroPctOError(r.comision_cartera_pct, `${donde} [${j}] comision_cartera_pct`, errores),
        notas,
      }
    })

    const requisitos = [...new Set(regs.map((r) => texto(r.requisito_apertura)).filter((x): x is string => x !== null))]
    const objetivos = regs.flatMap((r) =>
      (Array.isArray(r.objetivos) ? r.objetivos : []).map((o) => `«${r.ramo.trim()}» [p. ${r.pagina_pdf}]: ${describirObjetivo(o)}`),
    )
    const contactos = [...new Set(regs.map((r) => texto(r.contacto)).filter((x): x is string => x !== null))]
    const nProbables = regs.filter((r) => r.lectura !== 'confirmada').length

    const letra = [
      'Extracto SIN COTEJAR con el PDF.',
      nProbables > 0 ? `⚠️ ${nProbables} línea(s) con lectura «probable»: ver sus notas.` : null,
      objetivos.length > 0 ? `Objetivos/rappels (texto del extracto, sin estructurar):\n- ${objetivos.join('\n- ')}` : null,
      contactos.length > 0 ? `Contacto (texto del extracto, sin estructurar): ${contactos.join(' | ')}` : null,
    ].filter(Boolean).join('\n')

    acuerdos.push({ nombre: compania, acuerdo: {
      compania: '',            // se resuelve en la BD por nombre (ver `sqlCarga`)
      fuente: 'apromes',
      fuente_nombre: null,
      clave: null,
      vigencia_desde: opciones.vigenciaDesde,
      vigencia_hasta: opciones.vigenciaHasta,
      requisitos_apertura: requisitos.length > 0 ? requisitos.join(' · ') : null,
      letra_pequena: letra,
      documento_fuente: `${documento}, pp. ${paginas.join(', ')}`,
      comisiones,
      objetivos: [],
    } })
  }

  // Misma validación que el seed del repo (rangos de %, fechas, duplicados…).
  // El código DGS se valida aparte: aquí aún es un nombre.
  const val = leerSeedAcuerdos({
    version: 1,
    acuerdos: acuerdos.map((x, i) => ({ ...x.acuerdo, compania: `Z${String(i).padStart(4, '0')}` })),
  })
  if (val.estado !== 'ok') errores.push(...val.errores)

  return { acuerdos, omitidos, probables, errores }
}

// ─── SeedAcuerdo[] → SQL ─────────────────────────────────────────────────────

/** Literal SQL de texto. `null` → NULL. Rechaza NUL (Postgres no lo admite). */
export function lit(v: string | null): string {
  if (v === null) return 'null'
  if (v.includes('\u0000')) throw new Error('texto con carácter NUL')
  return `'${v.replace(/'/g, "''")}'`
}

function num(v: number | null): string {
  if (v === null) return 'null::numeric'
  if (!Number.isFinite(v)) throw new Error(`número no finito: ${v}`)
  return `${v}::numeric`
}

function fechaSql(v: string | null): string {
  if (v === null) return 'null::date'
  if (!RE_FECHA.test(v)) throw new Error(`fecha inválida: ${v}`)
  return `'${v}'::date`
}

/** Variantes normalizadas de un nombre para casar con `companias_dgs.nombre_comun`. */
export function variantesNombre(nombre: string): string[] {
  const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  const sinRelleno = base.replace(/\b(grupo|seguros|s\.?a\.?)\b/g, ' ').replace(/\s+/g, ' ').trim()
  return [...new Set([base, sinRelleno].filter((s) => s !== ''))]
}

// Misma normalización en SQL (sin depender de la extensión unaccent).
const SQL_NORMALIZAR = (expr: string) =>
  `regexp_replace(translate(lower(trim(${expr})), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'), '\\s+', ' ', 'g')`

export type OpcionesSql = {
  correduriaId: string
  /** Nombre → código DGS fijado a mano (para lo que no casa por nombre). */
  mapa?: Record<string, string>
}

/**
 * El código DGS sale, por este orden, de `--mapa`, del propio `acuerdo.compania`
 * (seed del repo) o del catálogo por nombre normalizado, resuelto EN LA BD.
 */
export function sqlCarga(lista: readonly AcuerdoACargar[], o: OpcionesSql): string {
  if (!RE_UUID.test(o.correduriaId)) throw new Error('correduria_id no es un uuid')
  const cor = `'${o.correduriaId}'::uuid`
  const out: string[] = []
  out.push('-- Generado por scripts/cargar-acuerdos.ts. Revisar antes de ejecutar.')
  out.push('-- Todo entra SIN COTEJAR (revisado_at NULL). Un acuerdo que ya existe NO se pisa.')
  out.push('begin;')
  out.push('')
  out.push(`do $$ begin`)
  out.push(`  if not exists (select 1 from seguros.corredurias where id = ${cor}) then`)
  out.push(`    raise exception 'La correduría ${o.correduriaId} no existe: no se carga nada';`)
  out.push(`  end if;`)
  out.push(`end $$;`)
  out.push('')

  // Tabla de resolución nombre → código, una fila por acuerdo.
  out.push('create temp table _carga_companias (n int primary key, nombre text not null, variantes text[] not null, codigo varchar(16)) on commit drop;')
  const filas = lista.map(({ acuerdo: a, nombre }, i) => {
    const fijado = o.mapa?.[nombre] ?? (/^[A-Z]\d{4}$/.test(a.compania) ? a.compania : null)
    const variantes = `array[${variantesNombre(nombre).map(lit).join(', ')}]::text[]`
    return `  (${i}, ${lit(nombre)}, ${variantes}, ${fijado === null ? 'null' : lit(fijado)})`
  })
  if (filas.length > 0) {
    out.push(`insert into _carga_companias (n, nombre, variantes, codigo) values\n${filas.join(',\n')};`)
    out.push(`do $$ declare r record; begin`)
    out.push(`  for r in select t.nombre, count(*) c from _carga_companias t join seguros.companias_dgs d`)
    out.push(`    on t.codigo is null and ${SQL_NORMALIZAR('d.nombre_comun')} = any(t.variantes)`)
    out.push(`    group by t.nombre having count(*) > 1 loop`)
    out.push(`    raise exception 'La compañía «%» casa con % filas de companias_dgs: fíjala con --mapa', r.nombre, r.c;`)
    out.push(`  end loop;`)
    out.push(`end $$;`)
    out.push(`update _carga_companias t set codigo = d.codigo_dgs from seguros.companias_dgs d`)
    out.push(`  where t.codigo is null and ${SQL_NORMALIZAR('d.nombre_comun')} = any(t.variantes);`)
  }
  out.push('')

  lista.forEach(({ acuerdo: a, nombre }, i) => {
    out.push(`-- ${nombre} · ${a.fuente} · desde ${a.vigencia_desde} · ${a.comisiones.length} línea(s)`)
    const ctes: string[] = []
    ctes.push(
      `a as (\n  insert into seguros.acuerdos_compania (correduria_id, compania_codigo_dgs, fuente, fuente_nombre, clave_id, ` +
      `vigencia_desde, vigencia_hasta, requisitos_apertura, letra_pequena, documento_fuente, revisado_at)\n` +
      `  select ${cor}, t.codigo, ${lit(a.fuente)}, ${lit(a.fuente_nombre)}, null, ${fechaSql(a.vigencia_desde)}, ` +
      `${fechaSql(a.vigencia_hasta)}, ${lit(a.requisitos_apertura)}, ${lit(a.letra_pequena)}, ${lit(a.documento_fuente)}, null\n` +
      `  from _carga_companias t where t.n = ${i} and t.codigo is not null\n` +
      `  on conflict (correduria_id, compania_codigo_dgs, fuente, vigencia_desde) do nothing\n  returning id\n)`,
    )
    if (a.comisiones.length > 0) {
      const valores = a.comisiones.map((l) =>
        `    (${l.ramo === null ? 'null::seguros.tipo_seguro' : `${lit(l.ramo)}::seguros.tipo_seguro`}, ${lit(l.ramo_texto)}::text, ` +
        `${lit(l.producto)}::text, ${lit(l.modalidad)}::text, ${num(l.pct_np)}, ${num(l.pct_cartera)}, ${lit(l.notas)}::text)`,
      )
      ctes.push(
        `l as (\n  insert into seguros.acuerdo_comisiones (acuerdo_id, ramo, ramo_texto, producto, modalidad, pct_np, pct_cartera, notas)\n` +
        `  select a.id, v.* from a cross join (values\n${valores.join(',\n')}\n  ) v(ramo, ramo_texto, producto, modalidad, pct_np, pct_cartera, notas)\n  returning 1\n)`,
      )
    }
    if (a.objetivos.length > 0) {
      const valores = a.objetivos.map((ob) =>
        `    (${lit(ob.tipo)}::text, ${lit(ob.ambito)}::text, ${lit(ob.base)}::text, ${lit(ob.criterio_cobro)}::text, ` +
        `array[${ob.ramos.map(lit).join(', ')}]::seguros.tipo_seguro[], ${fechaSql(ob.periodo_desde)}, ${fechaSql(ob.periodo_hasta)}, ` +
        `${lit(JSON.stringify(ob.tramos))}::jsonb, ${num(ob.siniestralidad_max_pct)}, ${lit(ob.condiciones)}::text)`,
      )
      ctes.push(
        `o as (\n  insert into seguros.acuerdo_objetivos (acuerdo_id, tipo, ambito, base, criterio_cobro, ramos, periodo_desde, periodo_hasta, tramos, siniestralidad_max_pct, condiciones)\n` +
        `  select a.id, v.* from a cross join (values\n${valores.join(',\n')}\n  ) v(tipo, ambito, base, criterio_cobro, ramos, periodo_desde, periodo_hasta, tramos, siniestralidad_max_pct, condiciones)\n  returning 1\n)`,
      )
    }
    out.push(`with ${ctes.join(',\n')}\nselect count(*) from a;`)
    out.push('')
  })

  out.push('-- Informe: qué se ha cargado, qué ya existía (no se pisa) y qué compañía no está en el catálogo.')
  // Sin `on commit drop`: se lee DESPUÉS del commit (hay clientes que solo
  // enseñan el resultado de la última sentencia).
  out.push(`create temp table _carga_informe as`)
  out.push(`  select t.nombre, t.codigo,`)
  out.push(`    case when t.codigo is null then 'SIN COMPAÑÍA EN companias_dgs: NO cargado'`)
  out.push(`         when ac.created_at = now() then 'cargado (sin cotejar)'`)
  out.push(`         when ac.id is not null then 'ya existía: NO se ha pisado'`)
  out.push(`         else 'no cargado' end as resultado,`)
  out.push(`    (select count(*) from seguros.acuerdo_comisiones l where l.acuerdo_id = ac.id) as lineas`)
  out.push(`  from _carga_companias t`)
  out.push(`  left join seguros.acuerdos_compania ac on ac.correduria_id = ${cor} and ac.compania_codigo_dgs = t.codigo`)
  // fuente/vigencia de cada fila: todas las de una pasada comparten fuente, pero el seed puede mezclar vigencias
  out.push(`    and (ac.fuente, ac.vigencia_desde) in (${lista.length > 0
    ? [...new Set(lista.map(({ acuerdo: a }) => `(${lit(a.fuente)}, ${fechaSql(a.vigencia_desde)})`))].join(', ')
    : `(null::text, null::date)`});`)
  out.push('commit;')
  out.push(`select * from _carga_informe order by resultado, nombre;`)
  out.push('')
  return out.join('\n')
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function argumentos(argv: string[]): Map<string, string> {
  const m = new Map<string, string>()
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (!k.startsWith('--')) throw new Error(`argumento inesperado: ${k}`)
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`falta el valor de ${k}`)
    m.set(k.slice(2), v)
    i++
  }
  return m
}

export function main(argv: string[]): number {
  const a = argumentos(argv)
  const correduriaId = a.get('correduria-id')
  const salida = a.get('salida')
  if (!correduriaId || !RE_UUID.test(correduriaId)) throw new Error('--correduria-id <uuid> es obligatorio')
  if (!salida) throw new Error('--salida <ruta.sql> es obligatoria')
  if (dentroDelRepo(salida)) {
    throw new Error(`--salida tiene que estar FUERA del repo (${RAIZ_REPO}): el .sql generado no se versiona`)
  }
  const mapa = a.has('mapa') ? (JSON.parse(readFileSync(a.get('mapa')!, 'utf8')) as Record<string, string>) : undefined

  let acuerdos: AcuerdoACargar[]
  if (a.has('seed') === a.has('apromes')) throw new Error('usa UNA de --seed <json> o --apromes <json>')
  if (a.has('seed')) {
    const r = leerSeedAcuerdos(JSON.parse(readFileSync(a.get('seed')!, 'utf8')))
    if (r.estado !== 'ok') throw new Error(`seed inválido:\n  - ${r.errores.join('\n  - ')}`)
    acuerdos = r.acuerdos.map((x) => ({ acuerdo: x, nombre: x.compania }))
  } else {
    const entrada = a.get('apromes')!
    if (dentroDelRepo(entrada)) {
      throw new Error('la extracción de APROMES está DENTRO del repo: es privada y no puede versionarse. Muévela fuera.')
    }
    const desde = a.get('vigencia-desde')
    if (!desde || !RE_FECHA.test(desde)) throw new Error('--vigencia-desde YYYY-MM-DD es obligatoria con --apromes (la extracción no da fecha)')
    const hasta = a.get('vigencia-hasta') ?? null
    if (hasta !== null && !RE_FECHA.test(hasta)) throw new Error('--vigencia-hasta tiene que ser YYYY-MM-DD')
    const c = convertirExtraccionApromes(JSON.parse(readFileSync(entrada, 'utf8')), { vigenciaDesde: desde, vigenciaHasta: hasta })
    if (c.errores.length > 0) throw new Error(`extracción inválida:\n  - ${c.errores.join('\n  - ')}`)
    acuerdos = c.acuerdos
    console.log(`${c.acuerdos.length} compañías · ${c.acuerdos.reduce((s, x) => s + x.acuerdo.comisiones.length, 0)} líneas`)
    for (const p of c.probables) console.log(`  ⚠️ lectura probable: ${p.compania} · ${p.ramo} (p. ${p.pagina})`)
    for (const om of c.omitidos) console.log(`  · omitido: ${om.compania} · ${om.ramo} — ${om.motivo}`)
  }

  writeFileSync(salida, sqlCarga(acuerdos, { correduriaId, mapa }), { mode: 0o600 })
  console.log(`SQL escrito en ${salida} (${acuerdos.length} acuerdos). Revísalo y ejecútalo tras aplicar la migración.`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`)
    process.exitCode = 1
  }
}
