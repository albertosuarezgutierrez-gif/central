<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Memoria entre sesiones (CRÍTICO — entorno efímero)

El contenedor cloud se borra al acabar la sesión: lo único que persiste es lo
commiteado. Para no perder contexto:

1. **Al empezar**, lee `docs/CONTEXTO-SESIONES.md` (estado vivo del proyecto).
2. **Al terminar cada sesión** (o tras un hito relevante: feature/fix/decisión),
   actualiza `docs/CONTEXTO-SESIONES.md`: añade una entrada nueva arriba en
   "Registro de sesiones" y refresca "Estado actual" / "Pendientes".
3. El hook `Stop` (`.claude/hooks/persist-memoria.sh`) commitea y empuja ese
   archivo automáticamente — pero el **resumen lo redactas tú** antes de cerrar.

# Skills disponibles

- **`ia-rest-maestro`** — contexto/arquitectura específicos de ia.rest (úsalo siempre).
- **Metodología (superpowers, subset vendorizado en `.claude/skills/`):**
  `brainstorming`, `writing-plans`, `systematic-debugging`,
  `verification-before-completion`, `requesting-code-review`, `receiving-code-review`.
  El hook `SessionStart` (`.claude/hooks/superpowers-session-start.sh`) inyecta
  `using-superpowers` al arrancar. Recuerda: **evidencia antes que afirmaciones** —
  no declares "verde" sin correr la verificación (p. ej. `next build` con deps, no
  solo `tsc`, que no reproduce el build de Vercel).
