import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  icon,
  className = '',
  id,
  ...props
}) => {
  return (
    <div className="w-full flex flex-col items-start gap-1">
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-brand-text-dark tracking-wide uppercase">
          {label}
        </label>
      )}
      <div className="relative w-full flex items-center">
        {icon && (
          <span className="absolute left-3.5 text-brand-text/70 pointer-events-none flex items-center">
            {icon}
          </span>
        )}
        <input
          id={id}
          className={`w-full px-4 py-3 rounded-xl border border-brand-border bg-white text-sm text-brand-text-dark placeholder-brand-text/50 focus:outline-none focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/15 transition-all duration-200 ${
            icon ? 'pl-10' : ''
          } ${error ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <span className="text-xs text-red-500 font-medium pl-1 mt-0.5">{error}</span>}
    </div>
  );
};
