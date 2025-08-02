import React from 'react';
import './index.css';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode;
  className?: string;
}

export const Select: React.FC<SelectProps> = ({ 
  children, 
  className = 'form-select', 
  ...props 
}) => {
  return (
    <select
      className={className}
      {...props}
    >
      {children}
    </select>
  );
};