const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) {
        const error = new Error("Unauthorized - no token provided");
        error.statusCode = 401;
        throw error;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) { // 👈 Renamed parameter to 'err'
        const error = new Error("Unauthorized - invalid or expired token");
        error.statusCode = 401;
        throw error;
    }
};

module.exports = verifyToken;