import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import './SearchTokenPalette.css';

/**
 * Format count to compact notation (e.g., 1100 -> "1.1k")
 */
function formatCount(num) {
    if (num === null || num === undefined) return '';
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    }
    return num.toLocaleString();
}

/**
 * SearchTokenPalette:
 * Advanced tokenized search input matching nhentai-style UX:
 * 1. Prefix Discovery Cheatsheet (empty / chevron trigger)
 * 2. Real-time Autocomplete with entity badges, counts, and insert actions
 * 3. Contextual Token Actions (↵ Search, — Exclude, ✕ Remove)
 */
export default function SearchTokenPalette({
    value = '',
    onChange,
    onSearch,
    placeholder = 'Search by name, phone, taluka:..., wallet:>0...',
    suggestionsEndpoint,
    className = ''
}) {
    const { fetchWithAuth } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [cheatsheet, setCheatsheet] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [caretPos, setCaretPos] = useState(value.length);

    const containerRef = useRef(null);
    const inputRef = useRef(null);
    const fetchSeqRef = useRef(0);
    const debounceTimerRef = useRef(null);

    // Fetch initial cheatsheet schema once
    useEffect(() => {
        let isMounted = true;
        if (!suggestionsEndpoint) return;

        async function fetchCheatsheet() {
            try {
                const res = await fetchWithAuth(suggestionsEndpoint);
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted && data.prefixes) {
                        setCheatsheet(data.prefixes);
                    }
                }
            } catch (err) {
                console.error('Failed to load search cheatsheet schema:', err);
            }
        }
        fetchCheatsheet();

        return () => {
            isMounted = false;
        };
    }, [suggestionsEndpoint, fetchWithAuth]);

    // Handle outside clicks to collapse palette
    useEffect(() => {
        function handleClickOutside(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Parse tokens and determine the active token under the caret
    const getActiveToken = useCallback(() => {
        if (!value) return null;
        const regex = /(-?[\w]+:(?:"[^"]*"|[^\s]+)|[^\s]+)/g;
        let match;
        let active = null;
        while ((match = regex.exec(value)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (caretPos >= start && caretPos <= end) {
                active = {
                    raw: match[0],
                    start,
                    end
                };
                break;
            }
        }
        if (!active && value.endsWith(' ')) {
            // Caret is at the trailing end after a space
            return null;
        }
        return active;
    }, [value, caretPos]);

    const activeToken = getActiveToken();

    // Check prefix and query for suggestions
    const parsedToken = (() => {
        if (!activeToken) return null;
        const raw = activeToken.raw;
        const isNegated = raw.startsWith('-');
        const clean = isNegated ? raw.slice(1) : raw;
        if (!clean.includes(':')) return null;

        const [prefix, ...valParts] = clean.split(':');
        const val = valParts.join(':').replace(/^"|"$/g, '');
        return {
            prefix: prefix.toLowerCase(),
            val,
            isNegated,
            isQuoted: clean.includes(':"'),
            raw
        };
    })();

    // Fetch dynamic autocomplete suggestions when typing a prefix
    useEffect(() => {
        if (!parsedToken || !suggestionsEndpoint || !isOpen) {
            setSuggestions([]);
            setLoadingSuggestions(false);
            return;
        }

        const currentSeq = ++fetchSeqRef.current;
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(async () => {
            setLoadingSuggestions(true);
            try {
                const url = `${suggestionsEndpoint}?prefix=${encodeURIComponent(parsedToken.prefix)}&q=${encodeURIComponent(parsedToken.val)}`;
                const res = await fetchWithAuth(url);
                if (res.ok && fetchSeqRef.current === currentSeq) {
                    const data = await res.json();
                    setSuggestions(data.suggestions || []);
                    setSelectedIndex(-1);
                }
            } catch (err) {
                console.error('Failed to fetch suggestions:', err);
            } finally {
                if (fetchSeqRef.current === currentSeq) {
                    setLoadingSuggestions(false);
                }
            }
        }, 150);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [parsedToken?.prefix, parsedToken?.val, suggestionsEndpoint, isOpen, fetchWithAuth]);

    // Track caret position on interaction
    const updateCaret = (e) => {
        if (e.target && e.target.selectionStart !== undefined) {
            setCaretPos(e.target.selectionStart);
        }
    };

    // Replace current active token with new token string
    const replaceActiveToken = (newTokenStr) => {
        let newValue = '';
        let newCaret = 0;
        if (activeToken) {
            newValue = value.slice(0, activeToken.start) + newTokenStr + value.slice(activeToken.end);
            newCaret = activeToken.start + newTokenStr.length;
        } else {
            const separator = value && !value.endsWith(' ') ? ' ' : '';
            newValue = value + separator + newTokenStr;
            newCaret = newValue.length;
        }
        onChange(newValue);
        setCaretPos(newCaret);
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.focus();
                inputRef.current.setSelectionRange(newCaret, newCaret);
            }
        }, 0);
    };

    // Insert prefix from cheatsheet
    const handleSelectPrefix = (prefixObj) => {
        replaceActiveToken(`${prefixObj.prefix}:`);
    };

    // Insert completed suggestion
    const handleSelectSuggestion = (sug) => {
        const prefix = parsedToken ? parsedToken.prefix : sug.prefix;
        const formattedVal = sug.value.includes(' ') ? `"${sug.value}"` : sug.value;
        replaceActiveToken(`${prefix}:${formattedVal} `);
    };

    // Action: Search
    const handleExecuteSearch = () => {
        setIsOpen(false);
        if (onSearch) onSearch(value);
    };

    // Action: Exclude token
    const handleExcludeToken = () => {
        if (!activeToken) return;
        const raw = activeToken.raw;
        const isNegated = raw.startsWith('-');
        const toggled = isNegated ? raw.slice(1) : `-${raw}`;
        replaceActiveToken(toggled);
    };

    // Action: Remove token
    const handleRemoveToken = () => {
        if (!activeToken) return;
        let newValue = (value.slice(0, activeToken.start) + value.slice(activeToken.end)).trim();
        // Clean double spaces
        newValue = newValue.replace(/\s{2,}/g, ' ');
        onChange(newValue);
        setCaretPos(activeToken.start);
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.focus();
                inputRef.current.setSelectionRange(activeToken.start, activeToken.start);
            }
        }, 0);
    };

    // Keyboard navigation
    const handleKeyDown = (e) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIsOpen(true);
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                handleExecuteSearch();
            }
            return;
        }

        const totalItems = (suggestions.length || cheatsheet.length) + (parsedToken ? 2 : 1);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1 < totalItems ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex === -1 || selectedIndex === 0) {
                handleExecuteSearch();
            } else if (parsedToken && selectedIndex === 1) {
                handleExcludeToken();
            } else if (parsedToken && selectedIndex === 2 && parsedToken.val) {
                handleRemoveToken();
            } else {
                // Pick suggestion
                const offset = parsedToken ? (parsedToken.val ? 3 : 2) : 1;
                const sugIndex = selectedIndex - offset;
                if (suggestions[sugIndex]) {
                    handleSelectSuggestion(suggestions[sugIndex]);
                } else if (!parsedToken && cheatsheet[selectedIndex - 1]) {
                    handleSelectPrefix(cheatsheet[selectedIndex - 1]);
                } else {
                    handleExecuteSearch();
                }
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        } else if (e.key === 'Tab') {
            if (suggestions.length > 0) {
                e.preventDefault();
                handleSelectSuggestion(suggestions[0]);
            }
        }
    };

    return (
        <div className={`search-token-palette ${className}`} ref={containerRef}>
            <div className="search-palette-input-wrapper">
                <span className="search-palette-icon">🔍</span>
                <input
                    ref={inputRef}
                    type="text"
                    className="search-palette-input"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value);
                        updateCaret(e);
                        if (!isOpen) setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onClick={updateCaret}
                    onKeyUp={updateCaret}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                    spellCheck="false"
                />

                {value && (
                    <button
                        type="button"
                        className="search-palette-clear-btn"
                        onClick={() => {
                            onChange('');
                            setCaretPos(0);
                            inputRef.current?.focus();
                        }}
                        title="Clear search"
                        onMouseDown={(e) => e.preventDefault()}
                    >
                        ✕
                    </button>
                )}

                <button
                    type="button"
                    className={`search-palette-chevron-btn ${isOpen ? 'open' : ''}`}
                    onClick={() => {
                        setIsOpen(!isOpen);
                        inputRef.current?.focus();
                    }}
                    title="Toggle search filters"
                    onMouseDown={(e) => e.preventDefault()}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 10l5 5 5-5z" />
                    </svg>
                </button>
            </div>

            {isOpen && (
                <div className="search-palette-dropdown">
                    {/* State 3: Active Token Context Actions */}
                    {parsedToken && (
                        <div className="search-palette-actions-group">
                            <div
                                className={`search-palette-item action-search ${selectedIndex === 0 ? 'highlighted' : ''}`}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleExecuteSearch();
                                }}
                            >
                                <span className="action-symbol">↵</span>
                                <span className="action-label">
                                    Search for <strong className="token-highlight">{value}</strong>
                                </span>
                            </div>

                            <div
                                className={`search-palette-item action-exclude ${selectedIndex === 1 ? 'highlighted' : ''}`}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleExcludeToken();
                                }}
                            >
                                <span className="action-symbol minus">—</span>
                                <span className="action-label">
                                    {parsedToken.isNegated ? 'Include' : 'Exclude'}{' '}
                                    <strong className="token-highlight">{parsedToken.raw}</strong>
                                </span>
                            </div>

                            {parsedToken.val && (
                                <div
                                    className={`search-palette-item action-remove ${selectedIndex === 2 ? 'highlighted' : ''}`}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleRemoveToken();
                                    }}
                                >
                                    <span className="action-symbol remove">✕</span>
                                    <span className="action-label">
                                        Remove <strong className="token-highlight">{parsedToken.raw}</strong>
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* State 2: Dynamic Suggestions with Counts */}
                    {parsedToken && suggestions.length > 0 && (
                        <div className="search-palette-suggestions-group">
                            <div className="search-palette-section-title">SUGGESTIONS</div>
                            {suggestions.map((sug, idx) => {
                                const itemIndex = (parsedToken ? (parsedToken.val ? 3 : 2) : 1) + idx;
                                return (
                                    <div
                                        key={`${sug.prefix}-${sug.value}`}
                                        className={`search-palette-item suggestion-item ${selectedIndex === itemIndex ? 'highlighted' : ''}`}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleSelectSuggestion(sug);
                                        }}
                                    >
                                        <div className="suggestion-content">
                                            <span className={`prefix-badge badge-${sug.prefix}`}>
                                                {sug.prefix.toUpperCase()}
                                            </span>
                                            <span className="suggestion-value">{sug.value}</span>
                                            {sug.count !== null && sug.count !== undefined && (
                                                <span className="suggestion-count">
                                                    {formatCount(sug.count)}
                                                </span>
                                            )}
                                        </div>
                                        <span className="suggestion-insert-arrow">→</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Loading State */}
                    {loadingSuggestions && (
                        <div className="search-palette-loading">
                            <span className="loading-dot"></span> Fetching matches...
                        </div>
                    )}

                    {/* State 1: Discovery Cheatsheet (When empty or no active suggestions) */}
                    {(!parsedToken || (suggestions.length === 0 && !loadingSuggestions)) && (
                        <div className="search-palette-cheatsheet-group">
                            <div className="search-palette-section-title">
                                {parsedToken ? 'AVAILABLE QUALIFIERS' : 'SEARCH FILTERS'}
                            </div>
                            {cheatsheet.map((item, idx) => {
                                const itemIndex = (parsedToken ? (parsedToken.val ? 3 : 2) : 0) + idx;
                                return (
                                    <div
                                        key={item.prefix}
                                        className={`search-palette-item cheatsheet-item ${selectedIndex === itemIndex ? 'highlighted' : ''}`}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleSelectPrefix(item);
                                        }}
                                    >
                                        <div className="cheatsheet-syntax">
                                            <code className="syntax-code">{item.example}</code>
                                        </div>
                                        <div className="cheatsheet-desc">{item.description}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
