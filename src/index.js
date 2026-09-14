#!/usr/bin/env node
/**
 * Digiforma MCP Server
 * ---------------------
 * Exposes the Digiforma GraphQL API (https://app.digiforma.com/api/v1/graphql)
 * as a set of MCP tools, plus a generic passthrough query/mutation tool so an
 * agent can explore the full schema on its own via introspection.
 *
 * Auth: Digiforma uses a Bearer token generated from your account's API
 * settings page. Set it as DIGIFORMA_API_TOKEN in the environment.
 *
 * Docs: https://help.digiforma.com/fr/articles/11439399-graphql-l-api-digiforma
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const DIGIFORMA_ENDPOINT =
  process.env.DIGIFORMA_API_URL || "https://app.digiforma.com/api/v1/graphql";
const API_TOKEN = process.env.DIGIFORMA_API_TOKEN;

if (!API_TOKEN) {
  console.error(
    "[digiforma-mcp] WARNING: DIGIFORMA_API_TOKEN is not set. " +
      "Every call to the Digiforma API will fail until it is configured."
  );
}

/** Low-level GraphQL call against the Digiforma API. */
async function digiformaGraphQL(query, variables = {}) {
  if (!API_TOKEN) {
    throw new Error(
      "DIGIFORMA_API_TOKEN is not set. Generate a token from your Digiforma " +
        "account's API settings page and set it in the environment."
    );
  }

  const res = await fetch(DIGIFORMA_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `Digiforma API returned a non-JSON response (HTTP ${res.status}): ${text.slice(
        0,
        500
      )}`
    );
  }

  if (!res.ok) {
    throw new Error(
      `Digiforma API HTTP ${res.status}: ${JSON.stringify(json)}`
    );
  }

  if (json.errors) {
    throw new Error(
      `Digiforma GraphQL error(s): ${JSON.stringify(json.errors, null, 2)}`
    );
  }

  return json.data;
}

function textResult(value) {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err) {
  return {
    content: [{ type: "text", text: `Error: ${err.message || String(err)}` }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const tools = [
  {
    name: "digiforma_graphql",
    description:
      "Run an arbitrary GraphQL query or mutation against the Digiforma API. " +
      "Use this for anything not covered by the convenience tools below, or " +
      "to run introspection queries to discover the full schema " +
      "(e.g. `{ __schema { types { name } } }`).",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The GraphQL query or mutation document.",
        },
        variables: {
          type: "object",
          description: "Optional GraphQL variables object.",
        },
      },
      required: ["query"],
    },
    zodSchema: z.object({
      query: z.string(),
      variables: z.record(z.any()).optional(),
    }),
    handler: async ({ query, variables }) => {
      const data = await digiformaGraphQL(query, variables || {});
      return textResult(data);
    },
  },
  {
    name: "digiforma_introspect_schema",
    description:
      "Fetch the list of GraphQL type names exposed by the Digiforma API " +
      "(a lightweight introspection query). Useful to discover which objects " +
      "and fields are available before writing a custom digiforma_graphql query.",
    inputSchema: { type: "object", properties: {} },
    zodSchema: z.object({}),
    handler: async () => {
      const data = await digiformaGraphQL(
        `query IntrospectTypes {
          __schema {
            types {
              name
              kind
              description
            }
          }
        }`
      );
      const types = (data.__schema.types || []).filter(
        (t) => !t.name.startsWith("__")
      );
      return textResult(types);
    },
  },
  {
    name: "digiforma_list_trainees",
    description:
      "List trainees (learners/apprenants) registered in Digiforma, with " +
      "their basic contact info.",
    inputSchema: { type: "object", properties: {} },
    zodSchema: z.object({}),
    handler: async () => {
      const data = await digiformaGraphQL(
        `query ListTrainees {
          trainees {
            id
            firstname
            lastname
            email
            phone
          }
        }`
      );
      return textResult(data.trainees);
    },
  },
  {
    name: "digiforma_get_trainee",
    description:
      "Get a single trainee by id, including their training sessions.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The trainee's Digiforma id." },
      },
      required: ["id"],
    },
    zodSchema: z.object({ id: z.string() }),
    handler: async ({ id }) => {
      const data = await digiformaGraphQL(
        `query GetTrainee($id: ID!) {
          trainee(id: $id) {
            id
            firstname
            lastname
            email
            phone
            training_sessions {
              id
              name
            }
          }
        }`,
        { id }
      );
      return textResult(data.trainee);
    },
  },
  {
    name: "digiforma_list_training_sessions",
    description:
      "List training sessions (sessions de formation) configured in Digiforma.",
    inputSchema: { type: "object", properties: {} },
    zodSchema: z.object({}),
    handler: async () => {
      const data = await digiformaGraphQL(
        `query ListSessions {
          training_sessions {
            id
            name
          }
        }`
      );
      return textResult(data.training_sessions);
    },
  },
];

const toolsByName = Object.fromEntries(tools.map((t) => [t.name, t]));

// ---------------------------------------------------------------------------
// MCP server wiring
// ---------------------------------------------------------------------------

const server = new Server(
  { name: "digiforma-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = toolsByName[request.params.name];
  if (!tool) {
    return errorResult(new Error(`Unknown tool: ${request.params.name}`));
  }
  try {
    const args = tool.zodSchema.parse(request.params.arguments || {});
    return await tool.handler(args);
  } catch (err) {
    return errorResult(err);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[digiforma-mcp] Server running on stdio");
}

main().catch((err) => {
  console.error("[digiforma-mcp] Fatal error:", err);
  process.exit(1);
});
