import React from 'react';
import './index.css';

interface MessageContainerProps {
  message: string;
  onClose: () => void;
  'data-test-id'?: string;
  children?: React.ReactNode;
}

export const ErrorContainer: React.FC<MessageContainerProps> = ({ 
  message, 
  onClose, 
  'data-test-id': dataTestId,
  children 
}) => (
  <div className="error-container" data-test-id={dataTestId || "error-container"}>
    <div className="error-message" data-test-id="error-message">
      {message}
      {children}
    </div>
    <button 
      type="button" 
      className="error-close"
      onClick={onClose}
      aria-label="Close error message"
      data-test-id={dataTestId ? `${dataTestId}-close` : undefined}
    >
      ×
    </button>
  </div>
);

export const SuccessContainer: React.FC<MessageContainerProps> = ({ 
  message, 
  onClose, 
  'data-test-id': dataTestId,
  children 
}) => (
  <div className="success-container" data-test-id={dataTestId || "success-container"}>
    <div className="success-message" data-test-id="success-message">
      {message}
      {children}
    </div>
    <button 
      type="button" 
      className="success-close"
      onClick={onClose}
      aria-label="Close success message"
      data-test-id={dataTestId ? `${dataTestId}-close` : undefined}
    >
      ×
    </button>
  </div>
); 