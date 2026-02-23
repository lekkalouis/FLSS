@echo off
set REPO=C:\Users\flippenlekka\Documents\github\flss
set BRANCH=1.9
set LOG=%REPO%\deploy.log

echo ======================================= >> "%LOG%"
echo [%date% %time%] Deploy triggered >> "%LOG%"

cd /d "%REPO%"

echo Fetch origin... >> "%LOG%"
git fetch origin >> "%LOG%" 2>&1
if errorlevel 1 goto fail

echo Reset to origin/%BRANCH%... >> "%LOG%"
git reset --hard origin/%BRANCH% >> "%LOG%" 2>&1
if errorlevel 1 goto fail

echo Install deps... >> "%LOG%"
if exist package-lock.json (
  call npm ci >> "%LOG%" 2>&1
) else (
  call npm install >> "%LOG%" 2>&1
)
if errorlevel 1 goto fail

echo Restart FLSS... >> "%LOG%"
if exist flss.pid (
  for /f %%p in (flss.pid) do taskkill /PID %%p /F >> "%LOG%" 2>&1
)

start "" cmd /c "cd /d "%REPO%" && node server.js"
echo Deploy OK >> "%LOG%"
exit /b 0

:fail
echo Deploy FAILED >> "%LOG%"
exit /b 1
