// Guardián de la REGLA ÚNICA de las oportunidades (Alberto, 29/09/2026). `node --test`.
//
// Toda oportunidad —un seguro que no está con nosotros y cuyo vencimiento conocemos: baja por recibo
// devuelto, alta por Telegram, competencia, recaptación, «avísame» de la web, póliza subida— pasa a
// Alberto 45 días antes de vencer, y antes no se contacta a nadie. Hasta ese día convivían 60, 45 y 70
// tecleados en cada fichero y cada vía llamaba en un día distinto. Ahora el número vive en UN sitio,
// `DIAS_AVISO_OPORTUNIDAD` de `@central/module-seguros`, y aquí se prohíbe volver a teclearlo.
//
// ⚠️ `DIAS_PREAVISO_ASEGURADOR` (60, `vencimientos.ts`) es el plazo LEGAL de la compañía y NO entra.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

/** Los ficheros por los que nace o se trabaja una oportunidad con vencimiento. */
const FICHEROS = [
  'apps/asegura/lib/baja-devolucion-reglas.ts',
  'apps/plataforma/lib/correduria-oportunidad-tg.ts',
  'apps/asegura/lib/cartera-recaptacion.ts',
  'apps/asegura/lib/recaptacion-ventana.ts',
  'apps/asegura/lib/aviso-web.ts',
  'apps/asegura/lib/aviso-web-reglas.ts',
  'apps/asegura/lib/leads-competencia.ts',
  'apps/asegura/lib/oportunidad-documento-reglas.ts',
  'apps/asegura/lib/oportunidades-aviso.ts',
  'apps/plataforma/lib/correduria/oportunidades-aviso.ts',
  'packages/module-seguros/src/lead-competencia.ts',
]

/** 45/60 que NO son el plazo de la oportunidad. Cada uno con su porqué; la línea exacta, no el fichero. */
const PERMITIDOS: Record<string, string[]> = {
  'apps/plataforma/lib/correduria-oportunidad-tg.ts': [
    'export const MINUTOS_DOCUMENTO_RECIENTE = 60', // minutos, no días
    "numeroPoliza: texto(args.numeroPoliza, 60) ?? primero('numeroPoliza'),", // longitud máxima
  ],
  'apps/asegura/lib/aviso-web-reglas.ts': [
    'export const DIAS_COMPANIA = 60', // plazo legal de la compañía (art. 22 LCS), no el de la oportunidad
    "const NOMBRE_SEGURO = /^[\\p{L} .'-]{1,60}$/u", // longitud máxima
  ],
  'packages/module-seguros/src/lead-competencia.ts': [
    "if (dias < 60) return '30_60'", // tramo de pantalla, no cuándo se contacta
  ],
}

/** Líneas de CÓDIGO (sin comentarios) con un 45 o un 60 sueltos. */
export function literalesSospechosos(src: string): string[] {
  const sinBloques = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  return sinBloques
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1').trim())
    .filter((l) => /(?<![\w.])(45|60)(?![\w.])/.test(l))
}

test('ningún fichero de oportunidades teclea 45 ni 60: todos leen DIAS_AVISO_OPORTUNIDAD', () => {
  const malos: string[] = []
  for (const f of FICHEROS) {
    const permitidas = new Set(PERMITIDOS[f] ?? [])
    for (const l of literalesSospechosos(readFileSync(join(ROOT, f), 'utf8'))) {
      if (!permitidas.has(l)) malos.push(`${f}: ${l}`)
    }
  }
  assert.deepEqual(malos, [], 'plazo de oportunidad tecleado a mano; usa DIAS_AVISO_OPORTUNIDAD de @central/module-seguros')
})

test('la constante única vive en @central/module-seguros, vale 45 y la leen todas las vías', () => {
  const regla = readFileSync(join(ROOT, 'packages/module-seguros/src/oportunidad-aviso.ts'), 'utf8')
  assert.match(regla, /export const DIAS_AVISO_OPORTUNIDAD = 45\n/)
  const lectores = [
    'apps/asegura/lib/baja-devolucion-reglas.ts',
    'apps/plataforma/lib/correduria-oportunidad-tg.ts',
    'apps/asegura/lib/recaptacion-ventana.ts',
    'apps/asegura/lib/aviso-web-reglas.ts',
    'apps/asegura/lib/oportunidad-documento-reglas.ts',
    'packages/module-seguros/src/lead-competencia.ts',
  ]
  for (const f of lectores) assert.match(readFileSync(join(ROOT, f), 'utf8'), /DIAS_AVISO_OPORTUNIDAD/, f)
})

test('la pasada diaria existe: puerto en asegura y bloque en el cron de renovaciones de plataforma', () => {
  const cron = readFileSync(join(ROOT, 'apps/plataforma/app/api/cron/correduria-renovaciones/route.ts'), 'utf8')
  assert.match(cron, /oportunidadesAvisoAsegura\(\)/)
  assert.match(cron, /HITO_OPORTUNIDAD/)
  const ruta = readFileSync(join(ROOT, 'apps/asegura/app/api/operador/oportunidades-aviso/route.ts'), 'utf8')
  assert.match(ruta, /operadorAutorizado\(req\)/)
})

test('el detector ve un 45 y un 60 en código y no en comentarios', () => {
  assert.deepEqual(literalesSospechosos('export const X = 45\n// a 60 días\n/* 45 */\nconst y = 1.45'), ['export const X = 45'])
})
