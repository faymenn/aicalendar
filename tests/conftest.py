from app.model import Task
from app.model import Task
from fastapi.testclient import TestClient
from app.main import app
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.util import settings
from app.database import get_db
from app.routers.auth import create_access_token
from app import model
import pytest



SQLALCHEMY_DATABASE_URL = f"postgresql://{settings.DATABASE_USER}:{settings.DATABASE_PASSWORD}@{settings.DATABASE_HOST}:{settings.DATABASE_PORT}/{settings.DATABASE_NAME}_test"

engine = create_engine(SQLALCHEMY_DATABASE_URL)  #engine is the object that will be used to interact with the database

TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) #SessionLocal is the object that will be used to create a session to interact with the database

@pytest.fixture()
def session():
    model.Base.metadata.drop_all(bind=engine) #drops all the tables in the database
    model.Base.metadata.create_all(bind=engine) #creates all the tables in the database
    db = TestSessionLocal() #creates a session to interact with the database
    try:
        yield db  
    finally:
        db.close()


@pytest.fixture
def client(session):
    def override_get_db():
        try:
            yield session
        finally:
            session.close()
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)


@pytest.fixture
def test_user(client):
    user_data = {"email": "test@example.com", "password": "password"}
    res = client.post("/users/", json=user_data)
    assert res.status_code == 201
    new_user = res.json()
    new_user["password"] = user_data["password"]
    return new_user

@pytest.fixture
def token(test_user):
    return create_access_token({"user_id": test_user["id"]}) #creates a JWT token for the test user

@pytest.fixture
def authorized_client(client, token):
    client.headers = {**client.headers, "Authorization": f"Bearer {token}"} #updates the headers with the token
    return client

@pytest.fixture
def test_task(test_user,session): #creates a test task for the test user
    #creates a dictionary of tasks with the title and the owner_id
    task_data = [{"title": "Test Task 1", "owner_id": test_user["id"] }, {"title": "Test Task 2", "owner_id": test_user["id"] }]
    
    def create_task_model(task):
        return model.Task(**task)
    tasks = list(map(create_task_model, task_data)) #creates a list of tasks
    session.add_all(tasks) #adds all the tasks to the database
    session.commit() #commits the changes to the database
    tasks = session.query(model.Task).all() #returns all the tasks in the database
    return tasks