// apps/sivra/scripts/seo/test-landing.ts
// Verificación pura (sin red): se corre con `npx --yes tsx`.
import { applySeoReplacements } from '../../lib/seo-landing'

let fallos = 0
const check = (n: string, c: boolean) => { if (!c) { console.error(`✗ ${n}`); fallos++ } else console.log(`✓ ${n}`) }

// Landing como string con comillas escapadas (igual que el app/route.ts real).
const SAMPLE = `<title>Viejo</title><meta name=\\"description\\" content=\\"old desc\\"><meta property=\\"og:title\\" content=\\"old ogt\\"><meta property=\\"og:description\\" content=\\"old ogd\\">`

const out = applySeoReplacements(SAMPLE, 'Nuevo', 'new desc', 'new ogd')
check('reemplaza title', out.includes('<title>Nuevo</title>'))
check('reemplaza description', out.includes('content=\\"new desc\\"'))
check('reemplaza og:title (usa title)', out.includes('content=\\"Nuevo\\"'))
check('reemplaza og:description', out.includes('content=\\"new ogd\\"'))

// Schema: si NO existe bloque ld+json, no se inserta nada.
const sinLd = applySeoReplacements(SAMPLE, 'T', 'D', 'O', '{"@type":"VacationRental"}')
check('schema NO se inserta si no existe bloque', !sinLd.includes('ld+json'))

// Schema: si SÍ existe bloque, se reemplaza su contenido.
const conBloque = SAMPLE + `<script type=\\"application/ld+json\\">{\\"old\\":1}<\/script>`
const conLd = applySeoReplacements(conBloque, 'T', 'D', 'O', '{"@type":"VacationRental"}')
check('schema se reemplaza si existe bloque', conLd.includes('VacationRental'))
check('schema viejo desaparece', !conLd.includes('\\"old\\":1'))

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1) }
console.log('\nseo-landing OK')
