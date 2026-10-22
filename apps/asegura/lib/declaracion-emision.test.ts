import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { textoAvisoDeclaradaNoEnlaza, textoAvisoDeclaradaSinCima } from './correo-cruce.ts'

// «Póliza emitida» declarada a mano (22/10/2026). Cepos sobre el FUENTE (tsc no mira dentro de un Prisma.sql y este job
// corre sin `prisma generate`) + los textos puros del aviso.
const leer = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8')
const cuerpo = (src: string, desde: string, hasta?: string) => {
  const i = src.indexOf(desde)
  assert.ok(i >= 0, `no está «${desde}»`)
  const j = hasta ? src.indexOf(hasta, i + desde.length) : -1
  return src.slice(i, j > i ? j : undefined)
}

test('🪤 declarar NO crea póliza ni escribe la cartera: transición `ganar` sin póliza + fila propia + nota en la ficha', () => {
  const f = cuerpo(leer('oportunidad-seguimiento.ts'), 'export async function declararEmitida')
  assert.doesNotMatch(f, /(insert into|update)\s+polizas\b/i, 'lo declarado no es cartera: nunca se escribe en polizas')
  assert.doesNotMatch(f, /poliza_ganada_id\s*=/, 'la póliza ganada la pone SOLO el enlace con CIMA')
  assert.match(f, /transicionar\(tx, correduriaId, desde, \{ accion: 'ganar' \}/, 'misma transición que la acción ganar')
  assert.match(f, /antes\.estado === 'competencia'[\s\S]*\{ accion: 'interesado' \}/, 'una sin trabajar pasa por interesado, no se salta la regla')
  assert.match(f, /insert into oportunidad_historial[\s\S]*ACCION_DECLARADA_EMITIDA[\s\S]*detalleDeclaracion\(d\)/)
  assert.match(f, /anotarEnFicha\(correduriaId, antes\.clienteId, texto\.slice\(0, 2000\), tx\)/, 'historial_interno en la MISMA transacción')
  assert.match(f, /for update/, 'la oportunidad se bloquea')
  assert.match(f, /anotarCambio\(\{ entidad: 'oportunidad', id, campo: 'poliza_declarada' \}\)/)
  // Compañía: del catálogo REAL (companias_dgs), nunca códigos a mano; sin catálogo legible, `null` (no se acepta un código).
  assert.match(f, /from companias_dgs where activa`\)\.catch\(\(\) => null\)/)
  assert.doesNotMatch(f, /COMPANIAS_SOLICITUD|CODIGO_DGS_COMPANIA/)
  // Sin cliente → 400 legible; doble envío idéntico → no-op antes de escribir nada.
  assert.match(f, /if \(!fila\.clienteId\) return \{[^}]*status: 400 as const \}/)
  assert.ok(f.indexOf('mismaDeclaracion(previa, d)') < f.indexOf('transicionar(tx'), 'el no-op va antes de cualquier escritura')
  assert.match(f, /if \(!r\.sinCambios\) \{/)
})

test('🪤 anular: solo ganada SIN póliza y con declaración; vuelve a en_negociacion y deja `anulada_declaracion`', () => {
  const f = cuerpo(leer('oportunidad-seguimiento.ts'), 'export async function anularDeclaracion', '\n}\n')
  assert.match(f, /if \(fila\.polizaGanadaId\) return/)
  assert.match(f, /if \(!decl\) return/)
  assert.match(f, /update oportunidades set estado = 'en_negociacion', cerrada_at = null[\s\S]*estado::text = 'ganada' and poliza_ganada_id is null/)
  assert.match(f, /ACCION_ANULADA_DECLARACION/)
  assert.match(f, /anotarEnFicha\(/)
  assert.doesNotMatch(f, /(insert into|update)\s+polizas\b/i)
  const r = leer('../app/api/operador/oportunidad/route.ts')
  assert.match(cuerpo(r, 'export const POST = auditado('), /b\?\.accion === 'anular_declaracion'[\s\S]*anularDeclaracion\(correduria\.id, b\.id,/)
})

test('🪤 lo que invalida una declaración es la ANULACIÓN (no «reabrir», que no existe para una ganada) en todas las lecturas', () => {
  for (const f of ['oportunidad-seguimiento.ts', 'enlace-poliza-oportunidad.ts', 'correo-cruce-cima-bd.ts']) {
    const src = leer(f)
    assert.doesNotMatch(src, /r\.accion = 'reabrir'/, f)
    assert.match(src, /r\.accion = \$\{ACCION_ANULADA_DECLARACION\} and r\.created_at > h\.created_at/, f)
  }
})

test('el puerto expone `declarar_emitida` dentro del POST auditado', () => {
  const r = leer('../app/api/operador/oportunidad/route.ts')
  assert.match(r, /export const POST = auditado\(/)
  const post = cuerpo(r, 'export const POST = auditado(')
  assert.match(post, /b\?\.accion === 'declarar_emitida'[\s\S]*declararEmitida\(correduria\.id, b\.id,/)
})

test('🪤 enlace F1: una ganada entra SOLO con su declaración vigente; al casar es «confirmada», no un ganada→ganada', () => {
  const src = leer('enlace-poliza-oportunidad.ts')
  assert.match(src, /o\.estado::text = 'ganada' and d\.detalle is not null/)
  assert.match(src, /if \(o\.estado === 'ganada' && !decl\) return \[\]/, 'declaración ilegible → fuera, nunca a la heurística')
  assert.match(src, /cerrada_at = case when estado::text = 'ganada' then coalesce\(cerrada_at, now\(\)\) else now\(\) end/)
  const conf = cuerpo(src, "if (e.via === 'declaracion' && o.estado === 'ganada')", 'continue\n    }')
  assert.match(conf, /ACCION_DECLARACION_CONFIRMADA\}, null, null/)
  assert.doesNotMatch(conf, /'emitida_en_cartera'/)
  // Sus ambiguos los avisa el cruce (uno por declaración).
  assert.match(src, /if \(a\.motivo === 'declarada_otro_tomador' \|\| a\.motivo === 'declarada_varias_polizas'\) continue/)
})

test('🪤 cruce: la declarada se diagnostica por la FECHA DE LA DECLARACIÓN con TODAS las pólizas de su nº', () => {
  const src = cuerpo(leer('correo-cruce-cima-bd.ts'), '// 5. «Póliza emitida» DECLARADA', 'const pendientes')
  assert.match(src, /d\.created_at > now\(\) - make_interval\(days => \$\{VENTANA_DECLARADA_DIAS\}::int\)/)
  assert.doesNotMatch(src, /o\.cerrada_at/, 'no por la fecha de cierre')
  assert.match(src, /diagnosticarDeclarada\(/)
  assert.match(src, /dg\.tipo === 'no_llega'[\s\S]*'emision_sin_cima'/)
  assert.match(src, /dg\.tipo === 'no_enlaza'[\s\S]*'enlace_ambiguo', `declarada:\$\{o\.id\}:\$\{o\.num\}:\$\{dg\.motivo\}`/)
  // Las pólizas de ese nº, sin filtrar por ventana ni estado (eso lo decide el diagnóstico).
  const pols = cuerpo(src, 'from polizas p', 'limit 2000')
  assert.doesNotMatch(pols, /created_at >=|estado::text = any\(\$\{vigentes\}::text\[\]\)\s*and/)
})

test('textos: ni «en vigor» ni cartera creada; sin DGS se dice; el motivo de no enlazar se explica', () => {
  const t = textoAvisoDeclaradaSinCima({ compania: 'Hiscox', codigoDgs: null, numeroPoliza: '540000123', fechaDeclaracion: '2026-10-01', dias: 12 })
  assert.match(t, /Hiscox \(compañía sin código DGS: se casará solo por nº y tomador\)/)
  assert.match(t, /01\/10\/2026/)
  assert.match(t, /No se ha creado nada en la cartera/)
  assert.doesNotMatch(t, /en vigor/i)
  const n = textoAvisoDeclaradaNoEnlaza({ compania: 'Occident', codigoDgs: 'C0468', numeroPoliza: '540000123', fechaDeclaracion: '2026-10-01', motivo: 'otro_tomador' })
  assert.match(n, /OTRO tomador/)
  assert.match(n, /anúlala en la oportunidad/)
})
