import React from 'react';

interface ProgressProps {
  value: number; // current value
  max?: number; // max value
  variant?: 'orange' | 'green' | 'blue' | 'indigo' | 'grey';
  size?: 'sm' | 'md' | 'lg';
}

export const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  variant = 'orange',
  size = 'md',
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const colorStyles = {
    orange: 'bg-gradient-to-r from-orange-400 to-[#ff7a30]',
    green: 'bg-gradient-to-r from-emerald-400 to-emerald-500',
    blue: 'bg-gradient-to-r from-sky-400 to-blue-500',
    indigo: 'bg-gradient-to-r from-indigo-400 to-indigo-600',
    grey: 'bg-gray-400'
  };

  const sizeStyles = {
    sm: 'h-1.5',
    md: 'h-3.5',
    lg: 'h-5'
  };

  return (
    <div className="w-full bg-brand-cream border border-brand-border/60 rounded-full overflow-hidden">
      <div
        className={`rounded-full transition-all duration-500 ease-out ${colorStyles[variant]} ${sizeStyles[size]}`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};
