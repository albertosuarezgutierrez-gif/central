#!/usr/bin/env node
// Tests de scripts/rotar-memoria.mjs contra fixtures sintéticos — no toca el
// filesystem real (import es seguro: main() solo corre si se invoca por CLI).
//
// Uso: node scripts/rotar-memoria.test.mjs

import assert from 'node:assert/strict';
import { esInicioEntrada, textoFechaDe, trocear, clasificar, unir } from './rotar-memoria.mjs';

const MES_VIVO = '2026-08';
let pasados = 0;
const fallos = [];

function test(nombre, fn) {
  try {
    fn();
    pasados++;
  } catch (e) {
    fallos.push({ nombre, error: e.message });
  }
}

// --- esInicioEntrada -------------------------------------------------------

test('esInicioEntrada: reconoce "- **" y "### "', () => {
  assert.equal(esInicioEntrada('- **Título (04/08/2026).**'), true);
  assert.equal(esInicioEntrada('### Título (04/08/2026)'), true);
});

test('esInicioEntrada: rechaza otros formatos de cabecera', () => {
  assert.equal(esInicioEntrada('## Título (04/08/2026)'), false);
  assert.equal(esInicioEntrada('#### Título (04/08/2026)'), false);
  assert.equal(esInicioEntrada('  - **Título indentado**'), false); // no es columna 0
  assert.equal(esInicioEntrada('Texto suelto en columna 0'), false);
});

// --- textoFechaDe ------------------------------------------------------

test('textoFechaDe: "- **" con fecha en la línea 1', () => {
  const entrada = ['- **Título (04/08/2026).** Resto del cuerpo.'];
  assert.match(textoFechaDe(entrada), /04\/08\/2026/);
});

test('textoFechaDe: "- **" con negrita que envuelve a la línea 2 (el bug original)', () => {
  const entrada = [
    '- **📡 Sonda ACTIVA de proveedores IA — «que no vuelva a pasar y si pasa, enterarnos rápido»',
    '  (02/08/2026, rama `claude/gemini-quota-fallback-issue-fyhghm`, 2ª tanda).**',
    'Cuerpo de la entrada con más detalle.',
  ];
  assert.match(textoFechaDe(entrada), /02\/08\/2026/);
});

test('textoFechaDe: "- **" con negrita que envuelve a la línea 3', () => {
  const entrada = [
    '- **Título muy largo que no cabe en una sola línea y sigue',
    '  y sigue un poco más todavía sin llegar a la fecha aún',
    '  (15/07/2026, con más contexto).** Cuerpo.',
  ];
  assert.match(textoFechaDe(entrada), /15\/07\/2026/);
});

test('textoFechaDe: "- **" NO se cuela con una fecha del CUERPO tras el cierre', () => {
  // La fecha real es 04/08; el cuerpo cita una ley/factura de otra fecha que NO debe leerse.
  const entrada = [
    '- **Título (04/08/2026).** Factura antigua del 12/01/2019, revisar.',
  ];
  const m = textoFechaDe(entrada).match(/([0-3]?\d)\/([01]\d)(?:\/(20\d\d))?/);
  assert.equal(`${m[1]}/${m[2]}`, '04/08');
});

test('textoFechaDe: "### " usa solo la línea 1 (no lleva negrita)', () => {
  const entrada = [
    '### 🔐 Trial Tuya IoT Core renovado — cerraduras OK de nuevo (04/08/2026)',
    'Cuerpo largo con otras fechas tipo 04/02/2027 que no deben leerse como cabecera.',
  ];
  const m = textoFechaDe(entrada).match(/([0-3]?\d)\/([01]\d)(?:\/(20\d\d))?/);
  assert.equal(`${m[1]}/${m[2]}/${m[3]}`, '04/08/2026');
});

// --- trocear -----------------------------------------------------------

test('trocear: separa entradas "- **" y "### " consecutivas correctamente', () => {
  const lineas = [
    '- **Entrada A (04/08/2026).** Cuerpo A.',
    '### Entrada B (03/08/2026)',
    'Cuerpo B línea 1.',
    'Cuerpo B línea 2.',
    '- **Entrada C (02/08/2026).** Cuerpo C.',
  ];
  const entradas = trocear(lineas);
  assert.equal(entradas.length, 3);
  assert.equal(entradas[0][0], '- **Entrada A (04/08/2026).** Cuerpo A.');
  assert.equal(entradas[1].length, 3); // cabecera + 2 líneas de cuerpo
  assert.equal(entradas[2][0], '- **Entrada C (02/08/2026).** Cuerpo C.');
});

test('trocear: "### " consecutivos sin "- **" de por medio no se funden entre sí', () => {
  const lineas = [
    '### Entrada A (04/08/2026)',
    'Cuerpo A.',
    '### Entrada B (03/08/2026)',
    'Cuerpo B.',
  ];
  const entradas = trocear(lineas);
  assert.equal(entradas.length, 2);
  assert.equal(entradas[0][0], '### Entrada A (04/08/2026)');
  assert.equal(entradas[1][0], '### Entrada B (03/08/2026)');
});

// --- clasificar (el caso real que rompía: agosto no debe archivarse como julio) --

test('clasificar: entradas "### " de agosto quedan vivas, no se cuelan en julio', () => {
  const entradas = trocear([
    '- **Entrada julio (31/07/2026).** Cuerpo.',
    '### Entrada agosto A (04/08/2026)',
    'Cuerpo A.',
    '### Entrada agosto B (03/08/2026)',
    'Cuerpo B.',
    '- **Entrada agosto C (05/08/2026).** Cuerpo C.',
  ]);
  const { vivas, porMes } = clasificar(entradas, MES_VIVO);
  assert.equal(vivas.length, 3, 'las 3 de agosto (2 "### " + 1 "- **") deben quedar vivas');
  assert.equal(porMes.get('2026-07')?.length, 1, 'solo la de julio se archiva');
  assert.ok(vivas.some((e) => e[0].includes('agosto A')));
  assert.ok(vivas.some((e) => e[0].includes('agosto B')));
});

test('clasificar: entrada "- **" con fecha envuelta a la línea 2 no hereda la fecha de la entrada de arriba', () => {
  const entradas = trocear([
    '- **Entrada julio (31/07/2026).** Cuerpo.',
    '- **📡 Título largo que envuelve',
    '  (04/08/2026, con contexto).** Cuerpo.',
  ]);
  const { vivas, porMes } = clasificar(entradas, MES_VIVO);
  assert.equal(vivas.length, 1, 'la entrada de agosto con fecha envuelta debe quedar viva, no heredar julio');
  assert.equal(porMes.get('2026-07')?.length, 1);
});

test('clasificar: título que CITA una fecha anterior antes de la fecha real no se archiva por la primera (caso real 06/08/2026)', () => {
  const entradas = trocear([
    '- **🐕 3er tramo del watchdog + 2 crons rotos desde el 30/07 (06/08/2026).** Cuerpo.',
  ]);
  const { vivas, porMes } = clasificar(entradas, MES_VIVO);
  assert.equal(vivas.length, 1, 'la fecha real (06/08) es la ÚLTIMA del título, no "30/07" citada antes');
  assert.equal(porMes.size, 0);
});

test('clasificar: entrada sin fecha propia hereda el mes de la entrada de arriba (comportamiento deseado)', () => {
  const entradas = trocear([
    '- **Entrada con fecha (31/07/2026).** Cuerpo.',
    '- **Entrada sin fecha propia.** Cuerpo que continúa el tema anterior.',
  ]);
  const { vivas, porMes } = clasificar(entradas, MES_VIVO);
  assert.equal(vivas.length, 0);
  assert.equal(porMes.get('2026-07')?.length, 2, 'ambas se archivan juntas en julio');
});

test('clasificar: frontera de año — dd/mm sin año en diciembre visto desde agosto es del año anterior', () => {
  const entradas = trocear(['- **Entrada vieja (15/12).** Cuerpo sin año explícito.']);
  const { porMes } = clasificar(entradas, MES_VIVO);
  assert.equal(porMes.get('2025-12')?.length, 1, 'diciembre sin año, visto en agosto-2026, es 2025-12');
});

test('clasificar: fecha futura con año explícito es falso positivo → hereda de arriba', () => {
  const entradas = trocear([
    '- **Entrada real (04/08/2026).** Cuerpo.',
    '- **Cita una fecha futura (01/12/2027) dentro del título.** Cuerpo.',
  ]);
  const { vivas, porMes } = clasificar(entradas, MES_VIVO);
  // La "fecha" 01/12/2027 es posterior a mesVivo → se descarta como falso positivo,
  // la entrada hereda 2026-08 de la entrada de arriba y queda viva.
  assert.equal(vivas.length, 2);
  assert.equal(porMes.size, 0);
});

test('clasificar: idempotencia — re-clasificar las "vivas" resultantes no archiva nada más', () => {
  const entradas = trocear([
    '- **Entrada julio (31/07/2026).** Cuerpo.',
    '### Entrada agosto (04/08/2026)',
    'Cuerpo.',
  ]);
  const primera = clasificar(entradas, MES_VIVO);
  assert.equal(primera.vivas.length, 1);
  const segunda = clasificar(primera.vivas, MES_VIVO);
  assert.equal(segunda.vivas.length, 1);
  assert.equal(segunda.porMes.size, 0, 'nada nuevo que archivar en la segunda pasada');
});

// --- unir ----------------------------------------------------------------

test('unir: reconstruye el texto con doble salto de línea entre entradas', () => {
  const entradas = trocear([
    '- **A (04/08/2026).** Cuerpo A.',
    '- **B (03/08/2026).** Cuerpo B.',
  ]);
  const texto = unir(entradas);
  assert.equal(texto, '- **A (04/08/2026).** Cuerpo A.\n\n- **B (03/08/2026).** Cuerpo B.');
});

// --- resultado -------------------------------------------------------------

console.log(`\n${pasados}/${pasados + fallos.length} tests OK`);
if (fallos.length) {
  console.log('\nFALLOS:');
  for (const f of fallos) console.log(`  ✗ ${f.nombre}\n    ${f.error}`);
  process.exit(1);
}
console.log('✅ Todos los tests pasan.');
