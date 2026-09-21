import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Guardián del VOLCADO HISTÓRICO de la ficha de cliente (21/09/2026). Alberto,
// con la captura delante: «duplicidad». Eran dos filas del bloque «Volcado
// histórico» del mismo FORD FOCUS (3935GPY, mismo vencimiento 07/10/2023, sin
// número de póliza) que solo se diferenciaban en la prima: 210,00€ y 201,00€.
// No era un fallo de la consulta ni un JOIN que multiplica: son dos filas
// distintas de `seguros.polizas` del volcado de junio de 2026
// (`asegura_app:pol2:14569` y `:15128`). Medido sobre la cartera real ese día:
// 84 grupos, 188 filas, 77 clientes, y NINGUNO toca la cartera viva — o sea,
// ruido de pantalla, no un recuento de clientes mal hecho.
//
// Lo que vigila este cepo, y que ni `tsc` ni el build ven:
//   1. que el bloque del volcado siga agrupando;
//   2. que las VIVAS, las canceladas y las pendientes NO agrupen nunca (ahí dos
//      filas iguales son un fallo de conciliación Codeoscopic↔CIMA que hay que
//      VER — `polizasDuplicadas` de @central/module-seguros);
//   3. que agrupar siga siendo juntar, no elegir: se enseñan todas las primas y
//      se enlaza a cada fila.

const PIEZAS = join(import.meta.dirname, '..', 'apps/plataforma/app/(usuario)/correduria/cliente/[id]/piezas.tsx')
const TAB = join(import.meta.dirname, '..', 'apps/plataforma/app/(usuario)/correduria/cliente/[id]/TabPolizas.tsx')
const piezas = readFileSync(PIEZAS, 'utf8')
const tab = readFileSync(TAB, 'utf8')

/** El bloque JSX de `<Polizas …>` cuyo título contiene `titulo`. */
function bloque(titulo: string): string {
  const i = tab.indexOf(titulo)
  assert.notEqual(i, -1, `no se encuentra el bloque «${titulo}» en TabPolizas.tsx`)
  const abre = tab.lastIndexOf('<Polizas', i)
  const cierra = tab.indexOf('/>', i)
  assert.ok(abre !== -1 && cierra !== -1, `el bloque «${titulo}» no es un <Polizas .../>`)
  return tab.slice(abre, cierra)
}

test('el volcado histórico agrupa las filas que solo cambian de prima', () => {
  assert.match(bloque('Volcado histórico'), /agruparIguales/)
  assert.match(piezas, /agruparHistoricas\(/, 'la regla sigue viniendo del helper puro y testeado')
})

test('las vivas, las canceladas y las pendientes NO agrupan: ahí un duplicado hay que verlo', () => {
  for (const titulo of ['Pólizas vivas', 'pendientes de confirmación por CIMA', 'Canceladas en CIMA']) {
    assert.doesNotMatch(bloque(titulo), /agruparIguales/, `${titulo} no puede agrupar`)
  }
  // `<Polizas` del tab de Resumen y cualquier otro consumidor: solo UNO agrupa.
  assert.equal((tab.match(/agruparIguales/g) ?? []).length, 1)
})

test('agrupar es juntar, no elegir: se enseñan TODAS las primas y se enlaza a cada fila', () => {
  assert.match(piezas, /grupo\.primas\.map\(n => eur\(n\)\)/, 'la celda de prima enseña todas las primas del grupo')
  assert.match(piezas, /grupo\.filas\.map\(\(f, i\) => \(/, 'cada fila del grupo conserva su enlace')
  assert.doesNotMatch(piezas, /grupo\.primas\[0\]/, 'nadie elige «la» prima del grupo')
  assert.doesNotMatch(piezas, /\.slice\(0, 1\)/, 'no se recorta el grupo a su primera fila')
})

test('la prima sin dato del grupo no se pinta como 0€', () => {
  const primaGrupo = piezas.slice(piezas.indexOf('function PrimaGrupo('), piezas.indexOf('function ObjetoCelda('))
  assert.match(primaGrupo, /grupo\.primas\.length === 0/)
  assert.match(primaGrupo, /sin dato/)
  assert.doesNotMatch(primaGrupo, /\?\? 0|\|\| 0/, 'un «no se sabe» no se colapsa a 0€')
})

test('sin bien conocido la fila va sola: no se funde lo que no se puede distinguir', () => {
  const huella = piezas.slice(piezas.indexOf('export function huellaBien('), piezas.indexOf('function FilasIguales('))
  assert.match(huella, /o\.estado === 'no_informado'/)
  assert.match(huella, /o\.estado === 'cifrado'/)
  assert.match(huella, /return null/)
})

test('el usuario ve que son varias filas del volcado, no una póliza inventada', () => {
  assert.match(piezas, /🔁 \{grupo\.filas\.length\} filas del volcado/)
  assert.match(tab, /🔁/, 'la nota del bloque explica el símbolo')
})
