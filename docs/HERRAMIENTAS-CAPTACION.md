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
- [nóminas] simulador de coste empresa → bruto + SS empresa + finiquito potencial por puesto → motor `module-nominas` en modo `simulacion`, pantalla pública de captación.
- [nóminas] alta en 3 pasos → empresa, convenio, empleados → asistente sobre `/api/operador/empresas` + tablas de convenio.
- [nóminas] importar Excel → plantilla de empleados/salarios del gestor anterior → parseo `xlsx` + emparejado por NIF (nunca fundir identidades).
- [nóminas] nómina explicable → cada línea con su porqué y su fuente → `datos_calculo` + texto por concepto en `/e`.
- [nóminas] SILTRA → ficheros de cotización a la TGSS → generador desde las nóminas confirmadas (fase posterior, alto riesgo).
- [nóminas] IT/bajas → partes de baja y su efecto en la nómina → incidencias del mes con complemento por convenio.
- [nóminas→correduría] detector de seguro obligatorio por convenio (vida/accidentes) → lead a la correduría, solo con consentimiento registrado.
- [nóminas→correduría] seguro de salud como retribución flexible exenta (hasta 500 €/año por persona, art. 42.3.c LIRPF) → simulador de ahorro + lead.
