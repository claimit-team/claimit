"""Shared pytest configuration for the assistant-agent test suite.

asyncio_mode = "auto" lives in pyproject.toml [tool.pytest.ini_options];
no fixtures are needed here today. This file exists so the directory is
a discoverable conftest root for future shared fixtures (e.g., a fake
SearchAdapter or a stubbed ADK Runner once integration tests land).
"""
