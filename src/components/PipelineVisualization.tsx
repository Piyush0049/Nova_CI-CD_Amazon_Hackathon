'use client';

import { useEffect, useState, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'react-flow-renderer';
import { Card } from '@/components/ui/Card';
import { FaCheckCircle, FaCog, FaRocket, FaFlask, FaHammer } from 'react-icons/fa';
import yaml from 'js-yaml';
import '@/styles/react-flow-dark.css';

interface PipelineVisualizationProps {
  yamlContent: string;
  pipelineName: string;
}

interface StageNode {
  name: string;
  jobs: string[];
  type: 'install' | 'setup' | 'lint' | 'test' | 'build' | 'deploy' | 'default';
}

const stageIcons = {
  install: FaCog,
  setup: FaCog,
  lint: FaCheckCircle,
  test: FaFlask,
  build: FaHammer,
  deploy: FaRocket,
  default: FaCog,
};

const stageColors = {
  install: { bg: '#1e3a8a', border: '#3b82f6', text: '#93c5fd' },
  setup: { bg: '#1e3a8a', border: '#3b82f6', text: '#93c5fd' },
  lint: { bg: '#581c87', border: '#a855f7', text: '#e9d5ff' },
  test: { bg: '#92400e', border: '#f59e0b', text: '#fde68a' },
  build: { bg: '#14532d', border: '#22c55e', text: '#bbf7d0' },
  deploy: { bg: '#881337', border: '#f43f5e', text: '#fecdd3' },
  default: { bg: '#1f2937', border: '#6b7280', text: '#d1d5db' },
};

export default function PipelineVisualization({ yamlContent, pipelineName }: PipelineVisualizationProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!yamlContent || yamlContent.trim() === '') {
      setError('No pipeline configuration provided');
      setNodes([]);
      setEdges([]);
      return;
    }

    try {
      const parsedYaml = yaml.load(yamlContent) as any;

      if (!parsedYaml || typeof parsedYaml !== 'object') {
        setError('Invalid pipeline YAML format');
        setNodes([]);
        setEdges([]);
        return;
      }

      const { nodes: generatedNodes, edges: generatedEdges } = generateFlowDiagram(parsedYaml);
      setNodes(generatedNodes);
      setEdges(generatedEdges);
      setError(null);
    } catch (err: any) {
      setError(`Failed to parse pipeline YAML: ${err.message || 'Invalid YAML syntax'}`);
      console.error('YAML Parse Error:', err);
      setNodes([]);
      setEdges([]);
    }
  }, [yamlContent, setNodes, setEdges]);

  const generateFlowDiagram = (parsedYaml: any): { nodes: Node[]; edges: Edge[] } => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const stages = Array.isArray(parsedYaml.stages) ? parsedYaml.stages : [];

    if (stages.length === 0) {
      // No stages found, create a simple diagram with just start and end
      nodes.push({
        id: 'start',
        type: 'input',
        data: {
          label: (
            <div className="flex items-center gap-2 px-4 py-2">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
              <strong>Start Pipeline</strong>
            </div>
          )
        },
        position: { x: 50, y: 200 },
        style: {
          background: '#4CAF50',
          color: 'white',
          border: '2px solid #2E7D32',
          borderRadius: '10px',
          fontSize: '14px',
          fontWeight: 'bold',
          padding: '10px',
        },
      });

      nodes.push({
        id: 'end',
        type: 'output',
        data: {
          label: (
            <div className="flex items-center gap-2 px-4 py-2">
              <FaCheckCircle />
              <strong>No Stages Defined</strong>
            </div>
          )
        },
        position: { x: 400, y: 200 },
        style: {
          background: '#2196F3',
          color: 'white',
          border: '2px solid #1565C0',
          borderRadius: '10px',
          fontSize: '14px',
          fontWeight: 'bold',
          padding: '10px',
        },
      });

      edges.push({
        id: 'edge-start-end',
        source: 'start',
        target: 'end',
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#2196F3', strokeWidth: 3 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#2196F3',
        },
      });

      return { nodes, edges };
    }

    // Create start node
    nodes.push({
      id: 'start',
      type: 'input',
      data: {
        label: (
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
            <strong>Start Pipeline</strong>
          </div>
        )
      },
      position: { x: 50, y: 200 },
      style: {
        background: '#4CAF50',
        color: 'white',
        border: '2px solid #2E7D32',
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: 'bold',
        padding: '10px',
      },
    });

    // Extract jobs grouped by stage
    const stageJobsMap = new Map<string, StageNode>();

    Object.keys(parsedYaml).forEach((key) => {
      if (key !== 'stages' && key !== 'variables' && key !== 'cache') {
        const job = parsedYaml[key];
        if (job && job.stage) {
          const stageName = job.stage;
          if (!stageJobsMap.has(stageName)) {
            stageJobsMap.set(stageName, {
              name: stageName,
              jobs: [],
              type: getStageType(stageName),
            });
          }
          stageJobsMap.get(stageName)!.jobs.push(key);
        }
      }
    });

    // Create stage nodes (horizontal layout)
    let xPosition = 250;
    const yBasePosition = 150;
    let previousStageId = 'start';

    stages.forEach((stage: string, index: number) => {
      const stageData = stageJobsMap.get(stage);
      if (!stageData) return;

      const stageType = stageData.type;
      const colors = stageColors[stageType];
      const Icon = stageIcons[stageType];

      // Create stage container node
      const stageId = `stage-${stage}`;
      nodes.push({
        id: stageId,
        data: {
          label: (
            <div className="px-6 py-4">
              <div className="flex items-center gap-3 mb-3">
                <Icon className="text-xl" style={{ color: colors.text }} />
                <strong className="text-lg" style={{ color: colors.text }}>
                  {stage.charAt(0).toUpperCase() + stage.slice(1)}
                </strong>
              </div>
              <div className="space-y-2">
                {stageData.jobs.map((job) => (
                  <div
                    key={job}
                    className="text-sm px-3 py-2 rounded-md bg-black bg-opacity-30"
                    style={{ color: colors.text }}
                  >
                    {job.replace(/_/g, ' ')}
                  </div>
                ))}
              </div>
            </div>
          ),
        },
        position: { x: xPosition, y: yBasePosition },
        style: {
          background: colors.bg,
          border: `3px solid ${colors.border}`,
          borderRadius: '12px',
          minWidth: '250px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        },
      });

      // Create edge from previous stage
      edges.push({
        id: `edge-${previousStageId}-${stageId}`,
        source: previousStageId,
        target: stageId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: colors.border, strokeWidth: 3 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: colors.border,
        },
      });

      previousStageId = stageId;
      xPosition += 350;
    });

    // Create end node
    nodes.push({
      id: 'end',
      type: 'output',
      data: {
        label: (
          <div className="flex items-center gap-2 px-4 py-2">
            <FaCheckCircle />
            <strong>Pipeline Complete</strong>
          </div>
        )
      },
      position: { x: xPosition, y: 200 },
      style: {
        background: '#2196F3',
        color: 'white',
        border: '2px solid #1565C0',
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: 'bold',
        padding: '10px',
      },
    });

    // Connect last stage to end
    edges.push({
      id: `edge-${previousStageId}-end`,
      source: previousStageId,
      target: 'end',
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#2196F3', strokeWidth: 3 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#2196F3',
      },
    });

    return { nodes, edges };
  };

  const getStageType = (stageName: string): StageNode['type'] => {
    const lowerStage = stageName.toLowerCase();
    if (lowerStage.includes('install') || lowerStage.includes('setup')) return 'setup';
    if (lowerStage.includes('lint')) return 'lint';
    if (lowerStage.includes('test')) return 'test';
    if (lowerStage.includes('build')) return 'build';
    if (lowerStage.includes('deploy')) return 'deploy';
    return 'default';
  };

  if (error) {
    return (
      <Card className="p-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-semibold text-red-800 dark:text-red-200">Pipeline Visualization Error</p>
          </div>
          <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          <p className="text-xs text-red-600 dark:text-red-400">
            Make sure your pipeline YAML is valid and contains the required structure (stages, jobs).
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden bg-card border-2 border-cyan-500/30 shadow-2xl shadow-cyan-500/20">
      <div className="bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 text-white px-6 py-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-2xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center animate-pulse-scale">
                <FaRocket className="text-xl" />
              </div>
              {pipelineName}
            </h3>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-xs font-semibold">
                {nodes.length - 2} stages
              </span>
              <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-xs font-semibold flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                Active
              </span>
            </div>
          </div>
          <p className="text-sm text-cyan-50">Interactive pipeline flow visualization</p>
        </div>
      </div>
      <div style={{ height: '500px', background: 'hsl(220 27% 9%)' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          attributionPosition="bottom-left"
        >
          <Background color="hsl(220 27% 14%)" gap={16} />
          <Controls className="bg-card/80 backdrop-blur-sm border border-cyan-500/20 rounded-xl" />
          <MiniMap
            nodeColor={(node) => {
              if (node.id === 'start') return '#22d3ee';
              if (node.id === 'end') return '#3b82f6';
              return '#22d3ee';
            }}
            nodeBorderRadius={12}
            className="bg-card/80 backdrop-blur-sm border border-cyan-500/20 rounded-xl"
          />
        </ReactFlow>
      </div>
    </Card>
  );
}
