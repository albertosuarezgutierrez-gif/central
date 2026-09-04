// Cepo del desempate identidad ↔ ficha de la cartera (`elegirFicha`).
//
// ─── Qué protege, y por qué se escribió ─────────────────────────────────────
// Medido en producción el 03/09/2026 con el email del propio Alberto: **1 ficha
// por la columna principal (la suya) y 3 filas en `cliente_emails`** — la suya
// otra vez, más las fichas de DOS personas distintas que llevan su correo como
// email de CONTACTO. El código anterior las metía todas en el mismo saco,
// contaba 2 candidatos y devolvía `ambiguo`: se entraba al portal y la bóveda
// salía vacía, sin un solo error. Desde fuera es indistinguible de «no tienes
// pólizas», que es el peor modo de fallo posible aquí.
//
// El arreglo NO es relajar el criterio: es desempatar por PROCEDENCIA. El email
// principal de una ficha es la identidad de esa ficha; aparecer como contacto en
// la ficha de otro no te convierte en esa persona. Lo que sigue sin adivinarse
// —dos fichas que declaran el mismo email como suyo— sigue siendo `ambiguo`, y
// este fichero lo fija para que nadie lo «arregle» más adelante.
//
// ⚠️ Y el atajo que NO vale: «si hay un principal, ignoro los secundarios». Los
// secundarios siguen siendo la única vía cuando no hay ninguno principal (test
// «sin principal, un secundario vincula»). Filtrarlos de entrada dejaría
// `sin_ficha` a clientes que hoy entran bien.
import test from 'node:test'
import assert from 'node:assert/strict'
// Se importa el fichero PURO (`vinculo-elegir.ts`), no `vinculo.ts`: este
// último abre Prisma en el import, y un test que necesita BD para comprobar una
// decisión de tres líneas es un test que nadie corre. `vinculo.ts` re-exporta
// `elegirFicha`, así que quien la use desde la app no nota la separación.
import { elegirFicha, type Candidato } from './vinculo-elegir.ts'

const CORREDURIA = 'corr-1'

const principal = (clienteId: string): Candidato => ({ clienteId, correduriaId: CORREDURIA, principal: true })
const secundario = (clienteId: string): Candidato => ({ clienteId, correduriaId: CORREDURIA, principal: false })

test('sin ninguna ficha que case, no se inventa nada: sin_ficha', () => {
  assert.deepEqual(elegirFicha([]), { estado: 'sin_ficha' })
})

test('una sola ficha por su email principal vincula', () => {
  assert.deepEqual(elegirFicha([principal('c-alberto')]), {
    estado: 'ok',
    clienteId: 'c-alberto',
    correduriaId: CORREDURIA,
  })
})

test('CASO REAL 03/09/2026: 1 principal + 2 fichas AJENAS que lo llevan de contacto → gana el principal', () => {
  // La ficha de Alberto sale por los dos caminos (su email principal está
  // además en su lista de contactos) y no por eso cuenta dos veces.
  const candidatos = [
    principal('c-alberto'),
    secundario('c-alberto'),
    secundario('c-tercero-1'),
    secundario('c-tercero-2'),
  ]
  assert.deepEqual(elegirFicha(candidatos), {
    estado: 'ok',
    clienteId: 'c-alberto',
    correduriaId: CORREDURIA,
  })
})

test('el orden de la lista no decide: el principal gana venga donde venga', () => {
  const alFinal = elegirFicha([secundario('c-tercero-1'), secundario('c-tercero-2'), principal('c-alberto')])
  assert.deepEqual(alFinal, { estado: 'ok', clienteId: 'c-alberto', correduriaId: CORREDURIA })
})

test('sin principal, un unico secundario vincula (comportamiento de siempre, no se toca)', () => {
  assert.deepEqual(elegirFicha([secundario('c-solo-contacto')]), {
    estado: 'ok',
    clienteId: 'c-solo-contacto',
    correduriaId: CORREDURIA,
  })
})

test('DOS fichas declaran el mismo email como SUYO: eso no se adivina nunca → ambiguo', () => {
  assert.deepEqual(elegirFicha([principal('c-uno'), principal('c-dos')]), { estado: 'ambiguo' })
})

test('dos principales siguen empatando aunque haya secundarios de por medio', () => {
  const candidatos = [principal('c-uno'), secundario('c-tercero'), principal('c-dos')]
  assert.deepEqual(elegirFicha(candidatos), { estado: 'ambiguo' })
})

test('sin principal y con dos secundarios, tampoco se elige: ambiguo', () => {
  assert.deepEqual(elegirFicha([secundario('c-uno'), secundario('c-dos')]), { estado: 'ambiguo' })
})

test('la misma ficha repetida por los dos caminos es UNA ficha, no un empate', () => {
  assert.deepEqual(elegirFicha([secundario('c-alberto'), principal('c-alberto')]), {
    estado: 'ok',
    clienteId: 'c-alberto',
    correduriaId: CORREDURIA,
  })
  // Y repetida como secundaria (varias filas de contacto con el mismo email)
  // tampoco convierte a una ficha en dos.
  assert.deepEqual(elegirFicha([secundario('c-alberto'), secundario('c-alberto')]), {
    estado: 'ok',
    clienteId: 'c-alberto',
    correduriaId: CORREDURIA,
  })
})

test('la correduria que sale es la de la ficha ganadora, no la de un candidato descartado', () => {
  const candidatos: Candidato[] = [
    { clienteId: 'c-alberto', correduriaId: 'corr-buena', principal: true },
    { clienteId: 'c-tercero', correduriaId: 'corr-otra', principal: false },
  ]
  assert.deepEqual(elegirFicha(candidatos), {
    estado: 'ok',
    clienteId: 'c-alberto',
    correduriaId: 'corr-buena',
  })
})
