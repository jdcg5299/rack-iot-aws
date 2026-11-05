# 05 — Checklist de evaluación y presentación

## Evidencia por criterio
| Criterio | Evidencia a mostrar |
|---|---|
| Funcionalidad | DynamoDB → *Explore table items* con filas nuevas apareciendo en vivo |
| Comunicación | MQTT test client suscrito a `rack/#` recibiendo cada 5 s; conexión estable ≥ 10 min |
| Diseño del dashboard | URL de S3 con tarjetas, gráfica, actuador y CSV |

## Pruebas finales
- [ ] Publicar un mensaje manual → aparece en DynamoDB.
- [ ] Simulador/Wokwi corriendo 10 min sin caídas.
- [ ] CSV abre bien en Excel y tiene fecha legible.
- [ ] Botón del actuador cambia el LED en Wokwi (o imprime comando en el simulador).
- [ ] Alerta visual cuando temperatura > 27 °C (forzar con el simulador).

> Para estudiar el proyecto usa [`06-guia-de-estudio.md`](06-guia-de-estudio.md) y para el día de la exposición
> [`07-guia-de-sustentacion.md`](07-guia-de-sustentacion.md).

## README del repo (estructura)
1. Descripción y caso de uso (rack de servidores)
2. Diagrama de arquitectura
3. Requisitos (AWS Academy, Wokwi, Python)
4. Paso a paso con capturas (enlazar `docs/`)
5. Cómo ejecutar el simulador/firmware
6. Cómo desplegar el dashboard
7. Estructura del repo y `.gitignore` (certificados fuera)
8. Limpieza de recursos

## Guion de presentación (8–10 min)
1. Problema (1 min): por qué monitorear un rack.
2. Arquitectura (2 min): diagrama.
3. Demo (4 min): dispositivo → MQTT test client → DynamoDB → dashboard → actuador → CSV.
4. Retos y aprendizajes (1 min): permisos de Academy, CORS, certificados.
5. Siguientes pasos (1 min): alertas SNS, Timestream/Grafana, ESP32 físico.
- **Plan B:** video corto o capturas por si falla el WiFi.

## Limpieza al terminar
Borrar regla IoT, Thing/certificado/policy, tabla DynamoDB, API Gateway, Lambda y bucket S3 (vaciar antes de eliminar).
