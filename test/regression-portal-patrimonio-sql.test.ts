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
const SQL = readFileSync(join(RAIZ, 'apps/asegura-portal/prisma/sql/2026-10-22_portal_patrimonio.sql'), 'utf8').replace(/--.*$/gm, '')
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
      if (!['String', 'Int', 'BigInt', 'Decimal', 'Boolean', 'DateTime', 'Json'].includes(tipo)) continue
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
    'obligacion', 'enlace_inquilino', 'aviso_inquilino', 'inmueble_poliza',
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
