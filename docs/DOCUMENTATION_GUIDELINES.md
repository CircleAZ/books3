# Documentation Guidelines (Wiki-Style)

## Core Philosophy
This documentation repository serves as the single source of truth for the AZ Books infrastructure. The absolute rule is: **A developer should never have to read the source code to understand the system's architecture, data flow, or failure states.** 

If a document says "refer to the code for details," the document is incomplete and unacceptable.

## Structural Hierarchy
The `docs/` folder is structured as a technical wiki. Every new file must be placed into the appropriate category.

### 1. `/architecture/`
Contains deep-dive explanations of specific modules, micro-systems, and integrations. 
- **Focus:** "How does this piece work, and what are its dependencies?"
- **Examples:** `FRONTEND_CATALOGUE.md`, `ORDER_DUPLICATE_PREVENTION.md`

### 2. `/deployment/` (or DevOps)
Contains infrastructure, CI/CD, and hosting configurations.
- **Focus:** "Where does this run, and how do we push changes?"
- **Examples:** `DEVOPS_HANDOFF_MANUAL.md`, Render/Cloudflare setups.

### 3. `/api_reference/`
Contains payload schemas, endpoint behaviors, and authentication methods.
- **Focus:** "How do external systems or frontends communicate with our backend?"

### 4. `/database/`
Contains data models, relationships, and migration strategies.
- **Focus:** "Where is this data stored, and what are the constraints?"

## Documentation Formatting Standards
1. **Title & Meta:** Every file must start with an `<h1>` Title and a brief 1-2 sentence summary of the module.
2. **Data Flow Definitions:** Explicitly state where data originates, how it is transformed, and where it terminates.
3. **Failure States:** Document what happens when the primary path fails (e.g., "If the API is down, the frontend loads the static fallback array").
4. **Environment Variables:** List all required `.env` variables for the module to function.
5. **No Code Dumps:** Do not paste 50 lines of code. Use architectural diagrams (Mermaid.js) or bullet points to explain the logic.

## Updating Rules
Documentation is treated as code. If a PR changes the architecture, the PR MUST include the corresponding documentation update. 
