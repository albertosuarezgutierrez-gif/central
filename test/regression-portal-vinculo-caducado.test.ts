// Un vínculo por correo NO sobrevive a que el correo deje de resolver a esa ficha (25/09/2026).
//
// Caso: el correo de Pablo Guzmán Lozano estuvo en la ficha de Pablo Guzmán Pueyo (otra persona).
// Se le vinculó a ella con nivel `gestionar`; al corregir el correo en el CRM se le añadió su ficha
// y la ajena SE QUEDÓ — veía prima, IBAN y DNI de otro. La regla pura tiene su cepo en
// `packages/module-seguros-portal/src/vinculo-elegir.test.ts`; este vigila que esté ENCHUFADA.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

test('el login retira los vínculos por correo caducados ANTES de salir por un estado no-ok', () => {
  const src = leer('apps/asegura-portal/lib/vinculo.ts')
  const retirar = src.indexOf('await retirarVinculosCaducados(identidadId, elegida)')
  const salida = src.indexOf("if (elegida.estado !== 'ok') return")
  assert.notEqual(retirar, -1, 'intentarVinculo ya no retira vínculos: un correo corregido deja la ficha ajena abierta')
  assert.ok(retirar < salida, 'se retira DESPUÉS de salir por sin_ficha/ambiguo: esos casos no cierran nada')
  // WhatsApp no dice nada del correo: tiene que salir antes, o un login por teléfono cerraría la bóveda.
  assert.ok(src.indexOf("if (tipo !== 'email') return") < retirar, 'la rama no-email llega a retirar vínculos')
  assert.match(src, /vinculosEmailARetirar\(elegida, existentes\)/, 'la decisión no pasa por la regla pura')
})

test('sin vínculo NO se pintan los vencimientos de cartera, y NO se borran (conservan el sello)', () => {
  const src = leer('apps/asegura-portal/lib/obligaciones.ts')
  const i = src.indexOf('export async function obligacionesDeIdentidad')
  const cuerpo = src.slice(i, src.indexOf('\n}', i))
  assert.match(cuerpo, /portalVinculo\.count\(\{ where: \{ identidadId \} \}\)/, 'el lector de avisos ya no mira si hay vínculo')
  assert.match(cuerpo, /OR: \[\{ tipo: \{ not: 'poliza' \} \}, \{ polizaId: null \}\]/, 'sin vínculo se pintan los vencimientos de una ficha ajena')
  assert.match(src, /if \(!c\.vinculada\) return\n/, 'el sincronizador vuelve a borrar sin vínculo: se pierde el sello avisadaAt y se re-avisa')
})

test('la BD retira los vínculos por correo cuando cambia o se borra el correo de la ficha', () => {
  const sql = leer('apps/asegura-portal/prisma/sql/2026-09-25_c_portal_vinculo_retira_al_cambiar_correo.sql')
  assert.match(sql, /AFTER UPDATE OF email_lookup_hash ON seguros\.clientes/)
  assert.match(sql, /AFTER UPDATE OF email_lookup_hash, cliente_id OR DELETE ON seguros\.cliente_emails/)
  assert.match(sql, /OLD\.cliente_id IS NOT DISTINCT FROM NEW\.cliente_id\s+AND OLD\.email_lookup_hash IS NOT DISTINCT FROM NEW\.email_lookup_hash/, 'un correo que se muda de ficha deja el vínculo viejo')
  // PL/pgSQL resuelve TODOS los campos de una expresión aunque el AND ya sea falso: `clientes` no
  // tiene `cliente_id`, y leerlo ahí rompía todo cambio de correo principal (26/09/2026).
  assert.match(sql, /IF TG_TABLE_NAME = 'clientes' THEN[\s\S]*?ficha := OLD\.id;\s+ELSIF/, 'la rama de clientes no está aislada')
  const ramaClientes = sql.match(/IF TG_TABLE_NAME = 'clientes' THEN([\s\S]*?)ELSIF/)?.[1] ?? ''
  assert.doesNotMatch(ramaClientes, /cliente_id/, 'la rama de clientes lee OLD/NEW.cliente_id, que no existe en clientes')
  assert.doesNotMatch(sql, /TG_TABLE_NAME = 'cliente_emails' AND OLD\./, 'OLD.cliente_id se evalúa también sobre clientes')
  assert.match(sql, /DELETE FROM seguros\.portal_vinculo WHERE cliente_id = ficha AND origen = 'email_hash'/)
})
