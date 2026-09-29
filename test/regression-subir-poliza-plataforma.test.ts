// Guardián: «Subir póliza» NO saca a Alberto de plataforma. `node --test`.
//
// Hasta el 28/09/2026 los dos botones «Subir póliza» (cabecera de /correduria y
// ficha del cliente) acababan en `asegura/cartera/subir`: otro dominio, otra
// sesión — «te lleva a otra web». Mismo fallo que retarificar el 03/09
// (`regression-retarificar-plataforma`). Un `href` a otro dominio compila igual
// de bien, así que solo lo ve leer el fuente.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
// Sin comentarios: la historia del bug se cuenta en ellos y no debe contar como enlace.
const leer = (p: string) => readFileSync(join(ROOT, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const COR = 'apps/plataforma/app/(usuario)/correduria'
const PAGINA = `${COR}/subir-poliza/page.tsx`
const PANTALLA = `${COR}/subir-poliza/SubirPoliza.tsx`
const CABECERA_FICHA = `${COR}/cliente/[id]/Cabecera.tsx`
const RUTA_LEER = 'apps/plataforma/app/api/correduria/oportunidad/leer/route.ts'

test('/correduria/subir-poliza es una pantalla, no un redirect a asegura', () => {
  const s = leer(PAGINA)
  assert.doesNotMatch(s, /\bredirect\s*\(/, 'la página vuelve a redirigir fuera')
  assert.doesNotMatch(s, /urlSubirPoliza|cartera\/subir/)
  assert.match(s, /<SubirPoliza\b/)
})

test('la pantalla lee por la ruta de plataforma, no por asegura', () => {
  const s = leer(PANTALLA)
  assert.match(s, /['"]\/api\/correduria\/oportunidad\/leer['"]/)
  assert.doesNotMatch(s, /central-asegura|ASEGURA_URL|cartera\/subir/)
})

test('el botón de la ficha va a su pestaña Documentos, en la misma pestaña', () => {
  const s = leer(CABECERA_FICHA)
  const i = s.indexOf('/> Subir póliza')
  assert.ok(i > 0, 'no está el botón')
  const tramo = s.slice(Math.max(0, i - 400), i)
  assert.match(tramo, /tab=documentos&subir=poliza/)
  assert.doesNotMatch(tramo, /nuevaPestana|urlSubirPoliza/)
})

test('nadie en plataforma vuelve a enlazar asegura/cartera/subir', () => {
  assert.doesNotMatch(leer('apps/plataforma/lib/ficha-asegura.ts'), /cartera\/subir/)
})

test('el sello del tomador (alta cifrada) no viaja al navegador', () => {
  const s = leer(RUTA_LEER)
  assert.match(s, /sinSello\(r\.json\)/)
  assert.match(s, /sello:\s*_sello/)
})

// 29/09/2026: el enlace llegaba bien, pero el formulario seguía en un <details>
// CERRADO debajo de las baldosas — en el móvil el botón «no funcionaba».
test('con «subir=poliza» el formulario de Documentos se abre y se trae a la vista', () => {
  const s = leer(`${COR}/Documentos.tsx`)
  assert.match(s, /<details ref=\{formRef\} open=\{tipoInicial \? true : undefined\}/)
  assert.match(s, /if \(tipoInicial\) formRef\.current\?\.scrollIntoView\(/)
})

// 29/09/2026: la póliza subida a la ficha se lee sola y abre oportunidad con su bonus.
test('Documentos lee con IA SOLO las pólizas de la ficha (cada lectura es de pago)', () => {
  const s = leer(`${COR}/Documentos.tsx`)
  assert.match(s, /const leerPoliza = !!clienteId && !polizaId && !siniestroId/)
  assert.match(s, /if \(tipo === 'poliza' && leerPoliza\) void leerPolizaSubida\(fichero\)/)
})

test('asegura devuelve el bonus leído y la oportunidad lo guarda', () => {
  assert.match(leer('apps/asegura/app/api/operador/leer-documento/route.ts'), /seguroAnterior: auto\s*\?\s*seguroAnteriorDe\(/)
  assert.match(leer('apps/asegura/app/api/operador/oportunidad/route.ts'), /seguroAnterior: b\.seguroAnterior/)
  assert.match(leer('apps/asegura/lib/oportunidad-seguimiento.ts'), /a\.seguroAnterior \? \{ seguroAnterior: a\.seguroAnterior \}/)
})

test('con la oportunidad ya abierta, lo leído se guarda en ELLA (no se pierde con el 409)', () => {
  const s = leer('apps/asegura/lib/oportunidad-seguimiento.ts')
  const tramo = s.slice(s.indexOf('if (ya) {'), s.indexOf("completada: false }"))
  assert.match(tramo, /update oportunidades set/)
  assert.match(tramo, /seguroAnterior: a\.seguroAnterior/)
})
