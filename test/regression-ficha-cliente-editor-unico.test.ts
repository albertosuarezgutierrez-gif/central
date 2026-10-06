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
// Excepción declarada: `AutoNuevo` (corregir el tomador sin salir del flujo de tarificación) y
// `EditarFichaModal` (editar a la persona de una oportunidad) son OTROS flujos, no la ficha del
// cliente; siguen usando los editores de `EditarCliente`/`EditarCarnets`.

const ROOT = join(import.meta.dirname, '..')
const BASE = join(ROOT, 'apps/plataforma/app/(usuario)/correduria')
const FICHA = 'cliente/[id]/EditarFicha.tsx'
const OTROS_FLUJOS = ['cliente/[id]/auto-nuevo/AutoNuevo.tsx', 'oportunidad/[id]/EditarFichaModal.tsx']

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

test('EditarFicha tiene UN botón «Guardar cambios» y monta los contactos en modo editable', () => {
  const src = leer(FICHA)
  assert.equal((src.match(/'Guardar cambios'/g) ?? []).length, 1)
  assert.match(src, /<ContactosFicha\s[^>]*\beditable\b/)
  assert.ok(src.includes('✏️ Editar datos'))
})

test('ContactosFicha es de solo lectura salvo que se pida `editable`', () => {
  assert.match(leer('ContactosFicha.tsx'), /editable = false/)
})

// Un brazo por editor: dónde se puede montar cada uno.
const EDITORES: { nombre: string; patron: RegExp; permitidos: string[] }[] = [
  { nombre: 'identidad (BloqueIdentidad)', patron: /<BloqueIdentidad\b/, permitidos: ['EditarCliente.tsx'] },
  { nombre: 'identidad (EditarCliente)', patron: /<EditarCliente\b/, permitidos: OTROS_FLUJOS },
  { nombre: 'dirección (EditarDireccion)', patron: /<EditarDireccion\b/, permitidos: OTROS_FLUJOS },
  { nombre: 'carnés (EditarCarnets)', patron: /<EditarCarnets\b/, permitidos: OTROS_FLUJOS },
  { nombre: 'mote (MoteAgenda)', patron: /<MoteAgenda\b/, permitidos: [] },
  { nombre: 'poner nombre (PonerNombre)', patron: /<PonerNombre\b/, permitidos: [] },
  { nombre: 'contactos en modo edición (ContactosFicha editable)', patron: /<ContactosFicha\s[^>]*\beditable\b/, permitidos: [FICHA] },
]

for (const e of EDITORES) {
  test(`el editor de ${e.nombre} no se monta fuera de su sitio`, () => {
    const dentro = fuentes().filter((f) => e.patron.test(leer(f)))
    const fuera = dentro.filter((f) => !e.permitidos.includes(f) && f !== FICHA)
    assert.deepEqual(fuera, [], `Editor suelto en: ${fuera.join(', ')}. Los datos del cliente se editan en EditarFicha.`)
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
  const src = leer(FICHA)
  assert.match(src, /const nuevoPide = [^\n]*\bnuevoTocado\b/)
  assert.match(src, /const nuevoPide = [^\n]*carnets !== null/)
  assert.match(src, /const nuevoPide = [^\n]*!juridica/)
})
