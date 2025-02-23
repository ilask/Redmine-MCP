const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const Redmine = require('node-redmine');
const z = require('zod');
require('dotenv').config();

const redmineHost = process.env.REDMINE_HOST;
const redmineApiKey = process.env.REDMINE_API_KEY;

if (!redmineHost || !redmineApiKey) {
    throw new Error('REDMINE_HOST and REDMINE_API_KEY environment variables must be set');
}

const redmine = new Redmine(redmineHost, { apiKey: redmineApiKey });

const isValidCreateIssueArgs = (
  args
) => typeof args === 'object' && args !== null && typeof args.project_id === 'string' && typeof args.subject === 'string' && typeof args.description === 'string';
  
class RedmineServer {
  server;

  constructor() {
    this.server = new Server(
      {
        name: 'redmine-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupResourceHandlers();
    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
      ],
    }));

    this.server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async () => ({
        resourceTemplates: [
          {
            uriTemplate: 'redmine://projects/{project_id}',
            name: 'Redmine Project',
            mimeType: 'application/json',
            description: 'Details of a Redmine project',
          },
        ],
      })
    );

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const match = request.params.uri.match(
          /^redmine:\/\/projects\/([^/]+)$/
        );
        if (!match) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Invalid URI format: ${request.params.uri}`
          );
        }
        const projectId = match[1];

        try {
          const project = await new Promise((resolve, reject) => {
            redmine.getProject(projectId, (err, data) => {
              if (err) {
                reject(err);
              } else {
                resolve(data);
              }
            });
          });

          return {
            contents: [
              {
                uri: request.params.uri,
                mimeType: 'application/json',
                text: JSON.stringify(project),
              },
            ],
          };
        } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Redmine API error: ${error}`
            );
        }
      }
    );
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_issue',
          description: 'Create a new Redmine issue',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project ID',
              },
              subject: {
                type: 'string',
                description: 'Issue subject',
              },
              description: {
                type: 'string',
                description: 'Issue description',
              },
            },
            required: ['project_id', 'subject', 'description'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'create_issue') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }

      if (!isValidCreateIssueArgs(request.params.arguments)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid create_issue arguments'
        );
      }

      const { project_id, subject, description } = request.params.arguments;

      try {
        const issue = await new Promise((resolve, reject) => {
            redmine.create_issue({
            project_id: project_id,
            subject: subject,
            description: description,
          }, (err, data) => {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          });
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(issue),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Redmine API error: ${error}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Redmine MCP server running on stdio');
  }
}

const server = new RedmineServer();
server.run().catch(console.error);
