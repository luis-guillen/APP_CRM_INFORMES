#!/bin/bash

# start_docker.sh - Script para arrancar Reker Tech Solutions CRM con Docker
# Uso: ./start_docker.sh [--build]

# Colores para la salida
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Iniciando Reker Tech Solutions CRM...${NC}"

# Comprobar si se ha pasado el flag --build
if [[ "$1" == "--build" ]]; then
    echo -e "${GREEN}🔨 Reconstruyendo imagen y arrancando en segundo plano...${NC}"
    docker compose up --build -d
else
    echo -e "${GREEN}📦 Arrancando contenedores en segundo plano...${NC}"
    docker compose up -d
fi

# Esperar unos segundos para dejar que la app cargue
sleep 2

# Mostrar estado
echo -e "\n${BLUE}📊 Estado actual:${NC}"
docker compose ps

echo -e "\n${GREEN}✨ Todo listo!${NC}"
echo -e "🔗 URL local: ${BLUE}http://localhost:5001${NC}"
echo -e "👤 Admin ID:  ${BLUE}admin@reker.es${NC}"
echo -e "🔑 Admin PWD: ${BLUE}AdminReker2026!${NC}"
echo -e "\n${BLUE}💡 Tip: Usa './start_docker.sh --build' si has modificado el código fuente.${NC}"
