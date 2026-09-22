$ErrorActionPreference = 'Stop'
Write-Host 'PayrollPro setup' -ForegroundColor Cyan

$node = node --version
$npm = npm --version
Write-Host "Node: $node"
Write-Host "npm : $npm"

if (-not (Test-Path 'backend/.env')) { Copy-Item 'backend/.env.example' 'backend/.env'; Write-Host 'Created backend/.env — edit DATABASE_URL and JWT_SECRET.' -ForegroundColor Yellow }
if (-not (Test-Path 'frontend/.env')) { Copy-Item 'frontend/.env.example' 'frontend/.env' }

Push-Location backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed
npm test
Pop-Location

Push-Location frontend
npm install
npm run build
Pop-Location

Write-Host ''
Write-Host 'Setup completed.' -ForegroundColor Green
Write-Host 'Start backend:  cd backend; npm run dev'
Write-Host 'Start frontend: cd frontend; npm run dev'
