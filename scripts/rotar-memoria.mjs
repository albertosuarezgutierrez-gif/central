#!/usr/bin/env node
// Rota docs/CONTEXTO-SESIONES.md: archiva a docs/memoria/YYYY-MM.md las entradas
// de meses ya cerrados y deja en el archivo vivo solo el mes corriente.
//
// Uso:  node scripts/rotar-memoria.mjs [--dry-run]
//
// Por qué existe: el archivo vivo crecía sin límite (983 KB en 07/2026) y cada
// sesión que lo leía quemaba decenas de miles de tokens de contexto. La memoria
// histórica no se pierde: queda en docs/memoria/, que solo se lee si hace falta.
//
// Reglas:
// - Una "entrada" = bloque que empieza en columna 0 con `- **` (bullet, el formato
//   preferido) O `### ` (heading, tolerado — algunas sesiones lo usan) hasta la
//   siguiente. Cualquier otro formato de arranque de entrada (`## `, `#### `, texto
//   suelto en columna 0…) NO se reconoce como límite y se funde con la entrada de
//   arriba — si añades un formato nuevo, añádelo también a `esInicioEntrada`.
// - La fecha de una entrada sale SOLO de su cabecera: para `- **` es el texto en
//   negrita completo (puede envolver a la línea 2 si el título es largo — se busca
//   hasta el `**` de cierre, no solo en la línea 1); para `### ` es la línea 1
//   entera. Las fechas citadas en el CUERPO mienten (leyes, facturas, sesiones
//   antiguas) y nunca se miran. Si la cabecera no trae fecha (o trae dd/mm sin
//   año), se hereda/completa con la entrada de arriba: el archivo es cronológico
//   descendente, así que a nivel de mes la herencia es exacta.
// - Dentro de cada archivo mensual las entradas conservan su orden relativo
//   (más reciente arriba, igual que el vivo). Re-ejecutar es idempotente: si el
//   mes ya existe en docs/memoria/, las entradas nuevas se anteponen.
//
// Tests: node scripts/rotar-memoria.test.mjs (fixtures sintéticos, sin tocar
// el filesystem real — importa las funciones puras de aquí).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIVO = join(raiz, 'docs', 'CONTEXTO-SESIONES.md');
const DIR_MEMORIA = join(raiz, 'docs', 'memoria');

export const RE_FECHA = /([0-3]?\d)\/([01]\d)(?:\/(20\d\d))?/;
const RE_FECHA_G = new RegExp(RE_FECHA.source, 'g');

// La fecha real de una cabecera es la ÚLTIMA que aparece (la convención de Alberto la pone
// justo antes del cierre `**`/fin de línea); una fecha citada ANTES en el propio título
// ("... desde el 30/07 (06/08/2026)") es contexto, no la fecha de la entrada — coger la
// primera coincidencia (como hacía `.match()`) la archivaba en el mes equivocado.
const ultimaFecha = (texto) => {
  const coincidencias = [...texto.matchAll(RE_FECHA_G)];
  return coincidencias.length ? coincidencias[coincidencias.length - 1] : null;
};

export const esInicioEntrada = (linea) => linea.startsWith('- **') || linea.startsWith('### ');

// Texto donde buscar la fecha de una entrada: para `- **` es la negrita completa
// (puede envolver a la línea 2), para `### ` es solo la línea 1 (no llevan negrita).
export const textoFechaDe = (entrada) => {
  if (!entrada[0].startsWith('- **')) return entrada[0];
  const bloque = entrada.join('\n');
  const cierre = bloque.indexOf('**', 4); // 4 = tras el '- **' de apertura
  return cierre === -1 ? entrada[0] : bloque.slice(0, cierre);
};

// Trocea las líneas (ya sin cabecera) en entradas.
export function trocear(lineas) {
  const entradas = [];
  let actual = null;
  for (const linea of lineas) {
    if (esInicioEntrada(linea)) {
      if (actual) entradas.push(actual);
      actual = [linea];
    } else if (actual) {
      actual.push(linea);
    }
  }
  if (actual) entradas.push(actual);
  return entradas;
}

// Clasifica entradas en "vivas" (mes actual o futuro) y "por mes" (a archivar).
// Pura: no toca el filesystem. `mesVivo` en formato 'YYYY-MM'.
export function clasificar(entradas, mesVivo) {
  const vivas = [];
  const porMes = new Map(); // 'YYYY-MM' -> entradas (orden original)
  let mesAnterior = null; // mes de la entrada de arriba (más reciente)
  for (const entrada of entradas) {
    const m = ultimaFecha(textoFechaDe(entrada));
    let mes = null;
    if (m) {
      const anio = m[3] ?? (mesAnterior ? mesAnterior.slice(0, 4) : mesVivo.slice(0, 4));
      mes = `${anio}-${m[2]}`;
      // Sin año explícito y resultado en el futuro → era del año anterior (frontera de enero).
      if (!m[3] && mes > mesVivo) mes = `${Number(anio) - 1}-${m[2]}`;
      // Con año explícito en el futuro → falso positivo: hereda de la de arriba.
      if (m[3] && mes > mesVivo) mes = mesAnterior;
    }
    if (!mes) mes = mesAnterior;
    if (mes) mesAnterior = mes;
    if (!mes || mes >= mesVivo) {
      vivas.push(entrada);
    } else {
      if (!porMes.has(mes)) porMes.set(mes, []);
      porMes.get(mes).push(entrada);
    }
  }
  return { vivas, porMes };
}

export const unir = (es) => es.map((e) => e.join('\n').replace(/\n+$/, '')).join('\n\n');

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const texto = readFileSync(VIVO, 'utf8');
  const lineas = texto.split('\n');

  // Separar cabecera (todo hasta la primera entrada) del resto.
  const primeraEntrada = lineas.findIndex(esInicioEntrada);
  if (primeraEntrada === -1) {
    console.log('Sin entradas que rotar.');
    return;
  }
  const cabecera = lineas.slice(0, primeraEntrada);
  const entradas = trocear(lineas.slice(primeraEntrada));

  // Mes corriente (el que se queda en el vivo).
  const hoy = new Date();
  const mesVivo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

  const { vivas, porMes } = clasificar(entradas, mesVivo);

  console.log(`Entradas: ${entradas.length} | quedan vivas: ${vivas.length} | a archivar: ${entradas.length - vivas.length}`);
  for (const [mes, es] of [...porMes.entries()].sort()) {
    console.log(`  ${mes}: ${es.length} entradas -> docs/memoria/${mes}.md`);
  }
  if (dryRun) return;

  mkdirSync(DIR_MEMORIA, { recursive: true });
  for (const [mes, es] of porMes.entries()) {
    const destino = join(DIR_MEMORIA, `${mes}.md`);
    const bloque = unir(es);
    if (existsSync(destino)) {
      // Idempotente: anteponer solo las entradas que aún no estén archivadas.
      const previo = readFileSync(destino, 'utf8');
      const nuevas = es.filter((e) => !previo.includes(e[0]));
      if (!nuevas.length) continue;
      const sinCabecera = previo.replace(/^# [^\n]*\n+/, '');
      writeFileSync(destino, `# 🧠 Memoria de sesiones — archivo ${mes}\n\n${unir(nuevas)}\n\n${sinCabecera}`);
    } else {
      writeFileSync(destino, `# 🧠 Memoria de sesiones — archivo ${mes}\n\n${bloque}\n`);
    }
  }

  writeFileSync(VIVO, `${cabecera.join('\n').replace(/\n*$/, '\n\n')}${unir(vivas)}\n`);
  console.log(`OK: ${VIVO} reescrito con ${vivas.length} entradas vivas.`);
}

// Solo ejecuta el CLI (lee/escribe el filesystem real) si se invoca directamente,
// no cuando scripts/rotar-memoria.test.mjs importa las funciones puras de arriba.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
