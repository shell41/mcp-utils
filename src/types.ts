import type { MaybePromise } from "@asd14/node-utils"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"

/**
 * Helper tool action handler type
 */
type ToolHandler<TInputSchema extends z.ZodRawShape> = (
  input: z.infer<z.ZodObject<TInputSchema>>
) => MaybePromise<CallToolResult>

/**
 * Tool that can be used by a model to perform specific actions
 */
type Tool<
  TInputSchema extends z.ZodRawShape,
  TOutputSchema extends z.ZodRawShape,
> = {
  /** Unique identifier for the tool */
  name: string
  /** Human-readable explanation of what the tool does */
  description: string
  /** Schema defining the expected input structure */
  inputSchema: TInputSchema
  /** Schema defining the expected output structure */
  outputSchema: TOutputSchema
  /** Function that executes the tool's functionality */
  handler: ToolHandler<TInputSchema>
}

/**
 * Type-erased version for events and arrays
 */
type AnyTool = {
  name: string
  description: string
  inputSchema: z.ZodRawShape
  outputSchema: z.ZodRawShape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (input: any) => MaybePromise<CallToolResult>
}

export type { Tool, AnyTool, ToolHandler }
