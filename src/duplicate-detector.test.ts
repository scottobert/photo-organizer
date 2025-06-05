import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import { DuplicateDetector } from './duplicate-detector';
import { PhotoMetadata, DuplicateGroup, DuplicateDetectionResult } from './types';
import { ConfigManager } from './config-manager';

// Mock dependencies
jest.mock('fs-extra');
jest.mock('crypto');
jest.mock('./config-manager');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;

describe('DuplicateDetector', () => {
  let duplicateDetector: DuplicateDetector;
  let mockConfig: any;
  let mockConfigManagerInstance: jest.Mocked<ConfigManager>;

  const mockPhotoMetadata1: PhotoMetadata = {
    filename: 'photo1.jpg',
    filepath: '/path/to/photo1.jpg',
    fileSize: 1024000,
    dateModified: new Date('2025-01-15T14:30:00Z'),
    fileExtension: '.jpg',
    dateTimeOriginal: new Date('2025-01-15T12:00:00Z'),
    camera: 'Canon EOS 7D',
    imageWidth: 5184,
    imageHeight: 3456,
    aspectRatio: 1.5,
    megapixels: 17.9,
    fileHash: 'abc123def456',
    perceptualHash: 'perceptual123'
  };

  const mockPhotoMetadata2: PhotoMetadata = {
    filename: 'photo2.jpg',
    filepath: '/path/to/photo2.jpg',
    fileSize: 1024000,
    dateModified: new Date('2025-01-15T14:35:00Z'),
    fileExtension: '.jpg',
    dateTimeOriginal: new Date('2025-01-15T12:00:00Z'),
    camera: 'Canon EOS 7D',
    imageWidth: 5184,
    imageHeight: 3456,
    aspectRatio: 1.5,
    megapixels: 17.9,
    fileHash: 'abc123def456', // Same hash as photo1
    perceptualHash: 'perceptual123'
  };

  const mockPhotoMetadata3: PhotoMetadata = {
    filename: 'photo3.jpg',
    filepath: '/path/to/photo3.jpg',
    fileSize: 2048000,
    dateModified: new Date('2025-01-15T15:00:00Z'),
    fileExtension: '.jpg',
    dateTimeOriginal: new Date('2025-01-15T13:00:00Z'),
    camera: 'Nikon D850',
    imageWidth: 4000,
    imageHeight: 3000,
    aspectRatio: 1.33,
    megapixels: 12.0,
    fileHash: 'different123',
    perceptualHash: 'perceptual456'
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      getDuplicateConfig: jest.fn().mockReturnValue({
        threshold: 0.9,
        includePerceptual: true
      })
    };

    (ConfigManager.getInstance as jest.Mock).mockReturnValue(mockConfig);
    duplicateDetector = new DuplicateDetector();
  });

  describe('calculateFileHash', () => {    it('should calculate MD5 hash of file', async () => {
      const mockBuffer = Buffer.from('test file content');
      (mockFs.readFile as unknown as jest.Mock).mockResolvedValue(mockBuffer);
      
      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('calculated-hash')
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      const hash = await duplicateDetector.calculateFileHash('/path/to/file.jpg');

      expect(hash).toBe('calculated-hash');
      expect(mockFs.readFile).toHaveBeenCalledWith('/path/to/file.jpg');
      expect(mockCrypto.createHash).toHaveBeenCalledWith('md5');
      expect(mockHash.update).toHaveBeenCalledWith(mockBuffer);
      expect(mockHash.digest).toHaveBeenCalledWith('hex');
    });    it('should handle file read errors', async () => {
      (mockFs.readFile as unknown as jest.Mock).mockRejectedValue(new Error('File not found'));

      await expect(duplicateDetector.calculateFileHash('/path/to/missing.jpg'))
        .rejects.toThrow('Failed to calculate hash for /path/to/missing.jpg: Error: File not found');
    });
  });

  describe('calculatePerceptualHash', () => {
    it('should calculate perceptual hash based on image properties', () => {      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('perceptual-hash-result-long-string')
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      const hash = duplicateDetector.calculatePerceptualHash(mockPhotoMetadata1);

      expect(hash).toBe('perceptual-hash-'); // substring(0, 16)
      expect(mockCrypto.createHash).toHaveBeenCalledWith('md5');
      expect(mockHash.update).toHaveBeenCalled();
    });

    it('should return undefined for missing image dimensions', () => {
      const metadataWithoutDimensions = {
        ...mockPhotoMetadata1,
        imageWidth: undefined,
        imageHeight: undefined
      };

      const hash = duplicateDetector.calculatePerceptualHash(metadataWithoutDimensions);

      expect(hash).toBeUndefined();
    });
  });  describe('enrichMetadataWithHashes', () => {
    beforeEach(() => {
      const mockBuffer = Buffer.from('test content');
      (mockFs.readFile as unknown as jest.Mock).mockResolvedValue(mockBuffer);
      
      const mockFileHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('file-hash')
      };
      
      const mockPerceptualHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('perceptual-hash')
      };
      
      mockCrypto.createHash
        .mockReturnValueOnce(mockFileHash as any)
        .mockReturnValueOnce(mockPerceptualHash as any);
    });

    it('should enrich metadata with hashes', async () => {
      const metadata = [
        { ...mockPhotoMetadata1, fileHash: undefined, perceptualHash: undefined }
      ];

      const enriched = await duplicateDetector.enrichMetadataWithHashes(metadata);

      expect(enriched).toHaveLength(1);
      expect(enriched[0].fileHash).toBe('file-hash');
      expect(enriched[0].perceptualHash).toBe('perceptual-hash'); // substring(0, 16)
    });    it('should handle hash calculation errors gracefully', async () => {
      (mockFs.readFile as unknown as jest.Mock).mockRejectedValue(new Error('Hash calculation failed'));
      
      const metadata = [
        { ...mockPhotoMetadata1, fileHash: undefined, perceptualHash: undefined }
      ];

      const enriched = await duplicateDetector.enrichMetadataWithHashes(metadata);

      expect(enriched).toHaveLength(1);
      expect(enriched[0].fileHash).toBeUndefined();
      expect(enriched[0].perceptualHash).toBeUndefined();
    });
  });

  describe('findExactDuplicates', () => {
    it('should find files with identical file hashes', () => {
      const metadata = [mockPhotoMetadata1, mockPhotoMetadata2, mockPhotoMetadata3];
      
      const duplicates = duplicateDetector.findExactDuplicates(metadata);

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].hash).toBe('abc123def456');
      expect(duplicates[0].hashType).toBe('file');
      expect(duplicates[0].files).toHaveLength(2);
      expect(duplicates[0].duplicateCount).toBe(1);
      expect(duplicates[0].totalSize).toBe(2048000);
    });

    it('should return empty array when no duplicates found', () => {
      const metadata = [
        { ...mockPhotoMetadata1, fileHash: 'unique1' },
        { ...mockPhotoMetadata2, fileHash: 'unique2' }
      ];

      const duplicates = duplicateDetector.findExactDuplicates(metadata);

      expect(duplicates).toHaveLength(0);
    });

    it('should ignore files without file hashes', () => {
      const metadata = [
        { ...mockPhotoMetadata1, fileHash: undefined },
        { ...mockPhotoMetadata2, fileHash: 'unique' }
      ];

      const duplicates = duplicateDetector.findExactDuplicates(metadata);

      expect(duplicates).toHaveLength(0);
    });

    it('should sort duplicates by total size descending', () => {
      const metadata = [
        { ...mockPhotoMetadata1, fileHash: 'hash1', fileSize: 1000 },
        { ...mockPhotoMetadata2, fileHash: 'hash1', fileSize: 1000 },
        { ...mockPhotoMetadata3, fileHash: 'hash2', fileSize: 2000 },
        { ...mockPhotoMetadata1, filepath: '/path4', fileHash: 'hash2', fileSize: 2000 }
      ];

      const duplicates = duplicateDetector.findExactDuplicates(metadata);

      expect(duplicates).toHaveLength(2);
      expect(duplicates[0].totalSize).toBe(4000); // hash2 group
      expect(duplicates[1].totalSize).toBe(2000); // hash1 group
    });
  });

  describe('findSimilarFiles', () => {
    it('should find files with identical perceptual hashes', () => {
      const metadata = [
        { ...mockPhotoMetadata1, perceptualHash: 'similar1' },
        { ...mockPhotoMetadata2, perceptualHash: 'similar1' },
        { ...mockPhotoMetadata3, perceptualHash: 'different' }
      ];

      const similar = duplicateDetector.findSimilarFiles(metadata);

      expect(similar).toHaveLength(1);
      expect(similar[0].hash).toBe('similar1');
      expect(similar[0].hashType).toBe('perceptual');
      expect(similar[0].files).toHaveLength(2);
      expect(similar[0].duplicateCount).toBe(1);
    });

    it('should return empty array when no similar files found', () => {
      const metadata = [
        { ...mockPhotoMetadata1, perceptualHash: 'unique1' },
        { ...mockPhotoMetadata2, perceptualHash: 'unique2' }
      ];

      const similar = duplicateDetector.findSimilarFiles(metadata);

      expect(similar).toHaveLength(0);
    });

    it('should ignore files without perceptual hashes', () => {
      const metadata = [
        { ...mockPhotoMetadata1, perceptualHash: undefined },
        { ...mockPhotoMetadata2, perceptualHash: 'hash' }
      ];

      const similar = duplicateDetector.findSimilarFiles(metadata);

      expect(similar).toHaveLength(0);
    });
  });

  describe('detectDuplicates', () => {
    beforeEach(() => {
      // Mock hash enrichment
      jest.spyOn(duplicateDetector, 'enrichMetadataWithHashes').mockImplementation(async (metadata) => {
        return metadata.map(m => ({ ...m, fileHash: m.fileHash || 'default-hash' }));
      });
    });

    it('should detect both exact and similar duplicates', async () => {
      const metadata = [mockPhotoMetadata1, mockPhotoMetadata2, mockPhotoMetadata3];
      
      const result = await duplicateDetector.detectDuplicates(metadata);

      expect(result.totalFiles).toBe(3);
      expect(result.duplicateGroups).toHaveLength(1);
      expect(result.totalDuplicates).toBe(1);
      expect(result.uniqueFiles).toBe(2);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should call progress callback', async () => {
      const metadata = [mockPhotoMetadata1];
      const progressCallback = jest.fn();

      await duplicateDetector.detectDuplicates(metadata, progressCallback);

      expect(progressCallback).toHaveBeenCalled();
    });

    it('should prioritize exact duplicates over similar ones', async () => {
      const metadata = [
        { ...mockPhotoMetadata1, fileHash: 'exact', perceptualHash: 'similar' },
        { ...mockPhotoMetadata2, fileHash: 'exact', perceptualHash: 'similar' },
        { ...mockPhotoMetadata3, fileHash: 'different', perceptualHash: 'similar' }
      ];

      const result = await duplicateDetector.detectDuplicates(metadata);

      expect(result.duplicateGroups).toHaveLength(1);
      expect(result.duplicateGroups[0].hashType).toBe('file');
    });

    it('should handle empty metadata array', async () => {
      const result = await duplicateDetector.detectDuplicates([]);

      expect(result.totalFiles).toBe(0);
      expect(result.duplicateGroups).toHaveLength(0);
      expect(result.totalDuplicates).toBe(0);
      expect(result.uniqueFiles).toBe(0);
    });
  });

  describe('removeDuplicates', () => {
    const mockDuplicateGroups: DuplicateGroup[] = [
      {
        hash: 'duplicate-hash',
        hashType: 'file',
        files: [
          { ...mockPhotoMetadata1, dateModified: new Date('2025-01-15T12:00:00Z') },
          { ...mockPhotoMetadata2, dateModified: new Date('2025-01-15T13:00:00Z') }
        ],
        totalSize: 2048000,
        duplicateCount: 1
      }
    ];    beforeEach(() => {
      (mockFs.remove as jest.Mock).mockResolvedValue(undefined);
    });

    it('should remove duplicates with keep-newest strategy', async () => {
      const result = await duplicateDetector.removeDuplicates(mockDuplicateGroups, 'keep-newest', false);

      expect(result.removed).toHaveLength(1);
      expect(result.removed[0]).toBe('/path/to/photo1.jpg'); // Older file removed
      expect(result.errors).toHaveLength(0);
      expect(result.savedSpace).toBe(1024000);
      expect(mockFs.remove).toHaveBeenCalledWith('/path/to/photo1.jpg');
    });

    it('should remove duplicates with keep-largest strategy', async () => {
      const groups = [{
        ...mockDuplicateGroups[0],
        files: [
          { ...mockPhotoMetadata1, fileSize: 1000 },
          { ...mockPhotoMetadata2, fileSize: 2000 }
        ]
      }];

      const result = await duplicateDetector.removeDuplicates(groups, 'keep-largest', false);

      expect(result.removed).toHaveLength(1);
      expect(result.removed[0]).toBe('/path/to/photo1.jpg'); // Smaller file removed
    });

    it('should remove duplicates with keep-first strategy', async () => {
      const result = await duplicateDetector.removeDuplicates(mockDuplicateGroups, 'keep-first', false);

      expect(result.removed).toHaveLength(1);
      expect(result.removed[0]).toBe('/path/to/photo2.jpg'); // Second file removed
    });

    it('should perform dry run without actually removing files', async () => {
      const result = await duplicateDetector.removeDuplicates(mockDuplicateGroups, 'keep-newest', true);

      expect(result.removed).toHaveLength(1);
      expect(result.savedSpace).toBe(1024000);
      expect(mockFs.remove).not.toHaveBeenCalled();
    });

    it('should call progress callback', async () => {
      const progressCallback = jest.fn();

      await duplicateDetector.removeDuplicates(mockDuplicateGroups, 'keep-newest', false, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(1, 1, 'photo1.jpg');
    });    it('should handle removal errors', async () => {
      (mockFs.remove as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      const result = await duplicateDetector.removeDuplicates(mockDuplicateGroups, 'keep-newest', false);

      expect(result.removed).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Permission denied');
    });

    it('should skip groups with only one file', async () => {
      const singleFileGroup: DuplicateGroup[] = [{
        hash: 'single-hash',
        hashType: 'file',
        files: [mockPhotoMetadata1],
        totalSize: 1024000,
        duplicateCount: 0
      }];

      const result = await duplicateDetector.removeDuplicates(singleFileGroup, 'keep-newest', false);

      expect(result.removed).toHaveLength(0);
      expect(mockFs.remove).not.toHaveBeenCalled();
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(duplicateDetector.formatFileSize(512)).toBe('512.0 B');
      expect(duplicateDetector.formatFileSize(1024)).toBe('1.0 KB');
      expect(duplicateDetector.formatFileSize(1048576)).toBe('1.0 MB');
      expect(duplicateDetector.formatFileSize(1073741824)).toBe('1.0 GB');
      expect(duplicateDetector.formatFileSize(1099511627776)).toBe('1.0 TB');
    });

    it('should handle decimal values', () => {
      expect(duplicateDetector.formatFileSize(1536)).toBe('1.5 KB');
      expect(duplicateDetector.formatFileSize(2621440)).toBe('2.5 MB');
    });

    it('should handle zero and very small values', () => {
      expect(duplicateDetector.formatFileSize(0)).toBe('0.0 B');
      expect(duplicateDetector.formatFileSize(1)).toBe('1.0 B');
    });
  });

  describe('generateReport', () => {
    const mockResult: DuplicateDetectionResult = {
      totalFiles: 100,
      uniqueFiles: 90,
      duplicateGroups: [
        {
          hash: 'duplicate-hash',
          hashType: 'file',
          files: [mockPhotoMetadata1, mockPhotoMetadata2],
          totalSize: 2048000,
          duplicateCount: 1
        }
      ],
      totalDuplicates: 10,
      totalWastedSpace: 1024000,
      duration: 5000
    };

    it('should generate comprehensive report', () => {
      const report = duplicateDetector.generateReport(mockResult);

      expect(report).toContain('DUPLICATE DETECTION REPORT');
      expect(report).toContain('Total files analyzed: 100');
      expect(report).toContain('Unique files: 90');
      expect(report).toContain('Duplicate files: 10');
      expect(report).toContain('Duplicate groups: 1');
      expect(report).toContain('Detection time: 5.0s');
      expect(report).toContain('DUPLICATE GROUPS');
      expect(report).toContain('photo1.jpg');
      expect(report).toContain('photo2.jpg');
    });

    it('should handle empty duplicate groups', () => {
      const emptyResult: DuplicateDetectionResult = {
        ...mockResult,
        duplicateGroups: [],
        totalDuplicates: 0
      };

      const report = duplicateDetector.generateReport(emptyResult);

      expect(report).toContain('No duplicates found!');
    });

    it('should limit displayed groups to 10', () => {
      const manyGroups = Array.from({ length: 15 }, (_, i) => ({
        hash: `hash-${i}`,
        hashType: 'file' as const,
        files: [{ ...mockPhotoMetadata1, filename: `photo${i}.jpg` }],
        totalSize: 1024000,
        duplicateCount: 1
      }));

      const result: DuplicateDetectionResult = {
        ...mockResult,
        duplicateGroups: manyGroups
      };

      const report = duplicateDetector.generateReport(result);

      expect(report).toContain('... and 5 more duplicate groups');
    });
  });

  describe('edge cases', () => {
    it('should handle metadata without required fields', () => {
      const incompleteMetadata: PhotoMetadata = {
        filename: 'incomplete.jpg',
        filepath: '/path/to/incomplete.jpg',
        fileSize: 1024,
        dateModified: new Date(),
        fileExtension: '.jpg'
      };

      const hash = duplicateDetector.calculatePerceptualHash(incompleteMetadata);
      expect(hash).toBeUndefined();
    });

    it('should handle very large duplicate groups', async () => {
      const largeGroup: DuplicateGroup = {
        hash: 'large-group-hash',
        hashType: 'file',
        files: Array.from({ length: 1000 }, (_, i) => ({
          ...mockPhotoMetadata1,
          filename: `photo${i}.jpg`,
          filepath: `/path/to/photo${i}.jpg`
        })),
        totalSize: 1024000000,
        duplicateCount: 999
      };

      const result = await duplicateDetector.removeDuplicates([largeGroup], 'keep-first', true);

      expect(result.removed).toHaveLength(999);
    });

    it('should handle concurrent hash calculations', async () => {
      const metadata = Array.from({ length: 10 }, (_, i) => ({
        ...mockPhotoMetadata1,
        filename: `photo${i}.jpg`,
        filepath: `/path/to/photo${i}.jpg`
      }));      const mockBuffer = Buffer.from('test content');
      (mockFs.readFile as unknown as jest.Mock).mockResolvedValue(mockBuffer);
      
      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('hash')
      };
      mockCrypto.createHash.mockReturnValue(mockHash as any);

      const enriched = await duplicateDetector.enrichMetadataWithHashes(metadata);

      expect(enriched).toHaveLength(10);
      expect(mockFs.readFile).toHaveBeenCalledTimes(10);
    });
  });
});
