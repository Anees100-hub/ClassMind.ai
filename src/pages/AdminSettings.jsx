import React, { useState, useEffect } from 'react';
import { motion as MOTION } from 'framer-motion';
import { Settings, Shield, Database, Bell, Save, Download, FileText, CheckCircle, Loader2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import './AdminSettings.css';

const AdminSettings = () => {
    const {
        students, teachers, classes,
        systemSettings, auditLogs, announcements,
        fetchSettings, saveSettings, fetchAuditLogs, fetchAnnouncements, fetchFullBackup, refreshData
    } = useData();
    const { currentUser } = useAuth();

    const [activeTab, setActiveTab] = useState('system');
    const [savedMsg, setSavedMsg] = useState('');
    const [announceMsg, setAnnounceMsg] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const [academicYear, setAcademicYear] = useState('2024-2025');
    const [language, setLanguage] = useState('en');
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [bannerText, setBannerText] = useState('');
    const [announceAudience, setAnnounceAudience] = useState('all');

    useEffect(() => {
        fetchSettings();
        fetchAuditLogs();
        fetchAnnouncements();
    }, []);

    useEffect(() => {
        if (systemSettings) {
            setAcademicYear(systemSettings.academicYear || '2024-2025');
            setLanguage(systemSettings.language || 'en');
            setMaintenanceMode(systemSettings.maintenanceMode || false);
        }
    }, [systemSettings]);

    const tabs = [
        { id: 'system', label: 'System Config', icon: Settings },
        { id: 'security', label: 'Audit Logs', icon: Shield },
        { id: 'data', label: 'Backup & Export', icon: Database },
        { id: 'notifications', label: 'Announcements', icon: Bell },
    ];

    const handleSaveConfig = async () => {
        setIsSaving(true);
        setSavedMsg('');
        const result = await saveSettings({
            academicYear,
            language,
            maintenanceMode,
            updatedBy: currentUser?.name || 'Admin'
        });
        setIsSaving(false);
        if (result.success) {
            setSavedMsg('Settings saved to database successfully.');
        } else {
            setSavedMsg(result.message || 'Failed to save settings.');
        }
        setTimeout(() => setSavedMsg(''), 4000);
    };

    const downloadCSV = (filename, rows) => {
        const csv = rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportStudents = () => {
        const header = ['ID', 'First Name', 'Last Name', 'Email', 'Program', 'Status', 'Enrolled Classes'];
        const rows = [header, ...students.map(s => [
            s.id, s.firstName, s.lastName, s.email, s.program, s.status,
            (s.enrolledClasses || []).join('; ')
        ])];
        downloadCSV('classmind_students.csv', rows);
    };

    const exportTeachers = () => {
        const header = ['ID', 'First Name', 'Last Name', 'Email', 'Department', 'Status', 'Assigned Classes'];
        const rows = [header, ...teachers.map(t => [
            t.id, t.firstName, t.lastName, t.email, t.department, t.status,
            (t.assignedClasses || []).join('; ')
        ])];
        downloadCSV('classmind_teachers.csv', rows);
    };

    const exportClasses = () => {
        const header = ['ID', 'Name', 'Instructor', 'Students', 'Schedule', 'Status'];
        const rows = [header, ...classes.map(c => [
            c.id, c.name, c.instructorName || 'Unassigned', c.studentsCount || 0, c.schedule, c.status
        ])];
        downloadCSV('classmind_classes.csv', rows);
    };

    const exportFullBackup = async () => {
        setIsExporting(true);
        await refreshData();
        const backup = await fetchFullBackup();
        setIsExporting(false);
        if (backup) {
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `classmind_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    const publishAnnouncement = async () => {
        if (!bannerText.trim()) {
            setAnnounceMsg('Please enter announcement text.');
            return;
        }
        setIsPublishing(true);
        try {
            const res = await fetch('/api/notifications/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    classId: 'SYSTEM',
                    title: `System Announcement (${announceAudience})`,
                    message: bannerText.trim(),
                    type: 'general',
                    code: announceAudience
                })
            });
            if (res.ok) {
                setAnnounceMsg('Announcement published and saved to database.');
                setBannerText('');
                await fetchAnnouncements();
                await fetchAuditLogs();
            } else {
                setAnnounceMsg('Failed to publish announcement.');
            }
        } catch {
            setAnnounceMsg('Network error while publishing.');
        }
        setIsPublishing(false);
        setTimeout(() => setAnnounceMsg(''), 4000);
    };

    const formatLogTime = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const diff = Date.now() - d.getTime();
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString();
    };

    return (
        <MOTION.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="settings-page admin-page">
            <div className="page-header admin-page-header">
                <div>
                    <h1>Administrative Controls</h1>
                    <p>Live database settings — {students.length} students, {teachers.length} teachers, {classes.length} classes</p>
                </div>
            </div>

            <div className="settings-layout">
                <div className="settings-sidebar">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <tab.icon size={20} />
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>

                <div className="settings-content">
                    {activeTab === 'system' && (
                        <MOTION.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="settings-section">
                            <h3>General Configuration</h3>
                            <p className="settings-desc">Saved to MongoDB — persists across sessions and devices.</p>
                            {savedMsg && (
                                <div className={`settings-alert ${savedMsg.includes('success') || savedMsg.includes('database') ? 'success' : 'error'}`}>
                                    <CheckCircle size={18} /> {savedMsg}
                                </div>
                            )}
                            <div className="settings-group">
                                <label>Academic Year</label>
                                <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
                                    <option>2023-2024</option>
                                    <option>2024-2025</option>
                                    <option>2025-2026</option>
                                </select>
                            </div>
                            <div className="settings-group">
                                <label>System Language</label>
                                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                                    <option value="en">English (US)</option>
                                    <option value="es">Spanish</option>
                                    <option value="fr">French</option>
                                </select>
                            </div>
                            <div className="settings-group">
                                <div className="toggle-item">
                                    <span>Maintenance Mode</span>
                                    <button
                                        type="button"
                                        className={`toggle-switch ${maintenanceMode ? 'on' : ''}`}
                                        onClick={() => setMaintenanceMode(v => !v)}
                                        aria-label="Toggle maintenance mode"
                                    />
                                </div>
                            </div>
                            <button className="btn-primary" onClick={handleSaveConfig} disabled={isSaving}>
                                {isSaving ? <><Loader2 size={18} className="spin-icon" /> Saving...</> : <><Save size={18} /> Save to Database</>}
                            </button>
                        </MOTION.div>
                    )}

                    {activeTab === 'security' && (
                        <MOTION.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="settings-section">
                            <div className="settings-section-top">
                                <h3>Audit Logs</h3>
                                <button className="btn-secondary-sm" onClick={fetchAuditLogs}>Refresh</button>
                            </div>
                            <p className="settings-desc">Real activity log from MongoDB ({auditLogs.length} entries).</p>
                            <div className="log-list">
                                {auditLogs.length === 0 ? (
                                    <p className="empty-tab-msg">No audit logs yet. Actions will appear here as you manage the system.</p>
                                ) : auditLogs.map((log) => (
                                    <div key={log._id} className="log-item">
                                        <div className="log-info">
                                            <span className="log-user">{log.user}</span>
                                            <span className="log-action">{log.action}{log.details ? ` — ${log.details}` : ''}</span>
                                        </div>
                                        <span className="log-time">{formatLogTime(log.createdAt)}</span>
                                    </div>
                                ))}
                            </div>
                        </MOTION.div>
                    )}

                    {activeTab === 'data' && (
                        <MOTION.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="settings-section">
                            <h3>Data Management</h3>
                            <p className="settings-desc">
                                Export live data directly from MongoDB.
                            </p>
                            <div className="data-actions">
                                <button className="data-card" onClick={exportStudents}>
                                    <Download size={24} />
                                    <span>Export Students (CSV)</span>
                                    <small>{students.length} records</small>
                                </button>
                                <button className="data-card" onClick={exportTeachers}>
                                    <Download size={24} />
                                    <span>Export Teachers (CSV)</span>
                                    <small>{teachers.length} records</small>
                                </button>
                                <button className="data-card" onClick={exportClasses}>
                                    <Download size={24} />
                                    <span>Export Classes (CSV)</span>
                                    <small>{classes.length} records</small>
                                </button>
                                <button className="data-card" onClick={exportFullBackup} disabled={isExporting}>
                                    <FileText size={24} />
                                    <span>{isExporting ? 'Exporting...' : 'Full DB Backup (JSON)'}</span>
                                    <small>All collections</small>
                                </button>
                            </div>
                        </MOTION.div>
                    )}

                    {activeTab === 'notifications' && (
                        <MOTION.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="settings-section">
                            <h3>Global Announcements</h3>
                            {announceMsg && (
                                <div className={`settings-alert ${announceMsg.includes('success') || announceMsg.includes('published') ? 'success' : 'error'}`}>
                                    {announceMsg}
                                </div>
                            )}
                            <div className="settings-group">
                                <label>Announcement Text</label>
                                <textarea
                                    value={bannerText}
                                    onChange={(e) => setBannerText(e.target.value)}
                                    placeholder="Welcome to ClassMind AI! Final exams start next week..."
                                    rows={4}
                                />
                            </div>
                            <div className="settings-group">
                                <label>Target Audience</label>
                                <select value={announceAudience} onChange={(e) => setAnnounceAudience(e.target.value)}>
                                    <option value="all">Everyone</option>
                                    <option value="student">Students Only</option>
                                    <option value="teacher">Teachers Only</option>
                                </select>
                            </div>
                            <button className="btn-primary" onClick={publishAnnouncement} disabled={isPublishing}>
                                {isPublishing ? <><Loader2 size={18} className="spin-icon" /> Publishing...</> : <><Bell size={18} /> Publish to Database</>}
                            </button>

                            {announcements.length > 0 && (
                                <div className="past-announcements">
                                    <h4>Recent Announcements</h4>
                                    {announcements.map(a => (
                                        <div key={a.id} className="announcement-item">
                                            <p>{a.message}</p>
                                            <span>{a.time || formatLogTime(a.createdAt)} · {a.code || 'all'}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </MOTION.div>
                    )}
                </div>
            </div>
        </MOTION.div>
    );
};

export default AdminSettings;
