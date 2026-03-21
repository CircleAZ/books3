import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import { useToast } from '../../context/ToastContext';
import SchoolStructureTree from '../../components/common/SchoolStructureTree';

export default function ManageSchools() {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();

    // Schools list
    const [schools, setSchools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Wizard state: null | 'details' | 'structure'
    const [wizardStep, setWizardStep] = useState(null);
    const [currentSchool, setCurrentSchool] = useState(null); // editing existing
    const [formData, setFormData] = useState({ name: '', address: '' });
    const [saving, setSaving] = useState(false);

    // Structure picker state
    const [structureSelection, setStructureSelection] = useState({});
    const [assigningStructure, setAssigningStructure] = useState(false);
    const [editingStructure, setEditingStructure] = useState(null); // school id for inline structure edit

    // Template catalogs
    const [classTemplates, setClassTemplates] = useState([]);
    const [divisionTemplates, setDivisionTemplates] = useState([]);
    const [subdivisionTemplates, setSubdivisionTemplates] = useState([]);

    // Delete confirmation
    const [deletingSchool, setDeletingSchool] = useState(null);

    const fetchSchools = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(ENDPOINTS.SCHOOLS);
            if (res.ok) {
                const data = await res.json();
                setSchools(data.results || data || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    const fetchTemplates = useCallback(async () => {
        try {
            const [classRes, divRes, subRes] = await Promise.all([
                fetchWithAuth(ENDPOINTS.CLASS_TEMPLATES),
                fetchWithAuth(ENDPOINTS.DIVISION_TEMPLATES),
                fetchWithAuth(ENDPOINTS.SUBDIVISION_TEMPLATES)
            ]);
            if (classRes.ok) {
                const data = await classRes.json();
                setClassTemplates(data.results || data || []);
            }
            if (divRes.ok) {
                const data = await divRes.json();
                setDivisionTemplates(data.results || data || []);
            }
            if (subRes.ok) {
                const data = await subRes.json();
                setSubdivisionTemplates(data.results || data || []);
            }
        } catch (err) {
            console.error(err);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchSchools();
        fetchTemplates(); // Eager load so tree picker is ready
    }, [fetchSchools, fetchTemplates]);

    // Refresh templates when entering wizard structure step or inline edit
    useEffect(() => {
        if (wizardStep === 'structure' || editingStructure) {
            fetchTemplates();
        }
    }, [wizardStep, editingStructure, fetchTemplates]);

    // --- Wizard: Step 1 — School Details ---
    const startNewSchool = () => {
        setCurrentSchool(null);
        setFormData({ name: '', address: '' });
        setStructureSelection({});
        setWizardStep('details');
    };

    const startEditSchool = (school) => {
        setCurrentSchool(school);
        setFormData({ name: school.name, address: school.address || '' });
        setWizardStep('details');
    };

    const handleDetailsSubmit = async (e) => {
        e.preventDefault();
        if (saving) return;
        const trimmed = { name: formData.name.trim(), address: formData.address.trim() };
        if (!trimmed.name) { showToast('School name is required', 'error'); return; }
        setSaving(true);
        try {
            const url = currentSchool
                ? `${ENDPOINTS.SCHOOLS}${currentSchool.id}/`
                : ENDPOINTS.SCHOOLS;
            const method = currentSchool ? 'PUT' : 'POST';
            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trimmed)
            });
            if (res.ok) {
                const savedSchool = await res.json();
                showToast(currentSchool ? 'School updated' : 'School created', 'success');
                if (!currentSchool) {
                    // New school → go to structure step
                    setCurrentSchool(savedSchool);
                    setWizardStep('structure');
                } else {
                    // Editing existing → back to list
                    setWizardStep(null);
                    fetchSchools();
                }
            } else {
                const errData = await res.json().catch(() => null);
                showToast(errData?.name?.[0] || errData?.detail || 'Failed to save', 'error');
            }
        } catch (err) {
            showToast('Network error', 'error');
        } finally {
            setSaving(false);
        }
    };

    // --- Wizard: Step 2 — Structure Assignment ---
    const handleAssignStructure = async () => {
        if (assigningStructure || !currentSchool) return;

        // Build payload from selection
        const structure = [];
        Object.entries(structureSelection).forEach(([className, cls]) => {
            if (!cls.checked) return;
            const classEntry = {
                class_name: className,
                order: classTemplates.find(c => c.name === className)?.order || 0,
                divisions: []
            };
            Object.entries(cls.divisions || {}).forEach(([divName, div]) => {
                if (!div.checked) return;
                classEntry.divisions.push({
                    name: divName,
                    subdivisions: div.subdivisions || []
                });
            });
            structure.push(classEntry);
        });

        if (structure.length === 0) {
            showToast('Select at least one class', 'error');
            return;
        }

        setAssigningStructure(true);
        try {
            const res = await fetchWithAuth(ENDPOINTS.SCHOOL_ASSIGN_STRUCTURE(currentSchool.id), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ structure })
            });
            if (res.ok) {
                const result = await res.json();
                showToast(result.message, 'success');
                setWizardStep(null);
                setCurrentSchool(null);
                setStructureSelection({});
                fetchSchools();
            } else {
                const errData = await res.json().catch(() => null);
                showToast(errData?.error || 'Failed to assign structure', 'error');
            }
        } catch (err) {
            showToast('Network error', 'error');
        } finally {
            setAssigningStructure(false);
        }
    };

    // --- Inline structure edit (for existing schools) ---
    const handleEditStructure = async (schoolId) => {
        setEditingStructure(schoolId);
        setStructureSelection({});
    };

    const handleAssignEditedStructure = async () => {
        if (!editingStructure) return;

        const structure = [];
        Object.entries(structureSelection).forEach(([className, cls]) => {
            if (!cls.checked) return;
            const classEntry = { class_name: className, order: classTemplates.find(c => c.name === className)?.order || 0, divisions: [] };
            Object.entries(cls.divisions || {}).forEach(([divName, div]) => {
                if (!div.checked) return;
                classEntry.divisions.push({ name: divName, subdivisions: div.subdivisions || [] });
            });
            structure.push(classEntry);
        });

        if (structure.length === 0) {
            showToast('Select at least one class', 'error');
            return;
        }

        setAssigningStructure(true);
        try {
            const res = await fetchWithAuth(ENDPOINTS.SCHOOL_ASSIGN_STRUCTURE(editingStructure), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ structure })
            });
            if (res.ok) {
                const result = await res.json();
                showToast(result.message, 'success');
                setEditingStructure(null);
                setStructureSelection({});
                fetchSchools();
            } else {
                const errData = await res.json().catch(() => null);
                showToast(errData?.error || 'Failed to assign structure', 'error');
            }
        } catch (err) {
            showToast('Network error', 'error');
        } finally {
            setAssigningStructure(false);
        }
    };

    // --- Delete with structure ---
    const handleDeleteWithStructure = async (school) => {
        setDeletingSchool(null);
        try {
            const res = await fetchWithAuth(ENDPOINTS.SCHOOL_DELETE_WITH_STRUCTURE(school.id), {
                method: 'DELETE'
            });
            if (res.ok) {
                showToast(`Deleted '${school.name}' and all its structure`, 'success');
                fetchSchools();
            } else {
                showToast('Failed to delete', 'error');
            }
        } catch (err) {
            showToast('Error deleting school', 'error');
        }
    };

    // --- Inline add template from tree picker ---
    const handleInlineAdd = async (type, name) => {
        const endpoint = type === 'class' ? ENDPOINTS.CLASS_TEMPLATES
            : type === 'division' ? ENDPOINTS.DIVISION_TEMPLATES
                : ENDPOINTS.SUBDIVISION_TEMPLATES;
        const body = type === 'class' ? { name, order: 0 } : { name };

        const res = await fetchWithAuth(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            showToast(`${type} template '${name}' added`, 'success');
            await fetchTemplates(); // refresh the tree
        } else {
            const errData = await res.json().catch(() => null);
            throw new Error(errData?.name?.[0] || 'Failed to add');
        }
    };

    // --- Render ---
    const filtered = schools.filter(s =>
        s.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.address?.toLowerCase().includes(search.toLowerCase())
    );

    if (loading && !wizardStep && schools.length === 0) {
        return <div className="manager-empty">Loading...</div>;
    }

    // Wizard view
    if (wizardStep) {
        return (
            <div>
                <div className="manager-header">
                    <div>
                        <h2>{currentSchool && wizardStep === 'structure' ? `Assign Structure: ${currentSchool.name}` : (currentSchool ? 'Edit School' : 'New School')}</h2>
                        <div className="manager-subtitle">
                            {wizardStep === 'details' ? 'Step 1 of 2 — School details' : 'Step 2 of 2 — Select class structure'}
                        </div>
                    </div>
                    <button className="btn btn-ghost" onClick={() => { setWizardStep(null); fetchSchools(); }}>
                        ← Back to list
                    </button>
                </div>

                {/* Step indicator */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{
                        padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
                        background: wizardStep === 'details' ? 'var(--primary-color, #8b5cf6)' : 'rgba(255,255,255,0.05)',
                        color: wizardStep === 'details' ? '#fff' : 'var(--text-secondary)'
                    }}>
                        ① School Details
                    </div>
                    <div style={{
                        padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
                        background: wizardStep === 'structure' ? 'var(--primary-color, #8b5cf6)' : 'rgba(255,255,255,0.05)',
                        color: wizardStep === 'structure' ? '#fff' : 'var(--text-secondary)'
                    }}>
                        ② Assign Structure
                    </div>
                </div>

                {wizardStep === 'details' && (
                    <div className="card manager-form-card">
                        <form onSubmit={handleDetailsSubmit}>
                            <div className="manager-form-group">
                                <label>School Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. Delhi Public School"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="manager-form-group">
                                <label>Address</label>
                                <textarea
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    rows={2}
                                    placeholder="School address (optional)"
                                />
                            </div>
                            <div className="flex gap-sm">
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Saving...' : (currentSchool ? 'Update School' : 'Save & Continue →')}
                                </button>
                                <button type="button" className="btn btn-ghost" onClick={() => setWizardStep(null)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                )}

                {wizardStep === 'structure' && (
                    <div>
                        <div className="card manager-form-card">
                            <h3>Select classes, divisions, and subdivisions for {currentSchool?.name}</h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                Pick from your catalog. Each selection creates independent records for this school.
                            </p>
                            <SchoolStructureTree
                                classTemplates={classTemplates}
                                divisionTemplates={divisionTemplates}
                                subdivisionTemplates={subdivisionTemplates}
                                selection={structureSelection}
                                onSelectionChange={setStructureSelection}
                                onInlineAdd={handleInlineAdd}
                            />
                            <div className="flex gap-sm" style={{ marginTop: '1rem' }}>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleAssignStructure}
                                    disabled={assigningStructure}
                                >
                                    {assigningStructure ? 'Assigning...' : 'Assign Structure'}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => { setWizardStep(null); fetchSchools(); }}
                                >
                                    Skip for now
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Main list view
    return (
        <div>
            <div className="manager-header">
                <div>
                    <h2>Manage Schools</h2>
                    <div className="manager-subtitle">Schools with their class/division/subdivision structure</div>
                </div>
                <button className="btn btn-primary" onClick={startNewSchool}>
                    + Add School
                </button>
            </div>

            {schools.length > 3 && (
                <div className="manager-search">
                    <input
                        type="text"
                        placeholder="Filter schools..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            )}

            <table className="manager-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Address</th>
                        <th>Structure</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(school => (
                        <React.Fragment key={school.id}>
                            <tr>
                                <td>{school.name}</td>
                                <td>{school.address || '—'}</td>
                                <td>
                                    <span style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                        {school.class_count > 0 && (
                                            <span className="manager-badge">{school.class_count} class{school.class_count !== 1 ? 'es' : ''}</span>
                                        )}
                                        {school.division_count > 0 && (
                                            <span className="manager-badge">{school.division_count} div{school.division_count !== 1 ? 's' : ''}</span>
                                        )}
                                        {school.subdivision_count > 0 && (
                                            <span className="manager-badge">{school.subdivision_count} sub{school.subdivision_count !== 1 ? 's' : ''}</span>
                                        )}
                                        {!school.class_count && <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No structure</span>}
                                    </span>
                                </td>
                                <td className="actions-cell">
                                    <button className="btn btn-ghost" onClick={() => startEditSchool(school)}>Edit</button>
                                    <button className="btn btn-ghost" onClick={() => handleEditStructure(school.id)}>
                                        {school.class_count > 0 ? '✏️ Structure' : '➕ Structure'}
                                    </button>
                                    <button className="btn btn-ghost text-danger" onClick={() => setDeletingSchool(school)}>Delete</button>
                                </td>
                            </tr>

                            {/* Inline structure editor */}
                            {editingStructure === school.id && (
                                <tr>
                                    <td colSpan="4" style={{ padding: '1rem' }}>
                                        <div className="card" style={{ margin: 0 }}>
                                            <h3 style={{ marginBottom: '0.5rem' }}>Add structure to {school.name}</h3>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                                                Existing classes won't be duplicated (additive only).
                                            </p>
                                            <SchoolStructureTree
                                                classTemplates={classTemplates}
                                                divisionTemplates={divisionTemplates}
                                                subdivisionTemplates={subdivisionTemplates}
                                                selection={structureSelection}
                                                onSelectionChange={setStructureSelection}
                                                onInlineAdd={handleInlineAdd}
                                            />
                                            <div className="flex gap-sm" style={{ marginTop: '0.75rem' }}>
                                                <button
                                                    className="btn btn-primary"
                                                    onClick={handleAssignEditedStructure}
                                                    disabled={assigningStructure}
                                                >
                                                    {assigningStructure ? 'Assigning...' : 'Assign'}
                                                </button>
                                                <button className="btn btn-ghost" onClick={() => { setEditingStructure(null); setStructureSelection({}); }}>Cancel</button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    ))}
                    {filtered.length === 0 && (
                        <tr>
                            <td colSpan="4" className="manager-empty">
                                {search ? 'No schools match your filter.' : 'No schools yet. Add your first school above.'}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* Delete confirmation dialog */}
            {deletingSchool && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div className="card" style={{ maxWidth: '420px', padding: '1.5rem' }}>
                        <h3 style={{ marginBottom: '0.75rem' }}>🗑️ Delete {deletingSchool.name}?</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                            This will permanently delete the school and <strong>all its classes, divisions, and subdivisions</strong>.
                            Customers linked to this school will lose their school assignment.
                        </p>
                        {(deletingSchool.class_count > 0 || deletingSchool.division_count > 0) && (
                            <div style={{
                                padding: '0.5rem 0.75rem', borderRadius: '6px', marginBottom: '1rem',
                                background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                                fontSize: '0.8rem', color: '#ef4444'
                            }}>
                                ⚠️ Will delete: {deletingSchool.class_count || 0} classes, {deletingSchool.division_count || 0} divisions, {deletingSchool.subdivision_count || 0} subdivisions
                            </div>
                        )}
                        <div className="flex gap-sm">
                            <button className="btn btn-ghost text-danger" onClick={() => handleDeleteWithStructure(deletingSchool)}>
                                Delete Everything
                            </button>
                            <button className="btn btn-ghost" onClick={() => setDeletingSchool(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
