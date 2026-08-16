import React, { useState, useRef, useEffect } from 'react';
import './SearchableSelect.css';

export interface SelectOption {
  value: string;
  label: string;
  subLabel?: string;
  badge?: string;
}

interface SearchableSelectProps {
  label?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  allOptionLabel?: string;
  allowNa?: boolean;
  naLabel?: string;
  disabled?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  searchPlaceholder = 'Type to search...',
  allOptionLabel = 'All',
  allowNa = true,
  naLabel = 'N/A',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(prev => !prev);
      setSearchTerm('');
    }
  };

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
  };

  // Build full list of choices including 'All' and 'N/A'
  const fullOptionsList: SelectOption[] = [
    { value: '', label: allOptionLabel },
    ...(allowNa ? [{ value: 'N/A', label: naLabel, badge: 'N/A' }] : []),
    ...options,
  ];

  // Filter options by search term
  const filteredOptions = fullOptionsList.filter(opt => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      opt.label.toLowerCase().includes(term) ||
      opt.value.toLowerCase().includes(term) ||
      (opt.subLabel && opt.subLabel.toLowerCase().includes(term)) ||
      (opt.badge && opt.badge.toLowerCase().includes(term))
    );
  });

  // Find label of currently selected value
  const selectedOption = fullOptionsList.find(opt => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : value || placeholder;

  return (
    <div className={`searchable-select-container ${isOpen ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`} ref={containerRef}>
      <div
        className="searchable-select-trigger"
        onClick={handleToggle}
        tabIndex={disabled ? -1 : 0}
        role="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`trigger-text ${!value && !selectedOption ? 'is-placeholder' : ''}`}>
          {displayLabel}
        </span>
        <div className="trigger-actions">
          {value !== '' && (
            <button
              type="button"
              className="select-clear-btn"
              onClick={handleClear}
              title="Clear selection"
            >
              &times;
            </button>
          )}
          <span className={`chevron-icon ${isOpen ? 'open' : ''}`}>
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="searchable-select-dropdown" role="listbox">
          <div className="search-header" onClick={e => e.stopPropagation()}>
            <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            {searchTerm && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchTerm('')}
              >
                &times;
              </button>
            )}
          </div>

          <div className="options-scroll-area">
            {filteredOptions.length === 0 ? (
              <div className="no-options">No matching options</div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={`${opt.value}-${idx}`}
                    className={`select-option-item ${isSelected ? 'selected' : ''} ${opt.value === 'N/A' ? 'is-na' : ''}`}
                    onClick={() => handleSelect(opt.value)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="option-label-wrapper">
                      <span className="option-label">{opt.label}</span>
                      {opt.subLabel && <span className="option-sublabel">{opt.subLabel}</span>}
                    </div>
                    {opt.badge && <span className="option-badge">{opt.badge}</span>}
                    {isSelected && (
                      <span className="checkmark-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
