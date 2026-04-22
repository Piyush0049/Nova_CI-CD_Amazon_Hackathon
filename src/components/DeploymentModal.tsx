'use client';

import { useState } from 'react';
import { FaLock, FaRocket, FaPlus, FaTrash, FaInfoCircle, FaPaste, FaFileCode, FaEye, FaEyeSlash } from 'react-icons/fa';
import Button from './ui/Button';
import Modal from './ui/Modal';

interface EnvVariable {
  key: string;
  value: string;
}

interface DeploymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeploy: (envVars: Record<string, string>) => void;
  pipelineName: string;
  repoFullName: string;
  githubToken?: string | null;
  savedEnvVars?: Record<string, string>;
  isDeploying: boolean;
  pipelineId?: string;
}

export default function DeploymentModal({
  isOpen,
  onClose,
  onDeploy,
  pipelineName,
  repoFullName,
  savedEnvVars,
  isDeploying,
  pipelineId,
}: DeploymentModalProps) {
  const [envVars, setEnvVars] = useState<EnvVariable[]>(() => {
    // Initialize with saved env vars if available
    if (savedEnvVars && Object.keys(savedEnvVars).length > 0) {
      return Object.entries(savedEnvVars).map(([key, value]) => ({ key, value }));
    }
    return [{ key: '', value: '' }];
  });
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [visibleValues, setVisibleValues] = useState<Set<number>>(new Set());
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const hasSavedVars = savedEnvVars && Object.keys(savedEnvVars).length > 0;

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const removeEnvVar = (index: number) => {
    if (envVars.length > 1) {
      setEnvVars(envVars.filter((_, i) => i !== index));
      // Remove from visible set
      const newVisible = new Set(visibleValues);
      newVisible.delete(index);
      setVisibleValues(newVisible);
    }
  };

  const toggleValueVisibility = (index: number) => {
    const newVisible = new Set(visibleValues);
    if (newVisible.has(index)) {
      newVisible.delete(index);
    } else {
      newVisible.add(index);
    }
    setVisibleValues(newVisible);
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...envVars];
    updated[index][field] = value;
    setEnvVars(updated);
  };

  const parseEnvText = (text: string) => {
    const lines = text.split('\n');
    const parsed: EnvVariable[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse KEY=VALUE format
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmed.substring(0, equalIndex).trim();
        const value = trimmed.substring(equalIndex + 1).trim();

        // Remove surrounding quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');

        if (key) {
          parsed.push({ key, value: cleanValue });
        }
      }
    }

    return parsed;
  };

  const handleBulkPaste = () => {
    if (!bulkText.trim()) {
      return;
    }

    const parsed = parseEnvText(bulkText);

    if (parsed.length > 0) {
      // Merge with existing vars (avoid duplicates)
      const existing = envVars.filter(v => v.key.trim() !== '');
      const existingKeys = new Set(existing.map(v => v.key));

      const newVars = parsed.filter(v => !existingKeys.has(v.key));

      setEnvVars([...existing, ...newVars]);
      setBulkText('');
      setShowBulkPaste(false);
    }
  };

  const handleDeploy = () => {
    // Convert array to object, filtering out empty keys
    const envObject: Record<string, string> = {};
    envVars.forEach(({ key, value }) => {
      if (key.trim()) {
        envObject[key.trim()] = value;
      }
    });
    onDeploy(envObject);
  };

  const handleClearSavedVars = async () => {
    if (!pipelineId) return;

    setIsClearing(true);
    try {
      const response = await fetch(`/api/pipelines?id=${pipelineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envVars: {} }),
      });

      if (!response.ok) {
        throw new Error('Failed to clear environment variables');
      }

      // Clear the local state
      setEnvVars([{ key: '', value: '' }]);
      setShowClearConfirm(false);
      alert('✅ Saved environment variables cleared successfully!');
    } catch (error: any) {
      alert(`❌ Failed to clear variables: ${error.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Deploy: ${pipelineName}`}
      type="default"
      size="lg"
    >
      <div className="space-y-6">
        {/* Repository Info Banner */}
        <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm">
            <FaRocket className="text-cyan-500" />
            <span className="text-muted-foreground">Deploying repository:</span>
            <span className="font-semibold text-foreground font-mono">{repoFullName}</span>
          </div>
        </div>
        {/* Bulk Paste Section */}
        {showBulkPaste ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold flex items-center gap-2">
                <FaFileCode className="text-cyan-500" />
                Paste .env file content
              </label>
              <button
                type="button"
                onClick={() => setShowBulkPaste(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>

            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={`Paste your .env file here:\n\nDATABASE_URL=mongodb://...\nAPI_KEY=your_key_here\nSECRET_KEY=your_secret\nPORT=3000\nNODE_ENV=production`}
              className="w-full h-48 px-4 py-3 bg-background border border-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-cyan-500 outline-none transition-all resize-none"
            />

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="primary"
                onClick={handleBulkPaste}
                disabled={!bulkText.trim()}
                className="flex items-center gap-2"
              >
                <FaPaste />
                Parse and Add Variables
              </Button>
              <p className="text-xs text-muted-foreground">
                Will extract all KEY=VALUE pairs from your pasted content
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">Environment Variables</label>
              <div className="flex items-center gap-2">
                {hasSavedVars && (
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(true)}
                    className="flex items-center gap-2 text-sm font-medium text-red-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10"
                    title="Clear all saved environment variables"
                  >
                    <FaTrash className="w-3 h-3" />
                    Clear Saved
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowBulkPaste(true)}
                  className="flex items-center gap-2 text-sm font-medium text-blue-500 hover:text-blue-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-500/10"
                >
                  <FaPaste className="w-3 h-3" />
                  Paste .env
                </button>
                <button
                  type="button"
                  onClick={addEnvVar}
                  className="flex items-center gap-2 text-sm font-medium text-cyan-500 hover:text-cyan-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-cyan-500/10"
                >
                  <FaPlus className="w-3 h-3" />
                  Add Variable
                </button>
              </div>
            </div>
            {hasSavedVars && (
              <div className="p-2 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-600 dark:text-green-400">
                ✅ {Object.keys(savedEnvVars || {}).length} environment variable(s) loaded from previous deployment
              </div>
            )}
          </div>
        )}

        {/* Environment Variables List */}
        {!showBulkPaste && (
          <>
            <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin pr-2">
              {envVars.map((envVar, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="VARIABLE_NAME"
                      value={envVar.key}
                      onChange={(e) => updateEnvVar(index, 'key', e.target.value.toUpperCase().replace(/\s/g, '_'))}
                      className="px-4 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
                    />
                    <div className="relative">
                      <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <input
                        type={visibleValues.has(index) ? 'text' : 'password'}
                        placeholder="value"
                        value={envVar.value}
                        onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                        className="w-full pl-9 pr-10 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => toggleValueVisibility(index)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        title={visibleValues.has(index) ? 'Hide value' : 'Show value'}
                      >
                        {visibleValues.has(index) ? (
                          <FaEyeSlash className="w-4 h-4" />
                        ) : (
                          <FaEye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  {envVars.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEnvVar(index)}
                      className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Remove variable"
                    >
                      <FaTrash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {envVars.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No environment variables added. Click &quot;Paste .env&quot; or &quot;Add Variable&quot; to add.
              </p>
            )}

            {/* Info Card */}
            <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
              <div className="flex items-start gap-3">
                <FaInfoCircle className="w-5 h-5 text-cyan-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-cyan-500 mb-1">Vercel-Style Bulk Paste</p>
                  <p className="text-muted-foreground">
                    Click <strong>&quot;Paste .env&quot;</strong> to paste your entire .env file at once. We&apos;ll automatically parse all KEY=VALUE pairs for you. Click the eye icon to show/hide values. Environment variables are saved with your pipeline for future deployments.
                  </p>
                </div>
              </div>
            </div>

            {/* Example */}
            <details className="p-3 bg-muted/50 rounded-lg">
              <summary className="text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground">
                Example .env format
              </summary>
              <pre className="mt-2 text-xs font-mono text-muted-foreground">
{`DATABASE_URL=mongodb://localhost:27017/db
API_KEY=abc123xyz
SECRET_KEY=your_secret_here
PORT=3000
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://api.example.com`}
              </pre>
            </details>
          </>
        )}

        {/* Action Buttons */}
        {!showBulkPaste && (
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isDeploying}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleDeploy}
              disabled={isDeploying}
              className="flex items-center gap-2"
            >
              {isDeploying ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Deploying...
                </>
              ) : (
                <>
                  <FaRocket />
                  Deploy to EC2
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <FaTrash className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Clear Saved Variables?</h3>
                <p className="text-sm text-muted-foreground">This action cannot be undone</p>
              </div>
            </div>

            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
              <p className="text-sm text-red-600 dark:text-red-400">
                This will permanently delete all {Object.keys(savedEnvVars || {}).length} saved environment variable(s) from this pipeline. You will need to re-enter them for future deployments.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowClearConfirm(false)}
                disabled={isClearing}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleClearSavedVars}
                disabled={isClearing}
                className="flex-1 bg-red-500 hover:bg-red-600"
              >
                {isClearing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                    Clearing...
                  </>
                ) : (
                  <>
                    <FaTrash className="mr-2" />
                    Clear Variables
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
