import { temaModulo } from '../src/lib/instagram-theme'

const cases: Array<[string | null | undefined, string]> = [
  ['qr', '#3F7D44'],
  ['VeriFactu', '#E8A33B'],   // case-insensitive
  ['  almacen ', '#9C8E7E'],  // trim
  ['desconocido', '#D9442B'], // fallback
  [null, '#D9442B'],
  [undefined, '#D9442B'],
]
let ok = true
for (const [input, expected] of cases) {
  const got = temaModulo(input).accent
  const pass = got === expected
  if (!pass) ok = false
  console.log(`${pass ? 'PASS' : 'FAIL'} temaModulo(${JSON.stringify(input)}) = ${got} (esperado ${expected})`)
}
if (!ok) { console.error('SMOKE THEME FALLÓ'); process.exit(1) }
console.log('SMOKE THEME OK')
