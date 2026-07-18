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
//   2) El diff toca apps/<app>/, packages/ o los manifiestos raíz            => CONSTRUIR.
//   3) En cualquier otro caso                                                => SALTAR.
//   4) Ante CUALQUIER duda (clon shallow, primer commit, error git)          => CONSTRUIR (fail-open).
//
// Uso (en cada apps/<app>/vercel.json):
//   "ignoreCommand": "node ../../scripts/vercel-ignore-build.mjs apps/<app>"

import { execSync } from 'node:child_process';

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
  // de construir algo que sí cambió).
  try { execSync('git fetch --unshallow', { encoding: 'utf8', stdio: 'pipe' }); } catch {}
  try {
    const out = execSync(`git diff --name-only ${sha}^ ${sha}`, { encoding: 'utf8' });
    changed = out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    build('no se pudo calcular el diff ni tras "git fetch --unshallow" (shallow/primer commit) → construir');
  }
}

if (!changed.length) build('diff vacío → construir por seguridad');

// 3) Construir solo si el cambio afecta a ESTA app o a dependencias compartidas.
//    Regla conservadora a propósito: cualquier cambio en packages/* reconstruye
//    la app (las apps consumen packages compartidos vía file: deps +
//    transpilePackages; los packages cambian poco). Evita derivar el cierre de
//    dependencias por app y nunca deja de construir algo que sí cambió.
const RAIZ = new Set(['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'package.json']);
const relevante = changed.some(
  (f) => f.startsWith(appDir + '/') || f.startsWith('packages/') || RAIZ.has(f),
);

if (relevante) build(`el commit toca ${appDir}/ o dependencias compartidas`);
skip(`el commit no toca ${appDir} (${changed.length} archivo(s) en otras rutas)`);
