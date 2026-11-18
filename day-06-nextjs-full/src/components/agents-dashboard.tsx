'use client';

import React, { useState, useCallback } from 'react';

export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AgentResponse {
  success: boolean;
  agentId: string;
  agentName: string;
  response?: string;
  error?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

export interface OrchestrationResult {
  success: boolean;
  agents: AgentResponse[];
  totalLatencyMs: number;
  error?: string;
}

interface AgentCardProps {
  config: AgentConfig;
  isSelected: boolean;
  onToggle: (agentId: string) => void;
}

const AgentCard: React.FC<AgentCardProps> = ({ config, isSelected, onToggle }) => (
  <div
    className={`rounded-lg border p-4 cursor-pointer transition-colors ${
      isSelected
        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
        : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 hover:border-emerald-300'
    }`}
    onClick={() => onToggle(config.id)}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
            isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-gray-400'
          }`}
        >
          {isSelected && (
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{config.name}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">ID: {config.id}</p>
        </div>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Temp: {config.temperature ?? 0.3} | Max: {config.maxTokens ?? 512} tokens
      </div>
    </div>
  </div>
);

interface AgentsDashboardProps {
  availableAgents: AgentConfig[];
}

export const AgentsDashboard: React.FC<AgentsDashboardProps> = ({ availableAgents }) => {
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [userMessage, setUserMessage] = useState('');
  const [result, setResult] = useState<OrchestrationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [parallel, setParallel] = useState(true);

  const toggleAgent = useCallback((agentId: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }, []);

  const handleExecute = useCallback(async () => {
    if (selectedAgents.size === 0 || !userMessage.trim()) {
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const requests = Array.from(selectedAgents).map((agentId) => ({
        agentId,
        userMessage: userMessage.trim(),
      }));

      const response = await fetch('/api/orchestration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests, parallel }),
      });

      const data = await response.json();

      if (!response.ok) {
        setResult({
          success: false,
          agents: [],
          totalLatencyMs: 0,
          error: data.error || 'Unknown error',
        });
        return;
      }

      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        agents: [],
        totalLatencyMs: 0,
        error: error instanceof Error ? error.message : 'Network error',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedAgents, userMessage, parallel]);

  return (
    <div className="space-y-6">
      {/* Agent Selection */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Select Agents
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Choose one or more agents to execute. Selected agents will receive the same message.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              config={agent}
              isSelected={selectedAgents.has(agent.id)}
              onToggle={toggleAgent}
            />
          ))}
        </div>
      </div>

      {/* Execution Controls */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label
              htmlFor="agent-message"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Message to Agents
            </label>
            <textarea
              id="agent-message"
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              placeholder="Enter your supervisory query or task..."
              className="w-full h-32 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
          <div className="sm:w-48">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Execution Mode
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setParallel(true)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  parallel
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Parallel
              </button>
              <button
                onClick={() => setParallel(false)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  !parallel
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Sequential
              </button>
            </div>
            <button
              onClick={handleExecute}
              disabled={selectedAgents.size === 0 || !userMessage.trim() || loading}
              className="w-full mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed"
            >
              {loading ? 'Executing...' : 'Execute Agents'}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Results ({result.agents.length} agents)
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Total latency: {result.totalLatencyMs}ms
            </span>
          </div>

          {!result.success && result.error && (
            <div className="rounded-lg border border-red-500 bg-red-50 dark:bg-red-900/20 p-4">
              <p className="text-sm text-red-700 dark:text-red-300">{result.error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {result.agents.map((agent) => (
              <div
                key={agent.agentId}
                className={`rounded-lg border p-4 ${
                  agent.success
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-red-500 bg-red-50 dark:bg-red-900/20'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    {agent.agentName}
                  </h3>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      agent.success
                        ? 'bg-emerald-500 text-white'
                        : 'bg-red-500 text-white'
                    }`}
                  >
                    {agent.success ? 'Success' : 'Failed'}
                  </span>
                </div>

                {agent.success ? (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {agent.response}
                    </p>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Latency: {agent.latencyMs}ms
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-red-700 dark:text-red-300">{agent.error}</p>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Latency: {agent.latencyMs}ms
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
