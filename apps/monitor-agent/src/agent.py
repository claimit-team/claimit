"""Stub Google ADK agent for the monitor service. MCP toolset disabled for deploy validation."""

from google.adk import Agent

monitor_agent = Agent(
    name="monitor_agent",
    model="gemini-2.5-flash",
    instruction=(
        "You are the ClaimIt Monitor Agent. Your job is to periodically check current "
        "prices for tracked purchases using ScraperAPI, Keepa, and Amadeus. When a "
        "price drops below the user's purchase price, trigger a claim. Respond with "
        "'Hello from Monitor' for now."
    ),
    tools=[],
)
