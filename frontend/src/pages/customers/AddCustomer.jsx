import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import MapComponent from '../../components/MapComponent';
import { compressImage } from '../../utils/imageCompression';
import './AddCustomer.css';

export default function AddCustomer({ onSuccess, onCancel, isEmbedded = false }) {
    const { id } = useParams();
    const { fetchWithAuth } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isEditMode, setIsEditMode] = useState(!!id);
    const [initialLoading, setInitialLoading] = useState(true);
    const [tagError, setTagError] = useState('');
    const [newlyCreatedTagId, setNewlyCreatedTagId] = useState(null);
    const [initialFormData, setInitialFormData] = useState(null);
    const formTopRef = useRef(null);
    const tagTimeoutRef = useRef(null);

    // Home Photo State
    const [homePhoto, setHomePhoto] = useState(null);
    const [homePhotoPreview, setHomePhotoPreview] = useState(null);
    const [imageError, setImageError] = useState('');

    // Form state
    const [formData, setFormData] = useState({
        first_name: '',
        middle_name: '',
        last_name: '',
        phone: '',
        email: '',
        school: '',
        class_obj: '',
        division: '',
        subdivision: '',
        customer_group: '',
        notes: '',
        class_name: '',
        division_name: '',
        subdivision_name: '',
        // Address
        village: '',
        faliya: '',
        address_line: '',
        landmark: '',
        pincode: '',
        latitude: null,
        longitude: null,
        location_tags: []
    });

    // Dropdown options
    const [schools, setSchools] = useState([]);
    const [classes, setClasses] = useState([]);
    const [divisions, setDivisions] = useState([]);
    const [subdivisions, setSubdivisions] = useState([]);
    const [customerGroups, setCustomerGroups] = useState([]);
    const [locationTags, setLocationTags] = useState([]);
    const [newTagName, setNewTagName] = useState('');
    const [showNewTagInput, setShowNewTagInput] = useState(false);
    const [creatingTag, setCreatingTag] = useState(false);
    const [phoneError, setPhoneError] = useState('');
    const [phoneWarning, setPhoneWarning] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [addressId, setAddressId] = useState(null);
    const [independentClass, setIndependentClass] = useState(false);
    const [classTemplatesForForm, setClassTemplatesForForm] = useState([]);
    const [divisionTemplatesForForm, setDivisionTemplatesForForm] = useState([]);
    const [subdivisionTemplatesForForm, setSubdivisionTemplatesForForm] = useState([]);

    // Customer Links state
    const [linkTypes, setLinkTypes] = useState([]);
    const [pendingLinks, setPendingLinks] = useState([]);
    const [linkSearch, setLinkSearch] = useState('');
    const [linkSearchResults, setLinkSearchResults] = useState([]);
    const [selectedLinkCustomer, setSelectedLinkCustomer] = useState(null);
    const [selectedLinkType, setSelectedLinkType] = useState('');
    const linkSearchTimerRef = useRef(null);

    // Collapsible sections
    const [sections, setSections] = useState({
        details: true,
        education: true,
        groupNotes: true,
        address: true,
        links: false
    });

    // Address Override Toggle
    const [overrideAddress, setOverrideAddress] = useState(false);

    // Fetch initial dropdown data, then customer details if in edit mode
    useEffect(() => {
        const fetchOptions = async () => {
            try {
                const [schoolsRes, groupsRes, tagsRes, linkTypesRes, ctRes, dtRes, stRes] = await Promise.all([
                    fetchWithAuth(ENDPOINTS.SCHOOLS),
                    fetchWithAuth(ENDPOINTS.CUSTOMERS_GROUPS),
                    fetchWithAuth(ENDPOINTS.CUSTOMERS_LOCATION_TAGS),
                    fetchWithAuth(ENDPOINTS.CUSTOMERS_LINK_TYPES || '/api/customers/link-types/'),
                    fetchWithAuth(ENDPOINTS.CLASS_TEMPLATES),
                    fetchWithAuth(ENDPOINTS.DIVISION_TEMPLATES),
                    fetchWithAuth(ENDPOINTS.SUBDIVISION_TEMPLATES),
                ]);

                if (schoolsRes.ok) {
                    const data = await schoolsRes.json();
                    setSchools(data.results || data || []);
                }
                if (groupsRes.ok) {
                    const data = await groupsRes.json();
                    setCustomerGroups(data.results || data || []);
                }
                if (tagsRes.ok) {
                    const data = await tagsRes.json();
                    setLocationTags(data.results || data || []);
                }
                if (linkTypesRes.ok) {
                    const data = await linkTypesRes.json();
                    setLinkTypes(data.results || data || []);
                }
                if (ctRes.ok) {
                    const data = await ctRes.json();
                    const sorted = (data.results || data || []).sort((a, b) => 
                        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
                    );
                    setClassTemplatesForForm(sorted);
                }
                if (dtRes.ok) {
                    const data = await dtRes.json();
                    const sorted = (data.results || data || []).sort((a, b) =>
                        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
                    );
                    setDivisionTemplatesForForm(sorted);
                }
                if (stRes.ok) {
                    const data = await stRes.json();
                    const sorted = (data.results || data || []).sort((a, b) =>
                        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
                    );
                    setSubdivisionTemplatesForForm(sorted);
                }
            } catch (err) {
                console.error('Error fetching options:', err);
            }

            // Chain: fetch customer AFTER options are loaded (edit mode)
            if (id && !isEmbedded) {
                setIsEditMode(true);
                setLoading(true);
                try {
                    const res = await fetchWithAuth(`${ENDPOINTS.CUSTOMERS}${id}/`);
                    if (res.ok) {
                        const data = await res.json();
                        const primaryAddr = data.addresses?.[0] || {};
                        if (primaryAddr.home_photo) setHomePhotoPreview(primaryAddr.home_photo);

                        const customerData = {
                            first_name: data.first_name || '',
                            middle_name: data.middle_name || '',
                            last_name: data.last_name || '',
                            phone: data.phone || '',
                            email: data.email || '',
                            school: data.school?.id || '',
                            class_obj: data.class_obj?.id || '',
                            division: data.division?.id || '',
                            subdivision: data.subdivision?.id || '',
                            customer_group: data.customer_group?.id || '',
                            notes: data.notes || '',
                            class_name: data.class_name || '',
                            division_name: data.division_name || '',
                            subdivision_name: data.subdivision_name || '',
                            village: primaryAddr.village || '',
                            faliya: primaryAddr.faliya || '',
                            address_line: primaryAddr.address_line || '',
                            landmark: primaryAddr.landmark || '',
                            pincode: primaryAddr.pincode || '',
                            latitude: primaryAddr.latitude ? parseFloat(primaryAddr.latitude) : null,
                            longitude: primaryAddr.longitude ? parseFloat(primaryAddr.longitude) : null,
                            location_tags: primaryAddr.location_tags?.map(t => t.id) || []
                        };
                        setAddressId(primaryAddr.id || null);
                        setFormData(customerData);
                        setInitialFormData(customerData);

                        // Restore independent class toggle from server data
                        if (!data.school && (data.class_name || data.division_name || data.subdivision_name)) {
                            setIndependentClass(true);
                        }

                        // Load existing links for edit mode
                        if (data.links && data.links.length > 0) {
                            setPendingLinks(data.links.map(link => ({
                                customer_id: link.customer_id,
                                customer_name: link.customer_name,
                                link_type: '', // existing links already saved — we track them read-only
                                link_type_name: link.relationship,
                                existing: true,
                                link_id: link.link_id
                            })));
                        }
                    } else {
                        setError('Failed to fetch customer details');
                    }
                } catch (err) {
                    setError('Error loading customer');
                    console.error(err);
                } finally {
                    setLoading(false);
                }
            }

            setInitialLoading(false);
        };
        fetchOptions();
    }, [id, fetchWithAuth, isEmbedded]);

    const handleHomePhotoChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setImageError('');
        try {
            // Use 2000px resolution for home photos as per requirement
            const { file: compressedFile, previewUrl } = await compressImage(file, 2000, 2000, 0.8);
            setHomePhoto(compressedFile);
            setHomePhotoPreview(previewUrl);
        } catch (error) {
            console.error('Failed to compress home photo', error);
            setImageError('Failed to process image. Please try another.');
        }
    };

    const removeHomePhoto = () => {
        setHomePhoto(null);
        setHomePhotoPreview(null);
    };

    // Cascading Dropdowns: School -> Class
    useEffect(() => {
        if (!formData.school) {
            setClasses([]);
            return;
        }
        const fetchClasses = async () => {
            try {
                const res = await fetchWithAuth(`${ENDPOINTS.CLASSES}?school=${formData.school}`);
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
    }, [formData.school, fetchWithAuth]);

    // Cascading Dropdowns: Class -> Division
    useEffect(() => {
        if (!formData.class_obj) {
            setDivisions([]);
            return;
        }
        const fetchDivisions = async () => {
            try {
                const res = await fetchWithAuth(`${ENDPOINTS.CUSTOMERS_DIVISIONS}?class_obj=${formData.class_obj}`);
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
    }, [formData.class_obj, fetchWithAuth]);

    // Cascading Dropdowns: Division -> Subdivision
    useEffect(() => {
        if (!formData.division) {
            setSubdivisions([]);
            return;
        }
        const fetchSubs = async () => {
            try {
                const res = await fetchWithAuth(`${ENDPOINTS.CUSTOMERS_SUBDIVISIONS}?division=${formData.division}`);
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
    }, [formData.division, fetchWithAuth]);

    // Phone duplicate check on blur
    const checkPhoneDuplicate = async (phone) => {
        if (phone.length !== 10) { setPhoneWarning(''); return; }
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.CUSTOMERS}?search=${phone}`);
            if (res.ok) {
                const data = await res.json();
                const matches = (data.results || []).filter(c => c.phone === phone && (!id || String(c.id) !== String(id)));
                if (matches.length > 0) {
                    setPhoneWarning(`⚠ Phone already used by: ${matches[0].full_name} (#${matches[0].display_id})`);
                } else {
                    setPhoneWarning('');
                }
            }
        } catch { }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (name === 'phone') {
            const numericValue = value.replace(/\D/g, '').slice(0, 10);
            setFormData(prev => ({ ...prev, [name]: numericValue }));
            if (numericValue.length === 10) {
                setPhoneError('');
                setError('');
            } else if (numericValue.length > 0 && numericValue.length < 10) {
                setPhoneError(`${numericValue.length}/10 digits`);
                setPhoneWarning('');
            } else {
                setPhoneError('');
                setPhoneWarning('');
            }
            return;
        }
        if (name === 'pincode') {
            const digits = value.replace(/\D/g, '').slice(0, 6);
            setFormData(prev => ({ ...prev, [name]: digits }));
            return;
        }
        // Merge field update + dependent resets in one setState
        if (name === 'school') {
            setFormData(prev => ({ ...prev, [name]: value, class_obj: '', division: '', subdivision: '' }));
        } else if (name === 'class_obj') {
            setFormData(prev => ({ ...prev, [name]: value, division: '', subdivision: '' }));
        } else if (name === 'division') {
            setFormData(prev => ({ ...prev, [name]: value, subdivision: '' }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleTagToggle = (tagId) => {
        setFormData(prev => ({
            ...prev,
            location_tags: prev.location_tags.includes(tagId)
                ? prev.location_tags.filter(id => id !== tagId)
                : [...prev.location_tags, tagId]
        }));
    };

    const handleLocationSelect = async (latlng) => {
        setFormData(prev => ({
            ...prev,
            latitude: parseFloat(latlng.lat.toFixed(6)),
            longitude: parseFloat(latlng.lng.toFixed(6))
        }));

        if (!overrideAddress) {
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&zoom=18&addressdetails=1`);
                const data = await response.json();
                if (data && data.address) {
                    setFormData(prev => ({
                        ...prev,
                        village: data.address.village || data.address.hamlet || data.address.town || data.address.city || data.address.municipality || data.address.county || data.address.suburb || prev.village,
                        pincode: data.address.postcode || prev.pincode,
                        address_line: data.display_name || prev.address_line,
                        landmark: data.address.neighbourhood || data.address.road || prev.landmark
                    }));
                }
            } catch (err) {
                console.error("Geocoding failed:", err);
            }
        }
    };

    const toggleSection = (section) => {
        setSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // --- Customer Link Search ---
    const handleLinkSearch = (query) => {
        setLinkSearch(query);
        if (linkSearchTimerRef.current) clearTimeout(linkSearchTimerRef.current);
        if (!query || query.length < 2) {
            setLinkSearchResults([]);
            return;
        }
        linkSearchTimerRef.current = setTimeout(async () => {
            try {
                const res = await fetchWithAuth(`${ENDPOINTS.CUSTOMERS}?search=${encodeURIComponent(query)}`);
                if (res.ok) {
                    const data = await res.json();
                    // Filter out already-linked customers and current customer (in edit mode)
                    const linkedIds = pendingLinks.map(l => l.customer_id);
                    const filtered = (data.results || []).filter(c => c.id !== id && !linkedIds.includes(c.id));
                    setLinkSearchResults(filtered);
                }
            } catch (e) { console.error('Link search error', e); }
        }, 400);
    };

    const handleAddPendingLink = () => {
        if (!selectedLinkCustomer || !selectedLinkType) return;
        const linkType = linkTypes.find(lt => lt.id === selectedLinkType);
        setPendingLinks(prev => [...prev, {
            customer_id: selectedLinkCustomer.id,
            customer_name: selectedLinkCustomer.full_name || `${selectedLinkCustomer.first_name} ${selectedLinkCustomer.last_name}`.trim(),
            link_type: selectedLinkType,
            link_type_name: linkType?.name || '',
            existing: false
        }]);
        setSelectedLinkCustomer(null);
        setSelectedLinkType('');
        setLinkSearch('');
        setLinkSearchResults([]);
    };

    const handleRemovePendingLink = (index) => {
        setPendingLinks(prev => prev.filter((_, i) => i !== index));
    };

    const handleCreateTag = async () => {
        if (!newTagName.trim()) return;
        setCreatingTag(true);
        setTagError('');
        try {
            const res = await fetchWithAuth(ENDPOINTS.CUSTOMERS_LOCATION_TAGS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newTagName.trim() })
            });
            if (res.ok) {
                const tag = await res.json();
                setLocationTags(prev => [...prev, tag]);
                setFormData(prev => ({ ...prev, location_tags: [...prev.location_tags, tag.id] }));
                setNewTagName('');
                setShowNewTagInput(false);
                setNewlyCreatedTagId(tag.id);
                tagTimeoutRef.current = setTimeout(() => setNewlyCreatedTagId(null), 600);
            } else {
                let errMsg = `Server error (${res.status})`;
                try {
                    const err = await res.json();
                    errMsg = 'Failed: ' + (err.name?.[0] || JSON.stringify(err));
                } catch { }
                setTagError(errMsg);
            }
        } catch (e) {
            console.error('Error creating tag:', e);
            setTagError('Network error creating tag');
        } finally {
            setCreatingTag(false);
        }
    };

    // Cleanup tag animation timeout on unmount
    useEffect(() => () => clearTimeout(tagTimeoutRef.current), []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (!formData.first_name.trim()) {
            setError('First name is required.');
            setLoading(false);
            formTopRef.current?.scrollIntoView({ behavior: 'smooth' });
            return;
        }

        if (formData.phone.length !== 10) {
            setError('Phone number must be exactly 10 digits.');
            setPhoneError('Required: 10 digits');
            setLoading(false);
            formTopRef.current?.scrollIntoView({ behavior: 'smooth' });
            return;
        }

        const payload = {
            first_name: formData.first_name,
            middle_name: formData.middle_name,
            last_name: formData.last_name,
            phone: formData.phone,
            email: formData.email || null,
            school: formData.school || null,
            class_obj: formData.class_obj || null,
            division: formData.division || null,
            subdivision: formData.subdivision || null,
            customer_group: formData.customer_group || null,
            notes: formData.notes || '',
            class_name: independentClass ? formData.class_name : '',
            division_name: independentClass ? formData.division_name : '',
            subdivision_name: independentClass ? formData.subdivision_name : '',
            addresses: []
        };

        // Add address if relevant fields are present, OR if a home photo was captured
        if (formData.village || formData.address_line || formData.pincode || formData.latitude !== null || formData.location_tags.length > 0 || homePhoto) {
            const addrPayload = {
                village: formData.village,
                faliya: formData.faliya,
                address_line: formData.address_line,
                landmark: formData.landmark,
                pincode: formData.pincode,
                latitude: formData.latitude,
                longitude: formData.longitude,
                location_tag_ids: formData.location_tags
            };
            if (addressId) addrPayload.id = addressId;
            payload.addresses.push(addrPayload);
        }

        try {
            const url = isEditMode ? `${ENDPOINTS.CUSTOMERS}${id}/` : ENDPOINTS.CUSTOMERS;
            const method = isEditMode ? 'PUT' : 'POST';

            let requestBody;
            let headers = {};

            if (homePhoto) {
                requestBody = new FormData();
                Object.keys(payload).forEach(key => {
                    if (key === 'addresses' || key === 'location_tags') {
                        requestBody.append(key, JSON.stringify(payload[key]));
                    } else if (payload[key] !== null && payload[key] !== undefined && payload[key] !== '') {
                        requestBody.append(key, payload[key]);
                    }
                });
                requestBody.append('home_photo', homePhoto);
            } else {
                requestBody = JSON.stringify(payload);
                headers['Content-Type'] = 'application/json';
            }

            const res = await fetchWithAuth(url, {
                method: method,
                headers: headers,
                body: requestBody
            });

            if (res.ok) {
                const data = await res.json();

                // Create pending links after customer is saved
                const newLinks = pendingLinks.filter(l => !l.existing);
                if (newLinks.length > 0) {
                    const linkEndpoint = ENDPOINTS.CUSTOMER_LINKS || '/api/customers/links/';
                    await Promise.all(newLinks.map(link =>
                        fetchWithAuth(linkEndpoint, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                customer_a: data.id,
                                customer_b: link.customer_id,
                                link_type: link.link_type
                            })
                        }).catch(err => console.error('Failed to create link:', err))
                    ));
                }

                if (onSuccess) {
                    onSuccess(data);
                } else {
                    setSuccessMsg(`Customer ${isEditMode ? 'updated' : 'created'} successfully!`);
                    setTimeout(() => navigate(`/customers/${data.id}`), 2000);
                }
            } else {
                let errMsg = `Server error (${res.status})`;
                try {
                    const errData = await res.json();
                    const flatten = (obj, prefix = '') => {
                        return Object.entries(obj).flatMap(([k, v]) => {
                            const key = prefix ? `${prefix}.${k}` : k;
                            if (Array.isArray(v)) {
                                return v.map(item =>
                                    typeof item === 'object' ? flatten(item, key) : `${key}: ${item}`
                                ).flat();
                            }
                            if (typeof v === 'object' && v !== null) {
                                return flatten(v, key);
                            }
                            return [`${key}: ${v}`];
                        });
                    };
                    errMsg = flatten(errData).join(', ') || errMsg;
                } catch { }
                setError(errMsg);
                formTopRef.current?.scrollIntoView({ behavior: 'smooth' });
            }
        } catch (e) {
            setError('Network error. Please try again.');
            console.error(e);
            formTopRef.current?.scrollIntoView({ behavior: 'smooth' });
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        const hasChanges = initialFormData
            ? JSON.stringify(formData) !== JSON.stringify(initialFormData)
            : (formData.first_name || formData.phone);
        if (hasChanges && !window.confirm('You have unsaved changes. Discard?')) return;
        if (onCancel) onCancel();
        else navigate(isEditMode ? `/customers/${id}` : '/customers');
    };

    if (initialLoading) {
        return (
            <div className={`add-customer-container ${isEmbedded ? 'embedded' : 'fade-in'}`}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem 0' }}>
                    <div className="loading-spinner" />
                    <span style={{ marginLeft: '0.75rem', color: 'var(--color-text-secondary)' }}>Loading form data...</span>
                </div>
            </div>
        );
    }

    return (
        <div className={`add-customer-container ${isEmbedded ? 'embedded' : 'fade-in'}`}>
            <form onSubmit={handleSubmit} className="add-customer-form">
                <div ref={formTopRef} className="add-customer-header">
                    <h1>
                        <span className="desktop-text">{isEditMode ? 'Edit Customer' : 'Add New Customer'}</span>
                        <span className="mobile-text">
                            {isEditMode ? <>Edit<br />Customer</> : <>Add New<br />Customer</>}
                        </span>
                    </h1>
                    <div className="header-actions">
                        <button type="button" className="btn btn-ghost" onClick={handleCancel}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Saving...' : (isEditMode ? 'Update' : 'Save')}
                        </button>
                    </div>
                </div>

                {!isEmbedded && <div className="sticky-header-spacer" />}

                {successMsg && <div className="success-message">{successMsg}</div>}
                {error && <div className="error-message">{error}</div>}

                {/* Details Section */}
                <div className="collapsible-section">
                    <div className="section-header" onClick={() => toggleSection('details')} role="button" tabIndex={0} aria-expanded={sections.details} onKeyDown={e => e.key === 'Enter' && toggleSection('details')}>
                        <h2>Customer Details</h2>
                        <span className={`chevron ${sections.details ? 'open' : ''}`}>▼</span>
                    </div>
                    {sections.details && (
                        <div className="section-content open">
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>First Name <span className="required-star">*</span></label>
                                    <input type="text" name="first_name" value={formData.first_name} onChange={handleInputChange} required />
                                </div>
                                <div className="form-group">
                                    <label>Middle Name</label>
                                    <input type="text" name="middle_name" value={formData.middle_name} onChange={handleInputChange} />
                                </div>
                                <div className="form-group">
                                    <label>Last Name</label>
                                    <input type="text" name="last_name" value={formData.last_name} onChange={handleInputChange} />
                                </div>
                                <div className="form-group">
                                    <label>Phone <span className="required-star">*</span></label>
                                    <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} onBlur={() => checkPhoneDuplicate(formData.phone)} maxLength="10" required style={(phoneError || phoneWarning) ? { borderColor: phoneError ? 'var(--color-danger)' : 'var(--color-warning, #f0ad4e)' } : {}} />
                                    {phoneError && <small style={{ color: 'var(--color-danger)', fontSize: '0.75rem' }}>{phoneError}</small>}
                                    {phoneWarning && <small style={{ color: 'var(--color-warning, #f0ad4e)', fontSize: '0.75rem' }}>{phoneWarning}</small>}
                                </div>
                                <div className="form-group">
                                    <label>Email</label>
                                    <input type="email" name="email" value={formData.email} onChange={handleInputChange} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Education Section */}
                <div className="collapsible-section">
                    <div className="section-header" onClick={() => toggleSection('education')} role="button" tabIndex={0} aria-expanded={sections.education} onKeyDown={e => e.key === 'Enter' && toggleSection('education')}>
                        <h2>Education</h2>
                        <span className={`chevron ${sections.education ? 'open' : ''}`}>▼</span>
                    </div>
                    {sections.education && (
                        <div className="section-content open">
                            {/* Independent toggle */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                                <input
                                    type="checkbox"
                                    checked={independentClass}
                                    onChange={e => {
                                        setIndependentClass(e.target.checked);
                                        if (e.target.checked) {
                                            setFormData(prev => ({ ...prev, school: '', class_obj: '', division: '', subdivision: '' }));
                                        } else {
                                            setFormData(prev => ({ ...prev, class_name: '', division_name: '', subdivision_name: '' }));
                                        }
                                    }}
                                />
                                No specific school (select class independently)
                            </label>

                            {independentClass ? (
                                <div className="form-grid">
                                    <div className="form-group">
                                        <label>Class</label>
                                        <select
                                            name="class_name"
                                            value={formData.class_name}
                                            onChange={e => {
                                                setFormData(prev => ({ ...prev, class_name: e.target.value, division_name: '', subdivision_name: '' }));
                                            }}
                                        >
                                            <option value="">Select Class</option>
                                            {classTemplatesForForm.map(ct => (
                                                <option key={ct.id} value={ct.name}>{ct.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Division</label>
                                        <select
                                            name="division_name"
                                            value={formData.division_name}
                                            onChange={e => {
                                                setFormData(prev => ({ ...prev, division_name: e.target.value, subdivision_name: '' }));
                                            }}
                                            disabled={!formData.class_name}
                                        >
                                            <option value="">Select Division</option>
                                            {divisionTemplatesForForm
                                                .filter(dt => {
                                                    // Show all if no applicable_classes, otherwise filter by selected class_name
                                                    if (!dt.applicable_class_names || dt.applicable_class_names.length === 0) return true;
                                                    return dt.applicable_class_names.includes(formData.class_name);
                                                })
                                                .map(dt => (
                                                    <option key={dt.id} value={dt.name}>{dt.name}</option>
                                                ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Subdivision</label>
                                        <select
                                            name="subdivision_name"
                                            value={formData.subdivision_name}
                                            onChange={handleInputChange}
                                            disabled={!formData.division_name}
                                        >
                                            <option value="">Select Subdivision</option>
                                            {subdivisionTemplatesForForm
                                                .filter(st => {
                                                    // Show all if no applicable_divisions, otherwise filter by selected division_name
                                                    if (!st.applicable_division_names || st.applicable_division_names.length === 0) return true;
                                                    return st.applicable_division_names.includes(formData.division_name);
                                                })
                                                .map(st => (
                                                    <option key={st.id} value={st.name}>{st.name}</option>
                                                ))}
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                <div className="form-grid">
                                    <div className="form-group">
                                        <label>School</label>
                                        <select name="school" value={formData.school} onChange={handleInputChange}>
                                            <option value="">Select School</option>
                                            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Class</label>
                                        <select name="class_obj" value={formData.class_obj} onChange={handleInputChange} disabled={!formData.school}>
                                            <option value="">Select Class</option>
                                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Division</label>
                                        <select name="division" value={formData.division} onChange={handleInputChange} disabled={!formData.class_obj}>
                                            <option value="">Select Division</option>
                                            {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Subdivision</label>
                                        <select name="subdivision" value={formData.subdivision} onChange={handleInputChange} disabled={!formData.division}>
                                            <option value="">Select Subdivision</option>
                                            {subdivisions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Group & Notes */}
                <div className="collapsible-section">
                    <div className="section-header" onClick={() => toggleSection('groupNotes')} role="button" tabIndex={0} aria-expanded={sections.groupNotes} onKeyDown={e => e.key === 'Enter' && toggleSection('groupNotes')}>
                        <h2>Group & Notes</h2>
                        <span className={`chevron ${sections.groupNotes ? 'open' : ''}`}>▼</span>
                    </div>
                    {sections.groupNotes && (
                        <div className="section-content open">
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Customer Group</label>
                                    <select name="customer_group" value={formData.customer_group} onChange={handleInputChange}>
                                        <option value="">Select Group</option>
                                        {customerGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group full-width">
                                    <label>Notes</label>
                                    <textarea name="notes" value={formData.notes} onChange={handleInputChange} rows={3} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Address Section */}
                <div className="collapsible-section">
                    <div className="section-header" onClick={() => toggleSection('address')} role="button" tabIndex={0} aria-expanded={sections.address} onKeyDown={e => e.key === 'Enter' && toggleSection('address')}>
                        <h2>Address & Location</h2>
                        <span className={`chevron ${sections.address ? 'open' : ''}`}>▼</span>
                    </div>
                    {sections.address && (
                        <div className="section-content open">
                            <div className="form-grid">
                                <div className="form-group full-width map-container" style={{ marginBottom: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <label style={{ margin: 0 }}>Select Location on Map</label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--color-primary)', cursor: 'pointer', margin: 0, fontWeight: 600 }}>
                                            <input 
                                                type="checkbox" 
                                                checked={overrideAddress} 
                                                onChange={(e) => setOverrideAddress(e.target.checked)} 
                                                style={{ cursor: 'pointer' }}
                                            />
                                            Manual Override (Disable Auto-Fill)
                                        </label>
                                    </div>
                                    <MapComponent
                                        position={formData.latitude !== null && formData.longitude !== null ? [formData.latitude, formData.longitude] : null}
                                        onLocationSelect={handleLocationSelect}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px', flexWrap: 'wrap', gap: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {formData.latitude !== null ? (
                                                <>
                                                    <p className="text-muted text-sm" style={{ margin: 0 }}>Selected: {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}</p>
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData(prev => ({
                                                            ...prev,
                                                            latitude: null,
                                                            longitude: null,
                                                            ...(overrideAddress ? {} : { village: '', faliya: '', address_line: '', landmark: '', pincode: '' })
                                                        }))}
                                                        style={{
                                                            background: 'none',
                                                            border: '1px solid var(--color-danger, #ef4444)',
                                                            color: 'var(--color-danger, #ef4444)',
                                                            borderRadius: '4px',
                                                            padding: '2px 8px',
                                                            fontSize: '0.75rem',
                                                            cursor: 'pointer',
                                                            fontWeight: 600,
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                        title="Remove pin from map"
                                                    >
                                                        ✕ Remove Pin
                                                    </button>
                                                 </>
                                            ) : <div/>}
                                        </div>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Village</label>
                                    <input type="text" name="village" value={formData.village} onChange={handleInputChange} disabled={!overrideAddress} style={!overrideAddress ? { backgroundColor: 'var(--color-bg-hover)' } : {}} />
                                </div>
                                <div className="form-group">
                                    <label>Faliya <span className="info-tooltip" title="Neighbourhood / Lane">ⓘ</span></label>
                                    <input type="text" name="faliya" value={formData.faliya} onChange={handleInputChange} disabled={!overrideAddress} style={!overrideAddress ? { backgroundColor: 'var(--color-bg-hover)' } : {}} />
                                </div>
                                <div className="form-group full-width">
                                    <label>Address Line</label>
                                    <textarea name="address_line" value={formData.address_line} onChange={handleInputChange} rows={2} disabled={!overrideAddress} style={!overrideAddress ? { backgroundColor: 'var(--color-bg-hover)' } : {}} />
                                </div>
                                <div className="form-group">
                                    <label>Landmark</label>
                                    <input type="text" name="landmark" value={formData.landmark} onChange={handleInputChange} disabled={!overrideAddress} style={!overrideAddress ? { backgroundColor: 'var(--color-bg-hover)' } : {}} />
                                </div>
                                <div className="form-group">
                                    <label>Pincode</label>
                                    <input type="text" name="pincode" value={formData.pincode} onChange={handleInputChange} disabled={!overrideAddress} style={!overrideAddress ? { backgroundColor: 'var(--color-bg-hover)' } : {}} />
                                </div>
                                <div className="form-group">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <label style={{ margin: 0 }}>Location Tags</label>
                                        {!showNewTagInput && (
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNewTagInput(true)} style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}>
                                                + Add New
                                            </button>
                                        )}
                                    </div>
                                    {showNewTagInput && (
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <input
                                                type="text"
                                                placeholder="Tag name"
                                                value={newTagName}
                                                onChange={e => setNewTagName(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleCreateTag())}
                                                style={{ flex: 1 }}
                                                autoFocus
                                            />
                                            <button type="button" className="btn btn-primary btn-sm" onClick={handleCreateTag} disabled={creatingTag}>
                                                {creatingTag ? '...' : 'Add'}
                                            </button>
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowNewTagInput(false); setNewTagName(''); }}>
                                                ✕
                                            </button>
                                        </div>
                                    )}
                                    {tagError && <small style={{ color: 'var(--color-danger)', fontSize: '0.75rem' }}>{tagError}</small>}
                                    <div className="tag-chips-container">
                                        {locationTags.map(t => {
                                            const isSelected = formData.location_tags.includes(t.id);
                                            return (
                                                <button
                                                    key={t.id}
                                                    type="button"
                                                    className={`tag-chip ${isSelected ? 'selected' : ''} ${newlyCreatedTagId === t.id ? 'tag-chip-new' : ''}`}
                                                    onClick={() => handleTagToggle(t.id)}
                                                    aria-pressed={isSelected}
                                                >
                                                    {t.name}
                                                </button>
                                            );
                                        })}
                                        {locationTags.length === 0 && <small className="text-muted">No tags yet</small>}
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Home Photo <span className="info-tooltip" title="Visual confirmation for delivery driver">ⓘ</span></label>
                                    {!homePhotoPreview ? (
                                        <div 
                                            style={{
                                                border: '2px dashed var(--color-border)', 
                                                borderRadius: '8px', 
                                                padding: '1rem', 
                                                textAlign: 'center',
                                                cursor: 'pointer',
                                                background: 'var(--color-bg-tertiary)'
                                            }}
                                            onClick={() => document.getElementById('homePhotoInput').click()}
                                        >
                                            <div style={{ fontSize: '2rem', color: 'var(--color-text-muted)' }}>📷</div>
                                            <p style={{ margin: '0.5rem 0 0', color: 'var(--color-primary)' }}>Tap to capture or upload</p>
                                        </div>
                                    ) : (
                                        <div style={{ position: 'relative', width: '100%', maxWidth: '300px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                                            <img src={homePhotoPreview} alt="Customer Home" style={{ width: '100%', height: 'auto', display: 'block' }} />
                                            <button 
                                                type="button" 
                                                onClick={removeHomePhoto}
                                                style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}
                                    <input 
                                        type="file" 
                                        id="homePhotoInput" 
                                        accept="image/*" 
                                        capture="environment"
                                        style={{ display: 'none' }} 
                                        onChange={handleHomePhotoChange}
                                    />
                                    {imageError && <small style={{ color: 'var(--color-danger)' }}>{imageError}</small>}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Customer Links Section */}
                {!isEmbedded && (
                    <div className="collapsible-section">
                        <div className="section-header" onClick={() => toggleSection('links')} role="button" tabIndex={0} aria-expanded={sections.links} onKeyDown={e => e.key === 'Enter' && toggleSection('links')}>
                            <h2>
                                Customer Links
                                {pendingLinks.length > 0 && <span className="link-count-badge">{pendingLinks.length}</span>}
                            </h2>
                            <span className={`chevron ${sections.links ? 'open' : ''}`}>▼</span>
                        </div>
                        {sections.links && (
                            <div className="section-content open">
                                {/* Add Link Form */}
                                <div className="link-add-row">
                                    <div className="form-group" style={{ flex: 1, position: 'relative' }}>
                                        <label>Search Customer</label>
                                        <input
                                            type="text"
                                            placeholder="Type name or phone..."
                                            value={selectedLinkCustomer ? (selectedLinkCustomer.full_name || selectedLinkCustomer.first_name) : linkSearch}
                                            onChange={e => {
                                                setSelectedLinkCustomer(null);
                                                handleLinkSearch(e.target.value);
                                            }}
                                        />
                                        {linkSearchResults.length > 0 && (
                                            <div className="search-results-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100 }}>
                                                {linkSearchResults.map(c => (
                                                    <div
                                                        key={c.id}
                                                        className="search-result-item"
                                                        onClick={() => {
                                                            setSelectedLinkCustomer(c);
                                                            setLinkSearch(c.full_name || `${c.first_name} ${c.last_name}`.trim());
                                                            setLinkSearchResults([]);
                                                        }}
                                                    >
                                                        {c.full_name || `${c.first_name} ${c.last_name}`.trim()} ({c.phone})
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="form-group" style={{ minWidth: '140px' }}>
                                        <label>Relationship</label>
                                        <select value={selectedLinkType} onChange={e => setSelectedLinkType(e.target.value)}>
                                            <option value="">Select Type</option>
                                            {linkTypes.map(lt => (
                                                <option key={lt.id} value={lt.id}>{lt.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={handleAddPendingLink}
                                        disabled={!selectedLinkCustomer || !selectedLinkType}
                                        style={{ alignSelf: 'flex-end', marginBottom: '0.25rem' }}
                                    >
                                        + Add
                                    </button>
                                </div>

                                {/* Pending Links List */}
                                {pendingLinks.length > 0 ? (
                                    <div className="pending-links-list">
                                        {pendingLinks.map((link, idx) => (
                                            <div key={idx} className="pending-link-item">
                                                <div className="pending-link-info">
                                                    <span className="pending-link-name">{link.customer_name}</span>
                                                    <span className="pending-link-type">{link.link_type_name}</span>
                                                    {link.existing && <span className="pending-link-saved">Saved</span>}
                                                </div>
                                                {!link.existing && (
                                                    <button
                                                        type="button"
                                                        className="btn-icon danger"
                                                        onClick={() => handleRemovePendingLink(idx)}
                                                        title="Remove"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>No links added yet. Links connect related customers (e.g. Parent → Child).</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </form>
        </div>
    );
}
