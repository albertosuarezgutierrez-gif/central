# 🧠 Memoria de sesiones — central (repo GitHub: ia.rest → renombrar)

> Contexto persistente entre sesiones de Claude Code. El entorno cloud es
> **efímero** (el contenedor se borra al acabar), así que lo único que sobrevive
> es lo commiteado aquí. Este archivo es el "estado vivo" del proyecto entre sesiones.
>
> **Cómo se mantiene:** al terminar cada sesión, Claude añade una entrada nueva
> arriba del todo en "Registro de sesiones" y actualiza "Estado actual" y
> "Pendientes" si algo cambió. Un hook `Stop` (`.claude/hooks/persist-memoria.sh`)
> commitea y empuja este archivo automáticamente.
>
> Para arquitectura/módulos completos → skill `ia-rest-maestro`. Esto es solo el
> registro de qué se hizo y qué queda.

---

## 📌 Estado actual (lo más reciente arriba)

- **⚙️ GOTCHA del entorno cloud (descubierto 11/06, importante para futuras sesiones):** en el contenedor remoto el **`git push` por HTTPS da `503` de forma persistente** (read/fetch/ls-remote SÍ funcionan; solo el push está bloqueado) → el hook `Stop` de memoria NO puede empujar. **Para escribir en GitHub usa las tools MCP** (`mcp__github__push_files` / `create_or_update_file`) o, para ficheros grandes, **rama temporal vía MCP → PR → `merge_pull_request`**. OJO: `push_files` mete el contenido **inline** y un agente puede **truncarlo** (pasó con este `CONTEXTO`, ~69 KB: quedó en "PENDING"/"PLACEHOLDER" y hubo que restaurarlo). Patrón seguro para ficheros grandes: subir a **rama aparte**, **verificar tamaño/marcadores**, y solo entonces **PR + merge** a `main` (commits `chore:` no redepliegan). Para restaurar un fichero a una versión previa sin retecleo: existe el blob en el historial (`git checkout <sha> -- <fichero>` desde un equipo con push).

[[FULL_CONTENT_PLACEHOLDER_DO_NOT_USE]]
