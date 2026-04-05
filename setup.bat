@echo off
echo === FaceAttend Setup ===

:: Python virtual environment
if not exist "env\" (
    echo [1/4] Creating Python virtual environment...
    python -m venv env
) else (
    echo [1/4] Virtual environment already exists, skipping.
)

::  Activate and install Python deps
echo [2/4] Installing Python dependencies...
call env\Scripts\activate.bat
pip install -r requirements.txt

::  Install Node deps
echo [3/4] Installing Node.js dependencies...
call npm install
call npm install --prefix frontend

::  Create artifacts directory if missing
echo [4/4] Setting up artifacts directory...
if not exist "artifacts\" mkdir artifacts

echo.
echo === Setup complete! ===
echo.
echo To run the project:
echo   env\Scripts\activate     (activate Python venv)
echo   npm start                (starts both API + frontend)
echo.
echo Then open: http://localhost:5174
pause
