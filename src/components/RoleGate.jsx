import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const RoleGate = ({ roles, children }) => {
    const { currentUser } = useAuth();

    if (!currentUser || !roles.includes(currentUser.role)) {
        if (currentUser?.role === 'teacher') return <Navigate to="/teacher/dashboard" replace />;
        if (currentUser?.role === 'student') return <Navigate to="/" replace />;
        return <Navigate to="/login" replace />;
    }

    return children;
};

export default RoleGate;
