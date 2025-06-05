import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs-extra';
import { PhotoMetadata } from './types';
import { ConfigManager } from './config-manager';

export class DatabaseManager {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    const configManager = ConfigManager.getInstance();
    this.dbPath = dbPath || configManager.getDatabaseConfig().path;
  }

  /**
   * Initialize the database and create tables
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      fs.ensureDirSync(dbDir);

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(new Error(`Failed to open database: ${err.message}`));
          return;
        }

        this.createTables()
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  /**
   * Create the photos table with all metadata fields
   */
  private async createTables(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS photos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT NOT NULL,
          filepath TEXT UNIQUE NOT NULL,
          file_size INTEGER,
          date_modified DATETIME,
          file_extension TEXT,
          
          -- EXIF data
          date_time_original DATETIME,
          camera TEXT,
          make TEXT,
          model TEXT,
          lens TEXT,
          focal_length REAL,
          focal_length_35mm REAL,
          aperture REAL,
          shutter_speed TEXT,
          iso INTEGER,
          flash TEXT,
          white_balance TEXT,
          exposure_mode TEXT,
          metering_mode TEXT,
          
          -- Image properties
          image_width INTEGER,
          image_height INTEGER,
          orientation INTEGER,
          color_space TEXT,
          
          -- GPS data
          gps_latitude REAL,
          gps_longitude REAL,
          gps_altitude REAL,
          gps_direction REAL,
          
          -- Additional metadata
          software TEXT,
          artist TEXT,
          copyright TEXT,
          keywords TEXT,
          rating INTEGER,
            -- Computed fields
          aspect_ratio REAL,
          megapixels REAL,
          
          -- Duplicate detection
          file_hash TEXT,
          perceptual_hash TEXT,
          
          -- Timestamps
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      this.db.run(createTableSQL, (err) => {
        if (err) {
          reject(new Error(`Failed to create table: ${err.message}`));
          return;
        }

        // Create indexes for common queries
        this.createIndexes()
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  /**
   * Create indexes for performance
   */
  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_filepath ON photos(filepath)',
      'CREATE INDEX IF NOT EXISTS idx_date_time_original ON photos(date_time_original)',
      'CREATE INDEX IF NOT EXISTS idx_camera ON photos(camera)',
      'CREATE INDEX IF NOT EXISTS idx_file_extension ON photos(file_extension)',
      'CREATE INDEX IF NOT EXISTS idx_make_model ON photos(make, model)'
    ];

    for (const indexSQL of indexes) {
      await new Promise<void>((resolve, reject) => {
        this.db!.run(indexSQL, (err) => {
          if (err) reject(new Error(`Failed to create index: ${err.message}`));
          else resolve();
        });
      });
    }
  }

  /**
   * Insert or update photo metadata
   */
  async upsertPhoto(metadata: PhotoMetadata): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }      const sql = `
        INSERT OR REPLACE INTO photos (
          filename, filepath, file_size, date_modified, file_extension,
          date_time_original, camera, make, model, lens,
          focal_length, focal_length_35mm, aperture, shutter_speed, iso,
          flash, white_balance, exposure_mode, metering_mode,
          image_width, image_height, orientation, color_space,
          gps_latitude, gps_longitude, gps_altitude, gps_direction,
          software, artist, copyright, keywords, rating,
          aspect_ratio, megapixels, file_hash, perceptual_hash
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?
        )
      `;

      const params = [
        metadata.filename,
        metadata.filepath,
        metadata.fileSize,
        metadata.dateModified?.toISOString(),
        metadata.fileExtension,
        metadata.dateTimeOriginal?.toISOString(),
        metadata.camera,
        metadata.make,
        metadata.model,
        metadata.lens,
        metadata.focalLength,
        metadata.focalLengthIn35mm,
        metadata.aperture,
        metadata.shutterSpeed,
        metadata.iso,
        metadata.flash,
        metadata.whiteBalance,
        metadata.exposureMode,
        metadata.meteringMode,
        metadata.imageWidth,
        metadata.imageHeight,
        metadata.orientation,
        metadata.colorSpace,
        metadata.gpsLatitude,
        metadata.gpsLongitude,
        metadata.gpsAltitude,
        metadata.gpsDirection,
        metadata.software,
        metadata.artist,
        metadata.copyright,        metadata.keywords?.join(', '),
        metadata.rating,
        metadata.aspectRatio,
        metadata.megapixels,
        metadata.fileHash,
        metadata.perceptualHash
      ];

      this.db.run(sql, params, (err) => {
        if (err) {
          reject(new Error(`Failed to insert/update photo: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Insert multiple photos in a batch
   */
  async upsertPhotos(metadataList: PhotoMetadata[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.serialize(() => {
        this.db!.run('BEGIN TRANSACTION');

        let completed = 0;
        let hasError = false;

        for (const metadata of metadataList) {
          this.upsertPhoto(metadata)
            .then(() => {
              completed++;
              if (completed === metadataList.length && !hasError) {
                this.db!.run('COMMIT', (err) => {
                  if (err) reject(new Error(`Failed to commit transaction: ${err.message}`));
                  else resolve();
                });
              }
            })
            .catch((error) => {
              if (!hasError) {
                hasError = true;
                this.db!.run('ROLLBACK');
                reject(error);
              }
            });
        }
      });
    });
  }

  /**
   * Get photo by filepath
   */
  async getPhoto(filepath: string): Promise<PhotoMetadata | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.get(
        'SELECT * FROM photos WHERE filepath = ?',
        [filepath],
        (err, row) => {
          if (err) {
            reject(new Error(`Failed to get photo: ${err.message}`));
          } else {
            resolve(row ? this.rowToMetadata(row) : null);
          }
        }
      );
    });
  }

  /**
   * Search photos with filters
   */
  async searchPhotos(filters: {
    camera?: string;
    dateFrom?: Date;
    dateTo?: Date;
    extension?: string;
    hasGPS?: boolean;
    minMegapixels?: number;
    maxMegapixels?: number;
  } = {}): Promise<PhotoMetadata[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      let sql = 'SELECT * FROM photos WHERE 1=1';
      const params: any[] = [];

      if (filters.camera) {
        sql += ' AND camera LIKE ?';
        params.push(`%${filters.camera}%`);
      }

      if (filters.dateFrom) {
        sql += ' AND date_time_original >= ?';
        params.push(filters.dateFrom.toISOString());
      }

      if (filters.dateTo) {
        sql += ' AND date_time_original <= ?';
        params.push(filters.dateTo.toISOString());
      }

      if (filters.extension) {
        sql += ' AND file_extension = ?';
        params.push(filters.extension.toLowerCase());
      }

      if (filters.hasGPS) {
        sql += ' AND gps_latitude IS NOT NULL AND gps_longitude IS NOT NULL';
      }

      if (filters.minMegapixels) {
        sql += ' AND megapixels >= ?';
        params.push(filters.minMegapixels);
      }

      if (filters.maxMegapixels) {
        sql += ' AND megapixels <= ?';
        params.push(filters.maxMegapixels);
      }

      sql += ' ORDER BY date_time_original DESC';

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(new Error(`Failed to search photos: ${err.message}`));
        } else {
          resolve((rows as any[]).map(row => this.rowToMetadata(row)));
        }
      });
    });
  }

  /**
   * Get statistics about the photo collection
   */  async getStats(): Promise<{
    totalPhotos: number;
    cameras: { camera: string; count: number }[];
    extensions: { extension: string; count: number }[];
    dateRange: { earliest?: Date; latest?: Date };
  }> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      // Get total count
      this.db.get('SELECT COUNT(*) as total FROM photos', (err, totalRow: any) => {
        if (err) {
          reject(new Error(`Failed to get stats: ${err.message}`));
          return;
        }

        // Get camera stats
        this.db!.all(
          'SELECT camera, COUNT(*) as count FROM photos WHERE camera IS NOT NULL GROUP BY camera ORDER BY count DESC LIMIT 10',
          (err, cameraRows: any[]) => {
            if (err) {
              reject(new Error(`Failed to get camera stats: ${err.message}`));
              return;
            }

            // Get extension stats
            this.db!.all(
              'SELECT file_extension as extension, COUNT(*) as count FROM photos GROUP BY file_extension ORDER BY count DESC',
              (err, extensionRows: any[]) => {
                if (err) {
                  reject(new Error(`Failed to get extension stats: ${err.message}`));
                  return;
                }

                // Get date range
                this.db!.get(
                  'SELECT MIN(date_time_original) as earliest, MAX(date_time_original) as latest FROM photos WHERE date_time_original IS NOT NULL',
                  (err, dateRow: any) => {
                    if (err) {
                      reject(new Error(`Failed to get date range: ${err.message}`));
                      return;
                    }

                    resolve({
                      totalPhotos: totalRow.total,
                      cameras: cameraRows,
                      extensions: extensionRows,
                      dateRange: {
                        earliest: dateRow.earliest ? new Date(dateRow.earliest) : undefined,
                        latest: dateRow.latest ? new Date(dateRow.latest) : undefined
                      }
                    });
                  }
                );
              }
            );
          }
        );
      });
    });
  }

  /**
   * Convert database row to PhotoMetadata
   */
  private rowToMetadata(row: any): PhotoMetadata {
    return {
      filename: row.filename,
      filepath: row.filepath,
      fileSize: row.file_size,
      dateModified: row.date_modified ? new Date(row.date_modified) : new Date(),
      fileExtension: row.file_extension,
      dateTimeOriginal: row.date_time_original ? new Date(row.date_time_original) : undefined,
      camera: row.camera,
      make: row.make,
      model: row.model,
      lens: row.lens,
      focalLength: row.focal_length,
      focalLengthIn35mm: row.focal_length_35mm,
      aperture: row.aperture,
      shutterSpeed: row.shutter_speed,
      iso: row.iso,
      flash: row.flash,
      whiteBalance: row.white_balance,
      exposureMode: row.exposure_mode,
      meteringMode: row.metering_mode,
      imageWidth: row.image_width,
      imageHeight: row.image_height,
      orientation: row.orientation,
      colorSpace: row.color_space,
      gpsLatitude: row.gps_latitude,
      gpsLongitude: row.gps_longitude,
      gpsAltitude: row.gps_altitude,
      gpsDirection: row.gps_direction,
      software: row.software,
      artist: row.artist,
      copyright: row.copyright,      
      keywords: row.keywords ? row.keywords.split(', ') : undefined,
      rating: row.rating,
      aspectRatio: row.aspect_ratio,
      megapixels: row.megapixels,
      fileHash: row.file_hash,
      perceptualHash: row.perceptual_hash
    };  }

  /**
   * Get all photos with their hashes for duplicate detection
   */
  async getAllPhotosWithHashes(): Promise<PhotoMetadata[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.all(
        'SELECT * FROM photos WHERE file_hash IS NOT NULL OR perceptual_hash IS NOT NULL',
        [],
        (err, rows) => {
          if (err) {
            reject(new Error(`Failed to get photos with hashes: ${err.message}`));
          } else {
            const photos = rows.map(row => this.rowToMetadata(row));
            resolve(photos);
          }
        }
      );
    });
  }

  /**
   * Get photos by file hash (exact duplicates)
   */
  async getPhotosByFileHash(fileHash: string): Promise<PhotoMetadata[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.all(
        'SELECT * FROM photos WHERE file_hash = ?',
        [fileHash],
        (err, rows) => {
          if (err) {
            reject(new Error(`Failed to get photos by file hash: ${err.message}`));
          } else {
            const photos = rows.map(row => this.rowToMetadata(row));
            resolve(photos);
          }
        }
      );
    });
  }

  /**
   * Update hashes for a specific photo
   */
  async updatePhotoHashes(filepath: string, fileHash?: string, perceptualHash?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.run(
        'UPDATE photos SET file_hash = ?, perceptual_hash = ? WHERE filepath = ?',
        [fileHash, perceptualHash, filepath],
        (err) => {
          if (err) {
            reject(new Error(`Failed to update photo hashes: ${err.message}`));
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(new Error(`Failed to close database: ${err.message}`));
          } else {
            this.db = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}
