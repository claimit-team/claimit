"""Stub Google ADK agent for the claim service. MCP toolset disabled for deploy validation."""

from google.adk import Agent

claim_agent = Agent(
    name="claim_agent",
    model="gemini-2.5-flash",
    instruction=(
        "You are the ClaimIt Claim Agent. Your job is to generate price-match or "
        "refund request emails based on price drops and retailer policies. Use the "
        "retailer's specific policy language and format. Respond with 'Hello from "
        "Claim' for now."
    ),
    tools=[],
)
