#importing the sqlalchemy library
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker   
from .util import settings

SQLALCHEMY_DATABASE_URL = f"postgresql://{settings.DATABASE_USER}:{settings.DATABASE_PASSWORD}@{settings.DATABASE_HOST}:{settings.DATABASE_PORT}/{settings.DATABASE_NAME}"

engine = create_engine(SQLALCHEMY_DATABASE_URL)  #engine is the object that will be used to interact with the database

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) #SessionLocal is the object that will be used to create a session to interact with the database

Base = declarative_base() #Base is the base class for all the models

def get_db(): #get_db is a function that talks to the database and closes the connection to the database
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()