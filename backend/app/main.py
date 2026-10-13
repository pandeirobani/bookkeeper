from typing import Literal

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.errors import http_exception_handler, request_validation_error_handler
from app.routers import (
    books,
    expenses,
    isbn_lookup,
    purchases,
    reading_records,
    tsundoku,
)

app = FastAPI(title="BookKeeper API")
app.add_exception_handler(RequestValidationError, request_validation_error_handler)
# FastAPIの HTTPException は Starlette のもののサブクラスなので、両方をここで扱う
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.include_router(books.router)
app.include_router(purchases.router)
app.include_router(reading_records.router)
app.include_router(isbn_lookup.router)
app.include_router(expenses.router)
app.include_router(tsundoku.router)


class HealthResponse(BaseModel):
    status: Literal["ok"]


@app.get("/api/health")
def health() -> HealthResponse:
    """フロントエンドとの疎通確認用"""
    return HealthResponse(status="ok")
