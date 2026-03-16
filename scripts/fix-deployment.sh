#!/bin/bash
# Auto-fix script for failed deployment
# Run this on the EC2 instance to fix common deployment errors

INSTANCE_ID=$(ec2-metadata --instance-id | cut -d " " -f 2)
APP_DIR="/home/ec2-user/app"

cd $APP_DIR

echo "=== Nova AI Auto-Fix ===="
echo "Instance: $INSTANCE_ID"
echo "Working directory: $(pwd)"
echo ""

# Check what failed
if grep -q "ESLint must be installed" /var/log/user-data.log; then
  echo "[FIX] Installing ESLint..."
  npm install --save-dev eslint eslint-config-next
  echo "✓ ESLint installed"
  echo ""

  echo "[RETRY] Running lint..."
  npm run lint
  echo ""
fi

# Check for missing TypeScript
if grep -q "typescript.*not found\|tsc.*command not found" /var/log/user-data.log; then
  echo "[FIX] Installing TypeScript..."
  npm install --save-dev typescript @types/node @types/react @types/react-dom
  echo "✓ TypeScript installed"
  echo ""
fi

# Check for general missing modules
if grep -q "Cannot find module" /var/log/user-data.log; then
  echo "[FIX] Reinstalling dependencies..."
  npm install
  echo "✓ Dependencies installed"
  echo ""
fi

# Now continue with remaining stages
echo "=== Continuing Deployment ==="
echo ""

# Run build if not completed
if ! grep -q "\[STAGE.*BUILD.*completed" /var/log/user-data.log; then
  echo "[STAGE] Building application..."
  if [ -f "package.json" ] && grep -q '"build":' package.json; then
    npm run build
    echo "✓ Build completed"
  fi
  echo ""
fi

# Start the application service
echo "[STAGE] Starting application service..."
sudo systemctl restart pipeline-app.service

# Wait and check status
sleep 5
if sudo systemctl is-active --quiet pipeline-app.service; then
  echo "✓ Application service is running"
  echo ""
  echo "=== Deployment Fixed Successfully! ==="
  echo "Application is now running"
else
  echo "✗ Application service failed to start"
  echo "Check logs: sudo journalctl -u pipeline-app.service -n 50"
  exit 1
fi
