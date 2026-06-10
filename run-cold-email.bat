@echo off
cd /d C:\Users\adamr\Code\primelocalgrowth-website
node --env-file=.env.local scripts/cold-email-prospecting.js
pause
