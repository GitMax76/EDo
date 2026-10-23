@echo off
setlocal
cd /d "%~dp0"
title E.Do.-Fa - Editor Documenti Facile
set "EDOFA_PYTHON="
python -c "import sys; assert sys.version_info >= (3,10)" >nul 2>&1
if not errorlevel 1 set "EDOFA_PYTHON=python"
if defined EDOFA_PYTHON goto avvia
if exist C:\Python312\python.exe (
  C:\Python312\python.exe -c "import sys; assert sys.version_info >= (3,10)" >nul 2>&1
  if not errorlevel 1 set "EDOFA_PYTHON=C:\Python312\python.exe"
)
if defined EDOFA_PYTHON goto avvia
py -3 -c "import sys; assert sys.version_info >= (3,10)" >nul 2>&1
if not errorlevel 1 set "EDOFA_PYTHON=py -3"
if not defined EDOFA_PYTHON goto manca
:avvia
%EDOFA_PYTHON% avvia_edofa.py
if errorlevel 1 goto errore
exit /b
:manca
echo Serve Python 3.10 o successivo per avviare l'app sul PC.
echo Non occorre installare librerie aggiuntive.
goto fine
:errore
echo Non e' stato possibile avviare l'app. Leggi il dettaglio qui sopra.
echo Estrai tutti i file dello ZIP in una cartella prima di avviare.
:fine
pause
