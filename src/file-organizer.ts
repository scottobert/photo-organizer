import * as fs from 'fs-extra';
import * as path from 'path';
import { PhotoMetadata } from './types';
import { ConfigManager } from './config-manager';

export class FileOrganizer {
  private configManager: ConfigManager;

  constructor() {
    this.configManager = ConfigManager.getInstance();
  }

  /**
   * Available pattern placeholders and their descriptions
   */
  static readonly PATTERN_PLACEHOLDERS = {
    '{Year}': 'Four-digit year from DateTimeOriginal',
    '{Month}': 'Two-digit month (01-12)',
    '{Day}': 'Two-digit day (01-31)',
    '{YYYY}': 'Four-digit year',
    '{MM}': 'Two-digit month',
    '{DD}': 'Two-digit day',
    '{YYYY-MM-DD}': 'Full date format (YYYY-MM-DD)',
    '{Camera}': 'Camera make and model',
    '{Make}': 'Camera make only',
    '{Model}': 'Camera model only',
    '{filename}': 'Original filename without extension',
    '{extension}': 'File extension (e.g., .jpg)',
    '{ISO}': 'ISO setting',
    '{FocalLength}': 'Focal length in mm',
    '{Aperture}': 'Aperture value (f-number)',
    '{Rating}': 'Photo rating (0-5)',
    '{Artist}': 'Artist/photographer name'
  };

  /**
   * Generate target path based on pattern and metadata
   */
  generateTargetPath(
    metadata: PhotoMetadata,
    pattern: string,
    outputDirectory: string
  ): string {
    let processedPattern = pattern;

    // Get date from DateTimeOriginal or fallback to dateModified
    const photoDate = metadata.dateTimeOriginal || metadata.dateModified;
    
    // Replace date-related placeholders
    if (photoDate) {
      const year = photoDate.getFullYear().toString();
      const month = (photoDate.getMonth() + 1).toString().padStart(2, '0');
      const day = photoDate.getDate().toString().padStart(2, '0');
      
      processedPattern = processedPattern
        .replace(/{Year}/g, year)
        .replace(/{YYYY}/g, year)
        .replace(/{Month}/g, month)
        .replace(/{MM}/g, month)
        .replace(/{Day}/g, day)
        .replace(/{DD}/g, day)
        .replace(/{YYYY-MM-DD}/g, `${year}-${month}-${day}`);
    } else {
      // Replace with 'Unknown' if no date available
      processedPattern = processedPattern
        .replace(/{Year}/g, 'Unknown')
        .replace(/{YYYY}/g, 'Unknown')
        .replace(/{Month}/g, 'Unknown')
        .replace(/{MM}/g, 'Unknown')
        .replace(/{Day}/g, 'Unknown')
        .replace(/{DD}/g, 'Unknown')
        .replace(/{YYYY-MM-DD}/g, 'Unknown');
    }

    // Replace camera-related placeholders
    processedPattern = processedPattern
      .replace(/{Camera}/g, this.sanitizeFilename(metadata.camera || 'Unknown'))
      .replace(/{Make}/g, this.sanitizeFilename(metadata.make || 'Unknown'))
      .replace(/{Model}/g, this.sanitizeFilename(metadata.model || 'Unknown'));

    // Replace file-related placeholders
    const filenameWithoutExt = path.basename(metadata.filename, path.extname(metadata.filename));
    processedPattern = processedPattern
      .replace(/{filename}/g, this.sanitizeFilename(filenameWithoutExt))
      .replace(/{extension}/g, metadata.fileExtension);

    // Replace technical placeholders
    processedPattern = processedPattern
      .replace(/{ISO}/g, metadata.iso?.toString() || 'Unknown')
      .replace(/{FocalLength}/g, metadata.focalLength?.toString() || 'Unknown')
      .replace(/{Aperture}/g, metadata.aperture ? `f${metadata.aperture}` : 'Unknown')
      .replace(/{Rating}/g, metadata.rating?.toString() || '0')
      .replace(/{Artist}/g, this.sanitizeFilename(metadata.artist || 'Unknown'));

    // Clean up any remaining placeholders
    processedPattern = processedPattern.replace(/{[^}]*}/g, 'Unknown');

    // Combine with output directory and ensure proper path separators
    const targetPath = path.join(outputDirectory, processedPattern);
    
    // Normalize the path
    return path.normalize(targetPath);
  }
  /**
   * Organize a single file
   */
  async organizeFile(
    metadata: PhotoMetadata,
    pattern?: string,
    outputDirectory?: string,
    options: {
      copy?: boolean; // If true, copy files instead of moving them
      overwrite?: boolean; // If true, overwrite existing files
      dryRun?: boolean; // If true, only simulate the operation
    } = {}
  ): Promise<{
    success: boolean;
    sourcePath: string;
    targetPath: string;
    action: 'copy' | 'move' | 'skip' | 'dry-run' | 'rename';
    error?: string;
  }> {
    const { copy = false, dryRun = false } = options;
    const organizationConfig = this.configManager.getOrganizationConfig();
    
    // Use config defaults if not provided
    const actualPattern = pattern || organizationConfig.defaultPattern;
    const actualOutputDir = outputDirectory || './organized-photos';
    
    // Override overwrite based on config duplicate handling
    let overwrite = options.overwrite;
    if (overwrite === undefined) {
      overwrite = organizationConfig.handleDuplicates === 'overwrite';
    }
    
    try {
      let targetPath = this.generateTargetPath(metadata, actualPattern, actualOutputDir);
      
      // Apply filename length limit
      targetPath = this.applyFilenameLengthLimit(targetPath, organizationConfig.maxFilenameLength);
      
      const targetDir = path.dirname(targetPath);
      
      // Check if source file exists
      if (!await fs.pathExists(metadata.filepath)) {
        return {
          success: false,
          sourcePath: metadata.filepath,
          targetPath,
          action: 'skip',
          error: 'Source file does not exist'
        };
      }

      // Handle duplicates based on configuration
      if (await fs.pathExists(targetPath)) {
        if (organizationConfig.handleDuplicates === 'skip') {
          return {
            success: false,
            sourcePath: metadata.filepath,
            targetPath,
            action: 'skip',
            error: 'Target file already exists (skipping due to config)'
          };
        } else if (organizationConfig.handleDuplicates === 'rename') {
          targetPath = await this.generateUniqueFilename(targetPath);
        }
        // 'overwrite' case is handled by the overwrite flag
      }

      if (dryRun) {
        return {
          success: true,
          sourcePath: metadata.filepath,
          targetPath,
          action: 'dry-run'
        };
      }

      // Ensure target directory exists
      await fs.ensureDir(targetDir);

      // Perform the file operation
      const action = organizationConfig.handleDuplicates === 'rename' && await fs.pathExists(this.generateTargetPath(metadata, actualPattern, actualOutputDir)) 
        ? 'rename' 
        : (copy ? 'copy' : 'move');

      if (copy) {
        await fs.copy(metadata.filepath, targetPath, { overwrite });
      } else {
        await fs.move(metadata.filepath, targetPath, { overwrite });
      }
      
      return {
        success: true,
        sourcePath: metadata.filepath,
        targetPath,
        action: action as 'copy' | 'move' | 'rename'
      };
    } catch (error) {
      return {
        success: false,
        sourcePath: metadata.filepath,
        targetPath: this.generateTargetPath(metadata, actualPattern, actualOutputDir),
        action: copy ? 'copy' : 'move',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  /**
   * Organize multiple files with progress tracking
   */
  async organizeFiles(
    metadataList: PhotoMetadata[],
    pattern?: string,
    outputDirectory?: string,
    options: {
      copy?: boolean;
      overwrite?: boolean;
      dryRun?: boolean;
    } = {},
    onProgress?: (current: number, total: number, result: any) => void
  ): Promise<{
    successful: number;
    skipped: number;
    failed: number;
    results: any[];
  }> {
    const organizationConfig = this.configManager.getOrganizationConfig();
    
    // Use config defaults if not provided
    const actualPattern = pattern || organizationConfig.defaultPattern;
    const actualOutputDir = outputDirectory || './organized-photos';
    
    let successful = 0;
    let skipped = 0;
    let failed = 0;
    const results: any[] = [];

    for (let i = 0; i < metadataList.length; i++) {
      const metadata = metadataList[i];
      const result = await this.organizeFile(metadata, actualPattern, actualOutputDir, options);
      
      results.push(result);
      
      if (result.success) {
        if (result.action === 'skip' || result.action === 'dry-run') {
          skipped++;
        } else {
          successful++;
        }
      } else {
        failed++;
      }

      if (onProgress) {
        onProgress(i + 1, metadataList.length, result);
      }
    }

    return { successful, skipped, failed, results };
  }
  /**
   * Preview organization without actually moving files
   */
  async previewOrganization(
    metadataList: PhotoMetadata[],
    pattern?: string,
    outputDirectory?: string
  ): Promise<{
    preview: { source: string; target: string; conflicts: string[] }[];
    conflicts: number;
    totalFiles: number;
  }> {
    const organizationConfig = this.configManager.getOrganizationConfig();
    
    // Use config defaults if not provided
    const actualPattern = pattern || organizationConfig.defaultPattern;
    const actualOutputDir = outputDirectory || './organized-photos';
    
    const preview: { source: string; target: string; conflicts: string[] }[] = [];
    const targetPaths = new Map<string, string[]>();
    
    // Generate all target paths and detect conflicts
    for (const metadata of metadataList) {
      let targetPath = this.generateTargetPath(metadata, actualPattern, actualOutputDir);
      
      // Apply filename length limit
      targetPath = this.applyFilenameLengthLimit(targetPath, organizationConfig.maxFilenameLength);
      
      if (!targetPaths.has(targetPath)) {
        targetPaths.set(targetPath, []);
      }
      targetPaths.get(targetPath)!.push(metadata.filepath);
      
      preview.push({
        source: metadata.filepath,
        target: targetPath,
        conflicts: []
      });
    }

    // Add conflict information
    let conflictCount = 0;
    for (const [targetPath, sourcePaths] of targetPaths) {
      if (sourcePaths.length > 1) {
        conflictCount++;
        for (const previewItem of preview) {
          if (previewItem.target === targetPath) {
            previewItem.conflicts = sourcePaths.filter(sp => sp !== previewItem.source);
          }
        }
      }
    }

    return {
      preview,
      conflicts: conflictCount,
      totalFiles: metadataList.length
    };
  }

  /**
   * Validate pattern syntax
   */
  validatePattern(pattern: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check for unmatched braces
    const openBraces = (pattern.match(/{/g) || []).length;
    const closeBraces = (pattern.match(/}/g) || []).length;
    
    if (openBraces !== closeBraces) {
      errors.push('Unmatched braces in pattern');
    }

    // Check for invalid characters in pattern
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(pattern)) {
      errors.push('Pattern contains invalid characters for file paths');
    }

    // Check for unknown placeholders
    const placeholderRegex = /{([^}]+)}/g;
    let match;
    while ((match = placeholderRegex.exec(pattern)) !== null) {
      const placeholder = `{${match[1]}}`;
      if (!Object.keys(FileOrganizer.PATTERN_PLACEHOLDERS).includes(placeholder)) {
        errors.push(`Unknown placeholder: ${placeholder}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitize filename to remove invalid characters
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
  }

  /**
   * Get suggested patterns based on available metadata
   */  static getSuggestedPatterns(): { name: string; pattern: string; description: string }[] {
    return [
      {
        name: 'Year/Date',
        pattern: '{Year}/{YYYY-MM-DD}/{filename}{extension}',
        description: 'Organize by year, then by date'
      },
      {
        name: 'Camera/Year',
        pattern: '{Camera}/{Year}/{YYYY-MM-DD}/{filename}{extension}',
        description: 'Organize by camera, then year and date'
      },
      {
        name: 'Year/Month',
        pattern: '{Year}/{Year}-{Month}/{filename}{extension}',
        description: 'Organize by year and month'
      },
      {
        name: 'Date Only',
        pattern: '{YYYY-MM-DD}/{filename}{extension}',
        description: 'Organize by date only'
      },
      {
        name: 'Camera Model',
        pattern: '{Make}/{Model}/{Year}/{filename}{extension}',
        description: 'Organize by camera make, model, and year'
      },
      {
        name: 'Technical Settings',
        pattern: '{Year}/{ISO}-{FocalLength}mm-{Aperture}/{filename}{extension}',
        description: 'Organize by year and technical settings'
      }
    ];
  }

  /**
   * Apply filename length limit by truncating if necessary
   */
  private applyFilenameLengthLimit(filePath: string, maxLength: number): string {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const basename = path.basename(filePath, ext);
    
    if (basename.length <= maxLength - ext.length) {
      return filePath;
    }
    
    const truncatedBasename = basename.substring(0, maxLength - ext.length);
    return path.join(dir, truncatedBasename + ext);
  }

  /**
   * Generate a unique filename by appending a number
   */
  private async generateUniqueFilename(filePath: string): Promise<string> {
    let counter = 1;
    let uniquePath = filePath;
    
    while (await fs.pathExists(uniquePath)) {
      const dir = path.dirname(filePath);
      const ext = path.extname(filePath);
      const basename = path.basename(filePath, ext);
      uniquePath = path.join(dir, `${basename}_${counter}${ext}`);
      counter++;
    }
    
    return uniquePath;
  }
}
