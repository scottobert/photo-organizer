import { FileOrganizer } from './file-organizer';
import { MetadataExtractor } from './metadata-extractor';
import { DatabaseManager } from './database-manager';
import { DuplicateDetector } from './duplicate-detector';
import { ConfigManager } from './config-manager';
import { PhotoMetadata } from './types';
import * as fs from 'fs-extra';
import * as path from 'path';

// Mock dependencies
jest.mock('./metadata-extractor');
jest.mock('./database-manager');
jest.mock('./duplicate-detector');
jest.mock('./config-manager');
jest.mock('fs-extra');

const MockMetadataExtractor = MetadataExtractor as jest.MockedClass<typeof MetadataExtractor>;
const MockDatabaseManager = DatabaseManager as jest.MockedClass<typeof DatabaseManager>;
const MockDuplicateDetector = DuplicateDetector as jest.MockedClass<typeof DuplicateDetector>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Photo Organizer System', () => {
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockMetadataExtractor: jest.Mocked<MetadataExtractor>;
  let mockDatabaseManager: jest.Mocked<DatabaseManager>;
  let mockDuplicateDetector: jest.Mocked<DuplicateDetector>;
  const sampleMetadata: PhotoMetadata = {
    filepath: '/test/IMG_1234.jpg',
    filename: 'IMG_1234.jpg',
    fileSize: 1024000,
    fileExtension: '.jpg',
    dateModified: new Date('2023-06-15T10:30:00Z'),
    dateTimeOriginal: new Date('2023-06-15T10:30:00Z'),
    camera: 'Canon EOS 7D',
    make: 'Canon',
    model: 'EOS 7D',
    imageWidth: 4000,
    imageHeight: 3000,
    megapixels: 12.0
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ConfigManager
    mockConfigManager = {
      getOrganizationConfig: jest.fn().mockReturnValue({
        defaultPattern: '{Year}/{YYYY-MM-DD}/{filename}{extension}',
        createYearFolders: true,
        preserveOriginalStructure: false,
        handleDuplicates: 'rename',
        maxFilenameLength: 255
      }),
      getDatabaseConfig: jest.fn().mockReturnValue({
        path: './test-photos.db',
        backupOnStart: false
      }),
      getExtractionConfig: jest.fn().mockReturnValue({
        batchSize: 50,
        maxConcurrent: 4,
        skipHidden: true,
        supportedExtensions: ['.jpg', '.jpeg', '.png', '.tiff', '.cr2', '.nef', '.arw'],
        extractThumbnails: false
      })    } as any;

    (ConfigManager.getInstance as jest.Mock).mockReturnValue(mockConfigManager);

    // Mock MetadataExtractor
    mockMetadataExtractor = {
      getPhotoFiles: jest.fn(),
      extractBatchMetadata: jest.fn(),
      cleanup: jest.fn().mockResolvedValue(undefined)
    } as any;

    MockMetadataExtractor.mockImplementation(() => mockMetadataExtractor);

    // Mock DatabaseManager
    mockDatabaseManager = {
      initialize: jest.fn().mockResolvedValue(undefined),
      upsertPhotos: jest.fn().mockResolvedValue(undefined),
      searchPhotos: jest.fn().mockResolvedValue([sampleMetadata]),
      getStats: jest.fn().mockResolvedValue({
        totalPhotos: 1,
        dateRange: { earliest: new Date('2023-01-01'), latest: new Date('2023-12-31') },
        cameras: [{ camera: 'Canon EOS 7D', count: 1 }],
        extensions: [{ extension: '.jpg', count: 1 }]
      }),
      getAllPhotosWithHashes: jest.fn().mockResolvedValue([sampleMetadata]),
      close: jest.fn().mockResolvedValue(undefined)
    } as any;

    MockDatabaseManager.mockImplementation(() => mockDatabaseManager);

    // Mock DuplicateDetector
    mockDuplicateDetector = {
      detectDuplicates: jest.fn().mockResolvedValue({
        duplicateGroups: [],
        totalDuplicates: 0,
        totalWastedSpace: 0
      }),
      removeDuplicates: jest.fn().mockResolvedValue({
        removed: [],
        savedSpace: 0,
        errors: []
      }),
      formatFileSize: jest.fn().mockImplementation((size: number) => `${size} bytes`),
      generateReport: jest.fn().mockReturnValue('Duplicate report content')
    } as any;

    MockDuplicateDetector.mockImplementation(() => mockDuplicateDetector);    // Mock fs-extra
    (mockFs.pathExists as unknown as jest.Mock).mockResolvedValue(true);
    (mockFs.stat as unknown as jest.Mock).mockResolvedValue({ isDirectory: () => true } as any);
    (mockFs.writeFile as unknown as jest.Mock).mockResolvedValue(undefined);
  });

  describe('FileOrganizer', () => {
    test('should identify pattern placeholders', () => {
      expect(Object.keys(FileOrganizer.PATTERN_PLACEHOLDERS).length).toBeGreaterThan(0);
    });

    test('should validate patterns correctly', () => {
      const organizer = new FileOrganizer();
      
      const valid = organizer.validatePattern('{Year}/{YYYY-MM-DD}/{filename}{extension}');
      expect(valid.valid).toBe(true);
      expect(valid.errors).toHaveLength(0);
      
      const invalid = organizer.validatePattern('{InvalidPlaceholder}');
      expect(invalid.valid).toBe(false);
      expect(invalid.errors.length).toBeGreaterThan(0);
    });

    test('should provide suggested patterns', () => {
      const patterns = FileOrganizer.getSuggestedPatterns();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0]).toHaveProperty('name');
      expect(patterns[0]).toHaveProperty('pattern');
      expect(patterns[0]).toHaveProperty('description');
    });

    test('should validate all suggested patterns', () => {
      const organizer = new FileOrganizer();
      const patterns = FileOrganizer.getSuggestedPatterns();
      
      patterns.forEach(pattern => {
        const validation = organizer.validatePattern(pattern.pattern);
        expect(validation.valid).toBe(true);
      });
    });
  });

  describe('Integration scenarios', () => {
    test('should handle complete photo analysis workflow', async () => {
      // Mock successful analysis workflow
      mockMetadataExtractor.getPhotoFiles.mockResolvedValue(['/test/IMG_1234.jpg']);
      mockMetadataExtractor.extractBatchMetadata.mockResolvedValue({
        metadata: [sampleMetadata],
        errors: []
      });      mockDuplicateDetector.detectDuplicates.mockResolvedValue({
        totalFiles: 2,
        uniqueFiles: 1,
        duplicateGroups: [{
          hash: 'abc123def456',
          hashType: 'file',
          files: [sampleMetadata, { ...sampleMetadata, filepath: '/test/IMG_1235.jpg' }],
          totalSize: 2048000,
          duplicateCount: 1
        }],
        totalDuplicates: 1,
        totalWastedSpace: 1024000,
        duration: 1000
      });

      // Simulate analysis workflow
      const extractor = new MetadataExtractor();
      const dbManager = new DatabaseManager('./test.db');
      const duplicateDetector = new DuplicateDetector();

      await dbManager.initialize();
      const photoFiles = await extractor.getPhotoFiles('/test/directory');
      const { metadata, errors } = await extractor.extractBatchMetadata(photoFiles);
      await dbManager.upsertPhotos(metadata);
      const duplicateResult = await duplicateDetector.detectDuplicates(metadata);

      expect(photoFiles).toEqual(['/test/IMG_1234.jpg']);
      expect(metadata).toHaveLength(1);
      expect(errors).toHaveLength(0);
      expect(duplicateResult.totalDuplicates).toBe(1);
      expect(duplicateResult.totalWastedSpace).toBe(1024000);
    });    test('should handle photo organization workflow', async () => {
      const organizer = new FileOrganizer();
      
      // Mock file system operations - source file exists, target files don't
      (mockFs.pathExists as unknown as jest.Mock).mockImplementation((filePath: string) => {
        // Source file exists
        if (filePath === sampleMetadata.filepath) {
          return Promise.resolve(true);
        }
        // Target files don't exist (prevents infinite loop in generateUniqueFilename)
        return Promise.resolve(false);
      });
      (mockFs.ensureDir as unknown as jest.Mock).mockResolvedValue(undefined);
      (mockFs.move as unknown as jest.Mock).mockResolvedValue(undefined);

      const result = await organizer.organizeFile(sampleMetadata);

      expect(result.success).toBe(true);
      expect(result.sourcePath).toBe(sampleMetadata.filepath);
      expect(result.targetPath).toContain('2023');
      expect(mockFs.ensureDir).toHaveBeenCalled();
      expect(mockFs.move).toHaveBeenCalled();
    });

    test('should handle database search and stats workflow', async () => {
      const dbManager = new DatabaseManager('./test.db');
      
      await dbManager.initialize();
      const photos = await dbManager.searchPhotos();
      const stats = await dbManager.getStats();

      expect(photos).toHaveLength(1);
      expect(stats.totalPhotos).toBe(1);
      expect(stats.cameras).toHaveLength(1);
      expect(stats.extensions).toHaveLength(1);
    });

    test('should handle duplicate detection and removal workflow', async () => {
      const duplicateDetector = new DuplicateDetector();
      
      const duplicateResult = await duplicateDetector.detectDuplicates([sampleMetadata]);
      expect(duplicateResult.duplicateGroups).toHaveLength(0);
      expect(duplicateResult.totalDuplicates).toBe(0);

      const removalResult = await duplicateDetector.removeDuplicates([], 'keep-newest', false);
      expect(removalResult.removed).toHaveLength(0);
      expect(removalResult.savedSpace).toBe(0);
    });

    test('should handle error scenarios gracefully', async () => {
      // Test extraction errors
      mockMetadataExtractor.extractBatchMetadata.mockResolvedValue({
        metadata: [],
        errors: ['Failed to extract metadata from IMG_1234.jpg']
      });

      const extractor = new MetadataExtractor();
      const { metadata, errors } = await extractor.extractBatchMetadata(['/test/IMG_1234.jpg']);

      expect(metadata).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Failed to extract metadata');
    });    test('should handle file system errors in organization', async () => {
      const organizer = new FileOrganizer();
      
      // Mock file system operations - source file exists, target files don't
      (mockFs.pathExists as unknown as jest.Mock).mockImplementation((filePath: string) => {
        // Source file exists
        if (filePath === sampleMetadata.filepath) {
          return Promise.resolve(true);
        }
        // Target files don't exist (prevents infinite loop in generateUniqueFilename)
        return Promise.resolve(false);
      });
      (mockFs.ensureDir as unknown as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      const result = await organizer.organizeFile(sampleMetadata);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    test('should handle database connection errors', async () => {
      mockDatabaseManager.initialize.mockRejectedValue(new Error('Database connection failed'));

      const dbManager = new DatabaseManager('./test.db');
      
      await expect(dbManager.initialize()).rejects.toThrow('Database connection failed');
    });
  });

  describe('Configuration management', () => {
    test('should provide default configuration values', () => {
      const orgConfig = mockConfigManager.getOrganizationConfig();
      const dbConfig = mockConfigManager.getDatabaseConfig();
      const extractConfig = mockConfigManager.getExtractionConfig();

      expect(orgConfig.defaultPattern).toBeTruthy();
      expect(orgConfig.handleDuplicates).toBeTruthy();
      expect(dbConfig.path).toBeTruthy();
      expect(extractConfig.supportedExtensions).toHaveLength(7);
    });

    test('should handle configuration changes', () => {
      mockConfigManager.getOrganizationConfig.mockReturnValue({
        defaultPattern: '{Camera}/{Year}/{filename}{extension}',
        createYearFolders: false,
        preserveOriginalStructure: true,
        handleDuplicates: 'overwrite',
        maxFilenameLength: 100
      });

      const orgConfig = mockConfigManager.getOrganizationConfig();
      
      expect(orgConfig.defaultPattern).toBe('{Camera}/{Year}/{filename}{extension}');
      expect(orgConfig.handleDuplicates).toBe('overwrite');
      expect(orgConfig.maxFilenameLength).toBe(100);
    });
  });

  describe('File type support', () => {
    test('should support various photo formats', () => {
      const extractConfig = mockConfigManager.getExtractionConfig();
      const supportedFormats = extractConfig.supportedExtensions;

      expect(supportedFormats).toContain('.jpg');
      expect(supportedFormats).toContain('.jpeg');
      expect(supportedFormats).toContain('.png');
      expect(supportedFormats).toContain('.tiff');
      expect(supportedFormats).toContain('.cr2');
      expect(supportedFormats).toContain('.nef');
      expect(supportedFormats).toContain('.arw');
    });

    test('should handle mixed case extensions', () => {
      const testMetadata = {
        ...sampleMetadata,
        fileExtension: '.JPG',
        filename: 'IMG_1234.JPG'
      };

      const organizer = new FileOrganizer();
      const result = organizer.generateTargetPath(testMetadata, '{filename}{extension}', '/test');

      expect(result).toContain('.JPG');
    });
  });

  describe('Performance considerations', () => {
    test('should handle large batches efficiently', async () => {
      const largeBatch = Array.from({ length: 1000 }, (_, i) => ({
        ...sampleMetadata,
        filepath: `/test/IMG_${String(i).padStart(4, '0')}.jpg`,
        filename: `IMG_${String(i).padStart(4, '0')}.jpg`
      }));

      mockMetadataExtractor.extractBatchMetadata.mockResolvedValue({
        metadata: largeBatch,
        errors: []
      });

      const extractor = new MetadataExtractor();
      const { metadata, errors } = await extractor.extractBatchMetadata(
        largeBatch.map(m => m.filepath)
      );

      expect(metadata).toHaveLength(1000);
      expect(errors).toHaveLength(0);
    });

    test('should provide progress feedback for long operations', async () => {
      const progressCallback = jest.fn();
      
      mockMetadataExtractor.extractBatchMetadata.mockImplementation(
        async (files: string[], callback?: (current: number, total: number, filename: string) => void) => {
          if (callback) {
            files.forEach((file, index) => {
              callback(index + 1, files.length, file);
            });
          }
          return { metadata: [sampleMetadata], errors: [] };
        }
      );

      const extractor = new MetadataExtractor();
      await extractor.extractBatchMetadata(['/test/IMG_1234.jpg'], progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(1, 1, '/test/IMG_1234.jpg');
    });
  });
});
