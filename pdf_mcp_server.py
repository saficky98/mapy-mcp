import asyncio
import base64
from mcp.server import Server
from mcp.types import TextContent, Tool
from markdown import markdown
from weasyprint import HTML

app = Server("pdf-generator")


@app.tool()
async def generate_pdf(content: str, format: str = "markdown") -> dict:
    """
    Generuje PDF z Markdownu nebo HTML.
    
    Args:
        content: Text v Markdownu nebo HTML.
        format: "markdown" nebo "html".
    
    Returns:
        Dict s base64 PDF, názvem souboru a velikostí.
    """
    try:
        if format == "markdown":
            html_content = markdown(content)
        else:
            html_content = content

        # Vygeneruj PDF
        pdf_bytes = HTML(string=html_content).write_pdf()

        return {
            "filename": "output.pdf",
            "pdf_base64": base64.b64encode(pdf_bytes).decode("utf-8"),
            "size_bytes": len(pdf_bytes),
            "success": True
        }
    except Exception as e:
        return {
            "error": str(e),
            "success": False
        }


if __name__ == "__main__":
    asyncio.run(app.run_stdio())