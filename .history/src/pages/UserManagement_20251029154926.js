import React, { useState, useEffect, useMemo } from 'react';
import './UserManagement.css';
import Sidebar from '../components/Sidebar';
import { collection, doc, getDoc, setDoc, deleteDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { getAuth, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db } from '../firebase';
import ExportButtons from '../components/ExportButtons';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const UserManagement = () => {
    const [search, setSearch] = useState('');
    const [viewFilter, setViewFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [allUsers, setAllUsers] = useState([]);
    const [isArchivedUnlocked, setIsArchivedUnlocked] = useState(false);

    // --- NEW: State for password modal ---
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');

    const [columnVisibility, setColumnVisibility] = useState({
        userId: true,
        email: true,
        name: true,
        age: true,
        gender: true,
        contactNumber: true,
        status: true,
        activeStatus: true,
        userType: true,
        registeredDate: true,
        archivedDate: true,
        archiveReason: true,
        actions: true,
    });

    const handleToggleColumn = (col) => {
        setColumnVisibility(prev => ({ ...prev, [col]: !prev[col] }));
    };

    const formatDate = (dateValue) => {
        if (!dateValue) return 'N/A';
        const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
        return date.toLocaleDateString();
    };

    useEffect(() => {
        setLoading(true);
        const usersRef = collection(db, 'users');
        const guestsRef = collection(db, 'guests');
        const archivedRef = collection(db, 'archived_users');

        const updateState = (snapshot, status) => {
            const fetchedData = snapshot.docs.map(doc => {
                const data = doc.data();
                const baseData = {
                    id: data.uid || data.guestId || doc.id,
                    email: data.email || '',
                    name: `${data.firstName || ''} ${data.middleInitial || ''} ${data.lastName || ''}`.trim(),
                    age: data.age || '',
                    gender: data.gender || '',
                    contactNumber: data.contactNumber || '',
                    userType: data.userType || '',
                    registeredDate: formatDate(data.createdAt),
                };

                if (status === 'archived') {
                    return {
                        ...baseData,
                        status: 'archived',
                        activeStatus: false,
                        archivedDate: formatDate(data.archivedAt),
                        archiveReason: data.archiveReason || 'N/A',
                    };
                }
                if (status === 'guest') {
                    return {
                        ...baseData,
                        name: 'Guest User',
                        email: '',
                        status: 'guest',
                        userType: 'Guest',
                        activeStatus: data.activeStatus ?? false,
                    };
                }
                return { ...baseData, status: 'registered', activeStatus: data.activeStatus ?? false };
            });

            setAllUsers(currentUsers => {
                const otherUsers = currentUsers.filter(u => u.status !== status);
                return [...otherUsers, ...fetchedData];
            });
            setLoading(false);
        };

        const unsubUsers = onSnapshot(usersRef, (snap) => updateState(snap, 'registered'));
        const unsubGuests = onSnapshot(guestsRef, (snap) => updateState(snap, 'guest'));
        const unsubArchived = onSnapshot(archivedRef, (snap) => updateState(snap, 'archived'));

        return () => {
            unsubUsers();
            unsubGuests();
            unsubArchived();
        };
    }, []);

    // --- MODIFIED: Opens the modal instead of a prompt ---
    const handleViewArchived = () => {
        if (isArchivedUnlocked) {
            setViewFilter('archived');
            return;
        }
        setShowPasswordModal(true);
    };

    // --- NEW: Handles password submission and re-authentication ---
    const handlePasswordSubmit = async () => {
        if (!passwordInput) {
            alert('Please enter a password.');
            return;
        }

        const auth = getAuth();
        const user = auth.currentUser;

        if (user) {
            try {
                const credential = EmailAuthProvider.credential(user.email, passwordInput);
                await reauthenticateWithCredential(user, credential);
                alert('Verification successful. Accessing archives.');
                setIsArchivedUnlocked(true);
                setViewFilter('archived');
                setShowPasswordModal(false);
            } catch (error) {
                console.error("Re-authentication failed:", error);
                alert('Incorrect password. Access to archives denied.');
            } finally {
                setPasswordInput('');
            }
        }
    };

    const handleArchive = async (userId) => {
        const reason = prompt(`Enter a reason to archive User ID: ${userId}`);
        if (!reason || reason.trim() === '') return;

        try {
            const userRef = doc(db, 'users', userId);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                alert('User not found.');
                return;
            }
            const userData = userSnap.data();

            await setDoc(doc(db, 'archived_users', userId), {
                ...userData,
                uid: userId,
                archivedAt: serverTimestamp(),
                archiveReason: reason,
            });

            await deleteDoc(userRef);
            alert(`✅ User ${userData.email || userId} has been archived.`);
        } catch (error) {
            console.error('Error archiving user:', error);
            alert('Error archiving user. See console for details.');
        }
    };

    const filteredUsers = useMemo(() => {
        return allUsers.filter(user => {
            const matchesSearch =
                user.name?.toLowerCase().includes(search.toLowerCase()) ||
                user.email?.toLowerCase().includes(search.toLowerCase()) ||
                user.id.toLowerCase().includes(search.toLowerCase());

            const matchesView =
                (viewFilter === 'all' && user.status !== 'archived') ||
                (user.status === viewFilter);

            const regDate = user.registeredDate !== 'N/A' ? new Date(user.registeredDate) : null;
            const matchesDateFrom = !dateFrom || (regDate && regDate >= new Date(dateFrom));
            const matchesDateTo = !dateTo || (regDate && regDate <= new Date(dateTo));

            return matchesSearch && matchesView && matchesDateFrom && matchesDateTo;
        }).sort((a, b) => new Date(b.registeredDate) - new Date(a.registeredDate));
    }, [allUsers, search, viewFilter, dateFrom, dateTo]);

    const activeUsers = allUsers.filter(u => u.status !== 'archived');
    const totalUsers = activeUsers.length;
    const registeredCount = activeUsers.filter(u => u.status === 'registered').length;
    const guestCount = activeUsers.filter(u => u.status === 'guest').length;
    const archivedCount = allUsers.filter(u => u.status === 'archived').length;
    const onlineCount = activeUsers.filter(u => u.activeStatus).length;
    const offlineCount = totalUsers - onlineCount;
    const onlineGuestCount = allUsers.filter(u => u.status === 'guest' && u.activeStatus).length;
    const offlineGuestCount = allUsers.filter(u => u.status === 'guest' && !u.activeStatus).length;

    const colSpanCount = useMemo(() => {
        return Object.keys(columnVisibility).filter(key => {
            if (!columnVisibility[key]) return false;
            if (viewFilter === 'archived' && (key === 'activeStatus' || key === 'actions')) return false;
            if (viewFilter !== 'archived' && (key === 'archivedDate' || key === 'archiveReason')) return false;
            return true;
        }).length;
    }, [columnVisibility, viewFilter]);

    const userTypeCounts = [
        { name: 'Tourist', value: allUsers.filter(u => u.userType === 'Tourist').length },
        { name: 'Student', value: allUsers.filter(u => u.userType === 'Student').length },
        { name: 'Local', value: allUsers.filter(u => u.userType === 'Local').length },
        { name: 'Foreign National', value: allUsers.filter(u => u.userType === 'Foreign National').length },
        { name: 'Researcher', value: allUsers.filter(u => u.userType === 'Researcher').length },
    ];
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF'];

    return (
        <div className="dashboard-wrapper">
            <Sidebar />

            {/* --- NEW: Password Modal JSX --- */}
            {showPasswordModal && (
                <div className="password-modal-overlay">
                    <div className="password-modal">
                        <h4>Enter Password</h4>
                        <p>To view archives, please re-enter your password.</p>
                        <input
                            type="password"
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                            className="password-modal-input"
                            placeholder="••••••••••"
                        />
                        <div className="modal-buttons">
                            <button className="modal-btn-cancel" onClick={() => setShowPasswordModal(false)}>Cancel</button>
                            <button className="modal-btn-submit" onClick={handlePasswordSubmit}>Submit</button>
                        </div>
                    </div>
                </div>
            )}

            <main className="dashboard-main">
                <h2>User Management</h2>
                <div className="main-content">
                    <div className="summary-row">
                        <div className="user-count-summary">
                            <div className="count-box"><span className="label">All Users</span><span className="count">{totalUsers}</span></div>
                            <div className="count-box"><span className="label">Registered</span><span className="count">{registeredCount}</span></div>
                            <div className="count-box"><span className="label">Guests</span><span className="count">{guestCount}</span></div>
                            <div className="count-box"><span className="label">Archived</span><span className="count">{archivedCount}</span></div>
                            <div className="count-box"><span className="label">Online Users</span><span className="count">{onlineCount}</span></div>
                            <div className="count-box"><span className="label">Offline Users</span><span className="count">{offlineCount}</span></div>
                            <div className="count-box"><span className="label">Online Guests</span><span className="count">{onlineGuestCount}</span></div>
                            <div className="count-box"><span className="label">Offline Guests</span><span className="count">{offlineGuestCount}</span></div>
                        </div>
                    </div>

                    <div className="user-type-chart">
                        <h3>User Type Distribution</h3>
                        {loading ? (
                            <div className="skeleton skeleton-line" style={{ height: '250px', width: '100%' }}></div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie data={userTypeCounts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                                        {userTypeCounts.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    <div className="tab-date-row">
                        <div className="tab-bar markers-tabs">
                            {['all', 'registered', 'guest'].map(tab => (
                                <button
                                    key={tab}
                                    className={`mtab ${viewFilter === tab ? 'active' : ''}`}
                                    onClick={() => setViewFilter(tab)}
                                >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                            <button
                                key="archived"
                                className={`mtab ${viewFilter === 'archived' ? 'active' : ''}`}
                                onClick={handleViewArchived}
                            >
                                Archived
                            </button>
                        </div>
                        <div className="top-row">
                            <div className="column-dropdown">
                                <button className="dropdown-btn" onClick={() => setShowDropdown(prev => !prev)}>Columns ▼</button>
                                {showDropdown && (
                                    <div className="dropdown-content">
                                        {Object.keys(columnVisibility).map(col => (
                                            <label key={col} className="dropdown-item">
                                                <input type="checkbox" checked={columnVisibility[col]} onChange={() => handleToggleColumn(col)} />
                                                {col.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="date-filters">
                                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="date-filter" />
                                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="date-filter" />
                            </div>
                        </div>
                    </div>

                    <div className="bottom-row">
                        <input type="text" className="search-bar" placeholder="Search by name, email or ID" value={search} onChange={e => setSearch(e.target.value)} />
                        <div className="export-buttons-container">
                            <ExportButtons users={filteredUsers} columnVisibility={columnVisibility} />
                        </div>
                    </div>

                    <div className="table-responsive">
                        <table className="user-table">
                            <thead>
                                <tr>
                                    {columnVisibility.userId && <th>User ID</th>}
                                    {columnVisibility.email && <th>Email</th>}
                                    {columnVisibility.name && <th>Name</th>}
                                    {columnVisibility.age && <th>Age</th>}
                                    {columnVisibility.gender && <th>Gender</th>}
                                    {columnVisibility.contactNumber && <th>Contact Number</th>}
                                    {columnVisibility.status && <th>Status</th>}
                                    {viewFilter !== 'archived' && columnVisibility.activeStatus && <th>Active Status</th>}
                                    {columnVisibility.userType && <th>User Type</th>}
                                    {columnVisibility.registeredDate && <th>Registered Date</th>}
                                    {viewFilter === 'archived' && columnVisibility.archivedDate && <th>Archived Date</th>}
                                    {viewFilter === 'archived' && columnVisibility.archiveReason && <th>Archive Reason</th>}
                                    {viewFilter !== 'archived' && columnVisibility.actions && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    [...Array(5)].map((_, i) => (
                                        <tr key={i}>
                                            {[...Array(colSpanCount)].map((_, j) => (
                                                <td key={j}><div className="skeleton skeleton-line"></div></td>
                                            ))}
                                        </tr>
                                    ))
                                ) : filteredUsers.length > 0 ? (
                                    filteredUsers.map((user) => (
                                        <tr key={user.id}>
                                            {columnVisibility.userId && <td data-label="User ID">{user.id}</td>}
                                            {columnVisibility.email && <td data-label="Email">{user.email || '—'}</td>}
                                            {columnVisibility.name && <td data-label="Name">{user.name}</td>}
                                            {columnVisibility.age && <td data-label="Age">{user.age || 'N/A'}</td>}
                                            {columnVisibility.gender && <td data-label="Gender">{user.gender || '—'}</td>}
                                            {columnVisibility.contactNumber && <td data-label="Contact">{user.contactNumber || '—'}</td>}
                                            {columnVisibility.status && <td data-label="Status">{user.status.charAt(0).toUpperCase() + user.status.slice(1)}</td>}
                                            {viewFilter !== 'archived' && columnVisibility.activeStatus && <td data-label="Active Status">{user.activeStatus ? 'Online' : 'Offline'}</td>}
                                            {columnVisibility.userType && <td data-label="User Type">{user.userType || 'N/A'}</td>}
                                            {columnVisibility.registeredDate && <td data-label="Registered">{user.registeredDate}</td>}
                                            {viewFilter === 'archived' && columnVisibility.archivedDate && <td data-label="Archived Date">{user.archivedDate}</td>}
                                            {viewFilter === 'archived' && columnVisibility.archiveReason && <td data-label="Archive Reason">{user.archiveReason}</td>}
                                            {viewFilter !== 'archived' && columnVisibility.actions && (
                                                <td data-label="Actions">
                                                    {user.status === 'registered' && (
                                                        <button className="archive-btn" onClick={() => handleArchive(user.id)}>Archive</button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={colSpanCount} className="no-data">
                                            No users found for the selected filters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default UserManagement; 