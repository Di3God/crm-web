# CRM Tasatop — Version Web

Aplicacion web del CRM comercial de Tasatop. Replica 1:1 la logica del
sistema en Google Sheets:

- **Cadencia 3x5**: probabilidad 30% al asignar, −2% por intento fallido, piso 4%.
- **Score de calificacion 0–90**: interes (25), ticket por rango (30),
  tiempo de inversion (20), experiencia (15).
- **Probabilidad por tramos de etapa**: contactado 15–50%, agendado 50–70%,
  reunion efectiva 62–88%, cierre pendiente 94%, ganado 100%, perdido 0%.
- **Prioridad operativa**: cierre pendiente / reunion proxima / accion vencida
  fuerzan "Muy alta"; en fase 3x5 manda el numero de intentos.
- **Validacion de gestion**: los 4 factores se exigen SOLO en
  "Respondio - pidio informacion" y "Respondio - interesado".
- **Autocalculo de fecha proxima accion**: +1 dia habil 9am (3x5, calificar,
  agendar...), reunion −2h (confirmar), +2 dias habiles (seguimiento),
  +2h (WhatsApp), salta fines de semana. Horario 9am–6pm.
- **Trazabilidad**: hora + etapa por gestion, intentos X/15, total,
  tiempo de asignado a contactado.
- **Dashboard**: KPIs del dia, embudo por etapa, gestion por asesor,
  pipeline estimado por rango de ticket.

## Requisitos

- Node.js **22 o superior** (usa el modulo SQLite nativo de Node).

## Instalacion y arranque

```bash
npm install        # instala express (unica dependencia)
node server.js     # levanta en http://localhost:3000
```

La base de datos se crea sola en `crm.db` (archivo local SQLite).
Para reiniciar desde cero: borrar `crm.db` y volver a arrancar.

## Estructura

```
crm-web/
├── server.js          # API REST (Express) + servidor de archivos
├── logic.js           # TODA la logica de negocio (testeada)
├── public/index.html  # Interfaz: Mis Leads, Registro, Trazabilidad, Dashboard
├── package.json
└── crm.db             # (se genera al arrancar)
```

## API

| Metodo | Ruta | Funcion |
|---|---|---|
| GET | /api/catalogos | Listas para los desplegables |
| POST | /api/leads | Crear lead (genera codigo TST-AAAAMMDD-NNNNNN) |
| GET | /api/leads?asesor=Mafer | Cola activa ordenada (Mis Leads) |
| GET | /api/leads/:codigo | Detalle consolidado de un lead |
| PUT | /api/leads/:codigo/asignar | Asignar/reasignar asesor |
| POST | /api/gestiones | Registrar gestion (valida y autocalcula fecha) |
| GET | /api/leads/:codigo/trazabilidad | Trazabilidad del lead |
| GET | /api/dashboard | KPIs, embudo y gestion por asesor |

Las gestiones invalidas devuelven **422** con el motivo exacto
("Falta calificacion...", "Falta fecha de reunion", etc.). Una asesora no
puede gestionar leads de otra (**403**).

## Despliegue (produccion)

Cualquier servicio que corra Node 22+ sirve. Opciones simples y baratas:

- **Railway / Render**: conecta el repo, comando de inicio `node server.js`.
  El archivo `crm.db` necesita un volumen persistente (ambos lo ofrecen).
- **VPS (DigitalOcean, Lightsail)**: `node server.js` detras de un
  `systemd` service o `pm2`, con Nginx delante si quieres HTTPS y dominio.

Variables: `PORT` (por defecto 3000).

## Pendientes conocidos (siguiente iteracion)

- Autenticacion real con contrasena por asesor (hoy es un selector de rol).
- Multi-empresa (multi-tenant) si se comercializa a terceros.
- Exportar reportes (CSV/Excel).
- Migrar SQLite -> PostgreSQL si el volumen crece (la API no cambia).
