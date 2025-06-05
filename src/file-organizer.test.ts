import { FileOrganizer } from './file-organizer';
import { PhotoMetadata } from './types';
import { ConfigManager } from './config-manager';
import * as fs from 'fs-extra';
import * as path from 'path';

// Mock dependencies
jest.mock('fs-extra');
jest.mock('./config-manager');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('FileOrganizer', () => {
  let fileOrganizer: FileOrganizer;
  let mockConfigManager: jest.Mocked<ConfigManager>;

  const sampleMetadata: PhotoMetadata = {
    filepath: '/test/source/IMG_1234.jpg',
    filename: 'IMG_1234.jpg',
    fileSize: 1024000,
    fileExtension: '.jpg',
    dateModified: new Date('2023-06-15T10:30:00Z'),
    dateTimeOriginal: new Date('2023-06-15T10:30:00Z'),
    camera: 'Canon EOS 7D',
    make: 'Canon',
    model: 'EOS 7D',
    iso: 400,
    focalLength: 50,
    aperture: 2.8,
    rating: 4,
    artist: 'John Doe',
    imageWidth: 4000,
    imageHeight: 3000,
    megapixels: 12.0
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock ConfigManager singleton
    mockConfigManager = {
      getOrganizationConfig: jest.fn().mockReturnValue({
        defaultPattern: '{Year}/{YYYY-MM-DD}/{filename}{extension}',
        createYearFolders: true,
        preserveOriginalStructure: false,
        handleDuplicates: 'rename',
        maxFilenameLength: 255
      })
    } as any;

    (ConfigManager.getInstance as jest.Mock).mockReturnValue(mockConfigManager);
    
    fileOrganizer = new FileOrganizer();
  });

  describe('PATTERN_PLACEHOLDERS', () => {
    test('should have all expected placeholders', () => {
      const placeholders = FileOrganizer.PATTERN_PLACEHOLDERS;
      
      expect(placeholders).toHaveProperty('{Year}');
      expect(placeholders).toHaveProperty('{Month}');
      expect(placeholders).toHaveProperty('{Day}');
      expect(placeholders).toHaveProperty('{YYYY}');
      expect(placeholders).toHaveProperty('{MM}');
      expect(placeholders).toHaveProperty('{DD}');
      expect(placeholders).toHaveProperty('{YYYY-MM-DD}');
      expect(placeholders).toHaveProperty('{Camera}');
      expect(placeholders).toHaveProperty('{Make}');
      expect(placeholders).toHaveProperty('{Model}');
      expect(placeholders).toHaveProperty('{filename}');
      expect(placeholders).toHaveProperty('{extension}');
      expect(placeholders).toHaveProperty('{ISO}');
      expect(placeholders).toHaveProperty('{FocalLength}');
      expect(placeholders).toHaveProperty('{Aperture}');
      expect(placeholders).toHaveProperty('{Rating}');
      expect(placeholders).toHaveProperty('{Artist}');
    });
  });

  describe('generateTargetPath', () => {
    test('should generate path with date placeholders', () => {
      const pattern = '{Year}/{YYYY-MM-DD}/{filename}{extension}';
      const outputDir = '/test/output';
      
      const result = fileOrganizer.generateTargetPath(sampleMetadata, pattern, outputDir);
      
      expect(result).toBe(path.normalize('/test/output/2023/2023-06-15/IMG_1234.jpg'));
    });    test('should handle metadata without dates', () => {
      // Create a metadata object that simulates missing dates by using undefined
      const metadataWithoutDate: any = {
        ...sampleMetadata, 
        dateTimeOriginal: undefined, 
        dateModified: undefined
      };
      const pattern = '{Year}/{YYYY-MM-DD}/{filename}{extension}';
      const outputDir = '/test/output';
      
      const result = fileOrganizer.generateTargetPath(metadataWithoutDate, pattern, outputDir);
      
      expect(result).toBe(path.normalize('/test/output/Unknown/Unknown/IMG_1234.jpg'));
    });

    test('should use dateModified when dateTimeOriginal is missing', () => {
      const metadataWithoutOriginal = { ...sampleMetadata, dateTimeOriginal: undefined } as PhotoMetadata;
      const pattern = '{Year}/{filename}{extension}';
      const outputDir = '/test/output';
      
      const result = fileOrganizer.generateTargetPath(metadataWithoutOriginal, pattern, outputDir);
      
      expect(result).toBe(path.normalize('/test/output/2023/IMG_1234.jpg'));
    });
  });
  describe('organizeFile', () => {
    beforeEach(() => {
      // Mock fs.pathExists to return false for non-existent files
      // but true for the source file (so it exists for the test)
      (mockFs.pathExists as unknown as jest.Mock).mockImplementation((filePath: string) => {
        // Source file exists
        if (filePath === sampleMetadata.filepath) {
          return Promise.resolve(true);
        }
        // Target files don't exist (prevents infinite loop in generateUniqueFilename)
        return Promise.resolve(false);
      });
      (mockFs.ensureDir as unknown as jest.Mock).mockResolvedValue(undefined);
      (mockFs.copy as unknown as jest.Mock).mockResolvedValue(undefined);
      (mockFs.move as unknown as jest.Mock).mockResolvedValue(undefined);
    });

    test('should successfully move a file', async () => {
      const result = await fileOrganizer.organizeFile(sampleMetadata);
      
      expect(result.success).toBe(true);
      expect(result.action).toBe('move');
      expect(result.sourcePath).toBe(sampleMetadata.filepath);
      expect(mockFs.move).toHaveBeenCalled();
    });

    test('should handle missing source file', async () => {
      (mockFs.pathExists as unknown as jest.Mock).mockResolvedValueOnce(false);
      
      const result = await fileOrganizer.organizeFile(sampleMetadata);
      
      expect(result.success).toBe(false);
      expect(result.action).toBe('skip');
      expect(result.error).toContain('Source file does not exist');
    });

    test('should handle file operation errors', async () => {
      (mockFs.move as unknown as jest.Mock).mockRejectedValue(new Error('Permission denied'));
      
      const result = await fileOrganizer.organizeFile(sampleMetadata);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });
  });

  describe('organizeFiles', () => {
    const multipleMetadata = [
      sampleMetadata,
      { ...sampleMetadata, filepath: '/test/source/IMG_1235.jpg', filename: 'IMG_1235.jpg' },
      { ...sampleMetadata, filepath: '/test/source/IMG_1236.jpg', filename: 'IMG_1236.jpg' }
    ];    beforeEach(() => {
      // Mock fs.pathExists to return true for source files, false for targets
      (mockFs.pathExists as unknown as jest.Mock).mockImplementation((filePath: string) => {
        // Source files exist
        if (multipleMetadata.some(meta => meta.filepath === filePath)) {
          return Promise.resolve(true);
        }
        // Target files don't exist (prevents infinite loop)
        return Promise.resolve(false);
      });
      (mockFs.ensureDir as unknown as jest.Mock).mockResolvedValue(undefined);
      (mockFs.move as unknown as jest.Mock).mockResolvedValue(undefined);
    });

    test('should organize multiple files successfully', async () => {
      const result = await fileOrganizer.organizeFiles(multipleMetadata);
      
      expect(result.successful).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(3);
    });
  });
});
