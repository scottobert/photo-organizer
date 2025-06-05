import * as fs from 'fs-extra';
import * as path from 'path';

export interface PhotoOrganizerConfig {
  database: {
    path: string;
    backupOnStart: boolean;
  };
  extraction: {
    batchSize: number;
    maxConcurrent: number;
    skipHidden: boolean;
    supportedExtensions: string[];
    extractThumbnails: boolean;
  };
  organization: {
    defaultPattern: string;
    createYearFolders: boolean;
    preserveOriginalStructure: boolean;
    handleDuplicates: 'skip' | 'overwrite' | 'rename';
    maxFilenameLength: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file: string;
    console: boolean;
  };
  performance: {
    enableCaching: boolean;
    cacheSize: number;
    memoryLimit: string;
  };
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: PhotoOrganizerConfig;
  private configPath: string;

  private constructor(configPath?: string) {
    this.configPath = configPath || this.findConfigFile();
    this.config = this.loadConfig();
  }

  /**
   * Get singleton instance of ConfigManager
   */
  static getInstance(configPath?: string): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(configPath);
    }
    return ConfigManager.instance;
  }

  /**
   * Get the current configuration
   */
  getConfig(): PhotoOrganizerConfig {
    return { ...this.config }; // Return a copy to prevent mutations
  }

  /**
   * Get a specific configuration section
   */
  getDatabaseConfig() {
    return { ...this.config.database };
  }

  getExtractionConfig() {
    return { ...this.config.extraction };
  }

  getOrganizationConfig() {
    return { ...this.config.organization };
  }

  getLoggingConfig() {
    return { ...this.config.logging };
  }

  getPerformanceConfig() {
    return { ...this.config.performance };
  }
  /**
   * Update configuration and save to file
   */
  async updateConfig(updates: Partial<PhotoOrganizerConfig>): Promise<void> {
    this.config = this.mergeConfig(this.config, updates);
    await this.saveConfigFile();
  }

  /**
   * Reload configuration from file
   */
  async reloadConfig(): Promise<void> {
    this.config = this.loadConfig();
  }

  /**
   * Set a specific configuration value using dot notation
   */
  setConfigValue(key: string, value: any): void {
    const keys = key.split('.');
    let target: any = this.config;
    
    // Navigate to the parent object
    for (let i = 0; i < keys.length - 1; i++) {
      if (!target[keys[i]]) {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }
    
    // Set the value
    const finalKey = keys[keys.length - 1];
    
    // Try to parse the value as appropriate type
    if (value === 'true') {
      target[finalKey] = true;
    } else if (value === 'false') {
      target[finalKey] = false;
    } else if (!isNaN(Number(value))) {
      target[finalKey] = Number(value);
    } else {
      target[finalKey] = value;
    }
  }

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = ConfigManager.getDefaultConfig();
  }


  /**
   * Get default configuration
   */
  static getDefaultConfig(): PhotoOrganizerConfig {
    return {
      database: {
        path: './photo-metadata.db',
        backupOnStart: false
      },
      extraction: {
        batchSize: 100,
        maxConcurrent: 4,
        skipHidden: true,
        supportedExtensions: [
          // Standard formats
          '.jpg', '.jpeg', '.jpe', '.jfif',
          
          // Raw formats
          '.cr2', '.cr3',     // Canon Raw
          '.nef', '.nrw',     // Nikon Raw
          '.arw', '.srf', '.sr2', // Sony Raw
          '.orf',             // Olympus Raw
          '.rw2',             // Panasonic Raw
          '.pef', '.ptx',     // Pentax Raw
          '.raf',             // Fujifilm Raw
          '.3fr',             // Hasselblad Raw
          '.dcr', '.mrw',     // Kodak/Minolta Raw
          '.erf',             // Epson Raw
          '.mef',             // Mamiya Raw
          '.mos',             // Leaf Raw
          '.x3f',             // Sigma Raw
          
          // Adobe formats
          '.dng',             // Digital Negative
          '.psd', '.psb',     // Photoshop
          
          // Other formats
          '.tiff', '.tif',    // TIFF
          '.png',             // PNG
          '.webp',            // WebP
          '.bmp',             // Bitmap
          '.gif',             // GIF
          '.ico',             // Icon
          '.jp2', '.jpx',     // JPEG 2000
          
          // HEIF/HEIC (newer iPhone formats)
          '.heic', '.heif',
          
          // Video formats (often contain metadata)
          '.mov', '.mp4', '.avi', '.mkv', '.mts', '.m2ts'
        ],
        extractThumbnails: false
      },
      organization: {
        defaultPattern: '{Year}/{YYYY-MM-DD}/{filename}{extension}',
        createYearFolders: true,
        preserveOriginalStructure: false,
        handleDuplicates: 'skip',
        maxFilenameLength: 255
      },
      logging: {
        level: 'info',
        file: './photo-organizer.log',
        console: true
      },
      performance: {
        enableCaching: true,
        cacheSize: 1000,
        memoryLimit: '512MB'
      }
    };
  }

  /**
   * Find configuration file in common locations
   */
  private findConfigFile(): string {
    const possiblePaths = [
      './config.json',
      './photo-organizer.config.json',
      path.join(process.cwd(), 'config.json'),
      path.join(process.cwd(), 'photo-organizer.config.json'),
      path.join(__dirname, '..', 'config.json')
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    // Return default path if no config file found
    return './config.json';
  }

  /**
   * Load configuration from file
   */
  private loadConfig(): PhotoOrganizerConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readJsonSync(this.configPath);
        return this.mergeConfig(ConfigManager.getDefaultConfig(), configData);
      }
    } catch (error) {
      console.warn(`Warning: Could not load config from ${this.configPath}. Using defaults.`);
    }

    return ConfigManager.getDefaultConfig();
  }

  /**
   * Deep merge configuration objects
   */
  private mergeConfig(base: PhotoOrganizerConfig, updates: any): PhotoOrganizerConfig {
    const result = { ...base };
    
    for (const key in updates) {
      if (updates[key] !== null && typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
        result[key as keyof PhotoOrganizerConfig] = {
          ...(result[key as keyof PhotoOrganizerConfig] as any),
          ...updates[key]
        };
      } else {
        result[key as keyof PhotoOrganizerConfig] = updates[key];
      }
    }
    
    return result;
  }

  /**
   * Save current configuration to file
   */
  async saveConfig(): Promise<void> {
    await this.saveConfigFile();
  }

  /**
   * Save configuration to file (internal method)
   */
  private async saveConfigFile(): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.configPath));
      await fs.writeJson(this.configPath, this.config, { spaces: 2 });
    } catch (error) {
      throw new Error(`Failed to save config to ${this.configPath}: ${error}`);
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const config = this.config;

    // Validate database config
    if (!config.database.path) {
      errors.push('Database path is required');
    }

    // Validate extraction config
    if (config.extraction.batchSize <= 0) {
      errors.push('Extraction batch size must be greater than 0');
    }
    if (config.extraction.maxConcurrent <= 0) {
      errors.push('Max concurrent extractions must be greater than 0');
    }
    if (!Array.isArray(config.extraction.supportedExtensions)) {
      errors.push('Supported extensions must be an array');
    }

    // Validate organization config
    if (!config.organization.defaultPattern) {
      errors.push('Default organization pattern is required');
    }
    if (config.organization.maxFilenameLength <= 0) {
      errors.push('Max filename length must be greater than 0');
    }

    // Validate logging config
    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLogLevels.includes(config.logging.level)) {
      errors.push(`Log level must be one of: ${validLogLevels.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
