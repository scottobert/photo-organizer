# Photo Organizer - GitHub Codespaces Development Environment

This repository includes a pre-configured development container for GitHub Codespaces that provides all the necessary tools and dependencies to work with the Photo Organizer CLI tool.

## What's Included

### System Dependencies
- **ExifTool** - For extracting metadata from photos (JPEG, RAW files like CR2, etc.)
- **SQLite3** - For database operations and photo metadata storage
- **Node.js 20.x** - JavaScript runtime environment
- **Build tools** - GCC, make, python3 for native module compilation

### Development Tools
- **TypeScript** - Primary development language
- **Jest** - Testing framework
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **VS Code Extensions** - Pre-installed extensions for optimal development experience

### VS Code Extensions Included
- TypeScript language support
- ESLint integration
- Jest test runner
- GitHub Pull Request integration
- Code spell checker
- JSON/JSONC support

## Quick Start

### Option 1: Open in GitHub Codespaces
1. Click the "Code" button on the GitHub repository
2. Select "Create codespace on main"
3. Wait for the container to build and set up (this may take a few minutes on first run)
4. The setup script will automatically run to install dependencies and build the project

### Option 2: Clone and Open Locally in VS Code
1. Clone the repository
2. Open in VS Code
3. When prompted, click "Reopen in Container"
4. Wait for the container to build and set up

## After Setup

Once the container is ready, you can immediately start working with the photo organizer:

```bash
# Build the project
npm run build

# Run tests
npm test

# Show CLI help
node dist/index.js --help

# Analyze photos in a directory
node dist/index.js analyze ./example-photos

# Find duplicate photos
node dist/index.js duplicates

# Organize photos by date pattern
node dist/index.js organize "{year}/{month}-{day}"
```

## Project Structure

```
/workspaces/photo-org/
├── .devcontainer/          # Development container configuration
│   ├── devcontainer.json   # Container settings and VS Code configuration
│   ├── Dockerfile          # Custom container image
│   ├── setup.sh           # Post-creation setup script
│   └── README.md          # This file
├── src/                   # TypeScript source code
├── dist/                  # Compiled JavaScript output
├── example-photos/        # Example photos for testing
└── *.db                  # SQLite databases created during analysis
```

## Development Workflow

1. **Edit TypeScript files** in the `src/` directory
2. **Build the project** with `npm run build`
3. **Run tests** with `npm test` to verify changes
4. **Test CLI commands** using `node dist/index.js [command]`
5. **Use Git** for version control (GitHub CLI is pre-installed)

## Included Photo Formats

The tool supports various image formats including:
- JPEG (.jpg, .jpeg)
- RAW formats (.cr2, .nef, .arw, .dng, etc.)
- TIFF (.tiff, .tif)
- PNG (.png)

## Database Operations

The tool creates SQLite databases to store photo metadata:
- Faster subsequent operations
- Advanced querying capabilities
- Duplicate detection based on file hashes
- Organization using database as source

## Troubleshooting

### Container Build Issues
- Ensure you have sufficient disk space
- Check your internet connection for downloading dependencies
- Try rebuilding the container if setup fails

### ExifTool Issues
- ExifTool is pre-installed and verified during setup
- If metadata extraction fails, check file permissions
- Ensure photo files are not corrupted

### Node.js/npm Issues
- Dependencies are automatically installed during container creation
- If modules are missing, run `npm install` manually
- For native module compilation issues, the container includes build tools

## Performance Notes

- The container mounts your example-photos directory for testing
- Database files are created in the workspace and persist between sessions
- Large photo collections may take time to analyze initially
- Subsequent operations are faster due to database caching

## Support

If you encounter issues with the development environment:
1. Check the container logs in VS Code
2. Try rebuilding the container
3. Verify all dependencies are installed by running the setup script manually
4. Check that ExifTool and SQLite3 are working: `exiftool -ver` and `sqlite3 --version`
