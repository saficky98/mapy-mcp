# MCP PDF Generator - Custom Connector pro Mistral Vibe Work

Tento MCP connector umoznuje generovat **PDF soubory primo v chatu** z Markdownu nebo HTML.

## Obsah repozitare
- pdf_mcp_server.py - MCP server v Pythonu
- Dockerfile - Konfigurace pro nasazeni
- requirements.txt - Python zavislosti

## Nasazeni

### Option 1: Fly.io (doporuceno, zdarma)

1. Nainstaluj Fly.io CLI
2. Nasad server: fly launch --name pdf-generator-mcp
3. Ziskas URL: https://pdf-generator-mcp.fly.dev

### Option 2: Lokalne + ngrok

1. Spust server: pip install -r requirements.txt && python pdf_mcp_server.py
2. Vystav na verejnou URL: ngrok http 8080
3. Ziskas URL: https://<tvoje-ngrok-url>.ngrok.io

## Pripojeni k Mistral Vibe Work

1. Jdi do Vibe Work -> Nastaveni -> Connectors -> MCP Connectors
2. Klikni Add Custom MCP Connector
3. Vypln:
   - Name: PDF Generator
   - URL: https://pdf-generator-mcp.fly.dev
   - Authentication: None
4. Ulozit

## Pouziti v chatu

V chatu napis:
Pouzij connector PDF Generator a vygeneruj PDF z tohoto textu:

# Nadpis
Toto je ukazkovy text.
- Polozka 1
- Polozka 2

## API Tool

Connector exponuje jeden tool: generate_pdf

Parametry:
- content (povinny): Text v Markdownu nebo HTML
- format (volitelny): markdown (default) nebo html

Vrati:
filename: output.pdf
pdf_base64: <base64 encoded PDF>
size_bytes: 12345
success: true

## Reseni problemu

Chyba WeasyPrint font not found: Instaluj systemove fonty
Chyba Connection refused: Zkontroluj, ze server bezi
Chyba MCP protocol error: Zkontroluj, ze pouzivas stdio mod

## Priklady

Markdown to PDF:
# Zprava
Toto je dulezita zprava.
- Polozka 1
- Polozka 2

HTML to PDF:
<h1>Nadpis</h1>
<p>Odstavec s tucnym textem.</p>