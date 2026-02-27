from fastapi import FastAPI
from .database import engine
from . import model
from .routers import task, user, auth
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()  # creating a fastapi instance

origins = ["https://www.google.com", "https://www.youtube.com"] #list of origins that are allowed to access the API

app.add_middleware(        #Middleware acts as a middleman for the requests and responses
    CORSMiddleware,
    allow_origins=origins,  #list of origins that are allowed to access the API
    allow_credentials=True,  #allow credentials to be sent
    allow_methods=["*"],  #list of methods that are allowed to be used
    allow_headers=["*"],  #list of headers that are allowed to be used
)

model.Base.metadata.create_all(bind=engine) #creates all the tables in the model file


app.include_router(task.router)
app.include_router(user.router)
app.include_router(auth.router)


@app.get("/")
def root():
    return {"message": "Hello World!!"}



