import type { Model } from '@basemodel/schema';

interface ModelCardProps {
  model: Model;
  tier: string;
  onClick: (modelId: string) => void;
}

export function ModelCard({ model, tier, onClick }: ModelCardProps) {
  // Format numbers (e.g. 128000 -> 128k)
  const formatContext = (ctx: number) => {
    if (ctx >= 1000000) return `${(ctx / 1000000).toFixed(1)}M`;
    if (ctx >= 1000) return `${Math.floor(ctx / 1000)}k`;
    return ctx.toString();
  };

  const getTierClass = (tierName: string) => {
    const map: Record<string, string> = {
      Free: 'badge-tier-free',
      'Budget-Friendly': 'badge-tier-budget',
      Balanced: 'badge-tier-balanced',
      Premium: 'badge-tier-premium',
    };
    return map[tierName] || 'badge-tier-unknown';
  };

  return (
    <div className="model-card" onClick={() => onClick(model.model_id)}>
      <div className="card-header">
        <div>
          <div className="model-name" title={model.name}>
            {model.name}
          </div>
          <div className="model-id" title={model.model_id}>
            {model.model_id}
          </div>
        </div>
      </div>

      <div className="stat-info">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>
        {formatContext(model.context_window ?? 0)} context window
      </div>

      <div className="stat-info">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>
        {model.release_date
          ? new Date(model.release_date).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
            })
          : 'Unknown date'}
      </div>

      <div className="card-footer">
        <div className="modality-dots">
          {model.modality?.map((m: string) => (
            <div key={m} className="modality-dot" title={m} />
          ))}
        </div>
        <span className={`badge ${getTierClass(tier)}`}>{tier}</span>
      </div>
    </div>
  );
}
