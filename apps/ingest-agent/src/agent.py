"""Stub Google ADK agent for the ingest service. MCP toolset disabled for deploy validation."""

from google.adk import Agent

ingest_agent = Agent(
    name="ingest_agent",
    model="gemini-2.5-flash",
    instruction=(
        "You are the ClaimIt Ingest Agent. Your job is to parse order confirmation "
        "emails from Gmail, extract purchase details (product name, price, order ID, "
        "platform, date), and store them in MongoDB. Respond with 'Hello from Ingest' "
        "for now."
    ),
    tools=[],
)
