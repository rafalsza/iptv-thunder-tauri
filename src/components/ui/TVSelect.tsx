import React, { useState, useRef, useEffect } from 'react';

export interface TVSelectOption {
  value: string;
  label: string;
}

interface TVSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: TVSelectOption[];
  tvId: string;
  tvGroup: string;
  tvIndex?: string;
  tvInitial?: boolean;
  className?: string;
}

export const TVSelect: React.FC<TVSelectProps> = ({
  value,
  onChange,
  options,
  tvId,
  tvGroup,
  tvIndex = '0',
  tvInitial = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find(o => o.value === value)?.label || value;

  // Close dropdown when clicking outside (desktop mouse support)
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        const firstOption = document.querySelector(`[data-tv-group="${tvGroup}-options"]`) as HTMLElement;
        firstOption?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      triggerRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, tvGroup]);

  const handleSelect = (newValue: string) => {
    onChange(newValue);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-tv-focusable
        data-tv-id={tvId}
        data-tv-group={tvGroup}
        data-tv-index={tvIndex}
        data-tv-initial={tvInitial ? 'true' : undefined}
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'OK' || e.key === 'Select') {
            e.preventDefault();
            setIsOpen(!isOpen);
          } else if (e.key === 'Escape' || e.key === 'Back') {
            e.preventDefault();
            setIsOpen(false);
          }
        }}
        className={`w-full px-4 py-3 text-left rounded-lg border dark:bg-slate-800 bg-white dark:border-slate-700 border-gray-300 dark:text-white text-slate-900 flex items-center justify-between ${className}`}
      >
        <span>{selectedLabel}</span>
        <span className="text-xs">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 dark:bg-slate-800 bg-white dark:border-slate-700 border-gray-300 border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              data-tv-focusable
              data-tv-id={`${tvId}-option-${option.value}`}
              data-tv-group={`${tvGroup}-options`}
              data-tv-initial={index === 0 ? 'true' : undefined}
              tabIndex={0}
              onClick={() => handleSelect(option.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'OK' || e.key === 'Select') {
                  e.preventDefault();
                  handleSelect(option.value);
                } else if (e.key === 'Escape' || e.key === 'Back') {
                  e.preventDefault();
                  setIsOpen(false);
                }
              }}
              className={`w-full px-4 py-3 text-left dark:hover:bg-slate-700 hover:bg-gray-100 dark:focus:bg-slate-600 focus:bg-gray-200 focus:outline-none dark:text-white text-slate-900 ${option.value === value ? 'dark:bg-slate-600 bg-gray-200' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
