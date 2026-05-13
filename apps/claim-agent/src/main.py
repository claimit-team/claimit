"""ClaimIt claim agent — hello-world entrypoint."""

from fastapi import FastAPI

app = FastAPI(
    title="ClaimIt claim agent",
    version="0.1.0",
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe used by Cloud Run + smoke tests."""
    return {"status": "ok", "agent": "claim"}


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "ClaimIt claim agent is running"}
