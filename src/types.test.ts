import {
  PhotoMetadata,
  OrganizePattern,
  DuplicateGroup,
  DuplicateDetectionResult,
  AnalysisResult
} from './types';

describe('Types', () => {
  describe('PhotoMetadata', () => {
    it('should have required properties defined', () => {
      const metadata: PhotoMetadata = {
        filename: 'test.jpg',
        filepath: '/path/to/test.jpg',
        fileSize: 1024,
        dateModified: new Date(),
        fileExtension: '.jpg'
      };

      expect(metadata.filename).toBe('test.jpg');
      expect(metadata.filepath).toBe('/path/to/test.jpg');
      expect(metadata.fileSize).toBe(1024);
      expect(metadata.dateModified).toBeInstanceOf(Date);
      expect(metadata.fileExtension).toBe('.jpg');
    });

    it('should allow optional properties', () => {
      const metadata: PhotoMetadata = {
        filename: 'test.jpg',
        filepath: '/path/to/test.jpg',
        fileSize: 1024,
        dateModified: new Date(),
        fileExtension: '.jpg',
        dateTimeOriginal: new Date(),
        camera: 'Canon EOS 7D',
        make: 'Canon',
        model: 'EOS 7D',
        lens: 'EF 24-70mm f/2.8L USM',
        focalLength: 50,
        focalLengthIn35mm: 50,
        aperture: 2.8,
        shutterSpeed: '1/125',
        iso: 100,
        flash: 'Off',
        whiteBalance: 'Auto',
        exposureMode: 'Manual',
        meteringMode: 'Pattern',
        imageWidth: 5184,
        imageHeight: 3456,
        orientation: 1,
        colorSpace: 'sRGB',
        gpsLatitude: 40.7128,
        gpsLongitude: -74.0060,
        gpsAltitude: 10,
        gpsDirection: 180,
        software: 'Adobe Lightroom',
        artist: 'Test Photographer',
        copyright: '2025 Test',
        keywords: ['landscape', 'nature'],
        rating: 5,
        aspectRatio: 1.5,
        megapixels: 17.9,
        fileHash: 'abc123',
        perceptualHash: 'def456'
      };

      expect(metadata.camera).toBe('Canon EOS 7D');
      expect(metadata.keywords).toEqual(['landscape', 'nature']);
      expect(metadata.aspectRatio).toBe(1.5);
    });
  });

  describe('OrganizePattern', () => {
    it('should define pattern and outputPath', () => {
      const pattern: OrganizePattern = {
        pattern: '{Year}/{Month}/{filename}{extension}',
        outputPath: '/organized/photos'
      };

      expect(pattern.pattern).toBe('{Year}/{Month}/{filename}{extension}');
      expect(pattern.outputPath).toBe('/organized/photos');
    });
  });

  describe('DuplicateGroup', () => {
    it('should define duplicate group structure', () => {
      const mockFile: PhotoMetadata = {
        filename: 'test.jpg',
        filepath: '/path/to/test.jpg',
        fileSize: 1024,
        dateModified: new Date(),
        fileExtension: '.jpg'
      };

      const group: DuplicateGroup = {
        hash: 'abc123',
        hashType: 'file',
        files: [mockFile],
        totalSize: 1024,
        duplicateCount: 1
      };

      expect(group.hash).toBe('abc123');
      expect(group.hashType).toBe('file');
      expect(group.files).toHaveLength(1);
      expect(group.totalSize).toBe(1024);
      expect(group.duplicateCount).toBe(1);
    });

    it('should support perceptual hash type', () => {
      const mockFile: PhotoMetadata = {
        filename: 'test.jpg',
        filepath: '/path/to/test.jpg',
        fileSize: 1024,
        dateModified: new Date(),
        fileExtension: '.jpg'
      };

      const group: DuplicateGroup = {
        hash: 'def456',
        hashType: 'perceptual',
        files: [mockFile],
        totalSize: 1024,
        duplicateCount: 1
      };

      expect(group.hashType).toBe('perceptual');
    });
  });

  describe('DuplicateDetectionResult', () => {
    it('should define detection result structure', () => {
      const result: DuplicateDetectionResult = {
        totalFiles: 100,
        uniqueFiles: 90,
        duplicateGroups: [],
        totalDuplicates: 10,
        totalWastedSpace: 10240,
        duration: 5000
      };

      expect(result.totalFiles).toBe(100);
      expect(result.uniqueFiles).toBe(90);
      expect(result.duplicateGroups).toHaveLength(0);
      expect(result.totalDuplicates).toBe(10);
      expect(result.totalWastedSpace).toBe(10240);
      expect(result.duration).toBe(5000);
    });
  });

  describe('AnalysisResult', () => {
    it('should define analysis result structure', () => {
      const result: AnalysisResult = {
        totalFiles: 100,
        processedFiles: 95,
        skippedFiles: 5,
        errors: ['Error 1', 'Error 2'],
        readErrors: ['Read Error 1'],
        duration: 10000
      };

      expect(result.totalFiles).toBe(100);
      expect(result.processedFiles).toBe(95);
      expect(result.skippedFiles).toBe(5);
      expect(result.errors).toEqual(['Error 1', 'Error 2']);
      expect(result.readErrors).toEqual(['Read Error 1']);
      expect(result.duration).toBe(10000);
    });

    it('should allow optional duplicates property', () => {
      const duplicateResult: DuplicateDetectionResult = {
        totalFiles: 100,
        uniqueFiles: 90,
        duplicateGroups: [],
        totalDuplicates: 10,
        totalWastedSpace: 10240,
        duration: 5000
      };

      const result: AnalysisResult = {
        totalFiles: 100,
        processedFiles: 95,
        skippedFiles: 5,
        errors: [],
        readErrors: [],
        duplicates: duplicateResult,
        duration: 10000
      };

      expect(result.duplicates).toBeDefined();
      expect(result.duplicates?.totalDuplicates).toBe(10);
    });
  });
});
