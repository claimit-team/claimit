"""ClaimIt assistant agent — hello-world entrypoint."""
from fastapi import FastAPI

app = FastAPI(
    title="ClaimIt assistant agent",
    version="0.1.0",
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe used by Cloud Run + smoke tests."""
    return {"status": "ok", "agent": "assistant"}


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "ClaimIt assistant agent is running"}
