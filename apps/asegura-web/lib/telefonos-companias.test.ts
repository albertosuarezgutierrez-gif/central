import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { FECHA_VERIFICACION } from './companias-baja.ts'
import { TELEFONOS_COMPANIAS, hrefTel, telefonosParaPublicar } from './telefonos-companias.ts'

test('cada compañía tiene su página oficial y no se da por verificada sin fecha', () => {
  for (const c of TELEFONOS_COMPANIAS) {
    assert.match(c.fuente, /^https:\/\/www\.[a-z0-9-]+\.(es|com)\//, `${c.slug}: fuente que no es una URL oficial`)
    if (c.verificado) assert.match(c.verificadoEl ?? '', FECHA_VERIFICACION, `${c.slug}: verificado sin fecha`)
    else assert.equal(c.verificadoEl, null, `${c.slug}: fecha de verificación sin verificar`)
    if (c.whatsapp) assert.match(c.whatsapp, /^\+\d{9,15}$/, `${c.slug}: WhatsApp fuera de E.164`)
    for (const a of c.asistencia) {
      assert.ok(a.para.trim() && a.numeros.length > 0, `${c.slug}: línea de asistencia sin rótulo o sin número`)
    }
  }
})

// 🚨 El cepo que importa: una compañía sin verificar sale en la lista, pero
// SIN ningún número. Se mira el objeto que recibe la página, no una copia.
test('de una compañía sin verificar no sale ningún número hacia la página', () => {
  // Desde el 23/09/2026 todas están verificadas, así que el cepo mira una
  // compañía sin verificar fabricada aquí: sin ella miraría al vacío.
  const lista = [...TELEFONOS_COMPANIAS, { ...TELEFONOS_COMPANIAS[0], slug: 'sin-verificar', verificado: false, verificadoEl: null }]
  const salida = telefonosParaPublicar(lista)
  assert.equal(salida.length, lista.length, 'una compañía desaparece de la lista en vez de decir «pídenoslo»')
  const sinVerificar = salida.filter((s) => !s.publicable)
  assert.ok(sinVerificar.length > 0, 'no hay compañías sin verificar que vigilar: el cepo miraría al vacío')
  for (const s of sinVerificar) {
    assert.deepEqual(Object.keys(s.c).sort(), ['fuente', 'nombre', 'slug'], `${s.c.slug}: sale algo más que nombre y fuente`)
  }
})

test('la página pinta desde `telefonosParaPublicar()` y no teclea ningún número de compañía', () => {
  const pagina = readFileSync(new URL('../app/telefonos-siniestros/page.tsx', import.meta.url), 'utf8')
  assert.match(pagina, /telefonosParaPublicar\(\)/, 'la página ya no usa el filtro de verificadas')
  assert.doesNotMatch(pagina, /TELEFONOS_COMPANIAS/, 'la página lee la lista cruda y se salta el filtro')
  for (const c of TELEFONOS_COMPANIAS) {
    for (const n of [c.siniestros, ...c.asistencia.flatMap((a) => a.numeros), c.whatsapp]) {
      if (n) assert.ok(!pagina.includes(n), `${c.slug}: el número ${n} está tecleado en la página`)
    }
  }
})

test('los enlaces tel: salen marcables', () => {
  assert.equal(hrefTel('917 83 83 83'), 'tel:+34917838383')
  assert.equal(hrefTel('+34917838383'), 'tel:+34917838383')
})

test('la página está en el sitemap y la enlaza /siniestro (nada huérfano)', () => {
  const sitemap = readFileSync(new URL('../app/sitemap.ts', import.meta.url), 'utf8')
  assert.match(sitemap, /url\('\/telefonos-siniestros'\)/)
  const siniestro = readFileSync(new URL('../app/siniestro/page.tsx', import.meta.url), 'utf8')
  assert.match(siniestro, /href="\/telefonos-siniestros"/)
})
