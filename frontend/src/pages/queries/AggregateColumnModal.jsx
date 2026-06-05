import React, { useState, useMemo } from 'react';
import { X, Save } from 'lucide-react';
import { QueryBuilder } from 'react-querybuilder';
import './QueryBuilder.css';

export default function AggregateColumnModal({
    isOpen,
    onClose,
    onSave,
    entity,
    schema,
    queryBuilderFields
}) {
    const [alias, setAlias] = useState('');
    const [func, setFunc] = useState('SUM');
    const [relation, setRelation] = useState('');
    const [field, setField] = useState('');
    const [filterRules, setFilterRules] = useState({ combinator: 'and', rules: [] });

    // Extract relation options from current entity schema
    const relationOptions = useMemo(() => {
        if (!schema?.entities || !schema.entities[entity]) return [];
        const entityDef = schema.entities[entity];
        if (!entityDef.relations) return [];
        return entityDef.relations.map(r => ({
            value: `~${r.name}`,
            label: r.label,
            target: r.target
        }));
    }, [schema, entity]);

    // Extract numerical field options from selected relation target schema
// fallow-ignore-next-line code-duplication
    const fieldOptions = useMemo(() => {
        if (!relation) return [];
        const relOpt = relationOptions.find(r => r.value === relation);
        if (!relOpt || !schema?.entities || !schema.entities[relOpt.target]) return [];
        
        const targetDef = schema.entities[relOpt.target];
        if (!targetDef.fields) return [];
        
        // Return aggregatable fields (number or integer)
        if (func === 'COUNT') {
             return targetDef.fields.map(f => ({ value: f.name, label: f.label }));
        }
        return targetDef.fields
            .filter(f => f.type === 'number' || f.type === 'integer' || f.type === 'decimal')
            .map(f => ({ value: f.name, label: f.label }));
    }, [relation, relationOptions, schema, func]);

    // Format subquery fields for relation target
// fallow-ignore-next-line code-duplication
    const subqueryBuilderFields = useMemo(() => {
        if (!relation) return [];
        const relOpt = relationOptions.find(r => r.value === relation);
        if (!relOpt || !schema?.entities || !schema.entities[relOpt.target]) return [];
        
        const targetDef = schema.entities[relOpt.target];
        return targetDef.fields.map(f => {
// fallow-ignore-next-line code-duplication
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
        });
    }, [relation, relationOptions, schema]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!alias || !func || !relation || !field) {
            alert('Please fill out all required fields.');
            return;
        }
        onSave({ alias, function: func, relation, field, filter_rules: filterRules });
        // Reset
        setAlias('');
        setFunc('SUM');
        setRelation('');
        setField('');
        setFilterRules({ combinator: 'and', rules: [] });
    };

    return (
        <div className="modal-backdrop fade-in" style={{ zIndex: 10000 }}>
            <div className="modal-content" style={{ width: '800px', maxWidth: '90vw' }}>
                <div className="modal-header">
                    <h3 className="modal-title">Add Aggregate Column</h3>
                    <button className="btn-close" onClick={onClose}><X size={20} /></button>
                </div>
                
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div style={{ flex: 1 }}>
                            <label className="text-xs text-muted font-bold uppercase">Column Alias (Header)</label>
                            <input 
                                className="form-control" 
                                value={alias} 
                                onChange={e => setAlias(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} 
                                placeholder="e.g. total_delivered" 
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label className="text-xs text-muted font-bold uppercase">Function</label>
                            <select className="form-control" value={func} onChange={e => setFunc(e.target.value)}>
                                <option value="SUM">SUM</option>
                                <option value="COUNT">COUNT</option>
                                <option value="AVG">AVG</option>
                                <option value="MAX">MAX</option>
                                <option value="MIN">MIN</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div style={{ flex: 1 }}>
                            <label className="text-xs text-muted font-bold uppercase">Target Relation</label>
                            <select className="form-control" value={relation} onChange={e => {
                                setRelation(e.target.value);
                                setField(''); // Reset field
                            }}>
                                <option value="">Select Relation...</option>
                                {relationOptions.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ flex: 1 }}>
                            <label className="text-xs text-muted font-bold uppercase">Target Field</label>
                            <select className="form-control" value={field} onChange={e => setField(e.target.value)}>
                                <option value="">Select Field...</option>
                                {fieldOptions.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {relation && (
                        <div style={{ marginTop: '1rem' }}>
                            <label className="text-xs text-muted font-bold uppercase">Filter Subquery (Optional)</label>
                            <div className="visual-builder-panel" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-md)', padding: '1rem' }}>
                                <QueryBuilder
                                    fields={subqueryBuilderFields}
                                    query={filterRules}
                                    onQueryChange={setFilterRules}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Save size={16} /> Save Aggregate
                    </button>
                </div>
            </div>
        </div>
    );
}
