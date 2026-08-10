from app import schema
import pytest

def test_get_all_tasks(authorized_client, test_task):
    res = authorized_client.get("/tasks/")
    def validate(task):
        return schema.TaskResponse(**task)
    tasks_map = list(map(validate, res.json()))
    tasks_list=list(tasks_map)
    assert len(tasks_list) == len(test_task)
    assert res.status_code == 200

def test_unauthorized_user_get_all_tasks(client, test_task):
    res = client.get("/tasks/")
    assert res.status_code == 401
    assert res.json().get("detail") == "Not authenticated"

@pytest.mark.parametrize("title", [
    ("Test Task 1"),
    ("Test Task 2"),
    ("Test Task 3"), ])
def test_create_task(authorized_client, test_user, title):
    res = authorized_client.post("/tasks/", json={"title": title})
    created_task = schema.TaskResponse(**res.json())
    assert res.status_code == 201
    assert created_task.title == title
    assert created_task.owner_id == test_user["id"]


def test_create_task_persists_after_list(authorized_client, test_user):
    create_res = authorized_client.post(
        "/tasks/",
        json={"title": "Persist me", "start_time": "2026-08-10T00:00:00"},
    )
    assert create_res.status_code == 201
    created_id = create_res.json()["id"]

    list_res = authorized_client.get("/tasks/?limit=300")
    assert list_res.status_code == 200
    ids = [task["id"] for task in list_res.json()]
    assert created_id in ids
    assert list_res.headers.get("cache-control", "").startswith("no-store")

def test_unauthorized_user_create_task(client, test_user):
    res = client.post("/tasks/", json={"title": "Test Task 1"})
    assert res.status_code == 401
    assert res.json().get("detail") == "Not authenticated"

def test_unauthorized_user_delete_task(client, test_task):
    res = client.delete(f"/tasks/{test_task[0].id}")
    assert res.status_code == 401
    assert res.json().get("detail") == "Not authenticated"

def test_delete_task(authorized_client, test_task, test_user):
    res = authorized_client.delete(f"/tasks/{test_task[0].id}")
    assert res.status_code == 204

def test_delete_task_not_exists(authorized_client, test_task, test_user):
    res = authorized_client.delete(f"/tasks/999999999999")
    assert res.status_code == 404


def test_update_task(authorized_client, test_task, test_user):
    res = authorized_client.put(f"/tasks/{test_task[0].id}", json={"title": "Updated Task"})
    updated_task = schema.TaskResponse(**res.json())
    assert res.status_code == 200
    assert updated_task.title == "Updated Task"

def test_unauthorized_user_update_task(client, test_task, test_user):
    res = client.put(f"/tasks/{test_task[0].id}", json={"title": "Updated Task"})
    assert res.status_code == 401

def test_update_task_not_exists(authorized_client, test_task, test_user):
    res = authorized_client.put(f"/tasks/999999999999", json={"title": "Updated Task"})
    assert res.status_code == 404
