import React, { useState, useEffect, useCallback } from 'react';
import {
  getLifecycle, transitionStage, placeHold, releaseHold,
  STAGE_LABELS, STAGE_ORDER,
  type ProjectLifecycle, type LifecycleTransition,
} from '../../api/lifecycle';
import { useAuthStore } from '../../store/authStore';
import './ProjectLifecyclePanel.css';

interface Props {
  headerId: number;
  readonly?: boolean;
}

function formatDateTime(s?: string): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function stageIdx(stage: string): number {
  return STAGE_ORDER.indexOf(stage as any);
}

export const ProjectLifecyclePanel: React.FC<Props> = ({ headerId, readonly }) => {
  const { user } = useAuthStore();
  const role = user?.role ?? 'PM';

  const [lifecycle, setLifecycle] = useState<ProjectLifecycle | null>(null);
  const [history, setHistory] = useState<LifecycleTransition[]>([]);
  const [stageOrder, setStageOrder] = useState<string[]>([...STAGE_ORDER]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Transition form state
  const [showForm, setShowForm] = useState(false);
  const [formRemarks, setFormRemarks] = useState('');
  const [formEvidence, setFormEvidence] = useState('');
  const [formReopen, setFormReopen] = useState(false);
  const [formTargetStage, setFormTargetStage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Hold form state
  const [showHoldForm, setShowHoldForm] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [releaseRemarks, setReleaseRemarks] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLifecycle(headerId);
      setLifecycle(data.lifecycle);
      setHistory(data.transitions);
      setStageOrder(data.stageOrder);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load lifecycle.');
    } finally {
      setLoading(false);
    }
  }, [headerId]);

  useEffect(() => { load(); }, [load]);

  const nextStage = lifecycle
    ? stageOrder[stageIdx(lifecycle.currentStage) + 1]
    : undefined;

  const handleTransition = async () => {
    if (!formRemarks.trim()) return;
    setSubmitting(true);
    try {
      await transitionStage(
        headerId, formTargetStage || nextStage || '',
        formRemarks, formEvidence || undefined,
        formReopen || undefined
      );
      setShowForm(false);
      setFormRemarks('');
      setFormEvidence('');
      setFormReopen(false);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Transition failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleHold = async () => {
    if (!holdReason.trim()) return;
    setSubmitting(true);
    try {
      await placeHold(headerId, holdReason);
      setShowHoldForm(false);
      setHoldReason('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to place hold.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRelease = async () => {
    setSubmitting(true);
    try {
      await releaseHold(headerId, releaseRemarks || 'Hold released.');
      setReleaseRemarks('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to release hold.');
    } finally {
      setSubmitting(false);
    }
  };

  const canAdvance = !readonly && lifecycle &&
    !lifecycle.isOnHold &&
    lifecycle.currentStage !== 'CLOSED' &&
    (role === 'MD' || role === 'PM' || role === 'SUPER_ADMIN');

  const canReopen = !readonly && (role === 'MD' || role === 'SUPER_ADMIN');
  const canHold   = !readonly && (role === 'MD' || role === 'PMC' || role === 'SUPER_ADMIN');

  if (loading) return (
    <div className="lifecycle-loading">
      <div className="lifecycle-spinner" />
      <span>Loading lifecycle…</span>
    </div>
  );

  if (!lifecycle) return (
    <div className="lifecycle-error">{error ?? 'No lifecycle data found.'}</div>
  );

  const currentIdx = stageIdx(lifecycle.currentStage);

  return (
    <div className="lifecycle-panel">
      {/* ── Hold Banner ── */}
      {lifecycle.isOnHold && (
        <div className="lifecycle-hold-banner">
          <span className="lifecycle-hold-icon">⚠</span>
          <div>
            <strong>Financial Hold Active</strong>
            <p>{lifecycle.holdReason}</p>
          </div>
          {canHold && (
            <button
              className="lifecycle-btn lifecycle-btn--release"
              onClick={handleRelease}
              disabled={submitting}
            >
              Release Hold
            </button>
          )}
        </div>
      )}

      {/* ── Stage Pipeline ── */}
      <div className="lifecycle-pipeline" role="list" aria-label="Project lifecycle stages">
        {stageOrder.map((stage, idx) => {
          const isDone    = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isFuture  = idx > currentIdx;
          return (
            <React.Fragment key={stage}>
              <div
                className={`lifecycle-stage ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''} ${isFuture ? 'future' : ''}`}
                role="listitem"
                aria-current={isCurrent ? 'step' : undefined}
                title={STAGE_LABELS[stage]}
              >
                <div className="lifecycle-stage__dot">
                  {isDone && <span className="lifecycle-check">✓</span>}
                  {isCurrent && <span className="lifecycle-pulse" />}
                  {isFuture && <span className="lifecycle-num">{idx + 1}</span>}
                </div>
                <span className="lifecycle-stage__label">{STAGE_LABELS[stage]}</span>
                {isCurrent && lifecycle.slaDeadline && (
                  <span className={`lifecycle-sla ${lifecycle.isOverdue ? 'overdue' : ''}`}>
                    SLA: {formatDateTime(lifecycle.slaDeadline)}
                  </span>
                )}
              </div>
              {idx < stageOrder.length - 1 && (
                <div className={`lifecycle-connector ${idx < currentIdx ? 'done' : ''}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Action Buttons ── */}
      {!readonly && (
        <div className="lifecycle-actions">
          {canAdvance && nextStage && (
            <button
              className="lifecycle-btn lifecycle-btn--advance"
              onClick={() => {
                setFormTargetStage(nextStage);
                setFormReopen(false);
                setShowForm(true);
              }}
            >
              → Advance to {STAGE_LABELS[nextStage]}
            </button>
          )}
          {canReopen && lifecycle.currentStage !== 'DRAFT' && (
            <button
              className="lifecycle-btn lifecycle-btn--reopen"
              onClick={() => {
                setFormTargetStage('');
                setFormReopen(true);
                setShowForm(true);
              }}
            >
              ↩ Reopen Stage
            </button>
          )}
          {canHold && !lifecycle.isOnHold && (
            <button
              className="lifecycle-btn lifecycle-btn--hold"
              onClick={() => setShowHoldForm(true)}
            >
              ⊘ Place Hold
            </button>
          )}
        </div>
      )}

      {/* ── Transition Form ── */}
      {showForm && (
        <div className="lifecycle-form-overlay">
          <div className="lifecycle-form">
            <h3>{formReopen ? '↩ Reopen Lifecycle Stage' : `→ Advance to ${STAGE_LABELS[formTargetStage]}`}</h3>
            {formReopen && (
              <div className="form-group">
                <label>Target Stage</label>
                <select
                  value={formTargetStage}
                  onChange={e => setFormTargetStage(e.target.value)}
                  className="lifecycle-select"
                >
                  <option value="">Select stage…</option>
                  {stageOrder.slice(0, currentIdx).map(s => (
                    <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Remarks <span className="required">*</span></label>
              <textarea
                className="lifecycle-textarea"
                rows={4}
                placeholder={formReopen
                  ? 'Mandatory: Explain why this stage is being rolled back…'
                  : 'Transition remarks (mandatory)…'}
                value={formRemarks}
                onChange={e => setFormRemarks(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Evidence URL <span className="optional">(optional)</span></label>
              <input
                className="lifecycle-input"
                type="url"
                placeholder="https://drive.google.com/…"
                value={formEvidence}
                onChange={e => setFormEvidence(e.target.value)}
              />
            </div>
            {error && <div className="lifecycle-form-error">{error}</div>}
            <div className="lifecycle-form-actions">
              <button
                className="lifecycle-btn lifecycle-btn--confirm"
                onClick={handleTransition}
                disabled={submitting || !formRemarks.trim() || (formReopen && !formTargetStage)}
              >
                {submitting ? 'Saving…' : 'Confirm Transition'}
              </button>
              <button
                className="lifecycle-btn lifecycle-btn--cancel"
                onClick={() => { setShowForm(false); setError(null); }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hold Form ── */}
      {showHoldForm && (
        <div className="lifecycle-form-overlay">
          <div className="lifecycle-form">
            <h3>⊘ Place Financial Hold</h3>
            <div className="form-group">
              <label>Hold Reason <span className="required">*</span></label>
              <textarea
                className="lifecycle-textarea"
                rows={4}
                placeholder="Describe the reason for placing this project on hold…"
                value={holdReason}
                onChange={e => setHoldReason(e.target.value)}
              />
            </div>
            {error && <div className="lifecycle-form-error">{error}</div>}
            <div className="lifecycle-form-actions">
              <button
                className="lifecycle-btn lifecycle-btn--hold"
                onClick={handleHold}
                disabled={submitting || !holdReason.trim()}
              >
                {submitting ? 'Placing Hold…' : 'Confirm Hold'}
              </button>
              <button
                className="lifecycle-btn lifecycle-btn--cancel"
                onClick={() => { setShowHoldForm(false); setError(null); }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transition History ── */}
      <div className="lifecycle-history">
        <h4 className="lifecycle-history__title">Transition Audit Trail</h4>
        {history.length === 0 ? (
          <div className="lifecycle-history__empty">No transitions recorded yet.</div>
        ) : (
          <div className="lifecycle-timeline">
            {history.map(t => (
              <div key={t.id} className={`lifecycle-timeline__item ${t.transitionType.toLowerCase()}`}>
                <div className="lifecycle-timeline__dot" />
                <div className="lifecycle-timeline__content">
                  <div className="lifecycle-timeline__header">
                    <span className={`lifecycle-badge lifecycle-badge--${t.transitionType.toLowerCase()}`}>
                      {t.transitionType}
                    </span>
                    {t.fromStage && (
                      <span className="lifecycle-arrow">
                        {STAGE_LABELS[t.fromStage] ?? t.fromStage}
                        &nbsp;→&nbsp;
                        {STAGE_LABELS[t.toStage] ?? t.toStage}
                      </span>
                    )}
                    {!t.fromStage && (
                      <span className="lifecycle-arrow">
                        Initialised at {STAGE_LABELS[t.toStage] ?? t.toStage}
                      </span>
                    )}
                  </div>
                  <p className="lifecycle-timeline__remarks">{t.remarks}</p>
                  <div className="lifecycle-timeline__meta">
                    <span>By: <strong>{t.performedBy}</strong></span>
                    {t.actingAs && <span className="acting-as">Acting as: {t.actingAs}</span>}
                    {t.evidenceUrl && (
                      <a href={t.evidenceUrl} target="_blank" rel="noreferrer" className="lifecycle-evidence">
                        📎 Evidence
                      </a>
                    )}
                    <span className="lifecycle-timestamp">{formatDateTime(t.transitionedAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
