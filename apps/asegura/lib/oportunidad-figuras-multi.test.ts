import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { INDICE_FIGURA_MULTI, INDICE_FIGURA_ROL_UNICO, INDICE_FIGURA_VIEJO, ROLES_FIGURA_MULTIPLES } from '@central/module-seguros'

// Figuras multi (asegurados), 10/10/2026. Lee el FUENTE (lo que vigila vive en SQL crudo, donde tsc no mira).
const src = readFileSync(new URL('./oportunidad-riesgo.ts', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../prisma/sql/2026-10-10_figuras_multi.sql', import.meta.url), 'utf8')
const ruta = readFileSync(new URL('../app/api/operador/oportunidad/figuras/route.ts', import.meta.url), 'utf8')
const sinComentarios = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const cuerpo = (nombre: string) => {
  const i = src.search(new RegExp(`(export )?async function ${nombre}\\b`))
  assert.ok(i >= 0, `falta ${nombre}`)
  const j = src.slice(i + 10).search(/\n(export )?async function /)
  return src.slice(i, j < 0 ? undefined : i + 10 + j)
}

test('todo «on conflict (oportunidad_id, rol)» lleva el predicado del índice parcial (vale con y sin migración)', () => {
  const todos = src.match(/on conflict \(oportunidad_id, rol\)[^`]*/g) ?? []
  assert.ok(todos.length >= 3, 'deberían ser al menos asignar, asignar soloSiLibre y abrirRiesgoDePoliza')
  for (const c of todos) assert.match(c, /^on conflict \(oportunidad_id, rol\) where rol <> 'asegurado' do /, c)
})

test('el predicado del código es IDÉNTICO al del índice parcial del SQL (si no, Postgres no lo infiere)', () => {
  const s = sinComentarios(sql)
  assert.match(s, new RegExp(`create unique index if not exists ${INDICE_FIGURA_ROL_UNICO}\\s+on seguros\\.oportunidad_figura \\(oportunidad_id, rol\\) where rol <> 'asegurado';`))
  assert.match(s, new RegExp(`create unique index if not exists ${INDICE_FIGURA_MULTI}\\s+on seguros\\.oportunidad_figura \\(oportunidad_id, rol, cliente_id\\) where rol = 'asegurado';`))
  assert.deepEqual([...ROLES_FIGURA_MULTIPLES], ['asegurado'], 'un rol múltiple nuevo exige cambiar SQL y predicados a la vez')
})

test('el SQL crea los únicos nuevos ANTES de quitar el viejo, añade asegurado al check, no toca datos y trae rollback', () => {
  const s = sinComentarios(sql)
  const nuevo = s.indexOf(`create unique index if not exists ${INDICE_FIGURA_ROL_UNICO}`)
  const quita = s.indexOf(`drop index if exists seguros.${INDICE_FIGURA_VIEJO}`)
  assert.ok(nuevo > 0 && quita > nuevo, 'nunca un momento sin guarda de unicidad')
  assert.match(s, /check \(rol in \('tomador', 'propietario', 'conductor_habitual', 'conductor_ocasional', 'asegurado'\)\)/)
  const sinGrant = s.split('\n').filter((l) => !/^grant /.test(l.trim())).join('\n')
  assert.doesNotMatch(sinGrant, /\b(update|delete from|insert into|truncate)\b/i, 'la migración no toca filas')
  assert.doesNotMatch(s, /beneficiario/, 'beneficiarios de vida = texto, no figura')
  assert.match(sql, /-- ─── ROLLBACK/)
  assert.match(sql, new RegExp(`-- create unique index if not exists ${INDICE_FIGURA_VIEJO}`))
})

test('gate: ni añadir ni dar de alta un asegurado escribe nada antes de mirar la migración', () => {
  for (const f of ['anadirFiguraMultiple', 'nuevoAseguradoEnRiesgo']) {
    const c = cuerpo(f)
    const gate = c.indexOf('await exigirFigurasMulti()')
    assert.ok(gate > 0, `${f} sin gate`)
    for (const escritura of [/insert into/, /altaCliente\(/, /crearRelacion\(/]) {
      const m = escritura.exec(c)
      if (m) assert.ok(m.index > gate, `${f}: ${escritura} antes del gate`)
    }
  }
  assert.match(cuerpo('exigirFigurasMulti'), /status: 503, estado: 'sin_migracion'/)
  // Un fallo al mirar el catálogo NO es «sin migración» ni «disponible»: es desconocido.
  assert.match(cuerpo('estadoFigurasMultiBD'), /return 'desconocido'/)
  assert.match(ruta, /estado: r\.estado \?\? 'error'/)
})

test('asignar y alta despachan los roles múltiples ANTES del camino de una persona (auto/moto intactos)', () => {
  const asignar = cuerpo('asignarFigura')
  assert.ok(asignar.indexOf('if (esRolMultiple(rol)) return anadirFiguraMultiple') < asignar.indexOf('insert into'))
  const nueva = cuerpo('nuevaPersonaEnRiesgo')
  assert.ok(nueva.indexOf('if (esRolMultiple(e.rol)) return nuevoAseguradoEnRiesgo') < nueva.indexOf('carnetDeNuevaPersona'))
})

test('quitar un asegurado exige decir cuál: nunca se borran todos de golpe', () => {
  const c = cuerpo('quitarFigura')
  const multi = c.slice(c.indexOf('if (esRolMultiple(e.rol))'), c.indexOf('return { ok: true }'))
  assert.match(multi, /falta qué persona quitar/)
  assert.match(multi, /and rol = \$\{e\.rol\} and cliente_id = \$\{clienteId\}::uuid/)
})

test('alta ligera sin DNI: SIEMPRE ficha nueva; nunca se busca otra por nombre o nacimiento', () => {
  const c = cuerpo('nuevoAseguradoEnRiesgo')
  const sinDni = c.slice(c.indexOf('} else {'), c.indexOf('// El sexo'))
  assert.match(sinDni, /insert into seguros\.clientes/)
  assert.doesNotMatch(sinDni, /select[^`]*from seguros\.clientes/i, 'sin DNI no se reutiliza ninguna ficha')
  assert.doesNotMatch(c, /leadSinDniReutilizable|coincidencias\(/, 'no se casa por nombre')
  // Con DNI repetido, solo si el nombre casa (un DNI mal tecleado es OTRA persona).
  assert.match(c, /mismaPersonaPorNombre\(\{ nombre: p\.nombre, apellidos: p\.apellidos \}, ficha\)/)
})
