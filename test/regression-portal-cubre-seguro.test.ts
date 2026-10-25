// Cepo: «¿Esto lo cubre tu seguro?» (25/10/2026) y el informe fiscal del alquiler (portal del cliente).
//
// Lo que vigila (cada brazo falla por separado, ver `quitar()` en el pie):
//  1. el aviso parte de `accesosPatrimonio`, con la sesión comprobada, y descartar busca el gasto DENTRO de los avisos visibles;
//  2. la cobertura distingue `sin_comprobar` de `sin_seguro` (un `null` nunca es «No vemos seguro»);
//  3. «Dar parte» NO toca la lógica del parte: ParteSiniestro solo recibe el prellenado como valor inicial;
//  4. el informe fiscal: amortización sin dato = `null`, jamás `?? 0`; y CSV/ruta con la identidad de la cookie.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const RAIZ = new URL('..', import.meta.url).pathname
function leer(ruta: string): string {
  const src = readFileSync(`${RAIZ}${ruta}`, 'utf8')
  let out = ''
  let i = 0
  let comilla: string | null = null
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (comilla) {
      out += c
      if (c === '\\') { out += d ?? ''; i += 2; continue }
      if (c === comilla) comilla = null
      i++
    } else if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') i++
    } else if (c === '/' && d === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
    } else {
      if (c === '"' || c === "'" || c === '`') comilla = c
      out += c
      i++
    }
  }
  return out
}
const P = 'apps/asegura-portal/'

test('🚨 el aviso parte de accesosPatrimonio con la sesión comprobada; descartar busca DENTRO de los avisos visibles', () => {
  const bd = leer(`${P}lib/patrimonio/cubre-seguro-bd.ts`)
  assert.match(bd, /getIdentidad\(\)\)\?\.id !== identidadId/)
  assert.match(bd, /accesosPatrimonio\(identidadId\)/)
  assert.match(bd, /titularId: \{ in: titulares\.map/)
  assert.match(bd, /where: \{ identidadId, clave: \{ startsWith/)
  assert.match(bd, /avisos\.some\(\(a\) => a\.gastoId === gastoId\)/)
  assert.match(bd, /enlacesVivosDeInmuebles\(/)
  const ruta = leer(`${P}app/api/patrimonio/cubre-seguro/route.ts`)
  assert.match(ruta, /requireIdentidad\(\)/)
  assert.match(ruta, /esUuid\(cuerpo\?\.gasto\)/)
  assert.doesNotMatch(ruta, /identidadId\s*[:=]\s*(cuerpo|body|req)/)
})

test('🚨 sin_comprobar ≠ sin_seguro: fuentes null, enlace que no veo y vigencia null NO son «No vemos seguro»', () => {
  const p = leer(`${P}lib/patrimonio/cubre-seguro.ts`)
  assert.match(p, /visibles === null\) return \{ estado: 'sin_comprobar' \}/)
  assert.match(p, /v\.vigente === null\) dudosa = true/)
  assert.match(p, /dudosa \? \{ estado: 'sin_comprobar' \} : \{ estado: 'sin_seguro' \}/)
  const pen = leer(`${P}lib/pendiente-de-ti.ts`)
  assert.match(pen, /p\.reparaciones === null\) sinComprobar\.push/)
})

test('«Dar parte» no toca la lógica del parte: solo valores iniciales, con póliza válida', () => {
  const parte = leer(`${P}app/(portal)/boveda/ParteSiniestro.tsx`)
  assert.match(parte, /descripcion: prellenado\?\.descripcion \?\? ''/)
  assert.match(parte, /fechaHecho: prellenado\?\.fechaHecho \?\? ''/)
  assert.doesNotMatch(parte, /prellenado[^\n]*(fetch|enviar\()/)
  const page = leer(`${P}app/(portal)/boveda/page.tsx`)
  assert.match(page, /polizaEnLista === null\s*\?\s*null/)
})

test('🚨 informe fiscal: amortización sin dato es null (jamás ?? 0) y la ruta CSV usa la cookie', () => {
  const f = leer(`${P}lib/patrimonio/fiscal.ts`)
  assert.match(f, /amortizacionCent === null \? null : /)
  assert.doesNotMatch(f, /amortizacion[A-Za-z]*\s*\?\?\s*0/)
  assert.doesNotMatch(f, /rendimientoNetoCent:\s*rendimientoAntesAmortizacionCent/)
  const r = leer(`${P}app/api/patrimonio/rentabilidad/fiscal/route.ts`)
  assert.match(r, /requireIdentidad\(\)/)
  assert.match(r, /rentabilidadDeIdentidad\(identidad\.id/)
  assert.match(r, /status: 500/)
})
