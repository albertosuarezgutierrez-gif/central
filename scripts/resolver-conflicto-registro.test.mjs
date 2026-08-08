#!/usr/bin/env node
// Tests de scripts/resolver-conflicto-registro.mjs contra fixtures sintéticos — no toca el filesystem
// (importar es seguro: main() solo corre si se invoca por CLI).
//
// Uso: node scripts/resolver-conflicto-registro.test.mjs

import assert from 'node:assert/strict';
import { resolverTexto, recortar } from './resolver-conflicto-registro.mjs';

let pasados = 0;
const fallos = [];
const test = (nombre, fn) => {
  try {
    fn();
    pasados++;
  } catch (e) {
    fallos.push({ nombre, error: e.message });
  }
};

// El caso real: dos rutinas añaden su entrada arriba del todo el mismo día.
const INSERCION_PURA = `## 📌 Estado actual (lo más reciente arriba)

<<<<<<< HEAD
- **Entrada que ya está en main (08/08/2026).** Cuerpo.
||||||| merged common ancestors
=======
- **Entrada que trae el PR (08/08/2026).** Cuerpo.
>>>>>>> claude/rutina-x

### Entrada vieja (07/08/2026)
Cuerpo viejo.`;

test('inserción pura: conserva LOS DOS lados, ours primero', () => {
  const r = resolverTexto(INSERCION_PURA);
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.bloques, 1);
  assert.match(r.texto, /ya está en main/);
  assert.match(r.texto, /trae el PR/);
  assert.ok(
    r.texto.indexOf('ya está en main') < r.texto.indexOf('trae el PR'),
    'ours (main) va primero: nunca se reordena lo que ya está en main',
  );
});

test('inserción pura: no quedan marcadores ni se pierde el texto de alrededor', () => {
  const r = resolverTexto(INSERCION_PURA);
  assert.doesNotMatch(r.texto, /<<<<<<<|=======|>>>>>>>|\|\|\|\|\|\|\|/);
  assert.match(r.texto, /## 📌 Estado actual/);
  assert.match(r.texto, /### Entrada vieja \(07\/08\/2026\)/);
  assert.match(r.texto, /Cuerpo viejo\./);
});

test('inserción pura: exactamente una línea en blanco entre los dos lados', () => {
  const r = resolverTexto(INSERCION_PURA);
  assert.match(r.texto, /main \(08\/08\/2026\)\.\*\* Cuerpo\.\n\n- \*\*Entrada que trae el PR/);
});

test('RECHAZA cuando la base NO está vacía (alguien editó texto que ya existía)', () => {
  const r = resolverTexto(`antes
<<<<<<< HEAD
- **Entrada corregida por main.**
||||||| merged common ancestors
- **Entrada original.**
=======
- **La misma entrada, corregida por el PR.**
>>>>>>> rama
después`);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /no es una inserción pura/i);
});

test('RECHAZA si el bloque no trae sección base (sin merge.conflictStyle=diff3)', () => {
  const r = resolverTexto(`<<<<<<< HEAD
- **A**
=======
- **B**
>>>>>>> rama`);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /diff3/);
});

test('RECHAZA un bloque sin cerrar (fichero truncado)', () => {
  const r = resolverTexto(`<<<<<<< HEAD
- **A**
||||||| merged common ancestors
=======
- **B**`);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /sin cerrar/);
});

test('RECHAZA un fichero sin conflictos (que no lo llamen por error)', () => {
  const r = resolverTexto('- **Entrada normal.**\nCuerpo.\n');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /ningún bloque de conflicto/);
});

test('varios bloques en el mismo fichero se resuelven todos', () => {
  const r = resolverTexto(`<<<<<<< HEAD
- **A main**
||||||| merged common ancestors
=======
- **A pr**
>>>>>>> rama
medio
<<<<<<< HEAD
- **B main**
||||||| merged common ancestors
=======
- **B pr**
>>>>>>> rama`);
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.bloques, 2);
  for (const t of ['A main', 'A pr', 'B main', 'B pr', 'medio']) assert.match(r.texto, new RegExp(t));
});

test('basta UN bloque no resoluble para rechazar el fichero entero', () => {
  const r = resolverTexto(`<<<<<<< HEAD
- **A main**
||||||| merged common ancestors
=======
- **A pr**
>>>>>>> rama
<<<<<<< HEAD
- **B main**
||||||| merged common ancestors
- **B base**
=======
- **B pr**
>>>>>>> rama`);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /no es una inserción pura/i);
});

test('un lado vacío (solo una rama añadió): sin línea en blanco de más entre los lados', () => {
  const r = resolverTexto(`<<<<<<< HEAD
- **Solo main**
||||||| merged common ancestors
=======
>>>>>>> rama
resto`);
  assert.equal(r.ok, true, r.motivo);
  // La línea en blanco ante `resto` es deliberada: separa la entrada de la siguiente, como en el
  // resto del fichero. Lo que no debe haber son DOS (una por cada lado del conflicto).
  assert.equal(r.texto, '- **Solo main**\n\nresto');
});

test('la entrada reinsertada NO queda pegada a la entrada de abajo', () => {
  // Regresión: `recortar` se comía la línea en blanco final del bloque y el resultado era
  // "- **Entrada del PR**\n- **Entrada vieja**" — dos entradas seguidas sin separación.
  const r = resolverTexto(`<<<<<<< HEAD
- **Main**

||||||| merged common ancestors
=======
- **PR**

>>>>>>> rama
- **Vieja**`);
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.texto, '- **Main**\n\n- **PR**\n\n- **Vieja**');
});

test('no se mete línea en blanco si ya venía uno detrás del bloque', () => {
  const r = resolverTexto(`<<<<<<< HEAD
- **Main**
||||||| merged common ancestors
=======
- **PR**
>>>>>>> rama

- **Vieja**`);
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.texto, '- **Main**\n\n- **PR**\n\n- **Vieja**');
});

test('base con solo líneas en blanco cuenta como vacía', () => {
  const r = resolverTexto(`<<<<<<< HEAD
- **A**
||||||| merged common ancestors

=======
- **B**
>>>>>>> rama`);
  assert.equal(r.ok, true, r.motivo);
});

test('recortar: quita blancos de los extremos, no de en medio', () => {
  assert.deepEqual(recortar(['', 'a', '', 'b', '']), ['a', '', 'b']);
  assert.deepEqual(recortar(['', '']), []);
});

console.log(`\n${pasados}/${pasados + fallos.length} tests OK`);
if (fallos.length) {
  console.log('\nFALLOS:');
  for (const f of fallos) console.log(`  ✗ ${f.nombre}\n    ${f.error}`);
  process.exit(1);
}
console.log('✅ Todos los tests pasan.');
