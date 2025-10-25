#!/bin/bash
set -e

echo "🚀 Setting up workspace for caseyagollan.com..."

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Error: Bun is not installed. Please install Bun first."
    echo "   Visit: https://bun.sh"
    exit 1
fi

echo "✅ Bun $(bun --version) found"

# Install dependencies
echo "📦 Installing dependencies..."
bun install

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
echo "   Run 'bun run dev' to start the development server"
