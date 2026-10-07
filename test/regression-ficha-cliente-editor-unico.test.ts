import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Guardián del EDITOR ÚNICO de la ficha de cliente (06/10/2026, Alberto: «los datos personales se
// editan en cinco sitios distintos y el resumen de arriba no es editable»). Identidad, contacto,
// dirección, carnés y mote se editan en UN panel, `EditarFicha`, que se abre con «✏️ Editar datos»
// desde la cabecera. Ni tsc ni el build cazan que alguien vuelva a montar un editor suelto en una
// pestaña: se vigila leyendo los FUENTES (sin importar módulos).
//
// El panel es `PanelDatosCliente` y lo montan TRES flujos con él, sin editor propio: la ficha
// (`EditarFicha`), el modal «Editar datos» de la oportunidad (`EditarFichaModal`) y la tarificación de un
// coche (`AutoNuevo`). Ningún otro fichero de `correduria/**` monta editores de identidad, dirección ni carnés.

const ROOT = join(import.meta.dirname, '..')
const BASE = join(ROOT, 'apps/plataforma/app/(usuario)/correduria')
const FICHA = 'cliente/[id]/EditarFicha.tsx'
const PANEL = 'cliente/[id]/PanelDatosCliente.tsx'
const MONTAN_PANEL = [FICHA, 'oportunidad/[id]/EditarFichaModal.tsx', 'cliente/[id]/auto-nuevo/AutoNuevo.tsx']

function fuentes(dir = BASE): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return fuentes(p)
    return /\.tsx$/.test(n) ? [relative(BASE, p)] : []
  })
}
const leer = (rel: string) => readFileSync(join(BASE, rel), 'utf8')

test('la cabecera monta EditarFicha (el botón «✏️ Editar datos» está en todas las pestañas)', () => {
  assert.match(leer('cliente/[id]/Cabecera.tsx'), /<EditarFicha\b/)
})

test('el panel tiene UN botón «Guardar cambios» y monta los contactos en modo editable; EditarFicha lo abre con «✏️ Editar datos»', () => {
  const src = leer(PANEL)
  assert.equal((src.match(/'Guardar cambios'/g) ?? []).length, 1)
  assert.match(src, /<ContactosFicha\s[^>]*\beditable\b/)
  assert.match(leer(FICHA), /<PanelDatosCliente\b/)
  assert.ok(leer(FICHA).includes('✏️ Editar datos'))
})

test('la ficha, el modal de la oportunidad y AutoNuevo montan el panel único (no uno propio)', () => {
  for (const f of MONTAN_PANEL) assert.match(leer(f), /<PanelDatosCliente\b/, `${f} debe montar PanelDatosCliente`)
})

test('los editores antiguos ya no existen (EditarCarnets, EditarDireccion, BloqueIdentidad, EditarCliente)', () => {
  const todo = fuentes().map(leer).join('\n')
  assert.doesNotMatch(todo, /\bEditarCarnets\b/)
  assert.doesNotMatch(todo, /\b(BloqueIdentidad|EditarDireccion)\b(?!Riesgo)/)
  assert.doesNotMatch(todo, /<EditarCliente\b/)
})

test('ContactosFicha es de solo lectura salvo que se pida `editable`', () => {
  assert.match(leer('ContactosFicha.tsx'), /editable = false/)
})

// Un brazo por editor: dónde se puede montar cada uno.
const EDITORES: { nombre: string; patron: RegExp; permitidos: string[] }[] = [
  { nombre: 'identidad (BloqueIdentidad)', patron: /<BloqueIdentidad\b/, permitidos: [] },
  { nombre: 'identidad (EditarCliente)', patron: /<EditarCliente\b/, permitidos: [] },
  { nombre: 'dirección (EditarDireccion)', patron: /<EditarDireccion\b/, permitidos: [] },
  { nombre: 'carnés (EditarCarnets)', patron: /<EditarCarnets\b/, permitidos: [] },
  { nombre: 'dirección (DireccionConfirmable)', patron: /<DireccionConfirmable\b/, permitidos: [PANEL, 'NuevoCliente.tsx', 'poliza/[id]/EditarDireccionRiesgo.tsx'] },
  { nombre: 'carnés (TIPOS_CARNET en un select)', patron: /TIPOS_CARNET\.map\(/, permitidos: [PANEL] },
  { nombre: 'mote (MoteAgenda)', patron: /<MoteAgenda\b/, permitidos: [] },
  { nombre: 'poner nombre (PonerNombre)', patron: /<PonerNombre\b/, permitidos: [] },
  { nombre: 'contactos en modo edición (ContactosFicha editable)', patron: /<ContactosFicha\s[^>]*\beditable\b/, permitidos: [PANEL] },
]

for (const e of EDITORES) {
  test(`el editor de ${e.nombre} no se monta fuera de su sitio`, () => {
    const dentro = fuentes().filter((f) => e.patron.test(leer(f)))
    const fuera = dentro.filter((f) => !e.permitidos.includes(f) && f !== PANEL)
    assert.deepEqual(fuera, [], `Editor suelto en: ${fuera.join(', ')}. Los datos del cliente se editan en PanelDatosCliente.`)
  })
}

test('ni la cabecera ni las pestañas de la ficha montan ningún editor de datos personales', () => {
  const todos = EDITORES.map((e) => e.patron)
  for (const f of ['cliente/[id]/Cabecera.tsx', 'cliente/[id]/TabContactos.tsx', 'cliente/[id]/page.tsx']) {
    const src = leer(f)
    for (const p of todos) assert.doesNotMatch(src, p, `${f} monta un editor suelto (${p})`)
  }
})

test('el carné nuevo precargado con la fecha de la póliza NO cuenta como cambio: `nuevoPide` depende de `nuevoTocado`', () => {
  const src = leer(PANEL)
  assert.match(src, /const nuevoPide = [^\n]*\bnuevoTocado\b/)
  assert.match(src, /const nuevoPide = [^\n]*carnets !== null/)
  assert.match(src, /const nuevoPide = [^\n]*verCarnets/)
  assert.match(src, /const verCarnets = [^\n]*!juridica/)
})
