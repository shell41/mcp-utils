# `@sh41/mcp-utils` package decisions

Rules for using this file:

1. Decisions are sorted chronologically, newest at the top
2. Each decision should contain the following:
   - `Title` + `Description`
   - Labeled fields: `Date`, `Problem`, `Solution`
   - Optional: `References`, `Note`
3. Reverting or changing a decision should be documented as a new decision

<!-- vim-markdown-toc GFM -->

- [1. Downgrade Zod to v3.23.8 for MCP SDK compatibility](#1-downgrade-zod-to-v3238-for-mcp-sdk-compatibility)

<!-- vim-markdown-toc -->

## 1. Downgrade Zod to v3.23.8 for MCP SDK compatibility

**Date**: 8th of September, 2025

Downgraded Zod from `^4.1.3` to `^3.23.8` to match the MCP SDK's peer
dependency.

**Problem**: MCP SDK's `registerTool()` method had type incompatibilities with
Zod v4, causing TypeScript errors and empty schemas in mcp-inspect tool forms.

**Solution**: Align with MCP SDK's Zod version requirement.

```json
// package.json change
{
  "dependencies": {
-   "zod": "^4.1.3"
+   "zod": "^3.23.8"
  }
}
```

**References**:

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

**Note**: Monitor MCP SDK for Zod v4 support to re-upgrade when available.
