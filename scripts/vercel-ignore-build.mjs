#!/usr/bin/env node
// scripts/vercel-ignore-build.mjs
// "Ignored Build Step" de los proyectos Vercel del monorepo `central`.
//
// PROBLEMA que resuelve: ~6-7 proyectos Vercel cuelgan del MISMO repo, así que
// sin filtro CADA push reconstruye TODOS los proyectos (aunque el commit solo
// toque docs/ o una sola app). Eso disparó la factura de Build CPU Minutes
// (183.108 min / ~600 US$ en un mes). Con este filtro, cada proyecto solo
// construye si el commit afecta a SU código.
//
// Vercel ejecuta este comando con cwd = Root Directory de cada app (apps/<app>)
// y decide por el EXIT CODE:
//   exit 1  => CONSTRUIR
//   exit 0  => SALTAR el build (queda como "Ignored")
//
// Regla:
//   1) Commit marcado [skip ci]/[skip vercel] (p.ej. la radiografía del bot) => SALTAR siempre.
//   2) Con `--sin-previews`, un build de PREVIEW (rama ≠ main)               => SALTAR,
//      salvo que el asunto del commit lleve [preview] (escape para verificar en Vercel).
//   3) El diff toca apps/<app>/, packages/ o los manifiestos raíz            => CONSTRUIR.
//   4) En cualquier otro caso                                                => SALTAR.
//   5) Ante CUALQUIER duda (clon shallow, primer commit, error git)          => CONSTRUIR (fail-open).
//
// Uso (en cada apps/<app>/vercel.json):
//   "ignoreCommand": "node ../../scripts/vercel-ignore-build.mjs apps/<app> [--sin-previews]"

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const appDir = (process.argv[2] || '').replace(/\/+$/, ''); // p.ej. "apps/plataforma"

function build(reason) { console.log(`▶ build: ${reason}`); process.exit(1); }
function skip(reason)  { console.log(`⏭ skip: ${reason}`);  process.exit(0); }

if (!appDir) build('sin argumento de app → construir por seguridad');

// 1) Commits marcados para saltar CI (la radiografía del bot lleva [skip ci] en el ASUNTO).
//    Vercel NO honra estos marcadores por sí mismo, así que lo hacemos aquí:
//    neutraliza el amplificador auditoria.yml, sin depender de rutas.
//    Solo se mira la PRIMERA línea (asunto): si mirásemos el cuerpo entero, un commit
//    real que solo MENCIONE "[skip ci]" en su descripción se saltaría por error.
const subject = (process.env.VERCEL_GIT_COMMIT_MESSAGE || '').split('\n')[0];
if (/\[(skip ci|ci skip|no ci|skip vercel|vercel skip)\]/i.test(subject)) {
  skip(`asunto marcado para saltar CI ("${subject.slice(0, 60)}")`);
}

// 1b) Previews (opt-out por proyecto). Medido sobre la factura 14 jul–13 ago 2026: el 79%
//     del cargo seguían siendo Build CPU Minutes (32.708 min ≈ 92,51 US$), y cerca de la
//     mitad eran builds de PREVIEW — cada push de cada rama de PR reconstruye la app tocada,
//     y esas previews no las mira nadie (los agentes verifican con tsc/tests y mergean en
//     minutos). Con `--sin-previews` el proyecto solo construye producción (main).
//     Escape: un commit con [preview] en el ASUNTO construye su preview igualmente.
//     Sin variables de entorno (ejecución local/tests) NO se asume preview: fail-open.
const sinPreviews = process.argv.slice(3).includes('--sin-previews');
const refGit = process.env.VERCEL_GIT_COMMIT_REF || '';
const esPreview =
  (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') ||
  (refGit && refGit !== 'main');
if (sinPreviews && esPreview && !/\[preview\]/i.test(subject)) {
  skip(`preview de "${refGit || process.env.VERCEL_ENV}" con --sin-previews (usa [preview] en el asunto para forzarla)`);
}

// 2) Archivos tocados por el commit (diff contra el commit anterior).
const sha = process.env.VERCEL_GIT_COMMIT_SHA || 'HEAD';
let changed;
try {
  const out = execSync(`git diff --name-only ${sha}^ ${sha}`, { encoding: 'utf8' });
  changed = out.split('\n').map((s) => s.trim()).filter(Boolean);
} catch {
  // Reintento defensivo: en el 2º+ push de una PR, Vercel a veces entrega un
  // clon shallow sin el commit padre → el diff de arriba falla y esto haría
  // fail-open (construir de más en las 8 apps, el patrón del incidente PR #904).
  // Profundizamos el clon una vez antes de rendirnos; si tampoco alcanza,
  // seguimos con el fail-open original (más vale construir de más que dejar
  // de construir algo que sí cambió). Primero --deepen=50 (casi siempre basta
  // para alcanzar al padre y es mucho más barato que bajarse la historia
  // ENTERA de este repo en cada ignore-step); --unshallow solo como último cartucho.
  try { execSync('git fetch --deepen=50', { encoding: 'utf8', stdio: 'pipe' }); } catch {}
  try { execSync(`git rev-parse ${sha}^`, { stdio: 'pipe' }); } catch {
    try { execSync('git fetch --unshallow', { encoding: 'utf8', stdio: 'pipe' }); } catch {}
  }
  try {
    const out = execSync(`git diff --name-only ${sha}^ ${sha}`, { encoding: 'utf8' });
    changed = out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    build('no se pudo calcular el diff ni tras "git fetch --unshallow" (shallow/primer commit) → construir');
  }
}

if (!changed.length) build('diff vacío → construir por seguridad');

// 3) Construir solo si el cambio afecta a ESTA app o a un package que ESTA app consume.
//
//    Antes, CUALQUIER cambio en packages/* reconstruía TODAS las apps. Era la regla
//    conservadora del primer día (evitaba derivar el cierre de dependencias), pero se
//    pasa de frenada: `apps/housesevillana` no declara ni un solo `@central/*` —solo
//    Next y React— y aun así se reconstruía cada vez que alguien tocaba, por ejemplo,
//    `packages/module-subastas`, que solo consume `plataforma`. Medido sobre 30 días:
//    6 de 92 commits tocaron packages/ y NINGUNO tocó la landing → 6 builds regalados
//    en esa app, y otros tantos en cada una de las que tampoco consumían el paquete.
//    Es la misma familia que el incidente de los ~600 US$ (PR #904), en pequeño.
//
//    Ahora se resuelve el cierre TRANSITIVO de dependencias `@central/*` de la app y
//    solo cuentan los packages que están dentro. El fail-open se mantiene intacto: si
//    algo no se puede leer o un directorio no se sabe a qué paquete corresponde, ese
//    cambio se considera relevante y se construye. Nunca se deja de construir por duda.
const RAIZ = new Set(['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'package.json']);

// Mapa directorio de packages/ -> nombre npm del paquete (packages/core-ai -> @central/core-ai).
// El nombre NO siempre coincide con la carpeta, así que se lee de su package.json.
function mapaPaquetes(raiz) {
  const porDir = new Map();
  for (const dir of readdirSync(`${raiz}/packages`, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    try {
      const pkg = JSON.parse(readFileSync(`${raiz}/packages/${dir.name}/package.json`, 'utf8'));
      if (pkg.name) porDir.set(dir.name, pkg.name);
    } catch { /* sin package.json legible: se queda fuera del mapa => se tratará como relevante */ }
  }
  return porDir;
}

// Cierre transitivo: la app declara @central/module-transporte, que a su vez puede
// declarar @central/core-identity. Tocar el segundo TAMBIÉN debe reconstruir la app.
function cierreDeps(raiz, appDir, porDir) {
  const dirDe = new Map([...porDir].map(([d, n]) => [n, d]));
  const deps = (ruta) => {
    const pkg = JSON.parse(readFileSync(ruta, 'utf8'));
    return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
      .filter((k) => k.startsWith('@central/'));
  };
  const vistos = new Set(), cola = deps(`${raiz}/${appDir}/package.json`);
  while (cola.length) {
    const nombre = cola.pop();
    if (vistos.has(nombre)) continue;
    vistos.add(nombre);
    const dir = dirDe.get(nombre);
    if (!dir) continue; // dependencia sin carpeta conocida: no puede casar con ningún cambio
    try { cola.push(...deps(`${raiz}/packages/${dir}/package.json`)); } catch { /* ilegible */ }
  }
  return vistos;
}

// Vercel corre esto con cwd = Root Directory (apps/<app>), así que la raíz queda dos
// niveles arriba; en local (tests, ejecución a mano) el cwd ya ES la raíz. Se localiza
// mirando dónde está `packages/` en vez de cablear '../..', que solo valdría en Vercel.
const raiz = ['../..', '.', '..'].find((p) => existsSync(`${p}/packages`)) ?? '../..';

let consumidos = null;  // null = no se pudo resolver => todo packages/ cuenta (fail-open)
let conocidos = null;   // carpetas de packages/ cuyo package.json SÍ se pudo leer
try {
  const porDir = mapaPaquetes(raiz);
  const cierre = cierreDeps(raiz, appDir, porDir);
  conocidos = new Set(porDir.keys());
  consumidos = new Set(
    [...porDir].filter(([, nombre]) => cierre.has(nombre)).map(([dir]) => dir),
  );
} catch (e) {
  console.log(`⚠ no se pudo resolver el cierre de dependencias (${e.message}) → packages/ cuenta entero`);
}

function tocaPaqueteConsumido(f) {
  if (consumidos === null) return true;      // no se pudo resolver nada: fail-open
  const partes = f.split('/');
  if (partes.length < 3) return true;        // suelto en packages/ (p.ej. packages/README.md)
  const dir = partes[1];
  // Carpeta sin package.json legible: NO se sabe quién la consume, así que se construye.
  // (Sin esto, un paquete ilegible se saltaría en silencio — fail-CLOSED, justo lo que
  //  este script no debe hacer nunca.)
  if (!conocidos.has(dir)) return true;
  return consumidos.has(dir);
}

const relevante = changed.some(
  (f) => f.startsWith(appDir + '/') || (f.startsWith('packages/') && tocaPaqueteConsumido(f)) || RAIZ.has(f),
);

if (relevante) build(`el commit toca ${appDir}/, un package que consume, o un manifiesto raíz`);
skip(
  `el commit no toca ${appDir} ni ninguno de sus packages` +
    (consumidos ? ` (consume ${consumidos.size})` : '') +
    ` (${changed.length} archivo(s) en otras rutas)`,
);
