import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './RolesPermissions.css';

const RolesPermissions = () => {
    const { fetchWithAuth } = useAuth();
    const [roles, setRoles] = useState([]);
    const [permissions, setPermissions] = useState({});
    const [loading, setLoading] = useState(true);
    const [selectedRole, setSelectedRole] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [rolesRes, permsRes] = await Promise.all([
                fetchWithAuth(`${ENDPOINTS.SETTINGS_ROLES}`),
                fetchWithAuth(`${ENDPOINTS.SETTINGS_ROLES}permissions/`)
            ]);

            if (rolesRes.ok && permsRes.ok) {
                const rolesData = await rolesRes.json();
                const permsData = await permsRes.json();
                setRoles(rolesData.results || rolesData);
                setPermissions(permsData);
            }
        } catch (error) {
            console.error('Error fetching roles/permissions:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePermissionChange = async (roleId, permissionCodename, isChecked) => {
        const role = roles.find(r => r.id === roleId);
        let updatedPermissions = [...role.permissions];

        if (isChecked) {
            updatedPermissions.push(permissionCodename);
        } else {
            updatedPermissions = updatedPermissions.filter(p => p !== permissionCodename);
        }

        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_ROLES}${roleId}/`, {
                method: 'PATCH',
                body: JSON.stringify({ permissions: updatedPermissions })
            });

            if (response.ok) {
                const updatedRole = await response.json();
                setRoles(roles.map(r => r.id === roleId ? updatedRole : r));
            }
        } catch (error) {
            console.error('Error updating role:', error);
        }
    };

    if (loading) return <div>Loading Roles...</div>;

    return (
        <div className="roles-permissions-container">
            <h1>Roles & Permissions</h1>
            <div className="roles-grid">
                {roles.map(role => (
                    <div key={role.id} className="role-card">
                        <h3>{role.name}</h3>
                        <p>{role.description}</p>
                        <div className="permissions-list">
                            {Object.entries(permissions).map(([category, perms]) => (
                                <div key={category} className="permission-category">
                                    <h4>{category.charAt(0).toUpperCase() + category.slice(1)}</h4>
                                    {perms.map(perm => (
                                        <div key={perm.id} className="permission-item">
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    checked={role.permissions.includes(perm.codename)}
                                                    onChange={(e) => handlePermissionChange(role.id, perm.codename, e.target.checked)}
                                                    disabled={role.is_system && role.name === 'Admin' && perm.category === 'settings'} // Prevent locking out admin
                                                />
                                                {perm.name}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default RolesPermissions;
