import React from 'react';
import DecimalInput from './DecimalInput';
import './Input.css';

const Input = ({ 
  label, 
  error, 
  className = '', 
  decimal = false,
  ...props
}) => {
  return (
    <div className={`input-group ${className}`}>
      {label && <label className="input-label">{label}</label>}
      {decimal
        ? <DecimalInput className={`input-field ${error ? 'has-error' : ''}`} {...props} />
        : <input className={`input-field ${error ? 'has-error' : ''}`} {...props} />}
      {error && <span className="input-error">{error}</span>}
    </div>
  );
};

export default Input;
