Building an HTTP-based MCP server called "critic" — an LLM-powered devil's advocate agent meant to be consumed by a multi-agent
 platform. It chains prompts sequentially via LangChain, injecting each step's output into the next prompt. Deployed as a Docker
 container (HTTP transport maps cleanly to containers; other agents call http://critic:3000).

 The project has @biomejs/biome, jest, and langchain installed but no source code yet.
