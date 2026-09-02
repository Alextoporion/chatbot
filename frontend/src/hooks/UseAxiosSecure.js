// src/hooks/UseAxiosSecure.js
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const UseAxiosSecure = () => {
    const axiosSecure = axios.create({
        baseURL: "http://localhost:8080/api",
        withCredentials: true, // Automatically sends HTTP-only token cookie
    });
    const navigate = useNavigate();

    axiosSecure.interceptors.response.use(
        (response) => response,
        (error) => {
            if (error.response && (error.response.status === 401 || error.response.status === 403)) {
                // Handle token expiration/unauthorized access (e.g., redirect to login)
                navigate('/login');
            }
            return Promise.reject(error);
        }
    );

    return axiosSecure;
};

export default UseAxiosSecure;