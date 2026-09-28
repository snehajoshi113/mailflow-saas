
const express = require("express");
const cors = require("cors");
const db = require("./db");

const {
    registerUser,
    loginUser,
    authenticateToken
} = require("./auth");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ===============================
// AUTHENTICATION
// ===============================

app.post("/api/auth/register", async (req, res) => {

    try {

        const { name, email, password } = req.body;

        const user = await registerUser(
            name,
            email,
            password
        );

        res.status(201).json({
            message: "Registration successful",
            user
        });

    } catch (error) {

        res.status(400).json({
            message: error.message
        });

    }

});

app.post("/api/auth/login", async (req, res) => {

    try {

        const { email, password } = req.body;

        const result = await loginUser(
            email,
            password
        );

        res.json(result);

    } catch (error) {

        res.status(401).json({
            message: error.message
        });

    }

});

app.get(
    "/api/auth/me",
    authenticateToken,
    async (req, res) => {

        try {

            const [users] = await db.query(
                `
                SELECT id, name, email
                FROM users
                WHERE id = ?
                `,
                [req.user.userId]
            );

            if (users.length === 0) {
                return res.status(404).json({
                    message: "User not found"
                });
            }

            res.json({
                user: users[0]
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message: "Failed to load user"
            });

        }

    }
);

// ===============================
// HEALTH
// ===============================

app.get("/api/health", async (req, res) => {

    try {

        const [rows] = await db.query(
            "SELECT 1 AS connected"
        );

        res.json({
            status: "OK",
            database: rows[0].connected === 1
        });

    } catch (error) {

        res.status(500).json({
            status: "ERROR",
            message: "Database connection failed"
        });

    }

});

// ===============================
// DASHBOARD
// ===============================

app.get(
    "/api/dashboard",
    authenticateToken,
    async (req, res) => {

        try {

            const userId = req.user.userId;

            const [leadStats] = await db.query(
                `
                SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(status = 'Contacted'), 0) AS contacted,
                    COALESCE(SUM(status = 'Converted'), 0) AS converted,
                    COALESCE(SUM(status = 'New'), 0) AS newLeads
                FROM leads
                WHERE user_id = ?
                `,
                [userId]
            );

            const [campaignStats] = await db.query(
                `
                SELECT COUNT(*) AS total
                FROM campaigns
                WHERE user_id = ?
                AND status = 'Active'
                `,
                [userId]
            );

            const [emailStats] = await db.query(
                `
                SELECT COUNT(*) AS total
                FROM campaign_leads cl
                INNER JOIN campaigns c
                    ON cl.campaign_id = c.id
                WHERE c.user_id = ?
                `,
                [userId]
            );

            res.json({
                leads: Number(leadStats[0].total) || 0,
                campaigns: Number(campaignStats[0].total) || 0,
                emailsSent: Number(emailStats[0].total) || 0,
                contacted: Number(leadStats[0].contacted) || 0,
                converted: Number(leadStats[0].converted) || 0,
                newLeads: Number(leadStats[0].newLeads) || 0
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message: "Failed to load dashboard"
            });

        }

    }
);

// ===============================
// LEADS
// ===============================

app.get(
    "/api/leads",
    authenticateToken,
    async (req, res) => {

        try {

            const [leads] = await db.query(
                `
                SELECT
                    id,
                    name,
                    email,
                    company,
                    status,
                    created_at
                FROM leads
                WHERE user_id = ?
                ORDER BY created_at DESC
                `,
                [req.user.userId]
            );

            res.json(leads);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message: "Failed to fetch leads"
            });

        }

    }
);

app.post(
    "/api/leads",
    authenticateToken,
    async (req, res) => {

        try {

            const {
                name,
                email,
                company,
                status
            } = req.body;

            if (!name || !email) {

                return res.status(400).json({
                    message: "Name and email are required"
                });

            }

            const [result] = await db.query(
                `
                INSERT INTO leads
                (user_id, name, email, company, status)
                VALUES (?, ?, ?, ?, ?)
                `,
                [
                    req.user.userId,
                    name,
                    email,
                    company || null,
                    status || "New"
                ]
            );

            const [rows] = await db.query(
                `
                SELECT
                    id,
                    name,
                    email,
                    company,
                    status,
                    created_at
                FROM leads
                WHERE id = ?
                AND user_id = ?
                `,
                [
                    result.insertId,
                    req.user.userId
                ]
            );

            res.status(201).json(rows[0]);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message: "Failed to create lead"
            });

        }

    }
);// ===============================
// UPDATE LEAD
// ===============================

app.put(
    "/api/leads/:id",
    authenticateToken,
    async (req, res) => {

        try {

            const id = Number(req.params.id);

            const {
                name,
                email,
                company,
                status
            } = req.body;

            const [result] = await db.query(
                `
                UPDATE leads
                SET
                    name = COALESCE(?, name),
                    email = COALESCE(?, email),
                    company = COALESCE(?, company),
                    status = COALESCE(?, status)
                WHERE id = ?
                AND user_id = ?
                `,
                [
                    name,
                    email,
                    company,
                    status,
                    id,
                    req.user.userId
                ]
            );

            if (result.affectedRows === 0) {

                return res.status(404).json({
                    message: "Lead not found"
                });

            }

            const [rows] = await db.query(
                `
                SELECT
                    id,
                    name,
                    email,
                    company,
                    status,
                    created_at
                FROM leads
                WHERE id = ?
                AND user_id = ?
                `,
                [
                    id,
                    req.user.userId
                ]
            );

            res.json(rows[0]);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message: "Failed to update lead"
            });

        }

    }
);

// ===============================
// DELETE LEAD
// ===============================

app.delete(
    "/api/leads/:id",
    authenticateToken,
    async (req, res) => {

        try {

            const id = Number(req.params.id);

            const [result] = await db.query(
                `
                DELETE FROM leads
                WHERE id = ?
                AND user_id = ?
                `,
                [
                    id,
                    req.user.userId
                ]
            );

            if (result.affectedRows === 0) {

                return res.status(404).json({
                    message: "Lead not found"
                });

            }

            res.json({
                message: "Lead deleted successfully"
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message: "Failed to delete lead"
            });

        }

    }
);

// ===============================
// CAMPAIGNS
// ===============================

app.get(
    "/api/campaigns",
    authenticateToken,
    async (req, res) => {

        try {

            const [campaigns] = await db.query(
                `
                SELECT
                    c.id,
                    c.name,
                    c.status,
                    c.created_at,
                    COUNT(cl.lead_id) AS leads
                FROM campaigns c
                LEFT JOIN campaign_leads cl
                    ON c.id = cl.campaign_id
                WHERE c.user_id = ?
                GROUP BY
                    c.id,
                    c.name,
                    c.status,
                    c.created_at
                ORDER BY c.created_at DESC
                `,
                [req.user.userId]
            );

            res.json(campaigns);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message: "Failed to fetch campaigns"
            });

        }

    }
);

// ===============================
// CREATE CAMPAIGN
// ===============================

app.post(
    "/api/campaigns",
    authenticateToken,
    async (req, res) => {

        try {

            const {
                name,
                status
            } = req.body;

            if (!name) {

                return res.status(400).json({
                    message: "Campaign name is required"
                });

            }

            const [result] = await db.query(
                `
                INSERT INTO campaigns
                (user_id, name, status)
                VALUES (?, ?, ?)
                `,
                [
                    req.user.userId,
                    name,
                    status || "Draft"
                ]
            );

            const [rows] = await db.query(
                `
                SELECT
                    id,
                    user_id,
                    name,
                    status,
                    created_at
                FROM campaigns
                WHERE id = ?
                AND user_id = ?
                `,
                [
                    result.insertId,
                    req.user.userId
                ]
            );

            res.status(201).json({
                ...rows[0],
                leads: 0
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message: "Failed to create campaign"
            });

        }

    }
);

// ===============================
// UPDATE CAMPAIGN
// ===============================

app.put(
    "/api/campaigns/:id",
    authenticateToken,
    async (req, res) => {

        try {

            const id = Number(req.params.id);

            const {
                name,
                status
            } = req.body;

            const [result] = await db.query(
                `
                UPDATE campaigns
                SET
                    name = COALESCE(?, name),
                    status = COALESCE(?, status)
                WHERE id = ?
                AND user_id = ?
                `,
                [
                    name,
                    status,
                    id,
                    req.user.userId
                ]
            );

            if (result.affectedRows === 0) {

                return res.status(404).json({
                    message: "Campaign not found"
                });

            }

            const [rows] = await db.query(
                `
                SELECT
                    id,
                    user_id,
                    name,
                    status,
                    created_at
                FROM campaigns
                WHERE id = ?
                AND user_id = ?
                `,
                [
                    id,
                    req.user.userId
                ]
            );

            res.json({
                ...rows[0],
                leads: 0
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message: "Failed to update campaign"
            });

        }

    }
);

// ===============================
// DELETE CAMPAIGN
// ===============================

app.delete(
    "/api/campaigns/:id",
    authenticateToken,
    async (req, res) => {

        try {

            const id = Number(req.params.id);

            const [result] = await db.query(
                `
                DELETE FROM campaigns
                WHERE id = ?
                AND user_id = ?
                `,
                [
                    id,
                    req.user.userId
                ]
            );

            if (result.affectedRows === 0) {

                return res.status(404).json({
                    message: "Campaign not found"
                });

            }

            res.json({
                message: "Campaign deleted successfully"
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message: "Failed to delete campaign"
            });

        }

    }
);

// ===============================
// SERVER
// ===============================

app.listen(3000, () => {

    console.log(
        "MailFlow server running at http://localhost:3000"
    );

});