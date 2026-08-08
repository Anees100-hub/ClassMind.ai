import React, { createContext, useState, useContext, useEffect } from 'react';
import { clearAuthSession, getAuthToken } from '../utils/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const verifyStoredSession = async () => {
            try {
                const token = getAuthToken();
                const storedUser = localStorage.getItem('classmind_user');
                if (!token || !storedUser) {
                    clearAuthSession();
                    setLoading(false);
                    return;
                }

                const res = await fetch('/api/users/session', {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!res.ok) {
                    clearAuthSession();
                    setCurrentUser(null);
                    setLoading(false);
                    return;
                }

                const session = await res.json();
                const user = JSON.parse(storedUser);
                setCurrentUser({
                    ...user,
                    email: session.email,
                    role: session.role,
                    id: session.id,
                });
            } catch (e) {
                console.error('Session verification failed', e);
                clearAuthSession();
                setCurrentUser(null);
            }
            setLoading(false);
        };

        verifyStoredSession();
    }, []);

    const login = async (email, password) => {
        try {
            const res = await fetch('/api/users/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            if (res.ok) {
                const user = await res.json();
                localStorage.setItem('classmind_token', user.token);
                const sessionUser = {
                    name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
                    email: user.email,
                    role: user.role,
                    id: user.id,
                };
                localStorage.setItem('classmind_user', JSON.stringify(sessionUser));
                setCurrentUser(sessionUser);
                return { success: true };
            }
            const err = await res.json().catch(() => ({}));
            return { success: false, message: err.message || 'Invalid email or password' };
        } catch {
            return { success: false, message: 'Network error. Please try again.' };
        }
    };

    const logout = () => {
        setCurrentUser(null);
        clearAuthSession();
    };

    const value = {
        currentUser,
        login,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
