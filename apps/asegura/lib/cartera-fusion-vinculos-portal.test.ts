import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ORIGENES_VINCULO } from '@central/module-seguros-portal'

/**
 * 🪤 La fusión de fichas no pierde vínculos del portal (27/10/2026).
 *
 * `fusionar_clientes` vaciaba el `email_lookup_hash` de la absorbida y mudaba sus `cliente_emails` ANTES de que el bucle
 * genérico de FK moviera sus `portal_vinculo`: el trigger `portal_vinculo_retira_correo` borraba en silencio los
 * `email_hash` (la persona se quedaba sin ficha en el portal hasta volver a entrar). Y con la misma identidad en las dos
 * fichas ganaba SIEMPRE la superviviente, aunque fuera un `email_hash`/`tarjeta` frente a un `autorizacion_corredor`.
 * Comprobado contra un Postgres 16 real con el trigger; aquí se vigila el FUENTE de la versión vigente (la última
 * migración que redefine la función), porque el job de tests no tiene BD.
 */
const dirSql = join(import.meta.dirname, '..', 'prisma', 'sql')
const FIRMA = 'create or replace function seguros.fusionar_clientes(\n  p_correduria uuid,'

function vigente(): { nombre: string; cuerpo: string } {
  const nombres = readdirSync(dirSql).filter((n) => n.endsWith('.sql')).sort()
  const conFuncion = nombres.filter((n) => readFileSync(join(dirSql, n), 'utf8').includes(FIRMA))
  assert.ok(conFuncion.length > 0, 'no encuentro ninguna migración que defina fusionar_clientes')
  const nombre = conFuncion[conFuncion.length - 1]
  const src = readFileSync(join(dirSql, nombre), 'utf8')
  const i = src.indexOf(FIRMA)
  return { nombre, cuerpo: src.slice(i, src.indexOf('end $$;', i)) }
}

test('la versión vigente de fusionar_clientes es la que muda los vínculos del portal (o una posterior)', () => {
  assert.ok(vigente().nombre >= '2026-10-27_fusionar_clientes_vinculos_portal.sql', vigente().nombre)
})

test('los vínculos del portal se mudan ANTES de vaciar los índices de la lápida y de mover sus correos', () => {
  const { cuerpo } = vigente()
  const mudar = cuerpo.indexOf('update portal_vinculo set cliente_id = p_sup where cliente_id = p_lap')
  const vaciar = cuerpo.indexOf('update clientes set dni_lookup_hash = null, email_lookup_hash = null')
  const borrarCorreos = cuerpo.indexOf('delete from cliente_emails e where e.cliente_id = p_lap')
  const bucleFk = cuerpo.indexOf("c.contype = 'f' and c.confrelid = 'seguros.clientes'::regclass")
  assert.ok(mudar > 0, 'falta la mudanza explícita de portal_vinculo')
  assert.ok(vaciar > 0 && borrarCorreos > 0 && bucleFk > 0, 'la función ha cambiado de forma: revisa este cepo')
  assert.ok(mudar < vaciar, 'se muda DESPUÉS de vaciar email_lookup_hash: el trigger borra los email_hash')
  assert.ok(mudar < borrarCorreos, 'se muda DESPUÉS de borrar/mover cliente_emails: el trigger borra los email_hash')
  assert.ok(mudar < bucleFk)
})

test('misma identidad en las dos: gana el vínculo de rango mayor, también si es el de la absorbida', () => {
  const { cuerpo } = vigente()
  // La de la superviviente también puede perder (antes solo se borraba el de la absorbida).
  assert.match(cuerpo, /x\.cliente_id = p_sup and y\.cliente_id = p_lap and .+ > /)
  assert.match(cuerpo, /x\.cliente_id = p_lap and y\.cliente_id = p_sup and .+ >= /)
  assert.match(cuerpo, /array_position\(array\['tarjeta','completo','gestionar','administrar'\], y\.nivel\)/)
  // Cada origen duradero tiene rango propio (`corredor`, la vista temporal, cae en el `else 0`).
  for (const o of ORIGENES_VINCULO.filter((o) => o !== 'corredor')) {
    assert.match(cuerpo, new RegExp(`when '${o}' then [12]`), `origen «${o}» sin rango en la fusión`)
  }
  assert.doesNotMatch(cuerpo, /delete from portal_vinculo x where x\.cliente_id = p_lap\s+and exists/, 'vuelve el borrado ciego del de la absorbida')
  assert.match(cuerpo, /borradas := borradas \|\| jsonb_build_object\('portal_vinculo', v_ids\)/)
})

test('una carrera con un vínculo nuevo para la fusión entera, y la app lo dice como conflicto', () => {
  const { cuerpo } = vigente()
  assert.match(cuerpo, /exception when unique_violation then\s+(--[^\n]*\n\s+)*raise exception 'vinculo_portal_concurrente'/)
  const app = readFileSync(join(import.meta.dirname, 'cartera-fusion.ts'), 'utf8')
  assert.match(app, /vinculo_portal_concurrente: \{\s+estado: 'conflicto'/)
})
