import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { exiftool } from 'exiftool-vendored';
import { PhotoMetadata } from './types';
import { ConfigManager } from './config-manager';

export class MetadataExtractor {
  private readonly configManager: ConfigManager;

  constructor() {
    this.configManager = ConfigManager.getInstance();
  }

  /**
   * Check if file is a supported photo format
   */  isSupportedFile(filepath: string): boolean {
    const ext = path.extname(filepath).toLowerCase();
    const extractionConfig = this.configManager.getExtractionConfig();
    return extractionConfig.supportedExtensions.includes(ext);
  }

  /**
   * Get all supported photo files from a directory
   */  async getPhotoFiles(directoryPath: string): Promise<string[]> {
    const files: string[] = [];
    const extractionConfig = this.configManager.getExtractionConfig();
    
    try {
      const entries = await fs.readdir(directoryPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directoryPath, entry.name);
        
        // Skip hidden files if configured to do so
        if (extractionConfig.skipHidden && entry.name.startsWith('.')) {
          continue;
        }
        
        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await this.getPhotoFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && this.isSupportedFile(fullPath)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      throw new Error(`Failed to read directory ${directoryPath}: ${error}`);
    }
    
    return files;
  }

  /**
   * Extract metadata from a single photo file
   */
  async extractMetadata(filepath: string): Promise<PhotoMetadata> {
    try {
      const stats = await fs.stat(filepath);
      const filename = path.basename(filepath);
      const fileExtension = path.extname(filepath).toLowerCase();

      // Get EXIF data using exiftool
      const exifData = await exiftool.read(filepath);

      // Extract and normalize metadata
      const metadata: PhotoMetadata = {
        filename,
        filepath,
        fileSize: stats.size,
        dateModified: stats.mtime,
        fileExtension,

        // EXIF data with safe property access
        dateTimeOriginal: this.parseDate(exifData.DateTimeOriginal || exifData.CreateDate),
        camera: this.formatCamera(exifData.Make, exifData.Model),
        make: exifData.Make?.toString(),
        model: exifData.Model?.toString(),
        lens: exifData.LensModel?.toString() || exifData.Lens?.toString(),
        focalLength: this.parseNumber(exifData.FocalLength),
        focalLengthIn35mm: this.parseNumber(exifData.FocalLengthIn35mmFormat),
        aperture: this.parseNumber(exifData.FNumber || exifData.ApertureValue),
        shutterSpeed: exifData.ShutterSpeedValue?.toString() || exifData.ExposureTime?.toString(),
        iso: this.parseNumber(exifData.ISO),
        flash: exifData.Flash?.toString(),
        whiteBalance: exifData.WhiteBalance?.toString(),
        exposureMode: exifData.ExposureMode?.toString(),
        meteringMode: exifData.MeteringMode?.toString(),

        // Image properties
        imageWidth: this.parseNumber(exifData.ImageWidth || exifData.ExifImageWidth),
        imageHeight: this.parseNumber(exifData.ImageHeight || exifData.ExifImageHeight),
        orientation: this.parseNumber(exifData.Orientation),
        colorSpace: exifData.ColorSpace?.toString(),

        // GPS data
        gpsLatitude: this.parseNumber(exifData.GPSLatitude),
        gpsLongitude: this.parseNumber(exifData.GPSLongitude),
        gpsAltitude: this.parseNumber(exifData.GPSAltitude),
        gpsDirection: this.parseNumber(exifData.GPSImgDirection),

        // Additional metadata
        software: exifData.Software?.toString(),
        artist: exifData.Artist?.toString(),
        copyright: exifData.Copyright?.toString(),
        keywords: this.parseKeywords(exifData.Keywords || exifData.Subject),
        rating: this.parseNumber(exifData.Rating)
      };      // Calculate computed fields
      if (metadata.imageWidth && metadata.imageHeight) {
        metadata.aspectRatio = metadata.imageWidth / metadata.imageHeight;
        metadata.megapixels = (metadata.imageWidth * metadata.imageHeight) / 1000000;
      }

      // Calculate hashes for duplicate detection
      try {
        metadata.fileHash = await this.calculateFileHash(filepath);
        metadata.perceptualHash = await this.calculatePerceptualHash(exifData, metadata);
      } catch (hashError) {
        // Continue without hashes if calculation fails
        console.warn(`Failed to calculate hashes for ${filepath}: ${hashError}`);
      }

      return metadata;
    } catch (error) {
      throw new Error(`Failed to extract metadata from ${filepath}: ${error}`);
    }
  }

  /**
   * Extract metadata from multiple files with progress tracking
   */
  async extractBatchMetadata(
    filepaths: string[],
    onProgress?: (current: number, total: number, filename: string) => void
  ): Promise<{ metadata: PhotoMetadata[], errors: string[] }> {
    const metadata: PhotoMetadata[] = [];
    const errors: string[] = [];

    for (let i = 0; i < filepaths.length; i++) {
      const filepath = filepaths[i];
      
      if (onProgress) {
        onProgress(i + 1, filepaths.length, path.basename(filepath));
      }

      try {
        const fileMetadata = await this.extractMetadata(filepath);
        metadata.push(fileMetadata);
      } catch (error) {
        errors.push(`${filepath}: ${error}`);
      }
    }

    return { metadata, errors };
  }  /**
   * Parse date string to Date object
   */
  private parseDate(dateStr: any): Date | undefined {
    if (!dateStr) return undefined;
    
    try {
      const dateString = dateStr.toString();
      
      // Handle EXIF date format (YYYY:MM:DD HH:MM:SS)
      if (dateString.match(/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/)) {
        // Convert EXIF format to ISO format
        // '2025:01:15 14:30:00' -> '2025-01-15T14:30:00Z'
        const isoDateString = dateString
          .replace(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/, '$1-$2-$3T$4:$5:$6Z');
        const date = new Date(isoDateString);
        return isNaN(date.getTime()) ? undefined : date;
      }
      
      // Handle other standard date formats
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? undefined : date;
    } catch {
      return undefined;
    }
  }

  /**
   * Parse numeric value safely
   */
  private parseNumber(value: any): number | undefined {
    if (value === null || value === undefined) return undefined;
    
    const num = typeof value === 'number' ? value : parseFloat(value.toString());
    return isNaN(num) ? undefined : num;
  }

  /**
   * Format camera make and model
   */
  private formatCamera(make: any, model: any): string | undefined {
    const makeStr = make?.toString().trim();
    const modelStr = model?.toString().trim();
    
    if (!makeStr && !modelStr) return undefined;
    if (!makeStr) return modelStr;
    if (!modelStr) return makeStr;
    
    // Avoid duplication if model already contains make
    if (modelStr.toLowerCase().startsWith(makeStr.toLowerCase())) {
      return modelStr;
    }
    
    return `${makeStr} ${modelStr}`;
  }

  /**
   * Parse keywords from various formats
   */
  private parseKeywords(keywords: any): string[] | undefined {
    if (!keywords) return undefined;
    
    if (Array.isArray(keywords)) {
      return keywords.map(k => k.toString().trim()).filter(k => k.length > 0);
    }
    
    if (typeof keywords === 'string') {
      return keywords.split(/[,;]/).map(k => k.trim()).filter(k => k.length > 0);
    }
    
    return undefined;  }

  /**
   * Calculate file hash for exact duplicate detection
   */
  private async calculateFileHash(filepath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filepath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Calculate perceptual hash for similar image detection
   * This is a simplified version based on image properties
   */
  private async calculatePerceptualHash(exifData: any, metadata: PhotoMetadata): Promise<string> {
    try {
      // Create a simple perceptual hash based on image properties
      const properties = [
        metadata.imageWidth || 0,
        metadata.imageHeight || 0,
        metadata.aspectRatio || 0,
        metadata.dateTimeOriginal?.getTime() || 0,
        metadata.camera || '',
        metadata.focalLength || 0,
        metadata.aperture || 0,
        metadata.iso || 0
      ];

      // Create a hash from the combined properties
      const propertyString = properties.join('|');
      const hash = crypto.createHash('sha256');
      hash.update(propertyString);
      return hash.digest('hex').substring(0, 16); // Use first 16 chars for perceptual hash
    } catch (error) {
      throw new Error(`Failed to calculate perceptual hash: ${error}`);
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await exiftool.end();
  }
}
