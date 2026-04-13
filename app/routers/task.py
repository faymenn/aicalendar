from datetime import datetime

from fastapi import status, APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from ..database import get_db
from .. import model, schema
from ..routers.auth import get_current_user
from typing import List, Optional


router = APIRouter(prefix="/tasks", tags=["tasks"])    
#this is used to create a router for the task endpoints,
# prefix is used to create a prefix for the task endpoints
# tags is used to create a tag for the task endpoints which is used to group the task endpoints in the documentation


@router.get("/", response_model=List[schema.TaskResponse])
def get_all_tasks(db: Session = Depends(get_db), current_user: model.User = Depends(get_current_user), limit: int = 10, skip: int = 0, search: Optional[str] = ""): #get_tasks is a function that gets all the tasks from the database
    tasks = db.query(model.Task).filter(model.Task.owner_id == current_user.id).filter(model.Task.title.contains(search)).limit(limit).offset(skip).all()
    return tasks

#@app.get("/tasks/{task_id}")
#def get_task(task_id: int, db: Session = Depends(get_db)):
#    task = db.query(model.Task).filter(model.Task.id == task_id).first()
#    return {"task": task}

@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schema.TaskResponse)
def create_task(task: schema.TaskCreate, db: Session = Depends(get_db), current_user: model.User = Depends(get_current_user)):
    new_task = model.Task(**task.model_dump(), owner_id=current_user.id)  #**task.model_dump() is used to convert the task object to a dictionary
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task

@router.put("/{task_id}", response_model=schema.TaskResponse)
def update_task(task_id: int, task: schema.TaskCreate, db: Session = Depends(get_db), current_user: model.User = Depends(get_current_user)):
    task_query = db.query(model.Task).filter(model.Task.id == task_id)
    task_to_update = task_query.first()
    if task_to_update is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if task_to_update.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to update this task")
    update_data = task.model_dump(exclude_unset=True)
    update_data.pop("created_at", None)
    update_data["updated_at"] = datetime.now()
    task_query.update(update_data, synchronize_session=False)
    db.commit()
    task_to_update = db.query(model.Task).filter(model.Task.id == task_id).first()
    return task_to_update


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: Session = Depends(get_db), current_user: model.User = Depends(get_current_user)):
    task_query = db.query(model.Task).filter(model.Task.id == task_id)
    task = task_query.first()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Task with id {task_id} not found")
    if task.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to delete this task")
    task_query.delete(synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)