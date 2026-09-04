# LearnIt

LearnIt uses a SvelteKit frontend for the user interface, and a Python backend powering Chandra OCR for document processing. You need to run both to use the app.

## 1. Run the Chandra OCR Backend

The backend dynamically detects and runs on Apple Silicon (MPS) or Nvidia (CUDA) GPUs for fast inference.

Open a terminal tab and run:

```bash
cd chandra-server

# If it's your first time, create the environment and install dependencies:
# python3 -m venv venv
# source venv/bin/activate
# pip install -r requirements.txt
# pip install accelerate

# Start the virtual environment and the server
source venv/bin/activate
python server.py
```

*Note: The very first time you start the server on a new machine, it will download the 10.5 GB Chandra model. PyTorch will also take 1-3 minutes to compile the GPU shaders on its first scan.*

## 2. Run the SvelteKit Frontend

Once the Python server says `Uvicorn running on http://0.0.0.0:8010`, open a **second** terminal tab in the root project folder:

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser to view the app!
