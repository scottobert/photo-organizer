import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import * as path from 'path';
import { PhotoMetadata, DuplicateGroup, DuplicateDetectionResult } from './types';
import { ConfigManager } from './config-manager';

export class DuplicateDetector {
  private readonly configManager: ConfigManager;

  constructor() {
    this.configManager = ConfigManager.getInstance();
  }

  /**
   * Calculate file hash (MD5) for exact duplicate detection
   */
  async calculateFileHash(filepath: string): Promise<string> {
    try {
      const buffer = await fs.readFile(filepath);
      return crypto.createHash('md5').update(buffer).digest('hex');
    } catch (error) {
      throw new Error(`Failed to calculate hash for ${filepath}: ${error}`);
    }
  }

  /**
   * Calculate simple perceptual hash based on file properties
   * For a more sophisticated implementation, we'd need image processing libraries
   */
  calculatePerceptualHash(metadata: PhotoMetadata): string | undefined {
    // Create a simple hash based on image dimensions, date, and camera
    if (!metadata.imageWidth || !metadata.imageHeight) {
      return undefined;
    }

    const components = [
      metadata.imageWidth.toString(),
      metadata.imageHeight.toString(),
      metadata.dateTimeOriginal?.toISOString() || '',
      metadata.camera || '',
      metadata.fileSize.toString()
    ];

    return crypto.createHash('md5').update(components.join('|')).digest('hex').substring(0, 16);
  }

  /**
   * Add hash information to metadata
   */
  async enrichMetadataWithHashes(metadata: PhotoMetadata[]): Promise<PhotoMetadata[]> {
    const enriched: PhotoMetadata[] = [];
    
    for (const item of metadata) {
      try {
        // Calculate file hash
        const fileHash = await this.calculateFileHash(item.filepath);
        
        // Calculate perceptual hash
        const perceptualHash = this.calculatePerceptualHash(item);
        
        enriched.push({
          ...item,
          fileHash,
          perceptualHash
        });
      } catch (error) {
        // If hash calculation fails, include metadata without hashes
        enriched.push({
          ...item,
          fileHash: undefined,
          perceptualHash: undefined
        });
      }
    }
    
    return enriched;
  }

  /**
   * Find duplicate groups by file hash (exact duplicates)
   */
  findExactDuplicates(metadata: PhotoMetadata[]): DuplicateGroup[] {
    const hashGroups = new Map<string, PhotoMetadata[]>();
    
    // Group files by hash
    for (const item of metadata) {
      if (item.fileHash) {
        if (!hashGroups.has(item.fileHash)) {
          hashGroups.set(item.fileHash, []);
        }
        hashGroups.get(item.fileHash)!.push(item);
      }
    }
    
    // Convert to duplicate groups (only groups with more than 1 file)
    const duplicateGroups: DuplicateGroup[] = [];
    for (const [hash, files] of hashGroups) {
      if (files.length > 1) {
        const totalSize = files.reduce((sum, file) => sum + file.fileSize, 0);
        duplicateGroups.push({
          hash,
          hashType: 'file',
          files,
          totalSize,
          duplicateCount: files.length - 1 // First file is original, rest are duplicates
        });
      }
    }
    
    return duplicateGroups.sort((a, b) => b.totalSize - a.totalSize);
  }

  /**
   * Find similar files by perceptual hash
   */
  findSimilarFiles(metadata: PhotoMetadata[]): DuplicateGroup[] {
    const hashGroups = new Map<string, PhotoMetadata[]>();
    
    // Group files by perceptual hash
    for (const item of metadata) {
      if (item.perceptualHash) {
        if (!hashGroups.has(item.perceptualHash)) {
          hashGroups.set(item.perceptualHash, []);
        }
        hashGroups.get(item.perceptualHash)!.push(item);
      }
    }
    
    // Convert to duplicate groups (only groups with more than 1 file)
    const duplicateGroups: DuplicateGroup[] = [];
    for (const [hash, files] of hashGroups) {
      if (files.length > 1) {
        const totalSize = files.reduce((sum, file) => sum + file.fileSize, 0);
        duplicateGroups.push({
          hash,
          hashType: 'perceptual',
          files,
          totalSize,
          duplicateCount: files.length - 1
        });
      }
    }
    
    return duplicateGroups.sort((a, b) => b.totalSize - a.totalSize);
  }
  /**
   * Detect all types of duplicates
   */
  async detectDuplicates(
    metadata: PhotoMetadata[],
    onProgress?: (current: number, total: number, operation: string) => void
  ): Promise<DuplicateDetectionResult> {
    const startTime = process.hrtime.bigint();
    
    if (onProgress) {
      onProgress(0, metadata.length, 'Calculating file hashes...');
    }
    
    // Enrich metadata with hashes
    const enrichedMetadata = await this.enrichMetadataWithHashes(metadata);
    
    if (onProgress) {
      onProgress(metadata.length, metadata.length, 'Finding exact duplicates...');
    }
    
    // Find exact duplicates
    const exactDuplicates = this.findExactDuplicates(enrichedMetadata);
    
    if (onProgress) {
      onProgress(metadata.length, metadata.length, 'Finding similar files...');
    }
    
    // Find similar files
    const similarFiles = this.findSimilarFiles(enrichedMetadata);
    
    // Combine results (prioritize exact duplicates)
    const allDuplicateGroups = [...exactDuplicates];
    
    // Add similar files that aren't already exact duplicates
    const exactHashes = new Set(exactDuplicates.map(group => group.hash));
    for (const similarGroup of similarFiles) {
      // Check if any file in this similar group is already in an exact duplicate group
      const hasExactMatch = similarGroup.files.some(file => 
        exactDuplicates.some(exactGroup => 
          exactGroup.files.some(exactFile => exactFile.filepath === file.filepath)
        )
      );
      
      if (!hasExactMatch) {
        allDuplicateGroups.push(similarGroup);
      }
    }
    
    // Calculate statistics
    const totalDuplicates = allDuplicateGroups.reduce((sum, group) => sum + group.duplicateCount, 0);
    const totalWastedSpace = allDuplicateGroups.reduce((sum, group) => {
      // Calculate wasted space (size of duplicates, not originals)
      const avgFileSize = group.totalSize / group.files.length;
      return sum + (avgFileSize * group.duplicateCount);
    }, 0);
      const uniqueFiles = metadata.length - totalDuplicates;
    
    // Calculate duration in milliseconds using high resolution timer
    const endTime = process.hrtime.bigint();
    const durationNs = endTime - startTime;
    const duration = Math.max(1, Number(durationNs / BigInt(1000000))); // Convert to ms, ensure minimum 1ms
    
    return {
      totalFiles: metadata.length,
      uniqueFiles,
      duplicateGroups: allDuplicateGroups,
      totalDuplicates,
      totalWastedSpace,
      duration
    };
  }

  /**
   * Remove duplicate files based on strategy
   */
  async removeDuplicates(
    duplicateGroups: DuplicateGroup[],
    strategy: 'keep-first' | 'keep-newest' | 'keep-largest' = 'keep-newest',
    dryRun: boolean = true,
    onProgress?: (current: number, total: number, filename: string) => void
  ): Promise<{ removed: string[], errors: string[], savedSpace: number }> {
    const removed: string[] = [];
    const errors: string[] = [];
    let savedSpace = 0;
    let processed = 0;
    
    const totalOperations = duplicateGroups.reduce((sum, group) => sum + group.duplicateCount, 0);
    
    for (const group of duplicateGroups) {
      if (group.files.length <= 1) continue;
      
      // Sort files based on strategy to determine which to keep
      let sortedFiles = [...group.files];
      switch (strategy) {
        case 'keep-newest':
          sortedFiles.sort((a, b) => b.dateModified.getTime() - a.dateModified.getTime());
          break;
        case 'keep-largest':
          sortedFiles.sort((a, b) => b.fileSize - a.fileSize);
          break;
        case 'keep-first':
        default:
          // Keep original order (first found)
          break;
      }
      
      // Keep the first file, remove the rest
      const [keep, ...toRemove] = sortedFiles;
      
      for (const file of toRemove) {
        processed++;
        if (onProgress) {
          onProgress(processed, totalOperations, path.basename(file.filepath));
        }
        
        try {
          if (!dryRun) {
            await fs.remove(file.filepath);
          }
          removed.push(file.filepath);
          savedSpace += file.fileSize;
        } catch (error) {
          errors.push(`Failed to remove ${file.filepath}: ${error}`);
        }
      }
    }
    
    return { removed, errors, savedSpace };
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Generate duplicate detection report
   */
  generateReport(result: DuplicateDetectionResult): string {
    const lines: string[] = [];
    
    lines.push('🔍 DUPLICATE DETECTION REPORT');
    lines.push('═'.repeat(50));
    lines.push('');
    
    // Summary
    lines.push('📊 SUMMARY');
    lines.push(`Total files analyzed: ${result.totalFiles.toLocaleString()}`);
    lines.push(`Unique files: ${result.uniqueFiles.toLocaleString()}`);
    lines.push(`Duplicate files: ${result.totalDuplicates.toLocaleString()}`);
    lines.push(`Duplicate groups: ${result.duplicateGroups.length.toLocaleString()}`);
    lines.push(`Wasted space: ${this.formatFileSize(result.totalWastedSpace)}`);
    lines.push(`Detection time: ${(result.duration / 1000).toFixed(1)}s`);
    lines.push('');
    
    if (result.duplicateGroups.length > 0) {
      lines.push('📁 DUPLICATE GROUPS');
      lines.push('-'.repeat(30));
      
      result.duplicateGroups.slice(0, 10).forEach((group, index) => {
        lines.push('');
        lines.push(`Group ${index + 1} (${group.hashType} hash: ${group.hash.substring(0, 8)}...)`);
        lines.push(`  Files: ${group.files.length}, Duplicates: ${group.duplicateCount}`);
        lines.push(`  Total size: ${this.formatFileSize(group.totalSize)}`);
        lines.push('  Files:');
        
        group.files.forEach((file, fileIndex) => {
          const marker = fileIndex === 0 ? '🏆' : '📄';
          const dateStr = file.dateTimeOriginal?.toLocaleDateString() || 'Unknown date';
          lines.push(`    ${marker} ${path.basename(file.filepath)} (${this.formatFileSize(file.fileSize)}, ${dateStr})`);
          lines.push(`      ${file.filepath}`);
        });
      });
      
      if (result.duplicateGroups.length > 10) {
        lines.push('');
        lines.push(`... and ${result.duplicateGroups.length - 10} more duplicate groups`);
      }
    } else {
      lines.push('✅ No duplicates found!');
    }
    
    return lines.join('\n');
  }
}
