#!/bin/bash

# ============================================
# MONSFAMS Deployment Script
# ============================================

echo "============================================"
echo "   MONSFAMS Deployment Script"
echo "============================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed!${NC}"
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo -e "${GREEN}Node.js version:${NC}"
node --version

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm is not installed!${NC}"
    exit 1
fi

echo -e "${GREEN}npm version:${NC}"
npm --version

# Install dependencies
echo ""
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install

# Ask for admin password
echo ""
echo -e "${YELLOW}Enter admin password (default: MONSFAMS):${NC}"
read -p "> " ADMIN_PASSWORD
ADMIN_PASSWORD=${ADMIN_PASSWORD:-MONSFAMS}

# Ask for port
echo ""
echo -e "${YELLOW}Enter port number (default: 3000):${NC}"
read -p "> " PORT
PORT=${PORT:-3000}

# Ask for max file size
echo ""
echo -e "${YELLOW}Enter max file size in MB (default: 500):${NC}"
read -p "> " MAX_SIZE_MB
MAX_SIZE_MB=${MAX_SIZE_MB:-500}
MAX_SIZE_BYTES=$((MAX_SIZE_MB * 1024 * 1024))

# Create .env file
echo ""
echo -e "${YELLOW}Creating .env file...${NC}"
cat > .env << EOF
PORT=$PORT
ADMIN_PASSWORD=$ADMIN_PASSWORD
MAX_FILE_SIZE=$MAX_SIZE_BYTES
NODE_ENV=production
EOF

echo -e "${GREEN}.env file created!${NC}"

# Install PM2
echo ""
echo -e "${YELLOW}Installing PM2...${NC}"
npm install -g pm2

# Start server with PM2
echo ""
echo -e "${YELLOW}Starting server with PM2...${NC}"
pm2 delete monsfams 2>/dev/null
pm2 start server.js --name monsfams

# Setup PM2 startup
echo ""
echo -e "${YELLOW}Setting up PM2 startup...${NC}"
pm2 startup
pm2 save

# Display success message
echo ""
echo "============================================"
echo -e "${GREEN}   MONSFAMS Deployed Successfully!${NC}"
echo "============================================"
echo ""
echo -e "Admin Password: ${YELLOW}$ADMIN_PASSWORD${NC}"
echo -e "Port: ${YELLOW}$PORT${NC}"
echo -e "Max File Size: ${YELLOW}${MAX_SIZE_MB}MB${NC}"
echo ""
echo "Useful Commands:"
echo "  pm2 status          - Check server status"
echo "  pm2 logs monsfams   - View logs"
echo "  pm2 restart monsfams - Restart server"
echo "  pm2 stop monsfams   - Stop server"
echo ""
