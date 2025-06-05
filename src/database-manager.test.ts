import * as fs from 'fs-extra';
import * as path from 'path';
import { Database } from 'sqlite3';
import { DatabaseManager } from './database-manager';
import { PhotoMetadata } from './types';

// Mock sqlite3
jest.mock('sqlite3');
jest.mock('fs-extra');

const mockFs = fs as jest.Mocked<typeof fs>;
const MockDatabase = Database as jest.MockedClass<typeof Database>;

describe('DatabaseManager', () => {
  let dbManager: DatabaseManager;
  let mockDb: jest.Mocked<Database>;
  const testDbPath = './test.db';

  const mockPhotoMetadata: PhotoMetadata = {
    filename: 'test.jpg',
    filepath: '/path/to/test.jpg',
    fileSize: 1024000,
    dateModified: new Date('2025-01-15T14:30:00Z'),
    fileExtension: '.jpg',
    dateTimeOriginal: new Date('2025-01-15T12:00:00Z'),
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
    fileHash: 'abc123def456',
    perceptualHash: 'def456abc123'
  };  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock fs-extra methods
    jest.spyOn(mockFs, 'ensureDirSync').mockImplementation(() => undefined);

    mockDb = {
      serialize: jest.fn((callback) => callback && callback()),
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn(),
      each: jest.fn(),
      close: jest.fn((callback) => callback && callback()),
      on: jest.fn()
    } as any;    // Mock the Database constructor to call the callback immediately
    MockDatabase.mockImplementation(((path: string, mode?: any, callback?: (err: Error | null) => void) => {
      // Handle different argument patterns for sqlite3.Database constructor
      const actualCallback = typeof mode === 'function' ? mode : callback;
      if (actualCallback) {
        // Call the callback asynchronously to simulate real database behavior
        setTimeout(() => actualCallback(null), 0);
      }
      
      // Ensure serialize method is properly wired to execute its callback
      mockDb.serialize.mockImplementation((cb) => {
        if (cb) cb();
        return mockDb;
      });
      
      return mockDb;
    }) as any);
    
    dbManager = new DatabaseManager(testDbPath);
  });

  describe('constructor', () => {
    it('should create database manager with path', () => {
      expect(dbManager).toBeInstanceOf(DatabaseManager);
    });

    it('should use default path if none provided', () => {
      const defaultManager = new DatabaseManager();
      expect(defaultManager).toBeInstanceOf(DatabaseManager);
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      mockDb.run.mockImplementation((sql, callback) => {
        if (callback) callback.call({ lastID: 1, changes: 1 }, null);
        return mockDb;
      });
    });
    it('should initialize database and create tables', async () => {
      await dbManager.initialize();

      expect(MockDatabase).toHaveBeenCalledWith(testDbPath, expect.any(Function));
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS photos'),
        expect.any(Function)
      );
    }, 10000);

    it('should handle database connection errors', async () => {
      MockDatabase.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(dbManager.initialize()).rejects.toThrow('Database connection failed');
    }); it('should handle table creation errors', async () => {
      mockDb.run.mockImplementation((sql, callback) => {
        if (callback) callback.call({ lastID: 1, changes: 1 }, new Error('Table creation failed'));
        return mockDb;
      });

      await expect(dbManager.initialize()).rejects.toThrow('Table creation failed');
    }, 10000);
  });
  describe('upsertPhoto', () => {
    beforeEach(async () => {
      // Ensure all database operations are mocked synchronously
      mockDb.run.mockImplementation((sql, params, callback) => {
        if (typeof params === 'function') {
          // Handle case where params is actually the callback
          callback = params;
        }
        if (callback) {
          // Execute callback synchronously to avoid timeout
          setImmediate(() => callback.call({ lastID: 1, changes: 1 }, null));
        }
        return mockDb;
      });
      await dbManager.initialize();
    });

    it('should insert photo metadata', async () => {
      await dbManager.upsertPhoto(mockPhotoMetadata);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO photos'),
        expect.arrayContaining([
          mockPhotoMetadata.filename,
          mockPhotoMetadata.filepath,
          mockPhotoMetadata.fileSize
        ]),
        expect.any(Function)
      );
    });

    it('should handle insertion errors', async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        if (callback) callback.call({ lastID: 1, changes: 1 }, new Error('Insertion failed'));
        return mockDb;
      });

      await expect(dbManager.upsertPhoto(mockPhotoMetadata)).rejects.toThrow('Failed to insert/update photo: Insertion failed');
    });

    it('should handle missing optional fields', async () => {
      const minimalMetadata: PhotoMetadata = {
        filename: 'minimal.jpg',
        filepath: '/path/to/minimal.jpg',
        fileSize: 1024,
        dateModified: new Date(),
        fileExtension: '.jpg'
      };

      await dbManager.upsertPhoto(minimalMetadata);

      expect(mockDb.run).toHaveBeenCalled();
    });
  });
  describe('getPhoto', () => {
    beforeEach(async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (callback) {
          setImmediate(() => callback.call({ lastID: 1, changes: 1 }, null));
        }
        return mockDb;
      });
      
      mockDb.get.mockImplementation((sql, params, callback) => {
        const mockRow = {
          id: 1,
          filename: mockPhotoMetadata.filename,
          filepath: mockPhotoMetadata.filepath,
          file_size: mockPhotoMetadata.fileSize,
          date_modified: mockPhotoMetadata.dateModified.toISOString(),
          file_extension: mockPhotoMetadata.fileExtension,
          keywords: JSON.stringify(mockPhotoMetadata.keywords)
        };
        if (callback) callback(null, mockRow);
        return mockDb;
      });
      
      await dbManager.initialize();
    });

    it('should retrieve photo by filepath', async () => {
      const photo = await dbManager.getPhoto('/path/to/test.jpg');

      expect(photo).toBeDefined();
      expect(photo?.filename).toBe(mockPhotoMetadata.filename);
      expect(photo?.filepath).toBe(mockPhotoMetadata.filepath);
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM photos WHERE filepath = ?'),
        ['/path/to/test.jpg'],
        expect.any(Function)
      );
    });

    it('should return null for non-existent photo', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        if (callback) callback(null, null);
        return mockDb;
      });

      const photo = await dbManager.getPhoto('/path/to/nonexistent.jpg');
      expect(photo).toBeNull();
    });

    it('should handle database errors', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        if (callback) callback(new Error('Database error'), null);
        return mockDb;
      });

      await expect(dbManager.getPhoto('/path/to/test.jpg')).rejects.toThrow('Failed to get photo: Database error');
    });
  });

  describe('getAllPhotosWithHashes', () => {
    beforeEach(async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (callback) {
          setImmediate(() => callback.call({ lastID: 1, changes: 1 }, null));
        }
        return mockDb;
      });
      
      mockDb.all.mockImplementation((sql, params, callback) => {
        // Handle case where params is actually the callback (no parameters passed)
        if (typeof params === 'function') {
          callback = params;
        }
        const mockRows = [
          {
            id: 1,
            filename: 'photo1.jpg',
            filepath: '/path/to/photo1.jpg',
            file_size: 1024,
            date_modified: new Date().toISOString(),
            file_extension: '.jpg',
            file_hash: 'hash1',
            perceptual_hash: 'phash1',
            keywords: null
          }
        ];
        if (callback) callback(null, mockRows);
        return mockDb;
      });
      
      await dbManager.initialize();
    });

    it('should retrieve photos with hashes only', async () => {
      const photos = await dbManager.getAllPhotosWithHashes();

      expect(photos).toHaveLength(1);
      expect(photos[0].fileHash).toBe('hash1');
      expect(photos[0].perceptualHash).toBe('phash1');
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE file_hash IS NOT NULL'),
        [],
        expect.any(Function)
      );
    });
  });

  describe('searchPhotos', () => {
    const searchCriteria = {
      camera: 'Canon',
      fromDate: new Date('2025-01-01'),
      toDate: new Date('2025-12-31'),
      extension: '.jpg',
      hasGps: true,
      minMegapixels: 10,
      maxMegapixels: 25
    };

    beforeEach(async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (callback) {
          setImmediate(() => callback.call({ lastID: 1, changes: 1 }, null));
        }
        return mockDb;
      });
      
      mockDb.all.mockImplementation((sql, params, callback) => {
        const mockRows = [
          {
            id: 1,
            filename: 'search_result.jpg',
            filepath: '/path/to/search_result.jpg',
            file_size: 1024,
            date_modified: new Date().toISOString(),
            file_extension: '.jpg',
            camera: 'Canon',
            keywords: null
          }
        ];
        if (callback) callback(null, mockRows);
        return mockDb;
      });
      
      await dbManager.initialize();
    });

    it('should search photos with criteria', async () => {
      const photos = await dbManager.searchPhotos(searchCriteria);

      expect(photos).toHaveLength(1);
      expect(photos[0].filename).toBe('search_result.jpg');
      expect(mockDb.all).toHaveBeenCalled();
    });

    it('should handle empty search criteria', async () => {
      const photos = await dbManager.searchPhotos({});

      expect(photos).toHaveLength(1);
      expect(mockDb.all).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (callback) {
          setImmediate(() => callback.call({ lastID: 1, changes: 1 }, null));
        }
        return mockDb;
      });
      
      mockDb.get.mockImplementation((sql, callback) => {
        if (callback) callback(null, { total: 100 });
        return mockDb;
      });
      mockDb.all.mockImplementation((sql, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (callback) callback(null, [{ camera: 'Canon', count: 50 }]);
        return mockDb;
      });
      
      await dbManager.initialize();
    });

    it('should return database statistics', async () => {
      const stats = await dbManager.getStats();

      expect(stats.totalPhotos).toBe(100);
      expect(stats.cameras).toHaveLength(1);
      expect(stats.cameras[0].camera).toBe('Canon');
      expect(mockDb.get).toHaveBeenCalled();
      expect(mockDb.all).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    beforeEach(() => {
      
      // Mock run for initialization
      mockDb.run.mockImplementation((sql, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (callback) {
          setImmediate(() => callback.call({ lastID: 1, changes: 1 }, null));
        }
        return mockDb;
      });
    });

    it('should close database connection', async () => {
      
      await dbManager.initialize();
      
      // Mock close to call callback synchronously
      mockDb.close.mockImplementation((callback) => {
        if (callback) callback(null);
      });
      
      await dbManager.close();

      expect(mockDb.close).toHaveBeenCalled();
    });
    it('should handle close errors', async () => {
      await dbManager.initialize();
      
      mockDb.close.mockImplementation((callback) => {
        if (callback) callback(new Error('Close failed'));
      });

      await expect(dbManager.close()).rejects.toThrow('Close failed');
    });
  });

  describe('data mapping through public methods', () => {
    beforeEach(async () => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (callback) {
          setImmediate(() => callback.call({ lastID: 1, changes: 1 }, null));
        }
        return mockDb;
      });
      
      await dbManager.initialize();
    });

    it('should properly map database row to PhotoMetadata through getPhoto', async () => {
      const mockRow = {
        id: 1,
        filename: 'test.jpg',
        filepath: '/path/to/test.jpg',
        file_size: 1024,
        date_modified: '2025-01-15T14:30:00Z',
        file_extension: '.jpg',
        date_time_original: '2025-01-15T12:00:00Z',
        keywords: 'landscape, nature',
        camera: 'Canon EOS 7D',
        make: 'Canon',
        model: 'EOS 7D'
      };

      mockDb.get.mockImplementation((sql, params, callback) => {
        if (callback) callback(null, mockRow);
        return mockDb;
      });

      const metadata = await dbManager.getPhoto('/path/to/test.jpg');

      expect(metadata).toBeDefined();
      expect(metadata!.filename).toBe('test.jpg');
      expect(metadata!.filepath).toBe('/path/to/test.jpg');
      expect(metadata!.fileSize).toBe(1024);
      expect(metadata!.dateModified).toBeInstanceOf(Date);
      expect(metadata!.keywords).toEqual(['landscape', 'nature']);
    });

    it('should handle null/undefined values in database rows', async () => {
      const mockRow = {
        id: 1,
        filename: 'test.jpg',
        filepath: '/path/to/test.jpg',
        file_size: 1024,
        date_modified: '2025-01-15T14:30:00Z',
        file_extension: '.jpg',
        keywords: null,
        camera: null
      };

      mockDb.get.mockImplementation((sql, params, callback) => {
        if (callback) callback(null, mockRow);
        return mockDb;
      });

      const metadata = await dbManager.getPhoto('/path/to/test.jpg');

      expect(metadata).toBeDefined();
      expect(metadata!.keywords).toBeUndefined();
      expect(metadata!.camera).toBeNull();
    });
  });
});
