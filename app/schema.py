from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

class TaskBase(BaseModel):
    id: int
    title: str
    description: str
    completed: bool
    start_time: datetime
    end_time: datetime
    location: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        orm_mode = True #this is used to convert the sqlalchemy model to a pydantic model

class TaskCreate(TaskBase):
    pass

class TaskResponse(TaskBase):
    title: str
    description: str
    completed: bool
    start_time: datetime
    end_time: datetime
    location: str

class UserBase(BaseModel):
    email: EmailStr
    password: str
    class Config:
        orm_mode = True #this is used to convert the sqlalchemy model to a pydantic model

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: int
    email: EmailStr
    
class UserLogin(BaseModel):
    email: EmailStr
    password: str

#schema for the JWT token

class TokenResponse(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    id: Optional[str] = None