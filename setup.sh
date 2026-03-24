#!/bin/bash
# Pixazo Setup Script

set -e

echo "=================================="
echo "  Pixazo Setup"
echo "=================================="

# Check if Pixazo exists
PIXAZO_PATH="${PIXAZO_PATH:-../Pixazo}"

if [ ! -d "$PIXAZO_PATH" ]; then
    echo "Error: Pixazo not found at $PIXAZO_PATH"
    echo ""
    echo "Please clone Pixazo first:"
    echo "  cd .."
    echo "  git clone https://github.com/ace-step/ACE-Step-1.5"
    echo "  cd Pixazo"
    echo "  uv venv && uv pip install -e ."
    echo "  cd ../pixazo-music"
    echo "  ./setup.sh"
    exit 1
fi

if [ ! -d "$PIXAZO_PATH/.venv" ]; then
    echo "Error: Pixazo venv not found. Please set up Pixazo first:"
    echo "  cd $PIXAZO_PATH"
    echo "  uv venv && uv pip install -e ."
    exit 1
fi

echo "Found Pixazo at: $PIXAZO_PATH"

# Get absolute path
PIXAZO_PATH=$(cd "$PIXAZO_PATH" && pwd)

# Create .env file
echo "Creating .env file..."
cat > .env << EOF
# Pixazo Configuration

# Path to Pixazo installation
PIXAZO_PATH=$PIXAZO_PATH

# Server ports
PORT=3001
FRONTEND_PORT=3000

# Database
DATABASE_PATH=./server/data/pixazo.db
EOF

# Install frontend dependencies
echo ""
echo "Installing frontend dependencies..."
npm install

# Install server dependencies
echo ""
echo "Installing server dependencies..."
cd server
npm install
cd ..

# Initialize database
echo ""
echo "Initializing database..."
cd server
npm run migrate 2>/dev/null || echo "Migration script not found, skipping..."
cd ..

echo ""
echo "=================================="
echo "  Setup Complete!"
echo "=================================="
echo ""
echo "To start the application:"
echo ""
echo "  # Terminal 1 - Start backend"
echo "  cd server && npm run dev"
echo ""
echo "  # Terminal 2 - Start frontend"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:3000"
echo ""
