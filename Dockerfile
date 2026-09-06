# Dockerfile para gabino-gestion-hacienda server (NestJS Backend)

FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Instalar pnpm
RUN npm install -g pnpm

# Instalar dependencias
RUN pnpm install --frozen-lockfile

# Copiar código fuente
COPY . .

# Compilar la aplicación
RUN pnpm run build

# Imagen de producción
FROM node:20-alpine

WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm

# Copiar archivos de dependencias (incluye pnpm-workspace.yaml con allowBuilds)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Instalar solo dependencias de producción
RUN pnpm install --prod --frozen-lockfile

# Copiar código compilado desde el builder (incluye firebase-service-account.json)
COPY --from=builder /app/dist ./dist

# Exponer puerto
EXPOSE 3055

# Comando para iniciar la aplicación
CMD ["node", "dist/src/main.js"]