import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'orange' | 'green' | 'blue' | 'purple' | 'grey' | 'danger';
  pulse?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'grey',
  pulse = false,
}) => {
  const styles = {
    orange: 'bg-[#ff7a30]/10 text-[#ff7a30] border-[#ff7a30]/20',
    green: 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20',
    blue: 'bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20',
    purple: 'bg-[#8b5cf6]/10 text-[#8b5cf6] border-[#8b5cf6]/20',
    grey: 'bg-brand-cream text-brand-text border-brand-border',
    danger: 'bg-red-500/10 text-red-500 border-red-500/20'
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase border ${styles[variant]}`}>
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
            variant === 'green' ? 'bg-[#10b981]' : variant === 'orange' ? 'bg-[#ff7a30]' : 'bg-brand-text'
          }`}></span>
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
            variant === 'green' ? 'bg-[#10b981]' : variant === 'orange' ? 'bg-[#ff7a30]' : 'bg-brand-text'
          }`}></span>
        </span>
      )}
      {children}
    </span>
  );
};
