import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  headerAction?: React.ReactNode;
  icon?: React.ReactNode;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  headerAction,
  icon,
  noPadding = false,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`bg-brand-card border border-brand-border rounded-2xl shadow-sm hover:shadow-md/5 transition-all duration-200 overflow-hidden flex flex-col ${className}`}
      {...props}
    >
      {(title || icon || headerAction) && (
        <div className="px-6 py-5 border-b border-brand-border flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {icon && <span className="text-brand-orange text-lg inline-flex">{icon}</span>}
            <div>
              {title && <h3 className="text-sm font-semibold text-brand-text-dark uppercase tracking-wider">{title}</h3>}
              {subtitle && <p className="text-xs text-brand-text/75 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {headerAction && <div className="flex items-center">{headerAction}</div>}
        </div>
      )}
      <div className={`flex-1 flex flex-col ${noPadding ? '' : 'p-6'}`}>
        {children}
      </div>
    </div>
  );
};
