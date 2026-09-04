"""
Chandra OCR FastAPI Server
Accepts a single base64-encoded page image and returns structured OCR results.
Runs locally on Apple Silicon (MPS) — no API keys, no cloud, no cost.
"""

import base64
import io
import logging
import time
import os

# Enable GPU acceleration on Apple Silicon
os.environ["TORCH_DEVICE"] = "mps"

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

# ── Logging ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("chandra-server")

# ── FastAPI App ──────────────────────────────────────────
app = FastAPI(title="LearnIt Chandra OCR Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Chandra Model (loaded once at startup) ───────────────
inference_manager = None


@app.on_event("startup")
async def load_models():
    """Load Chandra OCR model into memory once. Takes ~10s on first run (downloads weights)."""
    global inference_manager

    log.info("Loading Chandra OCR model (HuggingFace local)... (first run downloads weights)")
    start = time.time()

    from chandra.model import InferenceManager

    inference_manager = InferenceManager(method="hf")

    elapsed = time.time() - start
    log.info(f"Chandra OCR model loaded in {elapsed:.1f}s")


# ── Request / Response Models ────────────────────────────
class OcrRequest(BaseModel):
    image: str  # base64-encoded image (with or without data URI prefix)


class OcrBlock(BaseModel):
    type: str       # "Text", "SectionHeader", "Table", "Picture", etc.
    text: str
    bbox: list      # [x1, y1, x2, y2]
    confidence: float


class OcrResponse(BaseModel):
    blocks: list[OcrBlock]
    full_text: str
    page_width: int
    page_height: int
    processing_time_ms: int


def _strip_html_tags(html_str: str) -> str:
    """Strip HTML tags from a chunk's content to get plain text."""
    import re
    text = re.sub(r'<[^>]+>', '', html_str)
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&')
    text = text.replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')
    return text.strip()


# ── Endpoints ────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "models_loaded": inference_manager is not None,
    }


@app.post("/ocr", response_model=OcrResponse)
async def ocr(req: OcrRequest):
    """Process a single page image through Chandra OCR."""
    start = time.time()

    # 1. Decode base64 image
    img_data = req.image
    if "," in img_data:
        img_data = img_data.split(",", 1)[1]  # strip data:image/...;base64, prefix

    image_bytes = base64.b64decode(img_data)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    page_width, page_height = image.size
    log.info(f"Processing image: {page_width}x{page_height}")

    # 2. Run Chandra OCR
    log.info("Running Chandra OCR inference...")

    from chandra.model.schema import BatchInputItem

    batch = [BatchInputItem(image=image, prompt_type="ocr_layout")]
    results = inference_manager.generate(batch)
    result = results[0]

    markdown_len = len(result.markdown) if result.markdown else 0
    chunks_len = len(result.chunks) if result.chunks else 0
    log.info(f"Chandra OCR raw result — markdown length: {markdown_len}, chunks: {chunks_len}, error: {result.error}")

    # 3. Build structured response from chunks
    #    Chandra chunks have: { bbox: [x1,y1,x2,y2], label: str, content: str (HTML) }
    blocks = []
    full_text_parts = []

    safe_chunks = result.chunks if result.chunks else []
    for chunk in safe_chunks:
        label = chunk.get("label", "Text") or "Text"
        content_html = chunk.get("content", "") or ""
        bbox = chunk.get("bbox", [0, 0, 0, 0]) or [0, 0, 0, 0]

        # Extract plain text from HTML content
        plain_text = _strip_html_tags(content_html)

        if plain_text.strip():
            blocks.append(OcrBlock(
                type=label,
                text=plain_text,
                bbox=list(bbox),
                confidence=0.95 if not result.error else 0.5,
            ))
            full_text_parts.append(plain_text)

    safe_markdown = result.markdown.strip() if result.markdown else ""
    if not blocks and safe_markdown:
        blocks.append(OcrBlock(
            type="Text",
            text=safe_markdown,
            bbox=[0, 0, page_width, page_height],
            confidence=0.9,
        ))
        full_text_parts.append(safe_markdown)

    elapsed_ms = int((time.time() - start) * 1000)
    log.info(f"OCR complete: {len(blocks)} blocks, {elapsed_ms}ms, {len(full_text_parts)} text parts")

    return OcrResponse(
        blocks=blocks,
        full_text="\n\n".join(full_text_parts),
        page_width=page_width,
        page_height=page_height,
        processing_time_ms=elapsed_ms,
    )


# ── Run ──────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)
