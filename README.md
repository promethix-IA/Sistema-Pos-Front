# Promethixia POS — frontend

Aplicación web del punto de venta **Promethixia**. Aquí se vende, se controla inventario, se cierra caja y se gestiona el equipo del negocio.

No es la landing comercial. El sitio de marketing está en `Landing-Page`. Esta app habla con `Sistema-Pos-Back` por JWT; no usa Supabase Auth.

## Qué hace

- Login con correo y contraseña contra `POST /users/login`.
- Dashboard con ventas del día, semana y año.
- Productos por unidad o granel, categorías e importación CSV.
- Inventario, ajustes, movimientos y kardex.
- Clientes y proveedores (con órdenes de compra).
- Punto de venta: tickets abiertos, códigos de barras, efectivo/tarjeta/transferencia/crédito/mixto.
- Cierre de caja (abrir/cerrar turno y resumen).
- Ventas a crédito y abonos.
- Integraciones: periféricos, impresora y DIAN.
- Usuarios: el admin de plataforma crea negocios; el padre asigna roles a su equipo.

La interfaz es Tailwind v4 (liquid-glass, sidebar navy, tipografías Sora y Manrope). No usa Bootstrap.

## Stack

- React 19
- Vite 8
- TypeScript
- Tailwind CSS v4 (`@tailwindcss/vite`)
- Recharts (dashboard)

```text
src/
  main.tsx
  index.css          # tema, glass, aurora, sidebar
  App.tsx            # shell, módulos y componentes compartidos
  components/
    LoginScreen.tsx
    CierreCaja.tsx
    Creditos.tsx
  lib/
    api.ts           # fetch + Bearer + 401
    auth.ts          # sesión, roles y módulos
    config.ts        # VITE_API_URL
```

## Roles y menú

| Rol | Módulos |
| --- | --- |
| `admin` | Usuarios / Negocios |
| `owner` | todos |
| `administrador` | todos |
| `cajero` | dashboard, ventas, caja, créditos, clientes |
| `inventario` | dashboard, productos, inventario, proveedores |

## Arranque

```bash
npm install
npm run dev
```

Abre [http://localhost:8443](http://localhost:8443). Vite publica en el puerto `8443` (`strictPort`).

Variables opcionales (archivo `.env` en la raíz, no se sube):

```bash
VITE_API_URL=https://sistema-pos-back.onrender.com
VITE_LANDING_URL=https://promethixia.com
```

Si no defines `VITE_API_URL`, el front usa el API de Render. En local, el proxy de Vite (`/api` → `http://127.0.0.1:8000`) sirve cuando apuntas el front a esa base.

```bash
npm run build
npm run preview
```

## Despliegue

- Host: Netlify (`netlify.toml` + `public/_headers`).
- Dominio: [https://pos.promethixia.com](https://pos.promethixia.com).
- CSP y cabeceras: no indexar el POS, conectar solo al API (`sistema-pos-back.onrender.com`).
- El botón **Iniciar sesión** de la landing apunta a este dominio.
