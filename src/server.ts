import EventEmitter from "node:events"
import type { Server } from "node:http"
import { buildLogger } from "@asd14/node-utils/logger"
import { findFreePort } from "@asd14/node-utils/network"
import { icons } from "@asd14/node-utils/terminal"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import express from "express"
import type { Request, Response } from "express"

import type { AnyTool } from "./types.js"

const logger = buildLogger({
  namespace: "@sh41/mcp-utils/server",
  level: "info",
})

/**
 * Connection information for different MCP server transport types
 */
type McpServerConnectionInfo =
  | {
      transport: "http"
      host: string
      port: number
    }
  | {
      transport: "stdio"
    }

/**
 * Events emitted during MCP server lifecycle
 */
type McpServerEvents = {
  /** Emitted when server begins starting up */
  serverStarting: []
  /** Emitted when server startup fails */
  serverStartError: [error: Error]
  /** Emitted when server successfully starts and is ready to accept requests */
  serverReady: [connectionInfo: McpServerConnectionInfo, tools: AnyTool[]]
  /** Emitted when server begins shutting down */
  serverStopping: []
  /** Emitted when server has completely shut down */
  serverStopped: []
  /** Emitted when an HTTP request is received */
  requestReceived: [request: Request]
  /** Emitted when request processing fails */
  requestFailed: [request: Request, error: unknown]
  /** Emitted when request processing completes */
  requestCompleted: [request: Request, response: Response]
}

/**
 * Configuration options for building an MCP server
 */
type McpServerOptions = {
  /** Display name */
  name: string
  /** Semantic version */
  version: string
  /** Summary of the server capabilities */
  description?: string
  /** Optional initial tools to register with the server */
  tools?: AnyTool[]
  /**
   * Communication transport method
   * - "stdio": Standard input/output for direct process communication
   * - "http": HTTP server for web-based communication
   */
  transport: "stdio" | "http"
  /** Optional HTTP port number. If not provided, a free random port is assigned */
  port?: number
}

/**
 * MCP Server instance with lifecycle management
 */
type McpServerInstance = {
  /** Event emitter for server lifecycle events */
  events: EventEmitter<McpServerEvents>
  /** Register tools with the server (fluent API) */
  registerTools: (tools: AnyTool[]) => void
  /** Start the server */
  start: () => Promise<void>
  /** Stop the server gracefully */
  stop: () => Promise<void>
  /** Restart the server */
  restart: () => Promise<void>
  /** Check if server is running */
  isRunning: () => boolean
  /** Get server status information */
  getStatus: () => {
    running: boolean
    tools: AnyTool[]
    connectionInfo?: McpServerConnectionInfo
  }
}

/**
 * Creates a JSON-RPC 2.0 error response
 */
const createJsonRpcError = (code: number, message: string) => ({
  jsonrpc: "2.0" as const,
  error: { code, message },
  id: null,
})

/**
 * Handles HTTP requests that are not supported by the MCP endpoint
 */
const createUnsupportedMethodHandler =
  (method: string) => (_: Request, response: Response) => {
    logger.warn("Unsupported HTTP method", { path: "/mcp", method })
    response.status(405).json(createJsonRpcError(-32_000, "Method not allowed"))
  }

/**
 * Handles MCP JSON-RPC requests over HTTP
 */
const createMcpRequestHandler =
  (server: McpServer, eventEmitter: EventEmitter<McpServerEvents>) =>
  async (request: Request, response: Response) => {
    try {
      eventEmitter.emit("requestReceived", request)

      // NOTE: Create new transport instance per request to prevent ID collisions in stateless mode
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })

      response.on("close", () => {
        transport
          .close()
          .then(() => server.close())
          .catch((error: unknown) => {
            eventEmitter.emit("requestFailed", request, error)
          })
          .finally(() => {
            eventEmitter.emit("requestCompleted", request, response)
          })
      })

      await server.connect(transport)
      await transport.handleRequest(request, response, request.body)
    } catch (error) {
      eventEmitter.emit("requestFailed", request, error)

      if (!response.headersSent) {
        response
          .status(500)
          .json(createJsonRpcError(-32_603, "Internal server error"))
      }
    }
  }

const pushToolsToServer = (server: McpServer, tools: AnyTool[]) => {
  for (const tool of tools) {
    logger.info(`Registering tool${icons.ellipsis}`, { name: tool.name })

    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      },
      tool.handler
    )
  }
}

/**
 * Factory function for building an MCP server instance.
 */
const buildMCPServer = (options: McpServerOptions): McpServerInstance => {
  const { name, version, description, tools = [], transport, port } = options
  const events = new EventEmitter<McpServerEvents>()

  let mcpServer: McpServer | undefined
  let httpServer: Server | undefined
  let registeredTools: AnyTool[] = [...tools]
  let isServerRunning = false
  let connectionInfo: McpServerConnectionInfo | undefined

  const registerTools = (tools: AnyTool[]): void => {
    if (mcpServer) {
      pushToolsToServer(mcpServer, tools)
    }

    // Accumulate for after server is started
    registeredTools = [...registeredTools, ...tools]
  }

  const start = async (): Promise<void> => {
    if (isServerRunning) {
      logger.warn("Server is already running")
      return
    }

    events.emit("serverStarting")

    try {
      mcpServer = new McpServer({
        name,
        version,
        description: description || `${name} MCP server`,
      })

      pushToolsToServer(mcpServer, registeredTools)

      switch (transport) {
        case "stdio": {
          await mcpServer.connect(new StdioServerTransport())
          connectionInfo = { transport: "stdio" }
          isServerRunning = true
          events.emit("serverReady", connectionInfo, registeredTools)
          break
        }
        case "http": {
          const actualPort = port ?? (await findFreePort())
          const expressApp = express()

          expressApp.use(express.json())
          expressApp.post("/mcp", createMcpRequestHandler(mcpServer, events))
          expressApp.get("/mcp", createUnsupportedMethodHandler("GET"))
          expressApp.delete("/mcp", createUnsupportedMethodHandler("DELETE"))

          await new Promise<void>(resolve => {
            httpServer = expressApp.listen(actualPort, "localhost", () => {
              connectionInfo = {
                transport: "http",
                host: "localhost",
                port: actualPort,
              }
              isServerRunning = true
              events.emit("serverReady", connectionInfo, registeredTools)
              resolve()
            })
          })
          break
        }
      }
    } catch (error) {
      events.emit("serverStartError", error as Error)
      throw error
    }
  }

  const stop = async (): Promise<void> => {
    if (!isServerRunning) {
      logger.warn("Server is not running")
      return
    }

    events.emit("serverStopping")

    try {
      if (httpServer) {
        await new Promise<void>(resolve => {
          httpServer?.close(() => {
            resolve()
          })
        })
        httpServer = undefined
      }

      if (mcpServer) {
        await mcpServer.close()
        mcpServer = undefined
      }

      isServerRunning = false
      connectionInfo = undefined
      events.emit("serverStopped")
    } catch (error) {
      logger.error("Error stopping server", { error })
      throw error
    }
  }

  const restart = async (): Promise<void> => {
    await stop()
    await start()
  }

  const isRunning = (): boolean => isServerRunning

  const getStatus = () => ({
    running: isServerRunning,
    tools: [...registeredTools],
    connectionInfo,
  })

  return {
    events,
    registerTools,
    start,
    stop,
    restart,
    isRunning,
    getStatus,
  }
}

export { buildMCPServer }
export type {
  McpServerOptions,
  McpServerEvents,
  McpServerConnectionInfo,
  McpServerInstance,
}
