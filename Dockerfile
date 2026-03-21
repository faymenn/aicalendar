FROM python:3.11-slim #use the python:3.11-slim image

WORKDIR /app  
#set the working directory to /app

COPY requirements.deploy.txt .  
#copy the requirements.deploy.txt file to the working directory

#install the pip package and the requirements.deploy.txt file
RUN pip install --no-cache-dir --upgrade pip && \ 
            pip install --no-cache-dir -r requirements.deploy.txt 
#copy the entire project to the working directory
COPY . . 

#expose the port 8000
EXPOSE 8000 

CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "app.main:app", "--bind", "0.0.0.0:8000"] #run the gunicorn server