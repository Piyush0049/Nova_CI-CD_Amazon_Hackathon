// Artifact Storage and Management System

import { BuildArtifact } from '@/types/pipeline';
import { nanoid } from 'nanoid';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ArtifactManager {
  private artifactsDir: string;
  private artifacts: Map<string, BuildArtifact> = new Map();

  constructor(artifactsDir: string = './artifacts') {
    this.artifactsDir = artifactsDir;
    this.ensureArtifactsDir();
  }

  /**
   * Ensure artifacts directory exists
   */
  private async ensureArtifactsDir(): Promise<void> {
    try {
      await fs.mkdir(this.artifactsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create artifacts directory:', error);
    }
  }

  /**
   * Store an artifact
   */
  async storeArtifact(
    pipelineId: string,
    jobId: string,
    name: string,
    sourcePath: string,
    expiresIn?: string
  ): Promise<BuildArtifact> {
    const artifactId = nanoid();
    const destinationPath = path.join(
      this.artifactsDir,
      pipelineId,
      jobId,
      name
    );

    // Create directory structure
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });

    // Copy artifact
    try {
      const stats = await fs.stat(sourcePath);

      if (stats.isDirectory()) {
        await this.copyDirectory(sourcePath, destinationPath);
      } else {
        await fs.copyFile(sourcePath, destinationPath);
      }

      const fileStats = await fs.stat(destinationPath);

      // Calculate expiration
      let expiresAt: Date | undefined;
      if (expiresIn) {
        expiresAt = this.calculateExpiration(expiresIn);
      }

      const artifact: BuildArtifact = {
        id: artifactId,
        pipelineId,
        jobId,
        name,
        size: fileStats.size,
        path: destinationPath,
        createdAt: new Date(),
        expiresAt,
        downloadUrl: `/artifacts/${artifactId}/download`,
      };

      this.artifacts.set(artifactId, artifact);

      console.log(`Artifact ${name} stored for pipeline ${pipelineId}`);
      return artifact;
    } catch (error) {
      console.error(`Failed to store artifact ${name}:`, error);
      throw new Error(`Failed to store artifact: ${error}`);
    }
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(source: string, destination: string): Promise<void> {
    await fs.mkdir(destination, { recursive: true });

    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath);
      } else {
        await fs.copyFile(sourcePath, destPath);
      }
    }
  }

  /**
   * Calculate expiration date from duration string
   */
  private calculateExpiration(duration: string): Date {
    const now = new Date();
    const match = duration.match(/^(\d+)\s*(min|hour|day|week|month)s?$/);

    if (!match) {
      // Default to 30 days
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    const [, value, unit] = match;
    const num = parseInt(value, 10);

    const multipliers: Record<string, number> = {
      min: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    };

    return new Date(now.getTime() + num * multipliers[unit]);
  }

  /**
   * Get artifact by ID
   */
  getArtifact(artifactId: string): BuildArtifact | undefined {
    return this.artifacts.get(artifactId);
  }

  /**
   * Get all artifacts for a pipeline
   */
  getPipelineArtifacts(pipelineId: string): BuildArtifact[] {
    return Array.from(this.artifacts.values()).filter(
      a => a.pipelineId === pipelineId
    );
  }

  /**
   * Get all artifacts for a job
   */
  getJobArtifacts(jobId: string): BuildArtifact[] {
    return Array.from(this.artifacts.values()).filter(
      a => a.jobId === jobId
    );
  }

  /**
   * Delete an artifact
   */
  async deleteArtifact(artifactId: string): Promise<boolean> {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return false;

    try {
      await fs.rm(artifact.path, { recursive: true, force: true });
      this.artifacts.delete(artifactId);
      console.log(`Artifact ${artifact.name} deleted`);
      return true;
    } catch (error) {
      console.error(`Failed to delete artifact ${artifactId}:`, error);
      return false;
    }
  }

  /**
   * Clean up expired artifacts
   */
  async cleanupExpiredArtifacts(): Promise<number> {
    const now = new Date();
    let deletedCount = 0;

    for (const [artifactId, artifact] of this.artifacts.entries()) {
      if (artifact.expiresAt && artifact.expiresAt < now) {
        const deleted = await this.deleteArtifact(artifactId);
        if (deleted) deletedCount++;
      }
    }

    console.log(`Cleaned up ${deletedCount} expired artifacts`);
    return deletedCount;
  }

  /**
   * Get artifact download stream
   */
  async getArtifactStream(artifactId: string): Promise<fs.FileHandle | null> {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return null;

    try {
      return await fs.open(artifact.path, 'r');
    } catch (error) {
      console.error(`Failed to open artifact ${artifactId}:`, error);
      return null;
    }
  }

  /**
   * Get total storage size
   */
  getTotalSize(): number {
    return Array.from(this.artifacts.values()).reduce(
      (total, artifact) => total + artifact.size,
      0
    );
  }

  /**
   * Get storage statistics
   */
  getStatistics() {
    const artifacts = Array.from(this.artifacts.values());

    return {
      totalArtifacts: artifacts.length,
      totalSize: this.getTotalSize(),
      expiredArtifacts: artifacts.filter(
        a => a.expiresAt && a.expiresAt < new Date()
      ).length,
      artifactsByPipeline: this.groupBy(artifacts, 'pipelineId'),
    };
  }

  private groupBy<T>(array: T[], key: keyof T): Record<string, number> {
    return array.reduce((acc, item) => {
      const groupKey = String(item[key]);
      acc[groupKey] = (acc[groupKey] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}

// Global artifact manager instance
export const artifactManager = new ArtifactManager();
