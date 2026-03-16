import express from 'express';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const {
  OPENAI_API_KEY,
  OPENAI_WORKFLOW_ID,
  PORT = '8080',
  OPENAI_BASE_URL = 'https://api.openai.com/v1',
  USER_PREFIX = 'mcp-inspector',
} = process.env;

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

if (!OPENAI_WORKFLOW_ID) {
  console.error('Missing OPENAI_WORKFLOW_ID');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '2mb' }));

const sessions = new Map();
const transports = new Map();

async function openAiFetch(path, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(`${OPENAI_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    const message = json?.error?.message || json?.message || text || `HTTP ${response.status}`;
    throw new Error(`OpenAI API error (${response.status}): ${message}`);
  }

  return json;
}

async function createChatKitSession({ user, stateVariables = {}, workflowVersion } = {}) {
  const payload = {
    user: user || `${USER_PREFIX}-${randomUUID()}`,
    workflow: {
      id: OPENAI_WORKFLOW_ID,
      ...(Object.keys(stateVariables).length > 0 ? { state_variables: stateVariables } : {}),
      ...(workflowVersion ? { version: workflowVersion } : {}),
    },
  };

  return openAiFetch('/chatkit/sessions', {
    method: 'POST',
    headers: {
      'OpenAI-Beta': 'chatkit_beta=v1',
    },
    body: payload,
  });
}

function buildServer() {
  const server = new McpServer({
    name: 'openai-workflow-mcp-bridge',
    version: '0.1.0',
  });

  server.tool(
    'health',
    'Basic health and configuration visibility.',
    {},
    async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ok: true,
              workflow_id: OPENAI_WORKFLOW_ID,
              base_url: OPENAI_BASE_URL,
              known_sessions: sessions.size,
              note:
                'This server can create ChatKit sessions from a published workflow ID. Direct programmatic message submission to the published workflow is not exposed here because the public docs we checked show workflow-ID deployment through ChatKit sessions, while chat sending is handled by ChatKit clients or by exporting workflow code for an advanced integration.',
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.tool(
    'start_workflow_session',
    'Creates a ChatKit session for the published workflow and stores it locally for later inspection.',
    {
      user: z.string().optional().describe('End-user identifier. If omitted, one is generated automatically.'),
      state_variables: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe('Optional workflow state variables.'),
      workflow_version: z.string().optional().describe('Optional published workflow version to pin.'),
    },
    async ({ user, state_variables, workflow_version }) => {
      const session = await createChatKitSession({
        user,
        stateVariables: state_variables,
        workflowVersion: workflow_version,
      });

      const localSessionId = randomUUID();
      sessions.set(localSessionId, {
        created_at: new Date().toISOString(),
        local_session_id: localSessionId,
        openai_session_id: session.id,
        openai_user: user || session.user || null,
        workflow_id: OPENAI_WORKFLOW_ID,
        expires_at: session.expires_at,
        client_secret_present: Boolean(session.client_secret),
        max_requests_per_1_minute: session.max_requests_per_1_minute ?? null,
        raw: session,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                local_session_id: localSessionId,
                openai_session_id: session.id,
                expires_at: session.expires_at,
                max_requests_per_1_minute: session.max_requests_per_1_minute ?? null,
                note:
                  'Session created successfully. This proves the workflow ID is valid and reachable via ChatKit session creation.',
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'list_local_sessions',
    'Lists local session records created through this MCP bridge.',
    {},
    async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(Array.from(sessions.values()), null, 2),
        },
      ],
    }),
  );

  server.tool(
    'cancel_workflow_session',
    'Cancels an existing ChatKit session created earlier by this bridge.',
    {
      local_session_id: z.string().describe('Local session ID returned by start_workflow_session.'),
    },
    async ({ local_session_id }) => {
      const entry = sessions.get(local_session_id);
      if (!entry) {
        throw new Error(`Unknown local_session_id: ${local_session_id}`);
      }

      const result = await openAiFetch(`/chatkit/sessions/${entry.openai_session_id}/cancel`, {
        method: 'POST',
        headers: {
          'OpenAI-Beta': 'chatkit_beta=v1',
        },
      });

      entry.cancelled_at = new Date().toISOString();
      entry.cancel_result = result;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                local_session_id,
                openai_session_id: entry.openai_session_id,
                cancelled: true,
                result,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'send_message_to_workflow',
    'Explains the current limitation of workflow-ID-only programmatic messaging and what to do next.',
    {
      local_session_id: z.string().optional(),
      message: z.string().describe('The message you wanted to send.'),
    },
    async ({ local_session_id, message }) => {
      const entry = local_session_id ? sessions.get(local_session_id) : null;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                attempted_message: message,
                local_session_id: local_session_id || null,
                openai_session_id: entry?.openai_session_id || null,
                status: 'not_executed',
                reason:
                  'With only OPENAI_API_KEY + published workflow ID, the documented path we found is ChatKit session creation. The docs we checked do not expose a simple server-side endpoint for posting a text message directly into the published workflow the way ChatKit clients do. For a real programmatic bridge, export the workflow code from Agent Builder and wire that exported Agents SDK code into this MCP tool, or put a thin custom backend in front of ChatKit.',
                next_steps: [
                  'Use start_workflow_session to validate the workflow ID and create a session.',
                  'Export the workflow code from Agent Builder (Code > Advanced integration).',
                  'Replace this tool implementation with a call into the exported workflow runtime.',
                ],
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
}

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, workflow_id: OPENAI_WORKFLOW_ID, sessions: sessions.size });
});

app.all('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  let transport;

  if (sessionId && transports.has(sessionId)) {
    transport = transports.get(sessionId);
  } else {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        transports.set(newSessionId, transport);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
      }
    };

    const server = buildServer();
    await server.connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`openai-workflow-mcp-bridge listening on :${PORT}`);
});
