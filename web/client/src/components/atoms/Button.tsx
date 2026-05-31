import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon,
  className = '',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none active:scale-95 cursor-pointer';
  
  const variants = {
    primary: 'bg-brand-orange text-white hover:bg-brand-orange-hover shadow-md shadow-brand-orange/20 border border-brand-orange/10',
    secondary: 'bg-white text-brand-text-dark border border-brand-border hover:bg-brand-cream hover:text-brand-orange',
    outline: 'border border-brand-border text-brand-text hover:bg-brand-cream hover:text-brand-text-dark',
    ghost: 'text-brand-text hover:bg-brand-cream hover:text-brand-text-dark',
    danger: 'bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-500/20'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  const widthStyle = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${widthStyle} ${className}`}
      {...props}
    >
      {icon && <span className="mr-2 inline-flex">{icon}</span>}
      {children}
    </button>
  );
};
