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

## Hechas (07/11/2026, sin commitear al escribir esto)

- [x] [nóminas] simulador de coste empresa → `simularCosteContratacion` (`packages/module-nominas/src/simulador.ts`, modo `simulacion`) + calculadora pública `grupoasegura.es/calculadora-coste-trabajador` (apps/asegura-web).
- [x] [nóminas→correduría] seguro de salud como retribución flexible (art. 42.3.c LIRPF, 500 €/año por persona) → dentro del mismo simulador/calculadora.
- [x] [nóminas] alta en 3 pasos → `/admin/empleados/nuevo` (apps/rrhh, reglas `lib/alta-empleado.ts`, escritura única `lib/alta-empleado-repo.ts`).
- [x] [nóminas] importar Excel/CSV → `/admin/empleados/importar` (vista previa por fila, duplicados por DNI/NAF/email, nunca funde identidades). XLSX solo lectura.
- [x] [nóminas] nómina explicable → `lib/nomina-explicacion.ts`; anexo «Cómo se ha calculado tu nómina» en el PDF que recibe el trabajador.
- [x] [nóminas→correduría] seguro obligatorio por convenio → `/admin/nominas/convenio/seguro` + lead a plataforma solo con consentimiento (migración rrhh 0036 PENDIENTE de aplicar).

## Ideas pendientes

- [sector] programa visto → qué hace → cómo lo haríamos nosotros
- [nóminas] SILTRA → ficheros de cotización a la TGSS → generador desde las nóminas confirmadas (fase posterior, alto riesgo).
- [nóminas] IT/bajas → partes de baja y su efecto en la nómina → incidencias del mes con complemento por convenio.
