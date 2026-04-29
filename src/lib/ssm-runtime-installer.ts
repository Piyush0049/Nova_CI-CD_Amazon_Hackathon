/**
 * SSM Runtime Installer
 * Installs language runtimes on EC2 instances via SSM commands
 *
 * This module is separated from UserData to avoid AWS's 25,600 byte limit.
 * Runtime installation happens after the instance is ready, via SSM Run Command.
 */

import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

/**
 * Generate runtime-specific installation script
 * Installs ONLY the runtime specified by the pipeline
 */
export function generateRuntimeInstallScript(runtime: string): string[] {
  const scripts: Record<string, string> = {
    nodejs: `
        echo "[RUNTIME-INSTALL] 🟢 NODE.JS RUNTIME (detected from pipeline)"
        echo "[RUNTIME-INSTALL] Installing Node.js 20 LTS..."
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>&1 | tail -10 || true
        yum install -y nodejs 2>&1 | tail -5 || true

        if command -v node >/dev/null 2>&1; then
          echo "[RUNTIME-INSTALL] ✅ Node.js $(node -v) installed"
          echo "[RUNTIME-INSTALL] ✅ npm $(npm -v) installed"
          npm install -g yarn pnpm pm2 --force --loglevel=error 2>&1 | tail -5 || true
          echo "[RUNTIME-INSTALL] ✅ Package managers installed"

          # Add Node.js environment to bashrc
          echo 'export NODE_ENV=production' >> /home/ec2-user/.bashrc
          echo 'export PATH="$PATH:/home/ec2-user/app/node_modules/.bin"' >> /home/ec2-user/.bashrc
          echo "[RUNTIME-INSTALL] ✅ Node.js environment configured"
        else
          echo "[RUNTIME-INSTALL] ❌ Node.js installation FAILED"
          exit 1
        fi`,

    python: `
        echo "[RUNTIME-INSTALL] 🐍 PYTHON RUNTIME (detected from pipeline)"
        echo "[RUNTIME-INSTALL] Installing Python 3.11..."
        yum install -y python3.11 python3.11-pip python3.11-devel python3 python3-pip python3-devel 2>&1 | tail -5 || true
        ln -sf /usr/bin/python3.11 /usr/bin/python3 2>/dev/null || true
        ln -sf /usr/bin/pip3.11 /usr/bin/pip3 2>/dev/null || true

        if command -v python3 >/dev/null 2>&1; then
          echo "[RUNTIME-INSTALL] ✅ Python $(python3 --version 2>&1 | awk '{print $2}') installed"
          pip3 install --upgrade pip setuptools wheel --quiet 2>&1 | tail -3 || true
          echo "[RUNTIME-INSTALL] ✅ pip upgraded"

          # Add Python environment to bashrc
          echo 'export PATH="$PATH:/home/ec2-user/.local/bin"' >> /home/ec2-user/.bashrc
          echo 'export PYTHONUNBUFFERED=1' >> /home/ec2-user/.bashrc
          echo 'export PYTHONDONTWRITEBYTECODE=1' >> /home/ec2-user/.bashrc
          echo "[RUNTIME-INSTALL] ✅ Python environment configured"
        else
          echo "[RUNTIME-INSTALL] ❌ Python installation FAILED"
          exit 1
        fi`,

    rust: `
        echo "[RUNTIME-INSTALL] ════════════════════════════════════════════════════════════"
        echo "[RUNTIME-INSTALL] 🦀 RUST RUNTIME INSTALLATION"
        echo "[RUNTIME-INSTALL] ════════════════════════════════════════════════════════════"
        echo "[RUNTIME-INSTALL] This may take 2-3 minutes..."
        echo ""

        # Ensure openssl-devel is installed FIRST (required for Rust compilation)
        echo "[RUNTIME-INSTALL] Step 1/4: Installing Rust dependencies..."
        yum install -y openssl-devel pkg-config 2>&1 | tail -5
        echo "[RUNTIME-INSTALL] ✅ Dependencies installed"
        echo ""

        # Clean up any previous Rust installation attempts
        echo "[RUNTIME-INSTALL] Cleaning up previous installation attempts..."
        rm -rf /home/ec2-user/.cargo /home/ec2-user/.rustup 2>/dev/null || true
        echo "[RUNTIME-INSTALL] Cleanup complete"
        echo ""

        # Create installation script that runs as ec2-user with proper HOME
        echo "[RUNTIME-INSTALL] Step 2/4: Downloading and installing Rust toolchain..."
        cat > /tmp/install-rust.sh << 'RUST_INSTALL_SCRIPT'
#!/bin/bash
export HOME=/home/ec2-user
export USER=ec2-user
cd /home/ec2-user

echo "=== Rust Installation Script ==="
echo "HOME: $HOME"
echo "USER: $USER"
echo "PWD: $(pwd)"
echo ""

# Download rustup installer
echo "Downloading rustup installer..."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/rustup-init.sh --connect-timeout 30 --max-time 60
if [ ! -f "/tmp/rustup-init.sh" ]; then
  echo "ERROR: Failed to download rustup installer"
  exit 1
fi
chmod +x /tmp/rustup-init.sh
echo "✓ Rustup installer downloaded ($(du -h /tmp/rustup-init.sh | cut -f1))"

# Install Rust with minimal profile (faster, only rustc and cargo)
echo ""
echo "Installing Rust stable (minimal profile for faster setup)..."
echo "This may take 2-3 minutes for toolchain download..."
echo "Starting at: $(date)"
echo ""

# Use timeout to prevent hanging (max 3 minutes for installation)
# Set RUSTUP_INIT_SKIP_PATH_CHECK to avoid interactive prompts
export RUSTUP_INIT_SKIP_PATH_CHECK=yes

timeout 180 sh /tmp/rustup-init.sh -y \\
  --default-toolchain stable \\
  --profile minimal \\
  --no-modify-path

INSTALL_EXIT_CODE=$?

echo ""
echo "Finished at: $(date)"
echo "Rustup installer exit code: $INSTALL_EXIT_CODE"

# Exit code 124 means timeout occurred
if [ $INSTALL_EXIT_CODE -eq 124 ]; then
  echo "ERROR: Rustup installation TIMED OUT after 3 minutes"
  echo "This usually indicates:"
  echo "  - Slow network connection to Rust servers"
  echo "  - DNS resolution issues"
  echo "  - Firewall blocking access"
  echo ""
  echo "Checking network connectivity..."
  ping -c 3 static.rust-lang.org 2>&1 || echo "Cannot reach Rust servers"
  echo ""
  echo "Attempting fallback: Installing from yum repositories..."

  # Fallback: Try to install from Amazon Linux Extras or EPEL
  yum install -y rust cargo 2>&1 | tail -10 || echo "Fallback installation failed"

  FALLBACK_CHECK=0
  if command -v rustc >/dev/null 2>&1 && command -v cargo >/dev/null 2>&1; then
    echo "✓ Fallback installation succeeded!"
    rustc --version
    cargo --version
    FALLBACK_CHECK=1
  fi

  if [ $FALLBACK_CHECK -eq 0 ]; then
    echo "ERROR: Both rustup and fallback installation failed"
    exit 1
  fi
elif [ $INSTALL_EXIT_CODE -ne 0 ]; then
  echo "ERROR: Rustup installation failed with code $INSTALL_EXIT_CODE"

  # Show last 20 lines of any error logs
  if [ -f "$HOME/.rustup/tmp/rustup.log" ]; then
    echo "Last 20 lines of rustup log:"
    tail -20 "$HOME/.rustup/tmp/rustup.log" 2>/dev/null || true
  fi

  exit 1
else
  echo "✓ Rustup installation completed successfully"
fi

# Source the cargo environment
echo ""
echo "Sourcing Rust environment..."
if [ -f "$HOME/.cargo/env" ]; then
  source "$HOME/.cargo/env"
  echo "✓ Cargo environment sourced"
  echo ""

  # Verify installation
  echo "Verifying installation:"
  if rustc --version 2>&1; then
    echo "✓ rustc is working"
  else
    echo "ERROR: rustc not working"
    exit 1
  fi

  if cargo --version 2>&1; then
    echo "✓ cargo is working"
  else
    echo "ERROR: cargo not working"
    exit 1
  fi
else
  echo "WARNING: .cargo/env not found"

  # Check if rustc and cargo exist anyway (from fallback installation)
  if command -v rustc >/dev/null 2>&1 && command -v cargo >/dev/null 2>&1; then
    echo "✓ Rust binaries found in PATH (fallback installation)"
    rustc --version
    cargo --version
  else
    echo "ERROR: .cargo/env not found and binaries not in PATH"
    exit 1
  fi
fi

echo ""
echo "=== Rust Installation Complete ==="
exit 0
RUST_INSTALL_SCRIPT

        chmod +x /tmp/install-rust.sh
        chown ec2-user:ec2-user /tmp/install-rust.sh

        # Run installation script as ec2-user with proper environment
        sudo -u ec2-user -H bash /tmp/install-rust.sh 2>&1 | tee /tmp/rust-install.log
        RUST_INSTALL_STATUS=$?

        echo ""
        echo "[RUNTIME-INSTALL] Installation script exit status: $RUST_INSTALL_STATUS"
        echo ""

        if [ $RUST_INSTALL_STATUS -ne 0 ]; then
          echo "[RUNTIME-INSTALL] ❌ Rust installation script failed with status $RUST_INSTALL_STATUS"
          echo "[RUNTIME-INSTALL] Full installation log:"
          cat /tmp/rust-install.log 2>/dev/null || echo "No log file found"
          exit 1
        else
          echo "[RUNTIME-INSTALL] ✅ Rust installation script completed successfully"
        fi

        # Wait for filesystem sync
        sleep 3

        echo ""
        echo "[RUNTIME-INSTALL] Step 3/4: Configuring Rust environment..."

        # Set proper ownership
        chown -R ec2-user:ec2-user /home/ec2-user/.cargo /home/ec2-user/.rustup 2>/dev/null || true

        # Add to .bashrc for SSH sessions
        if ! grep -q "Rust environment" /home/ec2-user/.bashrc 2>/dev/null; then
          cat >> /home/ec2-user/.bashrc << 'RUST_ENV_EOF'
# Rust environment
export PATH="$PATH:/home/ec2-user/.cargo/bin"
export CARGO_HOME="/home/ec2-user/.cargo"
export RUSTUP_HOME="/home/ec2-user/.rustup"
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
RUST_ENV_EOF
        fi

        # Create system-wide script for SSM sessions
        cat > /etc/profile.d/rust-env.sh << 'RUST_PROFILE_EOF'
# Rust environment for all users (especially SSM)
export PATH="/home/ec2-user/.cargo/bin:$PATH"
export CARGO_HOME="/home/ec2-user/.cargo"
export RUSTUP_HOME="/home/ec2-user/.rustup"
RUST_PROFILE_EOF
        chmod +x /etc/profile.d/rust-env.sh

        echo "[RUNTIME-INSTALL] ✅ Environment configured"
        echo ""

        echo "[RUNTIME-INSTALL] Step 4/4: Verifying Rust installation..."

        # Verify binaries exist
        if [ ! -f "/home/ec2-user/.cargo/bin/rustc" ]; then
          echo "[RUNTIME-INSTALL] ❌ rustc binary not found at /home/ec2-user/.cargo/bin/rustc"
          echo "[RUNTIME-INSTALL] Checking if .cargo directory exists:"
          ls -la /home/ec2-user/.cargo/ 2>/dev/null || echo "[RUNTIME-INSTALL] .cargo directory doesn't exist"
          echo "[RUNTIME-INSTALL] Checking if .cargo/bin directory exists:"
          ls -la /home/ec2-user/.cargo/bin/ 2>/dev/null || echo "[RUNTIME-INSTALL] .cargo/bin directory doesn't exist"
          exit 1
        elif [ ! -f "/home/ec2-user/.cargo/bin/cargo" ]; then
          echo "[RUNTIME-INSTALL] ❌ cargo binary not found at /home/ec2-user/.cargo/bin/cargo"
          echo "[RUNTIME-INSTALL] Contents of .cargo/bin:"
          ls -la /home/ec2-user/.cargo/bin/ 2>/dev/null || echo "[RUNTIME-INSTALL] Directory doesn't exist"
          exit 1
        else
          # Both binaries exist - test execution
          RUST_VERSION=$(sudo -u ec2-user bash -c "source /home/ec2-user/.cargo/env && rustc --version 2>&1" || echo "rustc execution failed")
          CARGO_VERSION=$(sudo -u ec2-user bash -c "source /home/ec2-user/.cargo/env && cargo --version 2>&1" || echo "cargo execution failed")

          echo "[RUNTIME-INSTALL] ════════════════════════════════════════════════════════════"
          echo "[RUNTIME-INSTALL] ✅ RUST INSTALLATION SUCCESSFUL"
          echo "[RUNTIME-INSTALL] ════════════════════════════════════════════════════════════"
          echo "[RUNTIME-INSTALL] Rust: $RUST_VERSION"
          echo "[RUNTIME-INSTALL] Cargo: $CARGO_VERSION"
          echo "[RUNTIME-INSTALL] Location: /home/ec2-user/.cargo/bin"
          echo "[RUNTIME-INSTALL] System Profile: /etc/profile.d/rust-env.sh"
          echo "[RUNTIME-INSTALL] ════════════════════════════════════════════════════════════"
        fi

        echo ""`,

    go: `
        echo "[RUNTIME-INSTALL] 🐹 GO RUNTIME (detected from pipeline)"
        echo "[RUNTIME-INSTALL] Installing Go 1.21.5..."
        cd /tmp
        GO_VERSION="1.21.5"
        wget -q https://go.dev/dl/go\${GO_VERSION}.linux-amd64.tar.gz 2>&1 || true

        if [ -f "go\${GO_VERSION}.linux-amd64.tar.gz" ]; then
          rm -rf /usr/local/go
          tar -C /usr/local -xzf go\${GO_VERSION}.linux-amd64.tar.gz 2>&1 || true
          rm go\${GO_VERSION}.linux-amd64.tar.gz

          echo 'export PATH=$PATH:/usr/local/go/bin:/home/ec2-user/go/bin' >> /home/ec2-user/.bashrc
          echo 'export GOPATH=/home/ec2-user/go' >> /home/ec2-user/.bashrc
          echo 'export GOROOT=/usr/local/go' >> /home/ec2-user/.bashrc
          echo 'export GO111MODULE=on' >> /home/ec2-user/.bashrc

          if [ -f "/usr/local/go/bin/go" ]; then
            GO_VER=$(/usr/local/go/bin/go version 2>/dev/null || echo "Go installed")
            echo "[RUNTIME-INSTALL] ✅ $GO_VER"
            sudo -u ec2-user mkdir -p /home/ec2-user/go/{bin,src,pkg} || true
            echo "[RUNTIME-INSTALL] ✅ Go workspace created"
            echo "[RUNTIME-INSTALL] ✅ Go environment configured"
          else
            echo "[RUNTIME-INSTALL] ❌ Go verification FAILED"
            exit 1
          fi
        else
          echo "[RUNTIME-INSTALL] ❌ Go download FAILED"
          exit 1
        fi`,

    java: `
        echo "[RUNTIME-INSTALL] ☕ JAVA RUNTIME (detected from pipeline)"
        echo "[RUNTIME-INSTALL] Installing Java OpenJDK 17..."
        yum install -y java-17-amazon-corretto-devel maven gradle 2>&1 | tail -5 || true

        if command -v java >/dev/null 2>&1; then
          echo "[RUNTIME-INSTALL] ✅ $(java -version 2>&1 | head -1)"
          echo 'export JAVA_HOME=/usr/lib/jvm/java-17-amazon-corretto' >> /home/ec2-user/.bashrc
          echo 'export PATH=$PATH:$JAVA_HOME/bin' >> /home/ec2-user/.bashrc
          echo 'export MAVEN_OPTS="-Xmx2048m"' >> /home/ec2-user/.bashrc
          echo "[RUNTIME-INSTALL] ✅ Java environment configured"
        else
          echo "[RUNTIME-INSTALL] ❌ Java installation FAILED"
          exit 1
        fi`,

    ruby: `
        echo "[RUNTIME-INSTALL] 💎 RUBY RUNTIME (detected from pipeline)"
        echo "[RUNTIME-INSTALL] Installing Ruby..."
        yum install -y ruby ruby-devel rubygems 2>&1 | tail -5 || true

        if command -v ruby >/dev/null 2>&1; then
          echo "[RUNTIME-INSTALL] ✅ $(ruby --version)"
          gem install bundler --no-document 2>&1 | tail -3 || true
          echo "[RUNTIME-INSTALL] ✅ Bundler installed"

          # Add Ruby environment to bashrc
          echo 'export PATH="$PATH:/home/ec2-user/.gem/ruby/bin"' >> /home/ec2-user/.bashrc
          echo 'export GEM_HOME=/home/ec2-user/.gem/ruby' >> /home/ec2-user/.bashrc
          echo 'export GEM_PATH=/home/ec2-user/.gem/ruby' >> /home/ec2-user/.bashrc
          echo "[RUNTIME-INSTALL] ✅ Ruby environment configured"
        else
          echo "[RUNTIME-INSTALL] ❌ Ruby installation FAILED"
          exit 1
        fi`,

    php: `
        echo "[RUNTIME-INSTALL] 🐘 PHP RUNTIME (detected from pipeline)"
        echo "[RUNTIME-INSTALL] Installing PHP..."
        yum install -y php php-cli php-fpm php-json php-mbstring php-xml php-zip 2>&1 | tail -5 || true

        if command -v php >/dev/null 2>&1; then
          echo "[RUNTIME-INSTALL] ✅ $(php --version | head -1)"
          curl -sS https://getcomposer.org/installer | php 2>&1 || true
          mv composer.phar /usr/local/bin/composer 2>/dev/null || true
          chmod +x /usr/local/bin/composer 2>/dev/null || true
          echo "[RUNTIME-INSTALL] ✅ Composer installed"

          # Add PHP environment to bashrc
          echo 'export PATH="$PATH:/home/ec2-user/.composer/vendor/bin"' >> /home/ec2-user/.bashrc
          echo 'export COMPOSER_HOME=/home/ec2-user/.composer' >> /home/ec2-user/.bashrc
          echo "[RUNTIME-INSTALL] ✅ PHP environment configured"
        else
          echo "[RUNTIME-INSTALL] ❌ PHP installation FAILED"
          exit 1
        fi`,

    docker: `
        echo "[RUNTIME-INSTALL] 🐳 DOCKER RUNTIME (detected from pipeline)"
        echo "[RUNTIME-INSTALL] Installing Docker..."
        yum install -y docker 2>&1 | tail -5 || true
        systemctl enable docker 2>&1 || true
        systemctl start docker 2>&1 || true
        usermod -aG docker ec2-user 2>&1 || true

        if command -v docker >/dev/null 2>&1; then
          echo "[RUNTIME-INSTALL] ✅ $(docker --version)"
        else
          echo "[RUNTIME-INSTALL] ❌ Docker installation FAILED"
          exit 1
        fi`,

    unknown: `
        echo "[RUNTIME-INSTALL] ⚠️ UNKNOWN RUNTIME"
        echo "[RUNTIME-INSTALL] Could not determine runtime from pipeline"
        echo "[RUNTIME-INSTALL] Pipeline may use Docker or custom setup"
        echo "[RUNTIME-INSTALL] Proceeding with minimal environment..."`
  };

  const scriptContent = scripts[runtime] || scripts.unknown;

  // Return as array of commands for SSM
  return [scriptContent];
}

/**
 * Install runtime on EC2 instance via SSM
 */
export async function installRuntimeViaSSM(
  instanceId: string,
  runtime: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    console.log('[SSM-RUNTIME-INSTALLER] Installing runtime:', runtime);
    console.log('[SSM-RUNTIME-INSTALLER] Instance:', instanceId);

    const commands = generateRuntimeInstallScript(runtime);

    console.log('[SSM-RUNTIME-INSTALLER] Sending SSM command...');
    const sendCmd = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: { commands },
        TimeoutSeconds: 600, // 10 minutes for runtime installation (Rust can take a while)
      })
    );

    const commandId = sendCmd.Command?.CommandId;
    if (!commandId) {
      throw new Error('Failed to get SSM command ID');
    }

    console.log('[SSM-RUNTIME-INSTALLER] Command sent, ID:', commandId);
    console.log('[SSM-RUNTIME-INSTALLER] Waiting for runtime installation to complete...');

    // Poll for completion (max 10 minutes, check every 5 seconds)
    for (let i = 0; i < 120; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const result = await ssmClient.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        })
      );

      const status = result.Status;

      if (status === 'Success') {
        console.log('[SSM-RUNTIME-INSTALLER] ✅ Runtime installation completed successfully');
        return {
          success: true,
          output: result.StandardOutputContent || '',
        };
      } else if (status === 'Failed') {
        console.error('[SSM-RUNTIME-INSTALLER] ❌ Runtime installation failed');
        return {
          success: false,
          output: result.StandardOutputContent || '',
          error: result.StandardErrorContent || 'Runtime installation failed',
        };
      } else if (status === 'TimedOut') {
        console.error('[SSM-RUNTIME-INSTALLER] ⏱️ Runtime installation timed out');
        return {
          success: false,
          output: result.StandardOutputContent || '',
          error: 'Runtime installation timed out after 10 minutes',
        };
      } else if (status === 'Cancelled') {
        console.error('[SSM-RUNTIME-INSTALLER] ❌ Runtime installation was cancelled');
        return {
          success: false,
          output: result.StandardOutputContent || '',
          error: 'Runtime installation was cancelled',
        };
      }

      // Still in progress
      if (i % 6 === 0) {
        // Log every 30 seconds
        console.log(`[SSM-RUNTIME-INSTALLER] Still installing runtime... (${Math.floor(i * 5 / 60)}m ${(i * 5) % 60}s elapsed)`);
      }
    }

    throw new Error('Runtime installation timed out after 10 minutes');
  } catch (error: any) {
    console.error('[SSM-RUNTIME-INSTALLER] Error:', error);
    return {
      success: false,
      output: '',
      error: error.message || 'Unknown error during runtime installation',
    };
  }
}
