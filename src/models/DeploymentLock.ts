import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDeploymentLock extends Document {
  isLocked: boolean;
  deploymentId?: string;
  repoFullName?: string;
  startedAt?: Date;
  lockedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeploymentLockSchema = new Schema<IDeploymentLock>(
  {
    isLocked: {
      type: Boolean,
      required: true,
      default: false,
    },
    deploymentId: {
      type: String,
      required: false,
    },
    repoFullName: {
      type: String,
      required: false,
    },
    startedAt: {
      type: Date,
      required: false,
    },
    lockedBy: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Singleton pattern - only one lock document
DeploymentLockSchema.index({ isLocked: 1 });

const DeploymentLock: Model<IDeploymentLock> =
  mongoose.models.DeploymentLock ||
  mongoose.model<IDeploymentLock>('DeploymentLock', DeploymentLockSchema);

export default DeploymentLock;

/**
 * Helper functions for deployment locking
 */

/**
 * Check if a deployment is currently in progress
 */
export async function isDeploymentInProgress(): Promise<{
  locked: boolean;
  details?: {
    repoFullName: string;
    startedAt: Date;
    duration: number;
  };
}> {
  const lock = await DeploymentLock.findOne({});

  if (!lock || !lock.isLocked) {
    return { locked: false };
  }

  const duration = lock.startedAt
    ? Math.floor((Date.now() - lock.startedAt.getTime()) / 1000)
    : 0;

  return {
    locked: true,
    details: {
      repoFullName: lock.repoFullName || 'Unknown',
      startedAt: lock.startedAt || new Date(),
      duration,
    },
  };
}

/**
 * Acquire deployment lock
 */
export async function acquireDeploymentLock(
  deploymentId: string,
  repoFullName: string,
  userId?: string
): Promise<boolean> {
  try {
    // Try to find existing lock or create new one
    let lock = await DeploymentLock.findOne({});

    if (!lock) {
      // Create new lock document
      lock = new DeploymentLock({
        isLocked: true,
        deploymentId,
        repoFullName,
        startedAt: new Date(),
        lockedBy: userId,
      });
      await lock.save();
      return true;
    }

    // If already locked, cannot acquire
    if (lock.isLocked) {
      return false;
    }

    // Update existing lock
    lock.isLocked = true;
    lock.deploymentId = deploymentId;
    lock.repoFullName = repoFullName;
    lock.startedAt = new Date();
    lock.lockedBy = userId;
    await lock.save();

    return true;
  } catch (error) {
    console.error('[LOCK] Error acquiring deployment lock:', error);
    return false;
  }
}

/**
 * Release deployment lock
 */
export async function releaseDeploymentLock(): Promise<void> {
  try {
    const lock = await DeploymentLock.findOne({});

    if (lock) {
      lock.isLocked = false;
      lock.deploymentId = undefined;
      lock.repoFullName = undefined;
      lock.startedAt = undefined;
      lock.lockedBy = undefined;
      await lock.save();
    }
  } catch (error) {
    console.error('[LOCK] Error releasing deployment lock:', error);
  }
}

/**
 * Force clear lock (admin function)
 */
export async function forceClearLock(): Promise<void> {
  try {
    await DeploymentLock.deleteMany({});
    console.log('[LOCK] Force cleared all locks');
  } catch (error) {
    console.error('[LOCK] Error force clearing lock:', error);
  }
}
