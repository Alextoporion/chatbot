import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UseAuth from '../hooks/UseAuth';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const { loginUser } = UseAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        
        const res = await loginUser(email, password);
        if (res && res.success) {
            navigate('/dashboard');
        } else {
            setErrorMsg(res?.message || 'Login failed. Please check your credentials.');
        }
    };

    return (
        <div className="flex h-screen items-center justify-center bg-gray-100 font-sans text-gray-800">
            <div className="bg-white p-8 rounded-lg shadow-md w-96 border border-gray-200">
                <h2 className="text-2xl font-bold text-center mb-6 text-blue-600">Command Center</h2>
                
                {errorMsg && (
                    <div className="bg-red-100 text-red-700 p-2 rounded mb-4 text-sm text-center">
                        {errorMsg}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Email</label>
                        <input 
                            type="email" 
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full border border-gray-300 rounded px-3 py-2 outline-none focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Password</label>
                        <input 
                            type="password" 
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full border border-gray-300 rounded px-3 py-2 outline-none focus:border-blue-500"
                        />
                    </div>
                    <button 
                        type="submit" 
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded transition-colors"
                    >
                        Login
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;