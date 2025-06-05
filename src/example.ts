#!/usr/bin/env node

/**
 * Example usage script for the Photo Organizer system
 * 
 * This script demonstrates how to:
 * 1. Analyze photos in a directory
 * 2. Query the database
 * 3. Organize photos using patterns
 * 4. Search and filter photos
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { MetadataExtractor } from './metadata-extractor';
import { DatabaseManager } from './database-manager';
import { FileOrganizer } from './file-organizer';
import { ConfigManager } from './config-manager';

async function demonstratePhotoOrganizer() {
  console.log('🏁 Photo Organizer Demonstration\n');

  try {
    // Initialize configuration
    console.log('🔧 Initializing configuration...');
    const configManager = ConfigManager.getInstance();
    const config = configManager.getConfig();
    console.log('✅ Configuration loaded');

    // Setup paths using configuration
    const exampleDir = path.join(__dirname, '..', 'example-photos');
    const outputDir = path.join(__dirname, '..', 'organized-photos');
    const dbPath = config.database.path;

    // Initialize components
    console.log('🔧 Initializing components...');
    const extractor = new MetadataExtractor();
    const dbManager = new DatabaseManager(); // Uses config for database path
    const organizer = new FileOrganizer();

    await dbManager.initialize();
    console.log('✅ Database initialized');

    // Check if example photos exist
    if (!(await fs.pathExists(exampleDir))) {
      console.log(`⚠️  Example photo directory not found: ${exampleDir}`);
      console.log('📁 To test with real photos, create a directory with JPG, CR2, or DNG files');
      console.log('\nExample CLI usage:');
      console.log('  npm run dev -- analyze ./my-photos');
      console.log('  npm run dev -- organize ./my-photos ./organized --pattern "{Year}/{YYYY-MM-DD}/{filename}{extension}"');
      console.log('  npm run dev -- stats');
      console.log('  npm run dev -- search --camera "Canon"');
      await cleanup(extractor, dbManager);
      return;
    }

    // 1. Analyze photos
    console.log('\n📸 Step 1: Analyzing photos...');
    const photoFiles = await extractor.getPhotoFiles(exampleDir);
    console.log(`Found ${photoFiles.length} photo files`);

    if (photoFiles.length > 0) {
      const { metadata, errors } = await extractor.extractBatchMetadata(photoFiles);
      console.log(`Extracted metadata from ${metadata.length} files`);

      if (errors.length > 0) {
        console.log(`⚠️  ${errors.length} files had extraction errors`);
      }

      // Save to database
      await dbManager.upsertPhotos(metadata);
      console.log('✅ Metadata saved to database');

      // 2. Show statistics
      console.log('\n📊 Step 2: Database statistics...');
      const stats = await dbManager.getStats();
      console.log(`Total photos: ${stats.totalPhotos}`);
      
      if (stats.cameras.length > 0) {
        console.log('Cameras found:');
        stats.cameras.forEach(camera => {
          console.log(`  • ${camera.camera}: ${camera.count} photos`);
        });
      }      // 3. Demonstrate organization patterns
      console.log('\n🗂️  Step 3: Testing organization patterns...');
      
      // Show current configuration pattern
      console.log(`\n🔧 Current config pattern: ${config.organization.defaultPattern}`);
      console.log(`   Duplicate handling: ${config.organization.handleDuplicates}`);
      console.log(`   Max filename length: ${config.organization.maxFilenameLength}`);
      
      // Test with config pattern first
      console.log(`\nTesting default config pattern...`);
      const configPreview = await organizer.previewOrganization(metadata); // Uses config defaults
      console.log(`  Would organize ${configPreview.totalFiles} files`);
      if (configPreview.conflicts > 0) {
        console.log(`  ⚠️  ${configPreview.conflicts} naming conflicts detected`);
      }
      
      // Test additional patterns
      const additionalPatterns = [
        '{Camera}/{Year}/{filename}{extension}',
        '{Make}/{Model}/{YYYY-MM-DD}/{filename}{extension}'
      ];

      for (const pattern of additionalPatterns) {
        console.log(`\nPattern: ${pattern}`);
        const preview = await organizer.previewOrganization(metadata, pattern, outputDir);
        
        console.log(`  Would organize ${preview.totalFiles} files`);
        if (preview.conflicts > 0) {
          console.log(`  ⚠️  ${preview.conflicts} naming conflicts detected`);
        }
        
        // Show a few examples
        preview.preview.slice(0, 3).forEach(item => {
          const source = path.basename(item.source);
          const target = path.relative(outputDir, item.target);
          console.log(`    ${source} → ${target}`);
        });
      }

      // 4. Demonstrate searching
      console.log('\n🔍 Step 4: Searching photos...');
      
      // Search all photos
      const allPhotos = await dbManager.searchPhotos();
      console.log(`Total photos in database: ${allPhotos.length}`);

      // Search by date range (last 30 days)
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30);
      
      const recentPhotos = await dbManager.searchPhotos({
        dateFrom: recentDate
      });
      console.log(`Photos from last 30 days: ${recentPhotos.length}`);

      // Search photos with GPS data
      const gpsPhotos = await dbManager.searchPhotos({
        hasGPS: true
      });
      console.log(`Photos with GPS data: ${gpsPhotos.length}`);

    } else {
      console.log('No photos found to analyze');
    }

    // 5. Clean up
    await cleanup(extractor, dbManager);
    console.log('\n✅ Demonstration complete!');

  } catch (error) {
    console.error('❌ Error during demonstration:', error);
    process.exit(1);
  }
}

async function cleanup(extractor: MetadataExtractor, dbManager: DatabaseManager) {
  try {
    await extractor.cleanup();
    await dbManager.close();
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Run the demonstration
if (require.main === module) {
  demonstratePhotoOrganizer();
}

// Export for testing
export { demonstratePhotoOrganizer };
