#!/usr/bin/env node
// Resuelve conflictos de git en los ficheros de REGISTRO (memoria/bitácoras/informes) cuando —y SOLO
// cuando— el conflicto es una INSERCIÓN PURA por ambos lados: cada rama añadió una entrada nueva en el
// mismo sitio (arriba del todo) sin tocar texto que ya existía. Resolución = quedarse con LAS DOS.
//
// POR QUÉ EXISTE (08/08/2026, ver docs/AUDITORIA-2026-08.md)
// Todas las rutinas escriben al principio de `docs/CONTEXTO-SESIONES.md` y `docs/AGENTES-BITACORA.md`,
// así que dos rutinas del mismo día chocan SIEMPRE. Con el auto-merge de #1289 eso dejaba el PR muerto
// en conflicto (caso #1290: 24 h abierto, resuelto a mano, y `main` lo volvió a romper 44 min después).
// Resolver "a mano cada vez" es whack-a-mole: es el mismo conflicto una y otra vez, y la respuesta
// correcta es siempre la misma —conservar las dos entradas—, así que se automatiza.
//
// LA GUARDA QUE LO HACE SEGURO
// Necesita `merge.conflictStyle=diff3`, que incluye la sección BASE (el ancestro común) en cada bloque.
// Si la base está VACÍA, los dos lados añadieron texto donde no había nada → nadie pisa a nadie y
// conservar ambos no pierde ni inventa información. Si la base tiene contenido, alguien EDITÓ algo que
// ya existía: ahí este script se planta y no toca nada — eso lo mira una persona.
//
// ORDEN: primero `ours`, luego `theirs`. El workflow lo invoca estando en `main` con el PR como
// `theirs`, así que esto NUNCA reordena lo que ya está en `main`: la entrada del PR se inserta justo
// debajo. Puede quedar unas horas fuera de orden estricto dentro del mismo día; es una bitácora, y a
// cambio la regla es trivial de auditar.
//
// Uso: node scripts/resolver-conflicto-registro.mjs <fichero...>
// Tests: node scripts/resolver-conflicto-registro.test.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const RE_INI = /^<<<<<<< /;
const RE_BASE = /^\|\|\|\|\|\|\|/; // diff3: '||||||| merged common ancestors' o '||||||| <sha>'
const RE_SEP = /^=======\s*$/;
const RE_FIN = /^>>>>>>> /;

// Quita líneas vacías al principio y al final de un bloque, para poder unir los dos lados con
// exactamente una línea en blanco entre ellos (que es como se separan las entradas en estos ficheros).
export const recortar = (lineas) => {
  let a = 0;
  let b = lineas.length;
  while (a < b && lineas[a].trim() === '') a++;
  while (b > a && lineas[b - 1].trim() === '') b--;
  return lineas.slice(a, b);
};

/**
 * Resuelve el texto de un fichero con marcadores de conflicto.
 * @returns {{ok: true, texto: string, bloques: number} | {ok: false, motivo: string}}
 */
export function resolverTexto(texto) {
  const lineas = texto.split('\n');
  const salida = [];
  let i = 0;
  let bloques = 0;

  while (i < lineas.length) {
    if (!RE_INI.test(lineas[i])) {
      salida.push(lineas[i]);
      i++;
      continue;
    }

    i++; // saltar '<<<<<<<'
    const ours = [];
    while (i < lineas.length && !RE_BASE.test(lineas[i]) && !RE_SEP.test(lineas[i])) ours.push(lineas[i++]);
    if (i >= lineas.length) return { ok: false, motivo: 'bloque de conflicto sin cerrar' };
    if (!RE_SEP.test(lineas[i]) && !RE_BASE.test(lineas[i])) return { ok: false, motivo: 'bloque de conflicto malformado' };
    if (RE_SEP.test(lineas[i])) {
      return { ok: false, motivo: 'el bloque no trae sección base — hace falta merge.conflictStyle=diff3' };
    }

    i++; // saltar '|||||||'
    const base = [];
    while (i < lineas.length && !RE_SEP.test(lineas[i])) base.push(lineas[i++]);
    if (i >= lineas.length) return { ok: false, motivo: 'bloque de conflicto sin cerrar' };

    i++; // saltar '======='
    const theirs = [];
    while (i < lineas.length && !RE_FIN.test(lineas[i])) theirs.push(lineas[i++]);
    if (i >= lineas.length) return { ok: false, motivo: 'bloque de conflicto sin cerrar' };
    i++; // saltar '>>>>>>>'

    // LA guarda: base vacía = los dos lados añadieron donde no había nada.
    if (base.join('').trim() !== '') {
      return {
        ok: false,
        motivo: 'el conflicto NO es una inserción pura: los dos lados cambian texto que ya existía',
      };
    }

    const a = recortar(ours);
    const b = recortar(theirs);
    if (a.length && b.length) salida.push(...a, '', ...b);
    else salida.push(...a, ...b);
    // `recortar` se come la línea en blanco con la que el bloque se separaba de la entrada de
    // abajo; se repone. En estos ficheros las entradas van separadas por una línea en blanco, y
    // sin esto la entrada reinsertada quedaba pegada a la siguiente.
    if (i < lineas.length && lineas[i].trim() !== '' && salida.length && salida[salida.length - 1].trim() !== '') {
      salida.push('');
    }
    bloques++;
  }

  if (bloques === 0) return { ok: false, motivo: 'no se encontró ningún bloque de conflicto' };
  const texto2 = salida.join('\n');
  // Cinturón: por construcción no puede quedar ningún marcador, pero si quedara sería un desastre
  // silencioso commiteado a `main`. Se comprueba.
  if (/^(<<<<<<< |\|\|\|\|\|\|\||=======\s*$|>>>>>>> )/m.test(texto2)) {
    return { ok: false, motivo: 'quedaron marcadores de conflicto tras resolver' };
  }
  return { ok: true, texto: texto2, bloques };
}

function main() {
  const ficheros = process.argv.slice(2);
  if (!ficheros.length) {
    console.error('Uso: node scripts/resolver-conflicto-registro.mjs <fichero...>');
    process.exit(2);
  }
  // Se resuelve TODO en memoria antes de escribir nada: si un fichero no es resoluble, no queremos
  // dejar los otros medio arreglados en el árbol de trabajo.
  const resueltos = [];
  for (const f of ficheros) {
    const r = resolverTexto(readFileSync(f, 'utf8'));
    if (!r.ok) {
      console.error(`✗ ${f}: ${r.motivo}`);
      process.exit(1);
    }
    resueltos.push({ f, ...r });
  }
  for (const { f, texto, bloques } of resueltos) {
    writeFileSync(f, texto);
    console.log(`✓ ${f}: ${bloques} bloque(s) de inserción pura resueltos conservando ambos lados`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
