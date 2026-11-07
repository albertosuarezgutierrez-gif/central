# Herramientas-regalo para captación (Grupo ASegura y verticales)

> Ideas de herramientas útiles por sector que sirven para captar clientes. Estado vivo de ideas;
> la estrategia de Patrimonio está en `docs/ESTUDIO-PATRIMONIO-MERCADO.md` (sección 6).

## Método acordado (07/11/2026, Alberto)

Cuando veamos un programa útil para un sector concreto:

1. Se copia la IDEA y el FUNCIONAMIENTO observado desde fuera (usándolo como usuario, demos, docs públicas).
2. Se construye con código propio en central.
3. Se ofrece a los clientes de ese ramo como captación (gratis, de pago o regalado, según el caso).

**Límites legales:** no descompilar ni desensamblar el programa ajeno para clonarlo (art. 100 LPI /
Directiva 2009/24/CE solo lo permite para interoperabilidad). No copiar código, marca, textos ni diseño
idénticos. Preferir bases de código abierto MIT/Apache.

## Recurso: REA (https://github.com/morluto/rea)

- «Reverse Engineer Anything», servidor MCP en TS/Node (npm `rea-agents`), licencia MIT.
- Integra Ghidra, Hopper, Frida, pwndbg, mitmproxy, adb.
- Analizado el 07/11/2026: **no es una herramienta-regalo** y **no corre en Vercel** (necesita una
  estación propia con esas herramientas nativas). Se guarda como recurso.
- Uso válido: analizar NUESTRAS apps (seguridad) o la interoperabilidad con un sistema que ya usamos
  (p. ej. exportar datos de un programa del cliente).
- **Alto riesgo:** da a un agente control de depuradores y de tráfico. Nunca cerca de la BD de clientes
  ni de producción.
- **No instalado.** Se instala solo cuando haya un caso concreto.

## Ideas pendientes

- [sector] programa visto → qué hace → cómo lo haríamos nosotros
