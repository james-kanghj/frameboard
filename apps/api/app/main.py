from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health, prioritization
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


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "name": "Frameboard API",
        "version": "0.1.0",
        "docs": "/docs",
    }
