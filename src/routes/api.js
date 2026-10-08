import express from "express";

import {
    checkPostgresHealth
} from "../services/postgres.js";

import {
    getBackendStatus
} from "../services/colabPool.js";

import {
    runAgent
} from "../services/agent.js";

const router =
    express.Router();

router.get(
    "/health",
    async (req, res) => {

        const postgres =
            await checkPostgresHealth();

        const backends =
            getBackendStatus();

        const aiReady =
            backends.some(
                backend =>
                    backend.ready
            );

        const overallHealthy =
            postgres.healthy &&
            aiReady;

        res.json({

            status:
                overallHealthy
                    ? "healthy"
                    : "degraded",

            postgres,

            ai_ready:
                aiReady,

            backends,

            timestamp:
                new Date().toISOString()
        });
    }
);

router.get(
    "/backends",
    (req, res) => {

        res.json({

            success: true,

            backends:
                getBackendStatus()
        });
    }
);

router.post(
    "/chat",
    async (req, res) => {

        const query =
            String(
                req.body?.Query || ""
            ).trim();

        if (!query) {

            return res
                .status(400)
                .json({

                    success: false,

                    error:
                        "Query cannot be empty."
                });
        }

        try {

            const result =
                await runAgent(
                    query
                );

            res.json(
                result
            );

        } catch (error) {

            console.error(
                error
            );

            res
                .status(503)
                .json({

                    success: false,

                    error:
                        error.message
                });
        }
    }
);

export default router;