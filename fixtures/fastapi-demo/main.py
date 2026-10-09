from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Depends
from relay_backend import install_relay

app = FastAPI(title="Relay Demo API", version="0.1.0", description="A safe local fixture for your first Relay request.")
install_relay(app)
bearer = HTTPBearer()


class LoginRequest(BaseModel):
    email: str = Field(examples=["alex@example.com"])
    password: str = Field(examples=["demo123"], json_schema_extra={"format": "password"})


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@app.get("/api/health", tags=["System"], summary="Check API health")
def health():
    return {"ok": True}


@app.get("/api/users/{user_id}", tags=["Users"], summary="Get a user", responses={404: {"description": "User not found"}})
def get_user(user_id: int, include_email: bool = False):
    if user_id != 1:
        raise HTTPException(404, "User not found")
    user = {"id": 1, "name": "Alex"}
    if include_email:
        user["email"] = "alex@example.com"
    return user


@app.post("/api/auth/login", response_model=LoginResponse, tags=["Auth"], summary="Create a session",
          description="Exchange an email and password for an access token. Demo credentials: alex@example.com / demo123.",
          responses={401: {"description": "Invalid credentials"}})
def login(payload: LoginRequest):
    if payload.email != "alex@example.com" or payload.password != "demo123":
        raise HTTPException(401, "Invalid credentials")
    return {"access_token": "demo-token-not-real", "token_type": "bearer"}


@app.get("/api/auth/me", tags=["Auth"], summary="Get current session", description="A protected endpoint. Log in, use the returned access token, then call this route.")
def current_session(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if credentials.credentials != "demo-token-not-real":
        raise HTTPException(401, "Invalid or expired bearer token")
    return {"id": 1, "name": "Alex", "email": "alex@example.com", "authenticated": True}
