import {
  type AlternativeResult,
  findAlternatives,
  IntelligenceEngine,
} from '@basemodel/intelligence';
import type { Model } from '@basemodel/schema';
import { useEffect, useMemo, useState } from 'react';
import capabilitiesData from '../../../dist/capabilities.json';
import intelligenceData from '../../../dist/intelligence.json';
// Dynamically import the JSON files from the dist directory
import modelsData from '../../../dist/models.json';
import pricingData from '../../../dist/pricing.json';
import providersData from '../../../dist/providers.json';
import { AlternativesModal } from './components/AlternativesModal';
import { ModelCard } from './components/ModelCard';

import './index.css';

interface IntelligenceRecord {
  model_id: string;
  cost_tier: string;
  blended_cost_per_1m: number;
  alternatives: { model_id: string; name: string; reason: string }[];
}

export default function App() {
  const [engine, setEngine] = useState<IntelligenceEngine | null>(null);

  // States
  const [selectedProviderId, setSelectedProviderId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeResult[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    // Hydrate the Intelligence Engine
    const initEngine = async () => {
      const eng = new IntelligenceEngine();
      eng.hydrate({
        models: (modelsData as unknown as { models: typeof eng.models }).models,
        providers: (providersData as unknown as { providers: typeof eng.providers }).providers,
        capabilities: (capabilitiesData as unknown as { capabilities: typeof eng.capabilities })
          .capabilities,
        pricing: (pricingData as unknown as { pricing: typeof eng.pricing }).pricing,
      });
      setEngine(eng);
    };
    initEngine();
  }, []);

  const getTierForModel = (modelId: string) => {
    const records = (intelligenceData as unknown as { intelligence: IntelligenceRecord[] })
      .intelligence;
    const intel = records.find((i) => i.model_id === modelId);
    return intel ? intel.cost_tier : 'Unknown';
  };

  const handleModelClick = (modelId: string) => {
    if (!engine) return;
    const model = engine.models.find((m) => m.model_id === modelId);
    if (model) {
      const alts = findAlternatives(engine, modelId, 3);
      setSelectedModel(model);
      setAlternatives(alts);
      setIsModalOpen(true);
    }
  };

  // Derived state: filtered models
  const displayedModels = useMemo(() => {
    if (!engine) return [];
    let filtered = engine.models;

    if (selectedProviderId !== 'all') {
      filtered = filtered.filter((m) => m.provider_id === selectedProviderId);
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) => m.name.toLowerCase().includes(q) || m.model_id.toLowerCase().includes(q),
      );
    }

    // Sort by name
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [engine, selectedProviderId, searchQuery]);

  if (!engine) {
    return (
      <div className="dashboard-layout" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <h2 style={{ color: 'var(--text-secondary)' }}>Loading Workspace...</h2>
      </div>
    );
  }

  const activeProvider = engine.providers.find((p) => p.provider_id === selectedProviderId);
  const pageTitle = activeProvider ? activeProvider.name : 'All Providers';

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>BaseModel Explorer</h1>
          <p>Intelligence SDK Demo</p>
        </div>

        <div className="sidebar-menu">
          <div className="menu-section-title">Overview</div>
          <button
            type="button"
            className={`menu-item ${selectedProviderId === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedProviderId('all')}
          >
            <span>All Providers</span>
            <span className="menu-badge">{engine.models.length}</span>
          </button>

          <div className="menu-section-title" style={{ marginTop: '1.5rem' }}>
            Providers
          </div>
          {engine.providers.map((provider) => {
            const modelCount = engine.models.filter(
              (m) => m.provider_id === provider.provider_id,
            ).length;
            return (
              <button
                key={provider.provider_id}
                type="button"
                className={`menu-item ${selectedProviderId === provider.provider_id ? 'active' : ''}`}
                onClick={() => setSelectedProviderId(provider.provider_id)}
              >
                <span>{provider.name}</span>
                <span className="menu-badge">{modelCount}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="content-header">
          <div>
            <h2 className="content-title">{pageTitle}</h2>
            <p className="content-subtitle">
              Showing {displayedModels.length} models{' '}
              {activeProvider ? `from ${activeProvider.name}` : ''}
            </p>
          </div>
          <div>
            <input
              type="text"
              className="search-input"
              placeholder="Filter models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="content-body">
          {displayedModels.map((model) => (
            <ModelCard
              key={model.model_id}
              model={model}
              tier={getTierForModel(model.model_id)}
              onClick={handleModelClick}
            />
          ))}
          {displayedModels.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '4rem' }}>
              No models found in this view.
            </div>
          )}
        </div>
      </main>

      <AlternativesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        originalModel={selectedModel}
        alternatives={alternatives}
      />
    </div>
  );
}
