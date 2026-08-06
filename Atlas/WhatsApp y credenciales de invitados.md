---
tags: [atlas, netbot, whatsapp, pendiente, bloqueado]
updated: 2026-08-06
---

# WhatsApp y credenciales de invitados

Módulo de [[Proyecto Atlas]] — **requerimiento en pausa** (2026-08-06), esperando que el usuario
consulte con Lucas antes de seguir. Nada de esto está implementado. Esta nota es el estado
completo de la conversación de diseño hasta donde llegó, para no tener que re-derivarlo cuando se
retome.

## Origen y qué NO es

Surgió de "cómo integrar WhatsApp" en el contexto de [[LLM y tools]] (que ya cubre notificaciones
a técnicos vía Telegram). **Esto es otra cosa**: no es un canal de alertas para técnicos — es
soporte/entrega de credenciales de red a **clientes del evento**, gente anónima identificada solo
por su número de teléfono, sin login ni rol de NetBot.

## Decisiones ya tomadas en la conversación

1. **Modelo de interacción**: el chatbot (mismo orquestador LLM de `/chat`) responde directo a los
   clientes por WhatsApp, sin bandeja manual ni humano en el medio. Requiere un rol nuevo, más
   acotado que VISUALIZADOR — todavía sin definir qué tools/datos expone exactamente.
2. **Tipo de credencial**: **voucher único por cliente**, no una contraseña de WiFi compartida.
   Se descartó la opción compartida explícitamente.
3. **Flujo de alta**: un técnico/admin sube un **CSV con el listado de redes a crear** (mismo
   patrón que el CSV de VLANs ya existente, `propose_vlan_plan`/`CsvRowSchema` — a confirmar si
   se reusa o es un flujo paralelo), y de ahí sale un **flujo de entrega vía formulario** hacia el
   cliente (sin terminar de especificar: ¿el formulario lo llena el técnico con los datos del
   cliente, o el cliente mismo?).

## El bloqueador real: vouchers únicos requieren la API clásica de UniFi

Los vouchers de portal cautivo/hotspot de UniFi (que son los que efectivamente pueden dar acceso
*distinto* por cliente, no solo un registro cosmético) viven en la **API clásica** del
controller (usuario/password), no en la Integration API (`X-API-KEY`) que usa todo lo demás en
NetBot hoy (`liveClient.ts`, ver [[OPNsense y UniFi]]).

Esas credenciales clásicas **no están configuradas en el UDM real, por decisión explícita** — ver
[[Infraestructura Real]] § gobernanza (`liveClient.ts` lo documenta también: *"no se creó una
cuenta local clásica en el UDM real por decisión explícita... exigirlas bloquearía
`UNIFI_MODE=live` por completo para una función que nunca se usa"*, referido a `listAlerts`, el
único otro punto que toca la API clásica).

Dos caminos, ninguno trivial:

- **(a) Revisar la decisión de gobernanza** — crear una cuenta clásica en el UDM real, acotada
  solo a gestión de hotspot/vouchers. Es una decisión sobre la infra real, no del software — por
  eso el usuario va a consultarlo con Lucas (supervisa la infra real / [[Plataforma ATLAS (Codex)]],
  ver [[Infraestructura Real]] y [[Rutas de Red]] § "confirmar con Lucas").
- **(b) Vouchers "propios" de NetBot, sin que UniFi los aplique** — trackearíamos códigos
  nosotros, pero si la red sigue siendo WPA-Personal con una sola contraseña compartida (estado
  actual: `WifiNetwork.ssid`/`vlanId`, sin passwords per-cliente), el voucher sería **solo
  auditoría, no control de acceso real** — cualquiera con la contraseña de red entra, tenga o no
  voucher. Para que un voucher controle acceso de verdad hace falta o (a) o migrar a
  WPA-Enterprise/RADIUS (cambio de arquitectura de red bastante más grande, no evaluado).

**No se debe construir la opción (b) presentándola como "credencial única por cliente"** sin dejar
clarísimo que no bloquea/permite nada distinto a nivel de red — sería una feature cosmética
disfrazada de control de acceso real.

## Buena noticia que sigue en pie: el costo de WhatsApp en este modelo

Sea cual sea el camino de los vouchers, el hallazgo de costos de mensajería sigue siendo válido:
como en este diseño **el cliente siempre escribe primero** (le pide la credencial al bot), toda
respuesta del bot cae en la categoría de **"service conversation"** de WhatsApp — gratis desde el
cambio de Meta de 2023, sin necesidad de plantillas pre-aprobadas ni costo por mensaje. Esto es
distinto del caso "bot inicia la conversación" (ej. notificar proactivamente a un técnico), que sí
tiene costo y requiere plantillas aprobadas — ver [[LLM y tools]] si en algún momento se evalúa
WhatsApp para ese otro caso.

## Preguntas abiertas para retomar

- ¿Se crea la cuenta clásica acotada en el UDM real, o se define otra estrategia? (bloqueada en
  Lucas)
- Alcance exacto del rol "cliente anónimo": ¿qué tools/datos puede ver por WhatsApp? (se descartó
  reusar VISUALIZADOR tal cual, por exponer detalle interno de nodos/sitios a cualquiera con el
  número — pendiente definir la tool acotada reemplazante)
- ¿El CSV de "redes a crear" es una extensión del flujo de VLAN existente o algo paralelo?
- ¿El formulario de entrega lo llena el técnico (con los datos del cliente) o es autoservicio del
  cliente? Si es autoservicio, es una vista pública sin auth — superficie nueva a asegurar
  (rate limiting, evitar abuso).
- Modelo de datos: no existe hoy ningún concepto de "voucher"/"cliente"/"entrega de credencial" en
  el schema — falta diseñarlo completo una vez resueltas las preguntas de arriba.

## Ver también

- [[LLM y tools]] — el orquestador de chat que se reutilizaría, y el canal de notificaciones a
  técnicos (Telegram) que esto NO reemplaza
- [[Infraestructura Real]] — gobernanza de la infra real, por qué no hay cuenta clásica en el UDM
- [[Rutas de Red]] — dónde más aparece "confirmar con Lucas" antes de decisiones operativas
- [[Plataforma ATLAS (Codex)]] — el otro sistema que Lucas supervisa sobre la misma infra real
