import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { MetadataExtractor } from './metadata-extractor';
import { PhotoMetadata } from './types';
import { ConfigManager } from './config-manager';

// Import exiftool to get the mocked instance
import { exiftool } from 'exiftool-vendored';

// Mock dependencies
jest.mock('fs-extra');
jest.mock('./config-manager');
jest.mock('exiftool-vendored', () => ({
  exiftool: {
    read: jest.fn(),
    end: jest.fn()
  }
}));

const mockFs = fs as jest.Mocked<typeof fs>;

// Mock ConfigManager singleton
const mockConfigManagerInstance = {
  getExtractionConfig: jest.fn().mockReturnValue({
    supportedExtensions: ['.jpg', '.jpeg', '.png', '.cr2', '.nef'],
    skipHidden: true,
    batchSize: 10,
    maxConcurrent: 3,
    extractThumbnails: false
  })
};

(ConfigManager.getInstance as jest.Mock).mockReturnValue(mockConfigManagerInstance);

// Get reference to the mocked exiftool
const mockExiftool = exiftool as jest.Mocked<typeof exiftool>;

describe('MetadataExtractor', () => {
  let extractor: MetadataExtractor;  const mockExifData: any = {
    DateTimeOriginal: '2025:01:15 14:30:00',
    CreateDate: '2025:01:15 14:30:00',
    Make: 'Canon',
    Model: 'EOS 7D',
    LensModel: 'EF 24-70mm f/2.8L USM',
    FocalLength: 50,
    FocalLengthIn35mmFormat: 50,
    FNumber: 2.8,
    ShutterSpeedValue: '1/125',
    ExposureTime: '1/125',
    ISO: 100,
    Flash: 'Off',
    WhiteBalance: 'Auto',
    ExposureMode: 'Manual',
    MeteringMode: 'Pattern',
    ImageWidth: 5184,
    ImageHeight: 3456,
    ExifImageWidth: 5184,
    ExifImageHeight: 3456,
    Orientation: 1,
    ColorSpace: 'sRGB',
    GPSLatitude: 40.7128,
    GPSLongitude: -74.0060,    GPSAltitude: 10,
    GPSImgDirection: 180,
    Software: 'Adobe Lightroom',
    Artist: 'Test Photographer',
    Copyright: '2025 Test',
    Keywords: ['landscape', 'nature'],
    Subject: ['landscape', 'nature'],
    Rating: 5
  };

  const mockStats = {
    size: 1024000,
    mtime: new Date('2025-01-15T14:30:00Z'),
    isDirectory: () => false,
    isFile: () => true
  };
  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigManagerInstance.getExtractionConfig.mockReturnValue({
      supportedExtensions: ['.jpg', '.jpeg', '.png', '.cr2', '.nef'],
      skipHidden: true,
      batchSize: 10,
      maxConcurrent: 3,
      extractThumbnails: false
    });

    extractor = new MetadataExtractor();
  });

  describe('isSupportedFile', () => {
    it('should return true for supported extensions', () => {
      expect(extractor.isSupportedFile('photo.jpg')).toBe(true);
      expect(extractor.isSupportedFile('photo.jpeg')).toBe(true);
      expect(extractor.isSupportedFile('photo.png')).toBe(true);
      expect(extractor.isSupportedFile('photo.CR2')).toBe(true); // Case insensitive
    });

    it('should return false for unsupported extensions', () => {
      expect(extractor.isSupportedFile('document.txt')).toBe(false);
      expect(extractor.isSupportedFile('video.mp4')).toBe(false);
      expect(extractor.isSupportedFile('photo')).toBe(false); // No extension
    });

    it('should handle files without extensions', () => {
      expect(extractor.isSupportedFile('/path/to/file')).toBe(false);
    });
  });
  describe('getPhotoFiles', () => {
    const mockDirEntries = [
      { name: 'photo1.jpg', isDirectory: () => false, isFile: () => true },
      { name: 'photo2.png', isDirectory: () => false, isFile: () => true },
      { name: 'document.txt', isDirectory: () => false, isFile: () => true },
      { name: '.hidden.jpg', isDirectory: () => false, isFile: () => true },
      { name: 'subfolder', isDirectory: () => true, isFile: () => false }
    ];

    const mockDirEntriesNoSubdirs = [
      { name: 'photo1.jpg', isDirectory: () => false, isFile: () => true },
      { name: 'photo2.png', isDirectory: () => false, isFile: () => true },
      { name: 'document.txt', isDirectory: () => false, isFile: () => true },
      { name: '.hidden.jpg', isDirectory: () => false, isFile: () => true }
    ];

    beforeEach(() => {
      // Default mock without subdirectories to prevent infinite loops
      (mockFs.readdir as unknown as jest.Mock).mockResolvedValue(mockDirEntriesNoSubdirs);
    });    it('should find supported photo files', async () => {
      const files = await extractor.getPhotoFiles('/test/path');

      expect(files).toEqual([
        '/test/path/photo1.jpg'.replace(/\//g, path.sep),
        '/test/path/photo2.png'.replace(/\//g, path.sep)
      ]);
    });

    it('should skip hidden files when configured', async () => {
      const files = await extractor.getPhotoFiles('/test/path');

      expect(files).not.toContain('/test/path/.hidden.jpg');
    });    it('should include hidden files when configured', async () => {
      mockConfigManagerInstance.getExtractionConfig.mockReturnValue({
        ...mockConfigManagerInstance.getExtractionConfig(),
        skipHidden: false
      });

      const files = await extractor.getPhotoFiles('/test/path');

      expect(files).toContain('/test/path/.hidden.jpg'.replace(/\//g, path.sep));
    });    it('should recursively scan subdirectories', async () => {      // Mock recursive call
      (mockFs.readdir as unknown as jest.Mock)
        .mockResolvedValueOnce(mockDirEntries)
        .mockResolvedValueOnce([
          { name: 'nested.jpg', isDirectory: () => false, isFile: () => true }
        ]);

      const files = await extractor.getPhotoFiles('/test/path');

      expect(files).toContain('/test/path/subfolder/nested.jpg'.replace(/\//g, path.sep));
    });

    it('should handle directory read errors', async () => {
      (mockFs.readdir as unknown as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      await expect(extractor.getPhotoFiles('/test/path')).rejects.toThrow('Failed to read directory /test/path: Error: Permission denied');
    });
  });
  describe('extractMetadata', () => {    beforeEach(() => {
      (mockFs.stat as unknown as jest.Mock).mockResolvedValue(mockStats);
      mockExiftool.read.mockResolvedValue(mockExifData);
      
      // Spy on and mock the private hash calculation methods to avoid stream complexity
      jest.spyOn(MetadataExtractor.prototype as any, 'calculateFileHash')
        .mockResolvedValue('mockedhash123');
      jest.spyOn(MetadataExtractor.prototype as any, 'calculatePerceptualHash')
        .mockResolvedValue('perceptualhash456');
    });

    it('should extract complete metadata from photo', async () => {
      const metadata = await extractor.extractMetadata('/test/photo.jpg');

      expect(metadata.filename).toBe('photo.jpg');
      expect(metadata.filepath).toBe('/test/photo.jpg');
      expect(metadata.fileSize).toBe(1024000);
      expect(metadata.fileExtension).toBe('.jpg');
      expect(metadata.camera).toBe('Canon EOS 7D');
      expect(metadata.make).toBe('Canon');
      expect(metadata.model).toBe('EOS 7D');
      expect(metadata.lens).toBe('EF 24-70mm f/2.8L USM');
      expect(metadata.focalLength).toBe(50);
      expect(metadata.aperture).toBe(2.8);
      expect(metadata.iso).toBe(100);
      expect(metadata.imageWidth).toBe(5184);
      expect(metadata.imageHeight).toBe(3456);
    });

    it('should calculate computed fields', async () => {
      const metadata = await extractor.extractMetadata('/test/photo.jpg');

      expect(metadata.aspectRatio).toBeCloseTo(1.5, 2);
      expect(metadata.megapixels).toBeCloseTo(17.9, 1);
    });

    it('should parse date correctly', async () => {
      const metadata = await extractor.extractMetadata('/test/photo.jpg');

      expect(metadata.dateTimeOriginal).toBeInstanceOf(Date);
      expect(metadata.dateTimeOriginal?.getFullYear()).toBe(2025);
    });

    it('should handle missing EXIF data gracefully', async () => {
      mockExiftool.read.mockResolvedValue({});

      const metadata = await extractor.extractMetadata('/test/photo.jpg');

      expect(metadata.filename).toBe('photo.jpg');
      expect(metadata.camera).toBeUndefined();
      expect(metadata.imageWidth).toBeUndefined();
    });

    it('should format camera name correctly', async () => {
      // Test case where model contains make
      mockExiftool.read.mockResolvedValue({
        Make: 'Canon',
        Model: 'Canon EOS 7D'
      });

      const metadata = await extractor.extractMetadata('/test/photo.jpg');
      expect(metadata.camera).toBe('Canon EOS 7D'); // Should not duplicate
    });

    it('should parse keywords from different formats', async () => {
      // Test array format
      mockExiftool.read.mockResolvedValue({
        Keywords: ['landscape', 'nature', 'outdoor']
      });

      let metadata = await extractor.extractMetadata('/test/photo.jpg');
      expect(metadata.keywords).toEqual(['landscape', 'nature', 'outdoor']);

      // Test string format with commas
      mockExiftool.read.mockResolvedValue({
        Keywords: 'landscape,nature,outdoor'
      });

      metadata = await extractor.extractMetadata('/test/photo.jpg');
      expect(metadata.keywords).toEqual(['landscape', 'nature', 'outdoor']);

      // Test string format with semicolons
      mockExiftool.read.mockResolvedValue({
        Keywords: 'landscape;nature;outdoor'
      });

      metadata = await extractor.extractMetadata('/test/photo.jpg');
      expect(metadata.keywords).toEqual(['landscape', 'nature', 'outdoor']);
    });    it('should handle file stat errors', async () => {
      (mockFs.stat as unknown as jest.Mock).mockRejectedValue(new Error('File not found'));

      await expect(extractor.extractMetadata('/test/missing.jpg')).rejects.toThrow('Failed to extract metadata from /test/missing.jpg');
    });

    it('should handle exiftool errors', async () => {
      mockExiftool.read.mockRejectedValue(new Error('Exiftool failed'));

      await expect(extractor.extractMetadata('/test/photo.jpg')).rejects.toThrow('Failed to extract metadata from /test/photo.jpg');
    });    it('should continue without hashes if hash calculation fails', async () => {
      // Override the spies to throw errors
      jest.spyOn(MetadataExtractor.prototype as any, 'calculateFileHash')
        .mockRejectedValue(new Error('Hash calculation failed'));
      jest.spyOn(MetadataExtractor.prototype as any, 'calculatePerceptualHash')
        .mockRejectedValue(new Error('Perceptual hash calculation failed'));

      const metadata = await extractor.extractMetadata('/test/photo.jpg');

      expect(metadata.filename).toBe('photo.jpg');
      expect(metadata.fileHash).toBeUndefined();
      expect(metadata.perceptualHash).toBeUndefined();
    });
  });  describe('extractBatchMetadata', () => {
    beforeEach(() => {
      (mockFs.stat as unknown as jest.Mock).mockResolvedValue(mockStats);
      mockExiftool.read.mockResolvedValue(mockExifData);
      
      // Use the same spy approach as extractMetadata tests
      jest.spyOn(MetadataExtractor.prototype as any, 'calculateFileHash')
        .mockResolvedValue('mockedhash123');
      jest.spyOn(MetadataExtractor.prototype as any, 'calculatePerceptualHash')
        .mockResolvedValue('perceptualhash456');
    });

    it('should process multiple files', async () => {
      const filepaths = ['/test/photo1.jpg', '/test/photo2.jpg'];
      const result = await extractor.extractBatchMetadata(filepaths);

      expect(result.metadata).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata[0].filename).toBe('photo1.jpg');
      expect(result.metadata[1].filename).toBe('photo2.jpg');
    });

    it('should call progress callback', async () => {
      const filepaths = ['/test/photo1.jpg', '/test/photo2.jpg'];
      const progressCallback = jest.fn();

      await extractor.extractBatchMetadata(filepaths, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(1, 2, 'photo1.jpg');
      expect(progressCallback).toHaveBeenCalledWith(2, 2, 'photo2.jpg');
    });

    it('should collect errors for failed files', async () => {
      mockExiftool.read
        .mockResolvedValueOnce(mockExifData)
        .mockRejectedValueOnce(new Error('Failed to read'));

      const filepaths = ['/test/photo1.jpg', '/test/photo2.jpg'];
      const result = await extractor.extractBatchMetadata(filepaths);

      expect(result.metadata).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('photo2.jpg');
    });
  });

  describe('helper methods', () => {
    describe('parseNumber', () => {
      it('should parse valid numbers', () => {
        const parseNumber = (extractor as any).parseNumber;
        
        expect(parseNumber(42)).toBe(42);
        expect(parseNumber('42.5')).toBe(42.5);
        expect(parseNumber('42')).toBe(42);
      });

      it('should return undefined for invalid values', () => {
        const parseNumber = (extractor as any).parseNumber;
        
        expect(parseNumber(null)).toBeUndefined();
        expect(parseNumber(undefined)).toBeUndefined();
        expect(parseNumber('not a number')).toBeUndefined();
        expect(parseNumber(NaN)).toBeUndefined();
      });
    });

    describe('parseDate', () => {
      it('should parse valid dates', () => {
        const parseDate = (extractor as any).parseDate;
        
        const date = parseDate('2025-01-15T14:30:00Z');
        expect(date).toBeInstanceOf(Date);
        expect(date.getFullYear()).toBe(2025);
      });

      it('should return undefined for invalid dates', () => {
        const parseDate = (extractor as any).parseDate;
        
        expect(parseDate(null)).toBeUndefined();
        expect(parseDate(undefined)).toBeUndefined();
        expect(parseDate('not a date')).toBeUndefined();
      });
    });

    describe('formatCamera', () => {
      it('should format camera with make and model', () => {
        const formatCamera = (extractor as any).formatCamera;
        
        expect(formatCamera('Canon', 'EOS 7D')).toBe('Canon EOS 7D');
        expect(formatCamera('Nikon', 'D850')).toBe('Nikon D850');
      });

      it('should handle missing make or model', () => {
        const formatCamera = (extractor as any).formatCamera;
        
        expect(formatCamera(null, 'EOS 7D')).toBe('EOS 7D');
        expect(formatCamera('Canon', null)).toBe('Canon');
        expect(formatCamera(null, null)).toBeUndefined();
      });

      it('should avoid duplication', () => {
        const formatCamera = (extractor as any).formatCamera;
        
        expect(formatCamera('Canon', 'Canon EOS 7D')).toBe('Canon EOS 7D');
        expect(formatCamera('CANON', 'canon eos 7d')).toBe('canon eos 7d');
      });
    });
  });

  describe('cleanup', () => {
    it('should end exiftool process', async () => {
      await extractor.cleanup();

      expect(mockExiftool.end).toHaveBeenCalled();
    });
  });
});
