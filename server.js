const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ===============================
// DATABASE TEST
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

app.get("/api/dashboard", async (req, res) => {

    try {

        const [leadStats] = await db.query(`
            SELECT
                COUNT(*) AS total,
                SUM(status = 'Contacted') AS contacted,
                SUM(status = 'Converted') AS converted,
                SUM(status = 'New') AS newLeads
            FROM leads
        `);

        const [campaignStats] = await db.query(`
            SELECT COUNT(*) AS total
            FROM campaigns
            WHERE status = 'Active'
        `);

        const [emailStats] = await db.query(`
            SELECT COUNT(*) AS total
            FROM campaign_leads
        `);

        res.json({
            leads: leadStats[0].total || 0,
            campaigns: campaignStats[0].total || 0,
            emailsSent: emailStats[0].total || 0,
            contacted: leadStats[0].contacted || 0,
            converted: leadStats[0].converted || 0,
            newLeads: leadStats[0].newLeads || 0
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Failed to load dashboard"
        });

    }
});

// ===============================
// GET ALL LEADS
// ===============================

app.get("/api/leads", async (req, res) => {

    try {

        const [leads] = await db.query(`
            SELECT
                id,
                name,
                email,
                company,
                status,
                created_at
            FROM leads
            ORDER BY created_at DESC
        `);

        res.json(leads);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Failed to fetch leads"
        });

    }
});

// ===============================
// ADD LEAD
// ===============================

app.post("/api/leads", async (req, res) => {

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
            (name, email, company, status)
            VALUES (?, ?, ?, ?)
            `,
            [
                name,
                email,
                company || null,
                status || "New"
            ]
        );

        const [rows] = await db.query(
            "SELECT * FROM leads WHERE id = ?",
            [result.insertId]
        );

        res.status(201).json(rows[0]);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Failed to create lead"
        });

    }
});

// ===============================
// UPDATE LEAD
// ===============================

app.put("/api/leads/:id", async (req, res) => {

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
            `,
            [
                name,
                email,
                company,
                status,
                id
            ]
        );

        if (result.affectedRows === 0) {

            return res.status(404).json({
                message: "Lead not found"
            });

        }

        const [rows] = await db.query(
            "SELECT * FROM leads WHERE id = ?",
            [id]
        );

        res.json(rows[0]);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Failed to update lead"
        });

    }
});

// ===============================
// DELETE LEAD
// ===============================

app.delete("/api/leads/:id", async (req, res) => {

    try {

        const id = Number(req.params.id);

        const [result] = await db.query(
            "DELETE FROM leads WHERE id = ?",
            [id]
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
});

// ===============================
// GET CAMPAIGNS
// ===============================

app.get("/api/campaigns", async (req, res) => {

    try {

        const [campaigns] = await db.query(`
            SELECT
                c.id,
                c.name,
                c.status,
                c.created_at,
                COUNT(cl.lead_id) AS leads
            FROM campaigns c
            LEFT JOIN campaign_leads cl
                ON c.id = cl.campaign_id
            GROUP BY
                c.id,
                c.name,
                c.status,
                c.created_at
            ORDER BY c.created_at DESC
        `);

        res.json(campaigns);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Failed to fetch campaigns"
        });

    }
});

// ===============================
// CREATE CAMPAIGN
// ===============================

app.post("/api/campaigns", async (req, res) => {

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
            (name, status)
            VALUES (?, ?)
            `,
            [
                name,
                status || "Draft"
            ]
        );

        const [rows] = await db.query(
            "SELECT * FROM campaigns WHERE id = ?",
            [result.insertId]
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
});

// ===============================
// UPDATE CAMPAIGN
// ===============================

app.put("/api/campaigns/:id", async (req, res) => {

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
            `,
            [
                name,
                status,
                id
            ]
        );

        if (result.affectedRows === 0) {

            return res.status(404).json({
                message: "Campaign not found"
            });

        }

        const [rows] = await db.query(
            "SELECT * FROM campaigns WHERE id = ?",
            [id]
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
});

// ===============================
// DELETE CAMPAIGN
// ===============================

app.delete("/api/campaigns/:id", async (req, res) => {

    try {

        const id = Number(req.params.id);

        const [result] = await db.query(
            "DELETE FROM campaigns WHERE id = ?",
            [id]
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
});

// ===============================
// SERVER
// ===============================

app.listen(3000, () => {

    console.log(
        "MailFlow server running at http://localhost:3000"
    );

});