import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PREFIJO_UID_ATASCADO, TOPE_PASADAS_UID_ATASCADO, decidirUidAtascado, textoAvisoUidAtascado } from './uid-atascado.ts'

const V = 777

test('🪤 UID no descargable: se salta SOLO tras 3 pasadas SEGUIDAS fallando el MISMO UID (mismo uidvalidity)', () => {
  assert.equal(TOPE_PASADAS_UID_ATASCADO, 3)
  assert.deepEqual(decidirUidAtascado(null, 50, V, false), { accion: 'contar', uid: 50, fallos: 1 })
  assert.deepEqual(decidirUidAtascado({ uid: 50, fallos: 1, uidValidity: V }, 50, V, false), { accion: 'contar', uid: 50, fallos: 2 })
  assert.deepEqual(decidirUidAtascado({ uid: 50, fallos: 2, uidValidity: V }, 50, V, false), { accion: 'saltar', uid: 50, fallos: 3 })
  // Otro UID, o el buzón se reinició (otro uidvalidity): se empieza de cero.
  assert.deepEqual(decidirUidAtascado({ uid: 50, fallos: 2, uidValidity: V }, 51, V, false), { accion: 'contar', uid: 51, fallos: 1 })
  assert.deepEqual(decidirUidAtascado({ uid: 50, fallos: 2, uidValidity: V }, 50, V + 1, false), { accion: 'contar', uid: 50, fallos: 1 })
  // Una pasada que lo descarga bien rompe la racha.
  assert.deepEqual(decidirUidAtascado({ uid: 50, fallos: 2, uidValidity: V }, null, V, false), { accion: 'limpiar' })
  // Cortada por tiempo antes: ni se cuenta ni se salta.
  assert.deepEqual(decidirUidAtascado({ uid: 50, fallos: 2, uidValidity: V }, 50, V, true), { accion: 'nada' })
  assert.match(textoAvisoUidAtascado(50, 3), /correo UID 50 no se puede descargar .*saltado/)
})

test('🪤 triaje: el salto avanza el cursor HASTA ese UID, avisa por el catálogo y el latido solo mira la fila INBOX', () => {
  const src = readFileSync(join(import.meta.dirname, 'triaje.ts'), 'utf8')
  assert.match(src, /decidirUidAtascado\(atascoPrevio, sesion\.uidNoDescargable\(\), sesion\.uidValidity, uidDiferido !== null\)/)
  const saltar = src.slice(src.indexOf("} else if (atasco.accion === 'saltar') {"))
  assert.match(saltar, /^[^]*?maxUid = Math\.max\(maxUid, atasco\.uid\)/)
  // El salto se decide ANTES del finally que escribe el cursor.
  assert.ok(src.indexOf('maxUid = Math.max(maxUid, atasco.uid)') < src.indexOf('cursorTrasPasada(maxUid, uidDiferido)'))
  assert.match(src, /await tgAviso\('correo\.no-descargable', avisoAtasco\)/)
  assert.match(src, /VALUES \(\$\{PREFIJO_UID_ATASCADO \+ atasco\.uid\}, \$\{atasco\.fallos\}/)
  const cat = readFileSync(join(import.meta.dirname, '..', 'telegram', 'catalogo.ts'), 'utf8')
  assert.match(cat, /id: 'correo\.no-descargable'/)
  const latido = readFileSync(join(import.meta.dirname, '..', '..', 'app', 'api', 'cron', 'agentes-latido', 'route.ts'), 'utf8')
  assert.match(latido, /SELECT max\(updated_at\) AS ultimo FROM correo_cursor WHERE buzon = 'INBOX'/)
  assert.ok(PREFIJO_UID_ATASCADO.startsWith('INBOX:'), 'la fila del contador no puede ser la del cursor')
})
