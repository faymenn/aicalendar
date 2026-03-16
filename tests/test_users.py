from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app) #TestClient is a client that is used to test the API

def test_root():
    res = client.get("/")
    assert res.json().get("message") == "Hello World!!"
    assert res.status_code == 200