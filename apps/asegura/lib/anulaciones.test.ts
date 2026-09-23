// Cepo del expediente de anulación (pieza 2-d). Lee el FUENTE: lo que vigila es SQL crudo y el
// orden dentro de la transacción del detector, donde ni tsc ni el build miran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./anulaciones.ts', import.meta.url), 'utf8')
const detector = readFileSync(new URL('./eventos-cartera.ts', import.meta.url), 'utf8')

test('una acción solo mueve el expediente desde el estado que se leyó (dos clics no se pisan)', () => {
  assert.match(src, /where id = \$\{id\}::uuid and correduria_id = \$\{correduriaId\}::uuid and estado = \$\{a\.estado\}`/)
  assert.match(src, /accion === 'marcar_firmada' && !texto\) return \{ estado: 'invalida'/, 'firmar exige decir cómo consta la firma')
})

test('a quien tiene expediente de anulación no se le abre una llamada de retención', () => {
  const abrir = detector.slice(detector.indexOf('async function abrirRetencion'))
  assert.match(abrir.slice(0, abrir.indexOf('if (!p) return null')), /not exists \(select 1 from anulacion a where a\.poliza_id = p\.id and a\.estado <> 'desistida'\)/)
})

test('el detector confirma las anulaciones antes de retener, y no anuncia como fuga una baja ya tramitada', () => {
  const confirma = detector.indexOf('await confirmarAnulaciones(tx, correduriaId)')
  assert.ok(confirma > 0 && confirma < detector.indexOf('for (const e of insertados) {'))
  assert.ok(confirma < detector.indexOf('insert into cartera_foto'))
  assert.match(detector, /insertados\.filter\(\(e\) => esFugaSinExplicar\(e\) && !anuladas\.has\(e\.id\)\)/)
})
