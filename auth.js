const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

async function registerUser(name, email, password) {

    if (!name || !email || !password) {
        throw new Error("Name, email and password are required");
    }

    if (password.length < 6) {
        throw new Error("Password must be at least 6 characters");
    }

    const [existingUsers] = await db.query(
        "SELECT id FROM users WHERE email = ?",
        [email]
    );

    if (existingUsers.length > 0) {
        throw new Error("Email already registered");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await db.query(
        `
        INSERT INTO users
        (name, email, password_hash)
        VALUES (?, ?, ?)
        `,
        [name, email, passwordHash]
    );

    return {
        id: result.insertId,
        name,
        email
    };
}

async function loginUser(email, password) {

    if (!email || !password) {
        throw new Error("Email and password are required");
    }

    const [users] = await db.query(
        `
        SELECT id, name, email, password_hash
        FROM users
        WHERE email = ?
        `,
        [email]
    );

    if (users.length === 0) {
        throw new Error("Invalid email or password");
    }

    const user = users[0];

    const passwordValid = await bcrypt.compare(
        password,
        user.password_hash
    );

    if (!passwordValid) {
        throw new Error("Invalid email or password");
    }

    const token = jwt.sign(
        {
            userId: user.id,
            email: user.email
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "7d"
        }
    );

    return {
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email
        }
    };
}

function authenticateToken(req, res, next) {

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Authentication required"
        });
    }

    const token = authHeader.split(" ")[1];

    try {

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = decoded;

        next();

    } catch (error) {

        return res.status(401).json({
            message: "Invalid or expired token"
        });

    }
}

module.exports = {
    registerUser,
    loginUser,
    authenticateToken
};