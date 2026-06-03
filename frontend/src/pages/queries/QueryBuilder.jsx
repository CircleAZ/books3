import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { QueryBuilder } from 'react-querybuilder';
import Editor from '@monaco-editor/react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import GuardedAction from '../../components/GuardedAction';
import {
    Play,
    Save,
    Share2,
    Trash2,
    Plus,
    X,
    Columns,
    Database,
    Search,
    ArrowUp,
    ArrowDown,
    Menu,
    PlusCircle,
    CheckCircle,
    AlertCircle,
    Info,
    FileText
} from 'lucide-react';
import 'react-querybuilder/dist/query-builder.css';
import './QueryBuilder.css';
import AggregateColumnModal from './AggregateColumnModal';

const resolvePath = (schema, baseEntity, path) => {
    if (!schema || !schema.entities || !baseEntity || !path) return null;
    const parts = path.split('__');
    let currentEntity = baseEntity;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const entityDef = schema.entities[currentEntity];
        if (!entityDef) return null;

        // Is it the last part of the path?
        if (i === parts.length - 1) {
            // Check relations first, as we traverse relations
            const relation = entityDef.relations?.find(r => r.name === part);
            if (relation) {
                return { type: 'relation', targetEntity: relation.target, label: relation.label };
            }
            // Check fields
            const field = entityDef.fields?.find(f => f.name === part);
            if (field) {
                return { type: 'field', field };
            }
            return null;
        } else {
            // Must be a relation to step through
            const relation = entityDef.relations?.find(r => r.name === part);
            if (!relation) return null;
            currentEntity = relation.target;
        }
    }
    return null;
};

export default function QueryBuilderPage() {
    const { fetchWithAuth, rbac } = useAuth();
    const { showToast } = useToast();
    const { currency } = useCurrency();

    // Query Builder State
    const [savedQueries, setSavedQueries] = useState([]);
    const [activeQuery, setActiveQuery] = useState(null);
    const [entity, setEntity] = useState('order');
    const [queryType, setQueryType] = useState('visual'); // 'visual' | 'azql'
    const [rules, setRules] = useState({ combinator: 'and', rules: [] });
    const [azqlText, setAzqlText] = useState('');
    const [columns, setColumns] = useState([]);
    const [aggregates, setAggregates] = useState([]);
    
    // History & backups state
    const [historyQueries, setHistoryQueries] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    
    // API results
    const [results, setResults] = useState([]);
    const [selectedColumns, setSelectedColumns] = useState([]);
    
    // Schema & loading states
    const [schema, setSchema] = useState(null);
    const [loading, setLoading] = useState(false);
    const [queriesLoading, setQueriesLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Modal states
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isAggregateModalOpen, setIsAggregateModalOpen] = useState(false);
    
    // Modal fields
    const [saveName, setSaveName] = useState('');
    const [saveIsShared, setSaveIsShared] = useState(false);

    // Inline columns search state
    const [colSearchValue, setColSearchValue] = useState('');
    const [isColSuggestOpen, setIsColSuggestOpen] = useState(false);
    const colSearchRef = useRef(null);

    // Refs to bypass Monaco closure trap and handle auto-save debounce
    const schemaRef = useRef(schema);
    const entityRef = useRef(entity);
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const lastSavedStateRef = useRef(null);

    useEffect(() => {
        schemaRef.current = schema;
    }, [schema]);

    useEffect(() => {
        entityRef.current = entity;
    }, [entity]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (colSearchRef.current && !colSearchRef.current.contains(event.target)) {
                setIsColSuggestOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleEditorBeforeMount = useCallback((monaco) => {
        // Register a new language
        monaco.languages.register({ id: 'azql' });

        // Register a tokens provider for the language
        monaco.languages.setMonarchTokensProvider('azql', {
            ignoreCase: true,
            keywords: [
                'SELECT', 'FROM', 'WHERE', 'ORDER', 'BY', 'ASOF', 'WAS', 'EVER', 'AND', 'OR', 'ASC', 'DESC'
            ],
            functions: [
                'SUM_OWED', 'SUM_DELIVERED', 'SUM_ORDERED'
            ],
            operators: [
                '=', '!=', '<', '<=', '>', '>=', 'LIKE', 'IN', 'CONTAINS'
            ],
            tokenizer: {
                root: [
                    // identifiers and keywords
                    [/[a-zA-Z_]\w*/, {
                        cases: {
                            '@keywords': 'keyword',
                            '@functions': 'function',
                            '@default': 'identifier'
                        }
                    }],
                    // bracketed fields
                    [/\[[a-zA-Z0-9_.]+\]/, 'type.identifier'],
                    // macros
                    [/@[a-zA-Z_]+(?:\s*[-\+]\s*\d+)?/, 'variable.predefined'],
                    // operators
                    [/[=><!]+|LIKE|IN|CONTAINS/, {
                        cases: {
                            '@operators': 'operator',
                            '@default': ''
                        }
                    }],
                    // strings
                    [/'([^'\\]|\\.)*'/, 'string'],
                    // numbers
                    [/\d+(?:\.\d+)?/, 'number'],
                    // whitespace
                    { include: '@whitespace' }
                ],
                whitespace: [
                    [/[ \t\r\n]+/, 'white']
                ]
            }
        });
    }, []);

    const handleEditorMount = useCallback((editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // Register completion item provider for 'azql'
        monaco.languages.registerCompletionItemProvider('azql', {
            triggerCharacters: [' ', '[', '@', '=', '.', '_'],
            provideCompletionItems: (model, position) => {
                const textUntilPosition = model.getValueInRange({
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column
                });

                let currentEntity = entityRef.current;
                const fromMatch = textUntilPosition.match(/\bFROM\s+([a-zA-Z0-9_]+)/i);
                if (fromMatch) {
                    currentEntity = fromMatch[1].toLowerCase();
                }

                const suggestions = [];
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn
                };

                const lastChar = textUntilPosition.slice(-1);

                const lastOpenBracketIdx = textUntilPosition.lastIndexOf('[');
                const lastCloseBracketIdx = textUntilPosition.lastIndexOf(']');
                const isInsideBracket = lastOpenBracketIdx > lastCloseBracketIdx;

                if (isInsideBracket) {
                    const bracketContent = textUntilPosition.substring(lastOpenBracketIdx + 1);
                    const lastUnderscoresIdx = bracketContent.lastIndexOf('__');
                    
                    let targetEntity = currentEntity;
                    let prefixPath = "";
                    
                    if (lastUnderscoresIdx !== -1) {
                        prefixPath = bracketContent.substring(0, lastUnderscoresIdx);
                        const resolved = resolvePath(schemaRef.current, currentEntity, prefixPath);
                        if (resolved && resolved.type === 'relation') {
                            targetEntity = resolved.targetEntity;
                        } else {
                            return { suggestions: [] };
                        }
                    }

                    if (schemaRef.current?.entities?.[targetEntity]) {
                        const entityDef = schemaRef.current.entities[targetEntity];
                        
                        // Suggest fields
                        if (entityDef.fields) {
                            entityDef.fields.forEach(f => {
                                suggestions.push({
                                    label: f.name,
                                    kind: monaco.languages.CompletionItemKind.Field,
                                    documentation: f.label,
                                    insertText: `${f.name}]`,
                                    range: range
                                });
                            });
                        }
                        
                        // Suggest relations
                        if (entityDef.relations) {
                            entityDef.relations.forEach(r => {
                                suggestions.push({
                                    label: `${r.name}__`,
                                    kind: monaco.languages.CompletionItemKind.Folder,
                                    documentation: `Relation to ${r.label}`,
                                    insertText: `${r.name}__`,
                                    range: range
                                });
                            });
                        }
                    }
                } else if (lastChar === '@') {
                    suggestions.push({
                        label: 'Me',
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: 'Me',
                        range: range
                    }, {
                        label: 'Today',
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: 'Today',
                        range: range
                    });
                } else if (lastChar === '=') {
                    const fieldMatch = textUntilPosition.match(/\[([a-zA-Z0-9_.]+)\]\s*=\s*$/i);
                    if (fieldMatch) {
                        const fullFieldName = fieldMatch[1];
                        const lastUnderscores = fullFieldName.lastIndexOf('__');
                        let targetEntity = currentEntity;
                        let fieldName = fullFieldName;
                        
                        if (lastUnderscores !== -1) {
                            const prefixPath = fullFieldName.substring(0, lastUnderscores);
                            fieldName = fullFieldName.substring(lastUnderscores + 2);
                            const resolved = resolvePath(schemaRef.current, currentEntity, prefixPath);
                            if (resolved && resolved.type === 'relation') {
                                targetEntity = resolved.targetEntity;
                            }
                        }
                        
                        if (schemaRef.current?.entities?.[targetEntity]) {
                            const fieldObj = schemaRef.current.entities[targetEntity].fields.find(f => f.name === fieldName);
                            if (fieldObj?.choices) {
                                fieldObj.choices.forEach(choice => {
                                    suggestions.push({
                                        label: choice.label,
                                        kind: monaco.languages.CompletionItemKind.EnumMember,
                                        insertText: `'${choice.value}'`,
                                        range: range
                                    });
                                });
                            }
                        }
                    }
                } else {
                    const isAfterFrom = /\bFROM\s+[a-zA-Z_0-9]*$/i.test(textUntilPosition);
                    if (isAfterFrom) {
                        if (schemaRef.current?.entities) {
                            Object.keys(schemaRef.current.entities).forEach(ent => {
                                const capitalized = ent.charAt(0).toUpperCase() + ent.slice(1);
                                suggestions.push({
                                    label: capitalized,
                                    kind: monaco.languages.CompletionItemKind.Class,
                                    insertText: capitalized,
                                    range: range
                                });
                            });
                        }
                    } else {
                        const keywords = ['SELECT', 'FROM', 'WHERE', 'ORDER BY', 'ASOF', 'WAS EVER', 'AND', 'OR'];
                        keywords.forEach(kw => {
                            suggestions.push({
                                label: kw,
                                kind: monaco.languages.CompletionItemKind.Keyword,
                                insertText: kw,
                                range: range
                            });
                        });
                        const functions = ['SUM_OWED', 'SUM_DELIVERED', 'SUM_ORDERED'];
                        functions.forEach(fn => {
                            suggestions.push({
                                label: fn,
                                kind: monaco.languages.CompletionItemKind.Function,
                                insertText: `${fn}(`,
                                range: range
                            });
                        });
                        if (schemaRef.current?.entities?.[currentEntity]) {
                            const entityDef = schemaRef.current.entities[currentEntity];
                            entityDef.fields.forEach(f => {
                                suggestions.push({
                                    label: `[${f.name}]`,
                                    kind: monaco.languages.CompletionItemKind.Field,
                                    documentation: f.label,
                                    insertText: `[${f.name}]`,
                                    range: range
                                });
                            });
                            if (entityDef.relations) {
                                entityDef.relations.forEach(r => {
                                    suggestions.push({
                                        label: `[${r.name}__]`,
                                        kind: monaco.languages.CompletionItemKind.Folder,
                                        documentation: `Relation to ${r.label}`,
                                        insertText: `[${r.name}__`,
                                        range: range
                                    });
                                });
                            }
                        }
                    }
                }

                return { suggestions };
            }
        });
    }, []);

    const isSystemAdmin = useMemo(() => {
        return rbac?.is_superuser || rbac?.role === 'Admin' || rbac?.roles?.includes('Admin');
    }, [rbac]);

    // Dynamic schema choices/types load
    const fetchSchema = useCallback(async () => {
        try {
            const response = await fetchWithAuth(ENDPOINTS.QUERIES_SCHEMA);
            if (response.ok) {
                const data = await response.json();
                setSchema(data);
                
                // Initialize default columns for the active entity
                if (data.entities && data.entities[entity]) {
                    const defaultCols = data.entities[entity].fields.slice(0, 4).map(f => f.name);
                    setColumns(defaultCols);
                    
                    const entityLabel = entity.charAt(0).toUpperCase() + entity.slice(1);
                    const defaultAzql = `SELECT ${defaultCols.map(c => `[${c}]`).join(', ')} FROM ${entityLabel}`;
                    
                    lastSavedStateRef.current = JSON.stringify({
                        entity,
                        queryType: 'visual',
                        rules: { combinator: 'and', rules: [] },
                        azqlText: defaultAzql,
                        columns: defaultCols
                    });
                }
            } else {
                showToast('Failed to fetch schema definitions', 'error');
            }
        } catch (error) {
            console.error('Error fetching schema:', error);
            showToast('Error loading metadata schema', 'error');
        }
    }, [fetchWithAuth, entity, showToast]);

    // Fetch Saved Queries
    const fetchSavedQueries = useCallback(async () => {
        setQueriesLoading(true);
        try {
            const response = await fetchWithAuth(ENDPOINTS.QUERIES);
            if (response.ok) {
                const data = await response.json();
                setSavedQueries(data.results || data || []);
            }
        } catch (error) {
            console.error('Error fetching queries:', error);
        } finally {
            setQueriesLoading(false);
        }
    }, [fetchWithAuth]);

    // Fetch query draft state history
    const fetchHistoryQueries = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const response = await fetchWithAuth(ENDPOINTS.QUERIES_HISTORY);
            if (response.ok) {
                const data = await response.json();
                setHistoryQueries(data.results || data || []);
            }
        } catch (error) {
            console.error('Error fetching query history:', error);
        } finally {
            setHistoryLoading(false);
        }
    }, [fetchWithAuth]);

    // Save query state backup/autosave to backend history
    const saveQueryStateToHistory = useCallback(async (name, isSafe = false) => {
        try {
            const payload = {
                saved_query: activeQuery?.id || null,
                name: name,
                entity: entity,
                query_type: queryType,
                rules: rules,
                azql_text: azqlText,
                columns: columns,
                aggregates: aggregates,
                is_safe: isSafe
            };

            const response = await fetchWithAuth(ENDPOINTS.QUERIES_HISTORY, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                fetchHistoryQueries();
                // Update lastSavedStateRef to prevent debounced autosave immediately after backup
                lastSavedStateRef.current = JSON.stringify({
                    entity,
                    queryType,
                    rules,
                    azqlText,
                    columns
                });
            }
        } catch (error) {
            console.error('Failed to log query state history:', error);
        }
    }, [fetchWithAuth, activeQuery, entity, queryType, rules, azqlText, columns, fetchHistoryQueries]);

    // Debounced autosave effect
    useEffect(() => {
        if (!schema) return;
        
        // Bypass autosave if current state matches the default/empty state for the current entity
        const isDefault = (() => {
            if (!schema?.entities?.[entity]) return true;
            const defaultCols = schema.entities[entity].fields.slice(0, 4).map(f => f.name);
            const entityLabel = entity.charAt(0).toUpperCase() + entity.slice(1);
            const defaultAzql = `SELECT ${defaultCols.map(c => `[${c}]`).join(', ')} FROM ${entityLabel}`;
            
            // Check visual default
            if (queryType === 'visual') {
                const hasNoRules = !rules.rules || rules.rules.length === 0;
                const matchesDefaultCols = JSON.stringify(columns) === JSON.stringify(defaultCols);
                return hasNoRules && matchesDefaultCols;
            }
            
            // Check azql default (ignoring extra whitespaces / case)
            if (queryType === 'azql') {
                const cleanText = azqlText.trim().replace(/\s+/g, ' ').toLowerCase();
                const cleanDefault = defaultAzql.trim().replace(/\s+/g, ' ').toLowerCase();
                if (cleanText === cleanDefault || !cleanText) {
                    return true;
                }
            }
            return false;
        })();

        if (isDefault) return;
        
        const currentStateString = JSON.stringify({
            entity,
            queryType,
            rules,
            azqlText,
            columns,
            aggregates
        });
        
        // Skip if nothing changed since last save
        if (currentStateString === lastSavedStateRef.current) return;
        
        const timer = setTimeout(() => {
            lastSavedStateRef.current = currentStateString;
            saveQueryStateToHistory('Auto-saved', false);
        }, 5000); // 5 seconds typing idle debounce
        
        return () => clearTimeout(timer);
    }, [entity, queryType, rules, azqlText, columns, schema, saveQueryStateToHistory]);

    useEffect(() => {
        fetchSchema();
        fetchSavedQueries();
        fetchHistoryQueries();
    }, [fetchSchema, fetchSavedQueries, fetchHistoryQueries]);

    // Client-side raw AZQL to Visual Rules compiler
    const parseAZQLToVisual = useCallback((queryText) => {
        if (!queryText) throw new Error("Query text is empty.");
        
        const selectFromMatch = queryText.match(/^\s*SELECT\s+([\s\S]*?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([\s\S]*))?$/i);
        if (!selectFromMatch) {
            throw new Error("Invalid query format. Must contain: SELECT [columns] FROM [Entity]");
        }
        
        const selectColsRaw = selectFromMatch[1].trim();
        const entityRaw = selectFromMatch[2].trim().toLowerCase();
        const whereRaw = selectFromMatch[3] ? selectFromMatch[3].trim() : '';
        
        const entityKey = entityRaw;
        if (!schemaRef.current?.entities?.[entityKey]) {
            throw new Error(`Unsupported entity: "${entityRaw}"`);
        }
        
        // Parse select columns
        const selectCols = [];
        const colRegex = /\[([a-zA-Z0-9_.]+)\]/g;
        let colMatch;
        while ((colMatch = colRegex.exec(selectColsRaw)) !== null) {
            selectCols.push(colMatch[1]);
        }
        
        if (selectCols.length === 0) {
            throw new Error("SELECT clause must contain at least one bracketed field [field_name].");
        }
        
        let rulesResult = { combinator: 'and', rules: [] };
        
        if (whereRaw) {
            const lowerWhere = whereRaw.toLowerCase();
            if (lowerWhere.includes('asof') || 
                lowerWhere.includes('was ever') || 
                lowerWhere.includes('sum_owed') || 
                lowerWhere.includes('sum_delivered') || 
                lowerWhere.includes('sum_ordered') || 
                lowerWhere.includes('select ') || 
                lowerWhere.includes('group by') || 
                lowerWhere.includes('join')) {
                throw new Error("Visual rules builder does not support ASOF, WAS EVER, or aggregates. You can run this in Text Editor mode.");
            }
            
            const parseWhereClause = (whereStr) => {
                const tokens = [];
                let currentToken = '';
                let inQuotes = false;
                let parensDepth = 0;
                
                for (let i = 0; i < whereStr.length; i++) {
                    const char = whereStr[i];
                    if (char === "'") {
                        inQuotes = !inQuotes;
                        currentToken += char;
                    } else if (!inQuotes && char === '(') {
                        parensDepth++;
                        currentToken += char;
                    } else if (!inQuotes && char === ')') {
                        parensDepth--;
                        currentToken += char;
                    } else {
                        if (!inQuotes && parensDepth === 0 && (whereStr.slice(i, i + 5).toUpperCase() === ' AND ' || whereStr.slice(i, i + 4).toUpperCase() === ' OR ')) {
                            if (currentToken.trim()) tokens.push({ type: 'condition', text: currentToken.trim() });
                            const isAnd = whereStr.slice(i, i + 5).toUpperCase() === ' AND ';
                            tokens.push({ type: 'combinator', text: isAnd ? 'AND' : 'OR' });
                            currentToken = '';
                            i += isAnd ? 4 : 3;
                        } else {
                            currentToken += char;
                        }
                    }
                }
                if (currentToken.trim()) tokens.push({ type: 'condition', text: currentToken.trim() });
                
                const combinators = tokens.filter(t => t.type === 'combinator').map(t => t.text);
                const uniqueCombinators = [...new Set(combinators)];
                if (uniqueCombinators.length > 1) {
                    throw new Error("Mixed AND & OR logic without grouping cannot be synced to Visual Rules.");
                }
                const finalCombinator = uniqueCombinators[0]?.toLowerCase() || 'and';
                const parsedRulesArray = [];
                
                for (const token of tokens) {
                    if (token.type !== 'condition') continue;
                    
                    let condText = token.text;
                    // Check if it's a grouped normal rule
                    if (condText.startsWith('(') && condText.endsWith(')')) {
                        condText = condText.slice(1, -1).trim();
                        parsedRulesArray.push(parseWhereClause(condText));
                        continue;
                    }
                    
                    // Check if it's a relation subquery
                    const subqueryMatch = condText.match(/^\[(~[a-zA-Z0-9_.]+)\]\s+(HAS_ANY|HAS_ALL|HAS_NONE)\s*\(([\s\S]*)\)$/i);
                    if (subqueryMatch) {
                        const field = subqueryMatch[1];
                        const modeRaw = subqueryMatch[2].toUpperCase();
                        const innerWhereRaw = subqueryMatch[3].trim();
                        const modeMap = { 'HAS_ANY': 'some', 'HAS_ALL': 'all', 'HAS_NONE': 'none' };
                        parsedRulesArray.push({
                            field: field,
                            matchMode: modeMap[modeRaw],
                            value: parseWhereClause(innerWhereRaw)
                        });
                        continue;
                    }
                    
                    const conditionMatch = condText.match(/^\[([a-zA-Z0-9_.]+)\]\s*(=|!=|<=|>=|<|>|LIKE|CONTAINS|IN)\s*([\s\S]*)$/i);
                    if (!conditionMatch) {
                        throw new Error(`Failed to parse condition: "${condText}". Format: [field] = value`);
                    }
                    
                    const field = conditionMatch[1];
                    const operator = conditionMatch[2].toUpperCase();
                    let valueRaw = conditionMatch[3].trim();
                    let value = valueRaw;
                    if (valueRaw.startsWith("'") && valueRaw.endsWith("'")) {
                        value = valueRaw.slice(1, -1).replace(/''/g, "'");
                    } else if (valueRaw.toUpperCase() === 'TRUE') {
                        value = true;
                    } else if (valueRaw.toUpperCase() === 'FALSE') {
                        value = false;
                    } else if (valueRaw.toUpperCase() === 'NULL') {
                        value = '';
                    } else if (!isNaN(Number(valueRaw)) && valueRaw !== '') {
                        value = Number(valueRaw);
                    }
                    
                    parsedRulesArray.push({ field, operator, value });
                }
                
                return {
                    combinator: finalCombinator,
                    rules: parsedRulesArray
                };
            };
            
            rulesResult = parseWhereClause(whereRaw);
        }
        
        return {
            entity: entityKey,
            columns: selectCols,
            rules: rulesResult
        };
    }, []);

    // Double-bound tab change sync & validation guard
    const handleTabChange = (newType) => {
        if (newType === 'visual' && queryType === 'azql') {
            try {
                const parsed = parseAZQLToVisual(azqlText);
                setEntity(parsed.entity);
                setColumns(parsed.columns);
                setRules(parsed.rules);
                setQueryType('visual');
                showToast('Synchronized AZQL text to Visual Rules successfully.', 'success');
            } catch (err) {
                showToast(err.message, 'warning');
                // Option A: Block the transition
            }
        } else {
            setQueryType(newType);
        }
    };

    // Restore query state from history log
    const handleSelectHistory = (hist) => {
        if (!window.confirm(`Are you sure you want to restore the query playground state from "${hist.name} (${new Date(hist.created_at).toLocaleTimeString()})"? Any unsaved changes will be lost.`)) return;

        setEntity(hist.entity);
        setQueryType(hist.query_type);
        setColumns(hist.columns || []);
        setAggregates(hist.aggregates || []);
        const targetRules = hist.rules || { combinator: 'and', rules: [] };
        if (hist.query_type === 'visual') {
            setRules(targetRules);
        }
        setAzqlText(hist.azql_text || '');
        setResults([]);
        setSelectedColumns([]);
        
        // Update lastSavedStateRef to match the restored history query so it doesn't auto-save it immediately!
        lastSavedStateRef.current = JSON.stringify({
            entity: hist.entity,
            queryType: hist.query_type,
            rules: targetRules,
            azqlText: hist.azql_text || '',
            columns: hist.columns || [],
            aggregates: hist.aggregates || []
        });
        showToast('Playground state restored from history', 'success');
    };


    // Reset columns when active entity changes
    const handleEntityChange = (newEntity) => {
        setEntity(newEntity);
        let defaultCols = [];
        if (schema?.entities && schema.entities[newEntity]) {
            // Take first 4 fields as default display columns
            defaultCols = schema.entities[newEntity].fields.slice(0, 4).map(f => f.name);
            setColumns(defaultCols);
        } else {
            setColumns([]);
        }
        const newRules = { combinator: 'and', rules: [] };
        setRules(newRules);
        const entityLabel = newEntity.charAt(0).toUpperCase() + newEntity.slice(1);
        const newAzqlText = `SELECT ${defaultCols.map(c => `[${c}]`).join(', ')} FROM ${entityLabel}`;
        setAzqlText(newAzqlText);
        setAggregates([]);
        setResults([]);
        setSelectedColumns([]);

        lastSavedStateRef.current = JSON.stringify({
            entity: newEntity,
            queryType,
            rules: newRules,
            azqlText: newAzqlText,
            columns: defaultCols,
            aggregates: []
        });
    };

    // Client-side rule group to AZQL WHERE string compiler
    const compileRulesToWhere = useCallback((group) => {
        if (!group || !group.rules || group.rules.length === 0) return '';
        const combinator = ` ${group.combinator.toUpperCase()} `;
        const parts = group.rules.map(rule => {
            if (rule.rules) {
                const sub = compileRulesToWhere(rule);
                return sub ? `(${sub})` : '';
            } else if (rule.field?.startsWith('~') && rule.value && typeof rule.value === 'object' && rule.value.rules) {
                const modeMap = { 'some': 'HAS_ANY', 'all': 'HAS_ALL', 'none': 'HAS_NONE' };
                const matchModeText = modeMap[rule.matchMode || 'some'];
                const innerWhere = compileRulesToWhere(rule.value);
                return innerWhere ? `[${rule.field}] ${matchModeText} (${innerWhere})` : '';
            } else {
                const field = rule.field;
                const op = rule.operator;
                let val = rule.value;
                if (typeof val === 'string') {
                    if (!val.startsWith('@') && !val.startsWith('[')) {
                        val = `'${val.replace(/'/g, "''")}'`;
                    }
                } else if (typeof val === 'boolean') {
                    val = val ? 'TRUE' : 'FALSE';
                }
                return `[${field}] ${op} ${val}`;
            }
        }).filter(p => p !== '');
        
        return parts.join(combinator);
    }, []);

    // Construct full query string for textarea preview/code editor
    const getCompiledQuery = useCallback(() => {
        const selectCols = columns.map(c => `[${c}]`).join(', ');
        const entityLabel = entity.charAt(0).toUpperCase() + entity.slice(1);
        const whereClause = compileRulesToWhere(rules);
        return `SELECT ${selectCols} FROM ${entityLabel}${whereClause ? ` WHERE ${whereClause}` : ''}`;
    }, [columns, entity, rules, compileRulesToWhere]);

    // Sync visual rules modifications into AZQL raw text preview
    useEffect(() => {
        if (queryType === 'visual') {
            setAzqlText(getCompiledQuery());
        }
    }, [rules, columns, entity, queryType, getCompiledQuery]);

    // Format fields for react-querybuilder
    const queryBuilderFields = useMemo(() => {
        if (!schema?.entities || !schema.entities[entity]) return [];
        
        const mapField = (f) => {
            if (f.type === 'relation_subquery') {
                return {
                    name: f.name,
                    label: f.label,
                    type: 'text',
                    subproperties: f.subproperties ? f.subproperties.map(mapField) : [],
                    matchModes: f.matchModes || ['some', 'all', 'none']
                };
            }
            const hasChoices = f.choices && f.choices.length > 0;
            let type = 'text';
            if (f.type === 'integer' || f.type === 'decimal') type = 'number';
            if (f.type === 'datetime') type = 'date';
            if (f.type === 'boolean') type = 'boolean';

            return {
                name: f.name,
                label: f.label,
                type: type,
                valueEditorType: hasChoices ? 'select' : f.type === 'boolean' ? 'checkbox' : 'text',
                values: hasChoices ? f.choices.map(c => ({ name: c.value, label: c.label })) : undefined
            };
        };

        const fields = schema.entities[entity].fields.map(mapField);
        
        const entityDef = schema.entities[entity];
        if (entityDef.relation_fields) {
            entityDef.relation_fields.forEach(rf => {
                fields.push(mapField({ ...rf, type: 'relation_subquery' }));
            });
        }
        return fields;
    }, [schema, entity]);

    const getSubQueryBuilderProps = useCallback((field, { fieldData }) => {
        return {
            fields: fieldData?.subproperties || [],
            showNotToggle: false,
        };
    }, []);

    // Format header label from field name
    const getHeaderLabel = (colName) => {
        if (!schema?.entities || !schema.entities[entity]) return colName;
        
        // Try direct field first
        const fieldObj = schema.entities[entity].fields.find(f => f.name === colName);
        if (fieldObj) return fieldObj.label;
        
        // Try resolving path
        const resolved = resolvePath(schema, entity, colName);
        if (resolved && resolved.field) {
            // For customer__first_name, construct a label like "Customer : First Name"
            const parts = colName.split('__');
            const labelParts = [];
            let currentEnt = entity;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const entDef = schema.entities[currentEnt];
                if (!entDef) break;
                
                if (i === parts.length - 1) {
                    const f = entDef.fields?.find(x => x.name === part);
                    if (f) labelParts.push(f.label);
                } else {
                    const r = entDef.relations?.find(x => x.name === part);
                    if (r) {
                        labelParts.push(r.label);
                        currentEnt = r.target;
                    }
                }
            }
            if (labelParts.length > 0) {
                return labelParts.join(' : ');
            }
        }
        
        // Fallback
        return colName.replace(/__/g, ' : ').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    // Render cells nicely
    const renderCell = (colName, val) => {
        if (val === null || val === undefined) return <span className="text-muted">-</span>;
        
        // Boolean check
        if (typeof val === 'boolean') {
            return val ? (
                <span className="text-success font-bold">✓ Yes</span>
            ) : (
                <span className="text-danger font-bold">✗ No</span>
            );
        }

        // Currency check
        const lowerCol = colName.toLowerCase();
        if (lowerCol.includes('price') || lowerCol.includes('total') || lowerCol.includes('balance') || lowerCol.includes('amount') || lowerCol.includes('cost') || lowerCol.includes('revenue')) {
            const numVal = parseFloat(val);
            if (!isNaN(numVal)) {
                return `${currency}${numVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
            }
        }

        // Datetime check
        if (typeof val === 'string' && val.includes('T') && !isNaN(Date.parse(val))) {
            return new Date(val).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short'
            });
        }

        return String(val);
    };

    // Run query API
    const handleRunQuery = async () => {
        setLoading(true);
        setResults([]);
        try {
            const payload = {
                query_type: queryType,
                entity: entity
            };

            if (queryType === 'azql') {
                payload.azql_text = azqlText;
            } else {
                payload.rules = rules;
                payload.columns = columns;
                payload.aggregates = aggregates;
            }

            const response = await fetchWithAuth(ENDPOINTS.QUERIES_RUN, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (response.ok) {
                setResults(data.results || []);
                setSelectedColumns(data.columns || columns);
                showToast(`Successfully returned ${data.results?.length || 0} rows.`, 'success');
                // Log safe query state backup
                saveQueryStateToHistory('Executed Query', true);
                
                // Update lastSavedStateRef to prevent debounced autosave immediately after execution
                lastSavedStateRef.current = JSON.stringify({
                    entity,
                    queryType,
                    rules,
                    azqlText,
                    columns,
                    aggregates
                });
            } else {
                showToast(data.error || 'Failed to execute query', 'error');
            }
        } catch (error) {
            console.error('Error running query:', error);
            showToast('Network error executing query', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Open Save Query modal
    const handleOpenSave = () => {
        if (activeQuery) {
            setSaveName(activeQuery.name);
            setSaveIsShared(activeQuery.is_shared);
        } else {
            setSaveName('');
            setSaveIsShared(false);
        }
        setIsSaveModalOpen(true);
    };

    // Confirm Save
    const handleConfirmSave = async () => {
        if (!saveName.trim()) {
            showToast('Query name is required', 'error');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name: saveName,
                entity: entity,
                query_type: queryType,
                rules: rules,
                azql_text: azqlText,
                columns: columns,
                is_shared: saveIsShared
            };

            const url = activeQuery 
                ? `${ENDPOINTS.QUERIES}${activeQuery.id}/` 
                : ENDPOINTS.QUERIES;
            const method = activeQuery ? 'PUT' : 'POST';

            const response = await fetchWithAuth(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const savedObj = await response.json();
                showToast(`Query "${saveName}" saved successfully`, 'success');
                setIsSaveModalOpen(false);
                fetchSavedQueries();
                setActiveQuery(savedObj);
                
                // Update lastSavedStateRef to prevent debounced autosave immediately after save
                lastSavedStateRef.current = JSON.stringify({
                    entity,
                    queryType,
                    rules,
                    azqlText,
                    columns
                });
            } else {
                const data = await response.json();
                showToast(data.error || 'Failed to save query', 'error');
            }
        } catch (error) {
            showToast('Error saving query', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Load saved query
    const handleSelectQuery = (query) => {
        setActiveQuery(query);
        setEntity(query.entity);
        setQueryType(query.query_type);
        setColumns(query.columns || []);
        setAggregates(query.aggregates || []);
        
        const targetRules = query.rules || { combinator: 'and', rules: [] };
        if (query.query_type === 'visual') {
            setRules(targetRules);
        }
        setAzqlText(query.azql_text || '');
        setResults([]);
        setSelectedColumns([]);
        setIsSidebarOpen(false);
        
        // Update lastSavedStateRef to match the selected query so it doesn't auto-save it immediately!
        lastSavedStateRef.current = JSON.stringify({
            entity: query.entity,
            queryType: query.query_type,
            rules: targetRules,
            azqlText: query.azql_text || '',
            columns: query.columns || [],
            aggregates: query.aggregates || []
        });
    };

    // Delete query
    const handleDeleteQuery = async (query, e) => {
        e.stopPropagation();
        if (!window.confirm(`Are you sure you want to delete query "${query.name}"?`)) return;

        try {
            const response = await fetchWithAuth(`${ENDPOINTS.QUERIES}${query.id}/`, {
                method: 'DELETE'
            });

            if (response.ok) {
                showToast('Query deleted successfully', 'success');
                if (activeQuery?.id === query.id) {
                    handleResetQuery();
                }
                fetchSavedQueries();
            } else {
                showToast('Failed to delete query', 'error');
            }
        } catch (error) {
            showToast('Error deleting query', 'error');
        }
    };

    // Start fresh
    const handleResetQuery = () => {
        setActiveQuery(null);
        setEntity('order');
        setQueryType('visual');
        const defaultRules = { combinator: 'and', rules: [] };
        setRules(defaultRules);
        let defaultCols = [];
        if (schema?.entities && schema.entities['order']) {
            defaultCols = schema.entities['order'].fields.slice(0, 4).map(f => f.name);
            setColumns(defaultCols);
        }
        const defaultAzql = `SELECT ${defaultCols.map(c => `[${c}]`).join(', ')} FROM Order`;
        setAzqlText(defaultAzql);
        setAggregates([]);
        setResults([]);
        setSelectedColumns([]);
        
        lastSavedStateRef.current = JSON.stringify({
            entity: 'order',
            queryType: 'visual',
            rules: defaultRules,
            azqlText: defaultAzql,
            columns: defaultCols,
            aggregates: []
        });
    };

    // Inline column manager suggestions
    const colSuggestions = useMemo(() => {
        if (!schema?.entities || !schema.entities[entity]) return [];
        
        const lastUnderscoresIdx = colSearchValue.lastIndexOf('__');
        let targetEntity = entity;
        let prefixPath = "";
        let typedAfter = colSearchValue;
        
        if (lastUnderscoresIdx !== -1) {
            prefixPath = colSearchValue.substring(0, lastUnderscoresIdx);
            typedAfter = colSearchValue.substring(lastUnderscoresIdx + 2);
            
            const resolved = resolvePath(schema, entity, prefixPath);
            if (resolved && resolved.type === 'relation') {
                targetEntity = resolved.targetEntity;
            } else {
                return [];
            }
        }
        
        const entityDef = schema.entities[targetEntity];
        if (!entityDef) return [];
        
        const list = [];
        const queryTerm = typedAfter.toLowerCase();
        
        if (entityDef.fields) {
            entityDef.fields.forEach(f => {
                const fullFieldName = prefixPath ? `${prefixPath}__${f.name}` : f.name;
                if (columns.includes(fullFieldName)) return;
                
                if (f.name.toLowerCase().includes(queryTerm) || f.label.toLowerCase().includes(queryTerm)) {
                    list.push({
                        type: 'field',
                        name: f.name,
                        fullName: fullFieldName,
                        displayName: f.label,
                        rawObj: f
                    });
                }
            });
        }
        
        if (entityDef.relations) {
            entityDef.relations.forEach(r => {
                const fullRelName = prefixPath ? `${prefixPath}__${r.name}__` : `${r.name}__`;
                if (r.name.toLowerCase().includes(queryTerm) || r.label.toLowerCase().includes(queryTerm)) {
                    list.push({
                        type: 'relation',
                        name: r.name,
                        fullName: fullRelName,
                        displayName: `${r.label} (Relation)`,
                        rawObj: r
                    });
                }
            });
        }
        
        list.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'field' ? -1 : 1;
            return a.displayName.localeCompare(b.displayName);
        });
        
        return list;
    }, [schema, entity, columns, colSearchValue]);

    const handleSelectSuggestion = (sug) => {
        if (sug.type === 'field') {
            setColumns([...columns, sug.fullName]);
            setColSearchValue('');
            setIsColSuggestOpen(false);
            showToast(`Added column: ${sug.displayName}`, 'success');
        } else if (sug.type === 'relation') {
            setColSearchValue(sug.fullName);
            setIsColSuggestOpen(true);
            const inputEl = colSearchRef.current?.querySelector('input');
            if (inputEl) {
                inputEl.focus();
            }
        }
    };

    const handleAddColumn = (colName) => {
        setColumns([...columns, colName]);
    };

    const handleRemoveColumn = (colName) => {
        setColumns(columns.filter(c => c !== colName));
    };

    const handleMoveColumn = (index, direction) => {
        const nextCols = [...columns];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= nextCols.length) return;
        
        // Swap
        const temp = nextCols[index];
        nextCols[index] = nextCols[targetIndex];
        nextCols[targetIndex] = temp;
        setColumns(nextCols);
    };

    const handleResetColumns = () => {
        if (schema?.entities && schema.entities[entity]) {
            setColumns(schema.entities[entity].fields.slice(0, 4).map(f => f.name));
        }
    };

    return (
        <div className="query-playground-container fade-in">
            {/* Header Controls */}
            <header className="query-playground-header">
                <div className="query-title-section">
                    <h1>
                        <FileText size={24} className="text-primary" />
                        {activeQuery ? activeQuery.name : 'Unsaved Query'}
                        {activeQuery?.is_shared && <Share2 size={16} className="text-success" title="Shared with team" />}
                    </h1>
                    <div className="query-info-callout text-xs font-medium">
                        <span className="info-badge">reports replica</span>
                        <span>Neon compute mirror. Timeout: 5s. Limits: top 100 rows.</span>
                    </div>
                </div>

                <div className="query-actions-row">
                    <button className="btn btn-ghost sidebar-toggle-btn" onClick={() => setIsSidebarOpen(true)}>
                        <Menu size={20} />
                        Saved Queries
                    </button>
                    <button className="btn btn-ghost" onClick={handleResetQuery}>
                        + New
                    </button>
                    {/* Columns modal button removed - columns are now managed inline in visual mode */}
                    <GuardedAction permission="reports.manage_queries">
                        <button className="btn btn-ghost" onClick={handleOpenSave}>
                            <Save size={18} />
                            Save
                        </button>
                    </GuardedAction>
                    <button className="btn btn-primary" onClick={handleRunQuery} disabled={loading}>
                        <Play size={18} />
                        {loading ? 'Running...' : 'Run Query'}
                    </button>
                </div>
            </header>

            {/* Main Content Workspace */}
            <div className="query-workspace">
                {/* Sidebar Drawer */}
                <aside className={`query-sidebar ${isSidebarOpen ? 'open' : ''}`}>
                    <div className="sidebar-header">
                        <h3>Saved Queries</h3>
                        <button className="icon-btn sidebar-toggle-btn" onClick={() => setIsSidebarOpen(false)}>
                            <X size={18} />
                        </button>
                    </div>

                    <div className="queries-list-container">
                        {queriesLoading ? (
                            <div className="text-center text-muted text-sm py-4">Loading saved queries...</div>
                        ) : (
                            <>
                                {/* Personal section */}
                                <div className="queries-section">
                                    <h4>My Queries</h4>
                                    {savedQueries.filter(q => q.created_by === rbac?.user_id || (!q.is_shared && q.created_by_name === rbac?.username)).map(query => (
                                        <div 
                                            key={query.id} 
                                            className={`query-item ${activeQuery?.id === query.id ? 'active' : ''}`}
                                            onClick={() => handleSelectQuery(query)}
                                        >
                                            <div className="query-item-name">{query.name}</div>
                                            <div className="query-item-entity">{query.entity}</div>
                                            {((query.created_by === rbac?.user_id) || isSystemAdmin) && (
                                                <button className="icon-btn btn-sm text-danger" onClick={(e) => handleDeleteQuery(query, e)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {savedQueries.filter(q => q.created_by === rbac?.user_id || (!q.is_shared && q.created_by_name === rbac?.username)).length === 0 && (
                                        <div className="text-muted text-xs px-4 py-2">No personal queries saved.</div>
                                    )}
                                </div>

                                {/* Shared section */}
                                <div className="queries-section">
                                    <h4>Shared Queries</h4>
                                    {savedQueries.filter(q => q.is_shared).map(query => (
                                        <div 
                                            key={query.id} 
                                            className={`query-item ${activeQuery?.id === query.id ? 'active' : ''}`}
                                            onClick={() => handleSelectQuery(query)}
                                        >
                                            <div className="query-item-name">{query.name}</div>
                                            <div className="query-item-entity">{query.entity}</div>
                                            {isSystemAdmin && (
                                                <button className="icon-btn btn-sm text-danger" onClick={(e) => handleDeleteQuery(query, e)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {savedQueries.filter(q => q.is_shared).length === 0 && (
                                        <div className="text-muted text-xs px-4 py-2">No shared queries found.</div>
                                    )}
                                </div>

                                {/* History / Backups section */}
                                <div className="queries-section" style={{ borderTop: '1px solid var(--color-border-light)', marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)' }}>
                                    <h4 style={{ display: 'flex', alignItems: 'center', justifyContent: 'between' }}>
                                        <span>History & Backups</span>
                                        {historyLoading && <span className="spinner-small" style={{ display: 'inline-block', width: '10px', height: '10px', marginLeft: 'auto' }}></span>}
                                    </h4>
                                    <div className="history-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                        {historyQueries.map(hist => {
                                            const timeStr = new Date(hist.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                                            const dateStr = new Date(hist.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                                            return (
                                                <div 
                                                    key={hist.id} 
                                                    className="query-item history-item"
                                                    onClick={() => handleSelectHistory(hist)}
                                                    style={{ padding: 'var(--space-xs) var(--space-md)', opacity: 0.85 }}
                                                    title={`Restore query backup from ${dateStr} ${timeStr}`}
                                                >
                                                    <div className="query-item-name" style={{ fontSize: 'var(--font-size-xs)' }}>
                                                        {hist.name} <small className="text-muted">({timeStr})</small>
                                                    </div>
                                                    <div className="query-item-entity" style={{ fontSize: '9px', padding: '0 4px', display: 'flex', alignItems: 'center' }}>
                                                        {hist.entity}
                                                        {hist.is_safe && (
                                                            <span 
                                                                className="safe-badge text-success font-bold" 
                                                                title="Safe Point: Executed successfully"
                                                                style={{ marginLeft: '4px', fontSize: '9px' }}
                                                            >
                                                                ✓
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {historyQueries.length === 0 && (
                                            <div className="text-muted text-xs px-4 py-2">No query backups found.</div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </aside>

                {/* Main panel workspace */}
                <div className="query-main-panel">
                    {/* Editor workspace card */}
                    <section className="query-editor-card card glass">
                        <div className="editor-tabs-bar">
                            <div className="tabs">
                                <button 
                                    className={`tab ${queryType === 'visual' ? 'active' : ''}`} 
                                    onClick={() => handleTabChange('visual')}
                                >
                                    Visual Rules
                                </button>
                                <button 
                                    className={`tab ${queryType === 'azql' ? 'active' : ''}`} 
                                    onClick={() => handleTabChange('azql')}
                                >
                                    AZQL Text Editor
                                </button>
                            </div>

                            {/* Manual Sync Button */}
                            {queryType === 'azql' && (
                                <button 
                                    className="btn btn-ghost text-primary" 
                                    style={{ marginRight: 'auto', marginLeft: '1rem', height: '30px', padding: '0 8px', fontSize: 'var(--font-size-xs)' }}
                                    onClick={() => {
                                        try {
                                            const parsed = parseAZQLToVisual(azqlText);
                                            setEntity(parsed.entity);
                                            setColumns(parsed.columns);
                                            setRules(parsed.rules);
                                            showToast('Visual rules updated from editor text.', 'success');
                                        } catch (err) {
                                            showToast(err.message, 'warning');
                                        }
                                    }}
                                >
                                    Sync to Visual
                                </button>
                            )}

                            {/* Base Entity Dropdown */}
                            <div className="entity-selector-wrapper">
                                <label className="text-xs text-muted font-bold uppercase">Entity:</label>
                                <select 
                                    className="form-control entity-select" 
                                    value={entity}
                                    onChange={(e) => handleEntityChange(e.target.value)}
                                    disabled={queryType === 'azql'} // In text-editor, the FROM clause controls the entity
                                >
                                    <option value="order">Orders</option>
                                    <option value="orderitem">Order Items</option>
                                    <option value="outlet">Outlets</option>
                                    <option value="outletstock">Outlet Stock</option>
                                    <option value="product">Products</option>
                                    <option value="purchaseorder">Purchase Orders</option>
                                    <option value="customer">Customers</option>
                                    <option value="deliveryitem">Delivery Items</option>
                                </select>
                            </div>
                        </div>

                        {/* Editor Panels */}
                        <div className="tab-content">
                            {queryType === 'visual' ? (
                                <div className="visual-builder-panel">
                                    {/* Inline Columns Manager */}
                                    <div className="inline-columns-manager">
                                        <div className="columns-label">
                                            <span>Selected Columns:</span>
                                        </div>
                                        <div className="columns-pills-list">
                                            {columns.map((col, idx) => (
                                                <div key={col} className="column-pill">
                                                    <span className="column-pill-label" title={col}>
                                                        {getHeaderLabel(col)}
                                                    </span>
                                                    <span className="column-pill-path">
                                                        {col}
                                                    </span>
                                                    <div className="column-pill-actions">
                                                        <button 
                                                            className="pill-action-btn"
                                                            disabled={idx === 0}
                                                            onClick={() => handleMoveColumn(idx, -1)}
                                                            title="Move left"
                                                        >
                                                            ←
                                                        </button>
                                                        <button 
                                                            className="pill-action-btn"
                                                            disabled={idx === columns.length - 1}
                                                            onClick={() => handleMoveColumn(idx, 1)}
                                                            title="Move right"
                                                        >
                                                            →
                                                        </button>
                                                        <button 
                                                            className="pill-action-btn remove-btn"
                                                            onClick={() => handleRemoveColumn(col)}
                                                            title="Remove column"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            
                                            {aggregates.map((agg, idx) => (
                                                <div key={`agg-${idx}`} className="column-pill aggregate-pill" style={{ borderColor: 'var(--primary-color)', backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
                                                    <span className="column-pill-label" title={agg.alias}>
                                                        {agg.alias} <span className="text-xs text-muted">({agg.function})</span>
                                                    </span>
                                                    <span className="column-pill-path">
                                                        {agg.field}
                                                    </span>
                                                    <div className="column-pill-actions">
                                                        <button 
                                                            className="pill-action-btn remove-btn"
                                                            onClick={() => setAggregates(aggregates.filter((_, i) => i !== idx))}
                                                            title="Remove aggregate"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            
                                            {/* Add Column Search / Autocomplete Box */}
                                            <div className="add-column-wrapper" ref={colSearchRef}>
                                                <div className="search-input-container">
                                                    <Plus size={14} className="add-icon" />
                                                    <input
                                                        type="text"
                                                        placeholder="Add column (e.g. customer__first_name)..."
                                                        value={colSearchValue}
                                                        onChange={(e) => {
                                                            setColSearchValue(e.target.value);
                                                            setIsColSuggestOpen(true);
                                                        }}
                                                        onFocus={() => setIsColSuggestOpen(true)}
                                                        className="add-column-input"
                                                    />
                                                    {colSearchValue && (
                                                        <button 
                                                            className="clear-search-btn"
                                                            onClick={() => {
                                                                setColSearchValue('');
                                                                setIsColSuggestOpen(false);
                                                            }}
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>
                                                
                                                {isColSuggestOpen && colSuggestions.length > 0 && (
                                                    <ul className="column-suggestions-dropdown">
                                                        {colSuggestions.map((sug, sIdx) => (
                                                            <li 
                                                                key={sIdx} 
                                                                className={`suggestion-item ${sug.type}`}
                                                                onClick={() => handleSelectSuggestion(sug)}
                                                            >
                                                                <span className="suggestion-name">{sug.displayName}</span>
                                                                <span className="suggestion-type-badge">{sug.type}</span>
                                                                {sug.type === 'relation' && <span className="arrow-indicator">→</span>}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                            <button className="btn btn-sm btn-ghost reset-columns-btn" onClick={handleResetColumns}>
                                                Reset Defaults
                                            </button>
                                            <button 
                                                className="btn btn-sm btn-outline-primary"
                                                onClick={() => setIsAggregateModalOpen(true)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                            >
                                                <Database size={14} /> Add Aggregate
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <QueryBuilder
                                        fields={queryBuilderFields}
                                        query={rules}
                                        onQueryChange={setRules}
                                        getSubQueryBuilderProps={getSubQueryBuilderProps}
                                    />
                                </div>
                            ) : (
                                <div className="monaco-editor-container">
                                    <Editor
                                        height="220px"
                                        language="azql"
                                        theme="vs-dark"
                                        value={azqlText}
                                        onChange={(val) => setAzqlText(val || '')}
                                        beforeMount={handleEditorBeforeMount}
                                        onMount={handleEditorMount}
                                        options={{
                                            minimap: { enabled: false },
                                            fontSize: 13,
                                            lineNumbers: 'on',
                                            scrollBeyondLastLine: false,
                                            automaticLayout: true,
                                            scrollbar: {
                                                vertical: 'auto',
                                                horizontal: 'auto'
                                            }
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Results table card */}
                    <section className="query-results-card card glass">
                        <div className="results-header">
                            <h3 className="font-bold">Results ({results.length})</h3>
                        </div>

                        {results.length > 0 ? (
                            <div className="table-responsive">
                                <table className="results-table">
                                    <thead>
                                        <tr>
                                            {selectedColumns.map(col => (
                                                <th key={col}>{getHeaderLabel(col)}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.map((row, idx) => (
                                            <tr key={idx}>
                                                {selectedColumns.map(col => (
                                                    <td key={col}>{renderCell(col, row[col])}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="empty-results">
                                {loading ? (
                                    <div className="loading-state">
                                        <div className="spinner-large"></div>
                                        <p style={{ marginTop: '1rem' }}>Executing read query on Neon replica...</p>
                                    </div>
                                ) : (
                                    <>
                                        <Database size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
                                        <p>No results loaded.</p>
                                        <small className="text-muted">Enter visual rules or AZQL queries above and click "Run Query".</small>
                                    </>
                                )}
                            </div>
                        )}
                    </section>
                </div>
            </div>

            {/* Delete Confirmation Modal handles natively via prompt */}

            <AggregateColumnModal
                isOpen={isAggregateModalOpen}
                onClose={() => setIsAggregateModalOpen(false)}
                onSave={(agg) => {
                    setAggregates([...aggregates, agg]);
                    setIsAggregateModalOpen(false);
                }}
                entity={entity}
                schema={schema}
                queryBuilderFields={queryBuilderFields}
            />

            {/* Save Query Modal */}
            {isSaveModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>Save Query</h2>
                        
                        <div className="save-query-modal-body">
                            <div className="form-group">
                                <label htmlFor="query-save-name">Query Name</label>
                                <input 
                                    id="query-save-name"
                                    type="text" 
                                    className="form-control"
                                    value={saveName}
                                    onChange={(e) => setSaveName(e.target.value)}
                                    placeholder="Enter query name..."
                                />
                            </div>

                            <label className="checkbox-group">
                                <input 
                                    type="checkbox" 
                                    checked={saveIsShared}
                                    onChange={(e) => setSaveIsShared(e.target.checked)}
                                />
                                <span>Share with team (Shared Queries)</span>
                            </label>
                        </div>

                        <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                            <button className="btn btn-ghost" onClick={() => setIsSaveModalOpen(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleConfirmSave} disabled={saving}>
                                {saving ? 'Saving...' : 'Save Query'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
