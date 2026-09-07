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
import torch

# Dynamically select the best available GPU (Nvidia CUDA or Apple MPS)
if torch.cuda.is_available():
    os.environ["TORCH_DEVICE"] = "cuda"
elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
    os.environ["TORCH_DEVICE"] = "mps"
    os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"
else:
    os.environ["TORCH_DEVICE"] = "cpu"

# Explicitly update chandra settings just in case it was imported early
try:
    from chandra.settings import settings
    settings.TORCH_DEVICE = os.environ["TORCH_DEVICE"]
except ImportError:
    pass
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


class MlxInferenceManager:
    def __init__(self, model_id="jwindle47/chandra-ocr-2-8bit-mlx"):
        from mlx_vlm import load
        self.model, self.processor = load(model_id)

    def generate(self, batch):
        from mlx_vlm import generate
        from chandra.output import parse_chunks, parse_markdown, extract_images
        from chandra.prompts import PROMPT_MAPPING
        from chandra.model.schema import BatchOutputItem
        
        output = []
        for item in batch:
            text_prompt = item.prompt if getattr(item, "prompt", None) else PROMPT_MAPPING.get(item.prompt_type, "Convert this image to markdown.")
            messages = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": text_prompt}]}]
            
            # The default MLX chat template incorrectly injects <think> tags, which breaks the Qwen2-VL model's stopping criteria
            formatted_prompt = self.processor.apply_chat_template(messages, add_generation_prompt=False)
            formatted_prompt += "<|im_start|>assistant\n"
            
            from chandra.model.util import scale_to_fit
            scaled_image = scale_to_fit(item.image)
            
            result = generate(
                model=self.model,
                processor=self.processor,
                image=[scaled_image],
                prompt=formatted_prompt,
                max_tokens=4096,
                # Add these sampler parameters:
                repetition_penalty=1.15,
                repetition_context_size=64,
                verbose=True,
                eos_tokens=[self.processor.tokenizer.eos_token_id]
            )
            raw_text = result.text
            
            # 8-bit models sometimes hallucinate past the end token, so we forcefully clip it
            if "<|im_end|>" in raw_text:
                raw_text = raw_text.split("<|im_end|>")[0]
            
            chunks = parse_chunks(raw_text, item.image, bbox_scale=1000)
            
            output.append(BatchOutputItem(
                markdown=parse_markdown(raw_text),
                html="",
                chunks=chunks,
                raw=raw_text,
                page_box=[0, 0, item.image.width, item.image.height],
                token_count=len(raw_text) // 4,
                images=extract_images(raw_text, chunks, item.image),
                error=False
            ))
        return output


@app.on_event("startup")
async def load_models():
    """Load Chandra OCR model into memory once. Takes ~10s on first run (downloads weights)."""
    global inference_manager
    start = time.time()

    use_mlx = False
    if os.environ.get("TORCH_DEVICE") == "mps":
        try:
            import mlx_vlm
            use_mlx = True
        except ImportError:
            log.warning("Apple Silicon detected, but mlx-vlm is not installed. Falling back to PyTorch/HF. Run `pip install mlx-vlm` to speed up!")

    if use_mlx:
        log.info("Loading Chandra OCR model (MLX Native)...")
        inference_manager = MlxInferenceManager()
    else:
        log.info("Loading Chandra OCR model (HuggingFace local)... (first run downloads weights)")
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


class OcrBatchRequest(BaseModel):
    images: list[str]


class OcrBatchResponse(BaseModel):
    responses: list[OcrResponse]
    total_processing_time_ms: int


def _strip_html_tags(html_str: str) -> str:
    """Strip HTML tags from a chunk's content to get plain text."""
    import re
    # Replace HTML tags with a space so words don't get mashed together
    text = re.sub(r'<[^>]+>', ' ', html_str)
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&')
    text = text.replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')
    # Collapse multiple spaces into one
    text = re.sub(r'\s+', ' ', text)
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

    # LOGGING RAW OUTPUT FOR DIAGNOSTICS
    log.info(f"=== RAW CHANDRA OUTPUT FOR SINGLE PAGE ===")
    log.info(f"MARKDOWN: {result.markdown}")
    log.info(f"CHUNKS: {result.chunks}")
    log.info(f"========================================")

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

        is_image = label.lower() in ("picture", "image", "figure")
        if plain_text.strip() or is_image:
            blocks.append(OcrBlock(
                type=label,
                text=plain_text if plain_text.strip() else f"[{label}]",
                bbox=list(bbox),
                confidence=0.95 if not result.error else 0.5,
            ))
            full_text_parts.append(plain_text if plain_text.strip() else f"[{label}]")

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


@app.post("/ocr-batch", response_model=OcrBatchResponse)
async def ocr_batch(req: OcrBatchRequest):
    """Process multiple page images through Chandra OCR as a batch."""
    start = time.time()

    from chandra.model.schema import BatchInputItem

    batch = []
    page_dimensions = []

    # 1. Decode base64 images
    for img_data in req.images:
        if "," in img_data:
            img_data = img_data.split(",", 1)[1]

        image_bytes = base64.b64decode(img_data)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        page_dimensions.append(image.size)
        batch.append(BatchInputItem(image=image, prompt_type="ocr_layout"))

    log.info(f"Running Chandra OCR inference on batch of {len(batch)} images...")

    # 2. Run inference in parallel
    results = inference_manager.generate(batch)

    responses = []
    for i, result in enumerate(results):
        page_width, page_height = page_dimensions[i]
        blocks = []
        full_text_parts = []
        
        # LOGGING RAW OUTPUT FOR DIAGNOSTICS
        log.info(f"=== RAW CHANDRA OUTPUT FOR PAGE {i+1} ===")
        log.info(f"MARKDOWN: {result.markdown}")
        log.info(f"CHUNKS: {result.chunks}")
        log.info(f"========================================")

        safe_chunks = result.chunks if result.chunks else []
        for chunk in safe_chunks:
            label = chunk.get("label", "Text") or "Text"
            content_html = chunk.get("content", "") or ""
            bbox = chunk.get("bbox", [0, 0, 0, 0]) or [0, 0, 0, 0]

            plain_text = _strip_html_tags(content_html)

            is_image = label.lower() in ("picture", "image", "figure")
            if plain_text.strip() or is_image:
                blocks.append(OcrBlock(
                    type=label,
                    text=plain_text if plain_text.strip() else f"[{label}]",
                    bbox=list(bbox),
                    confidence=0.95 if not result.error else 0.5,
                ))
                full_text_parts.append(plain_text if plain_text.strip() else f"[{label}]")

        safe_markdown = result.markdown.strip() if result.markdown else ""
        if not blocks and safe_markdown:
            blocks.append(OcrBlock(
                type="Text",
                text=safe_markdown,
                bbox=[0, 0, page_width, page_height],
                confidence=0.9,
            ))
            full_text_parts.append(safe_markdown)

        responses.append(OcrResponse(
            blocks=blocks,
            full_text="\n\n".join(full_text_parts),
            page_width=page_width,
            page_height=page_height,
            processing_time_ms=0,
        ))

    elapsed_ms = int((time.time() - start) * 1000)
    log.info(f"OCR Batch complete: {len(batch)} pages, {elapsed_ms}ms")

    return OcrBatchResponse(
        responses=responses,
        total_processing_time_ms=elapsed_ms
    )


# ── Run ──────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)
