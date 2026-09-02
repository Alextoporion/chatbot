import React, { createContext, useEffect, useState } from 'react';
import UseAxiosPublic from '../hooks/UseAxiosPublic';

export const AuthContext = createContext(null);

const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [error, setError] = useState(null);
    const axiosPublic = UseAxiosPublic();

    // 1. Check active session on app load
    useEffect(() => {
        const checkAuthStatus = async () => {
            try {
                const res = await axiosPublic.get('/auth/me'); // Updated path
                if (res.data.success) {
                    setUser(res.data.agent); // Mapped to 'agent'
                    setIsAuthenticated(true);
                }
            } catch (err) {
                setUser(null);
                setIsAuthenticated(false);
            } finally {
                setLoading(false);
            }
        };

        checkAuthStatus();
    }, []);

    // 2. Login User
    const loginUser = async (email, password) => {
        try {
            const res = await axiosPublic.post('/auth/login', { email, password }); // Updated path

            if (res.data.success) {
                setUser(res.data.agent); // Mapped to 'agent'
                setIsAuthenticated(true);
                return res.data;
            }
        } catch (err) {
            return {
                success: false,
                message: err.response?.data?.message || "Login failed"
            };
        }
    };

    // 3. Logout User
    const logOutUser = async () => {
        try {
            await axiosPublic.post('/auth/logout'); // Updated path
        } catch (err) {
            console.error("Logout error:", err);
        } finally {
            setUser(null);
            setIsAuthenticated(false);
        }
    };

    const authInfo = {
        user,
        loading,
        isAuthenticated,
        loginUser,
        logOutUser,
        error
    };

    return (
        <AuthContext.Provider value={authInfo}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthProvider;