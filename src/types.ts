export interface PhotoMetadata {
  // File properties
  filename: string;
  filepath: string;
  fileSize: number;
  dateModified: Date;
  fileExtension: string;

  // EXIF data
  dateTimeOriginal?: Date;
  camera?: string;
  make?: string;
  model?: string;
  lens?: string;
  focalLength?: number;
  focalLengthIn35mm?: number;
  aperture?: number;
  shutterSpeed?: string;
  iso?: number;
  flash?: string;
  whiteBalance?: string;
  exposureMode?: string;
  meteringMode?: string;
  
  // Image properties
  imageWidth?: number;
  imageHeight?: number;
  orientation?: number;
  colorSpace?: string;
  
  // GPS data
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAltitude?: number;
  gpsDirection?: number;
  
  // Additional metadata
  software?: string;
  artist?: string;
  copyright?: string;
  keywords?: string[];
  rating?: number;
  
  // Computed fields
  aspectRatio?: number;
  megapixels?: number;
  
  // Duplicate detection fields
  fileHash?: string;
  perceptualHash?: string;
}

export interface OrganizePattern {
  pattern: string;
  outputPath: string;
}

export interface DuplicateGroup {
  hash: string;
  hashType: 'file' | 'perceptual';
  files: PhotoMetadata[];
  totalSize: number;
  duplicateCount: number;
}

export interface DuplicateDetectionResult {
  totalFiles: number;
  uniqueFiles: number;
  duplicateGroups: DuplicateGroup[];
  totalDuplicates: number;
  totalWastedSpace: number;
  duration: number;
}

export interface AnalysisResult {
  totalFiles: number;
  processedFiles: number;
  skippedFiles: number;
  errors: string[];
  readErrors: string[];
  duplicates?: DuplicateDetectionResult;
  duration: number;
}
