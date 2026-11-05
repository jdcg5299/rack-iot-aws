# Constitution — Monitoreo IoT de Rack de Servidores en AWS

Principios no negociables del proyecto. Cualquier decisión técnica, documento o código
generado (por mí o por un agente) debe respetarlos.

## 1. Propósito
Practicar la **creación manual de recursos en AWS** (IoT Core, DynamoDB, Lambda, API Gateway, S3)
construyendo un sistema que monitorea **temperatura y humedad de un rack de servidores**,
con control remoto de un actuador (ventilador/enfriamiento) y descarga de datos en CSV.

## 2. Principios
1. **Aprender > automatizar.** Cada recurso se crea primero por consola, entendiendo qué hace y por qué.
   IaC (CloudFormation/Terraform) solo es opcional al final.
2. **Compatible con AWS Academy.** Se asume Learner Lab: no se crean roles/usuarios IAM; se usa `LabRole`.
   Si algo requiere permisos que no hay, se documenta la alternativa.
3. **Secretos fuera de Git.** Certificados (`*.pem`, `*.key`), endpoint real y credenciales jamás se commitean.
   `.gitignore` se crea **antes** del primer commit.
4. **Mínimo viable primero.** Orden: IoT Core recibe → DynamoDB guarda → API lee → Dashboard muestra → actuador.
   No se avanza a la siguiente capa sin verificar la anterior.
5. **Verificable.** Cada paso termina con una prueba concreta (MQTT test client, Explore table items, curl, navegador).
6. **Dispositivo intercambiable.** Wokwi (ESP32 virtual) y el simulador Python publican el **mismo contrato** de topics y payload.
   Si hay ESP32 físico, el cambio no afecta a la nube.
7. **Costo cercano a cero.** Capa gratuita / créditos de Academy: DynamoDB on-demand, Lambda, HTTP API. Limpiar recursos al terminar.
8. **Documentación como entregable.** El README y los docs son parte de la nota (paso 6 de la actividad).

## 3. Contrato de datos (fuente de verdad)
- Región: `us-east-1` (confirmar en el lab; usar la misma para todo).
- Thing: `rack01-sensor`
- Topic telemetría (dispositivo → nube): `rack/rack01/telemetry`
- Topic comandos (nube → dispositivo): `rack/rack01/cmd`
- Topic estado actuador (dispositivo → nube): `rack/rack01/status`
- Payload telemetría:
  ```json
  { "deviceId": "rack01", "ts": 1767225600000, "temperature": 24.6, "humidity": 41.2 }
  ```
- Payload comando: `{ "actuator": "fan", "state": "ON" }`
- Tabla DynamoDB `RackTelemetry`: PK `deviceId` (String), SK `ts` (Number, epoch ms).
- Umbral de alerta por defecto: temperatura > 27 °C (límite superior recomendado ASHRAE para entradas de aire) o humedad fuera de 20–80 %.

## 4. Convenciones
- Nombres de recursos en minúscula: `rack01-sensor`, `rack_telemetry_to_dynamo` (las reglas de IoT solo admiten letras, números y `_`), `rack-api`.
- Etiqueta `project=rack-iot` en todo lo que lo permita.
- Código: dispositivo en C++/Arduino (o Python para el simulador), Lambdas en Python 3.12, dashboard en HTML/JS estático sin build.
- Commits pequeños y en español, un commit por paso verificado.

## 5. Definición de "terminado"
- [ ] Datos visibles en DynamoDB (Explore items).
- [ ] Conexión MQTT estable ≥ 10 min sin desconexiones.
- [ ] Dashboard en URL de S3 mostrando datos, botón de actuador funcional y CSV descargable.
- [ ] Repo en GitHub con README, diagrama y paso a paso.
- [ ] Presentación lista con demo en vivo + plan B (capturas/video).
