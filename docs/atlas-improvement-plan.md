# Plan de mejoras de Atlas

El stack actual se conserva. Netbot aporta patrones de aislamiento, permisos y
atención; las implementaciones se adaptan a los contratos propios de Atlas.

| Etapa | Alcance | Estado |
|---|---|---|
| 1 | Limpiar historial/caché entre cuentas y descartar respuestas tardías | Implementada localmente |
| 2 | Conversaciones privadas en servidor, recuperación, eliminación y control de concurrencia | Implementada localmente |
| 3 | Propuestas persistidas, aprobación explícita vinculada al actor/versión y vencimiento; retirar ejecución del LLM | Implementada localmente para cambios de red |
| 4 | Asignaciones por sitio/evento, autorización en servicios/workers y WebSocket autenticado con eventos filtrados | Pendiente |
| 5 | Idempotencia y seguimiento por operación, estados parciales/inciertos y conciliación sin reintentos ambiguos | Pendiente |
| 6 | Login con Google Workspace restringido, administración de usuarios/roles, revocación y auditoría consultable/exportable sin secretos | Pendiente |
| 7 | Contratos específicos UniFi/OPNsense, timeouts, errores tipados y antigüedad/origen de datos | Pendiente |
| 8 | Crear/modificar SSID, seleccionar AP y asociar VLAN existentes mediante planes aprobados | Pendiente |
| 9 | Registro del ciclo de atención y reportes agregados de volumen, resultados y duración | Pendiente |

## Entregas y aceptación

1. Privacidad y continuidad: etapas 1–2. Otra cuenta no ve datos anteriores;
   conversaciones ajenas devuelven 404, incluso para admin. Historial construido
   por servidor, pregunta/respuesta atómicas y un turno simultáneo por conversación.
2. Control de cambios: etapas 3–5. El LLM no aprueba ejecuciones; acceso revocado
   bloquea trabajos pendientes. Reinicios y solicitudes repetidas no duplican
   escrituras. Lo incierto requiere conciliación explícita.
3. Operación administrable: etapa 6. Gestionar accesos y rastrear aprobación,
   ejecución y verificación desde la aplicación.
4. Infraestructura: etapas 7–8. Distinguir fallas de proveedor de caídas reales;
   validar escrituras en laboratorio con versión de controlador identificada.
5. Reportes de atención: etapa 9, dependiente de la persistencia de conversaciones
   de la etapa 2 y de los permisos de consulta de la etapa 6. Contar solo atenciones
   efectivas y mostrar resultados agregados sin revelar conversaciones privadas.

Cada entrega incluye migraciones, pruebas críticas y documentación. Atención a
invitados, QR y recuperación por correo quedan para una ampliación posterior.

## Login con Google y administración · etapa 6

Configuración inicial confirmada por el usuario:

| Correo | Rol inicial |
|---|---|
| desarrollo@diktya.cl | ADMIN |

Dominio autorizado: `diktya.cl`. No hay técnicos ni otros usuarios autorizados
definidos para el login con Google por ahora. El administrador habilitará las demás
cuentas y asignará sus roles desde la gestión de usuarios. Pertenecer al dominio
no concede acceso automáticamente.

Implementar la verificación del token de Google en el backend (firma, emisor,
audiencia, vencimiento, correo verificado y dominio Workspace `hd`), con protección
del flujo de autenticación contra CSRF/reutilización. Restringir también el dominio
del correo a `diktya.cl`. Vincular la identidad estable de Google (`sub`) al usuario
de Atlas; no aceptar roles ni identidades declarados por el navegador.

La cuenta inicial se provisionará de forma controlada e idempotente. No promover
su rol en cada login ni recrearla automáticamente después de una revocación.
Definir la vinculación con cuentas existentes y la política de segundo factor
antes de activar el acceso; conservar la protección del último administrador.

Pendiente configurar el cliente OAuth en Google Cloud, las direcciones autorizadas
y sus variables de entorno, además de implementar y probar el flujo. Este registro
documenta la asignación acordada: no crea una cuenta ni activa Google en el despliegue.

Aceptación: la cuenta inicial obtiene ADMIN tras autenticación válida; correos de
otros dominios y cuentas del dominio no habilitadas son rechazados. Probar tokens
inválidos, vinculación de identidad, revocación y conservación de los datos propios
del usuario (conversaciones, tickets y reportes).

## Reportes de atenciones · etapa 9

Una atención comienza con el primer intercambio pregunta/respuesta guardado
correctamente. Crear una conversación vacía, reintentar una solicitud o recibir
un error del proveedor no suma otra atención. Inicialmente, una conversación
representa una atención; el cierre es terminal y continuar requiere otra conversación.

Registrar inicio, cierre, estado y resultado, con el actor que confirma cada
transición. Estados: en curso, cerrada y abandonada. Resultados de cierre:
resuelta por el asistente, resuelta por un técnico, derivada o sin resolución.
La resolución requiere confirmación explícita del usuario o técnico autorizado;
una respuesta del LLM no acredita resolución. La derivación debe vincularse al
ticket correspondiente y no equivale a un problema resuelto. Definir y documentar
el umbral de inactividad antes de automatizar la clasificación de abandono.

| Indicador | Regla |
|---|---|
| Atenciones iniciadas | Primer intercambio confirmado dentro del período |
| Atenciones completadas | Cierre explícito dentro del período, desglosado por resultado |
| Resueltas por el asistente | Cierre confirmado con ese resultado |
| Resueltas por técnicos | Cierre confirmado con ese resultado |
| Derivadas | Cierre con resultado de derivación y ticket vinculado |
| En curso / abandonadas | Estado al momento del reporte; abandono solo con política definida |
| Usuarios atendidos | Usuarios distintos con al menos un intercambio confirmado en el período |
| Intercambios atendidos | Pares pregunta/respuesta guardados en el período, sin duplicar reintentos |
| Duración promedio | Inicio a cierre de las atenciones completadas; no es tiempo de respuesta del asistente |

Implementar API y pantalla para administradores con filtros por período y resultado,
agrupación diaria y exportación CSV. Aplicar límites de rango/exportación y zona
horaria explícita; intervalos de inicio inclusivo y fin exclusivo. Las atenciones
iniciadas y cerradas se filtran por sus respectivas fechas: no asumir que pertenecen
a la misma cohorte ni calcular una tasa de resolución mezclando ambos conjuntos.

Los reportes contienen cifras agregadas, sin mensajes, contactos ni resultados
crudos de herramientas. Conservar metadatos mínimos de atención separados del
contenido del chat para que borrar una conversación no reduzca silenciosamente
los totales históricos. Definir retención y anonimización de esos metadatos, incluida
la forma de contar usuarios distintos después de eliminar una cuenta.

Aceptación: excluir conversaciones vacías, fallos y reintentos; impedir cierres
duplicados o por actores no autorizados; verificar períodos y zonas horarias,
derivaciones con ticket, duración y conservación de totales tras borrar el chat.
Comprobar que API/exportación no permiten recuperar contenido privado.

Las conversaciones existentes pueden aportar volumen desde su primer intercambio.
No inferir retrospectivamente resolución, abandono ni fecha de cierre: mostrar
esos resultados como no registrados cuando no exista evidencia.

## Primera entrega

Incluye migración de conversaciones, API privada y selector de conversación.
El frontend elimina el historial anterior sin importarlo: no hay asociación fiable
entre esos mensajes y una cuenta. Actualizar frontend/backend juntos y aplicar
la migración antes del arranque; ver los README de ambas aplicaciones.

La API pagina conversaciones; el selector muestra las 30 más recientes. Los mensajes
se recuperan por páginas de hasta 100. Los resultados crudos de herramientas no se
persisten con el chat. Si el proceso se interrumpe durante un turno, se conserva
su bloqueo: el usuario puede recuperar el historial y empezar otra conversación.
La reconciliación de ese turno y el manejo transaccional de acciones de herramientas
no están resueltos por la persistencia del chat; corresponden a etapas posteriores.


## Segunda entrega · aprobación de cambios de red

Etapa 3 implementada localmente: planes inmutables en PostgreSQL y aprobación
explícita por fila, vinculada al actor, rol, versión, huella y vigencia. El LLM
solo propone; reservar/aplicar dejó de ser una herramienta disponible. Los planes
se vinculan también a su entorno/controlador para impedir ejecutar simulaciones
en infraestructura real. UI con confirmación, recuperación de propuestas y estados
reales de ejecución; 202 no se presenta como aplicado.

El worker reconstruye el cambio desde la aprobación, revalida tras esperas externas
y toma la aprobación una sola vez. La liberación solo está disponible cuando no
hay escritura en curso ni resultado incierto. Se preserva el historial mediante
un índice único parcial de reservas activas. API y README detallan los contratos,
las dos migraciones y la actualización conjunta de servidor, frontend y workers.

Esta entrega no completa las etapas 4–5: quedan autorización por sitio/evento,
WebSocket, conciliación automática de ejecuciones interrumpidas, outbox/reencolado
autónomo y validación real de integraciones. Fallos ambiguos no se reintentan;
aprobaciones guardadas cuyo encolado falló se recuperan mediante reintento explícito.
Las pruebas usan base temporal y adaptadores simulados, sin operar equipos reales.
