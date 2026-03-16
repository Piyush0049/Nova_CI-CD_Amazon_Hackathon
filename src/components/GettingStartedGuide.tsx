'use client';

import { useState } from 'react';
import { Card } from './ui/Card';
import Button from './ui/Button';
import { FaGithub, FaRocket, FaTimes, FaCheckCircle } from 'react-icons/fa';
import { GitBranch, Sparkles } from 'lucide-react';

interface GettingStartedGuideProps {
  onClose: () => void;
  onNavigateToRepos: () => void;
}

export default function GettingStartedGuide({ onClose, onNavigateToRepos }: GettingStartedGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      icon: <FaGithub className="w-8 h-8" />,
      title: 'Connect GitHub',
      description: 'Link your GitHub account to access your repositories',
      color: 'from-gray-700 to-gray-900',
    },
    {
      icon: <GitBranch className="w-8 h-8" />,
      title: 'Select Repository',
      description: 'Choose a repository to create a CI/CD pipeline for',
      color: 'from-cyan-500 to-blue-500',
    },
    {
      icon: <Sparkles className="w-8 h-8" />,
      title: 'AI Analysis',
      description: 'Our AI analyzes your code and generates an optimized pipeline',
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: <FaRocket className="w-8 h-8" />,
      title: 'Deploy',
      description: 'Deploy your pipeline to AWS EC2 with a single click',
      color: 'from-green-500 to-emerald-500',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <Card className="max-w-3xl w-full p-0 overflow-hidden animate-bounce-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 text-white px-8 py-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold mb-2">Welcome to Nova CI/CD!</h2>
              <p className="text-cyan-50">
                Let&apos;s get you started with automated deployments in 4 simple steps
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-all"
            >
              <FaTimes className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Steps */}
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`p-6 rounded-2xl border-2 transition-all duration-300 cursor-pointer ${
                  currentStep === index
                    ? 'border-cyan-500 bg-cyan-500/10 scale-105'
                    : 'border-border/50 hover:border-cyan-500/50 hover:scale-102'
                }`}
                onClick={() => setCurrentStep(index)}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center text-white shadow-lg flex-shrink-0`}>
                    {step.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-muted-foreground">
                        STEP {index + 1}
                      </span>
                      {currentStep > index && (
                        <FaCheckCircle className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                    <h3 className="font-bold text-lg mb-1">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-muted-foreground">
                Progress
              </span>
              <span className="text-sm font-semibold text-cyan-500">
                {Math.round(((currentStep + 1) / steps.length) * 100)}%
              </span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 transition-all duration-500"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
            >
              Skip Tutorial
            </Button>
            <div className="flex gap-3">
              {currentStep > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCurrentStep(currentStep - 1)}
                >
                  Previous
                </Button>
              )}
              {currentStep < steps.length - 1 ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setCurrentStep(currentStep + 1)}
                >
                  Next Step
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    onClose();
                    onNavigateToRepos();
                  }}
                  className="flex items-center gap-2"
                >
                  <FaRocket /> Get Started Now
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
