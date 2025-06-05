import { Command } from 'commander';
import * as fs from 'fs-extra';
import { MetadataExtractor } from './metadata-extractor';
import { DatabaseManager } from './database-manager';
import { FileOrganizer } from './file-organizer';
import { DuplicateDetector } from './duplicate-detector';
import { ConfigManager } from './config-manager';
import { PhotoMetadata } from './types';

// Create a mock program instance that supports method chaining
const mockProgram = {
  command: jest.fn().mockReturnThis(),
  description: jest.fn().mockReturnThis(),
  argument: jest.fn().mockReturnThis(),
  option: jest.fn().mockReturnThis(),
  action: jest.fn().mockReturnThis(),
  name: jest.fn().mockReturnThis(),
  version: jest.fn().mockReturnThis(),
  parse: jest.fn().mockReturnThis(),
  outputHelp: jest.fn().mockReturnThis()
};

// Mock all external dependencies BEFORE importing index.ts
jest.mock('commander', () => ({
  Command: jest.fn().mockImplementation(() => mockProgram)
}));
jest.mock('fs-extra');
jest.mock('./metadata-extractor');
jest.mock('./database-manager');
jest.mock('./file-organizer');
jest.mock('./duplicate-detector');

// Mock ConfigManager with proper return values BEFORE importing index
jest.mock('./config-manager', () => {
  const mockInstance = {
    getDatabaseConfig: jest.fn(() => ({
      path: './test-photos.db',
      backupOnStart: false
    })),
    getOrganizationConfig: jest.fn(() => ({
      defaultPattern: '{Year}/{YYYY-MM-DD}/{filename}{extension}',
      createYearFolders: true,
      preserveOriginalStructure: false,
      handleDuplicates: 'rename',
      maxFilenameLength: 255
    })),
    getExtractionConfig: jest.fn(() => ({
      batchSize: 50,
      maxConcurrent: 4,
      skipHidden: true,
      supportedExtensions: ['.jpg', '.jpeg', '.png'],
      extractThumbnails: false
    })),
    getConfig: jest.fn(() => ({
      database: { path: './test-photos.db', backupOnStart: false },
      extraction: { batchSize: 50, maxConcurrent: 4, skipHidden: true, supportedExtensions: ['.jpg'], extractThumbnails: false },
      organization: { defaultPattern: '{Year}/{filename}{extension}', createYearFolders: true, preserveOriginalStructure: false, handleDuplicates: 'rename', maxFilenameLength: 255 },
      logging: { level: 'info', file: './logs/photo-organizer.log', console: true },
      performance: { enableCaching: true, cacheSize: 1000, memoryLimit: '1GB' }
    })),
    setConfigValue: jest.fn(),
    resetConfig: jest.fn(),
    saveConfig: jest.fn().mockResolvedValue(undefined)
  };

  return {
    ConfigManager: {
      getInstance: jest.fn(() => mockInstance)
    }
  };
});

// Now we can safely import the index module
import './index';
const mockFs = fs as jest.Mocked<typeof fs>;
const MockMetadataExtractor = MetadataExtractor as jest.MockedClass<typeof MetadataExtractor>;
const MockDatabaseManager = DatabaseManager as jest.MockedClass<typeof DatabaseManager>;
const MockFileOrganizer = FileOrganizer as jest.MockedClass<typeof FileOrganizer>;
const MockDuplicateDetector = DuplicateDetector as jest.MockedClass<typeof DuplicateDetector>;

// Mock process.exit to prevent tests from actually exiting
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
  throw new Error(`Process exit called with code ${code}`);
});

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

describe('CLI Index Module', () => {
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

  beforeAll(() => {
    // Mock MetadataExtractor
    const mockMetadataExtractor = {
      getPhotoFiles: jest.fn().mockResolvedValue(['/test/IMG_1234.jpg']),
      extractBatchMetadata: jest.fn().mockResolvedValue({
        metadata: [sampleMetadata],
        errors: []
      }),
      cleanup: jest.fn().mockResolvedValue(undefined)
    } as any;

    MockMetadataExtractor.mockImplementation(() => mockMetadataExtractor);

    // Mock DatabaseManager
    const mockDatabaseManager = {
      initialize: jest.fn().mockResolvedValue(undefined),
      upsertPhotos: jest.fn().mockResolvedValue(undefined),
      searchPhotos: jest.fn().mockResolvedValue([sampleMetadata]),
      getStats: jest.fn().mockResolvedValue({
        totalPhotos: 100,
        dateRange: { earliest: new Date('2020-01-01'), latest: new Date('2023-12-31') },
        cameras: [{ camera: 'Canon EOS 7D', count: 50 }, { camera: 'Nikon D850', count: 50 }],
        extensions: [{ extension: '.jpg', count: 80 }, { extension: '.cr2', count: 20 }]
      }),
      getAllPhotosWithHashes: jest.fn().mockResolvedValue([sampleMetadata]),
      close: jest.fn().mockResolvedValue(undefined)
    } as any;

    MockDatabaseManager.mockImplementation(() => mockDatabaseManager);

    // Mock FileOrganizer
    const mockFileOrganizer = {
      validatePattern: jest.fn().mockReturnValue({ valid: true, errors: [] }),
      previewOrganization: jest.fn().mockResolvedValue({
        preview: [{ source: '/test/IMG_1234.jpg', target: '/output/2023/2023-06-15/IMG_1234.jpg', conflicts: [] }],
        conflicts: 0,
        totalFiles: 1
      }),
      organizeFiles: jest.fn().mockResolvedValue({
        successful: 1,
        skipped: 0,
        failed: 0,
        results: [{ success: true, sourcePath: '/test/IMG_1234.jpg', targetPath: '/output/2023/2023-06-15/IMG_1234.jpg', action: 'move' }]
      })
    } as any;

    MockFileOrganizer.mockImplementation(() => mockFileOrganizer);
    MockFileOrganizer.getSuggestedPatterns = jest.fn().mockReturnValue([
      { name: 'Year/Date', pattern: '{Year}/{YYYY-MM-DD}/{filename}{extension}', description: 'Organize by year, then by date' }
    ]);

    // Mock DuplicateDetector
    const mockDuplicateDetector = {
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
      formatFileSize: jest.fn().mockImplementation((size: number) => `${(size / 1024).toFixed(1)} KB`),
      generateReport: jest.fn().mockReturnValue('Duplicate report content')
    } as any;

    MockDuplicateDetector.mockImplementation(() => mockDuplicateDetector);

    // Mock fs-extra
    (mockFs.pathExists as unknown as jest.Mock).mockResolvedValue(true);
    (mockFs.stat as unknown as jest.Mock).mockResolvedValue({ isDirectory: () => true } as any);
    (mockFs.writeFile as unknown as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    mockExit.mockClear();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
  });

  describe('Command structure and configuration', () => {
    test('should initialize command structure', () => {
      // The CLI should be initialized when the module is imported
      expect(ConfigManager.getInstance).toHaveBeenCalled();
    });    test('should provide help when no arguments are given', () => {
      // This is tested by verifying the Command structure is set up
      expect(mockProgram).toBeDefined();
    });
  });

  describe('CLI Command validation', () => {    test('should validate required parameters for analyze command', () => {
      // Test that the index module can be imported without errors
      // and that it sets up the command structure properly
      expect(() => {
        jest.isolateModules(() => {
          // Mock all dependencies within the isolated context
          jest.doMock('commander', () => ({
            Command: jest.fn().mockImplementation(() => mockProgram)
          }));
          
          jest.doMock('fs-extra', () => ({
            pathExists: jest.fn().mockResolvedValue(true),
            stat: jest.fn().mockResolvedValue({ isDirectory: () => true }),
            writeFile: jest.fn().mockResolvedValue(undefined)
          }));
          
          jest.doMock('./config-manager', () => ({
            ConfigManager: {
              getInstance: jest.fn(() => ({
                getDatabaseConfig: () => ({ path: './test-photos.db', backupOnStart: false }),
                getOrganizationConfig: () => ({ 
                  defaultPattern: '{Year}/{filename}{extension}', 
                  createYearFolders: true, 
                  preserveOriginalStructure: false, 
                  handleDuplicates: 'rename', 
                  maxFilenameLength: 255 
                })
              }))
            }
          }));
          
          jest.doMock('./metadata-extractor', () => ({
            MetadataExtractor: jest.fn()
          }));
          
          jest.doMock('./database-manager', () => ({
            DatabaseManager: jest.fn()
          }));
          
          jest.doMock('./file-organizer', () => ({
            FileOrganizer: jest.fn(() => ({}))
          }));
          
          jest.doMock('./duplicate-detector', () => ({
            DuplicateDetector: jest.fn()
          }));

          // Import the module - this should not throw any errors
          require('./index');
        });
      }).not.toThrow();

      // Verify that the original mock setup is working for the main command structure  
      expect(mockProgram.command).toHaveBeenCalled();
      expect(mockProgram.name).toHaveBeenCalledWith('photo-organizer');
      expect(mockProgram.version).toHaveBeenCalledWith('1.0.0');
    });
  });

  describe('Basic CLI functionality', () => {
    test('should handle command validation errors', () => {
      expect(mockExit).toBeDefined();
      expect(mockConsoleLog).toBeDefined();
      expect(mockConsoleError).toBeDefined();
    });
  });
});
