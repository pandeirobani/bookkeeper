from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from app.routers import books, purchases

app = FastAPI(title="BookKeeper API")
app.include_router(books.router)
app.include_router(purchases.router)


class HealthResponse(BaseModel):
    status: Literal["ok"]


@app.get("/api/health")
def health() -> HealthResponse:
    """フロントエンドとの疎通確認用"""
    return HealthResponse(status="ok")
