

const verifyRole = (...allowedRoles) => {
    return (req, res, next) => {
        try {
            if(!req.user || !allowedRoles.includes(req.user.role)){
                return res.status(403).json({ message: "Access denied" });
            }
            next();
        } catch (error) {
            res.status(403).json({ message: "Access denied" });
        }
    }
}

module.exports = verifyRole;