import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const HEALTH_TIMEOUT = Number(process.env.COLAB_HEALTH_TIMEOUT_MS || 10000);
const CHAT_TIMEOUT   = Number(process.env.COLAB_CHAT_TIMEOUT_MS   || 120000);

const backendDefinitions = [
  {
    id: "COLAB",
    name: "Gemini RAG Backend A",
    url: process.env.COLAB_URL
  },
  {
    id: "COLAB-B",
    name: "Gemini RAG Backend B",
    url: process.env.COLAB_B_URL
  }
];

const backendState = backendDefinitions
  .filter(b => Boolean(b.url))
  .map(backend => ({
    ...backend,
    healthy: false,
    ready: false,
    latencyMs: null,
    lastHeartbeat: null,
    healthData: null,
    failures: 0
  }));

let roundRobinIndex = 0;

export async function heartbeatBackend(backend) {
  const start = Date.now();

  try {
    const response = await axios.get(`${backend.url}/health`, {
      timeout: HEALTH_TIMEOUT,
      validateStatus: () => true,
      headers: {
        "ngrok-skip-browser-warning": "69420"
      }
    });

    const healthy = response.status >= 200 &&
                    response.status < 300 &&
                    response.data?.status === "healthy";


    const ready = healthy && response.data?.ready_for_chat !== false;

    backend.healthy = healthy;
    backend.ready = ready;
    backend.latencyMs = Date.now() - start;
    backend.lastHeartbeat = new Date().toISOString();
    backend.healthData = response.data;
    backend.failures = ready ? 0 : backend.failures + 1;
  } catch (error) {
    backend.healthy = false;
    backend.ready = false;
    backend.latencyMs = null;
    backend.lastHeartbeat = new Date().toISOString();
    backend.healthData = {
      status: "offline",
      error: error.code || error.message
    };
    backend.failures += 1;
  }

  return backend;
}

export async function heartbeatAll() {
  await Promise.all(backendState.map(heartbeatBackend));
  return getBackendStatus();
}

export function getBackendStatus() {
  return backendState.map(backend => ({
    id: backend.id,
    name: backend.name,
    healthy: backend.healthy,
    ready: backend.ready,
    latencyMs: backend.latencyMs,
    lastHeartbeat: backend.lastHeartbeat,
    failures: backend.failures,
    healthData: backend.healthData
  }));
}

function getHealthy() {
  return backendState.filter(b => b.healthy && b.ready);
}

export function selectBackend(excludedIds = new Set()) {
  const healthy = getHealthy().filter(b => !excludedIds.has(b.id));
  if (healthy.length === 0) return null;

  const selected = healthy[roundRobinIndex % healthy.length];
  roundRobinIndex += 1;
  return selected;
}

/**
 * CRITICAL: now accepts an object { query, evidence }
 */
export async function callRag({ query, evidence }) {
  let healthy = getHealthy();

  // Immediate probe if everything looks down
  if (healthy.length === 0) {
    await heartbeatAll();
    healthy = getHealthy();
  }

  if (healthy.length === 0) {
    throw new Error("No healthy AI backends are available.");
  }

  const attempted = new Set();

  while (attempted.size < healthy.length) {
    const backend = selectBackend(attempted);
    if (!backend) break;

    attempted.add(backend.id);

    try {
      const response = await axios.post(
        `${backend.url}/api/chat`,
        {
          Query: query,               // ← string
          Evidence: evidence || {}    // ← object (the Postgres + static KB data)
        },
        {
          timeout: CHAT_TIMEOUT,
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "69420"
          }
        }
      );

      return {
        backendId: backend.id,
        backendName: backend.name,
        response: response.data
      };
    } catch (error) {
      console.error(`[AI] ${backend.id} failed:`, error.response?.status || error.message);
      if (error.response?.data) {
        console.error("   detail:", JSON.stringify(error.response.data, null, 2));
      }

      backend.healthy = false;
      backend.ready = false;
      backend.failures += 1;
    }
  }

  throw new Error("All healthy AI backends failed during this request.");
}