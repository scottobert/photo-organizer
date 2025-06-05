# GitHub Codespaces Quick Start Guide

## Opening in GitHub Codespaces

1. **Navigate to the repository** on GitHub
2. **Click the green "Code" button**
3. **Select "Codespaces" tab**
4. **Click "Create codespace on main"**

The environment will automatically set up with:
- ✅ ExifTool for photo metadata extraction
- ✅ SQLite3 for database operations
- ✅ Node.js 20.x with all dependencies
- ✅ TypeScript development environment
- ✅ VS Code extensions for optimal development
- ✅ Pre-configured debugging and tasks

## First Steps After Container Loads

The setup script runs automatically, but you can verify everything is working:

```bash
# Check versions
node --version
npm --version
exiftool -ver
sqlite3 --version

# Build and test the project
npm run build
npm test

# Try the CLI
node dist/index.js --help
```

## Development Workflow

### 1. **Make Changes**
Edit TypeScript files in the `src/` directory

### 2. **Build & Test**
- Press `Ctrl+Shift+P` and type "Tasks: Run Task"
- Select "npm: build" or "npm: test"
- Or use terminal: `npm run build && npm test`

### 3. **Debug**
- Press `F5` to start debugging
- Choose from pre-configured debug configurations:
  - Debug CLI - Analyze
  - Debug CLI - Help
  - Debug CLI - Duplicates
  - Debug CLI - Stats
  - Debug CLI - Organize (Dry Run)

### 4. **Run CLI Commands**
```bash
# Analyze photos
node dist/index.js analyze ./pics/DCIM/100EOS7D

# Find duplicates
node dist/index.js duplicates

# Show statistics
node dist/index.js stats

# Organize photos (dry run first)
node dist/index.js organize "{year}/{month}-{day}" --dry-run
```

## Available VS Code Tasks

Press `Ctrl+Shift+P` → "Tasks: Run Task" to access:

- **npm: build** - Compile TypeScript
- **npm: test** - Run Jest tests
- **npm: dev** - Run with ts-node
- **CLI: Analyze Example Photos** - Quick photo analysis
- **CLI: Show Stats** - Display photo statistics
- **CLI: Find Duplicates** - Find duplicate photos
- **Clean and Rebuild** - Full clean build

## File Structure

```
/workspaces/photo-org/
├── .devcontainer/          # Container configuration
├── .vscode/               # VS Code settings & tasks
├── src/                   # TypeScript source code
├── dist/                  # Compiled JavaScript
├── pics/                  # Sample photo collection
├── example-photos/        # Test photos
└── *.db                  # SQLite databases
```

## Working with Photos

### Upload Test Photos
1. Use the VS Code file explorer to upload photos
2. Place them in `example-photos/` directory
3. Run analysis: `node dist/index.js analyze example-photos`

### Large Photo Collections
The container includes a sample collection at `pics/DCIM/100EOS7D/` with Canon RAW files for testing.

## Database Management

```bash
# View database contents
sqlite3 photos.db ".tables"
sqlite3 photos.db "SELECT COUNT(*) FROM photos;"

# Reset database
rm photos.db
node dist/index.js analyze pics/DCIM/100EOS7D
```

## Troubleshooting

### Container Won't Start
- Wait a few minutes for initial setup
- Check GitHub Codespaces quota/limits
- Try recreating the codespace

### Build Errors
```bash
# Clean and rebuild
npm run clean
npm install
npm run build
```

### ExifTool Issues
```bash
# Verify ExifTool works
exiftool -ver
exiftool pics/DCIM/100EOS7D/IMG_8538.CR2
```

### Permission Issues
```bash
# Fix ownership
sudo chown -R node:node /workspaces/photo-org
```

## Tips for Efficient Development

1. **Use VS Code Command Palette** (`Ctrl+Shift+P`) for quick access to tasks
2. **Enable Auto-Save** - Files save automatically as you type
3. **Use Debug Console** - Set breakpoints and inspect variables
4. **Git Integration** - Built-in Git commands and GitHub PR extension
5. **Terminal** - Use integrated terminal for CLI commands

## Performance Notes

- Initial setup takes 2-3 minutes
- Photo analysis is CPU-intensive but cached in database
- Large collections (1000+ photos) work best with database operations
- SQLite databases persist between container sessions

## Getting Help

- **CLI Help**: `node dist/index.js --help`
- **Command Help**: `node dist/index.js [command] --help`
- **VS Code Help**: Press `F1` for command palette
- **Debug**: Set breakpoints and use `F5` to start debugging

Enjoy developing with the Photo Organizer CLI! 📸✨
