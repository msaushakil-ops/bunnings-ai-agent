# \# Bunnings AI Agent


# An independent AI-agent portfolio project demonstrating a Node.js API integrated with a Google Colab-hosted AI backend.


# > \*\*Disclaimer:\*\* This is an independent demonstration project. It is not an official Bunnings product and is not affiliated with or endorsed by Bunnings.


# \## Project Overview


# The project connects a Node.js API to an AI backend running in Google Colab. It includes backend coordination, knowledge retrieval, PostgreSQL integration and resilience handling for backend chat requests.


# \## Technology Stack


# \- Node.js and JavaScript

# \- Google Colab and Python

# \- PostgreSQL

# \- ngrok for development connectivity

# \- AI model integration


# \## Repository Structure


# \- `src/` — API routes, agent logic and backend services

# \- `public/` — web interface

# \- `sql/` — database initialisation

# \- `docs/` — backend setup and integration notes

# \- `notebooks/` — Colab backend notebook

# \- `.env.example` — configuration template


# \## Colab Backend


# The Colab notebook is available at \[`notebooks/bunnings\_ai\_agent\_v4.ipynb`](notebooks/bunnings\_ai\_agent\_v4.ipynb).


# See \[`docs/colab-backend.md`](docs/colab-backend.md) for backend setup and configuration instructions.


# Configure runtime credentials through Colab Secrets. Keep local environment variables in `.env`, which must not be committed.


# \## Running the Project


# 1\. Install the supported version of Node.js.

# 2\. Install dependencies using `npm install`.

# 3\. Create a local `.env` file from `.env.example` and configure the required values.

# 4\. Configure and start the Colab backend as described in the documentation.

# 5\. Start the Node.js server using the appropriate script listed by `npm run`.

# 6\. Test the integration with non-sensitive demonstration data.


# The exact runtime configuration depends on the local environment and required backend services.



## Demonstration Video

Watch the project walkthrough:

[**▶ Watch the Bunnings AI Agent Demonstration**](https://github.com/msaushakil-ops/bunnings-ai-agent/releases/download/portfolio-demo-v1.0.0/AIAgentAtAGlance_01.mp4)

[View the full GitHub Release](https://github.com/msaushakil-ops/bunnings-ai-agent/releases/tag/portfolio-demo-v1.0.0)



# The project walkthrough video will be linked here after it has been uploaded to a GitHub Release.


# \## Security


# Never commit API keys, passwords, ngrok tokens or private customer data. A temporary ngrok URL is not a permanent production service. Review notebook outputs and configuration before sharing the project publicly.
