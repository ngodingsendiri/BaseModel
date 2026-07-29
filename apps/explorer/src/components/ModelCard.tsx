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
      'Free': 'badge-tier-free',
      'Budget-Friendly': 'badge-tier-budget',
      'Balanced': 'badge-tier-balanced',
      'Premium': 'badge-tier-premium',
    };
    return map[tierName] || 'badge-tier-unknown';
  };

  return (
    <div className="compact-card" onClick={() => onClick(model.model_id)}>
      {/* Col 1: Name & ID */}
      <div>
        <div className="model-name" title={model.name}>{model.name}</div>
        <div className="model-id" title={model.model_id}>{model.model_id}</div>
      </div>

      {/* Col 2: Context */}
      <div className="stat-info">
        {formatContext(model.context_window ?? 0)} ctx
      </div>

      {/* Col 3: Modalities */}
      <div className="modality-dots">
        {model.modality?.map((m: string) => (
          <div key={m} className="modality-dot" title={m} />
        ))}
      </div>

      {/* Col 4: Date */}
      <div className="stat-info">
        {model.release_date ? new Date(model.release_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : 'Unknown'}
      </div>

      {/* Col 5: Tier Badge */}
      <div>
        <span className={`badge ${getTierClass(tier)}`}>
          {tier}
        </span>
      </div>
    </div>
  );
}
