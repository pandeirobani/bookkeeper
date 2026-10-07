from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="BookKeeper API")


class HealthResponse(BaseModel):
    status: Literal["ok"]


@app.get("/api/health")
def health() -> HealthResponse:
    """フロントエンドとの疎通確認用"""
    return HealthResponse(status="ok")
