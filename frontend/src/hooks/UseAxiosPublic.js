import axios from 'axios';
const UseAxiosPublic = () => {

    const axiosPublic = axios.create({
        baseURL: "http://localhost:8080/api",
        withCredentials: true, // Include cookies in requests
    })
    return axiosPublic;
};

export default UseAxiosPublic;