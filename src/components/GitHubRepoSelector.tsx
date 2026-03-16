'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { FaLock, FaCode } from 'react-icons/fa';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  language: string;
  html_url: string;
  updated_at: string;
  private: boolean;
}

interface GitHubRepoSelectorProps {
  onSelectRepo: (repo: GitHubRepo) => void;
  accessToken: string;
}

export default function GitHubRepoSelector({ onSelectRepo, accessToken }: GitHubRepoSelectorProps) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'public' | 'private'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    loadRepositories();
  }, [accessToken]);

  const loadRepositories = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/github/repositories', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch repositories');
      }

      const data = await response.json();
      setRepos(data.repositories || []);
    } catch (error) {
      console.error('Failed to load repositories:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredRepos = repos.filter(repo => {
    const matchesSearch = repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         repo.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'all' ||
                         (filter === 'public' && !repo.private) ||
                         (filter === 'private' && repo.private);
    return matchesSearch && matchesFilter;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredRepos.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRepos = filteredRepos.slice(startIndex, endIndex);

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filter]);

  const getLanguageStyle = (language: string) => {
    const styles: Record<string, { gradient: string; text: string; glow: string }> = {
      JavaScript: {
        gradient: 'from-yellow-400 to-orange-500',
        text: 'text-yellow-900',
        glow: 'shadow-yellow-500/50'
      },
      TypeScript: {
        gradient: 'from-blue-500 to-blue-600',
        text: 'text-white',
        glow: 'shadow-blue-500/50'
      },
      Python: {
        gradient: 'from-blue-600 to-cyan-600',
        text: 'text-white',
        glow: 'shadow-blue-600/50'
      },
      Java: {
        gradient: 'from-red-500 to-orange-600',
        text: 'text-white',
        glow: 'shadow-red-500/50'
      },
      Go: {
        gradient: 'from-cyan-400 to-cyan-600',
        text: 'text-white',
        glow: 'shadow-cyan-500/50'
      },
      Rust: {
        gradient: 'from-orange-600 to-red-600',
        text: 'text-white',
        glow: 'shadow-orange-600/50'
      },
      Ruby: {
        gradient: 'from-red-600 to-pink-600',
        text: 'text-white',
        glow: 'shadow-red-600/50'
      },
      PHP: {
        gradient: 'from-purple-500 to-indigo-600',
        text: 'text-white',
        glow: 'shadow-purple-500/50'
      },
      C: {
        gradient: 'from-gray-600 to-gray-700',
        text: 'text-white',
        glow: 'shadow-gray-600/50'
      },
      'C++': {
        gradient: 'from-pink-500 to-purple-600',
        text: 'text-white',
        glow: 'shadow-pink-500/50'
      },
      'C#': {
        gradient: 'from-green-600 to-emerald-700',
        text: 'text-white',
        glow: 'shadow-green-600/50'
      },
    };
    return styles[language] || {
      gradient: 'from-gray-500 to-gray-600',
      text: 'text-white',
      glow: 'shadow-gray-500/50'
    };
  };

  if (loading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-4 text-lg">Loading repositories...</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Select a Repository</h1>
        <p className="text-muted-foreground">
          Choose a repository to create an AI-powered CI/CD pipeline
        </p>
      </div>

      {/* Filters */}
      <Card className="p-5">
        <div className="flex gap-4 items-center flex-wrap">
          <input
            type="text"
            placeholder="Search repositories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-[250px] px-4 py-3 border border-border/50 rounded-xl bg-background focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
          />

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'all' | 'public' | 'private')}
            className="px-4 py-3 border border-border/50 rounded-xl bg-background focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all font-semibold"
          >
            <option value="all">All Repositories</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
      </Card>

      {/* Repository List */}
      <div className="grid gap-4">
        {filteredRepos.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <p>No repositories found</p>
          </Card>
        ) : (
          paginatedRepos.map((repo) => (
            <Card
              key={repo.id}
              className="p-6 hover:shadow-2xl hover:shadow-cyan-500/20 transition-all duration-300 cursor-pointer border-2 border-transparent hover:border-cyan-500/50 hover:scale-[1.01] group"
              onClick={() => onSelectRepo(repo)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                    <h3 className="text-lg font-semibold">{repo.name}</h3>

                    {repo.private && (
                      <span className="group/badge relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-gray-700 to-gray-800 text-gray-100 rounded-full border border-gray-600/50 shadow-lg hover:shadow-gray-700/50 transition-all duration-300 hover:scale-105">
                        <FaLock className="w-2.5 h-2.5 group-hover/badge:animate-pulse" />
                        Private
                        <div className="absolute inset-0 bg-gradient-to-r from-gray-700 to-gray-800 rounded-full blur-lg opacity-0 group-hover/badge:opacity-30 transition-opacity -z-10" />
                      </span>
                    )}

                    {repo.language && (
                      <span className={`group/badge relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-gradient-to-r ${getLanguageStyle(repo.language).gradient} ${getLanguageStyle(repo.language).text} rounded-full shadow-lg hover:${getLanguageStyle(repo.language).glow} transition-all duration-300 hover:scale-105 ring-1 ring-white/20`}>
                        <FaCode className="w-2.5 h-2.5 group-hover/badge:animate-pulse" />
                        {repo.language}
                        <div className={`absolute inset-0 bg-gradient-to-r ${getLanguageStyle(repo.language).gradient} rounded-full blur-lg opacity-0 group-hover/badge:opacity-40 transition-opacity -z-10`} />
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {repo.description || 'No description'}
                  </p>

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{repo.full_name}</span>
                    <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  className="opacity-80 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRepo(repo);
                  }}
                >
                   Create Pipeline
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{startIndex + 1}</span> to{' '}
              <span className="font-semibold text-foreground">
                {Math.min(endIndex, filteredRepos.length)}
              </span>{' '}
              of <span className="font-semibold text-foreground">{filteredRepos.length}</span> repositories
            </div>

            <div className="flex items-center gap-2">
              {/* Previous Button */}
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-semibold text-sm hover:scale-105 disabled:hover:scale-100 border border-border/50"
              >
                Previous
              </button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                  // Show first page, last page, current page, and pages around current
                  const showPage =
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1);

                  const showEllipsis =
                    (page === currentPage - 2 && currentPage > 3) ||
                    (page === currentPage + 2 && currentPage < totalPages - 2);

                  if (showEllipsis) {
                    return (
                      <span key={page} className="px-2 text-muted-foreground">
                        ...
                      </span>
                    );
                  }

                  if (!showPage) return null;

                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-10 h-10 rounded-xl font-semibold text-sm transition-all duration-300 hover:scale-110 ${
                        currentPage === page
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/40'
                          : 'bg-muted hover:bg-muted/80 border border-border/50'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>

              {/* Next Button */}
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-semibold text-sm hover:scale-105 disabled:hover:scale-100 border border-border/50"
              >
                Next
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Stats */}
      <Card className="p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{repos.length}</span> repositories
          </span>
          <Button variant="secondary" size="sm" onClick={loadRepositories}>
            Refresh
          </Button>
        </div>
      </Card>
    </div>
  );
}
