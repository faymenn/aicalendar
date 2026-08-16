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
    pass
    

class TaskResponse(TaskBase):
    id: int
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

class LoopOutput(BaseModel):
    end_loop: bool
    assistant_message: str = ""
    tasks: list[TaskCreate]


class AITaskRequest(BaseModel):
    message: str
    thread_id: Optional[str] = None
    timezone: Optional[str] = None


class AITaskResponse(BaseModel):
    end_loop: bool
    assistant_message: str = ""
    thread_id: str
    proposed_tasks: list[TaskCreate] = []
    unlimited: bool = False
    limit: int = 3
    used: int = 0
    remaining: Optional[int] = None
    chat_limit: int = 10
    chat_used: int = 0
    chat_remaining: Optional[int] = None


class AIUsageStatus(BaseModel):
    unlimited: bool = False
    limit: int = 3
    used: int = 0
    remaining: Optional[int] = None
    chat_limit: int = 10
    chat_used: int = 0
    chat_remaining: Optional[int] = None
    enabled: bool = True


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