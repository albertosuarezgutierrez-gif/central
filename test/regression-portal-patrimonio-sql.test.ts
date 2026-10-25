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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = new URL('..', import.meta.url).pathname
// Paso 3 (tablas) + paso 8 (documentos, 22/10/2026): el barrido y el espejo con el schema cubren los dos ficheros.
const SQL_DOCUMENTO = readFileSync(join(RAIZ, 'apps/asegura-portal/prisma/sql/2026-10-22_portal_patrimonio_documento.sql'), 'utf8').replace(/--.*$/gm, '')
// Enlace inmueble ↔ póliza (24/10/2026, P10): columnas nuevas en dos tablas ya existentes; entra en el mismo espejo.
const RUTA_ENLACE = 'apps/asegura-portal/prisma/sql/2026-10-24_portal_patrimonio_enlace_poliza.sql'
const SQL_ENLACE = readFileSync(join(RAIZ, RUTA_ENLACE), 'utf8').replace(/--.*$/gm, '')
// Tope de renta editable por el cliente (24/10/2026, P13/P14): columnas nuevas en `contrato`; mismo espejo.
const SQL_TOPE = readFileSync(join(RAIZ, 'apps/asegura-portal/prisma/sql/2026-10-24_portal_patrimonio_tope_renta.sql'), 'utf8').replace(/--.*$/gm, '')
const SQL = [
  readFileSync(join(RAIZ, 'apps/asegura-portal/prisma/sql/2026-10-22_portal_patrimonio.sql'), 'utf8').replace(/--.*$/gm, ''),
  SQL_DOCUMENTO,
  SQL_ENLACE,
  SQL_TOPE,
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
