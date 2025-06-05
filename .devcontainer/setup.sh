#!/bin/bash

# Photo Organizer Development Container Setup Script
# This script sets up the development environment for the photo organizer CLI tool

set -e

# Make this script executable
chmod +x /workspaces/photo-org/.devcontainer/setup.sh

echo "🚀 Setting up Photo Organizer development environment..."

# Verify Node.js and npm versions
echo "📋 Checking Node.js and npm versions..."
node --version
npm --version

# Verify ExifTool installation
echo "📸 Verifying ExifTool installation..."
exiftool -ver

# Verify SQLite3 installation
echo "🗄️ Verifying SQLite3 installation..."
sqlite3 --version

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install

# Build the project
echo "🔨 Building the project..."
npm run build

# Run tests to verify everything is working
echo "🧪 Running tests to verify setup..."
npm test

# Create example directory structure
echo "📁 Setting up example directories..."
mkdir -p /workspaces/photo-org/example-photos
mkdir -p /workspaces/photo-org/test-output

# Set proper permissions
echo "🔐 Setting proper permissions..."
chown -R node:node /workspaces/photo-org

# Display helpful information
echo ""
echo "✅ Setup complete! Your photo organizer development environment is ready."
echo ""
echo "📋 Available commands:"
echo "  npm run build    - Build the TypeScript project"
echo "  npm run dev      - Run in development mode with ts-node"
echo "  npm test         - Run the test suite"
echo "  npm start        - Run the compiled JavaScript"
echo ""
echo "🔧 CLI commands (after building):"
echo "  node dist/index.js --help               - Show help"
echo "  node dist/index.js analyze <directory>  - Analyze photos"
echo "  node dist/index.js duplicates           - Find duplicates"
echo "  node dist/index.js organize <pattern>   - Organize photos"
echo "  node dist/index.js stats                - Show statistics"
echo ""
echo "📸 ExifTool version: $(exiftool -ver)"
echo "🗄️ SQLite3 version: $(sqlite3 --version)"
echo "📦 Node.js version: $(node --version)"
echo ""
echo "Happy coding! 🎉"
