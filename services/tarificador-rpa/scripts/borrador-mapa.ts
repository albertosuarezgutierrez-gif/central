// CLI del borrador de mapa desde la evidencia (14/10/2026, Fase 3). Offline, sin red ni navegador.
//
//   npm run borrador-mapa -- <evidencia.html|snapshot.txt> --compania allianz --ramo comunidades --pantalla datos-riesgo [--salida borrador.ts]
//
// Lee la sección `<!-- tarificador:aria … -->` del HTML de evidencia (o un .txt con el snapshot ya redactado) y escribe un
// .ts BORRADOR en stdout o en `--salida`. No se commitea solo: lo revisa un humano. El snapshot se vuelve a redactar por si
// el fichero viniera sin pasar por el runner.
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { separarAria, redactarAriaSnapshot } from '../src/aria-snapshot.ts'
import { borradorMapaDesdeAria, renderizarBorradorTs } from '../src/aprendizaje/borrador-mapa.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { compania: { type: 'string' }, ramo: { type: 'string' }, pantalla: { type: 'string' }, salida: { type: 'string' } },
})
const ruta = positionals[0]
if (!ruta || !values.compania || !values.ramo || !values.pantalla) {
  console.error('Uso: borrador-mapa <evidencia.html|snapshot.txt> --compania <c> --ramo <r> --pantalla <p> [--salida <fichero.ts>]')
  process.exit(2)
}
const contenido = readFileSync(ruta, 'utf8')
const aria = /\.html?$/i.test(ruta) ? separarAria(contenido).aria : contenido
if (!aria || aria.trim() === '') {
  console.error('La evidencia no trae sección tarificador:aria (¿fallo anterior a la Fase 1, o snapshot vacío?).')
  process.exit(1)
}
const ts = renderizarBorradorTs(borradorMapaDesdeAria(redactarAriaSnapshot(aria), { compania: values.compania, ramo: values.ramo, pantalla: values.pantalla }))
if (values.salida) { writeFileSync(values.salida, ts); console.error(`Borrador escrito en ${values.salida}`) } else process.stdout.write(ts)
