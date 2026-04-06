from app import schema
from jose import jwt
from app.util import settings
import pytest


def test_create_user(client):
    res = client.post("/users/", json={"email": "test@example.com", "password": "password"})
    new_user = schema.UserResponse(**res.json()) #performs type validation on the response
    assert res.status_code == 201
    assert new_user.email == "test@example.com"

def test_login_user(client, test_user):
    res = client.post("/login/", data={"username": test_user["email"], "password": test_user["password"]})
    login_res = schema.TokenResponse(**res.json()) #performs type validation on the response
    payload = jwt.decode(login_res.access_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    id = payload.get("user_id")
    assert id == test_user["id"]
    assert login_res.token_type == "bearer"
    assert res.status_code == 200

@pytest.mark.parametrize("email, password, status_code", [
    ("wrong_email@example.com", "password", 401),
    ("test@example.com", "wrong_password", 401),
    ("wrong_email@example.com", "wrong_password", 401),
    ("test@example.com", None, 422),
    (None, "password", 422),
])
def test_invalid_login(client, email, password, status_code):
    res = client.post("/login/", data={"username": email, "password": password})
    assert res.status_code == status_code