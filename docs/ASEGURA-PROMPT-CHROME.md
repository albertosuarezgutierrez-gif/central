# Grupo Asegura — prompt para Claude Chrome (inventario del repo por navegador)

> **Para qué:** Claude Code **no puede leer** `manuelsuarez/asegura` (la app de Claude solo está
> instalada en `albertosuarezgutierrez-gif`). Alberto **sí** entra como colaborador desde el
> navegador. Este prompt hace que Claude Chrome saque el inventario por la web y lo devuelva en
> un informe que se pega de vuelta en Claude Code.
>
> **Read-only a propósito:** no escribe, no comenta, no envía nada, y NO copia valores de secretos.

---

## PROMPT 1 — Inventario del repositorio (pegar tal cual en Claude Chrome)

```
Trabaja en modo SOLO LECTURA sobre https://github.com/manuelsuarez/asegura (repo privado,
tengo acceso como colaborador; ya estoy logueado).

REGLAS INNEGOCIABLES:
- No edites, no crees ramas, no abras issues ni PRs, no dejes comentarios, no pulses "Merge",
  "Transfer", "Delete" ni ningún botón que cambie algo. Solo navegar y leer.
- Si encuentras claves, tokens, contraseñas o URLs con credenciales: apunta SOLO EL NOMBRE de la
  variable (p. ej. `SUPABASE_SERVICE_ROLE_KEY`). NUNCA copies el valor, ni entero ni troceado.
- Si algo no lo encuentras, escribe "NO ENCONTRADO". No lo deduzcas ni lo inventes: que no
  aparezca un archivo no significa que no exista, significa que no lo has visto.

Recorre y resúmeme, en este orden:

1. RAÍZ: lista de carpetas y archivos de primer nivel de la rama `principal`/`main`.
2. `package.json`: versión de Next.js, React, si usa Prisma o supabase-js, gestor de paquetes,
   y la lista de scripts.
3. `README.md` y todo lo que haya en la carpeta `documentos/`: dime qué hace el producto,
   qué módulos tiene y qué está terminado vs a medias. Esto es lo más importante del encargo.
4. BASE DE DATOS — busca en este orden y dime cuál existe:
   `prisma/schema.prisma`, `supabase/migrations/`, `db/`, `drizzle/`, `sql/`.
   Dame la LISTA DE TABLAS con sus columnas principales, y si hay políticas RLS.
5. `supabase/config.toml` o similar: el `project_id`/`project_ref` del proyecto Supabase.
   Y lista de carpetas dentro de `supabase/functions/` si las hay.
6. VARIABLES DE ENTORNO: busca `.env.example`, `.env.sample`, `.env.template`, y también
   `vercel.json` y `next.config.*`. Dame solo los NOMBRES de las variables.
7. RUTAS: contenido de `app/` o `src/app/` — qué pantallas y qué endpoints de API hay.
8. `.github/workflows/`: qué comprueba el CI.
9. ESTADO DEL PROYECTO: los 2 Pull Requests abiertos (título y de qué van), los 3 "Releases"
   (la última es v0.2.5), y en la pestaña de ramas dime cuáles son las 5 más recientes y contra
   cuál va el trabajo vivo — hay 258 ramas y necesito saber cuál manda.
10. `.claude/agentes/` y `.githooks/`: qué automatismos trae montados.

FORMATO DE SALIDA: un solo bloque en Markdown, con un apartado por cada punto del 1 al 10,
listo para copiar y pegar. Al final, una sección "DUDAS" con lo que no pudiste ver y por qué.
```

---

## PROMPT 2 — Solo si tengo acceso al Vercel / Supabase de `asegura`

```
Modo SOLO LECTURA. No cambies ninguna configuración, no despliegues, no rotes claves.

A) En https://vercel.com — busca el proyecto que despliega `asegura.vercel.app`.
   Dime: a qué equipo/cuenta pertenece, el Root Directory, el repo de Git conectado,
   los dominios asignados, y en Settings → Environment Variables SOLO LOS NOMBRES de las
   variables (nunca los valores; ni siquiera los reveles en pantalla).

B) En https://supabase.com/dashboard — dime qué organizaciones y proyectos veo, y para el
   proyecto de asegura: su Reference ID, la región, el plan, el tamaño de la base de datos,
   y en Table Editor la lista de tablas por schema.

Si no tengo acceso a alguna de las dos, dilo claramente: "sin acceso", y no intentes entrar
por otra vía ni con otra cuenta.
```

---

## Qué hago yo con eso

Con el informe del Prompt 1 pegado en Claude Code puedo, sin necesidad de acceso al repo:
traducir su modelo de datos al schema `seguros` (ya creado), escribir el SQL de las tablas,
planificar el import a `apps/asegura` y decir qué está hecho y qué falta de verdad.
