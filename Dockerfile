FROM python:3.11-slim #use the python:3.11-slim image

WORKDIR /app  #set the working directory to /app

COPY requirements.deploy.txt .  #copy the requirements.deploy.txt file to the working directory

RUN pip install --no-cache-dir --upgrade pip && \ #install the pip package
    pip install --no-cache-dir -r requirements.deploy.txt #install the requirements.deploy.txt file

COPY . . #copy the entire project to the working directory

EXPOSE 8000 #expose the port 8000

CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "app.main:app", "--bind", "0.0.0.0:8000"] #run the gunicorn server