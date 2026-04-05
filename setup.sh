#!/bin/bash
set -e

echo "=== FaceAttend Setup ==="

# 1. Python virtual environment
if [ ! -d "env" ]; then
  echo "[1/4] Creating Python virtual environment..."
  python3 -m venv env
else
  echo "[1/4] Virtual environment already exists, skipping."
fi

# 2. Activate and install Python deps
echo "[2/4] Installing Python dependencies..."
source env/bin/activate
pip install -r requirements.txt

# 3. Install Node deps
echo "[3/4] Installing Node.js dependencies..."
npm install
npm install --prefix frontend

# 4. Create artifacts directory if missing
echo "[4/4] Setting up artifacts directory..."
mkdir -p artifacts

echo ""
echo "=== Setup complete! ==="
echo ""
echo "To run the project:"
echo "  source env/bin/activate   # activate Python venv"
echo "  npm start                 # starts both API + frontend"
echo ""
echo "Then open: http://localhost:5174"
