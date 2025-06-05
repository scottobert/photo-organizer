import * as path from 'path';
import * as fs from 'fs-extra';
import { MetadataExtractor } from './metadata-extractor';
import { DatabaseManager } from './database-manager';
import { FileOrganizer } from './file-organizer';
import { ConfigManager } from './config-manager';
import { PhotoMetadata } from './types';
import { demonstratePhotoOrganizer } from './example';

// Mock dependencies
jest.mock('fs-extra');
jest.mock('./metadata-extractor');
jest.mock('./database-manager');
jest.mock('./file-organizer');
jest.mock('./config-manager');

const mockFs = fs as jest.Mocked<typeof fs>;
const MockMetadataExtractor = MetadataExtractor as jest.MockedClass<typeof MetadataExtractor>;
const MockDatabaseManager = DatabaseManager as jest.MockedClass<typeof DatabaseManager>;
const MockFileOrganizer = FileOrganizer as jest.MockedClass<typeof FileOrganizer>;

// Mock console methods to prevent noise during tests
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

// Mock process.exit to prevent tests from actually exiting
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
  throw new Error(`Process exit called with code ${code}`);
});

describe('Example Script', () => {
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockMetadataExtractor: jest.Mocked<MetadataExtractor>;
  let mockDatabaseManager: jest.Mocked<DatabaseManager>;
  let mockFileOrganizer: jest.Mocked<FileOrganizer>;
  let demonstratePhotoOrganizer: () => Promise<void>;
  const sampleMetadata: PhotoMetadata = {
    filepath: '/example/IMG_1234.jpg',
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

  beforeAll(async () => {
    // Import the demonstration function after mocking
    const exampleModule = await import('./example');
    demonstratePhotoOrganizer = (exampleModule as any).demonstratePhotoOrganizer;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ConfigManager
    mockConfigManager = {
      getConfig: jest.fn().mockReturnValue({
        database: { path: './example-photos.db', backupOnStart: false },
        extraction: { batchSize: 50, maxConcurrent: 4, skipHidden: true, supportedExtensions: ['.jpg', '.cr2'], extractThumbnails: false },
        organization: { 
          defaultPattern: '{Year}/{YYYY-MM-DD}/{filename}{extension}',
          createYearFolders: true,
          preserveOriginalStructure: false,
          handleDuplicates: 'rename',
          maxFilenameLength: 255
        },
        logging: { level: 'info', file: './logs/photo-organizer.log', console: true },
        performance: { enableCaching: true, cacheSize: 1000, memoryLimit: '1GB' }
      })
    } as any;

    (ConfigManager.getInstance as jest.Mock).mockReturnValue(mockConfigManager);

    // Mock MetadataExtractor
    mockMetadataExtractor = {
      getPhotoFiles: jest.fn().mockResolvedValue(['/example/IMG_1234.jpg']),
      extractBatchMetadata: jest.fn().mockResolvedValue({
        metadata: [sampleMetadata],
        errors: []
      }),
      cleanup: jest.fn().mockResolvedValue(undefined)
    } as any;

    MockMetadataExtractor.mockImplementation(() => mockMetadataExtractor);

    // Mock DatabaseManager
    mockDatabaseManager = {
      initialize: jest.fn().mockResolvedValue(undefined),
      upsertPhotos: jest.fn().mockResolvedValue(undefined),
      getStats: jest.fn().mockResolvedValue({
        totalPhotos: 1,
        dateRange: { earliest: new Date('2023-01-01'), latest: new Date('2023-12-31') },
        cameras: [{ camera: 'Canon EOS 7D', count: 1 }],
        extensions: [{ extension: '.jpg', count: 1 }]
      }),
      searchPhotos: jest.fn().mockImplementation((filters?: any) => {
        if (!filters) return Promise.resolve([sampleMetadata]);
        if (filters.dateFrom) return Promise.resolve([]); // No recent photos
        if (filters.hasGPS) return Promise.resolve([]); // No GPS photos
        return Promise.resolve([sampleMetadata]);
      }),
      close: jest.fn().mockResolvedValue(undefined)
    } as any;

    MockDatabaseManager.mockImplementation(() => mockDatabaseManager);

    // Mock FileOrganizer
    mockFileOrganizer = {
      previewOrganization: jest.fn().mockResolvedValue({
        preview: [{ 
          source: '/example/IMG_1234.jpg', 
          target: '/output/2023/2023-06-15/IMG_1234.jpg', 
          conflicts: [] 
        }],
        conflicts: 0,
        totalFiles: 1
      })
    } as any;

    MockFileOrganizer.mockImplementation(() => mockFileOrganizer);    // Mock fs-extra
    (mockFs.pathExists as unknown as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockExit.mockClear();
  });

  describe('demonstratePhotoOrganizer', () => {
    test('should complete demonstration successfully with photos', async () => {
      await demonstratePhotoOrganizer();      // Verify configuration was loaded
      expect(ConfigManager.getInstance).toHaveBeenCalled();
      expect(mockConfigManager.getConfig).toHaveBeenCalled();

      // Verify components were initialized
      expect(MockMetadataExtractor).toHaveBeenCalled();
      expect(MockDatabaseManager).toHaveBeenCalled();
      expect(MockFileOrganizer).toHaveBeenCalled();
      expect(mockDatabaseManager.initialize).toHaveBeenCalled();

      // Verify photos were analyzed
      expect(mockMetadataExtractor.getPhotoFiles).toHaveBeenCalled();
      expect(mockMetadataExtractor.extractBatchMetadata).toHaveBeenCalled();
      expect(mockDatabaseManager.upsertPhotos).toHaveBeenCalledWith([sampleMetadata]);

      // Verify statistics were retrieved
      expect(mockDatabaseManager.getStats).toHaveBeenCalled();

      // Verify organization patterns were tested
      expect(mockFileOrganizer.previewOrganization).toHaveBeenCalledTimes(3); // Default + 2 additional patterns

      // Verify search functionality was tested
      expect(mockDatabaseManager.searchPhotos).toHaveBeenCalledTimes(3); // All, recent, GPS

      // Verify cleanup was called
      expect(mockMetadataExtractor.cleanup).toHaveBeenCalled();
      expect(mockDatabaseManager.close).toHaveBeenCalled();

      // Verify console output
      expect(mockConsoleLog).toHaveBeenCalledWith('🏁 Photo Organizer Demonstration\n');
      expect(mockConsoleLog).toHaveBeenCalledWith('\n✅ Demonstration complete!');
    });    test('should handle missing example photos directory', async () => {
      (mockFs.pathExists as unknown as jest.Mock).mockResolvedValueOnce(false);

      await demonstratePhotoOrganizer();      // Should still initialize components
      expect(ConfigManager.getInstance).toHaveBeenCalled();
      expect(MockDatabaseManager).toHaveBeenCalled();
      expect(mockDatabaseManager.initialize).toHaveBeenCalled();

      // Should not analyze photos
      expect(mockMetadataExtractor.getPhotoFiles).not.toHaveBeenCalled();
      expect(mockMetadataExtractor.extractBatchMetadata).not.toHaveBeenCalled();
      expect(mockDatabaseManager.upsertPhotos).not.toHaveBeenCalled();

      // Should still cleanup
      expect(mockMetadataExtractor.cleanup).toHaveBeenCalled();
      expect(mockDatabaseManager.close).toHaveBeenCalled();

      // Should show CLI usage examples
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Example CLI usage:'));
    });

    test('should handle no photos found in directory', async () => {
      mockMetadataExtractor.getPhotoFiles.mockResolvedValueOnce([]);

      await demonstratePhotoOrganizer();

      expect(mockMetadataExtractor.getPhotoFiles).toHaveBeenCalled();
      expect(mockMetadataExtractor.extractBatchMetadata).not.toHaveBeenCalled();
      expect(mockDatabaseManager.upsertPhotos).not.toHaveBeenCalled();
      expect(mockFileOrganizer.previewOrganization).not.toHaveBeenCalled();
      expect(mockDatabaseManager.searchPhotos).not.toHaveBeenCalled();

      expect(mockConsoleLog).toHaveBeenCalledWith('No photos found to analyze');
    });

    test('should handle metadata extraction errors', async () => {
      mockMetadataExtractor.extractBatchMetadata.mockResolvedValueOnce({
        metadata: [sampleMetadata],
        errors: ['Failed to extract metadata from IMG_9999.jpg']
      });

      await demonstratePhotoOrganizer();

      expect(mockMetadataExtractor.extractBatchMetadata).toHaveBeenCalled();
      expect(mockDatabaseManager.upsertPhotos).toHaveBeenCalledWith([sampleMetadata]);
      expect(mockConsoleLog).toHaveBeenCalledWith('⚠️  1 files had extraction errors');
    });

    test('should handle organization conflicts', async () => {
      mockFileOrganizer.previewOrganization.mockResolvedValue({
        preview: [
          { 
            source: '/example/IMG_1234.jpg', 
            target: '/output/2023/2023-06-15/IMG_1234.jpg', 
            conflicts: ['/example/IMG_1235.jpg'] 
          }
        ],
        conflicts: 1,
        totalFiles: 1
      });

      await demonstratePhotoOrganizer();

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('1 naming conflicts detected'));
    });

    test('should demonstrate different organization patterns', async () => {
      await demonstratePhotoOrganizer();

      // Should test default config pattern plus additional patterns
      expect(mockFileOrganizer.previewOrganization).toHaveBeenCalledWith([sampleMetadata]); // Default config
      expect(mockFileOrganizer.previewOrganization).toHaveBeenCalledWith(
        [sampleMetadata], 
        '{Camera}/{Year}/{filename}{extension}', 
        expect.any(String)
      );
      expect(mockFileOrganizer.previewOrganization).toHaveBeenCalledWith(
        [sampleMetadata], 
        '{Make}/{Model}/{YYYY-MM-DD}/{filename}{extension}', 
        expect.any(String)
      );
    });

    test('should demonstrate search functionality', async () => {
      await demonstratePhotoOrganizer();

      // Should search all photos
      expect(mockDatabaseManager.searchPhotos).toHaveBeenCalledWith();

      // Should search recent photos (last 30 days)
      expect(mockDatabaseManager.searchPhotos).toHaveBeenCalledWith({
        dateFrom: expect.any(Date)
      });

      // Should search GPS photos
      expect(mockDatabaseManager.searchPhotos).toHaveBeenCalledWith({
        hasGPS: true
      });

      expect(mockConsoleLog).toHaveBeenCalledWith('Total photos in database: 1');
      expect(mockConsoleLog).toHaveBeenCalledWith('Photos from last 30 days: 0');
      expect(mockConsoleLog).toHaveBeenCalledWith('Photos with GPS data: 0');
    });

    test('should show configuration details', async () => {
      await demonstratePhotoOrganizer();

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Current config pattern: {Year}/{YYYY-MM-DD}/{filename}{extension}'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Duplicate handling: rename'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Max filename length: 255'));
    });

    test('should handle errors gracefully', async () => {
      const testError = new Error('Test error');
      mockDatabaseManager.initialize.mockRejectedValueOnce(testError);

      await expect(demonstratePhotoOrganizer()).rejects.toThrow('Process exit called with code 1');

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Error during demonstration:', testError);
    });

    test('should handle cleanup errors', async () => {
      const cleanupError = new Error('Cleanup failed');
      mockDatabaseManager.close.mockRejectedValueOnce(cleanupError);

      // The demonstration should complete but log cleanup error
      await demonstratePhotoOrganizer();

      expect(mockConsoleError).toHaveBeenCalledWith('Cleanup error:', cleanupError);
    });
  });

  describe('Example patterns and outputs', () => {
    test('should show preview examples for each pattern', async () => {
      await demonstratePhotoOrganizer();

      // Verify that pattern examples are shown
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('IMG_1234.jpg →'));
    });

    test('should show statistics from database', async () => {
      await demonstratePhotoOrganizer();

      expect(mockConsoleLog).toHaveBeenCalledWith('Total photos: 1');
      expect(mockConsoleLog).toHaveBeenCalledWith('Cameras found:');
      expect(mockConsoleLog).toHaveBeenCalledWith('  • Canon EOS 7D: 1 photos');
    });

    test('should handle empty camera statistics', async () => {
      mockDatabaseManager.getStats.mockResolvedValueOnce({
        totalPhotos: 1,
        dateRange: { earliest: new Date('2023-01-01'), latest: new Date('2023-12-31') },
        cameras: [],
        extensions: [{ extension: '.jpg', count: 1 }]
      });

      await demonstratePhotoOrganizer();

      expect(mockConsoleLog).toHaveBeenCalledWith('Total photos: 1');
      expect(mockConsoleLog).not.toHaveBeenCalledWith('Cameras found:');
    });  });

  describe('Module execution', () => {
    test('should not throw when module is imported', () => {
      // Since we can't easily mock require.main, we'll just verify the module can be imported without errors
      expect(() => require('./example')).not.toThrow();
    });

    test('should export demonstratePhotoOrganizer function', () => {
      const example = require('./example');
      expect(typeof example.demonstratePhotoOrganizer).toBe('function');
    });
  });

  describe('Error scenarios', () => {test('should handle file system errors', async () => {
      (mockFs.pathExists as unknown as jest.Mock).mockRejectedValueOnce(new Error('File system error'));

      await expect(demonstratePhotoOrganizer()).rejects.toThrow('Process exit called with code 1');
    });

    test('should handle metadata extraction failures', async () => {
      mockMetadataExtractor.extractBatchMetadata.mockRejectedValueOnce(new Error('Extraction failed'));

      await expect(demonstratePhotoOrganizer()).rejects.toThrow('Process exit called with code 1');
    });

    test('should handle database operation failures', async () => {
      mockDatabaseManager.upsertPhotos.mockRejectedValueOnce(new Error('Database error'));

      await expect(demonstratePhotoOrganizer()).rejects.toThrow('Process exit called with code 1');
    });

    test('should handle organization preview failures', async () => {
      mockFileOrganizer.previewOrganization.mockRejectedValueOnce(new Error('Preview failed'));

      await expect(demonstratePhotoOrganizer()).rejects.toThrow('Process exit called with code 1');
    });

    test('should handle search failures', async () => {
      mockDatabaseManager.searchPhotos.mockRejectedValueOnce(new Error('Search failed'));

      await expect(demonstratePhotoOrganizer()).rejects.toThrow('Process exit called with code 1');
    });
  });
});
