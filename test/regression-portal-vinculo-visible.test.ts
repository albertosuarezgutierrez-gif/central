// Cepo de los TRES textos de la bóveda vacía.
//
// ─── Qué protege ────────────────────────────────────────────────────────────
// Hasta el 06/09/2026 la bóveda decía lo mismo a un desconocido y a un cliente
// cuyo correo aparece en dos fichas: «No hemos encontrado ninguna póliza a
// nombre de este email». Para el segundo es FALSO —sí se han encontrado, y por
// eso precisamente no se le enseña ninguna— y le deja creyendo que ha perdido
// sus seguros. El aviso de 2,5 s de la pantalla de entrada no lo tapa: quien
// vuelve con la sesión viva (30 días) va directo a /boveda y no lo ve nunca.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RAIZ = new URL('..', import.meta.url).pathname
const BOVEDA = readFileSync(`${RAIZ}apps/asegura-portal/app/(portal)/boveda/page.tsx`, 'utf8')
const LECTURA = readFileSync(`${RAIZ}apps/asegura-portal/lib/cartera-lectura.ts`, 'utf8')
const VINCULO = readFileSync(`${RAIZ}apps/asegura-portal/lib/vinculo.ts`, 'utf8')

/** Sin comentarios: el texto que explica el fallo contiene la frase prohibida. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const BOVEDA_CODIGO = sinComentarios(BOVEDA)

test('🚨 la boveda distingue el vinculo ambiguo, y NO le dice que no hay nada', () => {
  assert.match(BOVEDA_CODIGO, /ambiguo/, 'la bóveda no contempla el estado ambiguo')
  // El texto del ambiguo no puede contener la frase del desconocido.
  const trozo = BOVEDA_CODIGO.slice(BOVEDA_CODIGO.indexOf('ambiguo'))
  const hasta = trozo.slice(0, 600)
  assert.doesNotMatch(hasta, /No hemos encontrado ninguna p[oó]liza/)
})

test('🚨 la boveda dice cuando NO se ha podido comprobar', () => {
  // Hoy esto solo se decía en la entrada, y quien llega con sesión viva no pasa
  // por ahí: para él, un fallo de clave se veía igual que «no eres cliente».
  assert.match(BOVEDA_CODIGO, /sin_clave|no se ha podido comprobar/i)
})

test('🚨 el estado del vinculo se DERIVA en el servidor, no llega por la URL', () => {
  // Un `?vinculo=ambiguo` sería una pantalla que miente a quien la manipula.
  assert.doesNotMatch(BOVEDA_CODIGO, /searchParams[^\n]*vinculo/)
  // `/vinculo/` a secas ya casaba con `SIN_VINCULO` y con `nivelDeVinculo`: este
  // cepo pasaba en vacío antes de que el campo existiera. Se exige el campo.
  assert.match(
    sinComentarios(LECTURA),
    /\bvinculo:\s*VinculoPortal\s*\|\s*null/,
    'CarteraPortal tiene que llevar el estado del vínculo, y admitir «no consta»',
  )
})

test('🚨 el vinculo se sella SIEMPRE, tambien cuando sale bien', () => {
  // Un sello que solo se escribiera en los casos malos dejaría a quien ya se
  // vinculó con el estado viejo, y la bóveda le explicaría un problema resuelto.
  //
  // ⚠️ No basta con que la llamada EXISTA: un `if (r.estado !== 'ok') await
  // sellarVinculo(...)` la deja escrita y rompe justo lo que esto protege. Lo
  // que se comprueba es que la sentencia entera sea la llamada y nada más.
  const codigo = sinComentarios(VINCULO)
  const lineas = codigo
    .split('\n')
    .filter((l) => l.includes('sellarVinculo(identidadId') && !l.includes('function'))
  assert.equal(lineas.length, 1, 'el sello se llama en un solo sitio, y desde `vincularIdentidad`')
  assert.match(
    lineas[0].trim(),
    /^await sellarVinculo\(identidadId,\s*r\.estado\)$/,
    'el sello tiene que ser incondicional: nada delante de `await`, ningún `if` ni ternario',
  )
})

test('🚨 un vinculo desconocido NO se lee como «sin ficha»', () => {
  // La columna admite seis valores y la BD los vigila, pero un despliegue viejo
  // podría dejar cualquier cosa: lo que no se reconoce es «no se sabe».
  //
  // ⚠️ Vigilar una grafía concreta (`ultimoVinculo ?? 'sin_ficha'`) es vigilar
  // una que el código ni usa: el sitio donde se decide es el respaldo de
  // `leerVinculo`, y ahí el único valor admisible es `null`.
  const codigo = sinComentarios(LECTURA)
  const i = codigo.indexOf('function leerVinculo')
  assert.notEqual(i, -1, 'la lectura tiene que pasar por `leerVinculo`, no por un cast suelto')
  const cuerpo = codigo.slice(i, codigo.indexOf('\n}', i))
  assert.match(cuerpo, /:\s*null\b/, 'lo que no se reconoce cae a `null`')
  assert.doesNotMatch(
    cuerpo,
    /:\s*'(ok|ya_vinculada|sin_ficha|ambiguo|sin_clave|error)'/,
    'un valor desconocido NO puede caer a un estado concreto: eso es inventarse un diagnóstico',
  )
})
