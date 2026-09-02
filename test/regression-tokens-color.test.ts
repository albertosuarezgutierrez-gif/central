// Guardián: en `apps/plataforma` los colores semánticos se dicen con TOKENS, no con hex fijos.
// `node --test` (gate en CI vía `pnpm test:guardia`).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// La app se pinta con estilos en línea (no hay Tailwind) y el tema vive en
// `app/globals.css`: `--positive`, `--negative`, `--warning`, `--info`, sus
// fondos suaves, `--muted`, `--border` y `--text`. Esos tokens CAMBIAN de valor
// cuando `html[data-theme="dark"]`; un `#16a34a` escrito a mano NO.
//
// El resultado de mezclarlos no es «se ve distinto»: es que en modo oscuro la
// pantalla deja de LEERSE. Un `background: '#dcfce7'` (verde clarito) sigue
// siendo verde clarito con el texto ya en blanco encima, y un `color: '#166534'`
// (verde oscuro) cae sobre un `--positive-bg` que en oscuro es translúcido. En
// las dos direcciones el usuario acaba mirando un rectángulo sin texto — y son
// pantallas de DINERO: el importe que no se lee es el importe sobre el que
// Alberto decide.
//
// Por eso el cepo mira los DOS lados de la pareja: los tonos vivos (texto de
// estado) y los fondos suaves. Convertir solo la mitad deja el oscuro PEOR que
// antes de tocarlo, que fue el error que este guardián nació para no repetir
// (barrido de ~680 hex → tokens, 02/09/2026).
//
// Lo que NO persigue, y está en `EXCEPCIONES` con su motivo: la paleta de marca
// de SIVRA, las paletas CATEGÓRICAS de las gráficas (3+ series: convertirlas a
// semántica sería decir «esta serie es buena y esta mala», que es mentira), los
// lienzos de Leaflet —donde `var()` sencillamente no llega— y los componentes
// que ya se pintan su propia paleta clara/oscura.
//
// Nota: los hex con canal alfa (`#16a34a20`) no entran aquí — una capa
// translúcida funciona igual sobre fondo claro y oscuro.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const APP = path.join(ROOT, 'apps/plataforma/app')

/** hex fijo → token semántico que debe usarse en su lugar. */
const MAPA: Record<string, string> = {}
const registrar = (token: string, hexes: string[]) => {
  for (const h of hexes) MAPA[h] = token
}
registrar('--positive', ['16a34a', '15803d', '059669', '10b981', '22c55e', '276749', '38a169', '2f855a'])
registrar('--positive-bg', ['dcfce7', 'c6f6d5', 'ecfdf5', 'f0fdf4', 'd1fae5'])
registrar('--negative', ['dc2626', 'ef4444', 'e53e3e', 'b91c1c', 'c53030', '991b1b'])
registrar('--negative-bg', ['fef2f2', 'fee2e2', 'fed7d7', 'fecaca'])
registrar('--warning', ['b45309', 'd97706', 'f59e0b', '92400e', 'ea580c', 'c05621'])
registrar('--warning-bg', ['fffbeb', 'fef3c7', 'fef9c3', 'feebc8'])
registrar('--info', ['2563eb', '3b82f6', '1d4ed8'])
registrar('--info-bg', ['eff6ff', 'dbeafe', 'bee3f8'])
registrar('--muted', ['64748b', '6b7280', '718096', '94a3b8'])
registrar('--border', ['e2e8f0', 'e5e7eb', 'edf2f7'])
registrar('--text', ['0f172a', '1a202c', '111827'])

type Excepcion = {
  /** Ruta relativa a `apps/plataforma/`. Termina en `/` para eximir una carpeta entera. */
  archivo: string
  /** Si se indica, solo se exime la LÍNEA que contenga esta subcadena. */
  contiene?: string
  motivo: string
}

// ─── Excepciones DELIBERADAS ─────────────────────────────────────────────────
// Cada una dice por qué ese hex NO es un descuido. Añadir una exige el mismo
// esfuerzo: si no sabes escribir el motivo, es que hay que usar el token.
const EXCEPCIONES: Excepcion[] = [
  {
    archivo: 'app/admin/MapaArquitectura.tsx',
    motivo:
      'El mapa se pinta su PROPIA paleta dual (objeto PALETAS con las ramas dark y light, ' +
      'volcadas a variables --mapa-*). Ya resuelve el modo oscuro por su cuenta; meterle los ' +
      'tokens globales dejaría las dos ramas idénticas y rompería justo lo que hace bien.',
  },
  {
    archivo: 'app/(usuario)/sivra/resultado-pisos/GraficasRango.tsx',
    motivo:
      'Paleta CATEGÓRICA de un chart de recharts (ingresos / gastos / resultado / año anterior). ' +
      'Son series, no estados: pintar «gastos» de --negative afirmaría que gastar es un error.',
  },
  {
    archivo: 'app/(usuario)/finanzas/CategoriasTab.tsx',
    contiene: 'const COLORS = [',
    motivo: 'Paleta categórica de 10 tonos para las series del gráfico de categorías.',
  },
  {
    archivo: 'app/(usuario)/sivra/mercado/page.tsx',
    contiene: 'const PORTAL_COLORS',
    motivo:
      'Colores de MARCA de los portales (Booking, Tripadvisor, Expedia). El ámbar de Expedia no ' +
      'significa «aviso»: es su logotipo.',
  },
  {
    archivo: 'app/(usuario)/subastas/MapaSubastas.tsx',
    contiene: 'const color = p.enRadar',
    motivo:
      'Marcadores dibujados en el LIENZO de Leaflet: ahí no llega ningún token CSS (el propio ' +
      'código lo dice en su comentario). Hex fijos a propósito.',
  },
  {
    archivo: 'app/(usuario)/operador/flota-mapa/MapaHolding.tsx',
    contiene: 'const color = viva(',
    motivo: 'Mismo caso: circleMarker de Leaflet, sin acceso a las variables CSS.',
  },
  {
    archivo: 'app/(usuario)/banca/ResumenPeriodo.tsx',
    contiene: 'const DONA_COLORS',
    motivo:
      'Paleta CATEGÓRICA de 6 tonos para las porciones de la dona «reparto del gasto». Son ' +
      'categorías de gasto, no estados: teñir una de --negative diría que ese gasto está mal.',
  },
  {
    archivo: 'app/(usuario)/banca/ResumenPeriodo.tsx',
    contiene: '<Bar dataKey=',
    motivo:
      'Series del ComposedChart de recharts (ingresos / gastos / resultado), mismo caso que ' +
      'GraficasRango: distinguen series, no aciertos y errores.',
  },
]

function exento(rel: string, linea: string): boolean {
  return EXCEPCIONES.some((e) => {
    const coincideArchivo = e.archivo.endsWith('/') ? rel.startsWith(e.archivo) : rel === e.archivo
    if (!coincideArchivo) return false
    return e.contiene === undefined || linea.includes(e.contiene)
  })
}

function* tsx(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* tsx(p)
    else if (e.name.endsWith('.tsx')) yield p
  }
}

test('ningún .tsx de plataforma usa un hex fijo donde hay un token semántico', () => {
  const fallos: string[] = []

  for (const abs of tsx(APP)) {
    const rel = path.relative(path.join(ROOT, 'apps/plataforma'), abs)
    const lineas = fs.readFileSync(abs, 'utf8').split('\n')
    lineas.forEach((linea, i) => {
      if (exento(rel, linea)) return
      // 6 dígitos NO seguidos de otro dígito hex: así se ignoran los `#rrggbbaa`.
      for (const m of linea.matchAll(/#([0-9a-fA-F]{6})(?![0-9a-fA-F])/g)) {
        const hex = m[1].toLowerCase()
        const token = MAPA[hex]
        if (!token) continue
        fallos.push(
          `apps/plataforma/${rel}:${i + 1} → usa var(${token}) en vez de #${hex}: ` +
            'un hex fijo queda ilegible en modo oscuro (el token cambia con el tema, el hex no).',
        )
      }
    })
  }

  assert.deepEqual(
    fallos,
    [],
    'Hay colores semánticos escritos como hex fijo. En modo oscuro esas pantallas dejan de ' +
      'leerse (texto de estado sobre un fondo que ya no le corresponde), y son pantallas de ' +
      `dinero:\n  - ${fallos.join('\n  - ')}\n` +
      'Cámbialos por el token que dice el mensaje. Si el color NO es semántico (marca, serie de ' +
      'un chart, lienzo de Leaflet), añádelo a EXCEPCIONES de este mismo fichero CON su motivo.',
  )
})

test('el mapeo cubre las dos mitades de cada pareja (tono vivo y fondo suave)', () => {
  // Cepo del cepo: si alguien recorta el mapa y deja solo los tonos vivos, el
  // barrido volvería a convertir medias parejas — que es como se rompió el
  // oscuro la primera vez.
  for (const familia of ['--positive', '--negative', '--warning', '--info']) {
    const tonos = Object.values(MAPA).filter((t) => t === familia).length
    const fondos = Object.values(MAPA).filter((t) => t === `${familia}-bg`).length
    assert.ok(tonos > 0, `El mapeo no vigila ningún hex de ${familia}`)
    assert.ok(fondos > 0, `El mapeo vigila ${familia} pero no ${familia}-bg: media pareja.`)
  }
})

// ─── Tokens FANTASMA ─────────────────────────────────────────────────────────────────────────
// La otra puerta por la que se cuela un color fijo, y la más difícil de ver: `var(--algo, #fff)`
// con `--algo` que NO ESTÁ DEFINIDO en `globals.css`. El CSS es válido, nadie se queja, y el
// valor que se aplica SIEMPRE es el respaldo — es decir, el hex fijo, exactamente lo que el
// primer test persigue, pero disfrazado de token.
//
// Encontrados el 02/09/2026 al barrer los hex: `--danger`, `--success`, `--card` y `--background`
// se usaban con respaldo en ~35 sitios sin existir ninguno. El caso caro estaba en
// `banca/transferencia`: `var(--card, #fff)` (blanco clavado) al lado de `var(--text)` (que sí
// resuelve, y en oscuro es CLARO) → texto claro sobre fondo blanco. La pantalla de hacer
// transferencias, ilegible en modo oscuro, sin que ningún test fallara.
//
// El respaldo NO se prohíbe: `var(--surface, var(--bg))` encadena dos tokens que existen, y
// `var(--card, transparent)` es inofensivo. Lo que se prohíbe es INVENTARSE el token.
test('todo token usado con respaldo existe de verdad en globals.css', () => {
  const css = fs.readFileSync(path.join(ROOT, 'apps/plataforma/app/globals.css'), 'utf8')
  const definidos = new Set(Array.from(css.matchAll(/^\s*(--[a-z-]+)\s*:/gm), m => m[1]))

  const fallos: string[] = []
  const COMPONENTS = path.join(ROOT, 'apps/plataforma/components')
  const arboles = [APP, ...(fs.existsSync(COMPONENTS) ? [COMPONENTS] : [])]
  for (const abs of arboles.flatMap(d => [...tsx(d)])) {
    const rel = path.relative(path.join(ROOT, 'apps/plataforma'), abs)
    fs.readFileSync(abs, 'utf8').split('\n').forEach((linea, i) => {
      for (const m of linea.matchAll(/var\(\s*(--[a-z-]+)\s*,\s*([^)]*)/g)) {
        const [, token, respaldo] = m
        if (definidos.has(token)) continue
        // Un token inexistente cuyo respaldo es OTRO token (`var(--card-bg, var(--surface))`) pinta
        // bien: la cadena acaba en algo que sí cambia con el tema. Y `transparent`/`inherit`/
        // `currentColor` tampoco son un color fijo — se adaptan solos. El fallo es el respaldo que
        // clava un COLOR: ese se aplica siempre y no cambia en oscuro.
        const r = respaldo.trim()
        if (r.startsWith('var(') || ['transparent', 'inherit', 'currentColor', 'none'].includes(r)) continue
        fallos.push(`apps/plataforma/${rel}:${i + 1} → var(${token}, ${r})`)
      }
    })
  }

  assert.deepEqual(
    fallos,
    [],
    'Estos sitios usan un token que NO existe en globals.css, así que SIEMPRE aplican el valor de\n' +
      'respaldo — un color fijo que no cambia en modo oscuro, con la agravante de que parece un token:\n' +
      `  - ${fallos.join('\n  - ')}\n` +
      'Arréglalo usando el token real (--surface, --bg, --border, --text…) o definiendo el que falta.',
  )
})
