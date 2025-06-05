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

// Helper function to get config manager safely
function getConfigManager() {
  try {
    return ConfigManager.getInstance();
  } catch (error) {
    console.error('Failed to initialize config manager:', error);
    return null;
  }
}

const configManager = getConfigManager();
const databaseConfig = configManager?.getDatabaseConfig() || { path: './photos.db', backupOnStart: false };
const organizationConfig = configManager?.getOrganizationConfig() || { 
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
  console.log('Organize photos not yet implemented');
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
  console.log('Search photos not yet implemented');
}

async function manageConfig(options: any): Promise<void> {
  console.log('Manage config not yet implemented');
}

async function findDuplicates(options: any): Promise<void> {
  console.log('Find duplicates not yet implemented');
}

async function removeDuplicates(options: any): Promise<void> {
  console.log('Remove duplicates not yet implemented');
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
