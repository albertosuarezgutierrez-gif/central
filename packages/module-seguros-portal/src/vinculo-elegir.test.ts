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
// Se importa el fichero PURO. Vivía en `apps/asegura-portal/lib/vinculo.test.ts`
// y se mudó aquí el 06/09/2026: la regla subió al paquete el 05/09 y su único
// cepo se quedó en la app, así que la suite del paquete NO la cubría. Una regla
// compartida cuyo test corre desde una sola de las apps que la usan es una regla
// que se rompe para la otra sin que falle nada.
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

// ─── prediccionDeVinculo ────────────────────────────────────────────────────
// La pregunta de la pantalla del corredor: «¿este correo llevará a ESTA ficha?».
// Es `elegirFicha` más la comparación con el dueño, y está aquí y no en
// `apps/asegura` porque la contestan ya DOS sitios (la ficha del cliente y la
// lista de contactabilidad) y una segunda copia divergiría en silencio: una
// diría «invitable» y la otra «ambiguo» sobre el mismo cliente, las dos con 200.
import { prediccionDeVinculo } from './vinculo-elegir.ts'

test('prediccion: el correo es suyo y de nadie más → invitable', () => {
  assert.equal(prediccionDeVinculo([principal('c-alberto')], 'c-alberto'), 'invitable')
})

test('prediccion: dos fichas lo declaran suyo → ambiguo, y NO «resuelve a otra»', () => {
  // Son dos arreglos distintos: aquí hay un duplicado que resolver; en
  // `resuelve_a_otra` lo que falta es la direccion propia de este cliente.
  assert.equal(prediccionDeVinculo([principal('c-uno'), principal('c-dos')], 'c-uno'), 'ambiguo')
})

test('prediccion: el correo es principal de OTRA ficha → resuelve_a_otra', () => {
  assert.equal(prediccionDeVinculo([principal('c-otro')], 'c-alberto'), 'resuelve_a_otra')
})

test('🚨 prediccion: sin ninguna ficha que case, NO es invitable', () => {
  // `sin_ficha` con un correo que sale de la propia ficha significa que su hash
  // no esta escrito: el portal no la encontraria. Para el cliente el efecto es
  // el mismo que resolver a otra —entra y no ve nada—, y lo que NO puede pasar
  // es que salga «invitable», que es una promesa.
  assert.equal(prediccionDeVinculo([], 'c-alberto'), 'resuelve_a_otra')
})

test('prediccion: gana el principal aunque haya secundarios ajenos (caso real 03/09)', () => {
  const candidatos = [principal('c-alberto'), secundario('c-tercero-1'), secundario('c-tercero-2')]
  assert.equal(prediccionDeVinculo(candidatos, 'c-alberto'), 'invitable')
  // Y para los terceros, ese mismo correo NO les identifica.
  assert.equal(prediccionDeVinculo(candidatos, 'c-tercero-1'), 'resuelve_a_otra')
})
