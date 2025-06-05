#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import { MetadataExtractor } from './metadata-extractor';
import { DatabaseManager } from './database-manager';
import { FileOrganizer } from './file-organizer';
import { DuplicateDetector } from './duplicate-detector';
import { PhotoMetadata, AnalysisResult } from './types';
import { ConfigManager } from './config-manager';

const program = new Command();
const configManager = ConfigManager.getInstance();
const databaseConfig = { path: './photos.db', backupOnStart: false };
const organizationConfig = { 
  defaultPattern: '{Year}/{filename}{extension}', 
  createYearFolders: true, 
  preserveOriginalStructure: false, 
  handleDuplicates: 'rename', 
  maxFilenameLength: 255 
};

program
  .name('photo-organizer')
  .description('A TypeScript/Node.js system for analyzing and organizing photo files based on metadata')
  .version('1.0.0')
  .option('-c, --config <path>', 'Configuration file path');

// Analyze command
program.command('analyze')
  .description('Analyze photos in a directory and build metadata database')
  .argument('<directory>', 'Directory containing photos to analyze')
  .option('-d, --database <path>', 'Database file path', databaseConfig?.path || './photos.db')
  .option('-r, --recursive', 'Scan directories recursively', true)
  .action(async (directory: string, options: any) => {
    await analyzePhotos(directory, options);
  });

// Organize command
program
  .command('organize')
  .description('Organize photos based on metadata pattern')
  .argument('<source>', 'Source directory or database')
  .argument('<output>', 'Output directory')
  .option('-p, --pattern <pattern>', 'Organization pattern', organizationConfig?.defaultPattern || '{Year}/{filename}{extension}')
  .option('-d, --database <path>', 'Database file path', databaseConfig?.path || './photos.db')
  .option('-c, --copy', 'Copy files instead of moving them', false)
  .option('-o, --overwrite', 'Overwrite existing files', false)
  .option('--dry-run', 'Preview organization without moving files', false)
  .action(async (source: string, output: string, options: any) => {
    await organizePhotos(source, output, options);
  });

// Stats command
program
  .command('stats')
  .description('Show statistics about photo collection')
  .option('-d, --database <path>', 'Database file path', databaseConfig?.path || './photos.db')
  .action(async (options: any) => {
    await showStats(options);
  });

// Patterns command
program
  .command('patterns')
  .description('Show available organization patterns')
  .action(() => {
    showPatterns();
  });

// Search command
program
  .command('search')
  .description('Search photos by metadata')
  .option('-d, --database <path>', 'Database file path', databaseConfig?.path || './photos.db')
  .option('-c, --camera <camera>', 'Filter by camera')
  .option('-f, --from <date>', 'Filter from date (YYYY-MM-DD)')
  .option('-t, --to <date>', 'Filter to date (YYYY-MM-DD)')
  .option('-e, --extension <ext>', 'Filter by file extension')
  .option('--has-gps', 'Filter photos with GPS data', false)
  .option('--min-mp <megapixels>', 'Minimum megapixels')
  .option('--max-mp <megapixels>', 'Maximum megapixels')
  .action(async (options: any) => {
    await searchPhotos(options);
  });

// Config command
program
  .command('config')
  .description('Manage configuration settings')
  .option('--show', 'Show current configuration', false)
  .option('--set <key=value>', 'Set configuration value')
  .option('--reset', 'Reset configuration to defaults', false)
  .action(async (options: any) => {
    await manageConfig(options);
  });

// Duplicate detection commands
program
  .command('duplicates')
  .description('Find and manage duplicate photos')
  .option('-d, --database <path>', 'Database file path', databaseConfig?.path || './photos.db')
  .option('--exact', 'Find exact duplicates only', false)
  .option('--similar', 'Find similar photos only', false)
  .option('--threshold <number>', 'Similarity threshold (0-1)', '0.9')
  .option('--report <path>', 'Save report to file')
  .action(async (options: any) => {
    await findDuplicates(options);
  });

program
  .command('remove-duplicates')
  .description('Remove duplicate photos using specified strategy')
  .option('-d, --database <path>', 'Database file path', databaseConfig?.path || './photos.db')
  .option('-s, --strategy <strategy>', 'Removal strategy: keep-first, keep-newest, keep-largest', 'keep-newest')
  .option('--exact', 'Remove exact duplicates only', false)
  .option('--similar', 'Remove similar photos only', false)
  .option('--threshold <number>', 'Similarity threshold (0-1)', '0.9')
  .option('--dry-run', 'Preview removal without deleting files', false)
  .option('--report <path>', 'Save removal report to file')
  .action(async (options: any) => {
    await removeDuplicates(options);
  });

async function analyzePhotos(directory: string, options: any): Promise<void> {
  const spinner = ora('Initializing...').start();
  
  try {
    // Validate input directory
    if (!await fs.pathExists(directory)) {
      spinner.fail(chalk.red(`Directory not found: ${directory}`));
      process.exit(1);
    }

    const stats = await fs.stat(directory);
    if (!stats.isDirectory()) {
      spinner.fail(chalk.red(`Path is not a directory: ${directory}`));
      process.exit(1);
    }

    // Initialize components
    const extractor = new MetadataExtractor();
    const dbManager = new DatabaseManager(options.database);
    
    spinner.text = 'Initializing database...';
    await dbManager.initialize();

    spinner.text = 'Scanning for photo files...';
    const photoFiles = await extractor.getPhotoFiles(directory);
    
    if (photoFiles.length === 0) {
      spinner.warn(chalk.yellow('No supported photo files found in directory'));
      await cleanup(extractor, dbManager);
      return;
    }

    spinner.succeed(chalk.green(`Found ${photoFiles.length} photo files`));

    // Extract metadata with progress
    let processed = 0;
    const startTime = Date.now();
    const progressSpinner = ora('Extracting metadata...').start();

    const { metadata, errors } = await extractor.extractBatchMetadata(
      photoFiles,
      (current, total, filename) => {
        processed = current;
        progressSpinner.text = `Extracting metadata... ${current}/${total} - ${path.basename(filename)}`;
      }
    );

    progressSpinner.succeed(chalk.green(`Metadata extracted from ${metadata.length} files`));

    if (errors.length > 0) {
      console.log(chalk.yellow(`\nWarnings (${errors.length} files had issues):`));
      errors.slice(0, 5).forEach(error => {
        console.log(chalk.yellow(`  • ${error}`));
      });
      if (errors.length > 5) {
        console.log(chalk.yellow(`  ... and ${errors.length - 5} more`));
      }
    }

    // Save to database
    const dbSpinner = ora('Saving to database...').start();
    await dbManager.upsertPhotos(metadata);
    dbSpinner.succeed(chalk.green('Metadata saved to database'));

    // Show results
    const duration = Date.now() - startTime;
    console.log(chalk.green('\n✓ Analysis Complete!'));
    console.log(`  Total files: ${photoFiles.length}`);
    console.log(`  Processed: ${metadata.length}`);
    console.log(`  Skipped: ${errors.length}`);
    console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(`  Database: ${options.database}`);

    await cleanup(extractor, dbManager);
  } catch (error) {
    spinner.fail(chalk.red(`Analysis failed: ${error}`));
    process.exit(1);
  }
}

async function organizePhotos(source: string, output: string, options: any): Promise<void> {
  const spinner = ora('Initializing organization...').start();
  
  try {
    // Validate input source
    if (!await fs.pathExists(source)) {
      spinner.fail(chalk.red(`Source not found: ${source}`));
      process.exit(1);
    }

    const dbManager = new DatabaseManager(options.database);
    const organizer = new FileOrganizer();
    
    // Initialize database
    spinner.text = 'Connecting to database...';
    await dbManager.initialize();

    let photos: PhotoMetadata[] = [];

    // Check if source is a directory or database
    const sourceStats = await fs.stat(source);
    if (sourceStats.isDirectory()) {
      // Extract metadata from directory
      spinner.text = 'Analyzing photos in directory...';
      const extractor = new MetadataExtractor();
      const photoFiles = await extractor.getPhotoFiles(source);
      
      if (photoFiles.length === 0) {
        spinner.warn(chalk.yellow('No supported photo files found in source directory'));
        await cleanup(extractor, dbManager);
        return;
      }

      const { metadata, errors } = await extractor.extractBatchMetadata(
        photoFiles,
        (current, total, filename) => {
          spinner.text = `Analyzing photos... ${current}/${total} - ${path.basename(filename)}`;
        }
      );

      photos = metadata;
      
      if (errors.length > 0) {
        console.log(chalk.yellow(`\nWarnings: ${errors.length} files had issues during analysis`));
      }
      
      await extractor.cleanup();
    } else {
      // Load from database
      spinner.text = 'Loading photos from database...';
      photos = await dbManager.searchPhotos();
    }

    if (photos.length === 0) {
      spinner.warn(chalk.yellow('No photos to organize'));
      await dbManager.close();
      return;
    }

    spinner.succeed(chalk.green(`Found ${photos.length} photos to organize`));

    // Create output directory
    await fs.ensureDir(output);

    // Organize photos
    const organizationSpinner = ora('Organizing photos...').start();
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    const organizationOptions = {
      copy: options.copy || false,
      overwrite: options.overwrite || false,
      dryRun: options.dryRun || false
    };

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      organizationSpinner.text = `Organizing photos... ${i + 1}/${photos.length} - ${path.basename(photo.filepath)}`;

      try {
        const result = await organizer.organizeFile(
          photo,
          options.pattern,
          output,
          organizationOptions
        );

        if (result.success) {
          successCount++;
          if (options.dryRun) {
            console.log(chalk.gray(`[DRY RUN] ${result.sourcePath} → ${result.targetPath}`));
          }
        } else {
          errorCount++;
          if (result.error) {
            errors.push(`${photo.filepath}: ${result.error}`);
          }
        }
      } catch (error) {
        errorCount++;
        errors.push(`${photo.filepath}: ${error}`);
      }
    }

    await dbManager.close();
    
    if (options.dryRun) {
      organizationSpinner.succeed(chalk.blue('Dry run completed'));
      console.log(`\n📋 ${chalk.bold('Dry Run Summary')}`);
      console.log(`Would organize: ${chalk.green(successCount)} photos`);
      if (errorCount > 0) {
        console.log(`Would have errors: ${chalk.red(errorCount)} photos`);
      }
    } else {
      organizationSpinner.succeed(chalk.green('Organization completed'));
      console.log(`\n📁 ${chalk.bold('Organization Summary')}`);
      console.log(`Successfully organized: ${chalk.green(successCount)} photos`);
      if (errorCount > 0) {
        console.log(`Failed to organize: ${chalk.red(errorCount)} photos`);
      }
    }

    console.log(`Output directory: ${chalk.cyan(output)}`);
    console.log(`Pattern used: ${chalk.cyan(options.pattern || organizationConfig.defaultPattern)}`);

    if (errors.length > 0) {
      console.log(chalk.yellow(`\nErrors (showing first 5):`));
      errors.slice(0, 5).forEach(error => {
        console.log(chalk.yellow(`  • ${error}`));
      });
      if (errors.length > 5) {
        console.log(chalk.yellow(`  ... and ${errors.length - 5} more`));
      }
    }
    
  } catch (error) {
    spinner.fail(chalk.red(`Organization failed: ${error}`));
    process.exit(1);
  }
}

async function showStats(options: any): Promise<void> {
  const spinner = ora('Loading statistics...').start();
  
  try {
    const dbManager = new DatabaseManager(options.database);
    await dbManager.initialize();
    
    const stats = await dbManager.getStats();
    
    spinner.succeed(chalk.green('Statistics loaded'));
    
    console.log(chalk.blue('\n📊 Photo Collection Statistics\n'));
    
    console.log(chalk.white(`Total Photos: ${stats.totalPhotos.toLocaleString()}`));
    
    if (stats.dateRange.earliest && stats.dateRange.latest) {
      console.log(`Date Range: ${stats.dateRange.earliest.toLocaleDateString()} - ${stats.dateRange.latest.toLocaleDateString()}`);
    }
    
    if (stats.cameras.length > 0) {
      console.log('\nTop Cameras:');
      stats.cameras.forEach(camera => {
        console.log(`  ${camera.camera}: ${camera.count.toLocaleString()} photos`);
      });
    }
    
    if (stats.extensions.length > 0) {
      console.log('\nFile Types:');
      stats.extensions.forEach(ext => {
        console.log(`  ${ext.extension.toUpperCase()}: ${ext.count.toLocaleString()} photos`);
      });
    }
    
    await dbManager.close();
  } catch (error) {
    spinner.fail(chalk.red(`Failed to load statistics: ${error}`));
    process.exit(1);
  }
}

function showPatterns(): void {
  console.log(chalk.blue('\n📁 Available Organization Patterns\n'));
  
  const suggested = FileOrganizer.getSuggestedPatterns();
  suggested.forEach(pattern => {
    console.log(chalk.white(pattern.name));
    console.log(chalk.gray(`  Pattern: ${pattern.pattern}`));
    console.log(chalk.gray(`  Description: ${pattern.description}\n`));
  });
}

async function searchPhotos(options: any): Promise<void> {
  const spinner = ora('Searching photos...').start();
  
  try {
    const dbManager = new DatabaseManager(options.database);
    await dbManager.initialize();

    // Build search filters from options
    const filters: any = {};

    if (options.camera) {
      filters.camera = options.camera;
    }
      if (options.from) {
      filters.dateFrom = new Date(options.from);
      if (isNaN(filters.dateFrom.getTime())) {
        spinner.fail(chalk.red('Invalid from date format. Use YYYY-MM-DD'));
        process.exit(1);
      }
    }

    if (options.to) {
      filters.dateTo = new Date(options.to);
      if (isNaN(filters.dateTo.getTime())) {
        spinner.fail(chalk.red('Invalid to date format. Use YYYY-MM-DD'));
        process.exit(1);
      }
    }

    if (options.extension) {
      filters.extension = options.extension.startsWith('.') ? options.extension : `.${options.extension}`;
    }

    if (options.hasGps) {
      filters.hasGPS = true;
    }

    if (options.minMp) {
      filters.minMegapixels = parseFloat(options.minMp);
      if (isNaN(filters.minMegapixels)) {
        spinner.fail(chalk.red('Invalid minimum megapixels value'));
        process.exit(1);
      }
    }

    if (options.maxMp) {
      filters.maxMegapixels = parseFloat(options.maxMp);
      if (isNaN(filters.maxMegapixels)) {
        spinner.fail(chalk.red('Invalid maximum megapixels value'));
        process.exit(1);
      }
    }

    // Perform search
    spinner.text = 'Executing search...';
    const photos = await dbManager.searchPhotos(filters);
    
    await dbManager.close();
    spinner.succeed(chalk.green(`Search completed`));

    // Display results
    console.log(`\n🔍 ${chalk.bold('Search Results')}`);
    console.log(`Found ${chalk.green(photos.length)} photos matching criteria\n`);

    if (photos.length === 0) {
      console.log(chalk.yellow('No photos found matching the search criteria.'));
      return;
    }

    // Show first 10 results with details
    const displayLimit = Math.min(10, photos.length);
    console.log(`${chalk.bold('Results')} (showing first ${displayLimit}):`);
    
    for (let i = 0; i < displayLimit; i++) {
      const photo = photos[i];
      console.log(`\n${chalk.cyan(`${i + 1}.`)} ${path.basename(photo.filepath)}`);
      console.log(`   📁 Path: ${photo.filepath}`);
      if (photo.dateTimeOriginal) {
        console.log(`   📅 Date: ${photo.dateTimeOriginal.toLocaleDateString()}`);
      }
      if (photo.camera) {
        console.log(`   📷 Camera: ${photo.camera}`);
      }
      if (photo.megapixels) {
        console.log(`   🔸 ${photo.megapixels.toFixed(1)} MP`);
      }      if (photo.gpsLatitude && photo.gpsLongitude) {
        console.log(`   🌍 GPS: ${photo.gpsLatitude.toFixed(6)}, ${photo.gpsLongitude.toFixed(6)}`);
      }
      console.log(`   💾 Size: ${(photo.fileSize / 1024 / 1024).toFixed(1)} MB`);
    }

    if (photos.length > displayLimit) {
      console.log(`\n${chalk.gray(`... and ${photos.length - displayLimit} more results`)}`);
    }
    
  } catch (error) {
    spinner.fail(chalk.red(`Search failed: ${error}`));
    process.exit(1);
  }
}

async function manageConfig(options: any): Promise<void> {
  try {
    const configManager = ConfigManager.getInstance();

    if (options.show) {
      console.log('\n⚙️ Current Configuration:');
      const config = configManager.getConfig();
      console.log(chalk.cyan(JSON.stringify(config, null, 2)));
      return;
    }

    if (options.set) {
      const [key, value] = options.set.split('=');
      if (!key || value === undefined) {
        console.log(chalk.red('Invalid format. Use --set key=value'));
        process.exit(1);
      }

      // Parse the value - attempt to parse as JSON, fallback to string
      let parsedValue: any = value;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        // Keep as string if not valid JSON
      }

      configManager.setConfigValue(key, parsedValue);
      await configManager.saveConfig();
      console.log(chalk.green(`✅ Configuration updated: ${key} = ${parsedValue}`));
      return;
    }

    if (options.reset) {
      const spinner = ora('Resetting configuration to defaults...').start();
      configManager.resetConfig();
      await configManager.saveConfig();
      spinner.succeed(chalk.green('Configuration reset to defaults'));
      return;
    }

    // Show help if no action specified
    console.log('\n⚙️ Configuration Management');
    console.log('Available actions:');
    console.log('  --show          Show current configuration');
    console.log('  --set key=value Set a configuration value');
    console.log('  --reset         Reset to default configuration');
    console.log('\nExamples:');
    console.log('  npm run start -- config --show');
    console.log('  npm run start -- config --set extraction.batchSize=100');
    console.log('  npm run start -- config --set organization.defaultPattern="{Year}/{Month}/{filename}{extension}"');
    console.log('  npm run start -- config --reset');

  } catch (error) {
    console.log(chalk.red(`Configuration management failed: ${error}`));
    process.exit(1);
  }
}

async function findDuplicates(options: any): Promise<void> {
  const spinner = ora('Loading photos from database...').start();
  
  try {
    const dbManager = new DatabaseManager(options.database);
    await dbManager.initialize();
    
    const duplicateDetector = new DuplicateDetector();
    
    spinner.text = 'Fetching photos with hash information...';
    const photos = await dbManager.getAllPhotosWithHashes();
    
    if (photos.length === 0) {
      spinner.warn(chalk.yellow('No photos found in database'));
      await dbManager.close();
      return;
    }
    
    spinner.text = 'Detecting duplicates...';
    const result = await duplicateDetector.detectDuplicates(photos, (current, total, operation) => {
      spinner.text = `${operation} ${current}/${total}`;
    });
    
    spinner.succeed(chalk.green('Duplicate detection complete'));
    
    // Show results
    console.log(chalk.blue('\n🔍 Duplicate Detection Results\n'));
    console.log(`Total files analyzed: ${result.totalFiles}`);
    console.log(`Unique files: ${result.uniqueFiles}`);
    console.log(`Duplicate files: ${result.totalDuplicates}`);
    console.log(`Duplicate groups: ${result.duplicateGroups.length}`);
    console.log(`Total wasted space: ${duplicateDetector.formatFileSize(result.totalWastedSpace)}`);
    console.log(`Detection time: ${(result.duration / 1000).toFixed(1)}s`);
    
    if (result.duplicateGroups.length > 0) {
      console.log(chalk.yellow('\nDuplicate Groups (showing first 5):'));
      result.duplicateGroups.slice(0, 5).forEach((group, index) => {
        console.log(chalk.white(`\nGroup ${index + 1} (${group.hashType} hash: ${group.hash.substring(0, 8)}...):`));
        console.log(chalk.gray(`  Total size: ${duplicateDetector.formatFileSize(group.totalSize)}`));
        console.log(chalk.gray(`  Files (${group.files.length}):`));
        group.files.forEach(file => {
          console.log(chalk.gray(`    • ${file.filename} (${duplicateDetector.formatFileSize(file.fileSize)})`));
        });
      });
      
      if (result.duplicateGroups.length > 5) {
        console.log(chalk.gray(`\n... and ${result.duplicateGroups.length - 5} more duplicate groups`));
      }
    } else {
      console.log(chalk.green('\n🎉 No duplicates found!'));
    }
    
    // Save report if requested
    if (options.report) {
      const report = duplicateDetector.generateReport(result);
      await fs.writeFile(options.report, report, 'utf8');
      console.log(chalk.green(`\nReport saved to: ${options.report}`));
    }
    
    await dbManager.close();
  } catch (error) {
    spinner.fail(chalk.red(`Failed to detect duplicates: ${error}`));
    process.exit(1);
  }
}

async function removeDuplicates(options: any): Promise<void> {
  const spinner = ora('Loading photos from database...').start();
  
  try {
    const dbManager = new DatabaseManager(options.database);
    await dbManager.initialize();
    
    const duplicateDetector = new DuplicateDetector();
    
    spinner.text = 'Fetching photos with hash information...';
    const photos = await dbManager.getAllPhotosWithHashes();
    
    if (photos.length === 0) {
      spinner.warn(chalk.yellow('No photos found in database'));
      await dbManager.close();
      return;
    }
    
    spinner.text = 'Detecting duplicates...';
    const result = await duplicateDetector.detectDuplicates(photos);
    
    if (result.duplicateGroups.length === 0) {
      spinner.succeed(chalk.green('No duplicates found to remove'));
      await dbManager.close();
      return;
    }
    
    spinner.text = 'Removing duplicates...';
    const strategy = options.strategy as 'keep-first' | 'keep-newest' | 'keep-largest';
    const isDryRun = options.dryRun || false;
    
    const removalResult = await duplicateDetector.removeDuplicates(
      result.duplicateGroups,
      strategy,
      isDryRun,
      (current, total, filename) => {
        spinner.text = `${isDryRun ? 'Analyzing' : 'Removing'} duplicates... ${current}/${total} - ${filename}`;
      }
    );
    
    spinner.succeed(chalk.green(`Duplicate removal ${isDryRun ? 'analysis' : ''} complete`));
    
    // Show results
    console.log(chalk.blue(`\n🗑️  Duplicate Removal ${isDryRun ? 'Preview' : 'Results'}\n`));
    console.log(`Strategy: ${strategy}`);
    console.log(`${isDryRun ? 'Would remove' : 'Removed'}: ${removalResult.removed.length} files`);
    console.log(`${isDryRun ? 'Would save' : 'Saved'}: ${duplicateDetector.formatFileSize(removalResult.savedSpace)}`);
    
    if (removalResult.errors.length > 0) {
      console.log(chalk.red(`\nErrors (${removalResult.errors.length}):`));
      removalResult.errors.slice(0, 5).forEach(error => {
        console.log(chalk.red(`  • ${error}`));
      });
      if (removalResult.errors.length > 5) {
        console.log(chalk.red(`  ... and ${removalResult.errors.length - 5} more errors`));
      }
    }
    
    if (removalResult.removed.length > 0) {
      console.log(chalk.yellow(`\n${isDryRun ? 'Files that would be removed' : 'Removed files'} (showing first 10):`));
      removalResult.removed.slice(0, 10).forEach(file => {
        console.log(chalk.gray(`  • ${file}`));
      });
      if (removalResult.removed.length > 10) {
        console.log(chalk.gray(`  ... and ${removalResult.removed.length - 10} more files`));
      }
    }
    
    // Save report if requested
    if (options.report) {
      const report = `Duplicate Removal ${isDryRun ? 'Preview' : 'Report'}\n` +
        `Strategy: ${strategy}\n` +
        `${isDryRun ? 'Would remove' : 'Removed'}: ${removalResult.removed.length} files\n` +
        `${isDryRun ? 'Would save' : 'Saved'}: ${duplicateDetector.formatFileSize(removalResult.savedSpace)}\n\n` +
        `${isDryRun ? 'Files that would be removed' : 'Removed files'}:\n` +
        removalResult.removed.map(file => `  • ${file}`).join('\n') +
        (removalResult.errors.length > 0 ? `\n\nErrors:\n${removalResult.errors.map(error => `  • ${error}`).join('\n')}` : '');
        
      await fs.writeFile(options.report, report, 'utf8');
      console.log(chalk.green(`\nReport saved to: ${options.report}`));
    }
    
    await dbManager.close();
  } catch (error) {
    spinner.fail(chalk.red(`Failed to remove duplicates: ${error}`));
    process.exit(1);
  }
}

async function cleanup(extractor: MetadataExtractor, dbManager: DatabaseManager): Promise<void> {
  try {
    await extractor.cleanup();
    await dbManager.close();
  } catch (error) {
    console.error(chalk.red(`Cleanup error: ${error}`));
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\nShutting down gracefully...'));
  process.exit(0);
});

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
