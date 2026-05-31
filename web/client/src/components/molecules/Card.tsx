import React from 'react';
import { FiPlus } from 'react-icons/fi';

export interface CardColumnProps {
  subLabel: string;
  value: string;
  subValue?: string;
  changeText: string;
  changeDirection: 'up' | 'down';
}

interface CardProps {
  variant: 'single' | 'split';
  labelIcon: React.ReactNode;
  labelText: string;

  // Single-column metrics props
  title?: string;
  value?: string;
  changeText?: string;
  changeDirection?: 'up' | 'down';
  description?: string;
  rightActionButton?: React.ReactNode;
  onRightActionClick?: () => void;

  // Split-column props
  columns?: [CardColumnProps, CardColumnProps];
  onPlusClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  variant,
  labelIcon,
  labelText,
  title,
  value,
  changeText,
  changeDirection,
  description,
  rightActionButton,
  onRightActionClick,
  columns,
  onPlusClick
}) => {
  if (variant === 'split') {
    return (
      <div className="summary-card">
        <div className="summary-card__label">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {labelIcon}
            {labelText}
          </span>
          <div className="summary-card__plus" onClick={onPlusClick}>
            <FiPlus size={12} />
          </div>
        </div>
        <div className="summary-card__cols">
          {columns?.map((col, i) => (
            <div key={i}>
              <div className="summary-card__col-label">{col.subLabel}</div>
              <div className="summary-card__col-value">
                <span className="num">{col.value}</span>
                {col.subValue && <span className="amount">{col.subValue}</span>}
              </div>
              <div className={`summary-card__col-change summary-card__col-change--${col.changeDirection}`}>
                {col.changeDirection === 'up' ? '▲' : '▼'} {col.changeText}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Variant Single / Metrics Card
  return (
    <div className="g-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="g-card__label">
            {labelIcon}
            <span>{labelText}</span>
          </div>
          {title && <div className="g-card__subtitle">{title}</div>}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            {value && <span className="g-card__value">{value}</span>}
            {changeText && (
              <span className={`g-card__change g-card__change--${changeDirection}`}>
                {changeDirection === 'up' ? '+' : '-'}{changeText}
              </span>
            )}
          </div>
          {description && <div className="g-card__desc">{description}</div>}
        </div>
        {rightActionButton && (
          <div className="g-card__icon-btn" onClick={onRightActionClick}>
            {rightActionButton}
          </div>
        )}
      </div>
    </div>
  );
};
