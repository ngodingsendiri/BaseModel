import type { AlternativeResult } from '@basemodel/intelligence';
import type { Model } from '@basemodel/schema';

interface AlternativesModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalModel: Model | null;
  alternatives: AlternativeResult[];
}

export function AlternativesModal({
  isOpen,
  onClose,
  originalModel,
  alternatives,
}: AlternativesModalProps) {
  if (!isOpen || !originalModel) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="close-button" onClick={onClose}>
          ✕
        </button>

        <div className="header" style={{ textAlign: 'left', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{originalModel.name}</h2>
          <p>Alternative Models</p>
        </div>

        <div className="alternatives-section">
          <h3 className="alternatives-title">Top Suggested Alternatives</h3>

          {alternatives.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>
              No direct alternatives found matching the capabilities and context window.
            </p>
          ) : (
            alternatives.map((alt) => (
              <div key={alt.model.model_id} className="alt-card">
                <div>
                  <h4 style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                    {alt.model.name}
                  </h4>
                  <div className="alt-reason">{alt.reason}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="badge badge-modality" style={{ marginRight: 0 }}>
                    {(alt.model.context_window ?? 0) / 1000}k ctx
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
