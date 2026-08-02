"""
Surya OCR FastAPI Server (v0.22.1 compatible)
Accepts a single base64-encoded page image and returns structured OCR results.
Runs locally on Apple Silicon (MPS) — no API keys, no cloud, no cost.
"""

import base64
import os
import io
import logging
import re
import time

# ── Surya 0.22.x requires llama.cpp backend; disable guided grammar
# to avoid GBNF parse errors with the brew-installed llama-server.
os.environ.setdefault("SURYA_GUIDED_LAYOUT", "False")
os.environ.setdefault("SURYA_GUIDED_TABLE_REC", "False")

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
log = logging.getLogger("surya-server")

# ── FastAPI App ──────────────────────────────────────────
app = FastAPI(title="LearnIt Surya OCR Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Surya Models (loaded once at startup) ────────────────
recognition_predictor = None
layout_predictor = None


@app.on_event("startup")
async def load_models():
    """Load Surya models into memory once. Takes ~10s on first run (downloads weights)."""
    global recognition_predictor, layout_predictor

    log.info("Loading Surya models... (first run downloads ~2GB of weights)")
    start = time.time()

    from surya.recognition import RecognitionPredictor
    from surya.layout import LayoutPredictor

    layout_predictor = LayoutPredictor()
    recognition_predictor = RecognitionPredictor()

    elapsed = time.time() - start
    log.info(f"Surya models loaded in {elapsed:.1f}s")


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


def _extract_text_from_html(html_str: str) -> str:
    """Strip HTML tags from Surya's html field to get plain text."""
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', html_str)
    # Decode common HTML entities
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&')
    text = text.replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')
    return text.strip()


def _polygon_to_bbox(polygon: list) -> list:
    """Convert a list of [x, y] points to [x1, y1, x2, y2] bbox."""
    if not polygon:
        return [0, 0, 0, 0]
    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    return [min(xs), min(ys), max(xs), max(ys)]


# ── Endpoints ────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "models_loaded": recognition_predictor is not None,
    }


@app.post("/ocr", response_model=OcrResponse)
async def ocr(req: OcrRequest):
    """Process a single page image through Surya OCR."""
    start = time.time()

    # 1. Decode base64 image
    img_data = req.image
    if "," in img_data:
        img_data = img_data.split(",", 1)[1]  # strip data:image/...;base64, prefix

    image_bytes = base64.b64decode(img_data)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    page_width, page_height = image.size
    log.info(f"Processing image: {page_width}x{page_height}")

    # 2. Run layout detection
    log.info("Running layout detection...")
    layout_results = layout_predictor([image])
    layout = layout_results[0]
    log.info(f"Layout detection complete — {len(layout.bboxes)} bounding boxes")

    # 3. Run OCR recognition
    log.info("Running text recognition...")
    ocr_results = recognition_predictor([image], [layout])
    ocr_result = ocr_results[0]

    # 4. Build structured response
    blocks = []
    full_text_parts = []

    for block in ocr_result.blocks:
        # Surya 0.22.x: text is in the `html` field, bbox is in `polygon`
        block_type = getattr(block, "label", "Text") or "Text"
        block_html = getattr(block, "html", "") or ""
        block_text = _extract_text_from_html(block_html)

        # Get bbox from polygon (Surya 0.22.x uses polygon, not bbox)
        if hasattr(block, "polygon") and block.polygon:
            block_bbox = _polygon_to_bbox(block.polygon)
        elif hasattr(block, "_polygon") and block._polygon:
            block_bbox = _polygon_to_bbox(block._polygon)
        else:
            block_bbox = [0, 0, 0, 0]

        block_confidence = getattr(block, "confidence", 0.0) or 0.0

        if block_text.strip():
            blocks.append(OcrBlock(
                type=block_type,
                text=block_text,
                bbox=block_bbox,
                confidence=round(float(block_confidence), 3),
            ))
            full_text_parts.append(block_text)

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
