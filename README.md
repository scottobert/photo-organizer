# Photo Organizer

A comprehensive TypeScript/Node.js system for analyzing and organizing photo files based on metadata. Supports 45+ file formats including all major RAW formats, with full EXIF data extraction, flexible organization patterns, and complete configuration management.

## Features

- 📸 **Extensive Format Support**: Analyzes 45+ formats including CR2, CR3, NEF, ARW, DNG, HEIC, JPG, and more
- 🔍 **Comprehensive Metadata Extraction**: Extracts all EXIF data, file properties, GPS information
- 🗄️ **SQLite Database**: Builds a searchable database of all metadata with optimized indexing
- 📁 **Flexible Organization**: Organizes files into custom folder structures using metadata patterns
- ⚙️ **Complete Configuration Management**: Runtime configuration with CLI management and persistent settings
- 🔧 **Smart Duplicate Handling**: Skip, overwrite, or auto-rename duplicate files based on configuration
- 🔎 **Advanced Search**: Query photos by camera, date, technical settings, GPS data
- 📊 **Statistics**: View collection statistics and insights
- 🚀 **Powerful CLI Interface**: Easy-to-use command-line interface with configuration management
- 🧪 **Dry Run Mode**: Preview organization before making changes
- 🎯 **Batch Processing**: Efficient processing with configurable batch sizes and concurrency
- 📏 **Filename Length Limits**: Configurable maximum filename lengths for filesystem compatibility
- 🔄 **Live Configuration**: Change settings without restarting the application

## Installation

### Option 1: GitHub Codespaces (Recommended)

Open this project in GitHub Codespaces for instant development environment:

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new?hide_repo_select=true&ref=main)

- ✅ **Zero Setup**: All dependencies pre-installed (ExifTool, SQLite3, Node.js 20)
- ✅ **VS Code Ready**: Pre-configured with extensions and debugging
- ✅ **Sample Data**: Includes 1,360+ Canon RAW files for testing
- ✅ **All Tools**: Complete TypeScript development environment

See [`.devcontainer/QUICK_START.md`](.devcontainer/QUICK_START.md) for detailed usage instructions.

### Option 2: Local Installation

```bash
git clone <repository-url>
cd photo-organizer
npm install
npm run build
```

**Prerequisites:**
- Node.js 14+ 
- ExifTool (`apt install exiftool` or `brew install exiftool`)
- SQLite3 (`apt install sqlite3` or `brew install sqlite3`)

## Quick Start

### 1. Analyze photos in a directory
```bash
npm run dev -- analyze /path/to/photos
```

### 2. Configure the system (optional)
```bash
# View current configuration
npm run dev -- config --show

# Set duplicate handling strategy
npm run dev -- config --set "organization.handleDuplicates=rename"

# Set default organization pattern
npm run dev -- config --set "organization.defaultPattern={Camera}/{Year}/{YYYY-MM-DD}/{filename}{extension}"

# Reset to defaults
npm run dev -- config --reset
```

### 3. Organize photos using configuration defaults
```bash
npm run dev -- organize /path/to/photos /path/to/output
```

### 4. Organize with custom pattern
```bash
npm run dev -- organize /path/to/photos /path/to/output --pattern "{Year}/{YYYY-MM-DD}/{filename}{extension}"
```

### 5. Preview organization (dry run)
```bash
npm run dev -- organize /path/to/photos /path/to/output --dry-run
```

## Configuration Management

The Photo Organizer features a comprehensive configuration system that allows you to customize all aspects of its behavior without modifying code.

### Configuration File Structure

The system uses a `config.json` file with the following structure:

```json
{
  "database": {
    "path": "./photo-metadata.db",
    "backupOnStart": false
  },
  "extraction": {
    "batchSize": 100,
    "maxConcurrent": 4,
    "skipHidden": true,
    "supportedExtensions": [45+ file formats],
    "extractThumbnails": false
  },
  "organization": {
    "defaultPattern": "{Year}/{YYYY-MM-DD}/{filename}{extension}",
    "createYearFolders": true,
    "preserveOriginalStructure": false,
    "handleDuplicates": "skip",
    "maxFilenameLength": 255
  },
  "logging": {
    "level": "info",
    "file": "./photo-organizer.log",
    "console": true
  },
  "performance": {
    "enableCaching": true,
    "cacheSize": 1000,
    "memoryLimit": "512MB"
  }
}
```

### Configuration Categories

#### Database Settings
- **path**: Location of the SQLite database file
- **backupOnStart**: Whether to backup the database before operations

#### Extraction Settings
- **batchSize**: Number of files to process in each batch
- **maxConcurrent**: Maximum concurrent metadata extractions
- **skipHidden**: Whether to skip hidden files and folders
- **supportedExtensions**: Array of supported file extensions
- **extractThumbnails**: Whether to extract thumbnail images

#### Organization Settings
- **defaultPattern**: Default folder organization pattern
- **createYearFolders**: Whether to create year-based folder structures
- **preserveOriginalStructure**: Keep original directory structure
- **handleDuplicates**: How to handle duplicate files ("skip", "overwrite", "rename")
- **maxFilenameLength**: Maximum filename length for filesystem compatibility

#### Logging Settings
- **level**: Log level ("debug", "info", "warn", "error")
- **file**: Log file location
- **console**: Whether to display logs in console

#### Performance Settings
- **enableCaching**: Enable metadata caching
- **cacheSize**: Maximum number of cached metadata entries
- **memoryLimit**: Memory usage limit for processing

## CLI Commands

### `config`
Manage system configuration settings.

**Options:**
- `--show` - Display current configuration
- `--set <key=value>` - Set a configuration value using dot notation
- `--reset` - Reset configuration to defaults
- `-c, --config <path>` - Use custom configuration file

**Examples:**
```bash
# View current configuration
npm run dev -- config --show

# Set duplicate handling strategy
npm run dev -- config --set "organization.handleDuplicates=rename"

# Set default pattern
npm run dev -- config --set "organization.defaultPattern={Camera}/{Year}/{filename}{extension}"

# Set batch processing size
npm run dev -- config --set "extraction.batchSize=50"

# Reset to factory defaults
npm run dev -- config --reset

# Use custom config file
npm run dev -- config --show -c ./my-config.json
```

### `analyze <directory>`
Scan a directory for photos and extract metadata to the database.

**Options:**
- `-d, --database <path>` - Database file path (default: from config)
- `-r, --recursive` - Scan directories recursively (default: true)
- `-c, --config <path>` - Use custom configuration file

**Example:**
```bash
npm run dev -- analyze ./my-photos --database ./my-photos.db
```

### `organize <source> <output>`
Organize photos based on metadata patterns with intelligent duplicate handling.

**Options:**
- `-p, --pattern <pattern>` - Organization pattern (default: from config)
- `-d, --database <path>` - Database file path (default: from config)
- `-c, --copy` - Copy files instead of moving them
- `-o, --overwrite` - Override config duplicate handling with overwrite
- `--dry-run` - Preview organization without moving files
- `--config <path>` - Use custom configuration file

**Examples:**
```bash
# Organize using config defaults
npm run dev -- organize ./photos ./organized

# Organize with custom pattern
npm run dev -- organize ./photos ./organized --pattern "{Camera}/{Year}/{Month}/{filename}{extension}"

# Copy files instead of moving (preserves originals)
npm run dev -- organize ./photos ./organized --copy

# Preview what would happen without making changes
npm run dev -- organize ./photos ./organized --dry-run
```

**Duplicate Handling Behavior:**
- **skip** (default): Skip files that would create duplicates
- **overwrite**: Replace existing files with new ones
- **rename**: Automatically rename duplicates (e.g., `photo_1.jpg`, `photo_2.jpg`)

### `search`
Search photos by metadata criteria.

**Options:**
- `-d, --database <path>` - Database file path (default: from config)
- `-c, --camera <camera>` - Filter by camera
- `-f, --from <date>` - Filter from date (YYYY-MM-DD)
- `-t, --to <date>` - Filter to date (YYYY-MM-DD)
- `-e, --extension <ext>` - Filter by file extension
- `--has-gps` - Filter photos with GPS data
- `--min-mp <megapixels>` - Minimum megapixels
- `--max-mp <megapixels>` - Maximum megapixels
- `--config <path>` - Use custom configuration file

**Examples:**
```bash
# Find all Canon photos
npm run dev -- search --camera "Canon"

# Photos from 2023
npm run dev -- search --from "2023-01-01" --to "2023-12-31"

# High resolution photos with GPS
npm run dev -- search --min-mp 20 --has-gps
```

### `stats`
Show statistics about your photo collection.

**Options:**
- `-d, --database <path>` - Database file path (default: from config)
- `--config <path>` - Use custom configuration file

```bash
npm run dev -- stats
```

### `patterns`
Show available organization patterns and placeholders.

```bash
npm run dev -- patterns
```

## Organization Patterns

### Smart Organization Features

- **Configuration-Driven**: Default patterns are set in config and can be changed at runtime
- **Intelligent Duplicate Handling**: Configurable strategies for handling file conflicts
- **Filename Length Management**: Automatic truncation to respect filesystem limits
- **Year Folder Creation**: Optional automatic year-based folder structures
- **Original Structure Preservation**: Option to maintain source directory organization

### Pre-defined Patterns

| Pattern | Example Output | Description |
|---------|---------------|-------------|
| `{Year}/{YYYY-MM-DD}/{filename}{extension}` | `2023/2023-06-15/IMG_1234.CR2` | Year, then date (default) |
| `{Camera}/{Year}/{filename}{extension}` | `Canon EOS R5/2023/IMG_1234.CR2` | Camera, then year |
| `{Make}/{Model}/{Year}/{filename}{extension}` | `Canon/EOS R5/2023/IMG_1234.CR2` | Make, model, year |
| `{Year}/{Month}/{filename}{extension}` | `2023/06/IMG_1234.CR2` | Year and month |
| `{YYYY-MM-DD}/{filename}{extension}` | `2023-06-15/IMG_1234.CR2` | Date only |
| `{ISO}-{FocalLength}mm/{Year}/{filename}{extension}` | `800-85mm/2023/IMG_1234.CR2` | Technical settings grouping |

### Pattern Configuration Examples

```bash
# Set a new default pattern
npm run dev -- config --set "organization.defaultPattern={Camera}/{Year}/{Month}/{filename}{extension}"

# Configure duplicate handling
npm run dev -- config --set "organization.handleDuplicates=rename"

# Set maximum filename length
npm run dev -- config --set "organization.maxFilenameLength=200"

# Enable year folder creation
npm run dev -- config --set "organization.createYearFolders=true"
```

### Available Placeholders

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{Year}`, `{YYYY}` | Four-digit year | `2023` |
| `{Month}`, `{MM}` | Two-digit month | `06` |
| `{Day}`, `{DD}` | Two-digit day | `15` |
| `{YYYY-MM-DD}` | Full date format | `2023-06-15` |
| `{Camera}` | Camera make and model | `Canon EOS R5` |
| `{Make}` | Camera make | `Canon` |
| `{Model}` | Camera model | `EOS R5` |
| `{filename}` | Original filename | `IMG_1234` |
| `{extension}` | File extension | `.jpg` |
| `{ISO}` | ISO setting | `800` |
| `{FocalLength}` | Focal length | `85` |
| `{Aperture}` | Aperture value | `f2.8` |
| `{Artist}` | Photographer name | `John Doe` |
| `{Rating}` | Photo rating (0-5) | `5` |

## Metadata Extracted

The system extracts comprehensive metadata including:

### File Properties
- Filename, filepath, file size
- Date modified, file extension

### EXIF Data
- Date/time original, camera make/model
- Lens information, focal length
- Aperture, shutter speed, ISO
- Flash, white balance, exposure mode
- Metering mode

### Image Properties
- Image dimensions, orientation
- Color space, aspect ratio, megapixels

### GPS Data
- Latitude, longitude, altitude
- Direction information

### Additional Metadata
- Software used, artist/photographer
- Copyright information, keywords
- Photo rating

## API Usage

You can also use the components programmatically with full configuration support:

```typescript
import { MetadataExtractor, DatabaseManager, FileOrganizer, ConfigManager } from './src';

async function organizePhotos() {
  // Initialize configuration (optional - uses config.json by default)
  const configManager = ConfigManager.getInstance('./my-config.json');
  
  // Components automatically use configuration settings
  const extractor = new MetadataExtractor();
  const dbManager = new DatabaseManager(); // Uses config database path
  const organizer = new FileOrganizer();

  // Initialize database
  await dbManager.initialize();

  // Extract metadata (uses config batch size and supported extensions)
  const files = await extractor.getPhotoFiles('./my-photos');
  const { metadata } = await extractor.extractBatchMetadata(files);

  // Save to database
  await dbManager.upsertPhotos(metadata);

  // Organize files (uses config default pattern and duplicate handling)
  await organizer.organizeFiles(metadata, undefined, './organized');

  // Or override with custom settings
  await organizer.organizeFiles(
    metadata,
    '{Camera}/{Year}/{YYYY-MM-DD}/{filename}{extension}',
    './organized'
  );

  // Cleanup
  await extractor.cleanup();
  await dbManager.close();
}

// Configuration management
async function manageConfiguration() {
  const configManager = ConfigManager.getInstance();
  
  // Get current config
  const config = configManager.getConfig();
  
  // Update specific values
  configManager.setConfigValue('organization.handleDuplicates', 'rename');
  configManager.setConfigValue('extraction.batchSize', 50);
  
  // Save changes
  await configManager.saveConfig();
  
  // Reset to defaults
  configManager.resetConfig();
  await configManager.saveConfig();
}
```

### Configuration-Driven Components

All components respect configuration settings:

- **MetadataExtractor**: Uses extraction config for batch sizes, supported formats, and hidden file handling
- **DatabaseManager**: Uses database config for paths and backup settings
- **FileOrganizer**: Uses organization config for patterns, duplicate handling, and filename limits
- **CLI Commands**: All commands respect configuration defaults while allowing overrides

## Development

### Build the project
```bash
npm run build
```

### Run tests
```bash
npm test
```

### Run example demonstration
```bash
npm run example
```

### Clean build artifacts
```bash
npm run clean
```

## Requirements

- **Node.js 14.x or later** - JavaScript runtime
- **ExifTool** - Automatically installed via exiftool-vendored package
- **TypeScript 5.x** - For development and building
- **SQLite3** - Database engine (included with Node.js)

### System Requirements

- **Memory**: 512MB+ RAM (configurable memory limits)
- **Storage**: Space for database and organized photos
- **OS**: Windows, macOS, or Linux
- **Permissions**: Read access to source photos, write access to destination

### Installation Dependencies

All required dependencies are automatically installed via npm:

```bash
npm install  # Installs all dependencies including ExifTool
```

## Advanced Usage Examples

### Workflow for Large Photography Collections

```bash
# 1. Configure for optimal performance
npm run dev -- config --set "extraction.batchSize=300"
npm run dev -- config --set "extraction.maxConcurrent=6"
npm run dev -- config --set "database.backupOnStart=true"

# 2. Analyze the collection
npm run dev -- analyze /path/to/photos

# 3. Review statistics
npm run dev -- stats

# 4. Preview organization
npm run dev -- organize /path/to/photos /path/to/organized --dry-run

# 5. Organize with safety (copy mode)
npm run dev -- organize /path/to/photos /path/to/organized --copy
```

### Professional Photography Workflow

```bash
# Set up for professional workflow
npm run dev -- config --set "organization.defaultPattern={Make}/{Model}/{Year}/{YYYY-MM-DD}/{filename}{extension}"
npm run dev -- config --set "organization.handleDuplicates=rename"
npm run dev -- config --set "extraction.extractThumbnails=true"

# Organize RAW and processed files separately
npm run dev -- search --extension ".cr2" | npm run dev -- organize --pattern "{Camera}/RAW/{Year}/{filename}{extension}"
npm run dev -- search --extension ".jpg" | npm run dev -- organize --pattern "{Camera}/Processed/{Year}/{filename}{extension}"
```

### Event Photography Organization

```bash
# Configure for event-based organization
npm run dev -- config --set "organization.defaultPattern={YYYY-MM-DD}/{Camera}/{filename}{extension}"

# Analyze event photos
npm run dev -- analyze /path/to/event-photos

# Find photos from specific date
npm run dev -- search --from "2023-06-15" --to "2023-06-15"

# Organize by event date
npm run dev -- organize /path/to/event-photos /path/to/organized-events
```

## Supported File Formats

The Photo Organizer supports **45+ file formats** with comprehensive metadata extraction:

### Standard Image Formats
- **JPG/JPEG** - Standard JPEG images (including .jpe, .jfif variants)
- **TIFF/TIF** - Tagged Image File Format
- **PNG** - Portable Network Graphics
- **WebP** - Modern web image format
- **BMP** - Windows Bitmap
- **GIF** - Graphics Interchange Format
- **JPEG 2000** - JP2, JPX formats

### Camera Raw Formats (Professional Photography)
- **Canon**: CR2, CR3 (newer mirrorless cameras)
- **Nikon**: NEF, NRW
- **Sony**: ARW, SRF, SR2
- **Olympus**: ORF
- **Panasonic**: RW2
- **Pentax**: PEF, PTX
- **Fujifilm**: RAF
- **Hasselblad**: 3FR
- **Kodak/Minolta**: DCR, MRW
- **Epson**: ERF
- **Mamiya**: MEF
- **Leaf**: MOS
- **Sigma**: X3F

### Adobe Formats
- **DNG** - Digital Negative (Adobe's open raw standard)
- **PSD/PSB** - Photoshop Documents

### Mobile/Modern Formats
- **HEIC/HEIF** - High Efficiency Image formats (newer iPhones)

### Video Formats (with metadata)
- **MOV, MP4** - QuickTime and MPEG-4 video
- **AVI, MKV** - Various video containers
- **MTS, M2TS** - AVCHD video formats

### Format Configuration

You can customize which formats are processed:

```bash
# View current supported extensions
npm run dev -- config --show

# The system loads 45+ formats by default from configuration
# All formats supported by ExifTool can potentially be processed
```

> **Note**: All formats supported by ExifTool can potentially be processed. The system extracts available metadata regardless of format, though some formats may have richer metadata than others. RAW formats typically contain the most comprehensive metadata.

## Database Schema

The SQLite database stores all metadata in a structured format with proper indexing for fast queries. The schema includes tables for photos with all EXIF data, file properties, and computed fields.

## Performance & Optimization

### Configurable Performance Settings

The system provides extensive performance tuning through configuration:

```bash
# View current performance settings
npm run dev -- config --show

# Adjust batch processing
npm run dev -- config --set "extraction.batchSize=200"

# Set concurrency level
npm run dev -- config --set "extraction.maxConcurrent=8"

# Configure caching
npm run dev -- config --set "performance.enableCaching=true"
npm run dev -- config --set "performance.cacheSize=2000"

# Set memory limits
npm run dev -- config --set "performance.memoryLimit=1GB"
```

### Performance Features

- **Intelligent Batch Processing**: Configurable batch sizes for optimal throughput
- **Concurrent Processing**: Multi-threaded metadata extraction with configurable limits
- **Memory Management**: Configurable memory limits and efficient streaming
- **Database Optimization**: SQLite with proper indexing for fast queries
- **Metadata Caching**: Optional caching system for frequently accessed metadata
- **Progress Tracking**: Real-time progress indicators for long operations
- **Hidden File Skipping**: Configurable to skip hidden files and system directories

### Typical Performance

- **Metadata Extraction**: ~10-50 files/second (depending on format and hardware)
- **Database Operations**: Optimized bulk inserts with transaction batching
- **File Organization**: Limited by disk I/O, with atomic operations for safety
- **Search Queries**: Sub-second response times even with large collections (10,000+ photos)

### Large Collection Handling

For collections with thousands of photos:

```bash
# Optimize for large collections
npm run dev -- config --set "extraction.batchSize=500"
npm run dev -- config --set "extraction.maxConcurrent=6"
npm run dev -- config --set "performance.cacheSize=5000"

# Enable database backup for safety
npm run dev -- config --set "database.backupOnStart=true"
```

## Error Handling & Safety

### Robust Error Management

- **Graceful Degradation**: Continues processing even if individual files fail
- **Detailed Error Reporting**: File-specific error messages with context
- **Atomic Operations**: Database transactions ensure data consistency
- **Safe File Operations**: Conflict detection and configurable duplicate handling
- **Backup Options**: Optional automatic database backups before operations
- **Validation**: Configuration validation with helpful error messages

### Safety Features

```bash
# Enable database backups
npm run dev -- config --set "database.backupOnStart=true"

# Use copy mode to preserve originals
npm run dev -- organize ./photos ./organized --copy

# Always preview first with dry run
npm run dev -- organize ./photos ./organized --dry-run

# Configure safe duplicate handling
npm run dev -- config --set "organization.handleDuplicates=skip"
```

### Logging Configuration

```bash
# Set detailed logging
npm run dev -- config --set "logging.level=debug"

# Enable file logging
npm run dev -- config --set "logging.file=./photo-organizer.log"

# Control console output
npm run dev -- config --set "logging.console=true"
```

## Troubleshooting

### Common Issues and Solutions

**Configuration Problems:**
```bash
# Check current configuration
npm run dev -- config --show

# Reset to defaults if corrupted
npm run dev -- config --reset

# Validate configuration
npm run dev -- config --show  # Will show validation errors
```

**Performance Issues:**
```bash
# Reduce batch size for memory-constrained systems
npm run dev -- config --set "extraction.batchSize=25"

# Limit concurrency
npm run dev -- config --set "extraction.maxConcurrent=2"
```

**File Access Issues:**
```bash
# Skip hidden files
npm run dev -- config --set "extraction.skipHidden=true"

# Check supported extensions
npm run dev -- config --show
```

### Getting Help

- Check logs: `./photo-organizer.log` (if file logging enabled)
- Use debug mode: `npm run dev -- config --set "logging.level=debug"`
- Validate configuration: `npm run dev -- config --show`
- Test with dry run: `--dry-run` flag on organize commands

## License

GPL-2.0 License - see LICENSE file for details.
