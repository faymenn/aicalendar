#Contains utility functions for the application
from passlib.context import CryptContext
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_HOST: str
    DATABASE_PORT: int
    DATABASE_NAME: str
    DATABASE_USER: str
    DATABASE_PASSWORD: str
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    
    class Config:
        env_file = ".env"

settings = Settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto") #this is used to hash the password

def hash_password(password: str):
    return pwd_context.hash(password) #this is used to hash the password

def verify_password(password: str, hashed_password: str):
    return pwd_context.verify(password, hashed_password) #this is used to verify the password