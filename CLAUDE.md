# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SB Agent Portal is a microservices-based AI agent management platform built with TypeScript/Node.js and Express. It enables AI agents to follow instructions, work with data using RAG (Retrieval-Augmented Generation), and perform actions through an extensible function calling system. The system supports multi-provider LLMs (OpenAI, Anthropic, Google), vector search, real-time communication via WebSocket, and third-party integrations.

**Repository:** https://github.com/singularitybridge/sb-api-services-v2

**Prerequisites:**
- Node.js v18 or higher
- MongoDB (MongoDB Atlas 6.0+ recommended for vector search)
- npm or yarn

## Core Architecture

### Service Layer
The architecture follows a functional programming paradigm with services organized by domain:

- **Assistant Services** (`src/services/assistant/`): Core agent execution logic
  - `stateless-execution.service.ts`: Stateless assistant execution with attachments, SSE streaming, and structured output support
  - `message-handling.service.ts`: Session-based message processing with function calling
  - `run-management.service.ts`: Managing assistant execution runs
  - `session-management.service.ts`: Session lifecycle management
  - `provider.service.ts`: Multi-provider LLM abstraction (OpenAI, Anthropic, Google)

- **Integration Services** (`src/integrations/`): Third-party service integrations including:
  - **AI/LLM**: OpenAI, Anthropic, Google, Perplexity, AI Agent Executor
  - **Communication**: Twilio, Telegram, SendGrid, Gmail, IMAP
  - **Project Management**: Linear, JIRA
  - **Media/Image**: Eleven Labs, Replicate, FluxImage, PhotoRoom
  - **Storage/Data**: MongoDB, JSONbin, GCP File Fetcher, Content File
  - **Development**: Code Indexer, Curl, Debug
  - **System**: Agenda (job scheduling), Journal, Inbox, Agent UI Framework

- **Content Services** (`src/services/content/`): Content management including vector embeddings and RAG

### Action System
The extensible function calling system allows assistants to execute actions dynamically:

- **Action Types** (`src/integrations/actions/types.ts`): Core interfaces including `ActionContext`, `FunctionDefinition`, `FunctionFactory`, `ActionType`
- **Action Loaders** (`src/integrations/actions/loaders.ts`): Dynamically loads available actions for an assistant based on allowed actions
- **Action Executors** (`src/integrations/actions/executors.ts`): Executes function calls with error handling
- **Action Factory** (`src/integrations/actions/factory.ts`): Creates function factories for integrations

Each integration follows a standardized pattern:
```
src/integrations/<integration_name>/
├── <integration_name>.service.ts    # Core business logic
├── <integration_name>.actions.ts    # Action definitions for function calling
├── integration.config.json          # Integration metadata
└── translations/                     # i18n translations
    ├── en.json
    └── he.json
```

### Data Models
MongoDB/Mongoose models in `src/models/`:

- **Assistant**: AI agent configuration with llmModel, llmProvider, llmPrompt, allowedActions, teams
- **Session**: Conversation sessions with message history
- **Message**: Individual messages in sessions
- **Company**: Multi-tenant company data with API keys
- **User**: User authentication and company association
- **ContentItem**: RAG content with vector embeddings
- **VectorStore**: Vector search configuration
- **Journal**: Memory/journal entries for assistants
- **Action**: Stored action definitions
- **Team**: Logical grouping of assistants

### Routes
Express routes in `src/routes/` mirror the service architecture with JWT authentication via `verifyTokenMiddleware` and company-specific access control via `verifyAccess()`.

### Key Services

- **Discovery Service** (`src/services/discovery.service.ts`): Registers and discovers available integrations/actions dynamically
- **Template Service** (`src/services/template.service.ts`): Processes prompt templates with variable substitution
- **API Key Service** (`src/services/api.key.service.ts`): Manages encrypted third-party API keys per company
- **WebSocket Service** (`src/services/websocket.ts`): Real-time bidirectional communication for UI updates
- **Agenda Service** (`src/integrations/agenda/`): Background job scheduling
- **Telegram Bot Service** (`src/services/telegram.bot.ts`): Multi-tenant Telegram bot management

## Development Commands

### Running the Application
```bash
npm install              # Install dependencies
npm start               # Start production server with ts-node
npm run dev             # Start development server with nodemon
npm run dev-public      # Start server with ngrok tunnel
npm run build           # Compile TypeScript to JavaScript
```

### Testing
```bash
npm test                # Run all tests (unit + e2e)
npm test -- <pattern>   # Run specific test file(s)
```

Test files location:
- Unit tests: `tests/unit/**/*.test.ts`
- E2E tests: `e2e-tests/tests/**/*.test.js`
- In-source tests: `src/**/*.test.ts`

Configuration: `jest.config.js`, `jest.setup.js`

### Code Quality
```bash
npm run lint            # Run ESLint with auto-fix
```

### Database Operations
```bash
npm run create-search-index        # Create MongoDB Atlas vector search index
npm run backfill-journal           # Backfill embeddings for journal entries
```

## Environment Setup

Copy `.env.example` to `.env` and configure:

**Required:**
- `MONGODB_URI`: MongoDB connection string (MongoDB Atlas 6.0+ for vector search)
- `MONGODB_DB_NAME`: Database name (defaults to 'dev')
- `OPENAI_API_KEY`: OpenAI API key for embeddings and LLM
- `JWT_SECRET`: Secret for JWT token signing

**Optional (based on integrations):**
- `PINECONE_API_KEY`, `PINECONE_ENVIRONMENT`, `PINECONE_INDEX`: Pinecone vector database
- `SENDGRID_API_KEY`: Email service
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`: SMS/Voice
- `TELEGRAM_BOT_TOKEN`: Telegram integration
- `GOOGLE_APPLICATION_CREDENTIALS`: Google Cloud services (TTS, STT, Storage)
- `LOG_LEVEL`, `LOG_FORMAT`: Winston logging configuration

## Adding New Integrations

Follow the guide in `docs/adding-new-integration-guide.md`:

1. Create directory: `src/integrations/<integration_name>/`
2. Create service file: `<integration_name>.service.ts` with core business logic
3. Create actions file: `<integration_name>.actions.ts` with function definitions using `FunctionFactory` pattern
4. Create `integration.config.json` with metadata (name, title, description, icon, requiredKeys)
5. Add translations in `translations/en.json` and `translations/he.json`
6. Let errors propagate - the executor handles error reporting consistently

Actions must follow the pattern:
```typescript
export const createYourActions = (context: ActionContext): FunctionFactory => ({
  actionName: {
    description: 'Action description',
    parameters: { /* JSON Schema */ },
    function: async (params) => { /* implementation */ }
  }
});
```

## Important Patterns

### Multi-provider LLM Support
Assistants can use OpenAI, Anthropic, or Google models via `assistant.llmProvider` and `assistant.llmModel`. The `getProvider()` function in `provider.service.ts` abstracts provider selection.

### Stateless vs Session-based Execution
- **Stateless** (`stateless-execution.service.ts`): Single request/response, no conversation history
- **Session-based** (`message-handling.service.ts`): Maintains conversation history in database

### Vector Search & RAG
Content items have embeddings generated via OpenAI's `text-embedding-ada-002` model. MongoDB Atlas vector search index must be created via `npm run create-search-index`.

### Server-Sent Events (SSE)
The `/assistant/user-input` endpoint supports SSE for streaming responses. Compression is skipped when `Accept: text/event-stream` header is present.

### Authentication & Multi-tenancy
- Routes use `verifyTokenMiddleware` for JWT authentication
- `verifyAccess()` middleware ensures users can only access their company's data
- Company-specific API keys are encrypted and stored per-company in the `Company` model

### WebSocket Integration
WebSocket server runs alongside HTTP server on the same port at `/realtime` path. Used for real-time UI updates during assistant execution. See `docs/websocket-integration.md`.

### Error Handling
Global error handler in `src/middleware/errorHandler.middleware.ts` catches all route errors. Integrations should throw errors and let them propagate.

## Deployment

The project uses Google Cloud Platform (GCP) for deployment with Google Cloud Run:

- **CI/CD:** Google Cloud Build (`cloudbuild.yaml`)
- **Deployment Region:** europe-north1
- **Container Registry:** Artifact Registry (europe-north1-docker.pkg.dev)
- **Notifications:** Slack webhook integration for build status
- **Deployment branches:** `main` (production), `dev` (development)

The deployment pipeline includes:
1. Docker image build (no-cache)
2. Push to Artifact Registry
3. Deploy to Cloud Run with managed service account
4. Slack notification on success/failure

## Contributing

This project follows functional programming patterns and TypeScript conventions. See `CONTRIBUTING.md` for full guidelines.

**Pull Request Workflow:**
1. Fork the repo and create a branch from `main`
2. Add tests for new code
3. Update documentation for API changes
4. Ensure `npm test` passes
5. Ensure `npm run lint` passes
6. Submit pull request

**Coding Standards:**
- Use TypeScript for all code
- Prefer functional programming over OOP
- Use async/await (not raw promises)
- Write clear, descriptive names
- Keep functions small and focused
- Add JSDoc comments for public APIs

## Documentation

Additional documentation in `docs/`:
- `adding-new-integration-guide.md`: Complete integration development guide
- `allowed-actions-feature.md`: Action permission system
- `assistant-prompt-templates.md`: Prompt templating
- `content-type-api.md`: Content type management
- `integration-api.md`: Integration API reference
- `integration-localization-guide.md`: i18n for integrations
- `memory-api-guide.md`: Memory/journal system
- `teams-feature.md`: Team organization for assistants
- `websocket-integration.md`: Real-time communication
- `SESSION_API_CHANGES_GUIDE.md`: Session API evolution

## Project Structure Summary

```
src/
├── index.ts                    # Application entry point
├── models/                     # Mongoose schemas
├── routes/                     # Express route handlers
├── services/                   # Business logic services
│   ├── assistant/              # Core assistant execution
│   └── ...                     # Other domain services
├── integrations/               # Third-party integrations
│   ├── actions/                # Action system core
│   └── <integration_name>/     # Individual integrations
├── middleware/                 # Express middleware (auth, errors)
├── utils/                      # Utility functions
└── types/                      # TypeScript type definitions
```
