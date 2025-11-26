# SB Agent Portal

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

SB Agent Portal is a powerful project designed to manage AI agents, enabling them to follow instructions, work with data using Retrieval-Augmented Generation (RAG), and perform actions through function calling.

## Project Overview

The SB Agent Portal provides a comprehensive suite of tools and services for creating, managing, and interacting with AI agents. These agents are capable of:

1. Following instructions via prompts
2. Working with data using RAG (Retrieval-Augmented Generation)
3. Performing actions through function calling
4. Conducting vector searches on content items

This system is built with a microservices architecture, utilizing TypeScript and modern JavaScript (ES6+) practices, with a preference for functional programming over object-oriented programming.

## Available Services

[... existing services content ...]

## Routes

[... existing routes content ...]

## Actions

[... existing actions content ...]

## Integrations

The SB Agent Portal integrates with various third-party services. The following integrations are supported:

1. OpenAI
2. Eleven Labs
3. Google
4. Twilio
5. JSONbin
6. GetImg
7. Perplexity
8. SendGrid
9. PhotoRoom
10. Telegram Bot
11. Linear
12. Code Indexer
13. JIRA
14. **Gmail** - Full Gmail API v1 integration for comprehensive email management
15. **IMAP** - Generic IMAP support for non-Gmail email providers

Each integration requires an API key, which can be managed through the Company settings. These integrations collectively enhance the capabilities of the AI agents, allowing them to perform a wide range of tasks across different domains and communication channels.

### Gmail Integration

The Gmail integration provides comprehensive email management capabilities through the Gmail API v1. It enables AI agents to:

- **Read and Search**: Fetch inbox, read emails, search with advanced Gmail query syntax
- **Send and Compose**: Send emails, reply, reply all, forward messages with HTML/plain text support
- **Organize**: Manage labels, archive, trash, delete, star emails
- **Drafts**: Create, update, send, and delete draft emails
- **Threads**: Access complete email threads and conversations
- **Attachments**: Download and handle email attachments
- **Batch Operations**: Perform operations on multiple emails simultaneously

The integration supports 32 different Gmail actions and includes full internationalization (English and Hebrew). To configure the Gmail integration, you need to set up OAuth 2.0 credentials in your Google Cloud Console and configure the following encrypted API keys in your Company settings:

- `google_client_id`: OAuth 2.0 Client ID
- `google_client_secret`: OAuth 2.0 Client Secret
- `google_refresh_token`: OAuth 2.0 Refresh Token

For detailed setup instructions, see the [Gmail Integration Guide](docs/gmail-integration-guide.md).

### IMAP Integration

The IMAP integration provides email access for generic email providers that support the IMAP protocol. This allows AI agents to work with email accounts from various providers (non-Gmail) including:

- Fetch and read emails from IMAP servers
- Support for SSL/TLS connections
- Configurable for various email providers

This integration is useful when Gmail API access is not available or when working with corporate email systems.

### Code Indexer Integration

The Code Indexer integration allows AI agents to scan, index, and interact with code repositories. It provides the following capabilities:

- Scan code projects and create summaries of code files
- Query relevant files based on task descriptions
- Retrieve and edit file contents

This integration is particularly useful for tasks involving code analysis, refactoring, and development assistance.

### JIRA Integration

The JIRA integration enables AI agents to interact with JIRA projects and tickets. It provides the following capabilities:

- Create new JIRA tickets with customizable fields
- Fetch tickets from specific JIRA projects
- Retrieve detailed information about individual tickets

To configure the JIRA integration, you need to set up the following API keys in your Company settings:

- `jira_api_token`: Your JIRA API token
- `jira_domain`: Your JIRA domain (e.g., 'your-company' for 'your-company.atlassian.net')
- `jira_email`: The email address associated with your JIRA account

You can obtain these credentials from your JIRA account settings and API tokens page.

### Vector Search Functionality

The SB Agent Portal now includes vector search capabilities for content items. This feature allows for more efficient and accurate searching based on semantic similarity. Key aspects of this functionality include:

- Generation of embeddings for content items using OpenAI's text-embedding-ada-002 model
- Storage of embeddings alongside content items in the database
- Ability to perform vector similarity searches on content items

### Teams Functionality

The SB Agent Portal includes a Teams feature that allows you to organize AI assistants into logical groups. Each team can have multiple assistants, and each assistant can belong to multiple teams. Key aspects of this functionality include:

- Creation and management of teams with name, description, and optional icon
- Assignment of assistants to one or more teams
- Filtering assistants by team membership
- Company-specific team management

For more detailed information about the Teams feature, please refer to the [Teams Feature Documentation](docs/teams-feature.md).

## Getting Started

To get started with the SB Agent Portal:

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up your environment variables (including OPENAI_API_KEY for vector search functionality)
4. Run the project: `npm start`
5. Set up the vector search index (see below)

### Setting up the Vector Search Index

To enable vector search functionality, you need to create a vector search index in your MongoDB Atlas database. Follow these steps:

1. Ensure your MongoDB Atlas cluster is running version 6.0 or later
2. Set the MONGODB_URI environment variable with your MongoDB connection string
3. Run the createSearchIndex script:

```bash
npm run create-search-index
```

This script will create the necessary index for vector searching on your content items collection.

### Configuring OpenAI API Key

To use the vector search functionality, you need to set up your OpenAI API key:

1. Obtain an API key from OpenAI (https://platform.openai.com/)
2. Set the OPENAI_API_KEY environment variable with your API key

```bash
export OPENAI_API_KEY=your_api_key_here
```

Ensure this environment variable is set in your production environment as well.

For more detailed instructions, please refer to our development documentation.

## Contributing

We welcome contributions to the SB Agent Portal! Here's how you can contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature-name`)
3. Make your changes
4. Add tests if applicable
5. Commit your changes (`git commit -am 'Add some feature'`)
6. Push to the branch (`git push origin feature/your-feature-name`)
7. Create a Pull Request

Please make sure to:
- Follow the existing code style
- Write clear commit messages
- Include tests for new functionality
- Update documentation as needed

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
