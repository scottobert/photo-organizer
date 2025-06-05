import * as fs from 'fs-extra';
import * as path from 'path';
import { ConfigManager, PhotoOrganizerConfig } from './config-manager';

// Mock fs-extra
jest.mock('fs-extra');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  const mockConfigPath = '/test/config.json';
  const mockConfig: PhotoOrganizerConfig = {
    database: {
      path: './test.db',
      backupOnStart: true
    },
    extraction: {
      batchSize: 10,
      maxConcurrent: 3,
      skipHidden: true,
      supportedExtensions: ['.jpg', '.jpeg', '.png'],
      extractThumbnails: false
    },
    organization: {
      defaultPattern: '{Year}/{Month}',
      createYearFolders: true,
      preserveOriginalStructure: false,
      handleDuplicates: 'skip',
      maxFilenameLength: 255
    },
    logging: {
      level: 'info',
      file: './logs/app.log',
      console: true
    },
    performance: {
      enableCaching: true,
      cacheSize: 100,
      memoryLimit: '512MB'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton instance
    (ConfigManager as any).instance = undefined;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readJsonSync.mockReturnValue(mockConfig);

      const instance1 = ConfigManager.getInstance();
      const instance2 = ConfigManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should use provided config path', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readJsonSync.mockReturnValue(mockConfig);

      const instance = ConfigManager.getInstance(mockConfigPath);
      expect(mockFs.readJsonSync).toHaveBeenCalledWith(mockConfigPath);
    });
  });

  describe('configuration loading', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readJsonSync.mockReturnValue(mockConfig);
      configManager = ConfigManager.getInstance();
    });

    it('should load configuration from file', () => {
      expect(mockFs.readJsonSync).toHaveBeenCalled();
    });

    it('should use default config when file does not exist', () => {
      (ConfigManager as any).instance = undefined;
      mockFs.existsSync.mockReturnValue(false);

      const instance = ConfigManager.getInstance();
      const config = instance.getConfig();

      expect(config).toBeDefined();
      expect(config.database.path).toBeDefined();
    });

    it('should handle invalid JSON gracefully', () => {
      (ConfigManager as any).instance = undefined;
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readJsonSync.mockImplementation(() => {
        throw new Error('Invalid JSON');
      });

      const instance = ConfigManager.getInstance();
      const config = instance.getConfig();

      expect(config).toBeDefined();
      // Should fall back to default config
      expect(config.database.path).toBeDefined();
    });
  });

  describe('getConfig', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readJsonSync.mockReturnValue(mockConfig);
      configManager = ConfigManager.getInstance();
    });

    it('should return complete configuration', () => {
      const config = configManager.getConfig();

      expect(config).toEqual(mockConfig);
      expect(config.database).toBeDefined();
      expect(config.extraction).toBeDefined();
      expect(config.organization).toBeDefined();
      expect(config.logging).toBeDefined();
      expect(config.performance).toBeDefined();
    });
  });

  describe('getDatabaseConfig', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readJsonSync.mockReturnValue(mockConfig);
      configManager = ConfigManager.getInstance();
    });

    it('should return database configuration', () => {
      const dbConfig = configManager.getDatabaseConfig();

      expect(dbConfig).toEqual(mockConfig.database);
      expect(dbConfig.path).toBe('./test.db');
      expect(dbConfig.backupOnStart).toBe(true);
    });
  });

  describe('getExtractionConfig', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readJsonSync.mockReturnValue(mockConfig);
      configManager = ConfigManager.getInstance();
    });

    it('should return extraction configuration', () => {
      const extractionConfig = configManager.getExtractionConfig();

      expect(extractionConfig).toEqual(mockConfig.extraction);
      expect(extractionConfig.batchSize).toBe(10);
      expect(extractionConfig.supportedExtensions).toContain('.jpg');
    });
  });

  describe('getOrganizationConfig', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readJsonSync.mockReturnValue(mockConfig);
      configManager = ConfigManager.getInstance();
    });

    it('should return organization configuration', () => {
      const orgConfig = configManager.getOrganizationConfig();

      expect(orgConfig).toEqual(mockConfig.organization);
      expect(orgConfig.defaultPattern).toBe('{Year}/{Month}');
      expect(orgConfig.handleDuplicates).toBe('skip');
    });
  });

  describe('setConfigValue', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readJsonSync.mockReturnValue(mockConfig);
      configManager = ConfigManager.getInstance();
    });

    it('should update nested configuration values', () => {
      configManager.setConfigValue('database.path', './new-test.db');
      
      const config = configManager.getConfig();
      expect(config.database.path).toBe('./new-test.db');
    });

    it('should update top-level configuration values', () => {
      configManager.setConfigValue('extraction.batchSize', 20);
      
      const config = configManager.getConfig();
      expect(config.extraction.batchSize).toBe(20);
    });

    it('should handle invalid key paths gracefully', () => {
      expect(() => {
        configManager.setConfigValue('invalid.deep.key', 'value');
      }).not.toThrow();
    });
  });

  describe('saveConfig', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readJsonSync.mockReturnValue(mockConfig);
      mockFs.writeJsonSync.mockImplementation(() => {});
      configManager = ConfigManager.getInstance();
    });    it('should save configuration to file', async () => {
      await configManager.saveConfig();

      expect(mockFs.writeJson).toHaveBeenCalled();
      expect(mockFs.writeJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        { spaces: 2 }
      );
    });    it('should handle save errors gracefully', async () => {
      mockFs.writeJson.mockRejectedValue(new Error('Write failed'));

      await expect(configManager.saveConfig()).rejects.toThrow('Write failed');
    });
  });

  describe('resetConfig', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readJsonSync.mockReturnValue(mockConfig);
      configManager = ConfigManager.getInstance();
    });

    it('should reset configuration to defaults', () => {
      // First modify config
      configManager.setConfigValue('database.path', './modified.db');
      expect(configManager.getConfig().database.path).toBe('./modified.db');

      // Then reset
      configManager.resetConfig();
      const config = configManager.getConfig();

      // Should be back to default value
      expect(config.database.path).not.toBe('./modified.db');
      expect(config.database.path).toBeDefined();
    });
  });

  describe('validateConfig', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readJsonSync.mockReturnValue(mockConfig);
      configManager = ConfigManager.getInstance();
    });

    it('should validate valid configuration', () => {
      const validation = configManager.validateConfig();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid configuration', () => {
      // Create invalid config
      const invalidConfig = {
        ...mockConfig,
        extraction: {
          ...mockConfig.extraction,
          batchSize: -1 // Invalid batch size
        }
      };

      mockFs.readJsonSync.mockReturnValue(invalidConfig);
      (ConfigManager as any).instance = undefined;
      const instance = ConfigManager.getInstance();
      
      const validation = instance.validateConfig();

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle missing config file gracefully', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => {
        ConfigManager.getInstance();
      }).not.toThrow();
    });

    it('should handle partial configuration', () => {
      const partialConfig = {
        database: {
          path: './partial.db'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readJsonSync.mockReturnValue(partialConfig);

      const instance = ConfigManager.getInstance();
      const config = instance.getConfig();

      expect(config.database.path).toBe('./partial.db');
      // Should have default values for missing properties
      expect(config.extraction).toBeDefined();
    });
  });
});
