from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from app.routers import books, purchases, reading_records

app = FastAPI(title="BookKeeper API")
app.include_router(books.router)
app.include_router(purchases.router)
app.include_router(reading_records.router)


class HealthResponse(BaseModel):
    status: Literal["ok"]


@app.get("/api/health")
def health() -> HealthResponse:
    """フロントエンドとの疎通確認用"""
    return HealthResponse(status="ok")
