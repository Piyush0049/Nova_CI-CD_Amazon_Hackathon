// Environment Variables and Secrets Management

import { Secret } from '@/types/cicd';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';

export class SecretsManager {
  private secrets: Map<string, Secret> = new Map();
  private encryptionKey: string;

  constructor(encryptionKey: string = process.env.SECRET_ENCRYPTION_KEY || 'demo-key') {
    this.encryptionKey = encryptionKey;
  }

  /**
   * Create a new secret
   */
  createSecret(
    key: string,
    value: string,
    scope: 'project' | 'group' | 'instance',
    projectId?: string,
    options: {
      masked?: boolean;
      protected?: boolean;
    } = {}
  ): Secret {
    const encryptedValue = this.encrypt(value);

    const secret: Secret = {
      id: nanoid(),
      key,
      value: encryptedValue,
      scope,
      projectId,
      masked: options.masked ?? true,
      protected: options.protected ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.secrets.set(secret.id, secret);
    console.log(`Secret '${key}' created with scope '${scope}'`);

    return secret;
  }

  /**
   * Get secret by ID
   */
  getSecret(secretId: string): Secret | undefined {
    return this.secrets.get(secretId);
  }

  /**
   * Get decrypted secret value
   */
  getSecretValue(secretId: string): string | null {
    const secret = this.secrets.get(secretId);
    if (!secret) return null;

    return this.decrypt(secret.value);
  }

  /**
   * Get all secrets for a project
   */
  getProjectSecrets(projectId: string): Secret[] {
    return Array.from(this.secrets.values()).filter(
      secret => secret.scope === 'project' && secret.projectId === projectId
    );
  }

  /**
   * Get all secrets for a scope
   */
  getSecretsByScope(scope: 'project' | 'group' | 'instance'): Secret[] {
    return Array.from(this.secrets.values()).filter(
      secret => secret.scope === scope
    );
  }

  /**
   * Update secret
   */
  updateSecret(
    secretId: string,
    updates: {
      value?: string;
      masked?: boolean;
      protected?: boolean;
    }
  ): Secret | null {
    const secret = this.secrets.get(secretId);
    if (!secret) return null;

    if (updates.value) {
      secret.value = this.encrypt(updates.value);
    }

    if (updates.masked !== undefined) {
      secret.masked = updates.masked;
    }

    if (updates.protected !== undefined) {
      secret.protected = updates.protected;
    }

    secret.updatedAt = new Date();
    this.secrets.set(secretId, secret);

    console.log(`Secret '${secret.key}' updated`);
    return secret;
  }

  /**
   * Delete secret
   */
  deleteSecret(secretId: string): boolean {
    const secret = this.secrets.get(secretId);
    if (!secret) return false;

    this.secrets.delete(secretId);
    console.log(`Secret '${secret.key}' deleted`);

    return true;
  }

  /**
   * Get secrets as environment variables
   */
  getSecretsAsEnv(projectId: string, scope: 'project' | 'group' | 'instance' = 'project'): Record<string, string> {
    const secrets = this.getProjectSecrets(projectId);
    const env: Record<string, string> = {};

    for (const secret of secrets) {
      const value = this.decrypt(secret.value);
      env[secret.key] = value;
    }

    return env;
  }

  /**
   * Mask secret in logs
   */
  maskSecret(text: string, secretId: string): string {
    const secret = this.secrets.get(secretId);
    if (!secret || !secret.masked) return text;

    const value = this.decrypt(secret.value);
    const masked = '*'.repeat(8);

    return text.replace(new RegExp(value, 'g'), masked);
  }

  /**
   * Mask all secrets in text
   */
  maskAllSecrets(text: string, projectId: string): string {
    let maskedText = text;
    const secrets = this.getProjectSecrets(projectId);

    for (const secret of secrets) {
      if (secret.masked) {
        maskedText = this.maskSecret(maskedText, secret.id);
      }
    }

    return maskedText;
  }

  /**
   * Encrypt value
   */
  private encrypt(value: string): string {
    // In production, use a proper encryption library
    // For demo purposes, we'll use a simple Base64 encoding
    try {
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv(algorithm, key, iv);
      let encrypted = cipher.update(value, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      // Fallback to base64
      return Buffer.from(value).toString('base64');
    }
  }

  /**
   * Decrypt value
   */
  private decrypt(encryptedValue: string): string {
    // In production, use a proper encryption library
    try {
      if (encryptedValue.includes(':')) {
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);

        const [ivHex, encrypted] = encryptedValue.split(':');
        const iv = Buffer.from(ivHex, 'hex');

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
      } else {
        // Fallback from base64
        return Buffer.from(encryptedValue, 'base64').toString('utf8');
      }
    } catch (error) {
      console.error('Decryption failed:', error);
      return '';
    }
  }

  /**
   * Validate secret key format
   */
  validateKey(key: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!key) {
      errors.push('Secret key is required');
    }

    if (key.length < 2) {
      errors.push('Secret key must be at least 2 characters long');
    }

    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      errors.push('Secret key must contain only uppercase letters, numbers, and underscores');
    }

    if (key.startsWith('CI_')) {
      errors.push('Secret key cannot start with CI_ (reserved prefix)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const secrets = Array.from(this.secrets.values());

    return {
      totalSecrets: secrets.length,
      byScope: {
        project: secrets.filter(s => s.scope === 'project').length,
        group: secrets.filter(s => s.scope === 'group').length,
        instance: secrets.filter(s => s.scope === 'instance').length,
      },
      masked: secrets.filter(s => s.masked).length,
      protected: secrets.filter(s => s.protected).length,
    };
  }
}

// Global secrets manager instance
export const secretsManager = new SecretsManager();
