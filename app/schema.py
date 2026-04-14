from pydantic import BaseModel, ConfigDict, EmailStr
from datetime import datetime
from typing import Optional

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    completed: bool = False
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    location: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)
    deadline: Optional[datetime] = None
    completed_at: Optional[datetime] = None

class TaskCreate(TaskBase):
    created_at: datetime = datetime.now()
    updated_at: Optional[datetime] = None
    

class TaskResponse(TaskBase):
    id: int
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    

class UserBase(BaseModel):
    email: EmailStr
    model_config = ConfigDict(from_attributes=True)

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    
class UserLogin(BaseModel):
    email: EmailStr
    password: str

#schema for the JWT token

class TokenResponse(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    id: Optional[str] = None