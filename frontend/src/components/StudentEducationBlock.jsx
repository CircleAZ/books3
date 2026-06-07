import { useState, useEffect } from 'react';
import { ENDPOINTS } from '../config/api';

import '../styles/components/form-layout.css';
export default function StudentEducationBlock({ 
    student, 
    index, 
    onChange, 
    onRemove, 
    schools, 
    classTemplates, 
    divisionTemplates, 
    subdivisionTemplates, 
    fetchWithAuth 
}) {
    const [classes, setClasses] = useState([]);
    const [divisions, setDivisions] = useState([]);
    const [subdivisions, setSubdivisions] = useState([]);

    // Fetch classes when school changes
    useEffect(() => {
        if (!student.school) {
            setClasses([]);
            return;
        }
        const fetchClasses = async () => {
            try {
                const res = await fetchWithAuth(`${ENDPOINTS.CLASSES}?school=${student.school}`);
                if (res.ok) {
                    const data = await res.json();
                    const sorted = (data.results || data || []).sort((a, b) => 
                        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
                    );
                    setClasses(sorted);
                }
            } catch (err) { console.error(err); }
        };
        fetchClasses();
    }, [student.school, fetchWithAuth]);

    // Fetch divisions when class changes
    useEffect(() => {
        if (!student.class_obj) {
            setDivisions([]);
            return;
        }
        const fetchDivisions = async () => {
            try {
                const res = await fetchWithAuth(`${ENDPOINTS.CUSTOMERS_DIVISIONS}?class_obj=${student.class_obj}`);
                if (res.ok) {
                    const data = await res.json();
                    const sorted = (data.results || data || []).sort((a, b) => 
                        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
                    );
                    setDivisions(sorted);
                }
            } catch (err) { console.error(err); }
        };
        fetchDivisions();
    }, [student.class_obj, fetchWithAuth]);

    // Fetch subdivisions when division changes
    useEffect(() => {
        if (!student.division) {
            setSubdivisions([]);
            return;
        }
        const fetchSubs = async () => {
            try {
                const res = await fetchWithAuth(`${ENDPOINTS.CUSTOMERS_SUBDIVISIONS}?division=${student.division}`);
                if (res.ok) {
                    const data = await res.json();
                    const sorted = (data.results || data || []).sort((a, b) => 
                        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
                    );
                    setSubdivisions(sorted);
                }
            } catch (err) { console.error(err); }
        };
        fetchSubs();
    }, [student.division, fetchWithAuth]);

    const handleChange = (e) => {
        const { name, type, checked, value } = e.target;
        const val = type === 'checkbox' ? checked : value;
        onChange(index, name, val);
    };

    return (
        <div className="additional-student-block" style={{ padding: '1rem', border: '1px solid #4a5568', borderRadius: '8px', marginBottom: '1rem', position: 'relative', backgroundColor: 'var(--color-bg-secondary)' }}>
            <button 
                type="button" 
                onClick={() => onRemove(index)} 
                style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '1.2rem' }}
            >
                &times;
            </button>
            <h4 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--color-primary)' }}>Student {index + 2}</h4>
            
            <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Name <span className="required-star">*</span></label>
                <input type="text" name="name" value={student.name} onChange={handleChange} required className="form-control" placeholder="Student First Name" />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                <input
                    type="checkbox"
                    name="independentClass"
                    checked={student.independentClass}
                    onChange={(e) => {
                        onChange(index, 'independentClass', e.target.checked);
                        if (e.target.checked) {
                            onChange(index, 'school', '');
                            onChange(index, 'class_obj', '');
                            onChange(index, 'division', '');
                            onChange(index, 'subdivision', '');
                        } else {
                            onChange(index, 'class_name', '');
                            onChange(index, 'division_name', '');
                            onChange(index, 'subdivision_name', '');
                        }
                    }}
                />
                No specific school (select class independently)
            </label>

            {student.independentClass ? (
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div className="form-group">
                        <label>Class</label>
                        <select name="class_name" value={student.class_name} onChange={handleChange} className="form-control">
                            <option value="">Select Class</option>
                            {classTemplates.map(ct => <option key={ct.id} value={ct.name}>{ct.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Division</label>
                        <select name="division_name" value={student.division_name} onChange={handleChange} disabled={!student.class_name} className="form-control">
                            <option value="">Select Division</option>
                            {divisionTemplates.map(dt => <option key={dt.id} value={dt.name}>{dt.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Subdivision</label>
                        <select name="subdivision_name" value={student.subdivision_name} onChange={handleChange} disabled={!student.division_name} className="form-control">
                            <option value="">Select Subdivision</option>
                            {subdivisionTemplates.map(st => <option key={st.id} value={st.name}>{st.name}</option>)}
                        </select>
                    </div>
                </div>
            ) : (
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div className="form-group">
                        <label>School</label>
                        <select name="school" value={student.school} onChange={(e) => {
                            onChange(index, 'school', e.target.value);
                            onChange(index, 'class_obj', '');
                            onChange(index, 'division', '');
                            onChange(index, 'subdivision', '');
                        }} className="form-control">
                            <option value="">Select School</option>
                            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Class</label>
                        <select name="class_obj" value={student.class_obj} onChange={(e) => {
                            onChange(index, 'class_obj', e.target.value);
                            onChange(index, 'division', '');
                            onChange(index, 'subdivision', '');
                        }} disabled={!student.school} className="form-control">
                            <option value="">Select Class</option>
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Division</label>
                        <select name="division" value={student.division} onChange={(e) => {
                            onChange(index, 'division', e.target.value);
                            onChange(index, 'subdivision', '');
                        }} disabled={!student.class_obj} className="form-control">
                            <option value="">Select Division</option>
                            {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Subdivision</label>
                        <select name="subdivision" value={student.subdivision} onChange={handleChange} disabled={!student.division} className="form-control">
                            <option value="">Select Subdivision</option>
                            {subdivisions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                </div>
            )}
        </div>
    );
}
