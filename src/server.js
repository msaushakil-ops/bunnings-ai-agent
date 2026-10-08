import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import apiRouter from "./routes/api.js";
import { heartbeatAll } from "./services/colabPool.js";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 3000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicPath = path.join(__dirname, "..", "public");

// -----------------------------------------------------------------------------
// Middleware
// -----------------------------------------------------------------------------

app.use(
    cors({
        origin: true,
        credentials: false
    })
);

app.use(
    express.json({
        limit: "1mb"
    })
);

// -----------------------------------------------------------------------------
// API routes FIRST
// -----------------------------------------------------------------------------

app.use("/api", apiRouter);

// -----------------------------------------------------------------------------
// Static frontend
//
// extensions explicitly tell Express not to try to interpret unknown paths
// as frontend routes too early.
// -----------------------------------------------------------------------------

app.use(
    express.static(publicPath, {
        index: "index.html",
        fallthrough: true,
        maxAge: 0
    })
);

// -----------------------------------------------------------------------------
// SPA fallback
//
// IMPORTANT:
// Do not send index.html for requests that look like files.
// This prevents /background3.mp4, favicon.ico, etc. from being incorrectly
// handled as frontend routes.
// -----------------------------------------------------------------------------

app.use((req, res, next) => {

    if (
        req.method !== "GET" &&
        req.method !== "HEAD"
    ) {
        return next();
    }

    const requestedPath = req.path;

    const hasFileExtension =
        path.extname(requestedPath).length > 0;

    if (hasFileExtension) {
        return res.status(404).end();
    }

    return res.sendFile(
        path.join(publicPath, "index.html")
    );
});

// -----------------------------------------------------------------------------
// Error handler
// -----------------------------------------------------------------------------

app.use((err, req, res, next) => {

    console.error("SERVER ERROR:", err);

    if (res.headersSent) {
        return next(err);
    }

    res.status(
        Number(err.status || 500)
    ).json({
        success: false,
        error: err.message || "Internal server error"
    });
});

// -----------------------------------------------------------------------------
// Start
// -----------------------------------------------------------------------------

app.listen(
    PORT,
    async () => {

        console.log("");
        console.log(
            "====================================================="
        );
        console.log(
            "MULTI-SOURCE AI AGENT LAB"
        );
        console.log(
            "====================================================="
        );

        console.log(
            `UI/API: http://localhost:${PORT}`
        );

        console.log(
            "Heartbeat interval: 300s"
        );

        console.log("");

        try {

            const results =
                await heartbeatAll();

            console.log(
                "[Initial Heartbeat]"
            );

            for (const backend of results) {

                console.log(
                    `  ${backend.id}: ${
                        backend.ready
                            ? "READY"
                            : "OFFLINE"
                    } ${
                        backend.latencyMs ?? "-"
                    }ms`
                );
            }

        } catch (error) {

            console.error(
                "Initial heartbeat failed:",
                error.message
            );
        }

        setInterval(
            async () => {

                try {

                    const results =
                        await heartbeatAll();

                    console.log(
                        `\n[Heartbeat] ${new Date().toISOString()}`
                    );

                    for (
                        const backend
                        of results
                    ) {

                        console.log(
                            `  ${backend.id}: ${
                                backend.ready
                                    ? "READY"
                                    : "OFFLINE"
                            } ${
                                backend.latencyMs ?? "-"
                            }ms`
                        );
                    }

                } catch (error) {

                    console.error(
                        "Heartbeat error:",
                        error.message
                    );
                }

            },
            5 * 60 * 1000
        );
    }
);