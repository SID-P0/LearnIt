import asyncio
from PIL import Image, ImageDraw, ImageFont
import base64
import io

def create_test_image():
    img = Image.new('RGB', (800, 600), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    d.text((10,10), "Abstract\n\nDue to the presence of different kinds of softwares for high level image processing", fill=(0,0,0))
    buffered = io.BytesIO()
    img.save(buffered, format="JPEG")
    return buffered.getvalue()

async def run_test():
    from server import inference_manager, _strip_html_tags
    from chandra.model.schema import BatchInputItem
    from PIL import Image
    
    img_bytes = create_test_image()
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    
    batch = [BatchInputItem(image=img, prompt_type="ocr_layout")]
    print("Running chandra...")
    results = inference_manager.generate(batch)
    res = results[0]
    print(f"MARKDOWN: {res.markdown}")
    print(f"CHUNKS: {res.chunks}")
    
    for c in (res.chunks or []):
        html = c.get("content", "")
        print(f"RAW CHUNK CONTENT: {html}")
        print(f"STRIPPED CONTENT: {_strip_html_tags(html)}")

import sys
if __name__ == "__main__":
    asyncio.run(run_test())
