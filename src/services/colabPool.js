import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const HEALTH_TIMEOUT = Number(process.env.COLAB_HEALTH_TIMEOUT_MS || 10000);
const CHAT_TIMEOUT   = Number(process.env.COLAB_CHAT_TIMEOUT_MS   || 120000);

// How many consecutive /chat failures before we consider a backend down.
// 1 = too aggressive (a single Gemini quota blip kills the agent for 5 min)
// 3 = tolerant enough for transient errors, still trips on real outages.
const FAILURE_THRESHOLD = 3;

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
        "ngrok-skip-browser-warning": "69420",
        "Accept": "application/json"
      }
    });

    const healthy = response.status >= 200 &&
                    response.status < 300 &&
                    response.data?.status === "healthy";

    // Backwards compatible: v2.7 does not send ready_for_chat.
    // Missing field is treated as "ready if healthy".
    // Explicit false means not ready.
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
 * Calls the RAG backend. Accepts { query, evidence }.
 *
 * Resilience policy:
 *  - A single /chat failure does NOT take the backend offline.
 *    Transient errors (Gemini quota blips, ngrok resets, brief 5xx)
 *    are common and should not disable the agent for the full
 *    heartbeat cycle.
 *  - Only after FAILURE_THRESHOLD consecutive failures do we mark
 *    the backend unhealthy; the next heartbeat or the next
 *    successful /chat resets the counter.
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
          Query: query,
          Evidence: evidence || {}
        },
        {
          timeout: CHAT_TIMEOUT,
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "69420"
          }
        }
      );

      // ── Success path ────────────────────────────────────────────
      // Any successful reply means the backend is alive. Reset
      // counters so previous transient failures do not accumulate.
      backend.failures = 0;
      backend.healthy = true;
      backend.ready = true;
      backend.latencyMs = null; // latency is only tracked on health check

      return {
        backendId: backend.id,
        backendName: backend.name,
        response: response.data
      };
    } catch (error) {
      console.error(
        `[AI] ${backend.id} failed:`,
        error.response?.status || error.message
      );
      if (error.response?.data) {
        console.error("   detail:", JSON.stringify(error.response.data, null, 2));
      }

      // ── Failure path ────────────────────────────────────────────
      // Increment counter, but DO NOT mark unhealthy on the first
      // failure. Only after FAILURE_THRESHOLD consecutive failures
      // do we take the backend out of rotation.
      backend.failures = (backend.failures || 0) + 1;

      if (backend.failures >= FAILURE_THRESHOLD) {
        console.error(
          `[AI] ${backend.id} reached ${backend.failures} consecutive failures — marking unhealthy.`
        );
        backend.healthy = false;
        backend.ready = false;
      }
    }
  }

  throw new Error("All healthy AI backends failed during this request.");
}