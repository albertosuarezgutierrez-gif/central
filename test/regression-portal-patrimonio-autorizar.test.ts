// Guardián de AUTORIZAR A UN TERCERO sobre el patrimonio del portal (27/10/2026): María (titular) autoriza a José.
// 🚨 Solo el TITULAR concede (ficha propia que opera o Dueño), nunca por nivel: quien entra con un acceso Total no reautoriza a
// un cuarto. La aceptación vuelve a comprobar que quien invitó SIGUE siendo titular. El SQL es aditivo con UN solo borrado.
// Los comentarios se quitan antes de mirar: un cepo de texto que se satisface con un comentario no cepa nada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const APP = 'apps/asegura-portal'
const crudo = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const sinComentariosTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const ts = (f: string) => sinComentariosTs(crudo(f))
const ACCESOS = ts(`${APP}/lib/patrimonio/accesos.ts`)
const API = ts(`${APP}/lib/patrimonio/autorizar-tercero-api.ts`)
const BD = ts(`${APP}/lib/patrimonio/autorizar-tercero-bd.ts`)
const RUTA = ts(`${APP}/app/api/patrimonio/autorizaciones/route.ts`)
const INVITACIONES = ts(`${APP}/lib/invitaciones.ts`)
const RUTA_SQL = `${APP}/prisma/sql/2026-10-27_portal_invitacion_patrimonio.sql`
const SQL = crudo(RUTA_SQL).replace(/--.*$/gm, '')

function cuerpo(src: string, firma: string): string {
  const i = src.indexOf(firma)
  assert.ok(i >= 0, `falta «${firma}»`)
  const j = src.indexOf('\nexport ', i + 1)
  const k = src.indexOf('\nasync function ', i + 1)
  const fin = [j, k].filter((x) => x > 0)
  return src.slice(i, fin.length > 0 ? Math.min(...fin) : undefined)
}

/** El brazo que vigila «solo el titular»: aislado para poder verlo morder con fuentes sintéticas. */
function soloTitular(f: string): string[] {
  const fallos: string[] = []
  if (!/puedeAutorizarPatrimonio\(/.test(f)) fallos.push('no pasa por puedeAutorizarPatrimonio')
  if (!/mapa\.get\(id\) === 'total'/.test(f)) fallos.push('no exige que el titular esté abierto con total')
  if (!/sesion\.id !== identidadId/.test(f) || !/sesion\.corredor/.test(f)) fallos.push('no mira la sesión ni la vista de corredor')
  if (/vinculadas:\s*\[\.\.\.mapa\.keys\(\)\]/.test(f)) fallos.push('trata todo lo que VE como propio (un Total reautorizaría)')
  return fallos
}

test('el brazo «solo el titular» muerde (fuentes sintéticas)', () => {
  assert.equal(soloTitular("return [...mapa.keys()]").length, 3)
  assert.deepEqual(
    soloTitular(
      "if (!sesion || sesion.id !== identidadId || sesion.corredor) return []; const fuentes = { vinculadas: [...mapa.keys()] }; " +
        "filter((id) => mapa.get(id) === 'total' && puedeAutorizarPatrimonio(fuentes, id))",
    ),
    ['trata todo lo que VE como propio (un Total reautorizaría)'],
  )
})

test('🚨 titularesAutorizables: solo titular o Dueño (puedeAutorizarPatrimonio), abierto con total y desde la cookie', () => {
  const f = cuerpo(ACCESOS, 'export async function titularesAutorizables(')
  assert.deepEqual(soloTitular(f), [])
  assert.match(f, /vinculadas: propias, dueno: deDueno/)
})

test('🚨 titularesPropios repite LETRA A LETRA las reglas 1-3 de accesosPatrimonio (no hay dos criterios de «propia»)', () => {
  const regla = "vinculos.filter((v) => v.origen !== 'corredor' && puedeAutorizar(nivelDe(v.nivel)))"
  const propios = cuerpo(ACCESOS, 'async function titularesPropios(')
  const accesos = cuerpo(ACCESOS, 'export async function accesosPatrimonio(')
  for (const f of [propios, accesos]) {
    assert.ok(f.includes(regla), 'la regla de vínculos que operan ha cambiado en una sola de las dos copias')
    assert.match(f, /empresasDeFichas\(queOperan\)/)
    assert.match(f, /portalVinculo\.findMany\(\{\s*where: \{ identidadId \}/)
  }
})

test('🚨 la API busca el titular DENTRO de autorizables ANTES de generar token o escribir; fuera = 404', () => {
  const f = cuerpo(API, 'export async function responderInvitar(')
  const busca = f.indexOf('(await p.autorizables()).find((t) => t.clienteId === b.titularClienteId)')
  const corta = f.indexOf('if (!titular) return NO_ENCONTRADO')
  const token = f.indexOf('p.token()')
  const fila = f.indexOf('p.crearInvitacion(')
  const correo = f.indexOf('p.enviarCorreo(')
  assert.ok(busca > 0 && corta > busca && token > corta && fila > token && correo > fila, 'orden: titular → token → fila → correo')
  assert.match(f, /const alcance = alcancePatrimonio\(b\.alcance\)/)
  assert.doesNotMatch(API, /\b403\b/)
})

test('🚨 el adaptador: autorizables = titularesAutorizables, y la escritura lo vuelve a comprobar', () => {
  assert.match(BD, /titularesAutorizables\(identidadId\)/)
  const crear = BD.slice(BD.indexOf('async crearInvitacion('), BD.indexOf('enviarCorreo:'))
  assert.match(crear, /\(await autorizablesIds\(\)\)\.includes\(x\.clienteId\)/)
  assert.match(crear, /polizaId: null/)
  assert.match(crear, /otorgadaPorIdentidadId: identidadId/)
  const revocar = BD.slice(BD.indexOf('async revocar('))
  assert.match(revocar, /alcance: \{ in: ALCANCES \}/)
  assert.match(revocar, /\{ autorizadoIdentidadId: identidadId \}/)
  assert.match(revocar, /where: \{ id: fila\.id, revocadoEn: null \}/)
  assert.doesNotMatch(BD, /\.delete(Many)?\(/)
})

test('🚨 la ruta no lee el titular del cuerpo: identidad de la cookie y puerta de conceder', () => {
  assert.match(RUTA, /requireIdentidad\(\)/)
  assert.match(RUTA, /puertaDeSesion\('conceder', 'escritura'\)/)
  assert.match(RUTA, /puertosAutorizarPatrimonio\(identidad\.id/)
  assert.doesNotMatch(RUTA, /titularClienteId/)
})

test('🚨 aceptar una invitación de patrimonio comprueba que quien invitó SIGUE siendo titular, ANTES de la transacción', () => {
  const f = cuerpo(INVITACIONES, 'async function aceptarInvitacionPatrimonio(')
  const titular = f.indexOf('esTitularPatrimonio(fila.otorgadaPorIdentidadId, fila.otorganteClienteId)')
  const tx = f.indexOf('$transaction')
  assert.ok(titular > 0 && tx > titular)
  assert.match(f, /fila\.otorgadaPorIdentidadId === identidadId/)
  assert.match(f, /autorizadoIdentidadId: identidadId,/)
  assert.match(f, /versionTexto: textoConcesionPatrimonio\(patrimonio\)\.version/)
  // Y `responderInvitacion` lo enruta DESPUÉS de comprobar el correo (T1).
  const r = cuerpo(INVITACIONES, 'export async function responderInvitacion(')
  assert.ok(r.indexOf('casaElCorreo(') < r.indexOf('aceptarInvitacionPatrimonio('))
})

test('🚨 la bóveda no lista ni amplía accesos de patrimonio (y conceder() no los da)', () => {
  const aut = ts(`${APP}/lib/autorizaciones.ts`)
  assert.match(aut, /NOT: \{ alcance: \{ in: \[\.\.\.ALCANCES_PATRIMONIO\] \} \}/)
  assert.match(cuerpo(aut, 'export async function ampliarAcceso('), /if \(!esAlcance\(base\.alcance\)\)/)
  assert.match(cuerpo(aut, 'export async function conceder('), /if \(!esAlcance\(datos\.alcance\)\)/)
})

test('🚨 SQL aditivo: transaccional, UN solo borrado (el CHECK viejo), el nuevo ANTES, y se aplica desde el editor', () => {
  assert.match(SQL, /^BEGIN;/m)
  assert.match(SQL, /^COMMIT;/m)
  const borrados = [...SQL.matchAll(/\bDROP\b[^;]*;/gi)].map((x) => x[0].replace(/\s+/g, ' '))
  assert.deepEqual(borrados, ['DROP CONSTRAINT IF EXISTS portal_invitacion_alcance;'])
  assert.ok(SQL.indexOf('ADD CONSTRAINT portal_invitacion_alcance_v2') < SQL.indexOf('DROP CONSTRAINT'))
  assert.match(SQL, /CHECK \(alcance IN \('ver', 'ver_economico', 'ninguno', 'patrimonio_gestion', 'patrimonio_total'\)\)/)
  assert.match(SQL, /CHECK \(alcance NOT IN \('patrimonio_gestion', 'patrimonio_total'\) OR poliza_id IS NULL\)/)
  assert.match(crudo(RUTA_SQL), /EDITOR SQL de Supabase, NO por el MCP/i)
  assert.doesNotMatch(SQL, /\bDELETE\b|\bTRUNCATE\b|ALTER COLUMN|\bGRANT\b/i)
})
