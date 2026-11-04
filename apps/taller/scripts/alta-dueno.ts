// Alta del PRIMER usuario (dueño) de un taller: imprime el INSERT con el hash del PIN, para que el operador lo
// aplique como `postgres` tras 0002. El PIN no se escribe en ningún fichero ni en el repo.
//   TALLER_ID=<uuid> NOMBRE="…" PIN_ALTA=<4 dígitos> node apps/taller/scripts/alta-dueno.ts
// El dueño lo cambia después desde Ajustes → Personal → «Nuevo PIN».
import { hashPin, validarFormatoPin } from '@central/core-identity/pin'
import { esTallerId } from '../lib/rls.ts'

const { TALLER_ID, NOMBRE, PIN_ALTA } = process.env
if (!esTallerId(TALLER_ID)) throw new Error('TALLER_ID no es un uuid')
if (!NOMBRE?.trim()) throw new Error('falta NOMBRE')
const f = validarFormatoPin(PIN_ALTA, { rechazarTriviales: true })
if (!f.ok) throw new Error(`PIN_ALTA inválido: ${f.error}`)

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`
const hash = await hashPin(PIN_ALTA as string)
console.log(`BEGIN;
SELECT set_config('taller.taller_id', ${lit(TALLER_ID)}, true);
INSERT INTO taller.usuarios_taller (taller_id, nombre, rol, pin_hash) VALUES (${lit(TALLER_ID)}, ${lit(NOMBRE.trim())}, 'dueno', ${lit(hash)});
COMMIT;`)
