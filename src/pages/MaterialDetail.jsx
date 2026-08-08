import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Brain, Layout, BookOpen, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import './MaterialDetail.css';

const MaterialDetail = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { currentUser } = useAuth();
    const { getStudentData } = useData();

    const studentData = getStudentData(currentUser?.email);
    const [material, setMaterial] = useState(null);
    const [loading, setLoading] = useState(true);
    const [accessDenied, setAccessDenied] = useState(false);

    useEffect(() => {
        const fetchMaterial = async () => {
            setLoading(true);
            setAccessDenied(false);
            try {
                const res = await fetch(`/api/materials/${id}`);
                if (res.ok) {
                    const data = await res.json();
                    setMaterial(data);
                } else {
                    setMaterial(null);
                }
            } catch (err) {
                console.error('Error fetching material', err);
                setMaterial(null);
            } finally {
                setLoading(false);
            }
        };
        fetchMaterial();
    }, [id]);

    useEffect(() => {
        if (!material || !studentData) return;
        const enrolled = studentData.enrolledClasses || [];
        if (!enrolled.includes(material.classId)) {
            setAccessDenied(true);
        }
    }, [material, studentData]);

    const handleDownload = async () => {
        if (!material || accessDenied) return;

        try {
            await fetch(`/api/materials/${id}/access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: studentData?.id || currentUser?.id })
            });
        } catch (e) {
            console.error('Failed to log access', e);
        }

        window.open(material.fileUrl, '_blank');
    };

    if (loading) {
        return (
            <div className="material-detail-page student-page">
                <div className="dashboard-loading">
                    <div className="dashboard-spinner" />
                    <p>Loading material...</p>
                </div>
            </div>
        );
    }

    if (!studentData) {
        return (
            <div className="material-detail-page student-page">
                <div className="dashboard-empty">
                    <BookOpen size={56} />
                    <h3>Student Profile Not Found</h3>
                    <p>Please contact your administrator.</p>
                </div>
            </div>
        );
    }

    if (!material || accessDenied) {
        return (
            <div className="material-detail-page student-page">
                <div className="breadcrumb">
                    <button onClick={() => navigate('/')} className="btn-back">
                        <ArrowLeft size={20} />
                        <span>Back to Dashboard</span>
                    </button>
                </div>
                <div className="dashboard-empty">
                    <ShieldAlert size={56} />
                    <h3>{accessDenied ? 'Access Denied' : 'Material Not Found'}</h3>
                    <p>
                        {accessDenied
                            ? 'You must be enrolled in this class to view its materials.'
                            : 'This material does not exist or may have been removed.'}
                    </p>
                    {material?.classId && (
                        <button className="student-view-btn" style={{ marginTop: '16px', maxWidth: '240px' }} onClick={() => navigate(`/class/${material.classId}`)}>
                            Go to Class
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const summaryLines = material.aiSummary ? material.aiSummary.split('\n').filter(l => l.trim()) : [];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="material-detail-page student-page"
        >
            <div className="breadcrumb">
                <button onClick={() => navigate(`/class/${material.classId}`)} className="btn-back">
                    <ArrowLeft size={20} />
                    <span>Back to {material.classId}</span>
                </button>
            </div>

            <div className="material-hero">
                <div className="hero-top">
                    <div className="file-type-badge">
                        <FileText size={24} />
                    </div>
                    <h1>{material.title}</h1>
                    <button className="btn-download" onClick={handleDownload}>
                        <Download size={20} />
                        <span>Download {material.format}</span>
                    </button>
                </div>
                <div className="hero-meta">
                    <p>Course: {material.classId}</p>
                    <span className="dot">•</span>
                    <p>Uploaded: {material.uploadDate ? new Date(material.uploadDate).toLocaleDateString() : 'Recently'}</p>
                </div>
                <div className="hero-tags">
                    <span className="tag">{material.format}</span>
                    {material.aiSummary && (
                        <span className="tag-ai">
                            <Brain size={16} />
                            {material.isDemoSummary || material.aiSummary.startsWith('[Demo Summary') ? 'Demo Summary' : 'AI Generated Summary'}
                        </span>
                    )}
                    <span className="tag">{material.accessedBy?.length || 0} Views</span>
                </div>
            </div>

            <div className="material-content">
                <div className="content-section">
                    <div className="section-header">
                        <Layout size={20} color="#3B82F6" />
                        <h2>Description</h2>
                    </div>
                    <div className="summary-box">
                        <p>{material.description || 'No description provided for this material.'}</p>
                    </div>
                </div>

                <div className="content-section">
                    <div className="section-header">
                        <Brain size={20} color="#A855F7" />
                        <h2>AI Summary</h2>
                    </div>
                    {material.aiSummary ? (
                        <div className="points-list">
                            {summaryLines.map((line, idx) => (
                                <div className="point-item" key={idx}>
                                    <div className="point-num">{idx + 1}</div>
                                    <p>{line.replace(/^[•*\-\s]+/, '')}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="summary-box">
                            <p>No AI summary could be generated for this material.</p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default MaterialDetail;
