'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaPlay,
  FaCode,
  FaDownload,
  FaCopy,
  FaRocket,
  FaArrowRight,
  FaServer,
  FaCog,
  FaCheck,
  FaRobot,
  FaChartBar,
  FaFileCode,
  FaClipboardList,
  FaLightbulb,
  FaBox,
  FaSearch,
  FaFlask,
  FaTools
} from 'react-icons/fa';
import { Card } from './ui/Card';
import Button from './ui/Button';

interface Stage {
  name: string;
  jobs: Array<{
    name: string;
    commands: string[];
    image?: string;
  }>;
}

interface PipelineVisualizationFlowProps {
  yaml: string;
  stages: Stage[];
  detection: {
    language: string;
    framework: string;
    packageManager: string;
    buildTool: string;
    hasTests: boolean;
    hasLinter: boolean;
  };
  onDeploy: () => void;
  onEditYaml: () => void;
  isDeploying?: boolean;
  showActions?: boolean;
}

export function PipelineVisualizationFlow({
  yaml,
  stages,
  detection,
  onDeploy,
  onEditYaml,
  isDeploying = false,
  showActions = true,
}: PipelineVisualizationFlowProps) {
  const [copiedYaml, setCopiedYaml] = useState(false);
  const [activeView, setActiveView] = useState<'diagram' | 'yaml'>('diagram');

  const copyYaml = () => {
    navigator.clipboard.writeText(yaml);
    setCopiedYaml(true);
    setTimeout(() => setCopiedYaml(false), 2000);
  };

  const downloadYaml = () => {
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pipeline.yml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStageIcon = (stageName: string | undefined) => {
    if (!stageName) return <FaCog className="text-2xl" />;

    const name = stageName.toLowerCase();
    if (name.includes('install') || name.includes('setup')) return <FaBox className="text-2xl" />;
    if (name.includes('lint')) return <FaSearch className="text-2xl" />;
    if (name.includes('test')) return <FaFlask className="text-2xl" />;
    if (name.includes('build')) return <FaTools className="text-2xl" />;
    if (name.includes('deploy')) return <FaRocket className="text-2xl" />;
    return <FaCog className="text-2xl" />;
  };

  const getStageColor = (index: number) => {
    const colors = [
      'bg-blue-500',
      'bg-purple-500',
      'bg-green-500',
      'bg-orange-500',
      'bg-cyan-500',
    ];
    return colors[index % colors.length];
  };

  const getStageBorderColor = (index: number) => {
    const colors = [
      'border-blue-500',
      'border-purple-500',
      'border-green-500',
      'border-orange-500',
      'border-cyan-500',
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="space-y-6">
      {/* Header with Detection Info */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <FaRobot className="text-2xl text-cyan-500" />
                <h2 className="text-2xl font-bold">AI-Generated Pipeline</h2>
              </div>
              <p className="text-muted-foreground">Claude 4.6 Sonnet analyzed your repository</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Language</div>
              <div className="font-semibold">{String(detection.language || 'Unknown')}</div>
            </div>
            <div className="border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Framework</div>
              <div className="font-semibold">{String(detection.framework || 'Unknown')}</div>
            </div>
            <div className="border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Package Manager</div>
              <div className="font-semibold">{String(detection.packageManager || 'unknown')}</div>
            </div>
            <div className="border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Build Tool</div>
              <div className="font-semibold">{String(detection.buildTool || 'unknown')}</div>
            </div>
          </div>

          <div className="flex gap-3">
            {detection.hasTests && (
              <span className="px-3 py-1.5 bg-muted border border-border rounded-lg text-sm font-medium flex items-center gap-2">
                <FaCheckCircle className="text-green-500" /> Tests Detected
              </span>
            )}
            {detection.hasLinter && (
              <span className="px-3 py-1.5 bg-muted border border-border rounded-lg text-sm font-medium flex items-center gap-2">
                <FaCheckCircle className="text-blue-500" /> Linter Detected
              </span>
            )}
          </div>
        </Card>
      </motion.div>

      {/* View Toggle */}
      <Card className="p-1">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveView('diagram')}
            className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
              activeView === 'diagram'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            <FaChartBar className="text-sm" /> Pipeline Diagram
          </button>
          <button
            onClick={() => setActiveView('yaml')}
            className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
              activeView === 'yaml'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            <FaFileCode className="text-sm" /> YAML Code
          </button>
        </div>
      </Card>

      <AnimatePresence mode="wait">
        {activeView === 'diagram' ? (
          <motion.div
            key="diagram"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            {/* Pipeline Flow Diagram */}
            <Card className="p-6">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <FaServer className="text-cyan-500" />
                Pipeline Execution Flow
              </h3>

              <div className="relative">
                {/* Vertical Timeline */}
                <div className="absolute left-8 top-8 bottom-8 w-px bg-border"></div>

                <div className="space-y-6">
                  {stages && stages.length > 0 ? (
                    stages.map((stage, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="relative"
                      >
                        {/* Stage Circle */}
                        <div className={`absolute left-4 w-8 h-8 rounded-full ${getStageColor(index)} flex items-center justify-center text-white font-semibold text-sm shadow-sm z-10`}>
                          {index + 1}
                        </div>

                        {/* Stage Card */}
                        <div className="ml-20">
                          <Card className={`p-5 border-l-2 ${getStageBorderColor(index)} hover:shadow-lg transition-shadow duration-200`}>
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="text-muted-foreground">{getStageIcon(stage.name)}</div>
                                <div>
                                  <h4 className="font-semibold text-lg">{stage.name}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {stage.jobs?.length || 0} job{(stage.jobs?.length || 0) !== 1 ? 's' : ''}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Jobs */}
                            {stage.jobs && stage.jobs.length > 0 && (
                              <div className="space-y-3 mt-4">
                                {stage.jobs.map((job, jobIndex) => (
                                  <div
                                    key={jobIndex}
                                    className="bg-muted/30 rounded-lg p-3 border border-border"
                                  >
                                    <div className="flex items-center gap-2 mb-2">
                                      <FaCog className="text-sm text-muted-foreground" />
                                      <span className="font-medium text-sm">{job.name}</span>
                                      {job.image && (
                                        <span className="ml-auto text-xs text-muted-foreground bg-background px-2 py-0.5 rounded border border-border">
                                          {job.image}
                                        </span>
                                      )}
                                    </div>
                                    {job.commands && job.commands.length > 0 && (
                                      <div className="space-y-1">
                                        {job.commands
                                          .filter((cmd) => cmd && cmd.trim() && !cmd.trim().startsWith('#'))
                                          .map((cmd, cmdIndex) => (
                                            <div
                                              key={cmdIndex}
                                              className="text-xs font-mono bg-muted px-3 py-2 rounded flex items-center gap-2 border border-border"
                                            >
                                              <span className="text-muted-foreground">$</span>
                                              <span className="text-foreground">{cmd}</span>
                                            </div>
                                          ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </Card>
                        </div>

                        {/* Arrow to next stage */}
                        {index < stages.length - 1 && (
                          <div className="absolute left-7 -bottom-3 flex items-center justify-center w-2 h-6 z-20">
                            <FaArrowRight className="text-muted-foreground text-sm rotate-90" />
                          </div>
                        )}
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <FaCog className="text-4xl text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No pipeline stages found</p>
                    </div>
                  )}
                </div>

                {/* Final Success Icon */}
                {stages && stages.length > 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: stages.length * 0.1 + 0.2 }}
                    className="flex items-center justify-center mt-8"
                  >
                    <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white shadow-sm">
                      <FaCheck className="text-xl" />
                    </div>
                  </motion.div>
                )}
              </div>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 border">
                <div className="flex items-center gap-3">
                  <FaClipboardList className="text-2xl text-muted-foreground" />
                  <div>
                    <div className="text-2xl font-bold">{stages?.length || 0}</div>
                    <div className="text-sm text-muted-foreground">Total Stages</div>
                  </div>
                </div>
              </Card>
              <Card className="p-4 border">
                <div className="flex items-center gap-3">
                  <FaCog className="text-2xl text-muted-foreground" />
                  <div>
                    <div className="text-2xl font-bold">
                      {stages ? stages.reduce((acc, s) => acc + (s.jobs?.length || 0), 0) : 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Jobs</div>
                  </div>
                </div>
              </Card>
              <Card className="p-4 border">
                <div className="flex items-center gap-3">
                  <FaRobot className="text-2xl text-muted-foreground" />
                  <div>
                    <div className="text-xl font-semibold">AI Powered</div>
                    <div className="text-sm text-muted-foreground">Claude 4.6 Sonnet</div>
                  </div>
                </div>
              </Card>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="yaml"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <FaCode className="text-cyan-500" />
                  Generated YAML Pipeline
                </h3>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={copyYaml}
                    className="flex items-center gap-2"
                  >
                    {copiedYaml ? (
                      <>
                        <FaCheck /> Copied!
                      </>
                    ) : (
                      <>
                        <FaCopy /> Copy
                      </>
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={downloadYaml}
                    className="flex items-center gap-2"
                  >
                    <FaDownload /> Download
                  </Button>
                </div>
              </div>

              <div className="relative">
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono border border-border max-h-[600px] overflow-y-auto custom-scrollbar">
                  {yaml}
                </pre>
              </div>

              <div className="mt-4 p-4 bg-muted/50 border border-border rounded-lg">
                <div className="flex items-start gap-3">
                  <FaLightbulb className="text-lg text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium mb-1 text-sm">About this YAML</h4>
                    <p className="text-xs text-muted-foreground">
                      This pipeline was intelligently generated by Claude 4.6 Sonnet AI based on your repository&apos;s structure,
                      dependencies, and detected frameworks. You can edit it before deployment.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      {showActions && (
        <Card className="p-5">
          <div className="flex gap-3 flex-wrap">
            <Button
              variant="primary"
              size="lg"
              onClick={onDeploy}
              disabled={isDeploying}
              className="flex-1 min-w-[200px]"
            >
              {isDeploying ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Deploying...
                </>
              ) : (
                <>
                  <FaRocket className="mr-2 text-sm" />
                  Deploy to AWS EC2
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={onEditYaml}
              className="flex-1 min-w-[200px]"
            >
              <FaCode className="mr-2 text-sm" />
              Edit Pipeline
            </Button>
          </div>

          <div className="mt-3 text-center text-xs text-muted-foreground">
            <p>Deploy this pipeline to a new AWS EC2 instance</p>
          </div>
        </Card>
      )}
    </div>
  );
}
