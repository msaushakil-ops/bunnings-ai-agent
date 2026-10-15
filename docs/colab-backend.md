# Colab Backend (v4.0.0)

Deployed in Colab and tunnelled via ngrok. This is the backend identified
as `COLAB` in `colabPool.js`.

## Why v4 over v2.7

| Concern | v2.7 | v4.0.0 |
|---|---|---|
| `/health` fields | `engine: "Hybrid RAG v2.7"` | `backend_id`, `ready_for_chat`, `contract_version` |
| `/api/chat` body | only `Query` | `Query` + `Evidence` + `ContractVersion` + `RequestId` |
| Embedded orders | 20-row `PURCHASE_RECORDS` (shadowed Postgres) | none — Postgres is single source of truth |
| BM25 on code queries | always ran (pulled `pol_001, prd_101, prd_103` noise) | short-circuits on `CODE_RE` |
| Prompt rules | 9 | 12 (adds 3 code-matching rules) |
| Logging | none | prints `[requestId] evidence_customers=N ...` |

## Setup

1. Open the notebook in Colab
2. Ensure `NGROK_TOKEN` and `GEMINI_API_KEY` are toggled ON in 🔑 Secrets
3. Paste the script below into the only cell
4. Run the cell
5. Copy the ngrok URL into `.env` as `COLAB_URL`
6. `BACKEND_ID` must equal the `id` field in `colabPool.js`

## Script

```python
## Notebook

The Colab backend implementation is maintained in
[`notebooks/bunnings_ai_agent_v4.ipynb`](../notebooks/bunnings_ai_agent_v4.ipynb).

Open the notebook in Google Colab. Configure `NGROK_TOKEN` and
`GEMINI_API_KEY` in Colab Secrets and enable access to those secrets
before running the notebook.

Never commit credentials, private customer data or sensitive outputs.

Configure `COLAB_URL` in your local `.env` file with the backend URL.
Do not commit `.env`.

`BACKEND_ID` must match the `id` configured for `COLAB` in
`src/services/colabPool.js`.

Verify the v4 API contract and test the Node.js-to-Colab integration
before using the backend in a demonstration.

```
