# Studio · Pilates Reformer — App de gestión

App web para administrar alumnos, turnos, asistencia, pagos y reportes de un centro de pilates reformer.

---

## ¿Qué necesitás para arrancar?

- Una computadora con internet
- Una cuenta gratuita en [Supabase](https://supabase.com) (la base de datos)
- Una cuenta gratuita en [Vercel](https://vercel.com) (para publicar la app online)
- [Node.js](https://nodejs.org) instalado en tu computadora (para el primer paso)

---

## Paso 1 — Crear la base de datos en Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá una cuenta gratuita
2. Hacé clic en **"New project"** y completá:
   - Nombre: `pilates-studio`
   - Región: South America (la más cercana)
   - Contraseña: una contraseña segura (guardala)
3. Esperá a que se cree el proyecto (~1 minuto)
4. En el menú izquierdo andá a **SQL Editor** → **New Query**
5. Copiá todo el contenido del archivo `supabase/migrations/001_schema.sql` y pegalo ahí
6. Hacé clic en **Run** — te va a crear todas las tablas automáticamente

---

## Paso 2 — Obtener las claves de Supabase

1. En tu proyecto de Supabase andá a **Settings** → **API**
2. Copiá:
   - **Project URL** → algo como `https://abcdefgh.supabase.co`
   - **anon public key** → una clave larga

---

## Paso 3 — Configurar la app

1. En la carpeta del proyecto copiá el archivo de ejemplo:
   ```
   cp .env.example .env
   ```
2. Abrí el archivo `.env` con cualquier editor de texto (Bloc de Notas, etc.)
3. Reemplazá los valores con los que copiaste:
   ```
   VITE_SUPABASE_URL=https://TU_PROJECT_ID.supabase.co
   VITE_SUPABASE_ANON_KEY=TU_ANON_KEY_AQUI
   ```

---

## Paso 4 — Crear el usuario administrador

1. En Supabase andá a **Authentication** → **Users** → **Add user**
2. Ingresá el email y contraseña que vas a usar para entrar a la app
3. ¡Listo! Esas credenciales las usás en el login de la app

---

## Paso 5 — Probar la app localmente (opcional)

Si querés probarla antes de publicarla:

```bash
# En la carpeta del proyecto:
npm install
npm run dev
```

Abrí tu navegador en `http://localhost:5173`

---

## Paso 6 — Publicar en internet (Vercel) — GRATIS

1. Creá una cuenta en [vercel.com](https://vercel.com)
2. Subí la carpeta del proyecto a [GitHub](https://github.com) (también gratuito)
3. En Vercel hacé clic en **"Add New Project"** y conectá tu repo de GitHub
4. En **Environment Variables** agregá las dos claves del paso 2:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Hacé clic en **Deploy**
6. En ~2 minutos vas a tener tu app publicada en una URL como `https://pilates-studio.vercel.app`

---

## Estructura del proyecto

```
pilates-app/
├── src/
│   ├── components/
│   │   ├── Avatar.jsx       # Avatares de alumnos/instructores
│   │   ├── Layout.jsx       # Sidebar + navegación principal
│   │   ├── Modal.jsx        # Modal reutilizable
│   │   └── Toggle.jsx       # Toggle pagado/asistencia
│   ├── pages/
│   │   ├── Login.jsx        # Pantalla de ingreso
│   │   ├── Dashboard.jsx    # Resumen del día
│   │   ├── Turnos.jsx       # Gestión de clases
│   │   ├── Alumnos.jsx      # Gestión de alumnos + historial
│   │   ├── Instructores.jsx # Gestión de instructores
│   │   ├── Pagos.jsx        # Registro de pagos (efectivo/MP/transf.)
│   │   ├── Reportes.jsx     # Gráficos mensuales
│   │   └── Notificaciones.jsx # Config. de WhatsApp
│   ├── lib/
│   │   └── supabase.js      # Conexión a la base de datos
│   ├── App.jsx              # Raíz + autenticación
│   ├── main.jsx             # Entry point
│   └── index.css            # Estilos globales
├── supabase/
│   └── migrations/
│       └── 001_schema.sql   # Estructura de la base de datos
├── .env.example             # Plantilla de variables de entorno
├── index.html
├── package.json
└── vite.config.js
```

---

## Funcionalidades incluidas

- ✅ Login de administrador
- ✅ Dashboard con resumen del día
- ✅ Turnos: crear/editar clases grupales e individuales, navegación semanal
- ✅ Asistencia por clase con toggle presente/ausente
- ✅ Alumnos: alta/baja/modificación, historial de asistencia por alumno
- ✅ Instructores: gestión completa
- ✅ Pagos: efectivo, Mercado Pago y transferencia — toggle pagado/pendiente
- ✅ Reportes: gráficos de asistencia por día e instructor, resumen mensual
- ✅ Notificaciones: configuración de recordatorios WhatsApp (requiere Twilio/Meta API)

---

## Costos estimados

| Servicio | Costo |
|---|---|
| Supabase (hasta 500 MB) | **Gratis** |
| Vercel hosting | **Gratis** |
| WhatsApp (~200 msg/mes) | ~$5–8 USD/mes |
| Mercado Pago | % por transacción |

---

## Próximos pasos sugeridos

1. Conectar WhatsApp (Twilio o Meta API)
2. Agregar notificaciones push en el celular (PWA)
3. Reportes de ingresos por mes
4. Exportar reportes a PDF o Excel
