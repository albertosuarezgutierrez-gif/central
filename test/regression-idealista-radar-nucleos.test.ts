// Guardián de la rutina `idealista-radar`. `node --test` (gate en `pnpm test:guardia`).
//
// La rutina manda cada búsqueda del conector con su `nucleo`, y el servidor la zonifica con
// `centroBusquedaIdealista()`. Un núcleo de la tabla de la skill SIN centro en `CENTROS` no
// falla en ningún test ni en ningún build: falla en producción, en la pasada diaria, como un
// `error` dentro de `porNucleo` — y ese núcleo deja de entrar al corpus. Este test lee la
// tabla de la skill tal cual y exige un centro para cada fila.
//
// En el norte, además, el núcleo tiene que ser un municipio que reconozca la lente 🌊
// (`costaNorteDe`): la zona que se guarda es «barrio, núcleo», y si la lente no la
// reconoce, la casa entra al corpus pero nunca salta el aviso de casa de playa.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { centroBusquedaIdealista } from '../packages/module-subastas/src/idealista-api.ts'
import { costaNorteDe } from '../packages/module-subastas/src/costa-norte.ts'

const SKILL = readFileSync(new URL('../.claude/skills/idealista-radar/SKILL.md', import.meta.url), 'utf8')

const filas = SKILL.split('\n')
  .map((l) => l.match(/^\|\s*(diario|L-X-V|M-J-S|D)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/))
  .filter((m): m is RegExpMatchArray => m !== null)
  .map((m) => ({ turno: m[1], nucleo: m[2], busqueda: m[3] }))

test('la tabla de núcleos de la skill se lee (si cambia de forma, este test deja de vigilar)', () => {
  assert.ok(filas.length >= 30, `solo se leyeron ${filas.length} filas`)
  for (const t of ['diario', 'L-X-V', 'M-J-S', 'D']) {
    assert.ok(filas.some((f) => f.turno === t), `sin núcleos en el turno ${t}`)
  }
})

test('cada núcleo de la skill tiene centro de búsqueda en CENTROS', () => {
  const sinCentro = filas.filter((f) => !centroBusquedaIdealista(f.nucleo)).map((f) => f.nucleo)
  assert.deepEqual(sinCentro, [])
})

test('los núcleos del norte los reconoce la lente 🌊 con su comunidad', () => {
  for (const f of filas) {
    if (f.turno === 'L-X-V') assert.equal(costaNorteDe(f.nucleo), 'Asturias', f.nucleo)
    if (f.turno === 'M-J-S') assert.equal(costaNorteDe(f.nucleo), 'Cantabria', f.nucleo)
  }
})

test('ningún núcleo del norte cae en el centro de otro (orden de CENTROS)', () => {
  // Gijón/Avilés/Oviedo son patrones genéricos: si capturasen un núcleo de costa, el radio
  // sería el de la ciudad y todas sus casas saldrían «fuera de zona».
  const gijon = centroBusquedaIdealista('Gijón')
  for (const f of filas) {
    if ((f.turno === 'L-X-V' || f.turno === 'M-J-S') && f.nucleo !== 'Gijón') {
      assert.notDeepEqual(centroBusquedaIdealista(f.nucleo), gijon, f.nucleo)
    }
  }
})
