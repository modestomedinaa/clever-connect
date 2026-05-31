import React from 'react';

interface GoalCardProps {
  tag: string;
  tagVariant: 'orange' | 'green' | 'blue' | 'indigo';
  targetValue: string;
  dueDate: string;
  currentAmount: string;
  maxAmount: string;
  progressPercent: number;
}

export const GoalCard: React.FC<GoalCardProps> = ({ tag, tagVariant, targetValue, dueDate, currentAmount, maxAmount, progressPercent }) => {
  const pct = Math.min(Math.max(progressPercent, 0), 100);
  return (
    <div className="goal-card">
      <div className={`goal-card__tag goal-card__tag--${tagVariant}`}>
        ⚡ {tag}
      </div>
      <div className="goal-card__row">
        <div>
          <div className="goal-card__target-label">Target</div>
          <div className="goal-card__target-value">{targetValue}</div>
        </div>
        <div className="goal-card__due">Due Date: <strong>{dueDate}</strong></div>
      </div>
      <div className="goal-card__progress">
        <div className="goal-card__progress-labels">
          <span>{currentAmount}</span>
          <span>{maxAmount}</span>
        </div>
        <div className="goal-card__progress-bar">
          <div className={`goal-card__progress-bar-fill goal-card__progress-bar-fill--${tagVariant}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
};
