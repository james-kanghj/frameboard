import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health, items, prioritization, workspaces
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup hooks (DB pool warmup, etc.) go here
    yield
    # Shutdown hooks


app = FastAPI(
    title="Frameboard API",
    version="0.1.0",
    description="Backend API for Frameboard — prioritization workspace for product teams.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(prioritization.router, prefix="/v1", tags=["prioritization"])
app.include_router(workspaces.router, prefix="/v1", tags=["workspaces"])
app.include_router(items.router, prefix="/v1", tags=["items"])

# Test-only routes — gated behind an env var so they can never be mounted
# accidentally in production. The e2e suite sets FRAMEBOARD_TEST_MODE=1
# when starting uvicorn; otherwise the /v1/_test/* routes return 404.
if os.environ.get("FRAMEBOARD_TEST_MODE") == "1":
    from app.api import test_utils

    app.include_router(test_utils.router, prefix="/v1", tags=["test-only"])


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "name": "Frameboard API",
        "version": "0.1.0",
        "docs": "/docs",
    }
