from fastapi import APIRouter, status, HTTPException, Depends, Response
from sqlalchemy.orm import Session
from ..database import get_db
from .. import model, util, schema
from jose import JWTError, jwt
from ..util import settings
from datetime import datetime, timedelta
from fastapi.security.oauth2 import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from datetime import datetime, timedelta, timezone

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")
router = APIRouter(prefix="/login", tags=["auth"])


#settings for the JWT token
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

#function to create a JWT token
def create_access_token(data: dict):
    to_encode = data.copy() #copy the data
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire}) #update the data with the expiration time
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM) #encode the data
    return encoded_jwt

#function to verify the JWT token
def verify_token(token: str, credentials_exception):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        id: str = payload.get("user_id")
        if id is None:
            raise credentials_exception
        token_data = schema.TokenData(id=id) 
    except JWTError:
        raise credentials_exception
    return token_data

#get_current_user function is added as a dependency to the endpoints. 
# The user provides the token in the header of the request. The token is verified through the verify_token function.
# the verify_token inputs the token and the credentials_exception. It decodes the token based on the SECRET_KEY and ALGORITHM.
# It returns the user_id if the token is valid, otherwise it raises an exception.

@router.get("/me", status_code=status.HTTP_200_OK)
def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials", headers={"WWW-Authenticate": "Bearer"})
    return verify_token(token, credentials_exception)



#check if the user is authenticated and return a token
@router.post("/", status_code=status.HTTP_200_OK, response_model=schema.TokenResponse)
def login(user_credentials: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    #user_credentials is the username and password from the request

    user = db.query(model.User).filter(model.User.email == user_credentials.username).first() #checks if the user exists
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials") #if the user does not exist, raise an error
    if not util.verify_password(user_credentials.password, user.password): #checks if the password is correct
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials") #if the password is incorrect, raise an error
    access_token = create_access_token(data={"user_id": user.id}) #this is used to create a JWT token
    return {"access_token": access_token, "token_type": "bearer"} #returns the token and the type of token