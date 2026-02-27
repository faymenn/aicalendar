from fastapi import status, APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import model, schema, util

router = APIRouter(prefix="/users", tags=["users"])    #this is used to create a router for the user endpoints


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schema.UserResponse)
def create_user(user: schema.UserCreate, db: Session = Depends(get_db)):
    hashed_password = util.hash_password(user.password)  #this is used to hash the password
    user.password = hashed_password #this is used to update the password with the hashed password
    new_user = model.User(**user.dict()) #this is used to create a new user
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.get("/{user_id}", response_model=schema.UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)): #this is used to get a user by id
    user = db.query(model.User).filter(model.User.id == user_id).first() 
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User with id {user_id} does not exist")
    return user