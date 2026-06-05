import React, { useState, useMemo } from 'react';
import './SchoolStructureTree.css';

/**
 * SchoolStructureTree — Collapsible checkbox tree picker for assigning
 * class/division/subdivision structure to a school.
 * 
 * Props:
 *   classTemplates     - [{id, name, order}]
 *   divisionTemplates  - [{id, name}]
 *   subdivisionTemplates - [{id, name}]
 *   selection          - { classes: { [className]: { checked, divisions: { [divName]: { checked, subdivisions: [subName] } } } } }
 *   onSelectionChange  - (newSelection) => void
 *   onInlineAdd        - (type, name) => Promise<void>  // for inline "+ Add" buttons
 *   readOnly           - boolean
 */
export default function SchoolStructureTree({
    classTemplates = [],
    divisionTemplates = [],
    subdivisionTemplates = [],
    selection = {},
    onSelectionChange,
    onInlineAdd,
    readOnly = false
}) {
    const [expandedClasses, setExpandedClasses] = useState({});
    const [expandedDivisions, setExpandedDivisions] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [inlineAddType, setInlineAddType] = useState(null); // 'class' | 'division' | 'subdivision'
    const [inlineAddValue, setInlineAddValue] = useState('');
    const [addingInline, setAddingInline] = useState(false);

    // Filter and naturally sort templates by search
    const naturalSort = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

    const filteredClasses = useMemo(() => {
        let result = classTemplates;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = classTemplates.filter(c => {
                if (c.name.toLowerCase().includes(term)) return true;
                return divisionTemplates.some(d => d.name.toLowerCase().includes(term)) ||
                    subdivisionTemplates.some(s => s.name.toLowerCase().includes(term));
            });
        }
        return [...result].sort(naturalSort);
    }, [classTemplates, divisionTemplates, subdivisionTemplates, searchTerm]);

    // Toggle expand/collapse
    const toggleClassExpand = (className) => {
        setExpandedClasses(prev => ({ ...prev, [className]: !prev[className] }));
    };

    const toggleDivisionExpand = (key) => {
        setExpandedDivisions(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Selection helpers
    const isClassChecked = (className) => {
        return !!selection[className]?.checked;
    };

    const isDivisionChecked = (className, divName) => {
        return !!selection[className]?.divisions?.[divName]?.checked;
    };

    const isSubdivisionChecked = (className, divName, subName) => {
        return selection[className]?.divisions?.[divName]?.subdivisions?.includes(subName) || false;
    };

    // Count checked divisions for a class
    const checkedDivisionCount = (className) => {
        const divs = selection[className]?.divisions || {};
        return Object.values(divs).filter(d => d.checked).length;
    };

    // Count checked subdivisions for a division
    const checkedSubdivisionCount = (className, divName) => {
        return (selection[className]?.divisions?.[divName]?.subdivisions || []).length;
    };

    // Applicability-aware filters
    const getDivisionsForClass = (className) => {
        return divisionTemplates.filter(d =>
            !d.applicable_class_names?.length || d.applicable_class_names.includes(className)
        );
    };

    const getSubdivisionsForDivision = (divName) => {
        return subdivisionTemplates.filter(s =>
            !s.applicable_division_names?.length || s.applicable_division_names.includes(divName)
        );
    };

    // Class-level indeterminate state (compare against applicable divisions only)
    const isClassIndeterminate = (className) => {
        const count = checkedDivisionCount(className);
        const applicableCount = getDivisionsForClass(className).length;
        return count > 0 && count < applicableCount && !isClassChecked(className);
    };

    // Toggle class checkbox
    const toggleClass = (className) => {
        if (readOnly) return;
        const newSel = { ...selection };
        if (isClassChecked(className)) {
            delete newSel[className];
        } else {
            newSel[className] = { checked: true, divisions: {} };
        }
        onSelectionChange(newSel);
    };

    // Toggle division checkbox
    const toggleDivision = (className, divName) => {
        if (readOnly) return;
        const newSel = { ...selection };
        if (!newSel[className]) {
            newSel[className] = { checked: false, divisions: {} };
        }
        const divs = { ...newSel[className].divisions };
        if (isDivisionChecked(className, divName)) {
            delete divs[divName];
        } else {
            divs[divName] = { checked: true, subdivisions: [] };
        }
        // Auto-check parent if any division is checked
        const anyDivChecked = Object.values(divs).some(d => d.checked);
        newSel[className] = { checked: anyDivChecked || newSel[className].checked, divisions: divs };
        onSelectionChange(newSel);
    };

    // Toggle subdivision checkbox
    const toggleSubdivision = (className, divName, subName) => {
        if (readOnly) return;
        const newSel = { ...selection };
        if (!newSel[className]) newSel[className] = { checked: false, divisions: {} };
        if (!newSel[className].divisions[divName]) {
            newSel[className].divisions[divName] = { checked: false, subdivisions: [] };
        }
        const subs = [...(newSel[className].divisions[divName].subdivisions || [])];
        const idx = subs.indexOf(subName);
        if (idx >= 0) {
            subs.splice(idx, 1);
        } else {
            subs.push(subName);
        }
        newSel[className].divisions[divName] = {
            checked: subs.length > 0 || newSel[className].divisions[divName].checked,
            subdivisions: subs
        };
        // Auto-check parent class if any division has content
        const anyDivActive = Object.values(newSel[className].divisions).some(d => d.checked || d.subdivisions?.length > 0);
        newSel[className].checked = anyDivActive || newSel[className].checked;
        onSelectionChange(newSel);
    };

    // Select all / deselect all for a level
    const selectAllClasses = () => {
        if (readOnly) return;
        const newSel = {};
        classTemplates.forEach(c => {
            newSel[c.name] = { checked: true, divisions: selection[c.name]?.divisions || {} };
        });
        onSelectionChange(newSel);
    };

    const deselectAll = () => {
        if (readOnly) return;
        onSelectionChange({});
    };

    // Select all divisions for a class (only applicable ones)
    const selectAllDivisionsForClass = (className) => {
        if (readOnly) return;
        const newSel = { ...selection };
        if (!newSel[className]) newSel[className] = { checked: true, divisions: {} };
        const divs = { ...newSel[className].divisions };
        getDivisionsForClass(className).forEach(d => {
            if (!divs[d.name]) divs[d.name] = { checked: true, subdivisions: [] };
            else divs[d.name] = { ...divs[d.name], checked: true };
        });
        newSel[className] = { checked: true, divisions: divs };
        onSelectionChange(newSel);
    };

    // Inline add handler
    const handleInlineAdd = async () => {
        if (!inlineAddValue.trim() || !onInlineAdd) return;
        setAddingInline(true);
        try {
            await onInlineAdd(inlineAddType, inlineAddValue.trim());
            setInlineAddValue('');
            setInlineAddType(null);
        } catch (err) {
            console.error(err);
        } finally {
            setAddingInline(false);
        }
    };

    // Build structure payload for API
    const totalSelected = useMemo(() => {
        let classes = 0, divisions = 0, subdivisions = 0;
        Object.entries(selection).forEach(([className, cls]) => {
            if (cls.checked) {
                classes++;
                Object.entries(cls.divisions || {}).forEach(([divName, div]) => {
                    if (div.checked) {
                        divisions++;
                        subdivisions += (div.subdivisions || []).length;
                    }
                });
            }
        });
        return { classes, divisions, subdivisions };
    }, [selection]);

    const hasAnySelection = totalSelected.classes > 0;

    return (
        <div className="structure-tree" role="tree" aria-label="School structure picker">
            {/* Search + bulk actions */}
            <div className="structure-tree__toolbar">
                <input
                    type="text"
                    className="structure-tree__search"
                    placeholder="🔍 Search classes, divisions, subdivisions..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                {!readOnly && (
                    <div className="structure-tree__bulk-actions">
                        <button type="button" className="btn btn-ghost btn-xs" onClick={selectAllClasses}>Select All</button>
                        <button type="button" className="btn btn-ghost btn-xs" onClick={deselectAll}>Deselect All</button>
                    </div>
                )}
            </div>

            {/* Selection summary */}
            {hasAnySelection && (
                <div className="structure-tree__summary">
                    ✅ {totalSelected.classes} classes · {totalSelected.divisions} divisions · {totalSelected.subdivisions} subdivisions selected
                </div>
            )}

            {/* Tree */}
            <div className="structure-tree__list">
                {filteredClasses.length === 0 && (
                    <div className="structure-tree__empty">
                        {classTemplates.length === 0
                            ? <span>No classes in catalog yet. <a href="/settings/classes">Add classes →</a></span>
                            : 'No classes match your search.'}
                    </div>
                )}

                {filteredClasses.map(cls => {
                    const isExpanded = expandedClasses[cls.name];
                    const divCount = checkedDivisionCount(cls.name);
                    return (
                        <div key={cls.id} className="structure-tree__node" role="treeitem" aria-expanded={isExpanded}>
                            {/* Class row */}
                            <div className="structure-tree__row structure-tree__row--class">
                                <button
                                    type="button"
                                    className="structure-tree__expand"
                                    onClick={() => toggleClassExpand(cls.name)}
                                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                                >
                                    {isExpanded ? '▾' : '▸'}
                                </button>
                                {!readOnly && (
                                    <input
                                        type="checkbox"
                                        checked={isClassChecked(cls.name)}
                                        ref={el => { if (el) el.indeterminate = isClassIndeterminate(cls.name); }}
                                        onChange={() => toggleClass(cls.name)}
                                        className="structure-tree__checkbox"
                                    />
                                )}
                                <span className="structure-tree__label" onClick={() => toggleClassExpand(cls.name)}>
                                    {cls.name}
                                </span>
                                {divCount > 0 && (
                                    <span className="structure-tree__badge">{divCount} div{divCount !== 1 ? 's' : ''}</span>
                                )}
                            </div>

                            {/* Division children */}
                            {isExpanded && (
                                <div className="structure-tree__children" role="group">
                                    {!readOnly && (
                                        <div className="structure-tree__level-actions">
                                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => selectAllDivisionsForClass(cls.name)}>
                                                Select all divisions
                                            </button>
                                        </div>
                                    )}
                                    {divisionTemplates
                                        .filter(div => !div.applicable_class_names?.length || div.applicable_class_names.includes(cls.name))
                                        .map(div => {
                                            const divKey = `${cls.name}::${div.name}`;
                                            const isDivExpanded = expandedDivisions[divKey];
                                            const subCount = checkedSubdivisionCount(cls.name, div.name);
                                            return (
                                                <div key={div.id} className="structure-tree__node" role="treeitem" aria-expanded={isDivExpanded}>
                                                    <div className="structure-tree__row structure-tree__row--division">
                                                        <button
                                                            type="button"
                                                            className="structure-tree__expand"
                                                            onClick={() => toggleDivisionExpand(divKey)}
                                                        >
                                                            {isDivExpanded ? '▾' : '▸'}
                                                        </button>
                                                        {!readOnly && (
                                                            <input
                                                                type="checkbox"
                                                                checked={isDivisionChecked(cls.name, div.name)}
                                                                onChange={() => toggleDivision(cls.name, div.name)}
                                                                className="structure-tree__checkbox"
                                                            />
                                                        )}
                                                        <span className="structure-tree__label" onClick={() => toggleDivisionExpand(divKey)}>
                                                            {div.name}
                                                        </span>
                                                        {subCount > 0 && (
                                                            <span className="structure-tree__badge">{subCount} sub{subCount !== 1 ? 's' : ''}</span>
                                                        )}
                                                    </div>

                                                    {/* Subdivision children */}
                                                    {isDivExpanded && (
                                                        <div className="structure-tree__children" role="group">
                                                            {subdivisionTemplates
                                                                .filter(sub => !sub.applicable_division_names?.length || sub.applicable_division_names.includes(div.name))
                                                                .map(sub => (
                                                                    <div key={sub.id} className="structure-tree__row structure-tree__row--subdivision">
                                                                        {!readOnly && (
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={isSubdivisionChecked(cls.name, div.name, sub.name)}
                                                                                onChange={() => toggleSubdivision(cls.name, div.name, sub.name)}
                                                                                className="structure-tree__checkbox"
                                                                            />
                                                                        )}
                                                                        <span className="structure-tree__label">{sub.name}</span>
                                                                    </div>
                                                                ))}
                                                            {subdivisionTemplates.length === 0 && (
                                                                <div className="structure-tree__empty-child">No subdivision templates</div>
                                                            )}
                                                            {/* Inline add subdivision */}
                                                            {!readOnly && onInlineAdd && (
                                                                inlineAddType === 'subdivision' ? (
                                                                    <div className="structure-tree__inline-add">
                                                                        <input
                                                                            type="text"
                                                                            value={inlineAddValue}
                                                                            onChange={e => setInlineAddValue(e.target.value)}
                                                                            placeholder="New subdivision name..."
/* fallow-ignore-next-line code-duplication */
                                                                            onKeyDown={e => e.key === 'Enter' && handleInlineAdd()}
                                                                            autoFocus
                                                                        />
                                                                        <button type="button" className="btn btn-primary btn-xs" onClick={handleInlineAdd} disabled={addingInline}>
                                                                            {addingInline ? '...' : 'Add'}
                                                                        </button>
                                                                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setInlineAddType(null)}>✕</button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        className="structure-tree__add-btn"
                                                                        onClick={() => { setInlineAddType('subdivision'); setInlineAddValue(''); }}
                                                                    >
                                                                        + Add Subdivision
                                                                    </button>
                                                                )
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    {divisionTemplates.length === 0 && (
                                        <div className="structure-tree__empty-child">No division templates</div>
                                    )}
                                    {/* Inline add division */}
                                    {!readOnly && onInlineAdd && (
                                        inlineAddType === 'division' ? (
                                            <div className="structure-tree__inline-add">
                                                <input
                                                    type="text"
                                                    value={inlineAddValue}
                                                    onChange={e => setInlineAddValue(e.target.value)}
                                                    placeholder="New division name..."
/* fallow-ignore-next-line code-duplication */
                                                    onKeyDown={e => e.key === 'Enter' && handleInlineAdd()}
                                                    autoFocus
                                                />
                                                <button type="button" className="btn btn-primary btn-xs" onClick={handleInlineAdd} disabled={addingInline}>
                                                    {addingInline ? '...' : 'Add'}
                                                </button>
                                                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setInlineAddType(null)}>✕</button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                className="structure-tree__add-btn"
                                                onClick={() => { setInlineAddType('division'); setInlineAddValue(''); }}
                                            >
                                                + Add Division
                                            </button>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Inline add class */}
                {!readOnly && onInlineAdd && (
                    inlineAddType === 'class' ? (
                        <div className="structure-tree__inline-add structure-tree__inline-add--root">
                            <input
                                type="text"
                                value={inlineAddValue}
                                onChange={e => setInlineAddValue(e.target.value)}
                                placeholder="New class name..."
/* fallow-ignore-next-line code-duplication */
                                onKeyDown={e => e.key === 'Enter' && handleInlineAdd()}
                                autoFocus
                            />
                            <button type="button" className="btn btn-primary btn-xs" onClick={handleInlineAdd} disabled={addingInline}>
                                {addingInline ? '...' : 'Add'}
                            </button>
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setInlineAddType(null)}>✕</button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="structure-tree__add-btn structure-tree__add-btn--root"
                            onClick={() => { setInlineAddType('class'); setInlineAddValue(''); }}
                        >
                            + Add Class
                        </button>
                    )
                )}
            </div>
        </div>
    );
}
