'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import yaml from 'js-yaml';

interface PipelineEditorProps {
  initialYaml?: string;
  onSave?: (yaml: string) => void;
  isSaving?: boolean;
}

export default function PipelineEditor({ initialYaml = '', onSave, isSaving = false }: PipelineEditorProps) {
  const [yamlContent, setYamlContent] = useState(initialYaml);
  const [errors, setErrors] = useState<string[]>([]);
  const [showValidationSuccess, setShowValidationSuccess] = useState(false);

  // Update yamlContent when initialYaml changes
  useEffect(() => {
    if (initialYaml) {
      setYamlContent(initialYaml);
    }
  }, [initialYaml]);

  const validateYaml = (): boolean => {
    console.log('Validating YAML...');
    const validationErrors: string[] = [];

    // Basic YAML validation
    if (!yamlContent.trim()) {
      validationErrors.push('YAML configuration cannot be empty');
      setErrors(validationErrors);
      return false;
    }

    // Try to parse YAML
    try {
      const parsedYaml = yaml.load(yamlContent) as any;

      if (!parsedYaml || typeof parsedYaml !== 'object') {
        validationErrors.push('Invalid YAML format: must be a valid YAML object');
      } else {
        // Check for required fields
        if (!parsedYaml.stages || !Array.isArray(parsedYaml.stages)) {
          validationErrors.push('Pipeline must include a "stages:" array');
        }

        if (parsedYaml.stages && parsedYaml.stages.length === 0) {
          validationErrors.push('Pipeline must have at least one stage');
        }
      }
    } catch (err: any) {
      validationErrors.push(`YAML syntax error: ${err.message || 'Invalid YAML syntax'}`);
    }

    setErrors(validationErrors);

    if (validationErrors.length === 0) {
      setShowValidationSuccess(true);
      return true;
    }
    return false;
  };

  const handleSave = () => {
    const isValid = validateYaml();
    if (isValid) {
      onSave?.(yamlContent);
    }
  };

  return (
    <div className="space-y-4">
      <Modal
        isOpen={showValidationSuccess}
        onClose={() => setShowValidationSuccess(false)}
        title="Validation Successful"
        type="success"
        size="sm"
        actions={
          <Button type="button" variant="primary" onClick={() => setShowValidationSuccess(false)}>
            OK
          </Button>
        }
      >
        <p className="text-gray-700 dark:text-gray-300">
          YAML validation completed successfully! Your pipeline configuration is valid.
        </p>
      </Modal>

      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">Pipeline Configuration</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              YAML Configuration
            </label>
            <textarea
              value={yamlContent}
              onChange={(e) => setYamlContent(e.target.value)}
              className="w-full h-96 font-mono text-sm p-4 border rounded-lg bg-gray-50 dark:bg-gray-900"
              placeholder="Enter your pipeline configuration in YAML format..."
            />
          </div>

          {errors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <h3 className="font-semibold text-red-800 dark:text-red-200 mb-2">
                Validation Errors:
              </h3>
              <ul className="list-disc list-inside space-y-1 text-red-700 dark:text-red-300">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground mb-3">
              Review your pipeline configuration above. Click "Create Pipeline" to save and deploy it.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleSave}
                variant="primary"
                className="flex items-center gap-2"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Creating Pipeline...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Create Pipeline
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
