# Use official PyTorch image with CUDA support (perfect for RunPod/Serverless GPUs)
FROM pytorch/pytorch:2.3.0-cuda12.1-cudnn8-runtime

WORKDIR /app

# Install system dependencies if any are needed
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Copy requirements or directly install dependencies
COPY requirements.txt .

# Upgrade pip and install requirements
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt



# Pre-download the model at build time so it doesn't download on every cold start
# We run a small python snippet to trigger the HuggingFace cache
RUN python -c "from chandra.model import InferenceManager; InferenceManager(method='hf')" || echo "Model download cached"

# Copy the server code
COPY server.py .

# Expose the FastAPI port
EXPOSE 8010

# Command to run the FastAPI server via Uvicorn
CMD ["python", "server.py"]
