from fastapi import status, APIRouter, Depends, HTTPException, APIRouter
from sqlalchemy.orm import Session
from ..database import get_db
from .. import model, schema
from ..routers.auth import oauth2_scheme
from typing import List, Optional


router = APIRouter(prefix="/tasks", tags=["tasks"])    
#this is used to create a router for the task endpoints,
# prefix is used to create a prefix for the task endpoints
# tags is used to create a tag for the task endpoints which is used to group the task endpoints in the documentation


@router.get("/", response_model=List[schema.TaskResponse])
def get_all_tasks(db: Session = Depends(get_db), userid: int = Depends(oauth2_scheme),limit: int = 10, skip: int = 0, search: Optional[str] = ""): #get_tasks is a function that gets all the tasks from the database
    tasks = db.query(model.Task).filter(model.Task.owner_id == userid).filter(model.Task.title.contains(search)).limit(limit).offset(skip).all()
    return tasks

#@app.get("/tasks/{task_id}")
#def get_task(task_id: int, db: Session = Depends(get_db)):
#    task = db.query(model.Task).filter(model.Task.id == task_id).first()
#    return {"task": task}

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_task(task: schema.TaskCreate, db: Session = Depends(get_db), user_id: int = Depends(oauth2_scheme)):
    new_task = model.Task(**task.dict())  #**task.dict() is used to convert the task object to a dictionary
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task

@router.put("/{task_id}")
def update_task(task_id: int, task: schema.TaskCreate, db: Session = Depends(get_db), user_id: int = Depends(oauth2_scheme)):
    task_to_update = db.query(model.Task).filter(model.Task.id == task_id).first()
    if task_to_update is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if task_to_update.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to update this task")
    task_to_update.update(**task.dict(), synchronize_session=False)
    db.commit()
    db.refresh(task_to_update)
    return task_to_update


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: Session = Depends(get_db), user_id: int = Depends(oauth2_scheme)):
    task = db.query(model.Task).filter(model.Task.id == task_id).first()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Task with id {task_id} not found")
    if task.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to delete this task")
    task.delete(synchronize_session=False)
    db.commit()
    return {"message": "Task deleted successfully"}