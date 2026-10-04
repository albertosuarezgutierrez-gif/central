// Cepo: los datos personales de TERCEROS del parte de siniestro del portal
// (contrarios, heridos, afectados, persona afectada) NUNCA se guardan en claro.
//
// ─── Qué se decidió (Alberto, 03/10/2026) ───────────────────────────────────
// `datos_ramo` (jsonb en claro) guarda lo no personal; nombres, teléfonos,
// matrículas y aseguradora/póliza del contrario van en `datos_ramo_cifrado`,
// un sobre AES-256-GCM `v1:` con `PII_ENCRYPTION_KEY` (la misma primitiva y la
// misma clave que el resto de PII de la correduría). Se descifra solo en el
// servidor de asegura, para la ficha de `/correduria`. El Telegram, sin PII.
//
// ─── Lo que persigue ────────────────────────────────────────────────────────
//  1. que el alta vuelva a escribir `valor.datosRamo` entero en `datos_ramo`
//  2. que se cifre con `encryptField` a secas (sin clave fuera de producción
//     devuelve el texto EN CLARO) en vez de con la variante estricta
//  3. que el SQL deje de blindar alguna clave PII (lista desincronizada)
//  4. que la lectura del corredor ignore la columna cifrada (los datos de
//     terceros desaparecerían de la ficha sin que nadie lo note)
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { cifrarJsonEstricto, descifrarJsonEstricto } from '../packages/module-seguros-pii/src/json-cifrado.ts'
import {
  CLAVES_PII_PARTE,
  datosClaveParte,
  lineasDatosRamoParte,
  normalizarDatosRamoParte,
  partirDatosRamoParte,
  unirDatosRamoParte,
} from '../packages/module-seguros-portal/src/parte-ramo.ts'

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('1-2. el alta separa y cifra con la variante ESTRICTA; en `datos_ramo` solo va la mitad en claro', () => {
  const f = sinComentarios(leer('apps/asegura-portal/lib/partes-siniestro.ts'))
  assert.match(f, /partirDatosRamoParte\(valor\.datosRamo\)/)
  assert.match(f, /requireSecret\('PII_ENCRYPTION_KEY'\)/)
  assert.match(f, /cifrarJsonEstricto\(pii\)/)
  assert.doesNotMatch(f, /encryptField/, 'encryptField a secas guarda en claro sin clave fuera de producción')
  assert.doesNotMatch(f, /datosRamo:\s*valor\.datosRamo/, '`datos_ramo` recibe el parte entero, PII incluida')
  assert.match(f, /datosRamo:\s*claro === null/)
})

test('3. el SQL blinda en la BD TODAS las claves PII y exige sobre `v1:`', () => {
  const sql = leer('apps/asegura-portal/prisma/sql/2026-10-03_portal_parte_datos_ramo.sql')
  const m = sql.match(/datos_ramo \?\| ARRAY\[([^\]]*)\]/)
  assert.ok(m, 'falta el CHECK de `datos_ramo` sin claves PII')
  const enSql = new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]))
  assert.deepEqual([...enSql].sort(), [...CLAVES_PII_PARTE].sort(), 'CLAVES_PII_PARTE y el CHECK de la BD no coinciden')
  assert.match(sql, /datos_ramo_cifrado IS NULL OR datos_ramo_cifrado LIKE 'v1:%'/)
})

test('4. la ficha del corredor descifra la columna; la bandeja no pinta `datos_ramo` a pelo', () => {
  const f = sinComentarios(leer('apps/asegura/lib/partes-portal.ts'))
  assert.match(f, /datosRamoCifrado: true/)
  assert.match(f, /lineasDatosRamoDelParte\(p\.datosRamo, p\.datosRamoCifrado\)/)
  assert.match(f, /descifrarJsonEstricto/)
  assert.match(f, /LINEA_TERCEROS_ILEGIBLES/)
})

test('ida y vuelta completa: lo que da el cliente vuelve entero a la ficha y no hay PII en claro', () => {
  const prev = process.env.PII_ENCRYPTION_KEY
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('hex')
  try {
    const datos = normalizarDatosRamoParte(
      'auto',
      {
        existeAtestado: 'si',
        contrarios: [{ conductor: 'Pepa Ruiz', matricula: '1234ABC', aseguradora: 'Mapfre', poliza: 'P-99', telefono: '600111222' }],
        lesionados: [{ nombre: 'Juan Pérez', papel: 'tercero', atendido: 'si' }],
      },
      { hayHeridos: true, hayTerceros: true, tipoSiniestro: 'colision' },
    )
    const { claro, pii } = partirDatosRamoParte(datos)
    assert.doesNotMatch(JSON.stringify(claro), /Pepa|1234ABC|Mapfre|P-99|600111222|Juan/)
    const sobre = cifrarJsonEstricto(pii)
    assert.doesNotMatch(sobre, /Pepa|1234ABC|Mapfre|P-99|600111222|Juan/)
    const vuelta = unirDatosRamoParte(claro, descifrarJsonEstricto(sobre))
    assert.deepEqual(lineasDatosRamoParte(vuelta), lineasDatosRamoParte(datos))
    // El aviso de Telegram sale de los datos completos y aun así solo CUENTA.
    assert.doesNotMatch(datosClaveParte(datos, 10).join(' | '), /Pepa|1234ABC|Mapfre|600111222|Juan/)
  } finally {
    if (prev === undefined) delete process.env.PII_ENCRYPTION_KEY
    else process.env.PII_ENCRYPTION_KEY = prev
  }
})
