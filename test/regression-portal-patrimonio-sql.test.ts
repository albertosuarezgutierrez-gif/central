// Cepo del SQL de PATRIMONIO del portal (Fase 1, paso 3, 22/10/2026).
//
// `prisma_asegura_portal` NO tiene BYPASSRLS ni RLS que rescate un olvido: lo que se le concede es lo que
// puede hacer con los datos de TODOS los clientes. Este cepo lee el SQL (sin comentarios) y el schema y vigila:
//   1. cada tabla `portal_patrimonio_*` le revoca TODO a `crm_seguros` (los inquilinos no son leads);
//   2. al portal solo se le concede por COLUMNAS, y nunca DELETE (se archiva/anula/descarta);
//   3. el modelo Prisma de cada tabla es ESPEJO EXACTO de su GRANT SELECT (una columna de más = 42501 en
//      TODA consulta del modelo; una de menos = una columna que el código cree que no existe);
//   4. un `@default` de Prisma (que el CLIENTE rellena) solo en columnas que el rol puede INSERTAR;
//   5. la PII cifrada del inquilino jamás se concede al portal ni aparece en su schema;
//   6. lo APPEND-ONLY no se reescribe (índices: el portal solo lee; renta aplicada: sin UPDATE);
//   7. el dinero (`*_cent`) es `bigint` en BD y `BigInt` en el schema;
//   8. los alcances `patrimonio_*` entran en el CHECK de la BD sin perder ninguno y NO en `ALCANCES`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = new URL('..', import.meta.url).pathname
// Paso 3 (tablas) + paso 8 (documentos, 22/10/2026): el barrido y el espejo con el schema cubren los dos ficheros.
const SQL_DOCUMENTO = readFileSync(join(RAIZ, 'apps/asegura-portal/prisma/sql/2026-10-22_portal_patrimonio_documento.sql'), 'utf8').replace(/--.*$/gm, '')
// Enlace inmueble ↔ póliza (24/10/2026, P10): columnas nuevas en dos tablas ya existentes; entra en el mismo espejo.
const RUTA_ENLACE = 'apps/asegura-portal/prisma/sql/2026-10-24_portal_patrimonio_enlace_poliza.sql'
const SQL_ENLACE = readFileSync(join(RAIZ, RUTA_ENLACE), 'utf8').replace(/--.*$/gm, '')
// Tope de renta editable por el cliente (24/10/2026, P13/P14): columnas nuevas en `contrato`; mismo espejo.
const SQL_TOPE = readFileSync(join(RAIZ, 'apps/asegura-portal/prisma/sql/2026-10-24_portal_patrimonio_tope_renta.sql'), 'utf8').replace(/--.*$/gm, '')
// Obligaciones PROPIAS del cliente (25/10/2026): columna `categoria` en la tabla de obligaciones ya existente.
const RUTA_PROPIA = 'apps/asegura-portal/prisma/sql/2026-10-25_portal_patrimonio_obligacion_propia.sql'
const SQL_PROPIA = readFileSync(join(RAIZ, RUTA_PROPIA), 'utf8').replace(/--.*$/gm, '')
// «Hipoteca» en el catálogo de las propias (27/10/2026): el CHECK vigente del catálogo pasa a ser el `_v2` de este fichero.
const RUTA_PROPIA_HIPOTECA = 'apps/asegura-portal/prisma/sql/2026-10-27_portal_patrimonio_obligacion_hipoteca.sql'
const SQL_PROPIA_HIPOTECA = readFileSync(join(RAIZ, RUTA_PROPIA_HIPOTECA), 'utf8').replace(/--.*$/gm, '')
// Caché del Catastro y presidente de comunidad (25/10/2026): columnas nuevas en `inmueble`; mismo espejo.
const SQL_CATASTRO = readFileSync(join(RAIZ, 'apps/asegura-portal/prisma/sql/2026-10-25_portal_patrimonio_catastro_comunidad.sql'), 'utf8').replace(/--.*$/gm, '')
// «¿Tiene hipoteca?» (25/10/2026): columna `hipoteca` en el inmueble; mismo espejo.
const RUTA_HIPOTECA = 'apps/asegura-portal/prisma/sql/2026-10-25_portal_patrimonio_hipoteca.sql'
const SQL_HIPOTECA = readFileSync(join(RAIZ, RUTA_HIPOTECA), 'utf8').replace(/--.*$/gm, '')
// Importar desde Excel/CSV (26/10/2026, P18): columnas nuevas en `importacion`; mismo espejo.
const RUTA_IMPORTACION = 'apps/asegura-portal/prisma/sql/2026-10-26_portal_patrimonio_importacion_fichero.sql'
const SQL_IMPORTACION = readFileSync(join(RAIZ, RUTA_IMPORTACION), 'utf8').replace(/--.*$/gm, '')
const SQL_INQUILINO = readFileSync(join(RAIZ, 'apps/asegura-portal/prisma/sql/2026-10-26_portal_patrimonio_inquilino_acceso.sql'), 'utf8').replace(/--.*$/gm, '')
// Edificio sin división horizontal (27/10/2026): columnas nuevas en `inmueble`; mismo espejo. Su cepo propio (FK compuesta,
// un solo borrado, catálogos) es `test/regression-portal-patrimonio-edificio.test.ts`.
const SQL_EDIFICIO = readFileSync(join(RAIZ, 'apps/asegura-portal/prisma/sql/2026-10-27_portal_patrimonio_edificio_unidades.sql'), 'utf8').replace(/--.*$/gm, '')
// Volcado inicial (27/10/2026): columna `volcado` en `importacion`; mismo espejo.
const RUTA_VOLCADO = 'apps/asegura-portal/prisma/sql/2026-10-27_portal_patrimonio_volcado.sql'
const SQL_VOLCADO = readFileSync(join(RAIZ, RUTA_VOLCADO), 'utf8').replace(/--.*$/gm, '')
// Recomendación entre propietarios (27/10/2026): tabla nueva; mismo espejo.
const RUTA_RECOMENDACION = 'apps/asegura-portal/prisma/sql/2026-10-27_portal_patrimonio_recomendacion.sql'
const SQL_RECOMENDACION = readFileSync(join(RAIZ, RUTA_RECOMENDACION), 'utf8').replace(/--.*$/gm, '')
const SQL = [
  readFileSync(join(RAIZ, 'apps/asegura-portal/prisma/sql/2026-10-22_portal_patrimonio.sql'), 'utf8').replace(/--.*$/gm, ''),
  SQL_DOCUMENTO,
  SQL_ENLACE,
  SQL_TOPE,
  SQL_PROPIA,
  SQL_CATASTRO,
  SQL_HIPOTECA,
  SQL_IMPORTACION,
  SQL_INQUILINO,
  SQL_EDIFICIO,
  SQL_VOLCADO,
  SQL_RECOMENDACION,
].join('\n')
const SCHEMA = readFileSync(join(RAIZ, 'apps/asegura-portal/prisma/schema.prisma'), 'utf8')
const ROL = 'prisma_asegura_portal'

const TABLAS = [...SQL.matchAll(/CREATE TABLE IF NOT EXISTS seguros\.(portal_patrimonio_[a-z_]+)/g)].map((m) => m[1])

function lista(s: string): string[] {
  return s.split(',').map((c) => c.trim()).filter(Boolean)
}

/** Columnas concedidas al portal por privilegio y tabla (GRANT por columnas). */
function concedidas(priv: 'SELECT' | 'INSERT' | 'UPDATE', tabla: string): Set<string> | null {
  const re = new RegExp(`GRANT\\s+${priv}\\s*\\(([^)]*)\\)\\s+ON\\s+seguros\\.${tabla}\\s+TO\\s+${ROL}\\b`, 'gi')
  const ms = [...SQL.matchAll(re)]
  if (ms.length === 0) return null
  return new Set(ms.flatMap((m) => lista(m[1])))
}

interface Campo { nombre: string; columna: string; tipo: string; defaultCliente: boolean; linea: string }

/** Modelo Prisma mapeado a `tabla` → campos ESCALARES (las relaciones no son columnas). */
function modeloDe(tabla: string): { nombre: string; campos: Campo[] } | null {
  for (const m of SCHEMA.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    if (!new RegExp(`@@map\\("${tabla}"\\)`).test(m[2])) continue
    const campos: Campo[] = []
    for (const bruta of m[2].split('\n')) {
      const l = bruta.trim()
      if (!l || l.startsWith('//') || l.startsWith('@@')) continue
      const [nombre, tipoBruto] = l.split(/\s+/)
      const tipo = tipoBruto.replace(/[?[\]]/g, '')
      if (!['String', 'Int', 'BigInt', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes'].includes(tipo)) continue
      const map = /@map\("([^"]+)"\)/.exec(l)
      const def = /@default\((.*)\)/.exec(l)
      campos.push({
        nombre,
        columna: map ? map[1] : nombre,
        tipo,
        defaultCliente: !!def && !/^dbgenerated\(/.test(def[1]),
        linea: l,
      })
    }
    return { nombre: m[1], campos }
  }
  return null
}

test('el SQL crea las tablas de §4 de la spec (y es transaccional)', () => {
  for (const t of [
    'titular', 'inmueble', 'comunidad', 'inmueble_comunidad', 'inquilino', 'contrato', 'contrato_inquilino',
    'renta_actualizacion', 'plantilla_gasto', 'gasto', 'derrama', 'indice', 'importacion', 'importacion_fila',
    'obligacion', 'enlace_inquilino', 'aviso_inquilino', 'inmueble_poliza', 'documento',
  ]) assert.ok(TABLAS.includes(`portal_patrimonio_${t}`), `falta portal_patrimonio_${t}`)
  assert.match(SQL, /^BEGIN;/m)
  assert.match(SQL, /^COMMIT;/m)
})

test('🚨 cada tabla de patrimonio le revoca TODO a crm_seguros', () => {
  const faltan = TABLAS.filter((t) => !new RegExp(`REVOKE ALL ON seguros\\.${t} FROM crm_seguros`, 'i').test(SQL))
  assert.deepEqual(faltan, [])
})

test('🚨 al portal: solo GRANT por columnas y jamás DELETE', () => {
  const malos: string[] = []
  for (const m of SQL.matchAll(new RegExp(`GRANT\\s+([^;]*?)\\s+ON\\s+(?:TABLE\\s+)?seguros\\.(portal_patrimonio_\\w+)\\s+TO\\s+${ROL}\\b`, 'gi'))) {
    const privs = m[1]
    if (/DELETE|\bALL\b|TRUNCATE/i.test(privs)) malos.push(`${m[2]}: ${privs}`)
    if (!/^(SELECT|INSERT|UPDATE)\s*\(/i.test(privs)) malos.push(`${m[2]}: GRANT de TABLA «${privs}»`)
  }
  assert.deepEqual(malos, [])
})

test('🚨 cada modelo PortalPatrimonio* es espejo EXACTO del GRANT SELECT de su tabla', () => {
  const errores: string[] = []
  for (const t of TABLAS) {
    const modelo = modeloDe(t)
    const select = concedidas('SELECT', t)
    if (!modelo) { errores.push(`${t}: sin modelo en schema.prisma`); continue }
    if (!select) { errores.push(`${t}: sin GRANT SELECT al portal`); continue }
    const cols = new Set(modelo.campos.map((c) => c.columna))
    for (const c of cols) if (!select.has(c)) errores.push(`${modelo.nombre}.${c}: declarada sin GRANT SELECT (42501)`)
    for (const c of select) if (!cols.has(c)) errores.push(`${t}.${c}: concedida pero el modelo no la declara`)
  }
  const modelos = [...SCHEMA.matchAll(/^model (PortalPatrimonio\w+) \{/gm)].map((m) => m[1])
  assert.equal(modelos.length, TABLAS.length, 'un modelo PortalPatrimonio* por tabla, ni más ni menos')
  assert.deepEqual(errores, [])
})

test('un @default de Prisma (lo rellena el cliente) solo donde el rol puede INSERTAR; nada de @updatedAt', () => {
  const errores: string[] = []
  for (const t of TABLAS) {
    const modelo = modeloDe(t)
    if (!modelo) continue
    const insert = concedidas('INSERT', t) ?? new Set<string>()
    for (const c of modelo.campos) {
      if (c.defaultCliente && !insert.has(c.columna)) errores.push(`${modelo.nombre}.${c.nombre}: @default del cliente sin GRANT INSERT`)
      if (/@updatedAt/.test(c.linea)) errores.push(`${modelo.nombre}.${c.nombre}: @updatedAt (lo pone el trigger)`)
    }
    for (const priv of ['INSERT', 'UPDATE'] as const) {
      const cs = concedidas(priv, t)
      if (cs?.has('actualizado_en') || cs?.has('id') || cs?.has('creado_en')) errores.push(`${t}: ${priv} de id/creado_en/actualizado_en`)
    }
  }
  assert.deepEqual(errores, [])
})

test('🚨 la PII cifrada del inquilino no se concede al portal ni está en su schema', () => {
  for (const priv of ['SELECT', 'INSERT', 'UPDATE'] as const) {
    for (const t of TABLAS) {
      const cs = [...(concedidas(priv, t) ?? [])].filter((c) => /cifrad/.test(c))
      assert.deepEqual(cs, [], `${priv} de ${t} concede PII cifrada al portal`)
    }
  }
  assert.ok(modeloDe('portal_patrimonio_inquilino'))
  const campos = modeloDe('portal_patrimonio_inquilino')!.campos.map((c) => c.columna)
  assert.deepEqual(campos.filter((c) => /cifrad|nif|telefono/.test(c)), [])
  assert.equal(concedidas('INSERT', 'portal_patrimonio_inquilino'), null, 'el alta del inquilino va por el puente')
})

test('lo APPEND-ONLY no se reescribe desde el portal', () => {
  assert.equal(concedidas('INSERT', 'portal_patrimonio_indice'), null, 'el portal no escribe índices')
  assert.equal(concedidas('UPDATE', 'portal_patrimonio_indice'), null)
  assert.equal(concedidas('UPDATE', 'portal_patrimonio_renta_actualizacion'), null, 'una renta aplicada no se reescribe')
  assert.match(SQL, /REVOKE UPDATE, DELETE ON seguros\.portal_patrimonio_indice FROM prisma_seguros/)
  // El estado del aviso del inquilino nace por DEFAULT: la página pública no puede crearlo «cerrado».
  assert.ok(!concedidas('INSERT', 'portal_patrimonio_aviso_inquilino')!.has('estado'))
  assert.ok(!concedidas('INSERT', 'portal_patrimonio_importacion')!.has('estado'))
})

test('el dinero va en céntimos: *_cent es bigint en BD y BigInt en el schema', () => {
  const errores: string[] = []
  for (const m of SQL.matchAll(/^\s+(\w+_cent)\s+(\w+)/gm)) if (m[2] !== 'bigint') errores.push(`${m[1]} es ${m[2]}`)
  for (const t of TABLAS) {
    for (const c of modeloDe(t)?.campos ?? []) if (c.columna.endsWith('_cent') && c.tipo !== 'BigInt') errores.push(`${t}.${c.columna} es ${c.tipo}`)
  }
  assert.deepEqual(errores, [])
  // Brazo de control: si la regex de arriba no casara con nada, el test pasaría sin mirar (hoy son 8).
  assert.ok([...SQL.matchAll(/_cent\s+bigint/g)].length >= 8)
})

test('alcances patrimonio_* en el CHECK de la BD, sin perder ninguno, y fuera de ALCANCES', () => {
  const m = /ADD CONSTRAINT portal_autorizacion_alcance_check\s+CHECK \(alcance IN \(([^)]*)\)\)/.exec(SQL)
  assert.ok(m, 'el SQL no redefine portal_autorizacion_alcance_check')
  const lista = m[1].split(',').map((s) => s.trim().replace(/'/g, ''))
  for (const a of ['ver', 'ver_economico', 'partes', 'documentos', 'gestion', 'total', 'flota', 'patrimonio_gestion', 'patrimonio_total']) {
    assert.ok(lista.includes(a), `el CHECK pierde o no añade «${a}»`)
  }
  assert.match(SQL, /alcance NOT IN \('patrimonio_gestion', 'patrimonio_total'\) OR poliza_id IS NULL/)
  const auto = readFileSync(join(RAIZ, 'packages/module-seguros-portal/src/autorizacion.ts'), 'utf8')
  const alcances = /export const ALCANCES = \[([^\]]*)\]/.exec(auto)
  assert.ok(alcances)
  assert.doesNotMatch(alcances[1], /patrimonio/, 'patrimonio_* NO entra en ALCANCES: abriría la bóveda a los lectores viejos')
})

function bloque(tabla: string): string {
  const m = new RegExp(`CREATE TABLE IF NOT EXISTS seguros\\.${tabla} \\(([\\s\\S]*?)\\n\\);`).exec(SQL)
  assert.ok(m, `no encuentro el CREATE TABLE de ${tabla}`)
  return m[1]
}

test('🚨 la comunidad es de UN titular: nadie lee ni edita la de otro vecino (Alberto, 22/10/2026)', () => {
  assert.match(bloque('portal_patrimonio_comunidad'), /titular_id\s+uuid NOT NULL REFERENCES seguros\.portal_patrimonio_titular/)
  const ic = bloque('portal_patrimonio_inmueble_comunidad')
  assert.match(ic, /FOREIGN KEY \(inmueble_id, titular_id\) REFERENCES seguros\.portal_patrimonio_inmueble \(id, titular_id\)/)
  assert.match(ic, /FOREIGN KEY \(comunidad_id, titular_id\) REFERENCES seguros\.portal_patrimonio_comunidad \(id, titular_id\)/)
  // Ninguna fila se puede mudar de titular desde el portal (eso rompería todas las FK compuestas).
  const mudanzas = TABLAS.filter((t) => concedidas('UPDATE', t)?.has('titular_id'))
  assert.deepEqual(mudanzas, [])
})

test('🚨 importación: `datos` se vacía al confirmar/descartar y no admite datos una vez cerrada', () => {
  assert.match(bloque('portal_patrimonio_importacion_fila'), /^\s+datos\s+jsonb,$/m, '`datos` tiene que ser nullable')
  assert.match(SQL, /UPDATE seguros\.portal_patrimonio_importacion_fila SET datos = NULL\s+WHERE importacion_id = NEW\.id/)
  assert.match(SQL, /AFTER UPDATE OF estado ON seguros\.portal_patrimonio_importacion\s+FOR EACH ROW WHEN \(NEW\.estado IN \('confirmada', 'descartada'\)\)\s+EXECUTE FUNCTION seguros\.portal_patrimonio_importacion_cerrar\(\)/)
  assert.match(SQL, /BEFORE INSERT OR UPDATE OF datos ON seguros\.portal_patrimonio_importacion_fila\s+FOR EACH ROW EXECUTE FUNCTION seguros\.portal_patrimonio_importacion_fila_abierta\(\)/)
  assert.match(SQL, /BEFORE UPDATE OF estado ON seguros\.portal_patrimonio_importacion\s+FOR EACH ROW EXECUTE FUNCTION seguros\.portal_patrimonio_importacion_no_reabrir\(\)/)
  const datos = modeloDe('portal_patrimonio_importacion_fila')!.campos.find((c) => c.columna === 'datos')
  assert.ok(datos && /\bJson\?/.test(datos.linea), 'el modelo tiene que declarar `datos Json?`')
})

test('🚨 documentos (paso 8): un owner del MISMO titular, carpeta de ese owner, sin DELETE y sellado inmutable', async () => {
  const b = bloque('portal_patrimonio_documento')
  for (const o of ['inmueble', 'contrato', 'inquilino']) {
    assert.match(b, new RegExp(`FOREIGN KEY \\(${o}_id, titular_id\\) REFERENCES seguros\\.portal_patrimonio_${o} \\(id, titular_id\\)`), `${o}: FK compuesta al titular`)
  }
  assert.match(b, /num_nonnulls\(inmueble_id, contrato_id, inquilino_id\) = 1/)
  assert.match(b, /size_bytes BETWEEN 1 AND 10485760/)
  assert.match(b, /mime IN \('application\/pdf', 'image\/jpeg', 'image\/png', 'image\/webp'\)/)
  // Solo el sello de borrado se puede actualizar, jamás borrar filas ni mudar de titular/owner.
  assert.deepEqual([...(concedidas('UPDATE', 'portal_patrimonio_documento') ?? [])].sort(), ['borrado_en', 'borrado_por_identidad_id'])
  assert.ok(!concedidas('INSERT', 'portal_patrimonio_documento')!.has('borrado_en'), 'un documento no nace borrado')
  assert.match(SQL_DOCUMENTO, /BEFORE UPDATE ON seguros\.portal_patrimonio_documento\s+FOR EACH ROW EXECUTE FUNCTION seguros\.portal_patrimonio_documento_inmutable\(\)/)
  assert.match(SQL_DOCUMENTO, /OLD\.borrado_en IS NOT NULL AND NEW\.borrado_en IS DISTINCT FROM OLD\.borrado_en/, 'no se desborra')
  assert.match(SQL_DOCUMENTO, /NEW\.contenido IS DISTINCT FROM OLD\.contenido/, 'el fichero no se reescribe')
  // El gasto con fichero lo tiene del MISMO titular (FK compuesta con la columna que ya existía).
  assert.match(SQL_DOCUMENTO, /FOREIGN KEY \(documento_id, titular_id\) REFERENCES seguros\.portal_patrimonio_documento \(id, titular_id\)/)
  // Se aplica ENTERO por el MCP de Supabase, que se cuelga con cualquier DROP (también DROP TRIGGER IF EXISTS): ni uno, ni en comentarios.
  assert.doesNotMatch(readFileSync(join(RAIZ, 'apps/asegura-portal/prisma/sql/2026-10-22_portal_patrimonio_documento.sql'), 'utf8'), /\bDROP\b/i)
  assert.match(SQL_DOCUMENTO, /CREATE OR REPLACE TRIGGER portal_patrimonio_documento_inmutable/)
  // Quién borró: solo en el UPDATE que sella (vivo → borrado), y nunca en un documento vivo.
  assert.match(SQL_DOCUMENTO, /AND NOT \(OLD\.borrado_en IS NULL AND NEW\.borrado_en IS NOT NULL\)/)
  assert.match(b, /CHECK \(borrado_por_identidad_id IS NULL OR borrado_en IS NOT NULL\)/)
})

test('🚨 documentos: las carpetas del CHECK de la BD son EXACTAMENTE las de carpetas.ts, por owner', async () => {
  const { CARPETAS_POR_OWNER } = await import('../apps/asegura-portal/lib/patrimonio/carpetas.ts')
  const b = bloque('portal_patrimonio_documento')
  const check = /carpeta\s+text NOT NULL CHECK \(carpeta IN \(([^)]*)\)\)/.exec(b)
  assert.ok(check, 'no encuentro el CHECK de carpeta')
  const bd = check[1].split(',').map((x) => x.trim().replace(/'/g, '')).sort()
  const codigo = Object.values(CARPETAS_POR_OWNER).flat().map((c) => c.id).sort()
  assert.deepEqual(bd, codigo)
  // Y la carpeta casa con el owner: cada lista del CHECK `carpeta_del_owner` es la de su owner.
  for (const [owner, carpetas] of Object.entries(CARPETAS_POR_OWNER)) {
    const m = new RegExp(`${owner}_id\\s+IS NOT NULL AND carpeta IN \\(([^)]*)\\)`).exec(b)
    assert.ok(m, `falta la carpeta del owner ${owner}`)
    assert.deepEqual(m[1].split(',').map((x) => x.trim().replace(/'/g, '')).sort(), carpetas.map((c) => c.id).sort())
  }
})

test('🚨 enlace inmueble ↔ póliza (24/10/2026): estado/origen cerrados, «no tiene seguro» coherente, sin DROP ni DELETE', () => {
  assert.doesNotMatch(readFileSync(join(RAIZ, RUTA_ENLACE), 'utf8'), /\bDROP\b/i, 'el MCP de Supabase se cuelga con cualquier DROP')
  assert.match(SQL_ENLACE, /^BEGIN;/m)
  assert.match(SQL_ENLACE, /^COMMIT;/m)
  assert.match(SQL_ENLACE, /CHECK \(estado IN \('confirmado', 'rechazado'\)\)/)
  assert.match(SQL_ENLACE, /CHECK \(origen IN \('manual', 'propuesta_refcat', 'propuesta_direccion'\)\)/)
  assert.match(SQL_ENLACE, /CHECK \(sin_seguro_declarado_en IS NOT NULL OR sin_seguro_declarado_por_identidad_id IS NULL\)/)
  // Idempotente: cada CHECK solo si no existe.
  assert.equal([...SQL_ENLACE.matchAll(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = /g)].length, 3)
  // El portal ESCRIBE la decisión al crear el enlace y no la reescribe nunca (cambiar de opinión = archivar + otra).
  const upd = concedidas('UPDATE', 'portal_patrimonio_inmueble_poliza')!
  assert.ok(!upd.has('estado') && !upd.has('origen'), 'estado/origen no se reescriben')
  assert.deepEqual([...upd], ['archivado_en'])
  const ins = concedidas('INSERT', 'portal_patrimonio_inmueble_poliza')!
  assert.ok(ins.has('estado') && ins.has('origen'))
  assert.ok(concedidas('UPDATE', 'portal_patrimonio_inmueble')!.has('sin_seguro_declarado_en'))
  assert.ok(concedidas('SELECT', 'portal_patrimonio_inmueble')!.has('sin_seguro_declarado_por_identidad_id'))
  for (const t of ['portal_patrimonio_inmueble_poliza', 'portal_patrimonio_inmueble']) {
    assert.match(SQL_ENLACE, new RegExp(`REVOKE ALL ON seguros\\.${t} FROM crm_seguros`), t)
  }
  // Los consentimientos de patrimonio son del paso legal (P15), no de este SQL.
  assert.doesNotMatch(SQL_ENLACE, /portal_consentimiento/)
})

test('🚨 obligaciones propias (25/10/2026): SQL aditivo, sin borrados, columna por GRANT y crm_seguros sin nada', () => {
  const crudo = readFileSync(join(RAIZ, RUTA_PROPIA), 'utf8')
  assert.doesNotMatch(crudo, /\bDROP\b/i, 'ni en comentarios: el MCP de Supabase se cuelga')
  assert.doesNotMatch(SQL_PROPIA, /\bDELETE\b|\bTRUNCATE\b/i)
  assert.match(SQL_PROPIA, /^BEGIN;/m)
  assert.match(SQL_PROPIA, /^COMMIT;/m)
  assert.match(SQL_PROPIA, /ADD COLUMN IF NOT EXISTS categoria text/)
  assert.match(SQL_PROPIA, /REVOKE ALL ON seguros\.portal_patrimonio_obligacion FROM crm_seguros/)
  for (const priv of ['SELECT', 'INSERT', 'UPDATE'] as const) {
    assert.ok(concedidas(priv, 'portal_patrimonio_obligacion')!.has('categoria'), `${priv} de categoria`)
  }
  // Una propia no se mete en el CHECK de `tipo` (no se puede ampliar sin borrar la restricción): usa 'otra'.
  assert.match(SQL_PROPIA, /tipo = 'otra' AND vence IS NOT NULL/)
  // El catálogo viejo (25/10) es un SUBCONJUNTO del vigente: ampliar nunca deja fuera una fila ya guardada.
  const m = /categoria IN \(([^)]*)\)/.exec(SQL_PROPIA)
  assert.ok(m)
  const viejo = m[1].split(',').map((x) => x.trim().replace(/'/g, ''))
  for (const c of viejo) assert.ok(catalogoVigente().includes(c), `${c} se perdería al ampliar`)
})

/** El catálogo del CHECK vigente (`_v2`, 27/10/2026). */
function catalogoVigente(): string[] {
  const m = /categoria_catalogo_v2\s+CHECK \(categoria IS NULL OR categoria IN \(([^)]*)\)\)/.exec(SQL_PROPIA_HIPOTECA)
  assert.ok(m, 'el CHECK _v2 del catálogo')
  return m[1].split(',').map((x) => x.trim().replace(/'/g, ''))
}

test('🚨 hipoteca en las propias (27/10/2026): catálogo de BD = el del módulo, se crea el nuevo ANTES de quitar el viejo y nada más', () => {
  // El catálogo de la BD es el del módulo, ni más ni menos (y en el mismo orden).
  const mod = readFileSync(join(RAIZ, 'packages/module-patrimonio/src/obligacion-propia.ts'), 'utf8')
  const enModulo = /CATEGORIAS_OBLIGACION_PROPIA = \[([^\]]*)\]/.exec(mod)
  assert.ok(enModulo)
  assert.deepEqual(catalogoVigente(), enModulo[1].split(',').map((x) => x.trim().replace(/'/g, '')))
  assert.ok(catalogoVigente().includes('hipoteca'))
  // Un CHECK no se amplía sin quitar el viejo: UNA sola sentencia de borrado, y solo de ESA restricción (se aplica
  // desde el editor SQL, no por el MCP; lo dice la cabecera).
  assert.match(readFileSync(join(RAIZ, RUTA_PROPIA_HIPOTECA), 'utf8'), /editor SQL de Supabase, NO por el MCP/i)
  const borrados = [...SQL_PROPIA_HIPOTECA.matchAll(/\bDROP\b[^;]*;/gi)].map((x) => x[0].replace(/\s+/g, ' '))
  assert.deepEqual(borrados, ['DROP CONSTRAINT IF EXISTS portal_patrimonio_obligacion_categoria_catalogo;'])
  assert.doesNotMatch(SQL_PROPIA_HIPOTECA, /\bDELETE\b|\bTRUNCATE\b|\bGRANT\b|\bREVOKE\b|ADD COLUMN|ALTER COLUMN/i)
  assert.match(SQL_PROPIA_HIPOTECA, /^BEGIN;/m)
  assert.match(SQL_PROPIA_HIPOTECA, /^COMMIT;/m)
  assert.ok(SQL_PROPIA_HIPOTECA.indexOf('ADD CONSTRAINT portal_patrimonio_obligacion_categoria_catalogo_v2') < SQL_PROPIA_HIPOTECA.indexOf('DROP CONSTRAINT'))
  // Idempotente: el CHECK nuevo solo si no existe.
  assert.match(SQL_PROPIA_HIPOTECA, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_obligacion_categoria_catalogo_v2'\)/)
})

test('🚨 hipoteca (25/10/2026): SQL aditivo sin borrados, columna por GRANT, catálogo igual al del código y crm_seguros sin nada', () => {
  const crudo = readFileSync(join(RAIZ, RUTA_HIPOTECA), 'utf8')
  assert.doesNotMatch(crudo, /\bDROP\b/i, 'ni en comentarios: el MCP de Supabase se cuelga')
  assert.doesNotMatch(SQL_HIPOTECA, /\bDELETE\b|\bTRUNCATE\b/i)
  assert.match(SQL_HIPOTECA, /^BEGIN;/m)
  assert.match(SQL_HIPOTECA, /^COMMIT;/m)
  assert.match(SQL_HIPOTECA, /ADD COLUMN IF NOT EXISTS hipoteca text/)
  assert.match(SQL_HIPOTECA, /REVOKE ALL ON seguros\.portal_patrimonio_inmueble FROM crm_seguros/)
  const bd = /hipoteca IN \(([^)]*)\)/.exec(SQL_HIPOTECA)
  assert.ok(bd)
  const enCodigo = /RESPUESTAS_HIPOTECA = \[([^\]]*)\]/.exec(readFileSync(join(RAIZ, 'apps/asegura-portal/lib/patrimonio/ofertas.ts'), 'utf8'))
  assert.ok(enCodigo)
  const limpia = (t: string) => t.split(',').map((x) => x.trim().replace(/'/g, ''))
  assert.deepEqual(limpia(bd[1]), limpia(enCodigo[1]))
})

test('🚨 importación Excel/CSV (26/10/2026): SQL aditivo sin borrados, columnas por GRANT, sin FK inventada y crm_seguros sin nada', () => {
  const crudo = readFileSync(join(RAIZ, RUTA_IMPORTACION), 'utf8')
  assert.doesNotMatch(crudo, /\bDROP\b/i, 'ni en comentarios: el MCP de Supabase se cuelga')
  assert.doesNotMatch(SQL_IMPORTACION, /\bDELETE\b|\bTRUNCATE\b/i)
  assert.match(SQL_IMPORTACION, /^BEGIN;/m)
  assert.match(SQL_IMPORTACION, /^COMMIT;/m)
  assert.match(SQL_IMPORTACION, /REVOKE ALL ON seguros\.portal_patrimonio_importacion FROM crm_seguros/)
  for (const c of ['tipo', 'fichero_hash', 'fichero_nombre', 'filas_total', 'resultado']) {
    assert.ok(concedidas('SELECT', 'portal_patrimonio_importacion')!.has(c), `SELECT de ${c}`)
  }
  // `resultado` y `tipo` se actualizan; el hash y el nombre del fichero no se reescriben.
  const upd = concedidas('UPDATE', 'portal_patrimonio_importacion')!
  assert.ok(upd.has('resultado') && upd.has('tipo'))
  assert.ok(!upd.has('fichero_hash') && !upd.has('fichero_nombre'))
  // El catálogo de tipos de la BD es el del módulo.
  const bd = /tipo IN \(([^)]*)\)/.exec(SQL_IMPORTACION)
  assert.ok(bd)
  const mod = /TIPOS_IMPORTACION = \[([^\]]*)\]/.exec(readFileSync(join(RAIZ, 'packages/module-patrimonio/src/importacion.ts'), 'utf8'))
  assert.ok(mod)
  const limpia = (t: string) => t.split(',').map((x) => x.trim().replace(/'/g, ''))
  assert.deepEqual(limpia(bd[1]), limpia(mod[1]))
  // El tope de filas de la BD es el del código.
  assert.match(SQL_IMPORTACION, /BETWEEN 1 AND 500/)
  assert.match(readFileSync(join(RAIZ, 'packages/module-patrimonio/src/importacion.ts'), 'utf8'), /MAX_FILAS_IMPORTACION = 500/)
})

test('🚨 volcado inicial (27/10/2026): SQL aditivo sin borrados, `volcado` solo SELECT/INSERT, sin tipo, y crm_seguros sin nada', () => {
  const crudo = readFileSync(join(RAIZ, RUTA_VOLCADO), 'utf8')
  assert.doesNotMatch(crudo, /\bDROP\b/i, 'ni en comentarios: el MCP de Supabase se cuelga')
  assert.doesNotMatch(SQL_VOLCADO, /\bDELETE\b|\bTRUNCATE\b/i)
  assert.match(SQL_VOLCADO, /^BEGIN;/m)
  assert.match(SQL_VOLCADO, /^COMMIT;/m)
  assert.match(SQL_VOLCADO, /ADD COLUMN IF NOT EXISTS volcado boolean NOT NULL DEFAULT false/)
  assert.match(SQL_VOLCADO, /CHECK \(NOT volcado OR tipo IS NULL\)/, 'un volcado no tiene tipo: el importador CSV no lo abre')
  assert.ok(concedidas('SELECT', 'portal_patrimonio_importacion')!.has('volcado'))
  assert.ok(concedidas('INSERT', 'portal_patrimonio_importacion')!.has('volcado'))
  assert.ok(!concedidas('UPDATE', 'portal_patrimonio_importacion')!.has('volcado'), 'un volcado no deja de serlo')
  assert.match(SQL_VOLCADO, /REVOKE ALL ON seguros\.portal_patrimonio_importacion FROM crm_seguros/)
  // El tope de elementos del volcado es el CHECK de filas de la BD.
  assert.match(readFileSync(join(RAIZ, 'packages/module-patrimonio/src/volcado.ts'), 'utf8'), /MAX_ELEMENTOS_VOLCADO = 500/)
})

test('🚨 recomendación entre propietarios (27/10/2026): SQL aditivo sin borrados ni DROP, sin correo en claro, hash único por invitado y crm_seguros sin nada', () => {
  const crudo = readFileSync(join(RAIZ, RUTA_RECOMENDACION), 'utf8')
  assert.doesNotMatch(crudo, /\bDROP\b/i, 'ni en comentarios: el MCP de Supabase se cuelga')
  assert.doesNotMatch(SQL_RECOMENDACION, /\bDROP\b|\bTRUNCATE\b/i)
  assert.doesNotMatch(SQL_RECOMENDACION.replace(/ON DELETE (CASCADE|SET NULL)/g, ''), /\bDELETE\b/i, 'solo ON DELETE de las FK; ningún borrado')
  assert.match(SQL_RECOMENDACION, /^BEGIN;/m)
  assert.match(SQL_RECOMENDACION, /^COMMIT;/m)
  assert.match(SQL_RECOMENDACION, /CREATE TABLE IF NOT EXISTS seguros\.portal_patrimonio_recomendacion/)
  assert.match(SQL_RECOMENDACION, /REVOKE ALL ON seguros\.portal_patrimonio_recomendacion FROM crm_seguros/)
  const t = 'portal_patrimonio_recomendacion'
  // Solo el HASH del correo: ninguna columna de correo/teléfono/nombre en claro en la tabla ni en el modelo.
  const cols = modeloDe(t)!.campos.map((c) => c.columna)
  assert.deepEqual(cols.filter((c) => /correo|email|telefono|nombre/.test(c) && c !== 'correo_hash'), [])
  assert.ok(cols.includes('correo_hash'))
  // Quien recomienda, cuándo, y el canje no se reescriben desde el portal: solo los sellos.
  assert.deepEqual([...concedidas('UPDATE', t)!].sort(), ['anulado_en', 'canjeada_en', 'canjeada_por_identidad_id'])
  assert.deepEqual([...concedidas('INSERT', t)!].sort(), ['caduca_en', 'correo_hash', 'recomendador_identidad_id'])
  assert.ok(!concedidas('INSERT', t)!.has('canjeada_en'), 'no se nace ya canjeada')
  // Un invitado, una recompensa; una viva por par.
  assert.match(SQL_RECOMENDACION, /CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_recomendacion_invitado[\s\S]*?\(canjeada_por_identidad_id\)/)
  assert.match(SQL_RECOMENDACION, /CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_recomendacion_viva[\s\S]*?\(recomendador_identidad_id, correo_hash\)/)
  // La recompensa del SQL es la del módulo (90 días como mínimo) y no se guarda en la tabla.
  assert.match(readFileSync(join(RAIZ, 'packages/module-patrimonio/src/recomendacion.ts'), 'utf8'), /DIAS_RECOMPENSA_RECOMENDACION = 90/)
  assert.ok(!cols.includes('recompensa_hasta'))
  // `canjeada_por_identidad_id` es FK ON DELETE SET NULL: el trigger de inmutabilidad tiene que dejar pasar ese NULL (la acción
  // referencial dispara BEFORE UPDATE), o borrar la identidad del invitado (supresión RGPD) falla con 23514.
  const trig = /FUNCTION seguros\.portal_patrimonio_recomendacion_inmutable[\s\S]*?END \$\$/.exec(SQL_RECOMENDACION)![0]
  assert.match(trig, /NEW\.canjeada_por_identidad_id IS NOT NULL/, 'el trigger bloquea el SET NULL de la FK del invitado')
})

// ─── Recorte de lo HEREDADO por `prisma_seguros` (27/10/2026, Alberto: «quita los permisos») ───────────────────────────
// El SQL revoca a apps/asegura lo que su código no usa. Si mañana asegura empieza a leer/escribir una de esas tablas sin
// tocar los GRANT, en producción cae con 42501: este cepo lo ve antes, cruzando el SQL con el SQL crudo de apps/asegura.
const RUTA_REVOCAR = 'apps/asegura-portal/prisma/sql/2026-10-27_portal_patrimonio_revocar_heredados.sql'

function codigoAsegura(): string {
  const trozos: string[] = []
  const pasear = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === 'generated' || e === '.next') continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) pasear(p)
      else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) trozos.push(readFileSync(p, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))
    }
  }
  for (const d of ['apps/asegura/lib', 'apps/asegura/app']) pasear(join(RAIZ, d))
  return trozos.join('\n')
}

test('🚨 prisma_seguros (27/10/2026): sin lo que asegura no usa, SELECT donde solo lee, backup_seguros intacto', () => {
  const crudo = readFileSync(join(RAIZ, RUTA_REVOCAR), 'utf8')
  assert.doesNotMatch(crudo, /\bDROP\b/i, 'ni en comentarios: el MCP de Supabase se cuelga')
  const sql = crudo.replace(/--.*$/gm, '')
  assert.match(sql, /^BEGIN;/m)
  assert.match(sql, /^COMMIT;/m)
  assert.doesNotMatch(sql, /backup_seguros/, 'el rol de las copias no se toca: sin SELECT la tabla sale del backup')
  assert.match(sql, /REVOKE ALL ON seguros\.portal_patrimonio_recomendacion\s+FROM prisma_seguros/)
  // Revocar UPDATE de TABLA arrastra el de columna: renta_actualizacion conserva UPDATE (notificada_en).
  assert.doesNotMatch(sql, /REVOKE[^;]*\bUPDATE\b[^;]*portal_patrimonio_renta_actualizacion/)
  // Lo que asegura escribe no se recorta: el motor de señales y el cron del INE.
  assert.doesNotMatch(sql, /portal_patrimonio_senal\b/)
  assert.doesNotMatch(sql, /portal_patrimonio_indice\b/)

  const codigo = codigoAsegura()
  const nada = [...sql.matchAll(/REVOKE ALL ON seguros\.(portal_patrimonio_\w+)\s+FROM prisma_seguros/g)].map((m) => m[1])
  assert.ok(nada.length >= 10)
  const usadas = nada.filter((t) => new RegExp(`\\b${t}\\b`).test(codigo))
  assert.deepEqual(usadas, [], 'apps/asegura usa una tabla a la que este SQL le quita TODO')
  const soloLee = [...sql.matchAll(/REVOKE INSERT, UPDATE, DELETE[^;]*ON seguros\.(portal_patrimonio_\w+)\s+FROM prisma_seguros/g)].map((m) => m[1])
  assert.ok(soloLee.includes('portal_patrimonio_titular'))
  const escritas = soloLee.filter((t) => new RegExp(`(insert\\s+into|update|delete\\s+from)\\s+(seguros\\.)?"?${t}\\b`, 'i').test(codigo))
  assert.deepEqual(escritas, [], 'apps/asegura escribe en una tabla que este SQL deja en solo SELECT')
  for (const t of soloLee) assert.match(sql, new RegExp(`GRANT SELECT ON[^;]*seguros\\.${t}\\b[^;]*TO prisma_seguros`))
})

// ─── Tabla NUEVA `portal_patrimonio_*` ⇒ recorte a `prisma_seguros` en su MISMO SQL (28/10/2026) ───────────────────────
// Los default privileges del schema `seguros` le dan a `prisma_seguros` (apps/asegura) SELECT/INSERT/UPDATE/DELETE en TODA
// tabla nueva. No se cambian (romperían las tablas de asegura), así que cada SQL posterior al 27/10 que cree una tabla del
// portal tiene que recortarla él. Los anteriores se recortaron con `revocar_heredados` y quedan exentos.
const DIR_SQL_PORTAL = join(RAIZ, 'apps/asegura-portal/prisma/sql')

/** Tablas `portal_patrimonio_*` creadas (sin comentarios) que NO tienen un REVOKE de escritura (o ALL) a `prisma_seguros`. */
export function tablasSinRecorteSeguros(sqlCrudo: string): string[] {
  const sql = sqlCrudo.replace(/--.*$/gm, '')
  const creadas = [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?seguros"?\.)?"?(portal_patrimonio_\w+?)"?\s*\(/gi)].map((m) => m[1])
  const revokes = sql.split(';').filter((s) => /^\s*REVOKE\b/i.test(s) && /\bFROM\s+prisma_seguros\b/i.test(s))
  return creadas.filter((t) => !revokes.some((r) => {
    const m = /^\s*REVOKE\s+([\s\S]+?)\s+ON\s+(?:TABLE\s+)?([\s\S]+?)\s+FROM\b/i.exec(r)
    if (!m) return false
    const ontabla = m[2].split(',').some((x) => x.trim().replace(/"/g, '').replace(/^seguros\./i, '') === t)
    const privs = m[1].toUpperCase()
    const escritura = /^ALL(\s+PRIVILEGES)?$/.test(privs.trim()) || ['INSERT', 'UPDATE', 'DELETE'].every((p) => new RegExp(`\\b${p}\\b`).test(privs))
    return ontabla && escritura
  }))
}

test('🚨 SQL del portal desde 28/10/2026: toda tabla portal_patrimonio_* nueva recorta la escritura de prisma_seguros', () => {
  const nuevos = readdirSync(DIR_SQL_PORTAL).filter((f) => /^\d{4}-\d{2}-\d{2}_.*\.sql$/.test(f) && f.slice(0, 10) >= '2026-10-28')
  const fallos: string[] = []
  for (const f of nuevos) {
    for (const t of tablasSinRecorteSeguros(readFileSync(join(DIR_SQL_PORTAL, f), 'utf8'))) {
      fallos.push(`${f}: crea seguros.${t} sin \`REVOKE ALL ON seguros.${t} FROM prisma_seguros\` (o REVOKE INSERT, UPDATE, DELETE ...)`)
    }
  }
  assert.deepEqual(fallos, [], 'Los default privileges de `seguros` dan a prisma_seguros (apps/asegura) SELECT/INSERT/UPDATE/DELETE en toda tabla nueva; '
    + 'no se cambian porque romperían las tablas de asegura. Cada SQL que cree una tabla portal_patrimonio_* debe recortarla en el mismo fichero:\n' + fallos.join('\n'))
})

test('el detector del recorte distingue REVOKE bueno, ausente y sobre otra tabla', () => {
  const crea = 'CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_x (id int);\n'
  assert.deepEqual(tablasSinRecorteSeguros(crea), ['portal_patrimonio_x'])
  assert.deepEqual(tablasSinRecorteSeguros(crea + '-- REVOKE ALL ON seguros.portal_patrimonio_x FROM prisma_seguros;'), ['portal_patrimonio_x'])
  assert.deepEqual(tablasSinRecorteSeguros(crea + 'REVOKE ALL ON seguros.portal_patrimonio_y FROM prisma_seguros;'), ['portal_patrimonio_x'])
  assert.deepEqual(tablasSinRecorteSeguros(crea + 'REVOKE SELECT ON seguros.portal_patrimonio_x FROM prisma_seguros;'), ['portal_patrimonio_x'])
  assert.deepEqual(tablasSinRecorteSeguros(crea + 'REVOKE ALL ON seguros.portal_patrimonio_x FROM prisma_seguros;'), [])
  assert.deepEqual(tablasSinRecorteSeguros(crea + 'REVOKE INSERT, UPDATE, DELETE ON seguros.portal_patrimonio_x FROM prisma_seguros;'), [])
})
