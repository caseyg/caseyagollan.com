#!/bin/bash
set -e

echo "🚀 Setting up workspace for caseyagollan.com..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js $(node --version) found"
echo "✅ npm $(npm --version) found"

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install

# Initialize and update git submodule
echo "📚 Initializing content submodule..."
git submodule init
git submodule update --remote --merge

# Check for .env file in root repo and copy if it exists
if [ -n "$CONDUCTOR_ROOT_PATH" ] && [ -f "$CONDUCTOR_ROOT_PATH/.env" ]; then
    echo "🔑 Copying .env file from root repo..."
    cp "$CONDUCTOR_ROOT_PATH/.env" .env
    echo "✅ Environment variables copied"
else
    echo "ℹ️  No .env file found in root repo. WEBMENTION_IO_TOKEN will be unavailable."
    echo "   (This is optional - the site will still build without it)"
fi

echo ""
echo "✨ Workspace setup complete!"
echo "   Run 'npm run dev' to start the development server"
